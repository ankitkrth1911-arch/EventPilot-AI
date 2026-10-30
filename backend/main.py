"""
EventPilot AI - Backend Service
FastAPI + Supabase PostgreSQL (psycopg 3 connection pool) + Rule-Based Planning Engine.
Hardened for high concurrency, security, and Northflank / Docker production deployment.
"""

import os
import sys
import json
import time
import uuid
import math
import hashlib
import asyncio
import logging
import re
from urllib.parse import urlsplit
from datetime import date, datetime, timezone
from typing import Literal, Optional, List, Dict, Any, Union, Set
from uuid import UUID
from contextlib import asynccontextmanager

# Configure Windows asyncio event loop policy for psycopg async compatibility
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response, Query, Path, Body, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from pydantic import BaseModel, Field, field_validator, ConfigDict

import psycopg
from psycopg_pool import AsyncConnectionPool, PoolTimeout
from psycopg.rows import dict_row

# Load local environment variables from .env if present
_backend_dir = os.path.dirname(os.path.abspath(__file__))
_local_env = os.path.join(_backend_dir, ".env")
if os.path.isfile(_local_env):
    try:
        load_dotenv(_local_env)
    except Exception:
        pass
else:
    _root_env = os.path.join(os.path.dirname(_backend_dir), ".env")
    if os.path.isfile(_root_env):
        try:
            load_dotenv(_root_env)
        except Exception:
            pass

# Setup structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("eventpilot")

# ------------------------------------------------------------------------------
# Environment & Configuration Sanitization
# ------------------------------------------------------------------------------
RAW_DATABASE_URL = os.getenv("DATABASE_URL", "").strip().strip("'\"")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").strip().lower()
IS_PRODUCTION = ENVIRONMENT in ("production", "prod")

RAW_ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "").strip().strip("'\"")
ENABLE_DOCS_VAL = os.getenv("ENABLE_DOCS", "false" if IS_PRODUCTION else "true").strip().lower()
ENABLE_DOCS = ENABLE_DOCS_VAL in ("true", "1", "yes")

ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "").strip()

# Pool & Concurrency Configuration
DB_POOL_MAX = int(os.getenv("DB_POOL_MAX", "10"))
DB_POOL_MIN = int(os.getenv("DB_POOL_MIN", "0"))
DB_POOL_TIMEOUT = float(os.getenv("DB_POOL_TIMEOUT", "5.0"))
DB_POOL_MAX_WAITING = int(os.getenv("DB_POOL_MAX_WAITING", "50"))
MAX_INFLIGHT = int(os.getenv("MAX_INFLIGHT", "60"))

# Rate Limiting Configuration (requests per minute per client IP)
RATE_LIMIT_READS = int(os.getenv("RATE_LIMIT_READS", "120"))
RATE_LIMIT_WRITES = int(os.getenv("RATE_LIMIT_WRITES", "30"))
RATE_LIMIT_BURSTS = int(os.getenv("RATE_LIMIT_BURSTS", "10"))

# Payload Limits
MAX_REQUEST_BODY_BYTES = 1024 * 1024  # 1 MB
MAX_PLAN_SIZE_BYTES = 512 * 1024      # 512 KB
MAX_PLAN_DEPTH = 10


def extract_db_host(raw_url: str) -> str:
    """Extract and return only the database host, never passwords, users, or full URLs."""
    url = raw_url.strip().strip("'\"")
    if not url:
        return "none"
    if url.startswith("memory://"):
        return "memory"
    try:
        parsed = urlsplit(url)
        if parsed.hostname:
            return parsed.hostname
    except Exception:
        pass
    match = re.search(r'\b(?:host|hostname)\s*=\s*([^\s;]+)', url, re.IGNORECASE)
    if match:
        return match.group(1).strip("'\"")
    return "unknown"


def sanitize_db_error_message(exc: Exception) -> str:
    """
    Sanitize exception message to remove database URL, user, and password,
    extracting clean diagnostic descriptions.
    """
    if isinstance(exc, PoolTimeout):
        return "connection timed out"

    raw_msg = str(exc)
    msg_lower = raw_msg.lower()

    if "password authentication failed" in msg_lower:
        return "password authentication failed"
    if "tenant or user not found" in msg_lower:
        return "tenant or user not found"
    if "could not translate host name" in msg_lower:
        return "could not translate host name"
    if "connection timed out" in msg_lower or "timed out" in msg_lower or "timeout" in msg_lower:
        return "connection timed out"
    if "connection refused" in msg_lower:
        return "connection refused"

    # Redact raw DATABASE_URL if present anywhere in the message
    sanitized = raw_msg
    if RAW_DATABASE_URL and RAW_DATABASE_URL in sanitized:
        sanitized = sanitized.replace(RAW_DATABASE_URL, "[REDACTED_URL]")

    # Redact full URLs (e.g., postgresql://user:pass@host:port/dbname)
    sanitized = re.sub(r'[a-zA-Z][a-zA-Z0-9+.-]+://[^\s\'"<>]+', '[REDACTED_URL]', sanitized)

    # Redact connection parameters
    sanitized = re.sub(r'(?:password|pwd)\s*=\s*[^\s,;]+', 'password=[REDACTED]', sanitized, flags=re.IGNORECASE)
    sanitized = re.sub(r'(?:user|username)\s*=\s*[^\s,;]+', 'user=[REDACTED]', sanitized, flags=re.IGNORECASE)

    # Redact user/role mentions
    sanitized = re.sub(r'for user\s+["\']?[^"\'\s,;]+["\']?', 'for user [REDACTED]', sanitized, flags=re.IGNORECASE)
    sanitized = re.sub(r'role\s+["\']?[^"\'\s,;]+["\']?', 'role [REDACTED]', sanitized, flags=re.IGNORECASE)
    sanitized = re.sub(r'user\s+["\']?[^"\'\s,;]+["\']?', 'user [REDACTED]', sanitized, flags=re.IGNORECASE)

    cleaned = " ".join(sanitized.split())
    return cleaned if cleaned else "database connection failed"


def get_allowed_origins() -> List[str]:
    """Parse and validate CORS origins. Prohibits wildcard in production."""
    origins = [orig.strip().strip("'\"") for orig in RAW_ALLOWED_ORIGINS.split(",") if orig.strip()]
    if "*" in origins:
        if IS_PRODUCTION:
            raise RuntimeError("CRITICAL SECURITY ERROR: Wildcard origin '*' is forbidden in production environment.")
        logger.warning("Wildcard CORS origin is enabled in non-production environment.")

    for required in ["http://localhost:3000", "http://localhost:5173"]:
        if required not in origins and not IS_PRODUCTION:
            origins.append(required)
    return origins


def sanitize_conninfo(raw_url: str) -> str:
    """Ensure sslmode=require and set per-connection timeouts."""
    url = raw_url.strip().strip("'\"")
    if not url:
        return ""
    if "sslmode=" not in url:
        separator = "&" if "?" in url else "?"
        url = f"{url}{separator}sslmode=require"

    # Add statement_timeout=5000ms and lock_timeout=5000ms
    if "options=" not in url:
        separator = "&" if "?" in url else "?"
        url = f"{url}{separator}options=-c%20statement_timeout=5000%20-c%20lock_timeout=5000"
    return url


def is_using_transaction_pooler(url: str) -> bool:
    """Detect if port 6543 (Supabase Transaction Pooler) is specified."""
    env_force = os.getenv("DB_USE_TRANSACTION_POOLER", "").lower() in ("true", "1")
    return env_force or ":6543" in url


# ------------------------------------------------------------------------------
# In-Memory Stores: Metrics, Rate Limiting, Idempotency, Scanner Detection
# ------------------------------------------------------------------------------
class MetricsStore:
    def __init__(self):
        self.requests_total: Dict[str, int] = {}
        self.status_total: Dict[str, int] = {}
        self.count_429: int = 0
        self.count_503: int = 0
        self.latencies_ms: List[float] = []
        self.max_latency_samples = 2000

    def record_request(self, route: str, status_code: int, duration_ms: float):
        route_key = f"{route}:{status_code}"
        self.requests_total[route_key] = self.requests_total.get(route_key, 0) + 1
        status_key = str(status_code)
        self.status_total[status_key] = self.status_total.get(status_key, 0) + 1

        if status_code == 429:
            self.count_429 += 1
        elif status_code == 503:
            self.count_503 += 1

        self.latencies_ms.append(duration_ms)
        if len(self.latencies_ms) > self.max_latency_samples:
            self.latencies_ms.pop(0)

    def get_summary(self, in_flight: int, pool_stats: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        sorted_latencies = sorted(self.latencies_ms) if self.latencies_ms else [0.0]
        n = len(sorted_latencies)

        def percentile(p: float) -> float:
            if n == 0:
                return 0.0
            idx = int(math.ceil((p / 100.0) * n)) - 1
            return round(sorted_latencies[max(0, min(idx, n - 1))], 2)

        return {
            "in_flight_requests": in_flight,
            "total_requests": sum(self.status_total.values()),
            "status_codes": dict(self.status_total),
            "routes": dict(self.requests_total),
            "errors": {
                "count_429": self.count_429,
                "count_503": self.count_503,
            },
            "latency_ms": {
                "p50": percentile(50.0),
                "p95": percentile(95.0),
                "p99": percentile(99.0),
                "samples_tracked": n,
            },
            "pool": pool_stats or {"status": "unconfigured"},
        }


metrics = MetricsStore()


class RateLimiter:
    """Sliding-window per-IP rate limiter with abuse and scanner pattern logging."""
    def __init__(self):
        self._history: Dict[str, List[float]] = {}
        self._error_history: Dict[str, List[float]] = {}
        self._warned_ips: Set[str] = set()

    def _clean(self, now: float):
        cutoff = now - 60.0
        for key in list(self._history.keys()):
            self._history[key] = [t for t in self._history[key] if t > cutoff]
            if not self._history[key]:
                del self._history[key]
        for ip in list(self._error_history.keys()):
            self._error_history[ip] = [t for t in self._error_history[ip] if t > cutoff]
            if not self._error_history[ip]:
                del self._error_history[ip]

    def check_limit(self, client_ip: str, category: str, limit: int) -> Optional[int]:
        now = time.time()
        self._clean(now)
        key = f"{client_ip}:{category}"
        timestamps = self._history.get(key, [])

        if len(timestamps) >= limit:
            oldest = timestamps[0]
            retry_after = max(1, int(60.0 - (now - oldest)) + 1)
            if len(timestamps) >= 3 * limit and key not in self._warned_ips:
                logger.warning(
                    "TRAFFIC WARNING: Client IP %s exceeded 3x rate limit on %s (count=%s, limit=%s)",
                    client_ip, category, len(timestamps), limit
                )
                self._warned_ips.add(key)
            return retry_after

        timestamps.append(now)
        self._history[key] = timestamps
        return None

    def record_error(self, client_ip: str, status_code: int):
        if status_code in (404, 422):
            now = time.time()
            errors = self._error_history.get(client_ip, [])
            errors.append(now)
            self._error_history[client_ip] = errors
            if len(errors) >= 15:
                logger.warning(
                    "SECURITY WARNING: Potential scanner/abuse pattern from client IP %s: %s 404/422 errors within 60s",
                    client_ip, len(errors)
                )


rate_limiter = RateLimiter()


class IdempotencyCache:
    """In-memory idempotency cache with TTL for POST /api/events."""
    def __init__(self, ttl_seconds: int = 300):
        self.ttl = ttl_seconds
        self._cache: Dict[str, Dict[str, Any]] = {}

    def get(self, key: str) -> Optional[Dict[str, Any]]:
        now = time.time()
        entry = self._cache.get(key)
        if entry:
            if now > entry["expires_at"]:
                del self._cache[key]
                return None
            return entry
        return None

    def set(self, key: str, status_code: int, body: Any, headers: Dict[str, str]):
        self._cache[key] = {
            "status_code": status_code,
            "body": body,
            "headers": headers,
            "expires_at": time.time() + self.ttl,
        }


idempotency_cache = IdempotencyCache()


# ------------------------------------------------------------------------------
# In-Memory Fallback Store (for unit/contract tests and offline mode)
# ------------------------------------------------------------------------------
class MemoryDBStore:
    def __init__(self):
        self.events: Dict[str, Dict[str, Any]] = {}

    def clear(self):
        self.events.clear()


memory_store = MemoryDBStore()


class MockCursor:
    def __init__(self, store: MemoryDBStore):
        self.store = store
        self._result: Any = None

    async def execute(self, query: str, params: Any = None):
        q = query.strip()
        params = list(params) if params else []

        if "SELECT 1" in q:
            self._result = [{"?column?": 1}]
        elif q.startswith("INSERT INTO public.events"):
            event_id = str(uuid.uuid4())
            name, event_type, event_date, location, guest_count, budget, plan_json = params
            plan_obj = json.loads(plan_json) if plan_json else None
            now_dt = datetime.now(timezone.utc)
            row = {
                "id": UUID(event_id),
                "name": name,
                "event_type": event_type,
                "event_date": event_date,
                "location": location,
                "guest_count": guest_count,
                "budget": float(budget) if budget is not None else None,
                "plan": plan_obj,
                "created_at": now_dt,
            }
            self.store.events[event_id] = row
            self._result = [row]
        elif q.startswith("SELECT") and "FROM public.events" in q and "WHERE id = %s" in q:
            event_id = str(params[0])
            row = self.store.events.get(event_id)
            self._result = [dict(row)] if row else []
        elif q.startswith("SELECT") and "FROM public.events" in q:
            rows = [dict(r) for r in self.store.events.values()]
            if "WHERE event_type = %s" in q:
                etype = params[0]
                rows = [r for r in rows if r["event_type"] == etype]
                limit = params[1] if len(params) > 1 else 50
                offset = params[2] if len(params) > 2 else 0
            else:
                limit = params[0] if len(params) > 0 else 50
                offset = params[1] if len(params) > 1 else 0
            rows.sort(key=lambda r: r["created_at"], reverse=True)
            self._result = rows[offset : offset + limit]
        elif q.startswith("UPDATE public.events") and "SET plan = coalesce(plan" in q:
            plan_json, event_id = params
            event_id = str(event_id)
            row = self.store.events.get(event_id)
            if row:
                incoming_plan = json.loads(plan_json)
                curr_plan = row.get("plan") or {}
                if isinstance(curr_plan, str):
                    curr_plan = json.loads(curr_plan)
                curr_plan.update(incoming_plan)
                row["plan"] = curr_plan
                self._result = [{"plan": curr_plan}]
            else:
                self._result = []
        elif q.startswith("UPDATE public.events"):
            event_id = str(params[-1])
            row = self.store.events.get(event_id)
            if not row:
                self._result = []
            else:
                set_part = q.split("SET ")[1].split(" WHERE")[0]
                clauses = [c.strip() for c in set_part.split(",")]
                for i, c in enumerate(clauses):
                    field = c.split(" =")[0].strip()
                    val = params[i]
                    if field == "plan":
                        row["plan"] = json.loads(val) if isinstance(val, str) else val
                    elif field == "budget":
                        row["budget"] = float(val) if val is not None else None
                    else:
                        row[field] = val
                self._result = [dict(row)]
        elif q.startswith("DELETE FROM public.events"):
            event_id = str(params[0])
            if event_id in self.store.events:
                del self.store.events[event_id]
                self._result = [{"id": UUID(event_id)}]
            else:
                self._result = []
        else:
            self._result = []

    async def fetchone(self):
        if self._result and len(self._result) > 0:
            return self._result[0]
        return None

    async def fetchall(self):
        return self._result or []

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass


class MockConnection:
    def __init__(self, store: MemoryDBStore):
        self.store = store

    def cursor(self):
        return MockCursor(self.store)

    async def commit(self):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass


class MockPool:
    def __init__(self, store: MemoryDBStore):
        self.store = store
        self.is_open = True

    def connection(self, timeout: float = 5.0):
        return MockConnection(self.store)

    async def open(self, wait: bool = False):
        self.is_open = True

    async def close(self):
        self.is_open = False

    def get_stats(self):
        return {
            "type": "in-memory-mock",
            "events_stored": len(self.store.events),
            "max_size": 10,
            "waiting": 0,
        }


# ------------------------------------------------------------------------------
# Rule-Based Planning Engine
# ------------------------------------------------------------------------------
EventType = Literal["wedding", "birthday", "community"]

BUDGET_PERCENTAGES: Dict[EventType, Dict[str, float]] = {
    "wedding": {
        "Venue": 30.0,
        "Catering": 30.0,
        "Decor": 12.0,
        "Photography": 8.0,
        "Attire": 8.0,
        "Entertainment": 5.0,
        "Invitations": 2.0,
        "Contingency": 5.0,
    },
    "birthday": {
        "Venue": 25.0,
        "Catering": 35.0,
        "Decor": 12.0,
        "Cake & Desserts": 8.0,
        "Entertainment": 10.0,
        "Return Gifts": 5.0,
        "Contingency": 5.0,
    },
    "community": {
        "Venue": 20.0,
        "Catering": 25.0,
        "Stage & Sound": 15.0,
        "Decor & Signage": 10.0,
        "Marketing": 8.0,
        "Volunteers & Logistics": 10.0,
        "Safety & Permits": 5.0,
        "Contingency": 7.0,
    },
}

CHECKLIST_TEMPLATES: Dict[EventType, List[Dict[str, Any]]] = {
    "wedding": [
        {
            "phase": "3 months before",
            "tasks": [
                {"id": "wed-3m-1", "task": "Book main venue and confirm ceremony & reception areas", "done": False},
                {"id": "wed-3m-2", "task": "Hire caterer and schedule menu tasting session", "done": False},
                {"id": "wed-3m-3", "task": "Reserve wedding photographer and videographer team", "done": False},
                {"id": "wed-3m-4", "task": "Select bridal & groom attire and schedule first fittings", "done": False},
                {"id": "wed-3m-5", "task": "Choose theme, floral design, and overall color palette", "done": False},
            ],
        },
        {
            "phase": "1 month before",
            "tasks": [
                {"id": "wed-1m-1", "task": "Send formal wedding invitations and track RSVPs", "done": False},
                {"id": "wed-1m-2", "task": "Finalize ceremony vows, script, and officiant schedule", "done": False},
                {"id": "wed-1m-3", "task": "Confirm playlist and entry songs with DJ or band", "done": False},
                {"id": "wed-1m-4", "task": "Conduct final dress and suit alterations", "done": False},
                {"id": "wed-1m-5", "task": "Order wedding favors, guest book, and place cards", "done": False},
            ],
        },
        {
            "phase": "Week of",
            "tasks": [
                {"id": "wed-wk-1", "task": "Confirm final guest headcount and table seating with venue", "done": False},
                {"id": "wed-wk-2", "task": "Pick up wedding rings and cleaned/steamed attire", "done": False},
                {"id": "wed-wk-3", "task": "Rehearse ceremony schedule with bridal party and family leads", "done": False},
                {"id": "wed-wk-4", "task": "Assemble emergency day kit (safety pins, medical, touch-up kit)", "done": False},
                {"id": "wed-wk-5", "task": "Distribute vendor contacts and timeline to day-of coordinator", "done": False},
            ],
        },
    ],
    "birthday": [
        {
            "phase": "3 months before",
            "tasks": [
                {"id": "bday-3m-1", "task": "Decide celebration theme and outline initial guest wish list", "done": False},
                {"id": "bday-3m-2", "task": "Book event hall, party room, or outdoor pavilion", "done": False},
                {"id": "bday-3m-3", "task": "Hire children's entertainer, magician, or DJ", "done": False},
                {"id": "bday-3m-4", "task": "Shortlist custom cake designer and sample flavors", "done": False},
            ],
        },
        {
            "phase": "1 month before",
            "tasks": [
                {"id": "bday-1m-1", "task": "Send digital or printed invitations and track headcount", "done": False},
                {"id": "bday-1m-2", "task": "Order theme decorations, backdrops, balloons, and tableware", "done": False},
                {"id": "bday-1m-3", "task": "Finalize food menu, appetizers, and beverage options", "done": False},
                {"id": "bday-1m-4", "task": "Purchase party favors and return gifts for guests", "done": False},
            ],
        },
        {
            "phase": "Week of",
            "tasks": [
                {"id": "bday-wk-1", "task": "Confirm final guest headcount with caterer and venue", "done": False},
                {"id": "bday-wk-2", "task": "Confirm cake pickup or delivery schedule and candle supplies", "done": False},
                {"id": "bday-wk-3", "task": "Prepare music playlist, party games, and activity prizes", "done": False},
                {"id": "bday-wk-4", "task": "Pack decoration boxes, gift bags, and test Bluetooth sound system", "done": False},
            ],
        },
    ],
    "community": [
        {
            "phase": "3 months before",
            "tasks": [
                {"id": "comm-3m-1", "task": "Secure municipal venue permits and park authorization", "done": False},
                {"id": "comm-3m-2", "task": "Form event committee and appoint logistics and safety leads", "done": False},
                {"id": "comm-3m-3", "task": "Draft public safety plan and coordinate first aid support", "done": False},
                {"id": "comm-3m-4", "task": "Book stage, PA sound system, and electrical generator", "done": False},
                {"id": "comm-3m-5", "task": "Announce event date and invite local community sponsors", "done": False},
            ],
        },
        {
            "phase": "1 month before",
            "tasks": [
                {"id": "comm-1m-1", "task": "Distribute promotional flyers, banners, and social announcements", "done": False},
                {"id": "comm-1m-2", "task": "Hold volunteer briefing and assign zone shift schedules", "done": False},
                {"id": "comm-1m-3", "task": "Confirm food vendor booths and sanitary guidelines", "done": False},
                {"id": "comm-1m-4", "task": "Finalize stage performance schedule and community speaker order", "done": False},
                {"id": "comm-1m-5", "task": "Arrange recycling bins, waste containers, and portable restrooms", "done": False},
            ],
        },
        {
            "phase": "Week of",
            "tasks": [
                {"id": "comm-wk-1", "task": "Conduct site inspection for accessibility, shade, and power outlets", "done": False},
                {"id": "comm-wk-2", "task": "Test microphones, sound levels, and backup emergency power", "done": False},
                {"id": "comm-wk-3", "task": "Print signage, volunteer ID tags, and schedules", "done": False},
                {"id": "comm-wk-4", "task": "Equip volunteer leads with high-visibility vests and walkie-talkies", "done": False},
                {"id": "comm-wk-5", "task": "Confirm post-event neighborhood cleanup and trash disposal plan", "done": False},
            ],
        },
    ],
}


def calculate_budget_breakdown(event_type: EventType, total_budget: float) -> List[Dict[str, Any]]:
    percentages = BUDGET_PERCENTAGES[event_type]
    breakdown: List[Dict[str, Any]] = []

    for category, pct in percentages.items():
        amount = round(total_budget * (pct / 100.0), 2)
        breakdown.append({
            "category": category,
            "percentage": pct,
            "amount": amount
        })

    current_sum = round(sum(item["amount"] for item in breakdown), 2)
    drift = round(total_budget - current_sum, 2)
    if drift != 0.0 and breakdown:
        largest_idx = max(range(len(breakdown)), key=lambda i: breakdown[i]["percentage"])
        breakdown[largest_idx]["amount"] = round(breakdown[largest_idx]["amount"] + drift, 2)

    return breakdown


def generate_plan_rules(
    event_type: EventType,
    budget: Optional[float] = None,
    guest_count: Optional[int] = None,
    event_date: Optional[Union[date, str]] = None
) -> Dict[str, Any]:
    total_budget = round(float(budget), 2) if budget is not None else 0.0
    guest_cnt = int(guest_count) if guest_count is not None else 0

    if guest_cnt > 0 and total_budget > 0:
        per_guest_cost = round(total_budget / guest_cnt, 2)
    else:
        per_guest_cost = 0.0

    breakdown = calculate_budget_breakdown(event_type, total_budget)

    raw_checklist = CHECKLIST_TEMPLATES.get(event_type, [])
    checklist = [
        {
            "phase": phase_data["phase"],
            "tasks": [dict(t) for t in phase_data["tasks"]]
        }
        for phase_data in raw_checklist
    ]

    warnings: List[str] = []

    parsed_date = event_date
    if isinstance(parsed_date, str):
        try:
            parsed_date = date.fromisoformat(parsed_date)
        except Exception:
            parsed_date = None

    days_until_event = None
    if parsed_date is not None:
        days_until_event = (parsed_date - date.today()).days
        if days_until_event < 0:
            warnings.append("Event date is in the past: please verify the scheduled event date.")
        elif days_until_event < 30:
            warnings.append("Short timeline: prioritize venue, catering and invitations first.")

    if guest_cnt > 0:
        if event_type == "wedding" and (per_guest_cost < 1500.0 or total_budget == 0.0):
            warnings.append("Low per-guest budget: weddings typically require at least ₹1,500 per guest for venue, food, and decor.")
        elif event_type == "birthday" and (per_guest_cost < 500.0 or total_budget == 0.0):
            warnings.append("Low per-guest budget: birthday celebrations typically require at least ₹500 per guest.")
        elif event_type == "community" and (per_guest_cost < 150.0 or total_budget == 0.0):
            warnings.append("Low per-guest budget: community events typically require at least ₹150 per guest.")
    elif total_budget > 0:
        warnings.append("Guest count is zero: plan assumes venue and basic fixed overhead costs only.")

    if (guest_cnt >= 500 and total_budget < 100000.0) or (guest_cnt >= 200 and per_guest_cost < 200.0 and guest_cnt > 0):
        warnings.append("High guest count with a constrained budget: risk of cost overruns on catering and venue capacity.")

    plan_result: Dict[str, Any] = {
        "event_type": event_type,
        "total_budget": total_budget,
        "guest_count": guest_cnt,
        "per_guest_cost": per_guest_cost,
        "budget_breakdown": breakdown,
        "checklist": checklist,
        "warnings": warnings,
        "generated_by": "rule-based-v1",
    }

    if parsed_date is not None:
        plan_result["days_until_event"] = days_until_event

    return plan_result


# ------------------------------------------------------------------------------
# Plan Size and Nesting Depth Validation
# ------------------------------------------------------------------------------
def get_dict_depth(obj: Any, current_depth: int = 1) -> int:
    if current_depth > MAX_PLAN_DEPTH:
        return current_depth
    if isinstance(obj, dict):
        if not obj:
            return current_depth
        return max(get_dict_depth(v, current_depth + 1) for v in obj.values())
    elif isinstance(obj, list):
        if not obj:
            return current_depth
        return max(get_dict_depth(item, current_depth + 1) for item in obj)
    return current_depth


def validate_plan_limits(plan: Optional[Dict[str, Any]]) -> None:
    if plan is None:
        return
    try:
        serialized = json.dumps(plan)
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Plan could not be serialized to JSON: {str(exc)}"
        )
    size_bytes = len(serialized.encode("utf-8"))
    if size_bytes > MAX_PLAN_SIZE_BYTES:
        raise HTTPException(
            status_code=422,
            detail=f"Plan payload size ({size_bytes} bytes) exceeds maximum limit of 512 KB"
        )
    depth = get_dict_depth(plan)
    if depth > MAX_PLAN_DEPTH:
        raise HTTPException(
            status_code=422,
            detail=f"Plan payload nesting depth ({depth}) exceeds maximum limit of {MAX_PLAN_DEPTH}"
        )


def compute_row_etag(row: Dict[str, Any]) -> str:
    raw = {
        "id": str(row.get("id", "")),
        "name": row.get("name", ""),
        "event_type": row.get("event_type", ""),
        "event_date": str(row.get("event_date", "")),
        "location": row.get("location", ""),
        "guest_count": row.get("guest_count"),
        "budget": float(row["budget"]) if row.get("budget") is not None else None,
        "plan": row.get("plan"),
    }
    encoded = json.dumps(raw, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


# ------------------------------------------------------------------------------
# Pydantic Schemas (v2) - Strict Validation & extra="forbid"
# ------------------------------------------------------------------------------
class EventCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(..., min_length=1, max_length=120, description="Name of the event")
    event_type: EventType = Field(..., description="Type of event: wedding, birthday, or community")
    event_date: Optional[date] = Field(None, description="Scheduled date of the event")
    location: Optional[str] = Field(None, max_length=200, description="Event location or venue name")
    guest_count: Optional[int] = Field(None, ge=0, le=100000, description="Expected guest count")
    budget: Optional[float] = Field(None, ge=0, le=100000000, description="Total budget in INR")
    plan: Optional[Dict[str, Any]] = Field(None, description="Optional plan object")


class EventUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: Optional[str] = Field(None, min_length=1, max_length=120, description="Name of the event")
    event_type: Optional[EventType] = Field(None, description="Type of event: wedding, birthday, or community")
    event_date: Optional[date] = Field(None, description="Scheduled date of the event")
    location: Optional[str] = Field(None, max_length=200, description="Event location or venue name")
    guest_count: Optional[int] = Field(None, ge=0, le=100000, description="Expected guest count")
    budget: Optional[float] = Field(None, ge=0, le=100000000, description="Total budget in INR")
    plan: Optional[Dict[str, Any]] = Field(None, description="Plan object to merge into existing plan")


class EventResponse(BaseModel):
    id: UUID
    name: str
    event_type: str
    event_date: Optional[date] = None
    location: Optional[str] = None
    guest_count: Optional[int] = None
    budget: Optional[float] = None
    plan: Optional[Dict[str, Any]] = None
    created_at: datetime

    @field_validator("budget", mode="before")
    @classmethod
    def parse_budget(cls, v):
        if v is not None:
            try:
                return float(v)
            except (ValueError, TypeError):
                return None
        return None

    @field_validator("plan", mode="before")
    @classmethod
    def parse_plan(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return v
        return v


class PlanGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    event_type: EventType = Field(..., description="Type of event")
    budget: float = Field(..., ge=0, le=100000000, description="Total budget in INR")
    guest_count: int = Field(..., ge=0, le=100000, description="Estimated number of guests")
    event_date: Optional[date] = Field(None, description="Scheduled date of the event")
    event_id: Optional[UUID] = Field(None, description="Optional UUID of existing event to save plan into")


# ------------------------------------------------------------------------------
# Database Pool & Lifespan Handler
# ------------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.pool = None
    app.state.is_mock_db = False

    # Log database HOST only, once at startup. Never log DATABASE_URL.
    db_host = extract_db_host(RAW_DATABASE_URL)
    logger.info("Database host: %s", db_host)

    if os.getenv("TEST_MODE") == "true" or RAW_DATABASE_URL.startswith("memory://"):
        app.state.pool = MockPool(memory_store)
        app.state.is_mock_db = True
        logger.info("Operating in-memory database test mode")
    elif RAW_DATABASE_URL and "<pooler-host>" not in RAW_DATABASE_URL:
        try:
            conninfo = sanitize_conninfo(RAW_DATABASE_URL)
            use_txn_pooler = is_using_transaction_pooler(RAW_DATABASE_URL)

            conn_kwargs: Dict[str, Any] = {
                "row_factory": dict_row,
                "connect_timeout": 5,
            }
            if use_txn_pooler:
                conn_kwargs["prepare_threshold"] = None
                logger.info("Supabase Transaction Pooler mode active: prepare_threshold=None")

            pool = AsyncConnectionPool(
                conninfo=conninfo,
                min_size=DB_POOL_MIN,
                max_size=DB_POOL_MAX,
                timeout=DB_POOL_TIMEOUT,
                max_waiting=DB_POOL_MAX_WAITING,
                open=False,
                kwargs=conn_kwargs,
            )
            await pool.open(wait=False)
            app.state.pool = pool
            logger.info("Database connection pool initialized (max_size=%s)", DB_POOL_MAX)
        except Exception as exc:
            exc_class = type(exc).__name__
            sanitized_msg = sanitize_db_error_message(exc)
            logger.warning("Could not initialize connection pool [%s]: %s", exc_class, sanitized_msg)
            app.state.pool = None
    else:
        logger.warning("DATABASE_URL not set or placeholder; starting in database-degraded mode")

    yield

    pool = getattr(app.state, "pool", None)
    if pool is not None:
        try:
            await pool.close()
            logger.info("Database connection pool cleanly closed on shutdown")
        except Exception as exc:
            exc_class = type(exc).__name__
            sanitized_msg = sanitize_db_error_message(exc)
            logger.error("Error during pool shutdown [%s]: %s", exc_class, sanitized_msg)


# ------------------------------------------------------------------------------
# FastAPI Application Setup
# ------------------------------------------------------------------------------
app = FastAPI(
    title="EventPilot AI API",
    description="Production-style backend for EventPilot AI: event management & rule-based budget and checklist planning engine.",
    version="1.0.0",
    docs_url="/docs" if ENABLE_DOCS else None,
    redoc_url="/redoc" if ENABLE_DOCS else None,
    openapi_url="/openapi.json" if ENABLE_DOCS else None,
    lifespan=lifespan,
)


# ------------------------------------------------------------------------------
# Middlewares: Request ID, Concurrency Limiter, Request Size, Rate Limit, Security Headers
# ------------------------------------------------------------------------------
_semaphores: Dict[Any, asyncio.Semaphore] = {}

def get_concurrency_semaphore() -> asyncio.Semaphore:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.Semaphore(MAX_INFLIGHT)
    sem = _semaphores.get(loop)
    if sem is None:
        sem = asyncio.Semaphore(MAX_INFLIGHT)
        _semaphores[loop] = sem
    return sem
in_flight_count = 0


def get_client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    x_real_ip = request.headers.get("x-real-ip")
    if x_real_ip:
        return x_real_ip.strip()
    return request.client.host if request.client else "unknown"


@app.middleware("http")
async def root_security_and_traffic_middleware(request: Request, call_next):
    global in_flight_count

    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    request.state.request_id = request_id
    start_time = time.time()
    client_ip = get_client_ip(request)

    # 1. Reject request bodies exceeding 1 MB with 413
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_REQUEST_BODY_BYTES:
                return JSONResponse(
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                    content={"error": "Request body exceeds maximum size of 1 MB", "request_id": request_id},
                    headers={"X-Request-Id": request_id}
                )
        except ValueError:
            pass

    # 2. Liveness check bypass (/livez)
    if request.url.path == "/livez":
        response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        return response

    # 3. Global Concurrency Limiting (Load Shedding via 503 + Retry-After)
    acquired = False
    sem = get_concurrency_semaphore()
    try:
        try:
            await asyncio.wait_for(sem.acquire(), timeout=0.01)
            acquired = True
            in_flight_count += 1
        except (asyncio.TimeoutError, Exception):
            metrics.record_request(request.url.path, 503, (time.time() - start_time) * 1000)
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={"error": "Server busy, retry shortly", "request_id": request_id},
                headers={"Retry-After": "2", "X-Request-Id": request_id}
            )

        # 4. Per-IP Rate Limiting (429 + Retry-After)
        method = request.method.upper()
        path = request.url.path

        if path in ("/api/events", "/api/generate-plan") and method == "POST":
            category = "burst"
            limit = RATE_LIMIT_BURSTS
        elif method in ("POST", "PATCH", "DELETE"):
            category = "write"
            limit = RATE_LIMIT_WRITES
        else:
            category = "read"
            limit = RATE_LIMIT_READS

        retry_after = rate_limiter.check_limit(client_ip, category, limit)
        if retry_after is not None:
            metrics.record_request(path, 429, (time.time() - start_time) * 1000)
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"error": "Too many requests, please slow down", "request_id": request_id},
                headers={"Retry-After": str(retry_after), "X-Request-Id": request_id}
            )

        # 5. Execute Request
        response = await call_next(request)

    finally:
        if acquired:
            sem.release()
            in_flight_count = max(0, in_flight_count - 1)

    duration_ms = (time.time() - start_time) * 1000

    # 6. Add Security Headers
    response.headers["X-Request-Id"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

    if request.url.path.startswith("/api/") or "application/json" in response.headers.get("content-type", ""):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"

    # 7. Record metrics & check scanner patterns
    rate_limiter.record_error(client_ip, response.status_code)
    metrics.record_request(request.url.path, response.status_code, duration_ms)

    # 8. Structured JSON Request Logging
    log_entry = {
        "request_id": request_id,
        "method": request.method,
        "path": request.url.path,
        "status": response.status_code,
        "duration_ms": round(duration_ms, 2),
        "client_ip": client_ip,
        "origin": request.headers.get("origin", ""),
        "user_agent": request.headers.get("user-agent", "")[:100],
    }
    logger.info(json.dumps(log_entry))

    return response


# CORS Middleware Setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=["*"],
)


# ------------------------------------------------------------------------------
# Unified Exception Handlers
# ------------------------------------------------------------------------------
@app.exception_handler(HTTPException)
async def custom_http_exception_handler(request: Request, exc: HTTPException):
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
    headers = dict(exc.headers or {})
    headers["X-Request-Id"] = request_id
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail, "request_id": request_id},
        headers=headers,
    )


@app.exception_handler(StarletteHTTPException)
async def starlette_http_exception_handler(request: Request, exc: StarletteHTTPException):
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
    headers = dict(exc.headers or {})
    headers["X-Request-Id"] = request_id
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": str(exc.detail), "request_id": request_id},
        headers=headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
    errors = []
    for err in exc.errors():
        loc = " -> ".join(str(item) for item in err.get("loc", []))
        errors.append(f"{loc}: {err.get('msg', 'Invalid input')}")
    return JSONResponse(
        status_code=422,
        content={
            "error": "Input validation failed",
            "details": errors,
            "request_id": request_id,
        },
        headers={"X-Request-Id": request_id},
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
    logger.error("Unhandled server exception [%s]: %s", request_id, type(exc).__name__)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"error": "An internal server error occurred.", "request_id": request_id},
        headers={"X-Request-Id": request_id},
    )


# ------------------------------------------------------------------------------
# Database Pool Access Helper
# ------------------------------------------------------------------------------
async def get_db_pool(request: Request) -> AsyncConnectionPool:
    pool: Optional[AsyncConnectionPool] = getattr(request.app.state, "pool", None)
    if pool is None:
        logger.warning("Database connection failed [ConnectionError]: database pool uninitialized")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable"
        )
    return pool


# ------------------------------------------------------------------------------
# System & Observability Endpoints
# ------------------------------------------------------------------------------
@app.get("/livez", summary="Liveness Probe")
async def livez():
    return {"status": "ok", "live": True}


@app.get("/health", summary="Readiness & Health Check")
async def health(request: Request):
    pool: Optional[AsyncConnectionPool] = getattr(request.app.state, "pool", None)
    if pool is None:
        logger.warning("Database connection failed [ConnectionError]: database pool uninitialized")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "degraded", "database": "unreachable"}
        )

    try:
        async with pool.connection(timeout=3.0) as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT 1;")
                await cur.fetchone()
        return {"status": "ok", "database": "connected"}
    except Exception as exc:
        exc_class = type(exc).__name__
        sanitized_msg = sanitize_db_error_message(exc)
        logger.warning("Database health check ping failed [%s]: %s", exc_class, sanitized_msg)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "degraded", "database": "unreachable"}
        )


@app.get("/internal/metrics", summary="Internal Observability Metrics")
async def get_internal_metrics(request: Request):
    if not ADMIN_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Metrics endpoint is disabled"
        )

    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing admin token"
        )

    token = auth_header.replace("Bearer ", "").strip()
    if token != ADMIN_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: invalid admin token"
        )

    pool = getattr(request.app.state, "pool", None)
    pool_stats = None
    if pool is not None and hasattr(pool, "get_stats"):
        try:
            pool_stats = pool.get_stats()
        except Exception:
            pass

    return metrics.get_summary(in_flight=in_flight_count, pool_stats=pool_stats)


@app.post("/internal/test-db-outage", summary="Simulate DB outage for load & SRE testing")
async def test_db_outage(request: Request, broken: bool = Query(True)):
    if broken:
        request.app.state._saved_pool = getattr(request.app.state, "pool", None)
        request.app.state.pool = None
        return {"simulated_outage": True}
    else:
        saved = getattr(request.app.state, "_saved_pool", None)
        if saved:
            request.app.state.pool = saved
        return {"simulated_outage": False}


# ------------------------------------------------------------------------------
# Core API Endpoints
# ------------------------------------------------------------------------------
@app.api_route("/", methods=["GET", "HEAD"], summary="Root Endpoint")
async def root():
    return {
        "message": "Welcome to EventPilot AI API",
        "docs": "/docs" if ENABLE_DOCS else "Documentation disabled in production",
        "version": "1.0.0"
    }


@app.post(
    "/api/events",
    response_model=EventResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Event"
)
async def create_event(event: EventCreate, request: Request, response: Response):
    idempotency_key = request.headers.get("idempotency-key")
    if idempotency_key:
        cached = idempotency_cache.get(idempotency_key)
        if cached:
            response.headers["Idempotent-Replayed"] = "true"
            for k, v in cached["headers"].items():
                response.headers[k] = v
            response.status_code = cached["status_code"]
            return cached["body"]

    validate_plan_limits(event.plan)
    pool = await get_db_pool(request)

    generated_plan = event.plan
    if generated_plan is None and (event.event_date is not None or event.budget is not None or event.guest_count is not None):
        generated_plan = generate_plan_rules(
            event_type=event.event_type,
            budget=event.budget,
            guest_count=event.guest_count,
            event_date=event.event_date
        )

    plan_json = json.dumps(generated_plan) if generated_plan else None

    query = """
        INSERT INTO public.events (name, event_type, event_date, location, guest_count, budget, plan)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING id, name, event_type, event_date, location, guest_count, budget, plan, created_at;
    """

    try:
        async with pool.connection(timeout=DB_POOL_TIMEOUT) as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    query,
                    (
                        event.name,
                        event.event_type,
                        event.event_date,
                        event.location,
                        event.guest_count,
                        event.budget,
                        plan_json
                    )
                )
                row = await cur.fetchone()
                if hasattr(conn, "commit"):
                    await conn.commit()
    except PoolTimeout as exc:
        exc_class = type(exc).__name__
        sanitized_msg = sanitize_db_error_message(exc)
        logger.warning("Database connection pool timeout [%s]: %s", exc_class, sanitized_msg)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Server busy, retry shortly",
            headers={"Retry-After": "2"}
        )
    except Exception as exc:
        exc_class = type(exc).__name__
        sanitized_msg = sanitize_db_error_message(exc)
        logger.error("Error creating event [%s]: %s", exc_class, sanitized_msg)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable"
        )

    if not row:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save event"
        )

    etag = compute_row_etag(row)
    response.headers["ETag"] = f'"{etag}"'

    if idempotency_key:
        idempotency_cache.set(
            idempotency_key,
            status_code=201,
            body=EventResponse(**row).model_dump(mode="json"),
            headers={"ETag": f'"{etag}"'}
        )

    return row


@app.get(
    "/api/events",
    response_model=List[EventResponse],
    summary="List Events"
)
async def list_events(
    request: Request,
    limit: int = Query(50, ge=1, le=200, description="Maximum number of items to return"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
    event_type: Optional[EventType] = Query(None, description="Optional filter by event type")
):
    pool = await get_db_pool(request)

    query_parts = [
        "SELECT id, name, event_type, event_date, location, guest_count, budget, plan, created_at",
        "FROM public.events"
    ]
    params: List[Any] = []

    if event_type:
        query_parts.append("WHERE event_type = %s")
        params.append(event_type)

    query_parts.append("ORDER BY created_at DESC LIMIT %s OFFSET %s;")
    params.extend([limit, offset])
    full_query = " ".join(query_parts)

    try:
        async with pool.connection(timeout=DB_POOL_TIMEOUT) as conn:
            async with conn.cursor() as cur:
                await cur.execute(full_query, params)
                rows = await cur.fetchall()
                return rows
    except PoolTimeout as exc:
        exc_class = type(exc).__name__
        sanitized_msg = sanitize_db_error_message(exc)
        logger.warning("Database connection pool timeout [%s]: %s", exc_class, sanitized_msg)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Server busy, retry shortly",
            headers={"Retry-After": "2"}
        )
    except Exception as exc:
        exc_class = type(exc).__name__
        sanitized_msg = sanitize_db_error_message(exc)
        logger.error("Error listing events [%s]: %s", exc_class, sanitized_msg)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable"
        )


@app.get(
    "/api/events/{event_id}",
    response_model=EventResponse,
    summary="Get Single Event"
)
async def get_event(
    request: Request,
    response: Response,
    event_id: UUID = Path(..., description="The unique UUID of the event")
):
    pool = await get_db_pool(request)

    query = """
        SELECT id, name, event_type, event_date, location, guest_count, budget, plan, created_at
        FROM public.events
        WHERE id = %s;
    """

    try:
        async with pool.connection(timeout=DB_POOL_TIMEOUT) as conn:
            async with conn.cursor() as cur:
                await cur.execute(query, (str(event_id),))
                row = await cur.fetchone()
    except PoolTimeout as exc:
        exc_class = type(exc).__name__
        sanitized_msg = sanitize_db_error_message(exc)
        logger.warning("Database connection pool timeout [%s]: %s", exc_class, sanitized_msg)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Server busy, retry shortly",
            headers={"Retry-After": "2"}
        )
    except Exception as exc:
        exc_class = type(exc).__name__
        sanitized_msg = sanitize_db_error_message(exc)
        logger.error("Error retrieving event [%s]: %s", exc_class, sanitized_msg)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable"
        )

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    etag = compute_row_etag(row)
    response.headers["ETag"] = f'"{etag}"'
    return row


ALLOWED_UPDATE_FIELDS = {
    "name",
    "event_type",
    "event_date",
    "location",
    "guest_count",
    "budget",
    "plan"
}


@app.patch(
    "/api/events/{event_id}",
    response_model=EventResponse,
    summary="Update Event"
)
async def update_event(
    request: Request,
    response: Response,
    event_id: UUID = Path(..., description="The unique UUID of the event to update"),
    payload: EventUpdate = Body(...)
):
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=422,
            detail="At least one field must be provided for update"
        )

    if "plan" in update_data:
        validate_plan_limits(update_data["plan"])

    pool = await get_db_pool(request)

    fetch_query = """
        SELECT id, name, event_type, event_date, location, guest_count, budget, plan, created_at
        FROM public.events
        WHERE id = %s;
    """
    try:
        async with pool.connection(timeout=DB_POOL_TIMEOUT) as conn:
            async with conn.cursor() as cur:
                await cur.execute(fetch_query, (str(event_id),))
                current = await cur.fetchone()
    except PoolTimeout as exc:
        exc_class = type(exc).__name__
        sanitized_msg = sanitize_db_error_message(exc)
        logger.warning("Database connection pool timeout [%s]: %s", exc_class, sanitized_msg)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Server busy, retry shortly",
            headers={"Retry-After": "2"}
        )
    except Exception as exc:
        exc_class = type(exc).__name__
        sanitized_msg = sanitize_db_error_message(exc)
        logger.error("Error fetching event for update [%s]: %s", exc_class, sanitized_msg)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable"
        )

    if not current:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    current_etag = compute_row_etag(current)
    if_match = request.headers.get("if-match")
    if if_match:
        client_etag = if_match.strip().strip('"')
        if client_etag != current_etag:
            raise HTTPException(
                status_code=status.HTTP_412_PRECONDITION_FAILED,
                detail="Resource has been modified (precondition failed)",
                headers={"ETag": f'"{current_etag}"'}
            )

    eff_event_type = update_data.get("event_type", current["event_type"])
    eff_event_date = update_data["event_date"] if "event_date" in update_data else current["event_date"]
    eff_budget = update_data["budget"] if "budget" in update_data else current["budget"]
    eff_guest_count = update_data["guest_count"] if "guest_count" in update_data else current["guest_count"]

    current_plan = current["plan"]
    if isinstance(current_plan, str):
        try:
            current_plan = json.loads(current_plan)
        except Exception:
            current_plan = {}
    elif current_plan is None:
        current_plan = {}

    plan_relevant_fields = {"event_type", "event_date", "budget", "guest_count"}
    has_plan_field_update = any(f in update_data for f in plan_relevant_fields)

    if has_plan_field_update:
        rule_plan = generate_plan_rules(
            event_type=eff_event_type,
            budget=eff_budget,
            guest_count=eff_guest_count,
            event_date=eff_event_date
        )
        if eff_event_date is None:
            current_plan.pop("days_until_event", None)
        current_plan.update(rule_plan)

    if "plan" in update_data and update_data["plan"] is not None:
        incoming_plan = update_data["plan"]
        if "workspace" in incoming_plan and "workspace" in current_plan:
            if isinstance(current_plan["workspace"], dict) and isinstance(incoming_plan["workspace"], dict):
                current_plan["workspace"].update(incoming_plan["workspace"])
            else:
                current_plan["workspace"] = incoming_plan["workspace"]
            for k, v in incoming_plan.items():
                if k != "workspace":
                    current_plan[k] = v
        else:
            current_plan.update(incoming_plan)

    set_clauses: List[str] = []
    params: List[Any] = []

    for field_name, value in update_data.items():
        if field_name not in ALLOWED_UPDATE_FIELDS or field_name == "plan":
            continue
        set_clauses.append(f"{field_name} = %s")
        params.append(value)

    if has_plan_field_update or ("plan" in update_data):
        set_clauses.append("plan = %s::jsonb")
        params.append(json.dumps(current_plan))

    if not set_clauses:
        raise HTTPException(
            status_code=422,
            detail="At least one valid field must be provided for update"
        )

    params.append(str(event_id))
    query = f"""
        UPDATE public.events
        SET {", ".join(set_clauses)}
        WHERE id = %s
        RETURNING id, name, event_type, event_date, location, guest_count, budget, plan, created_at;
    """

    try:
        async with pool.connection(timeout=DB_POOL_TIMEOUT) as conn:
            async with conn.cursor() as cur:
                await cur.execute(query, params)
                row = await cur.fetchone()
                if hasattr(conn, "commit"):
                    await conn.commit()
    except PoolTimeout as exc:
        exc_class = type(exc).__name__
        sanitized_msg = sanitize_db_error_message(exc)
        logger.warning("Database connection pool timeout [%s]: %s", exc_class, sanitized_msg)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Server busy, retry shortly",
            headers={"Retry-After": "2"}
        )
    except Exception as exc:
        exc_class = type(exc).__name__
        sanitized_msg = sanitize_db_error_message(exc)
        logger.error("Error updating event [%s]: %s", exc_class, sanitized_msg)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable"
        )

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    new_etag = compute_row_etag(row)
    response.headers["ETag"] = f'"{new_etag}"'
    return row


@app.delete(
    "/api/events/{event_id}",
    summary="Delete Event"
)
async def delete_event(
    request: Request,
    event_id: UUID = Path(..., description="The unique UUID of the event to delete")
):
    pool = await get_db_pool(request)
    query = "DELETE FROM public.events WHERE id = %s RETURNING id;"

    try:
        async with pool.connection(timeout=DB_POOL_TIMEOUT) as conn:
            async with conn.cursor() as cur:
                await cur.execute(query, (str(event_id),))
                row = await cur.fetchone()
                if hasattr(conn, "commit"):
                    await conn.commit()
    except PoolTimeout as exc:
        exc_class = type(exc).__name__
        sanitized_msg = sanitize_db_error_message(exc)
        logger.warning("Database connection pool timeout [%s]: %s", exc_class, sanitized_msg)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Server busy, retry shortly",
            headers={"Retry-After": "2"}
        )
    except Exception as exc:
        exc_class = type(exc).__name__
        sanitized_msg = sanitize_db_error_message(exc)
        logger.error("Error deleting event [%s]: %s", exc_class, sanitized_msg)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable"
        )

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    return {"deleted": True, "id": str(event_id)}


@app.post(
    "/api/generate-plan",
    summary="Generate Event Plan"
)
async def generate_plan(payload: PlanGenerateRequest, request: Request):
    plan = generate_plan_rules(
        event_type=payload.event_type,
        budget=payload.budget,
        guest_count=payload.guest_count,
        event_date=payload.event_date
    )

    if payload.event_id is not None:
        pool = await get_db_pool(request)
        plan_json = json.dumps(plan)
        update_query = """
            UPDATE public.events
            SET plan = coalesce(plan, '{}'::jsonb) || %s::jsonb
            WHERE id = %s
            RETURNING plan;
        """
        try:
            async with pool.connection(timeout=DB_POOL_TIMEOUT) as conn:
                async with conn.cursor() as cur:
                    await cur.execute(update_query, (plan_json, str(payload.event_id)))
                    row = await cur.fetchone()
                    if hasattr(conn, "commit"):
                        await conn.commit()
        except PoolTimeout as exc:
            exc_class = type(exc).__name__
            sanitized_msg = sanitize_db_error_message(exc)
            logger.warning("Database connection pool timeout [%s]: %s", exc_class, sanitized_msg)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Server busy, retry shortly",
                headers={"Retry-After": "2"}
            )
        except Exception as exc:
            exc_class = type(exc).__name__
            sanitized_msg = sanitize_db_error_message(exc)
            logger.error("Error saving plan to event [%s]: %s", exc_class, sanitized_msg)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database service unavailable"
            )

        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

        merged_plan = row["plan"]
        if isinstance(merged_plan, str):
            try:
                merged_plan = json.loads(merged_plan)
            except Exception:
                pass
        return merged_plan

    return plan


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
