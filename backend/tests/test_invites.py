"""Iteration 9+10 tests: invites, legacy notification aliases, WS auto-admit-after-invite."""
import asyncio, json, os, uuid, time
from datetime import datetime, timedelta, timezone

import jwt
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
JWT_SECRET = os.environ["JWT_SECRET"]

ADMIN_EMAIL = "sidroks@hotmail.com"
ADMIN_PASSWORD = "streamstar@1"


def _run(coro):
    return asyncio.run(coro)


def _register_verified(prefix="invite_test"):
    email = f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"
    password = "invite1234"
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": password, "name": prefix})
    assert r.status_code == 200, r.text
    cli = MongoClient(MONGO_URL)
    cli[DB_NAME].users.update_one({"email": email}, {"$set": {"email_verified": True}})
    cli.close()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200
    s.token = s.cookies.get("access_token")
    me = s.get(f"{BASE_URL}/api/auth/me").json()
    s.user_id = me["user_id"]
    s.email = email
    return s


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200
    s.token = s.cookies.get("access_token")
    me = s.get(f"{BASE_URL}/api/auth/me").json()
    s.user_id = me["user_id"]
    return s


@pytest.fixture(scope="module")
def viewer_session():
    return _register_verified("invite_viewer")


@pytest.fixture(scope="module")
def another_viewer():
    return _register_verified("invite_other")


@pytest.fixture(scope="module")
def admin_room(admin_session):
    r = admin_session.post(f"{BASE_URL}/api/rooms", json={"name": "Invite Test Room", "is_public": True})
    assert r.status_code == 200
    return r.json()


class TestCreateInvite:
    def test_admin_can_create_invite(self, admin_session, admin_room):
        room_id = admin_room["room_id"]
        r = admin_session.post(f"{BASE_URL}/api/rooms/{room_id}/invites")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["room_id"] == room_id
        assert data["invite_token"] and data["invite_url"].endswith(f"?invite={data['invite_token']}")
        assert f"/watch/{room_id}" in data["invite_url"]

        # JWT decodable, typ='invite', matching room_id, ~15min TTL
        payload = jwt.decode(data["invite_token"], JWT_SECRET, algorithms=["HS256"])
        assert payload["typ"] == "invite"
        assert payload["room_id"] == room_id
        assert payload["iss_uid"] == admin_session.user_id
        # exp is around now+15min
        now = int(time.time())
        assert 14 * 60 <= (payload["exp"] - now) <= 16 * 60

        # expires_at ~ +15min
        exp_dt = datetime.fromisoformat(data["expires_at"])
        diff = (exp_dt - datetime.now(timezone.utc)).total_seconds()
        assert 14 * 60 <= diff <= 16 * 60

    def test_non_host_forbidden(self, viewer_session, admin_room):
        r = viewer_session.post(f"{BASE_URL}/api/rooms/{admin_room['room_id']}/invites")
        assert r.status_code == 403
        assert "host" in r.json().get("detail", "").lower()

    def test_unknown_room_404(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/api/rooms/does-not-exist/invites")
        assert r.status_code == 404


class TestAcceptInvite:
    def test_accept_valid_invite_upserts_visit_and_notifies_host(self, admin_session, admin_room):
        # Fresh viewer
        viewer = _register_verified("invite_fresh")
        room_id = admin_room["room_id"]

        # Admin generates
        inv = admin_session.post(f"{BASE_URL}/api/rooms/{room_id}/invites").json()

        # Accept
        r = viewer.post(f"{BASE_URL}/api/invites/accept", json={"token": inv["invite_token"]})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["room_id"] == room_id
        assert data["admitted"] is True
        assert data["room_name"] == admin_room["name"]

        # room_visits upserted with admitted_via=invite
        async def _check():
            cli = AsyncIOMotorClient(MONGO_URL)
            v = await cli[DB_NAME].room_visits.find_one({"user_id": viewer.user_id, "room_id": room_id})
            evts = await cli[DB_NAME].events.find({"event_type": "invite_accepted", "room_id": room_id}).to_list(20)
            cli.close()
            return v, evts

        visit, evts = _run(_check())
        assert visit is not None
        assert visit.get("admitted_via") == "invite"
        assert any(e.get("actor_id") == viewer.user_id for e in evts), f"no invite_accepted event for viewer: {evts}"

        # Host notified
        notifs = admin_session.get(f"{BASE_URL}/api/notifications/me").json()
        accepted = [n for n in notifs if n.get("type") == "invite_accepted" and n.get("meta", {}).get("room_id") == room_id]
        assert accepted, f"host did not get invite_accepted notification: {[n.get('type') for n in notifs]}"

    def test_expired_token_returns_410(self, viewer_session, admin_room):
        expired = jwt.encode({
            "typ": "invite",
            "room_id": admin_room["room_id"],
            "iss_uid": "x",
            "exp": int(time.time()) - 60,
        }, JWT_SECRET, algorithm="HS256")
        r = viewer_session.post(f"{BASE_URL}/api/invites/accept", json={"token": expired})
        assert r.status_code == 410
        assert "expired" in r.json()["detail"].lower()

    def test_malformed_token_400(self, viewer_session):
        r = viewer_session.post(f"{BASE_URL}/api/invites/accept", json={"token": "not-a-jwt.xxx.yyy"})
        assert r.status_code == 400
        assert "invalid" in r.json()["detail"].lower()

    def test_wrong_typ_400(self, viewer_session, admin_room):
        tok = jwt.encode({
            "typ": "other",
            "room_id": admin_room["room_id"],
            "exp": int(time.time()) + 300,
        }, JWT_SECRET, algorithm="HS256")
        r = viewer_session.post(f"{BASE_URL}/api/invites/accept", json={"token": tok})
        assert r.status_code == 400
        assert "not an invite" in r.json()["detail"].lower()

    def test_deleted_room_404(self, viewer_session):
        tok = jwt.encode({
            "typ": "invite",
            "room_id": "deleted-room-" + uuid.uuid4().hex[:6],
            "iss_uid": "x",
            "exp": int(time.time()) + 300,
        }, JWT_SECRET, algorithm="HS256")
        r = viewer_session.post(f"{BASE_URL}/api/invites/accept", json={"token": tok})
        assert r.status_code == 404


class TestWSAutoAdmitAfterInvite:
    def test_ws_skips_knock_after_invite(self, admin_session, admin_room):
        viewer = _register_verified("invite_ws")
        room_id = admin_room["room_id"]

        # Clear any prior visit
        async def _clear():
            cli = AsyncIOMotorClient(MONGO_URL)
            await cli[DB_NAME].room_visits.delete_one({"user_id": viewer.user_id, "room_id": room_id})
            cli.close()
        _run(_clear())

        # Generate + accept invite
        inv = admin_session.post(f"{BASE_URL}/api/rooms/{room_id}/invites").json()
        r = viewer.post(f"{BASE_URL}/api/invites/accept", json={"token": inv["invite_token"]})
        assert r.status_code == 200

        async def _connect():
            ws = await websockets.connect(f"{WS_BASE}/api/ws/room/{room_id}?token={viewer.token}")
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
            await ws.close()
            return msg

        first = _run(_connect())
        assert first.get("type") == "welcome", f"expected welcome, got {first}"


class TestLegacyNotificationAliases:
    def test_legacy_list_admin_ok(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/notifications")
        assert r.status_code == 200
        legacy = r.json()
        me = admin_session.get(f"{BASE_URL}/api/notifications/me").json()
        # Should be same set (delegated). Compare ids since /me sorts too.
        assert {n["id"] for n in legacy} == {n["id"] for n in me}

    def test_legacy_list_non_admin_403(self, viewer_session):
        r = viewer_session.get(f"{BASE_URL}/api/notifications")
        assert r.status_code == 403

    def test_legacy_mark_read_admin(self, admin_session):
        # Snapshot notification ids BEFORE mark, so parallel workers creating notifs after don't cause race.
        before = admin_session.get(f"{BASE_URL}/api/notifications/me").json()
        before_ids = {n["id"] for n in before}
        r = admin_session.post(f"{BASE_URL}/api/notifications/mark-read")
        assert r.status_code == 200
        after = admin_session.get(f"{BASE_URL}/api/notifications/me").json()
        # All notifications that existed BEFORE mark-read should now be read
        still_unread_from_before = [n for n in after if n["id"] in before_ids and not n.get("read")]
        assert still_unread_from_before == [], f"legacy mark-read did not mark all: {still_unread_from_before}"

    def test_legacy_mark_read_non_admin_403(self, viewer_session):
        r = viewer_session.post(f"{BASE_URL}/api/notifications/mark-read")
        assert r.status_code == 403
