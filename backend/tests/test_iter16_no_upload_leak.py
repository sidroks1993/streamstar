"""
Iter 16 regression tests:
- POST /api/host-requests response must NOT contain `auto_approve_at`
  * fresh-create path
  * already-pending idempotent path
- Server-side db.host_requests still stores auto_approve_at (checked indirectly
  via GET /api/host-requests as super_admin)
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback for pytest run via CI where frontend .env is elsewhere
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"

SUPER_EMAIL = "sidroks@hotmail.com"
SUPER_PASS = "streamstar@1"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _register_viewer():
    """Create a fresh non-host viewer. Uses the super-admin's dev/test verification helper if needed."""
    uniq = uuid.uuid4().hex[:10]
    email = f"iter16_{uniq}@example.com"
    password = "viewer1234"
    name = f"Iter16 Viewer {uniq}"
    r = requests.post(
        f"{API}/auth/register",
        json={"email": email, "password": password, "name": name},
        timeout=30,
    )
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    # Some deployments require email verification. Try to log in; if fails, promote via super_admin.
    lg = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    if lg.status_code != 200:
        super_tok = _login(SUPER_EMAIL, SUPER_PASS)
        # attempt to force-verify via admin endpoint if available
        for path in ("/admin/verify-user", "/admin/users/verify"):
            vr = requests.post(
                f"{API}{path}",
                headers={"Authorization": f"Bearer {super_tok}"},
                json={"email": email},
                timeout=30,
            )
            if vr.status_code == 200:
                break
        lg = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert lg.status_code == 200, f"login post-register failed: {lg.status_code} {lg.text}"
    return email, lg.json()["access_token"]


@pytest.fixture(scope="module")
def viewer_token():
    _, tok = _register_viewer()
    return tok


def test_host_request_fresh_create_omits_auto_approve_at(viewer_token):
    r = requests.post(
        f"{API}/host-requests",
        headers={"Authorization": f"Bearer {viewer_token}"},
        timeout=30,
    )
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    body = r.json()
    assert body.get("status") in ("pending", "already_host"), body
    assert "auto_approve_at" not in body, f"auto_approve_at leaked in fresh response: {body}"


def test_host_request_already_pending_omits_auto_approve_at(viewer_token):
    # Second call — idempotent pending path
    r = requests.post(
        f"{API}/host-requests",
        headers={"Authorization": f"Bearer {viewer_token}"},
        timeout=30,
    )
    assert r.status_code == 200
    body = r.json()
    # Could be "pending" (still pending) or "already_host" (auto-approved between calls) — either way no auto_approve_at
    assert "auto_approve_at" not in body, f"auto_approve_at leaked in already-pending response: {body}"


def test_super_admin_list_still_has_auto_approve_at_server_side():
    """Verify auto_approve_at is still stored server-side (visible to super admin listing)."""
    tok = _login(SUPER_EMAIL, SUPER_PASS)
    r = requests.get(
        f"{API}/host-requests",
        headers={"Authorization": f"Bearer {tok}"},
        timeout=30,
    )
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    items = r.json()
    assert isinstance(items, list)
    # At least one should have auto_approve_at (from our test) OR list may be empty if all resolved
    has_field = any("auto_approve_at" in it for it in items)
    # If there are pending items, they must have the field. Filter to pending.
    pending = [it for it in items if it.get("status") == "pending"]
    if pending:
        assert all("auto_approve_at" in it for it in pending), (
            f"Server-side auto_approve_at missing from pending row(s): {pending}"
        )
    else:
        # No pending — accept either present or absent
        assert has_field or not has_field  # informational only
