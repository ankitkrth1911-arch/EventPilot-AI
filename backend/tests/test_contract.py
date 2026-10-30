"""
EventPilot AI - Backend Contract and Security Tests
Tests end-to-end API lifecycle, contract guarantees, schema validation,
Pydantic v2 extra=forbid, UUID validation, optimistic concurrency (ETag),
idempotency, security headers, and error shapes.
"""

import os
import sys
import json
import uuid
import pytest
import httpx

# Ensure backend directory is in python sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Set test mode before importing main
os.environ["TEST_MODE"] = "true"
os.environ["DATABASE_URL"] = "memory://"
os.environ["ADMIN_TOKEN"] = "test-secret-token"
os.environ["RATE_LIMIT_READS"] = "500"
os.environ["RATE_LIMIT_WRITES"] = "500"
os.environ["RATE_LIMIT_BURSTS"] = "500"

from main import app, memory_store, MockPool


@pytest.fixture(autouse=True)
def setup_test_db():
    """Ensure in-memory mock database is cleanly initialized for each test."""
    memory_store.clear()
    app.state.pool = MockPool(memory_store)
    yield
    memory_store.clear()


@pytest.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


@pytest.mark.asyncio
async def test_full_lifecycle_and_contract(client: httpx.AsyncClient):
    """
    Test full lifecycle:
    create -> list -> get -> PATCH (name only, null clears date/location, plan merge keeps workspace)
    -> generate-plan with and without event_id -> DELETE -> 404.
    """
    # 1. Create Event
    create_payload = {
        "name": "Arjun & Priya Wedding Gala",
        "event_type": "wedding",
        "event_date": "2026-12-15",
        "location": "Taj Palace, Mumbai",
        "guest_count": 250,
        "budget": 500000.0,
        "plan": {
            "workspace": {
                "venueName": "Grand Ballroom",
                "guests": [{"name": "Aarav", "status": "attending"}],
                "tasks": [{"id": "t-1", "title": "Confirm florist", "completed": False}]
            }
        }
    }
    create_resp = await client.post("/api/events", json=create_payload)
    assert create_resp.status_code == 201, create_resp.text
    created = create_resp.json()
    event_id = created["id"]
    assert created["name"] == create_payload["name"]
    assert created["event_type"] == "wedding"
    assert created["budget"] == 500000.0
    assert "ETag" in create_resp.headers
    etag_v1 = create_resp.headers["ETag"]

    # 2. List Events
    list_resp = await client.get("/api/events?limit=10")
    assert list_resp.status_code == 200
    events = list_resp.json()
    assert len(events) >= 1
    assert any(e["id"] == event_id for e in events)

    # 3. Get Event by UUID
    get_resp = await client.get(f"/api/events/{event_id}")
    assert get_resp.status_code == 200
    retrieved = get_resp.json()
    assert retrieved["id"] == event_id
    assert retrieved["plan"]["workspace"]["venueName"] == "Grand Ballroom"
    assert get_resp.headers.get("ETag") == etag_v1

    # 4. PATCH: Name only (leaves date, location, budget, plan intact)
    patch_name_resp = await client.patch(f"/api/events/{event_id}", json={"name": "Arjun & Priya Royal Wedding"})
    assert patch_name_resp.status_code == 200
    patched_name = patch_name_resp.json()
    assert patched_name["name"] == "Arjun & Priya Royal Wedding"
    assert patched_name["event_date"] == "2026-12-15"
    assert patched_name["location"] == "Taj Palace, Mumbai"
    assert patched_name["plan"]["workspace"]["venueName"] == "Grand Ballroom"

    # 5. PATCH: Null clears date and location
    patch_null_resp = await client.patch(f"/api/events/{event_id}", json={"event_date": None, "location": None})
    assert patch_null_resp.status_code == 200
    patched_null = patch_null_resp.json()
    assert patched_null["event_date"] is None
    assert patched_null["location"] is None
    # Confirm workspace remains intact
    assert patched_null["plan"]["workspace"]["venueName"] == "Grand Ballroom"

    # 6. PATCH: Plan merge keeps plan.workspace
    patch_plan_resp = await client.patch(
        f"/api/events/{event_id}",
        json={
            "plan": {
                "workspace": {
                    "cateringLead": "Chef Sanjeev"
                },
                "customNote": "VIP guests arriving early"
            }
        }
    )
    assert patch_plan_resp.status_code == 200
    patched_plan = patch_plan_resp.json()
    # Workspace venueName was preserved by deep merge!
    assert patched_plan["plan"]["workspace"]["venueName"] == "Grand Ballroom"
    assert patched_plan["plan"]["workspace"]["cateringLead"] == "Chef Sanjeev"
    assert patched_plan["plan"]["customNote"] == "VIP guests arriving early"

    # 7. POST /api/generate-plan WITHOUT event_id
    gen_standalone_resp = await client.post(
        "/api/generate-plan",
        json={
            "event_type": "birthday",
            "budget": 50000.0,
            "guest_count": 50,
            "event_date": "2026-11-20"
        }
    )
    assert gen_standalone_resp.status_code == 200
    gen_standalone = gen_standalone_resp.json()
    assert gen_standalone["event_type"] == "birthday"
    assert len(gen_standalone["budget_breakdown"]) > 0
    assert len(gen_standalone["checklist"]) > 0
    assert gen_standalone["per_guest_cost"] == 1000.0

    # 8. POST /api/generate-plan WITH event_id (updates stored event plan)
    gen_event_resp = await client.post(
        "/api/generate-plan",
        json={
            "event_type": "wedding",
            "budget": 600000.0,
            "guest_count": 300,
            "event_date": "2026-12-20",
            "event_id": event_id
        }
    )
    assert gen_event_resp.status_code == 200
    updated_plan = gen_event_resp.json()
    assert updated_plan["event_type"] == "wedding"
    assert updated_plan["total_budget"] == 600000.0

    # 9. DELETE Event
    del_resp = await client.delete(f"/api/events/{event_id}")
    assert del_resp.status_code == 200
    del_data = del_resp.json()
    assert del_data["deleted"] is True
    assert del_data["id"] == event_id

    # 10. GET deleted event -> 404
    get_404_resp = await client.get(f"/api/events/{event_id}")
    assert get_404_resp.status_code == 404
    assert "error" in get_404_resp.json()
    assert get_404_resp.json()["error"] == "Event not found"


@pytest.mark.asyncio
async def test_validation_and_422_errors(client: httpx.AsyncClient):
    """
    Test 422 validation cases:
    - Negative budget
    - Wrong event_type
    - Empty PATCH
    - Extra unknown fields (extra="forbid")
    - Non-UUID ID (must return 422, NEVER 500)
    - Plan payload exceeding 512 KB
    - Plan payload nesting depth exceeding 10
    """
    # 1. Negative budget
    resp = await client.post(
        "/api/events",
        json={"name": "Negative Test", "event_type": "wedding", "budget": -500.0}
    )
    assert resp.status_code == 422
    assert "error" in resp.json()

    # 2. Wrong event_type
    resp = await client.post(
        "/api/events",
        json={"name": "Concert", "event_type": "concert"}
    )
    assert resp.status_code == 422

    # 3. Extra unknown fields (enforce extra="forbid")
    resp = await client.post(
        "/api/events",
        json={"name": "Extra Fields", "event_type": "birthday", "malicious_field": "injected"}
    )
    assert resp.status_code == 422
    err_text = json.dumps(resp.json())
    assert "extra_forbidden" in err_text or "Extra inputs are not permitted" in err_text or "Input validation failed" in err_text

    # 4. Non-UUID path parameter: must be 422, NEVER 500
    resp = await client.get("/api/events/not-a-valid-uuid-12345")
    assert resp.status_code == 422
    assert "error" in resp.json()

    resp = await client.delete("/api/events/random-string-id")
    assert resp.status_code == 422

    resp = await client.patch("/api/events/invalid-uuid", json={"name": "Test"})
    assert resp.status_code == 422

    # 5. Empty PATCH body -> 422
    valid_uuid = str(uuid.uuid4())
    resp = await client.patch(f"/api/events/{valid_uuid}", json={})
    assert resp.status_code == 422
    assert "At least one field must be provided" in resp.json()["error"]

    # 6. Deeply nested plan (> 10 levels) -> 422
    deep_plan = {"a": {"b": {"c": {"d": {"e": {"f": {"g": {"h": {"i": {"j": {"k": "too deep"}}}}}}}}}}}
    resp = await client.post(
        "/api/events",
        json={"name": "Deep Plan", "event_type": "birthday", "plan": deep_plan}
    )
    assert resp.status_code == 422
    assert "nesting depth" in resp.json()["error"]

    # 7. Oversized plan (> 512 KB) -> 422
    large_plan = {"large_data": "x" * (520 * 1024)}
    resp = await client.post(
        "/api/events",
        json={"name": "Large Plan", "event_type": "birthday", "plan": large_plan}
    )
    assert resp.status_code == 422
    assert "exceeds maximum limit of 512 KB" in resp.json()["error"]


@pytest.mark.asyncio
async def test_optimistic_concurrency_etag(client: httpx.AsyncClient):
    """Test If-Match ETag optimistic concurrency on PATCH."""
    create_resp = await client.post(
        "/api/events",
        json={"name": "Concur Event", "event_type": "community"}
    )
    assert create_resp.status_code == 201
    event_id = create_resp.json()["id"]
    etag = create_resp.headers["ETag"].strip('"')

    # Matching If-Match succeeds (200)
    match_resp = await client.patch(
        f"/api/events/{event_id}",
        json={"name": "Updated Concur Event"},
        headers={"If-Match": f'"{etag}"'}
    )
    assert match_resp.status_code == 200
    new_etag = match_resp.headers["ETag"].strip('"')
    assert new_etag != etag

    # Stale/Mismatched If-Match returns 412 Precondition Failed
    stale_resp = await client.patch(
        f"/api/events/{event_id}",
        json={"name": "Conflicting Update"},
        headers={"If-Match": f'"{etag}"'}  # old etag
    )
    assert stale_resp.status_code == 412
    assert "precondition failed" in stale_resp.json()["error"].lower()


@pytest.mark.asyncio
async def test_idempotency_key(client: httpx.AsyncClient):
    """Test Idempotency-Key header on POST /api/events prevents duplicate records."""
    key = "idem-test-" + str(uuid.uuid4())
    payload = {"name": "Idempotent Gala", "event_type": "wedding", "budget": 100000.0}

    resp1 = await client.post("/api/events", json=payload, headers={"Idempotency-Key": key})
    assert resp1.status_code == 201
    id1 = resp1.json()["id"]

    # Second submission with same Idempotency-Key
    resp2 = await client.post("/api/events", json=payload, headers={"Idempotency-Key": key})
    assert resp2.status_code == 201
    assert resp2.headers.get("Idempotent-Replayed") == "true"
    assert resp2.json()["id"] == id1


@pytest.mark.asyncio
async def test_system_probes_and_security_headers(client: httpx.AsyncClient):
    """Test /, HEAD /, /livez, /health, security headers, and request ID tracking."""
    # Root GET probe
    root_get = await client.get("/")
    assert root_get.status_code == 200
    assert "message" in root_get.json()

    # Root HEAD probe returns 200 and empty body
    root_head = await client.head("/")
    assert root_head.status_code == 200
    assert root_head.text == ""

    # Livez probe
    livez_resp = await client.get("/livez")
    assert livez_resp.status_code == 200
    assert livez_resp.json()["status"] == "ok"

    # Health probe
    health_resp = await client.get("/health")
    assert health_resp.status_code == 200
    assert health_resp.json()["status"] == "ok"

    # Security headers check
    headers = health_resp.headers
    assert headers.get("X-Content-Type-Options") == "nosniff"
    assert headers.get("X-Frame-Options") == "DENY"
    assert headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    assert "X-Request-Id" in headers


@pytest.mark.asyncio
async def test_internal_metrics_auth(client: httpx.AsyncClient):
    """Test /internal/metrics is protected by ADMIN_TOKEN."""
    # Without auth token -> 403
    unauth_resp = await client.get("/internal/metrics")
    assert unauth_resp.status_code == 403

    # With invalid token -> 403
    wrong_resp = await client.get("/internal/metrics", headers={"Authorization": "Bearer wrong-token"})
    assert wrong_resp.status_code == 403

    # With correct token -> 200
    auth_resp = await client.get("/internal/metrics", headers={"Authorization": "Bearer test-secret-token"})
    assert auth_resp.status_code == 200
    metrics_data = auth_resp.json()
    assert "in_flight_requests" in metrics_data
    assert "total_requests" in metrics_data
    assert "latency_ms" in metrics_data


@pytest.mark.asyncio
async def test_cors_preflight_and_disallowed_origin(client: httpx.AsyncClient):
    """
    Phase 1, Item 4: Verify CORS preflight (OPTIONS) for GET/POST/PATCH/DELETE
    from http://localhost:3000, http://localhost:5173 and a disallowed origin (must be blocked).
    No wildcard origins.
    """
    allowed_origins = ["http://localhost:3000", "http://localhost:5173"]
    methods = ["GET", "POST", "PATCH", "DELETE"]

    for origin in allowed_origins:
        for method in methods:
            options_resp = await client.options(
                "/api/events",
                headers={
                    "Origin": origin,
                    "Access-Control-Request-Method": method,
                    "Access-Control-Request-Headers": "Content-Type,If-Match,Idempotency-Key",
                }
            )
            assert options_resp.status_code == 200
            assert options_resp.headers.get("Access-Control-Allow-Origin") == origin
            assert method in options_resp.headers.get("Access-Control-Allow-Methods", "")

    # Disallowed origin must NOT get Access-Control-Allow-Origin header
    disallowed_origin = "http://evil-attacker.com"
    bad_options = await client.options(
        "/api/events",
        headers={
            "Origin": disallowed_origin,
            "Access-Control-Request-Method": "POST",
        }
    )
    assert bad_options.headers.get("Access-Control-Allow-Origin") is None


@pytest.mark.asyncio
async def test_request_size_limit_413(client: httpx.AsyncClient):
    """Test request body exceeding 1 MB is rejected with 413."""
    # Send large body with content-length header > 1 MB
    large_body = "x" * (1024 * 1024 + 10)
    resp = await client.post(
        "/api/events",
        content=large_body,
        headers={"Content-Type": "application/json", "Content-Length": str(len(large_body))}
    )
    assert resp.status_code == 413
    assert resp.json()["error"] == "Request body exceeds maximum size of 1 MB"


@pytest.mark.asyncio
async def test_db_host_and_error_sanitization(client: httpx.AsyncClient, caplog):
    """Test database HOST extraction, message sanitization, and /health failure logging."""
    from main import extract_db_host, sanitize_db_error_message, PoolTimeout

    # 1. Host extraction only
    assert extract_db_host("postgresql://myuser:mypassword123@aws-0-us-east-1.pooler.supabase.com:6543/postgres") == "aws-0-us-east-1.pooler.supabase.com"
    assert extract_db_host("memory://") == "memory"
    assert extract_db_host("") == "none"

    # 2. Error message sanitization
    class FakeAuthError(Exception): pass
    assert sanitize_db_error_message(FakeAuthError('FATAL: password authentication failed for user "myuser"')) == "password authentication failed"

    class FakeTenantError(Exception): pass
    assert sanitize_db_error_message(FakeTenantError("FATAL: Tenant or user not found")) == "tenant or user not found"

    class FakeHostError(Exception): pass
    assert sanitize_db_error_message(FakeHostError('could not translate host name "db.xyz.supabase.co"')) == "could not translate host name"

    assert sanitize_db_error_message(PoolTimeout("timed out")) == "connection timed out"

    # 3. Health check failure logging
    class BrokenPool:
        def connection(self, timeout=3.0):
            import psycopg
            raise psycopg.OperationalError('connection failed: password authentication failed for user "superadmin"')

    app.state.pool = BrokenPool()
    with caplog.at_level("WARNING"):
        res = await client.get("/health")
        assert res.status_code == 503
        assert res.json() == {"status": "degraded", "database": "unreachable"}

    assert any("OperationalError" in r.message and "password authentication failed" in r.message for r in caplog.records)
    for r in caplog.records:
        assert "superadmin" not in r.message
