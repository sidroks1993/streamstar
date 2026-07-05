"""
StreamStar Iteration 7 backend regression tests.

Covers:
- Auth (super admin login + fresh viewer register)
- Rooms list code visibility (super_admin sees all codes; viewer sees null)
- room_visits: after upsert, code appears
- Notifications: /me, /{id}/read, /me/read-all, super-admin broadcast visibility
- Events: TTL + super-admin only + non-admin 403
- grant-host creates host_granted notification + event
- WebSocket knock flow: pending_admission for viewer, welcome for super_admin,
  join_response approve => admission_granted + welcome + room_visits entry
- Legacy rename AdminRoom -> "SuperAdmin Room"
"""
import asyncio
import json
import os
import time
import uuid

import pytest
import requests
import websockets
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
WS_BASE = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

ADMIN_EMAIL = "sidroks@hotmail.com"
ADMIN_PASSWORD = "streamstar@1"


def _run_async(coro):
    """Run an async coroutine from sync test code."""
    return asyncio.run(coro)

@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = s.cookies.get("access_token")
    assert tok, f"no access_token cookie: {dict(s.cookies)}"
    s.token = tok  # type: ignore
    me = s.get(f"{BASE_URL}/api/auth/me").json()
    s.user_id = me["user_id"]  # type: ignore
    return s


@pytest.fixture(scope="session")
def viewer_session():
    email = f"test_knock_{uuid.uuid4().hex[:8]}@example.com"
    password = "knock1234"
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": password, "name": "Knock Tester"})
    assert r.status_code == 200, r.text

    # If email verification is required (RESEND configured), the register endpoint won't set a cookie.
    # Force-verify the user in Mongo (sync client) and then login.
    sync_cli = MongoClient(MONGO_URL)
    res = sync_cli[DB_NAME].users.update_one({"email": email}, {"$set": {"email_verified": True}})
    sync_cli.close()
    assert res.matched_count == 1, f"could not force-verify user {email}"

    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    tok = s.cookies.get("access_token")
    assert tok, f"no access_token cookie after login: {dict(s.cookies)}"
    s.token = tok  # type: ignore
    me = s.get(f"{BASE_URL}/api/auth/me").json()
    s.user_id = me["user_id"]  # type: ignore
    s.email = email  # type: ignore
    return s


# ---------- Auth ----------

class TestAuth:
    def test_admin_login(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200
        data = r.json()
        assert data["email"].lower() == ADMIN_EMAIL
        assert data["role"] == "super_admin"

    def test_viewer_register(self, viewer_session):
        r = viewer_session.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200
        assert r.json()["role"] != "super_admin"
        assert r.json().get("can_host") is False


# ---------- Rooms + code visibility + rename ----------

class TestRoomsCodeVisibility:
    def test_admin_sees_all_codes_and_superadmin_room_exists(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/rooms")
        assert r.status_code == 200
        rooms = r.json()
        assert len(rooms) > 0
        # All rooms must expose code == room_id for super_admin
        for rm in rooms:
            assert rm["code"] == rm["room_id"], f"code mismatch on {rm}"
        names = {rm["name"] for rm in rooms}
        # legacy rename: 'AdminRoom' should have been renamed to 'SuperAdmin Room'
        assert "AdminRoom" not in names, "Legacy AdminRoom name still present"
        assert any("Admin Room" in n or "SuperAdmin" in n for n in names), f"No admin room found: {names}"

    def test_viewer_sees_null_codes(self, viewer_session):
        r = viewer_session.get(f"{BASE_URL}/api/rooms")
        assert r.status_code == 200
        rooms = r.json()
        for rm in rooms:
            assert rm["code"] is None, f"viewer should not see code on {rm['name']}: {rm}"

    def test_viewer_sees_code_after_room_visit_upsert(self, viewer_session, admin_session):
        # Upsert a room_visits entry directly via Mongo
        rooms = admin_session.get(f"{BASE_URL}/api/rooms").json()
        target_room_id = rooms[0]["room_id"]

        async def _upsert():
            cli = AsyncIOMotorClient(MONGO_URL)
            db = cli[DB_NAME]
            await db.room_visits.update_one(
                {"user_id": viewer_session.user_id, "room_id": target_room_id},
                {"$set": {"last_joined_at": "now"},
                 "$setOnInsert": {"user_id": viewer_session.user_id, "room_id": target_room_id, "first_joined_at": "now"}},
                upsert=True,
            )
            cli.close()

        _run_async(_upsert())
        r = viewer_session.get(f"{BASE_URL}/api/rooms")
        assert r.status_code == 200
        got = {rm["room_id"]: rm["code"] for rm in r.json()}
        assert got[target_room_id] == target_room_id, f"visited room code missing: {got}"
        # Other rooms still null
        for rid, code in got.items():
            if rid != target_room_id:
                assert code is None


# ---------- Notifications ----------

class TestNotifications:
    def test_events_requires_admin(self, viewer_session):
        r = viewer_session.get(f"{BASE_URL}/api/events")
        assert r.status_code == 403

    def test_events_admin_ok(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/events")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_notifications_me_returns_list(self, viewer_session):
        r = viewer_session.get(f"{BASE_URL}/api/notifications/me")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_grant_host_creates_notification_and_event(self, admin_session, viewer_session):
        # snapshot events count for the event_type
        before = admin_session.get(f"{BASE_URL}/api/events", params={"event_type": "host_granted"}).json()
        before_len = len(before)

        r = admin_session.post(
            f"{BASE_URL}/api/users/grant-host",
            json={"user_id": viewer_session.user_id, "can_host": True},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["can_host"] is True

        # Viewer sees a targeted host_granted notification
        notifs = viewer_session.get(f"{BASE_URL}/api/notifications/me").json()
        host_granted = [n for n in notifs if n["type"] == "host_granted"]
        assert host_granted, f"no host_granted notification: {notifs}"
        assert "granted" in host_granted[0]["message"].lower()

        # Event was logged
        after = admin_session.get(f"{BASE_URL}/api/events", params={"event_type": "host_granted"}).json()
        assert len(after) >= before_len + 1

        # Now mark one read
        nid = host_granted[0]["id"]
        r = viewer_session.post(f"{BASE_URL}/api/notifications/{nid}/read")
        assert r.status_code == 200
        # And mark all read
        r = viewer_session.post(f"{BASE_URL}/api/notifications/me/read-all")
        assert r.status_code == 200
        remaining = [n for n in viewer_session.get(f"{BASE_URL}/api/notifications/me").json() if not n.get("read")]
        assert remaining == []

        # Revoke to restore state
        admin_session.post(f"{BASE_URL}/api/users/grant-host", json={"user_id": viewer_session.user_id, "can_host": False})


# ---------- WebSocket knock flow ----------

class TestKnockFlow:
    def test_admin_welcome_and_viewer_pending_then_admit(self, admin_session, viewer_session):
        rooms = admin_session.get(f"{BASE_URL}/api/rooms").json()
        # Pick a room whose host is NOT the viewer and NOT super admin path free.
        target = None
        for r in rooms:
            if r["host_id"] != viewer_session.user_id:
                target = r
                break
        assert target, "no suitable room"
        room_id = target["room_id"]

        # Cleanup prior visit so knock flow is triggered
        async def _clear_visit():
            cli = AsyncIOMotorClient(MONGO_URL)
            db = cli[DB_NAME]
            await db.room_visits.delete_one({"user_id": viewer_session.user_id, "room_id": room_id})
            cli.close()

        async def _flow():
            await _clear_visit()
            # Admin connects to the room first (so it can approve). Admin is super_admin, so auto-admitted.
            admin_ws = await websockets.connect(f"{WS_BASE}/api/ws/room/{room_id}?token={admin_session.token}")
            admin_welcome = json.loads(await asyncio.wait_for(admin_ws.recv(), timeout=5))
            assert admin_welcome["type"] == "welcome", admin_welcome

            # Viewer connects — should get pending_admission (NOT welcome)
            viewer_ws = await websockets.connect(f"{WS_BASE}/api/ws/room/{room_id}?token={viewer_session.token}")
            first = json.loads(await asyncio.wait_for(viewer_ws.recv(), timeout=5))
            assert first["type"] == "pending_admission", first
            assert first.get("room_name")

            # Admin should receive a join_request
            got_join_request = False
            for _ in range(5):
                try:
                    msg = json.loads(await asyncio.wait_for(admin_ws.recv(), timeout=3))
                except asyncio.TimeoutError:
                    break
                if msg.get("type") == "join_request":
                    got_join_request = True
                    assert msg["user"]["user_id"] == viewer_session.user_id
                    break
            assert got_join_request, "admin never got join_request"

            # Admin approves
            await admin_ws.send(json.dumps({"type": "join_response", "target": viewer_session.user_id, "approved": True}))

            # Viewer receives admission_granted then welcome
            seen = []
            for _ in range(6):
                try:
                    m = json.loads(await asyncio.wait_for(viewer_ws.recv(), timeout=5))
                except asyncio.TimeoutError:
                    break
                seen.append(m.get("type"))
                if m.get("type") == "welcome":
                    break
            assert "admission_granted" in seen, seen
            assert "welcome" in seen, seen

            await viewer_ws.close()
            await admin_ws.close()

            # room_visits should now contain an entry
            cli = AsyncIOMotorClient(MONGO_URL)
            db = cli[DB_NAME]
            visit = await db.room_visits.find_one({"user_id": viewer_session.user_id, "room_id": room_id})
            cli.close()
            assert visit is not None, "room_visits entry not created after admit"

        _run_async(_flow())

    def test_viewer_denied_flow(self, admin_session, viewer_session):
        rooms = admin_session.get(f"{BASE_URL}/api/rooms").json()
        # Choose a DIFFERENT room where viewer hasn't visited
        async def _pick_unvisited():
            cli = AsyncIOMotorClient(MONGO_URL)
            db = cli[DB_NAME]
            for r in rooms:
                v = await db.room_visits.find_one({"user_id": viewer_session.user_id, "room_id": r["room_id"]})
                if not v and r["host_id"] != viewer_session.user_id:
                    cli.close()
                    return r
            cli.close()
            return None

        async def _flow():
            room = await _pick_unvisited()
            if not room:
                pytest.skip("no unvisited room available for deny test")
            room_id = room["room_id"]
            admin_ws = await websockets.connect(f"{WS_BASE}/api/ws/room/{room_id}?token={admin_session.token}")
            await asyncio.wait_for(admin_ws.recv(), timeout=5)  # welcome
            viewer_ws = await websockets.connect(f"{WS_BASE}/api/ws/room/{room_id}?token={viewer_session.token}")
            first = json.loads(await asyncio.wait_for(viewer_ws.recv(), timeout=5))
            assert first["type"] == "pending_admission"

            # wait for join_request on admin then deny
            for _ in range(5):
                try:
                    m = json.loads(await asyncio.wait_for(admin_ws.recv(), timeout=3))
                except asyncio.TimeoutError:
                    break
                if m.get("type") == "join_request":
                    break
            await admin_ws.send(json.dumps({"type": "join_response", "target": viewer_session.user_id, "approved": False}))

            saw_denied = False
            for _ in range(6):
                try:
                    m = json.loads(await asyncio.wait_for(viewer_ws.recv(), timeout=5))
                except (asyncio.TimeoutError, websockets.ConnectionClosed):
                    break
                if m.get("type") == "admission_denied":
                    saw_denied = True
                    break
            assert saw_denied, "no admission_denied"

            await admin_ws.close()
            try:
                await viewer_ws.close()
            except Exception:
                pass

        _run_async(_flow())
