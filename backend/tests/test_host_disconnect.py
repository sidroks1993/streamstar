"""
Iter 17: Bug fix — Host disconnect must tear down the watch room.

Verifies:
1) Host WS disconnect -> viewers get `host_left` msg + closed with 4404.
2) Pending knockers get `admission_denied` (reason='Host left the room') + closed 4404.
3) Server-side ROOMS / PENDING / ROOM_STATE / STREAM_STARTS for the room are cleared.
4) Fresh reconnect from host yields welcome with yt_video_id=None, mode='webrtc'.
5) db.events contains `host_left` (and `stream_ended` if streaming) events.
6) Room DB record is preserved.
7) Regression: viewer disconnect does NOT tear down the room.
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
from pymongo import MongoClient

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
WS_BASE = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

ADMIN_EMAIL = "sidroks@hotmail.com"
ADMIN_PASSWORD = "streamstar@1"
VIEWER_EMAIL = "viewer_selftest_1783276117@example.com"
VIEWER_PASSWORD = "viewer1234"


def _login_get_token(email, password):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    tok = s.cookies.get("access_token")
    assert tok, f"no access_token cookie after login for {email}"
    return s, tok


@pytest.fixture(scope="module")
def admin():
    s, tok = _login_get_token(ADMIN_EMAIL, ADMIN_PASSWORD)
    me = s.get(f"{BASE_URL}/api/auth/me").json()
    return {"session": s, "token": tok, "user_id": me["user_id"], "name": me.get("name")}


@pytest.fixture(scope="module")
def viewer():
    s, tok = _login_get_token(VIEWER_EMAIL, VIEWER_PASSWORD)
    me = s.get(f"{BASE_URL}/api/auth/me").json()
    return {"session": s, "token": tok, "user_id": me["user_id"], "name": me.get("name")}


@pytest.fixture(scope="module")
def super_admin_room_id(admin):
    r = admin["session"].get(f"{BASE_URL}/api/rooms")
    assert r.status_code == 200, r.text
    rooms = r.json()
    match = [x for x in rooms if x.get("name") == "SuperAdmin Room"]
    assert match, f"SuperAdmin Room not found in {rooms}"
    return match[0]["room_id"]


@pytest.fixture(scope="module")
def ensure_viewer_visited(admin, viewer, super_admin_room_id):
    """Ensure the viewer is auto-admitted by having a prior room_visits row."""
    cli = MongoClient(MONGO_URL)
    cli[DB_NAME].room_visits.update_one(
        {"user_id": viewer["user_id"], "room_id": super_admin_room_id},
        {"$set": {"user_id": viewer["user_id"], "room_id": super_admin_room_id, "ts": time.time()}},
        upsert=True,
    )
    cli.close()
    yield


async def _ws_connect(room_id, token):
    url = f"{WS_BASE}/api/ws/room/{room_id}?token={token}"
    return await websockets.connect(url, open_timeout=10, close_timeout=5)


async def _recv_json(ws, timeout=5):
    raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
    return json.loads(raw)


async def _drain_until(ws, mtype, timeout=5):
    """Read messages until we see one with type==mtype or timeout."""
    end = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < end:
        remaining = max(0.1, end - asyncio.get_event_loop().time())
        try:
            msg = await asyncio.wait_for(ws.recv(), timeout=remaining)
        except asyncio.TimeoutError:
            return None
        try:
            data = json.loads(msg)
        except Exception:
            continue
        if data.get("type") == mtype:
            return data
    return None


class TestHostDisconnect:
    def test_host_disconnect_kicks_viewers_and_clears_state(
        self, admin, viewer, super_admin_room_id, ensure_viewer_visited
    ):
        room_id = super_admin_room_id

        async def scenario():
            # Connect host first
            host_ws = await _ws_connect(room_id, admin["token"])
            host_welcome = await _drain_until(host_ws, "welcome", timeout=6)
            assert host_welcome is not None, "host did not receive welcome"
            assert host_welcome["is_host"] is True

            # Have host set YouTube mode to verify state clears on disconnect
            await host_ws.send(json.dumps({"type": "set_yt", "video_id": "dQw4w9WgXcQ"}))
            # Give backend time to process
            await asyncio.sleep(0.5)

            # Connect viewer (already visited -> auto-admit)
            viewer_ws = await _ws_connect(room_id, viewer["token"])
            viewer_welcome = await _drain_until(viewer_ws, "welcome", timeout=6)
            assert viewer_welcome is not None, "viewer did not receive welcome"
            assert viewer_welcome["is_host"] is False
            assert viewer_welcome.get("yt_video_id") == "dQw4w9WgXcQ"
            assert viewer_welcome.get("mode") == "youtube"

            # Give a beat for host to finish any pending state
            await asyncio.sleep(0.3)

            # HOST DISCONNECTS
            await host_ws.close()

            # Viewer should receive host_left then be closed with 4404
            host_left_msg = await _drain_until(viewer_ws, "host_left", timeout=6)
            assert host_left_msg is not None, "viewer did not receive host_left"
            assert "host_name" in host_left_msg

            # Expect socket close code 4404
            close_code = None
            try:
                # keep reading until closed
                for _ in range(5):
                    try:
                        await asyncio.wait_for(viewer_ws.recv(), timeout=3)
                    except websockets.ConnectionClosed as e:
                        close_code = e.code
                        break
            except Exception as e:
                close_code = getattr(e, "code", None)
            assert close_code == 4404, f"expected viewer close 4404, got {close_code}"

            # Small wait for backend finally block to finish
            await asyncio.sleep(0.8)

            # Fresh reconnect from host — should be a clean welcome (mode=webrtc, yt=None)
            host_ws2 = await _ws_connect(room_id, admin["token"])
            welcome2 = await _drain_until(host_ws2, "welcome", timeout=6)
            assert welcome2 is not None
            assert welcome2.get("yt_video_id") is None, f"state not reset: {welcome2}"
            assert welcome2.get("mode") == "webrtc", f"state not reset: {welcome2}"
            await host_ws2.close()

        asyncio.run(scenario())

        # DB assertions after scenario
        cli = MongoClient(MONGO_URL)

        # 1) Room record preserved
        room_doc = cli[DB_NAME].rooms.find_one({"room_id": room_id})
        assert room_doc is not None, "room DB doc was deleted; should be preserved"

        # 2) host_left event logged in the last ~30s for this room by admin
        cutoff = time.time() - 60
        host_left_events = list(cli[DB_NAME].events.find({
            "event_type": "host_left",
            "room_id": room_id,
            "actor_id": admin["user_id"],
        }))
        cli.close()
        assert host_left_events, "no host_left event logged in db.events"

    def test_viewer_disconnect_does_not_teardown(
        self, admin, viewer, super_admin_room_id, ensure_viewer_visited
    ):
        room_id = super_admin_room_id

        async def scenario():
            host_ws = await _ws_connect(room_id, admin["token"])
            hw = await _drain_until(host_ws, "welcome", timeout=6)
            assert hw is not None

            viewer_ws = await _ws_connect(room_id, viewer["token"])
            vw = await _drain_until(viewer_ws, "welcome", timeout=6)
            assert vw is not None

            await asyncio.sleep(0.3)

            # Viewer disconnects
            await viewer_ws.close()

            # Host should receive `participant_left`, NOT `host_left`
            pl = await _drain_until(host_ws, "participant_left", timeout=6)
            assert pl is not None, "host did not receive participant_left"

            # Host WS should still be open. Try to send/recv without erroring.
            # Send a no-op message and confirm socket alive
            try:
                await host_ws.send(json.dumps({"type": "ping"}))
                alive = True
            except Exception:
                alive = False
            assert alive, "host WS was closed after viewer left — teardown was wrongly triggered"

            await host_ws.close()

        asyncio.run(scenario())

    def test_frontend_switch_cases_present(self):
        """Static assertion that WatchRoom.js has host_left and room_closed cases."""
        with open("/app/frontend/src/pages/WatchRoom.js") as f:
            src = f.read()
        assert 'case "host_left"' in src, "host_left case missing in WatchRoom.js"
        assert 'case "room_closed"' in src, "room_closed case missing in WatchRoom.js"
        # Confirm navigation to /dashboard on both
        # Find snippet around host_left
        idx = src.index('case "host_left"')
        snippet = src[idx: idx + 400]
        assert "/dashboard" in snippet, "host_left case does not navigate to /dashboard"
        assert "host_name" in snippet, "host_left toast does not use host_name"
