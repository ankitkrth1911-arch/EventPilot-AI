import json
import random
import uuid
import requests
from locust import HttpUser, task, between, events

class EventPilotUser(HttpUser):
    wait_time = between(0.1, 0.5)

    def on_start(self):
        self.created_event_ids: list[str] = []
        self.event_etags: dict[str, str] = {}

    @task(35)
    def list_events(self):
        """60% bucket part 1: List events (reads)"""
        with self.client.get("/api/events?limit=20", catch_response=True, name="GET /api/events") as res:
            if res.status_code == 200:
                res.success()
                try:
                    data = res.json()
                    if isinstance(data, list) and data:
                        # seed some event IDs for get/patch
                        sample = random.choice(data)
                        if sample.get("id") and sample["id"] not in self.created_event_ids:
                            self.created_event_ids.append(sample["id"])
                except Exception:
                    pass
            elif res.status_code in (429, 503):
                # Controlled rate limit or concurrency load shedding
                if "retry-after" in res.headers:
                    res.success()
                else:
                    res.failure("Missing Retry-After header on load shedding")
            elif res.status_code >= 500:
                res.failure(f"HTTP 500 error: {res.text}")
            else:
                res.failure(f"Unexpected status: {res.status_code}")

    @task(25)
    def get_event(self):
        """60% bucket part 2: Get single event by id (reads)"""
        if not self.created_event_ids:
            # Fallback to list
            self.list_events()
            return

        target_id = random.choice(self.created_event_ids)
        with self.client.get(f"/api/events/{target_id}", catch_response=True, name="GET /api/events/[id]") as res:
            if res.status_code == 200:
                etag = res.headers.get("etag")
                if etag:
                    self.event_etags[target_id] = etag
                res.success()
            elif res.status_code == 404:
                # Event was likely deleted by another worker
                if target_id in self.created_event_ids:
                    self.created_event_ids.remove(target_id)
                res.success()
            elif res.status_code in (429, 503):
                res.success()
            elif res.status_code >= 500:
                res.failure(f"HTTP 500 error: {res.text}")
            else:
                res.failure(f"Unexpected status: {res.status_code}")

    @task(20)
    def create_event(self):
        """20% bucket: Create event with LOADTEST- prefix"""
        test_uuid = uuid.uuid4().hex[:8]
        event_type = random.choice(["wedding", "birthday", "community"])
        payload = {
            "name": f"LOADTEST-Summit-{test_uuid}",
            "event_type": event_type,
            "event_date": "2026-12-15",
            "location": "Convention Center, Suite 400",
            "guest_count": random.randint(50, 300),
            "budget": random.randint(100000, 1000000),
            "plan": {
                "workspace": {
                    "tags": ["loadtest", "automated"],
                    "session_id": test_uuid,
                }
            },
        }

        headers = {
            "Content-Type": "application/json",
            "Idempotency-Key": f"locust-{test_uuid}",
        }

        with self.client.post("/api/events", json=payload, headers=headers, catch_response=True, name="POST /api/events") as res:
            if res.status_code in (200, 201):
                try:
                    data = res.json()
                    new_id = data.get("id")
                    if new_id:
                        self.created_event_ids.append(new_id)
                        etag = res.headers.get("etag")
                        if etag:
                            self.event_etags[new_id] = etag
                    res.success()
                except Exception:
                    res.failure("Invalid JSON response on create")
            elif res.status_code in (429, 503):
                if "retry-after" in res.headers:
                    res.success()
                else:
                    res.failure("Missing Retry-After header on load shedding")
            elif res.status_code >= 500:
                res.failure(f"HTTP 500 error on create: {res.text}")
            else:
                res.failure(f"Unexpected status: {res.status_code}")

    @task(15)
    def patch_event(self):
        """15% bucket: PATCH event with optimistic concurrency (If-Match)"""
        if not self.created_event_ids:
            self.create_event()
            return

        target_id = random.choice(self.created_event_ids)
        etag = self.event_etags.get(target_id)

        headers = {"Content-Type": "application/json"}
        if etag:
            headers["If-Match"] = etag

        payload = {
            "name": f"LOADTEST-Patched-{uuid.uuid4().hex[:6]}",
            "location": "Updated Ballroom A",
        }

        with self.client.patch(f"/api/events/{target_id}", json=payload, headers=headers, catch_response=True, name="PATCH /api/events/[id]") as res:
            if res.status_code == 200:
                new_etag = res.headers.get("etag")
                if new_etag:
                    self.event_etags[target_id] = new_etag
                res.success()
            elif res.status_code == 412:
                # Precondition Failed: optimistic concurrency detected concurrent modification
                res.success()
            elif res.status_code == 404:
                if target_id in self.created_event_ids:
                    self.created_event_ids.remove(target_id)
                res.success()
            elif res.status_code in (429, 503):
                res.success()
            elif res.status_code >= 500:
                res.failure(f"HTTP 500 error on patch: {res.text}")
            else:
                res.failure(f"Unexpected status: {res.status_code}")

    @task(3)
    def generate_plan(self):
        """Part of 5% bucket: generate-plan rule-based engine"""
        payload = {
            "event_type": random.choice(["wedding", "birthday", "community"]),
            "budget": 250000,
            "guest_count": 100,
            "event_date": "2026-11-20",
        }
        with self.client.post("/api/generate-plan", json=payload, catch_response=True, name="POST /api/generate-plan") as res:
            if res.status_code == 200:
                res.success()
            elif res.status_code in (429, 503):
                res.success()
            elif res.status_code >= 500:
                res.failure(f"HTTP 500 error: {res.text}")
            else:
                res.failure(f"Unexpected status: {res.status_code}")

    @task(2)
    def delete_event(self):
        """Part of 5% bucket: DELETE event"""
        if not self.created_event_ids:
            return

        target_id = self.created_event_ids.pop()
        with self.client.delete(f"/api/events/{target_id}", catch_response=True, name="DELETE /api/events/[id]") as res:
            if res.status_code in (200, 204, 404):
                res.success()
            elif res.status_code in (429, 503):
                res.success()
            elif res.status_code >= 500:
                res.failure(f"HTTP 500 error on delete: {res.text}")
            else:
                res.failure(f"Unexpected status: {res.status_code}")


@events.test_stop.add_listener
def cleanup_loadtest_events(environment, **kwargs):
    """Clean up all events tagged with LOADTEST- prefix"""
    host = environment.host or "http://127.0.0.1:8000"
    print(f"\n[Cleanup] Cleaning up all LOADTEST- events on {host}...")
    try:
        res = requests.get(f"{host}/api/events?limit=200", timeout=10)
        if res.status_code == 200:
            events = res.json()
            deleted_count = 0
            for ev in events:
                name = ev.get("name", "")
                ev_id = ev.get("id")
                if ev_id and name.startswith("LOADTEST-"):
                    del_res = requests.delete(f"{host}/api/events/{ev_id}", timeout=5)
                    if del_res.status_code in (200, 204):
                        deleted_count += 1
            print(f"[Cleanup] Successfully purged {deleted_count} LOADTEST- events.")
    except Exception as e:
        print(f"[Cleanup] Cleanup error (safe to ignore if backend offline): {e}")
