from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import logging
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Set, List

import bcrypt
import jwt
import httpx
import resend
from fastapi import (
    FastAPI,
    APIRouter,
    HTTPException,
    Depends,
    Request,
    Response,
    WebSocket,
    WebSocketDisconnect,
    Query,
)
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field, ConfigDict

# ---------------- Setup ----------------

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 60 * 24 * 7  # 7 days for simplicity

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
APP_BASE_URL = os.environ.get("APP_BASE_URL", "")
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

async def _send_mail(to: str, subject: str, html: str) -> bool:
    if not RESEND_API_KEY:
        return False
    try:
        await asyncio.to_thread(resend.Emails.send, {
            "from": f"StreamStar <{SENDER_EMAIL}>",
            "to": [to],
            "subject": subject,
            "html": html,
        })
        return True
    except Exception as e:
        logging.getLogger("streamstar").warning(f"resend failed: {e}")
        return False

def _email_template(title: str, body_html: str, cta_url: str = "", cta_label: str = "") -> str:
    cta = f'<a href="{cta_url}" style="display:inline-block;background:#A855F7;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600">{cta_label}</a>' if cta_url else ""
    return f"""<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0A0A0A;color:#fff;padding:40px 20px">
<div style="max-width:520px;margin:auto;background:#111;border:1px solid #222;border-radius:14px;padding:36px">
<div style="font-size:22px;font-weight:700;background:linear-gradient(90deg,#A855F7,#EC4899,#22D3EE);-webkit-background-clip:text;background-clip:text;color:transparent">★ StreamStar</div>
<h1 style="margin:16px 0 12px;font-size:24px">{title}</h1>
<div style="color:#bbb;line-height:1.6;font-size:15px">{body_html}</div>
<div style="margin:28px 0">{cta}</div>
<div style="color:#666;font-size:12px;margin-top:24px">If you didn't request this, you can ignore this email.</div>
</div></div>"""

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="StreamStar API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("streamstar")

# ---------------- Models ----------------

class UserOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    name: str
    role: str = "viewer"  # viewer | host | super_admin
    can_host: bool = False
    picture: Optional[str] = None
    auth_provider: str = "email"  # email | google
    email_verified: bool = True
    login_count: int = 0
    last_login: Optional[str] = None
    created_at: Optional[str] = None

class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1, max_length=64)

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class RoomCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    is_public: bool = True

class RoomOut(BaseModel):
    room_id: str
    name: str
    host_id: Optional[str] = None
    host_name: Optional[str] = None
    is_public: bool
    created_by: str
    created_at: str
    participant_count: int = 0
    code: Optional[str] = None

class GrantHostIn(BaseModel):
    user_id: str
    can_host: bool

class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)

class ResetPasswordIn(BaseModel):
    new_password: str = Field(min_length=6)

class UpdateProfileIn(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=64)
    email: Optional[EmailStr] = None

class NotificationOut(BaseModel):
    id: str
    type: str
    message: str
    user_id: Optional[str] = None
    recipient_id: Optional[str] = None
    meta: Optional[dict] = None
    created_at: str
    read: bool = False

class EventOut(BaseModel):
    id: str
    event_type: str
    actor_id: Optional[str] = None
    actor_name: Optional[str] = None
    actor_email: Optional[str] = None
    room_id: Optional[str] = None
    room_name: Optional[str] = None
    meta: Optional[dict] = None
    created_at: str

class JoinResponseIn(BaseModel):
    room_id: str
    target_user_id: str
    approved: bool

# ---------------- Helpers ----------------

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def create_access_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def user_to_out(user: dict) -> UserOut:
    return UserOut(
        user_id=user["user_id"],
        email=user["email"],
        name=user.get("name", ""),
        role=user.get("role", "viewer"),
        can_host=bool(user.get("can_host", False)) or user.get("role") == "super_admin",
        picture=user.get("picture"),
        auth_provider=user.get("auth_provider", "email"),
        email_verified=bool(user.get("email_verified", True)),
        login_count=int(user.get("login_count", 0)),
        last_login=user.get("last_login"),
        created_at=user.get("created_at"),
    )

async def _find_user_by_token(token: str) -> Optional[dict]:
    # Try JWT first
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") == "access":
            user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
            if user:
                return user
    except jwt.PyJWTError:
        pass
    # Fall back to Emergent session_token
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        return None
    exp = session.get("expires_at")
    if isinstance(exp, str):
        exp = datetime.fromisoformat(exp)
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp and exp < datetime.now(timezone.utc):
        return None
    return await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("session_token") or request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = await _find_user_by_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return user

async def require_super_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")
    return user

def _set_cookie(response: Response, name: str, value: str, days: int):
    response.set_cookie(
        key=name,
        value=value,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=days * 24 * 60 * 60,
        path="/",
    )

# ---------------- Startup ----------------

@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.rooms.create_index("room_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.host_requests.create_index("user_id")
    await db.notifications.create_index("created_at")
    await db.notifications.create_index("recipient_id")
    await db.room_visits.create_index([("user_id", 1), ("room_id", 1)], unique=True)
    # Events collection with 7-day TTL. `created_at` must be a BSON date for TTL to work.
    try:
        await db.events.create_index("created_at", expireAfterSeconds=7 * 24 * 3600)
    except Exception:
        pass
    await db.events.create_index("event_type")
    # Idempotent rename: legacy "AdminRoom" -> "SuperAdmin Room"
    try:
        await db.rooms.update_many({"name": "AdminRoom"}, {"$set": {"name": "SuperAdmin Room"}})
    except Exception:
        pass

    admin_email = os.environ.get("ADMIN_EMAIL", "").lower().strip()
    admin_password = os.environ.get("ADMIN_PASSWORD", "")
    admin_name = os.environ.get("ADMIN_NAME", "Super Admin")
    if admin_email and admin_password:
        existing = await db.users.find_one({"email": admin_email})
        if existing is None:
            await db.users.insert_one({
                "user_id": f"user_{uuid.uuid4().hex[:12]}",
                "email": admin_email,
                "name": admin_name,
                "password_hash": hash_password(admin_password),
                "role": "super_admin",
                "can_host": True,
                "auth_provider": "email",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            logger.info(f"Seeded super admin: {admin_email}")
        else:
            update = {"role": "super_admin", "can_host": True}
            if not existing.get("password_hash") or not verify_password(admin_password, existing["password_hash"]):
                update["password_hash"] = hash_password(admin_password)
            await db.users.update_one({"email": admin_email}, {"$set": update})

@app.on_event("shutdown")
async def on_shutdown():
    client.close()

# ---------------- Auth endpoints ----------------

@api.post("/auth/register", response_model=UserOut)
async def register(body: RegisterIn, response: Response):
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    verify_token = uuid.uuid4().hex
    email_verified = not bool(RESEND_API_KEY)  # skip verification if no email provider
    doc = {
        "user_id": user_id,
        "email": email,
        "name": body.name,
        "password_hash": hash_password(body.password),
        "role": "viewer",
        "can_host": False,
        "auth_provider": "email",
        "email_verified": email_verified,
        "verify_token": verify_token,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    # Send verification email
    if RESEND_API_KEY and APP_BASE_URL:
        link = f"{APP_BASE_URL}/verify?token={verify_token}"
        html = _email_template(
            "Confirm your email",
            f"Welcome to StreamStar, {body.name}! Please confirm your email to start creating watch parties and recording sessions in HD.",
            link, "Verify my email",
        )
        asyncio.create_task(_send_mail(email, "Confirm your StreamStar email", html))
    if not email_verified:
        # Don't auto-login until verified
        return user_to_out(doc)
    token = create_access_token(user_id)
    _set_cookie(response, "access_token", token, days=7)
    return user_to_out(doc)

@api.post("/auth/login", response_model=UserOut)
async def login(body: LoginIn, response: Response):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if RESEND_API_KEY and not user.get("email_verified", True):
        raise HTTPException(status_code=403, detail="Please verify your email. We sent a confirmation link — check your inbox (and spam folder).")
    # Track login
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"last_login": now_iso}, "$inc": {"login_count": 1}},
    )
    user["last_login"] = now_iso
    user["login_count"] = user.get("login_count", 0) + 1
    token = create_access_token(user["user_id"])
    _set_cookie(response, "access_token", token, days=7)
    return user_to_out(user)

@api.post("/auth/logout")
async def logout(response: Response, request: Request):
    # Try clear both cookie kinds
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("session_token", path="/")
    return {"ok": True}

class ResendVerifyIn(BaseModel):
    email: EmailStr

@api.post("/auth/resend-verification")
async def resend_verification(body: ResendVerifyIn):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    # Always return ok to avoid enumeration
    if user and not user.get("email_verified", True) and RESEND_API_KEY and APP_BASE_URL:
        token = user.get("verify_token") or uuid.uuid4().hex
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"verify_token": token}})
        link = f"{APP_BASE_URL}/verify?token={token}"
        html = _email_template(
            "Confirm your email",
            f"Hi {user.get('name','there')}, please confirm your email to unlock StreamStar rooms and HD recording.",
            link, "Verify my email",
        )
        asyncio.create_task(_send_mail(email, "Confirm your StreamStar email", html))
    return {"ok": True}

@api.get("/auth/verify")
async def verify_email(token: str):
    user = await db.users.find_one({"verify_token": token}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired verification link")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"email_verified": True}, "$unset": {"verify_token": ""}})
    return {"ok": True, "email": user["email"]}

class ForgotIn(BaseModel):
    email: EmailStr

@api.post("/auth/forgot-password")
async def forgot_password(body: ForgotIn):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    # Always return OK to avoid email enumeration
    if user and RESEND_API_KEY and APP_BASE_URL:
        token = uuid.uuid4().hex
        expires = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"reset_token": token, "reset_expires": expires}})
        link = f"{APP_BASE_URL}/reset-password?token={token}"
        html = _email_template(
            "Reset your password",
            f"Hi {user.get('name','there')}, tap the button below to choose a new password. Link expires in 1 hour.",
            link, "Reset password",
        )
        asyncio.create_task(_send_mail(email, "Reset your StreamStar password", html))
    return {"ok": True}

class ResetIn(BaseModel):
    token: str
    new_password: str = Field(min_length=6)

@api.post("/auth/reset-password")
async def reset_password_via_token(body: ResetIn):
    user = await db.users.find_one({"reset_token": body.token}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired link")
    exp = user.get("reset_expires")
    if exp and datetime.fromisoformat(exp) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Link has expired")
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"password_hash": hash_password(body.new_password)}, "$unset": {"reset_token": "", "reset_expires": ""}},
    )
    return {"ok": True}

@api.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return user_to_out(user)

@api.get("/auth/ws-token")
async def ws_token(user: dict = Depends(get_current_user)):
    # Short-lived token the browser can put in the WebSocket URL (browsers can't send httpOnly cookies via ?token)
    payload = {
        "sub": user["user_id"],
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=30),
    }
    return {"token": jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)}

# Emergent Google OAuth: exchange session_id for user
class SessionExchangeIn(BaseModel):
    session_id: str

@api.post("/auth/session", response_model=UserOut)
async def exchange_session(body: SessionExchangeIn, response: Response):
    async with httpx.AsyncClient(timeout=15) as http:
        r = await http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": body.session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Emergent session")
    data = r.json()
    email = data["email"].lower().strip()
    session_token = data["session_token"]

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"email": email},
            {"$set": {"name": data.get("name") or existing.get("name"), "picture": data.get("picture"), "auth_provider": existing.get("auth_provider", "google")}},
        )
        user = await db.users.find_one({"email": email}, {"_id": 0})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        # Auto-promote seeded super admin email when they first Google-login
        admin_email = os.environ.get("ADMIN_EMAIL", "").lower().strip()
        role = "super_admin" if email == admin_email else "viewer"
        can_host = role == "super_admin"
        user = {
            "user_id": user_id,
            "email": email,
            "name": data.get("name") or email.split("@")[0],
            "picture": data.get("picture"),
            "role": role,
            "can_host": can_host,
            "auth_provider": "google",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(user)

    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {"$set": {"session_token": session_token, "user_id": user["user_id"], "expires_at": expires_at.isoformat()}},
        upsert=True,
    )
    _set_cookie(response, "session_token", session_token, days=7)
    return user_to_out(user)

# ---------------- Users / Admin endpoints ----------------

@api.get("/users", response_model=List[UserOut])
async def list_users(_: dict = Depends(require_super_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    return [user_to_out(u) for u in users]

@api.post("/users/grant-host", response_model=UserOut)
async def grant_host(body: GrantHostIn, admin: dict = Depends(require_super_admin)):
    user = await db.users.find_one({"user_id": body.user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("role") == "super_admin":
        raise HTTPException(status_code=400, detail="Cannot modify super admin")
    new_role = "host" if body.can_host else "viewer"
    await db.users.update_one(
        {"user_id": body.user_id},
        {"$set": {"can_host": body.can_host, "role": new_role}},
    )
    # Also resolve any pending host request
    if body.can_host:
        await db.host_requests.update_one(
            {"user_id": body.user_id, "status": "pending"},
            {"$set": {"status": "approved", "resolved_at": datetime.now(timezone.utc).isoformat()}},
        )
        await _add_notification(
            "Hosting request granted — you can now create your own watch rooms.",
            "host_granted",
            user_id=body.user_id,
            recipient_id=body.user_id,
        )
        await _log_event("host_granted", actor=admin, meta={"target_user_id": body.user_id, "method": "manual"})
    else:
        await _add_notification(
            "Your host access has been revoked by the super admin.",
            "host_revoked",
            user_id=body.user_id,
            recipient_id=body.user_id,
        )
        await _log_event("host_revoked", actor=admin, meta={"target_user_id": body.user_id})
    user = await db.users.find_one({"user_id": body.user_id}, {"_id": 0})
    return user_to_out(user)

@api.post("/users/{user_id}/reset-password", response_model=UserOut)
async def reset_password(user_id: str, body: ResetPasswordIn, _: dict = Depends(require_super_admin)):
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.update_one({"user_id": user_id}, {"$set": {"password_hash": hash_password(body.new_password)}})
    return user_to_out(user)

@api.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(require_super_admin)):
    if user_id == admin["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") == "super_admin":
        raise HTTPException(status_code=400, detail="Cannot delete another super admin")
    await db.users.delete_one({"user_id": user_id})
    return {"ok": True}

@api.patch("/users/me", response_model=UserOut)
async def update_me(body: UpdateProfileIn, user: dict = Depends(get_current_user)):
    updates: Dict[str, str] = {}
    if body.name is not None:
        updates["name"] = body.name
    if body.email is not None:
        new_email = body.email.lower().strip()
        if new_email != user["email"]:
            if await db.users.find_one({"email": new_email}):
                raise HTTPException(status_code=400, detail="Email already in use")
            updates["email"] = new_email
    if updates:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
        user = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return user_to_out(user)

@api.post("/users/me/change-password", response_model=UserOut)
async def change_my_password(body: ChangePasswordIn, user: dict = Depends(get_current_user)):
    if not user.get("password_hash") or not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    return user_to_out(user)

# ---------------- Host Requests + Notifications ----------------

async def _add_notification(msg: str, ntype: str, user_id: Optional[str] = None, recipient_id: Optional[str] = None, meta: Optional[dict] = None):
    doc = {
        "id": uuid.uuid4().hex[:12],
        "type": ntype,
        "message": msg,
        "user_id": user_id,
        "recipient_id": recipient_id,
        "meta": meta or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "read": False,
    }
    await db.notifications.insert_one(doc)
    return doc

async def _log_event(event_type: str, actor: Optional[dict] = None, room: Optional[dict] = None, meta: Optional[dict] = None):
    """Append an event to the 7-day activity log. `created_at` must be a native datetime for TTL."""
    try:
        doc = {
            "id": uuid.uuid4().hex[:12],
            "event_type": event_type,
            "actor_id": (actor or {}).get("user_id"),
            "actor_name": (actor or {}).get("name"),
            "actor_email": (actor or {}).get("email"),
            "room_id": (room or {}).get("room_id"),
            "room_name": (room or {}).get("name"),
            "meta": meta or {},
            "created_at": datetime.now(timezone.utc),
        }
        await db.events.insert_one(doc)
    except Exception as e:
        logger.warning(f"log_event failed: {e}")

async def _auto_approve_host(user_id: str, delay_seconds: int = 60):
    await asyncio.sleep(delay_seconds)
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user or user.get("role") == "super_admin":
        return
    if user.get("can_host"):
        return  # already promoted manually
    await db.users.update_one({"user_id": user_id}, {"$set": {"can_host": True, "role": "host"}})
    await db.host_requests.update_one({"user_id": user_id, "status": "pending"}, {"$set": {"status": "auto_approved", "resolved_at": datetime.now(timezone.utc).isoformat()}})
    await _add_notification(f"{user.get('name')} ({user.get('email')}) was auto-approved as host.", "host_auto_approved", user_id)
    # Notify the user directly
    await _add_notification(
        "Hosting request granted — you can now create your own watch rooms.",
        "host_granted",
        user_id=user_id,
        recipient_id=user_id,
    )
    await _log_event("host_granted", actor={"user_id": user_id, "name": user.get("name"), "email": user.get("email")}, meta={"method": "auto_60s"})

@api.post("/host-requests")
async def request_host(user: dict = Depends(get_current_user)):
    if user.get("role") == "super_admin" or user.get("can_host"):
        return {"status": "already_host"}
    existing = await db.host_requests.find_one({"user_id": user["user_id"], "status": "pending"}, {"_id": 0})
    if existing:
        return {"status": "pending", "created_at": existing["created_at"], "auto_approve_at": existing.get("auto_approve_at")}
    now = datetime.now(timezone.utc)
    auto_at = (now + timedelta(seconds=60)).isoformat()
    doc = {
        "id": uuid.uuid4().hex[:12],
        "user_id": user["user_id"],
        "user_email": user["email"],
        "user_name": user.get("name"),
        "status": "pending",
        "created_at": now.isoformat(),
        "auto_approve_at": auto_at,
    }
    await db.host_requests.insert_one(doc)
    await _add_notification(f"{user.get('name')} ({user['email']}) requested host access.", "host_request", user["user_id"])
    asyncio.create_task(_auto_approve_host(user["user_id"], 60))
    return {"status": "pending", "created_at": doc["created_at"], "auto_approve_at": auto_at}

@api.get("/host-requests")
async def list_host_requests(_: dict = Depends(require_super_admin)):
    items = await db.host_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items

@api.get("/notifications", response_model=List[NotificationOut])
async def list_notifications(_: dict = Depends(require_super_admin)):
    items = await db.notifications.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return items

@api.post("/notifications/mark-read")
async def mark_all_read(_: dict = Depends(require_super_admin)):
    await db.notifications.update_many({"read": False}, {"$set": {"read": True}})
    return {"ok": True}

@api.get("/notifications/me", response_model=List[NotificationOut])
async def list_my_notifications(user: dict = Depends(get_current_user)):
    """Notifications targeted at the current user. Super admin additionally sees system broadcasts."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    if user.get("role") == "super_admin":
        query = {
            "$or": [
                {"recipient_id": user["user_id"]},
                {"recipient_id": None},
            ],
            "created_at": {"$gte": cutoff},
        }
    else:
        query = {"recipient_id": user["user_id"], "created_at": {"$gte": cutoff}}
    items = await db.notifications.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return items

@api.post("/notifications/{notif_id}/read")
async def mark_one_read(notif_id: str, user: dict = Depends(get_current_user)):
    q = {"id": notif_id}
    if user.get("role") != "super_admin":
        q["recipient_id"] = user["user_id"]
    res = await db.notifications.update_one(q, {"$set": {"read": True}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"ok": True}

@api.post("/notifications/me/read-all")
async def mark_my_all_read(user: dict = Depends(get_current_user)):
    if user.get("role") == "super_admin":
        query = {"$or": [{"recipient_id": user["user_id"]}, {"recipient_id": None}], "read": False}
    else:
        query = {"recipient_id": user["user_id"], "read": False}
    await db.notifications.update_many(query, {"$set": {"read": True}})
    return {"ok": True}

@api.get("/events", response_model=List[EventOut])
async def list_events(_: dict = Depends(require_super_admin), event_type: Optional[str] = None, limit: int = 200):
    q: Dict[str, str] = {}
    if event_type:
        q["event_type"] = event_type
    items = await db.events.find(q, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 500))
    # datetime -> iso string for JSON
    for it in items:
        ca = it.get("created_at")
        if isinstance(ca, datetime):
            it["created_at"] = ca.isoformat()
    return items

# ---------------- Rooms ----------------

@api.post("/rooms", response_model=RoomOut)
async def create_room(body: RoomCreateIn, user: dict = Depends(get_current_user)):
    if not (user.get("can_host") or user.get("role") in ("host", "super_admin")):
        raise HTTPException(status_code=403, detail="You do not have permission to host. Ask the super admin to grant host access.")
    room_id = uuid.uuid4().hex[:10]
    doc = {
        "room_id": room_id,
        "name": body.name,
        "is_public": bool(body.is_public),
        "created_by": user["user_id"],
        "host_id": user["user_id"],
        "host_name": user.get("name"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.rooms.insert_one(doc)
    await _log_event("room_created", actor=user, room=doc, meta={"is_public": doc["is_public"]})
    return RoomOut(**doc, participant_count=0, code=room_id)

async def _visible_room_ids_for(user: dict) -> Set[str]:
    """Rooms whose join code a user is allowed to see (excluding rooms they host — those always visible)."""
    if user.get("role") == "super_admin":
        return set()  # super admin sees all — caller handles this
    vs = await db.room_visits.find({"user_id": user["user_id"]}, {"_id": 0, "room_id": 1}).to_list(500)
    return {v["room_id"] for v in vs}

def _can_see_code(user: dict, room: dict, visits: Set[str]) -> bool:
    if user.get("role") == "super_admin":
        return True
    if room.get("host_id") == user["user_id"]:
        return True
    return room["room_id"] in visits

@api.get("/rooms", response_model=List[RoomOut])
async def list_public_rooms(user: dict = Depends(get_current_user)):
    rooms = await db.rooms.find({"is_public": True}, {"_id": 0}).sort("created_at", -1).to_list(200)
    visits = await _visible_room_ids_for(user) if user.get("role") != "super_admin" else set()
    out = []
    for r in rooms:
        code = r["room_id"] if _can_see_code(user, r, visits) else None
        out.append(RoomOut(**r, participant_count=len(ROOMS.get(r["room_id"], {})), code=code))
    return out

@api.get("/rooms/{room_id}", response_model=RoomOut)
async def get_room(room_id: str, user: dict = Depends(get_current_user)):
    r = await db.rooms.find_one({"room_id": room_id}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Room not found")
    visits = await _visible_room_ids_for(user) if user.get("role") != "super_admin" else set()
    code = room_id if _can_see_code(user, r, visits) else None
    return RoomOut(**r, participant_count=len(ROOMS.get(room_id, {})), code=code)

# ---------------- WebSocket signaling + chat ----------------

# room_id -> { user_id: {"ws": WebSocket, "name": str, "is_host": bool} }
ROOMS: Dict[str, Dict[str, dict]] = {}
# room_id -> { user_id: {"ws": WebSocket, "name": str, "email": str, "admitted_event": asyncio.Event, "admitted": bool} }
PENDING: Dict[str, Dict[str, dict]] = {}
# room_id -> {"muted": Set[user_id]}
ROOM_STATE: Dict[str, dict] = {}
# room_id -> datetime when host most recently started streaming (for duration tracking)
STREAM_STARTS: Dict[str, datetime] = {}

def _muted(room_id: str) -> Set[str]:
    st = ROOM_STATE.setdefault(room_id, {"muted": set()})
    return st["muted"]

async def _broadcast(room_id: str, message: dict, exclude: Optional[str] = None):
    participants = ROOMS.get(room_id, {})
    dead = []
    for uid, p in list(participants.items()):
        if uid == exclude:
            continue
        try:
            await p["ws"].send_json(message)
        except Exception:
            dead.append(uid)
    for uid in dead:
        participants.pop(uid, None)

async def _send_to(room_id: str, user_id: str, message: dict):
    p = ROOMS.get(room_id, {}).get(user_id)
    if p:
        try:
            await p["ws"].send_json(message)
        except Exception:
            pass

def _participants_snapshot(room_id: str) -> List[dict]:
    return [
        {"user_id": uid, "name": p["name"], "is_host": p["is_host"]}
        for uid, p in ROOMS.get(room_id, {}).items()
    ]

def _pending_snapshot(room_id: str) -> List[dict]:
    return [
        {"user_id": uid, "name": p["name"], "email": p.get("email")}
        for uid, p in PENDING.get(room_id, {}).items()
    ]

async def _upsert_room_visit(user_id: str, room_id: str):
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.room_visits.update_one(
        {"user_id": user_id, "room_id": room_id},
        {
            "$set": {"last_joined_at": now_iso},
            "$setOnInsert": {"first_joined_at": now_iso, "user_id": user_id, "room_id": room_id},
        },
        upsert=True,
    )

async def _cancel_pending_notification(recipient_id: Optional[str], target_user_id: str, room_id: str):
    """When a knock is resolved, mark the corresponding 'join_knock' notification as read."""
    if not recipient_id:
        return
    try:
        await db.notifications.update_many(
            {
                "type": "join_knock",
                "recipient_id": recipient_id,
                "meta.room_id": room_id,
                "meta.user_id": target_user_id,
                "read": False,
            },
            {"$set": {"read": True}},
        )
    except Exception:
        pass

@app.websocket("/api/ws/room/{room_id}")
async def ws_room(websocket: WebSocket, room_id: str, token: str = Query(...)):
    user = await _find_user_by_token(token)
    if not user:
        await websocket.close(code=4401)
        return
    room = await db.rooms.find_one({"room_id": room_id}, {"_id": 0})
    if not room:
        await websocket.close(code=4404)
        return

    await websocket.accept()
    user_id = user["user_id"]
    is_host = (room.get("host_id") == user_id) and (user.get("can_host") or user.get("role") in ("host", "super_admin"))
    is_admin = user.get("role") == "super_admin"

    already_visited = await db.room_visits.find_one({"user_id": user_id, "room_id": room_id})
    can_auto_admit = is_host or is_admin or already_visited is not None

    # ---------- Knock flow for first-time non-host, non-admin visitors ----------
    if not can_auto_admit:
        entry = {
            "ws": websocket,
            "name": user.get("name") or "Guest",
            "email": user.get("email"),
            "admitted_event": asyncio.Event(),
            "admitted": False,
        }
        PENDING.setdefault(room_id, {})[user_id] = entry
        await websocket.send_json({
            "type": "pending_admission",
            "room_name": room.get("name"),
            "host_name": room.get("host_name"),
        })
        host_uid = room.get("host_id")
        # Live-notify any host present in the room
        if host_uid and host_uid in ROOMS.get(room_id, {}):
            await _send_to(room_id, host_uid, {
                "type": "join_request",
                "user": {"user_id": user_id, "name": entry["name"], "email": entry["email"]},
                "pending": _pending_snapshot(room_id),
            })
        # Persistent notification for the host (so they see it even if offline)
        if host_uid:
            await _add_notification(
                f"{entry['name']} is knocking to join '{room.get('name')}'",
                "join_knock",
                user_id=user_id,
                recipient_id=host_uid,
                meta={"room_id": room_id, "user_id": user_id, "user_name": entry["name"]},
            )
        await _log_event("join_knock", actor=user, room=room)

        # Wait for admission or client disconnect / cancel
        async def _wait_admission() -> Optional[bool]:
            recv_task: Optional[asyncio.Task] = None
            admit_task = asyncio.create_task(entry["admitted_event"].wait())
            try:
                while True:
                    recv_task = asyncio.create_task(websocket.receive_json())
                    done, _ = await asyncio.wait({recv_task, admit_task}, return_when=asyncio.FIRST_COMPLETED)
                    if admit_task in done:
                        recv_task.cancel()
                        return entry["admitted"]
                    # Recv completed
                    try:
                        msg = recv_task.result()
                    except Exception:
                        return None
                    if isinstance(msg, dict) and msg.get("type") == "cancel_knock":
                        return None
            finally:
                if recv_task and not recv_task.done():
                    recv_task.cancel()
                if not admit_task.done():
                    admit_task.cancel()

        try:
            result = await _wait_admission()
        except WebSocketDisconnect:
            result = None
        PENDING.get(room_id, {}).pop(user_id, None)
        await _cancel_pending_notification(room.get("host_id"), user_id, room_id)
        if result is not True:
            try:
                if result is False:
                    await websocket.send_json({"type": "admission_denied"})
                await websocket.close(code=4403)
            except Exception:
                pass
            return
        try:
            await websocket.send_json({"type": "admission_granted"})
        except Exception:
            return
        # Fall through to admitted flow
        await _upsert_room_visit(user_id, room_id)
    else:
        # Auto-admit path — still record the visit
        await _upsert_room_visit(user_id, room_id)

    if room_id not in ROOMS:
        ROOMS[room_id] = {}

    # If user reconnects, close old socket
    if user_id in ROOMS[room_id]:
        try:
            await ROOMS[room_id][user_id]["ws"].close()
        except Exception:
            pass

    ROOMS[room_id][user_id] = {"ws": websocket, "name": user.get("name") or "Guest", "is_host": is_host}
    await _log_event("participant_joined", actor=user, room=room)

    # Tell the client its context
    await websocket.send_json({
        "type": "welcome",
        "user_id": user_id,
        "name": user.get("name"),
        "is_host": is_host,
        "host_id": room.get("host_id"),
        "participants": _participants_snapshot(room_id),
        "muted": list(_muted(room_id)),
        "pending": _pending_snapshot(room_id) if is_host else [],
    })
    # Notify others of the new participant
    await _broadcast(room_id, {
        "type": "participant_joined",
        "user": {"user_id": user_id, "name": user.get("name"), "is_host": is_host},
        "participants": _participants_snapshot(room_id),
    }, exclude=user_id)

    try:
        while True:
            msg = await websocket.receive_json()
            mtype = msg.get("type")
            if mtype == "chat":
                text = (msg.get("text") or "").strip()
                if not text:
                    continue
                if user_id in _muted(room_id):
                    await websocket.send_json({"type": "chat_blocked", "reason": "You are muted by the host."})
                    continue
                payload = {
                    "type": "chat",
                    "from": user_id,
                    "name": user.get("name"),
                    "text": text[:1000],
                    "ts": datetime.now(timezone.utc).isoformat(),
                }
                # Send to everyone including sender for consistent state
                await _broadcast(room_id, payload)
            elif mtype == "reaction":
                emoji = (msg.get("emoji") or "")[:8]
                if not emoji:
                    continue
                await _broadcast(room_id, {
                    "type": "reaction",
                    "from": user_id,
                    "name": user.get("name"),
                    "emoji": emoji,
                    "ts": datetime.now(timezone.utc).isoformat(),
                })
            elif mtype == "host_mute":
                if not is_host:
                    continue
                target = msg.get("target")
                mute = bool(msg.get("mute", True))
                if not target or target == user_id:
                    continue
                muted = _muted(room_id)
                if mute:
                    muted.add(target)
                else:
                    muted.discard(target)
                await _broadcast(room_id, {
                    "type": "mute_changed",
                    "target": target,
                    "muted": mute,
                })
            elif mtype == "host_kick":
                if not is_host:
                    continue
                target = msg.get("target")
                if not target or target == user_id:
                    continue
                await _send_to(room_id, target, {"type": "kicked", "by": user_id})
                p = ROOMS.get(room_id, {}).pop(target, None)
                if p:
                    try:
                        await p["ws"].close(code=4403)
                    except Exception:
                        pass
                await _broadcast(room_id, {
                    "type": "participant_left",
                    "user_id": target,
                    "participants": _participants_snapshot(room_id),
                })
            elif mtype == "join_response":
                # Host or super_admin responds to a pending knock
                if not (is_host or is_admin):
                    continue
                target = msg.get("target")
                approved = bool(msg.get("approved"))
                pending_entry = PENDING.get(room_id, {}).get(target)
                if not pending_entry:
                    continue
                pending_entry["admitted"] = approved
                pending_entry["admitted_event"].set()
                # Notify the pending user
                target_name = pending_entry.get("name") or "Guest"
                if approved:
                    await _add_notification(
                        f"You were admitted to '{room.get('name')}'.",
                        "join_approved",
                        user_id=target,
                        recipient_id=target,
                        meta={"room_id": room_id, "room_name": room.get("name")},
                    )
                    await _log_event("guest_admitted", actor=user, room=room, meta={"target_user_id": target, "target_name": target_name})
                else:
                    await _add_notification(
                        f"Your request to join '{room.get('name')}' was declined.",
                        "join_denied",
                        user_id=target,
                        recipient_id=target,
                        meta={"room_id": room_id, "room_name": room.get("name")},
                    )
                    await _log_event("guest_denied", actor=user, room=room, meta={"target_user_id": target, "target_name": target_name})
                # Broadcast updated pending list to host(s)
                for uid, p in ROOMS.get(room_id, {}).items():
                    if p.get("is_host"):
                        try:
                            await p["ws"].send_json({"type": "pending_update", "pending": _pending_snapshot(room_id)})
                        except Exception:
                            pass
            elif mtype in ("webrtc_offer", "webrtc_answer", "webrtc_ice"):
                to = msg.get("to")
                if not to:
                    continue
                await _send_to(room_id, to, {
                    "type": mtype,
                    "from": user_id,
                    "data": msg.get("data"),
                })
            elif mtype == "host_streaming":
                streaming = bool(msg.get("streaming"))
                # Only the actual host can toggle streaming state
                if is_host:
                    if streaming:
                        STREAM_STARTS[room_id] = datetime.now(timezone.utc)
                        await _log_event("stream_started", actor=user, room=room)
                    else:
                        start = STREAM_STARTS.pop(room_id, None)
                        if start:
                            duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
                            await _log_event("stream_ended", actor=user, room=room, meta={"duration_ms": duration_ms})
                await _broadcast(room_id, {
                    "type": "host_streaming",
                    "streaming": streaming,
                    "host_id": user_id,
                }, exclude=user_id)
            elif mtype == "request_stream":
                # Viewer asks the host to initiate a peer connection
                if room.get("host_id"):
                    await _send_to(room_id, room["host_id"], {
                        "type": "request_stream",
                        "from": user_id,
                    })
            elif mtype == "record_request":
                # Viewer asks the host for permission to record
                if room.get("host_id"):
                    await _send_to(room_id, room["host_id"], {
                        "type": "record_request",
                        "from": user_id,
                        "name": user.get("name"),
                    })
            elif mtype == "record_response":
                # Host approves/denies a viewer's record request
                if not is_host:
                    continue
                target = msg.get("to")
                if not target:
                    continue
                await _send_to(room_id, target, {
                    "type": "record_response",
                    "approved": bool(msg.get("approved")),
                })
            elif mtype == "yt_state":
                # Host broadcasts YouTube playback state (id, playing, currentTime)
                if not is_host:
                    continue
                await _broadcast(room_id, {"type": "yt_state", "state": msg.get("state")}, exclude=user_id)
            else:
                # Unknown -> ignore
                pass
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.info(f"ws error: {e}")
    finally:
        # If host disconnects while streaming, close out the stream session
        if is_host and room_id in STREAM_STARTS:
            start = STREAM_STARTS.pop(room_id, None)
            if start:
                duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
                await _log_event("stream_ended", actor=user, room=room, meta={"duration_ms": duration_ms, "reason": "host_disconnect"})
        ROOMS.get(room_id, {}).pop(user_id, None)
        await _log_event("participant_left", actor=user, room=room)
        await _broadcast(room_id, {
            "type": "participant_left",
            "user_id": user_id,
            "participants": _participants_snapshot(room_id),
        })

# ---------------- Health ----------------

@api.get("/")
async def root():
    return {"service": "StreamStar", "ok": True}

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_origin_regex=".*",
    allow_methods=["*"],
    allow_headers=["*"],
)
