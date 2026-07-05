"""
Iter 15 backend regression: POST /api/host-requests flow.
- Creates a fresh viewer.
- Verifies host-request creates a `host_request` broadcast notification for super_admin.
- Verifies super_admin sees the notification.
- Verifies (optionally) the 60s auto_approve produces host_granted notification.
"""
import os
import time
import uuid

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

ADMIN_EMAIL = "sidroks@hotmail.com"
ADMIN_PASSWORD = "streamstar@1"


def _login(session, email, password):
    r = session.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return session


@pytest.fixture(scope="module")
def admin_session():
    return _login(requests.Session(), ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def viewer_session():
    email = f"iter15_hr_{uuid.uuid4().hex[:8]}@example.com"
    password = "viewer1234"
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": password, "name": "HR Test"})
    assert r.status_code == 200, r.text
    # force email verify
    cli = MongoClient(MONGO_URL)
    cli[DB_NAME].users.update_one({"email": email}, {"$set": {"email_verified": True, "can_host": False, "role": "viewer"}})
    cli.close()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    me = s.get(f"{BASE_URL}/api/auth/me").json()
    s.user_id = me["user_id"]
    s.email = email
    return s


class TestHostRequest:
    def test_post_host_request_creates_pending_and_broadcast_notification(self, viewer_session, admin_session):
        # Cleanup any prior pending
        cli = MongoClient(MONGO_URL)
        cli[DB_NAME].host_requests.delete_many({"user_id": viewer_session.user_id})
        cli.close()

        r = viewer_session.post(f"{BASE_URL}/api/host-requests")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "pending"
        assert "created_at" in body
        # NOTE: backend does still return auto_approve_at; frontend ignores it per iter15 spec.

        # DB row exists
        cli = MongoClient(MONGO_URL)
        row = cli[DB_NAME].host_requests.find_one({"user_id": viewer_session.user_id, "status": "pending"})
        cli.close()
        assert row is not None
        assert row["user_email"] == viewer_session.email

        # super_admin should see a broadcast host_request notification
        notifs = admin_session.get(f"{BASE_URL}/api/notifications/me").json()
        matches = [n for n in notifs if n.get("type") == "host_request" and viewer_session.email in n.get("message", "")]
        assert matches, f"admin did not receive host_request notification for {viewer_session.email}"

    def test_second_call_returns_same_pending(self, viewer_session):
        r = viewer_session.post(f"{BASE_URL}/api/host-requests")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "pending"

    @pytest.mark.slow
    def test_auto_approve_after_60s_produces_host_granted(self, viewer_session):
        # This test is slow — waits ~65s
        # Ensure a fresh pending exists
        cli = MongoClient(MONGO_URL)
        row = cli[DB_NAME].host_requests.find_one({"user_id": viewer_session.user_id, "status": "pending"})
        cli.close()
        if not row:
            r = viewer_session.post(f"{BASE_URL}/api/host-requests")
            assert r.status_code == 200

        time.sleep(65)

        me = viewer_session.get(f"{BASE_URL}/api/auth/me").json()
        assert me.get("can_host") is True, f"viewer never got auto-approved: {me}"
        assert me.get("role") == "host"

        notifs = viewer_session.get(f"{BASE_URL}/api/notifications/me").json()
        host_granted = [n for n in notifs if n.get("type") == "host_granted"]
        assert host_granted, "no host_granted notification after auto-approve"

        # cleanup — revoke via admin
        # (best-effort)
        cli = MongoClient(MONGO_URL)
        cli[DB_NAME].users.update_one({"user_id": viewer_session.user_id}, {"$set": {"can_host": False, "role": "viewer"}})
        cli[DB_NAME].host_requests.delete_many({"user_id": viewer_session.user_id})
        cli.close()
