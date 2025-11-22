# tests/test_tinylink_api.py
import os
import re
import time
import uuid
import requests
import pytest

# Base URL (dashboard/website). API endpoints are relative to this.
BASE_URL = os.getenv("BASE_URL", "http://localhost:5000").rstrip("/")
API_BASE = BASE_URL + "/api"
HEADERS = {"Content-Type": "application/json"}

# Regex rule for codes: [A-Za-z0-9]{6,8}
CODE_RE = re.compile(r"^[A-Za-z0-9]{6,8}$")

@pytest.fixture(scope="module")
def session():
    return requests.Session()

def random_long_url():
    # Use the running backend itself as the target so reachability checks pass
    return f"{BASE_URL}/test-target-{uuid.uuid4().hex[:8]}"

def create_payload(code=None, target=None):
    payload = {"target": target or random_long_url()}
    if code:
        payload["code"] = code
    return payload

def get_link_stats(session, code):
    resp = session.get(f"{API_BASE}/links/{code}")
    resp.raise_for_status()
    return resp.json()

def test_healthz(session):
    """1. /healthz returns 200"""
    r = session.get(f"{BASE_URL}/healthz", timeout=5)
    assert r.status_code == 200, f"healthz returned {r.status_code} - body: {r.text}"

def test_create_and_list_and_duplicate(session):
    """
    2. Creating a link works; duplicate codes return 409.
    3. GET /api/links lists created links.
    """
    # choose a deterministic custom code that fits the pattern
    custom_code = "Tst" + uuid.uuid4().hex[:3]  # length between 6-8 typical
    custom_code = custom_code[:8]
    assert CODE_RE.match(custom_code), f"custom_code {custom_code} doesn't match regex"

    payload = create_payload(code=custom_code)
    r = session.post(f"{API_BASE}/links", json=payload, headers=HEADERS, timeout=5)
    assert r.status_code in (200, 201), f"Expected 200/201 on create, got {r.status_code}: {r.text}"
    created = r.json()
    assert "code" in created and created["code"] == custom_code
    assert "target" in created and created["target"] == payload["target"]

    # Duplicate creation should return 409
    r2 = session.post(f"{API_BASE}/links", json=payload, headers=HEADERS, timeout=5)
    assert r2.status_code == 409, f"Duplicate should be 409, got {r2.status_code} : {r2.text}"

    # GET list and confirm presence
    rlist = session.get(f"{API_BASE}/links", timeout=5)
    assert rlist.status_code == 200
    links = rlist.json()
    found = [l for l in links if l.get("code") == custom_code]
    assert found, f"Created code {custom_code} not found in GET /api/links"
    # save created code & target for later tests
    session._created_code = custom_code
    session._created_target = payload["target"]

def test_redirect_and_clicks_increment(session):
    """
    3. Redirect works (302) and increments click count.
    """
    code = getattr(session, "_created_code", None)
    assert code, "No created code found from previous test"

    # Get stats before redirect
    r_stats_before = session.get(f"{API_BASE}/links/{code}", timeout=5)
    assert r_stats_before.status_code == 200
    stats_before = r_stats_before.json()
    clicks_before = int(stats_before.get("clicks", stats_before.get("click_count", 0) or 0))
    last_clicked_before = stats_before.get("lastClicked") or stats_before.get("last_clicked") or stats_before.get("lastClickedAt")

    # Perform redirect request without following redirects to catch 302
    r_redirect = session.get(f"{BASE_URL}/{code}", allow_redirects=False, timeout=5)
    assert r_redirect.status_code in (301, 302), f"Expected 302/301 redirect, got {r_redirect.status_code}, body: {r_redirect.text}"
    location = r_redirect.headers.get("Location") or r_redirect.headers.get("location")
    assert location, "Redirect response missing Location header"

    time.sleep(0.5)
    r_stats_after = session.get(f"{API_BASE}/links/{code}", timeout=5)
    assert r_stats_after.status_code == 200
    stats_after = r_stats_after.json()
    clicks_after = int(stats_after.get("clicks", stats_after.get("click_count", 0) or 0))
    last_clicked_after = stats_after.get("lastClicked") or stats_after.get("last_clicked") or stats_after.get("lastClickedAt")

    assert clicks_after >= clicks_before + 1, f"Expected clicks to increment by 1. Before: {clicks_before} After: {clicks_after}"
    assert last_clicked_after is not None, "Expected last clicked time to be present after redirect"

def test_get_single_stats(session):
    """GET /api/links/:code returns detailed stats and fields"""
    code = getattr(session, "_created_code", None)
    assert code
    r = session.get(f"{API_BASE}/links/{code}", timeout=5)
    assert r.status_code == 200
    data = r.json()
    assert data.get("code") == code
    assert "target" in data
    clicks_val = data.get("clicks") or data.get("click_count") or 0
    assert isinstance(clicks_val, (int, float)) or str(clicks_val).isdigit()

def test_delete_and_404_after_delete(session):
    """
    4. Deletion stops redirect (404).
    """
    code = getattr(session, "_created_code", None)
    assert code, "No created code found from previous test"

    # Delete via API
    rdel = session.delete(f"{API_BASE}/links/{code}", timeout=5)
    assert rdel.status_code in (200, 202, 204), f"Delete endpoint returned {rdel.status_code}: {rdel.text}"

    # After deletion, stats endpoint should return 404 or 410
    r_stats = session.get(f"{API_BASE}/links/{code}", timeout=5)
    assert r_stats.status_code in (404, 410), f"Expected 404/410 for deleted link, got {r_stats.status_code}"

    # And redirect should now return 404
    r_redirect = session.get(f"{BASE_URL}/{code}", allow_redirects=False, timeout=5)
    assert r_redirect.status_code == 404, f"Expected 404 after deletion for redirect, got {r_redirect.status_code} - body: {r_redirect.text}"