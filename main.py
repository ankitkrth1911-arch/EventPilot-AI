"""
EventPilot AI - Backend Service
FastAPI + Supabase PostgreSQL (psycopg 3 connection pool) + Rule-Based Planning Engine
Ready for Docker and Northflank Deployment.
"""

import os
import sys
import json
import logging
import asyncio
from datetime import date, datetime
from typing import Literal, Optional, List, Dict, Any
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
from pydantic import BaseModel, Field, field_validator

import psycopg
from psycopg_pool import AsyncConnectionPool
from psycopg.rows import dict_row

# ------------------------------------------------------------------------------
# Production Readiness Roadmap
# ------------------------------------------------------------------------------
# TODO: Production Roadmap:
# 1. Authentication: Integrate Supabase Auth / OAuth2 JWT verification to authenticate
#    incoming user requests via Authorization Bearer tokens.
# 2. Per-User Row Level Security (RLS): Map verified user claims (auth.uid()) to
#    user_id column on events table and enable Postgres RLS policies.
# 3. Rate Limiting: Introduce Redis-backed or in-memory token bucket rate limiting
#    (e.g., slowapi) to protect endpoints against abuse and DDoS attacks.
# 4. Metrics & APM: Integrate OpenTelemetry / Prometheus metrics for latency and error tracking.
# ------------------------------------------------------------------------------

# Load local environment variables from .env if present
load_dotenv()

# Setup structured logging (Never log credentials or full connection strings)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("eventpilot")

DATABASE_URL = os.getenv("DATABASE_URL")
RAW_ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "")


def get_allowed_origins() -> List[str]:
    """Parse comma-separated origins and enforce required local frontend URLs (ports 3000 & 5173)."""
    origins = [orig.strip() for orig in RAW_ALLOWED_ORIGINS.split(",") if orig.strip()]
    for required in ["http://localhost:3000", "http://localhost:5173"]:
        if required not in origins:
            origins.append(required)
    return origins


# ------------------------------------------------------------------------------
# Rule-Based Planning Engine (Pure Functions for easy AI API swap-in)
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
    """
    Calculate budget allocation across categories based on event type percentages.
    Rounds amounts to 2 decimal places and fixes any rounding drift so the sum
    equals total_budget exactly (adjusting the largest category).
    """
    percentages = BUDGET_PERCENTAGES[event_type]
    breakdown: List[Dict[str, Any]] = []

    for category, pct in percentages.items():
        amount = round(total_budget * (pct / 100.0), 2)
        breakdown.append({
            "category": category,
            "percentage": pct,
            "amount": amount
        })

    # Adjust rounding drift on the category with the largest percentage
    current_sum = round(sum(item["amount"] for item in breakdown), 2)
    drift = round(total_budget - current_sum, 2)
    if drift != 0.0 and breakdown:
        largest_idx = max(range(len(breakdown)), key=lambda i: breakdown[i]["percentage"])
        breakdown[largest_idx]["amount"] = round(breakdown[largest_idx]["amount"] + drift, 2)

    return breakdown


def generate_plan_rules(
    event_type: EventType,
    budget: float,
    guest_count: int,
    event_date: Optional[date] = None
) -> Dict[str, Any]:
    """
    Pure rule-based planning engine.
    Computes budget breakdown, per-guest costs, deterministic checklist, and warnings.
    """
    total_budget = round(float(budget), 2)
    guest_cnt = int(guest_count)

    # Per guest cost (currency is INR ₹)
    if guest_cnt > 0:
        per_guest_cost = round(total_budget / guest_cnt, 2)
    else:
        per_guest_cost = 0.0

    breakdown = calculate_budget_breakdown(event_type, total_budget)

    # Clone checklist so internal done states remain pure
    raw_checklist = CHECKLIST_TEMPLATES.get(event_type, [])
    checklist = [
        {
            "phase": phase_data["phase"],
            "tasks": [dict(t) for t in phase_data["tasks"]]
        }
        for phase_data in raw_checklist
    ]

    warnings: List[str] = []

    # Timeline warning based on event_date
    if event_date is not None:
        days_until = (event_date - date.today()).days
        if days_until < 0:
            warnings.append("Event date is in the past: please verify the scheduled event date.")
        elif days_until < 30:
            warnings.append("Short timeline: prioritize venue, catering and invitations first.")

    # Low per-guest budget warnings
    if guest_cnt > 0:
        if event_type == "wedding" and per_guest_cost < 1500.0:
            warnings.append("Low per-guest budget: weddings typically require at least ₹1,500 per guest for venue, food, and decor.")
        elif event_type == "birthday" and per_guest_cost < 500.0:
            warnings.append("Low per-guest budget: birthday celebrations typically require at least ₹500 per guest.")
        elif event_type == "community" and per_guest_cost < 150.0:
            warnings.append("Low per-guest budget: community events typically require at least ₹150 per guest.")
    else:
        warnings.append("Guest count is zero: plan assumes venue and basic fixed overhead costs only.")

    # High guest count with low budget warning
    if (guest_cnt >= 500 and total_budget < 100000.0) or (guest_cnt >= 200 and per_guest_cost < 200.0 and guest_cnt > 0):
        warnings.append("High guest count with a constrained budget: risk of cost overruns on catering and venue capacity.")

    return {
        "event_type": event_type,
        "total_budget": total_budget,
        "guest_count": guest_cnt,
        "per_guest_cost": per_guest_cost,
        "budget_breakdown": breakdown,
        "checklist": checklist,
        "warnings": warnings,
        "generated_by": "rule-based-v1",
    }


# ------------------------------------------------------------------------------
# Pydantic Schemas (v2)
# ------------------------------------------------------------------------------
class EventCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120, description="Name of the event")
    event_type: EventType = Field(..., description="Type of event: wedding, birthday, or community")
    event_date: Optional[date] = Field(None, description="Scheduled date of the event")
    location: Optional[str] = Field(None, max_length=200, description="Event location or venue name")
    guest_count: Optional[int] = Field(None, ge=0, le=100000, description="Expected guest count")
    budget: Optional[float] = Field(None, ge=0, description="Total budget in INR")


class EventUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120, description="Name of the event")
    event_type: Optional[EventType] = Field(None, description="Type of event: wedding, birthday, or community")
    event_date: Optional[date] = Field(None, description="Scheduled date of the event")
    location: Optional[str] = Field(None, max_length=200, description="Event location or venue name")
    guest_count: Optional[int] = Field(None, ge=0, le=100000, description="Expected guest count")
    budget: Optional[float] = Field(None, ge=0, description="Total budget in INR")
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
    event_type: EventType = Field(..., description="Type of event")
    budget: float = Field(..., ge=0, description="Total budget in INR")
    guest_count: int = Field(..., ge=0, le=100000, description="Estimated number of guests")
    event_date: Optional[date] = Field(None, description="Scheduled date of the event")
    event_id: Optional[UUID] = Field(None, description="Optional UUID of existing event to save plan into")


# ------------------------------------------------------------------------------
# Database Pool & Lifespan Handler
# ------------------------------------------------------------------------------
def sanitize_conninfo(raw_url: str) -> str:
    """Ensure sslmode=require for secure Supabase connectivity."""
    if "sslmode=" not in raw_url:
        separator = "&" if "?" in raw_url else "?"
        return f"{raw_url}{separator}sslmode=require"
    return raw_url


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI Lifespan Context Manager.
    Manages psycopg 3 AsyncConnectionPool lifecycle.
    Resilient startup: App starts even if database is unreachable.
    """
    app.state.pool = None

    if DATABASE_URL:
        try:
            conninfo = sanitize_conninfo(DATABASE_URL)
            pool = AsyncConnectionPool(
                conninfo=conninfo,
                min_size=0,
                max_size=10,
                open=False,
                kwargs={"row_factory": dict_row, "connect_timeout": 3}
            )
            # Open pool without blocking startup if DB is down
            await pool.open(wait=False)
            app.state.pool = pool
            logger.info("Database connection pool initialized")
        except Exception as exc:
            logger.warning("Could not initialize connection pool: %s", type(exc).__name__)
            app.state.pool = None
    else:
        logger.warning("DATABASE_URL not set; running in database-degraded mode")

    yield

    # Clean shutdown
    pool: Optional[AsyncConnectionPool] = getattr(app.state, "pool", None)
    if pool is not None:
        try:
            await pool.close()
            logger.info("Database connection pool successfully closed")
        except Exception as exc:
            logger.error("Error during pool shutdown: %s", type(exc).__name__)


# ------------------------------------------------------------------------------
# FastAPI Application Setup
# ------------------------------------------------------------------------------
app = FastAPI(
    title="EventPilot AI API",
    description="Production-style backend for EventPilot AI: event management & rule-based budget and checklist planning engine.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS Middleware Setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


# ------------------------------------------------------------------------------
# Exception Handlers
# ------------------------------------------------------------------------------
@app.exception_handler(HTTPException)
async def custom_http_exception_handler(request: Request, exc: HTTPException):
    """Clean JSON error response for HTTP exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail}
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Clean JSON error response for Pydantic input validation failures."""
    errors = []
    for err in exc.errors():
        loc = " -> ".join(str(item) for item in err.get("loc", []))
        errors.append(f"{loc}: {err.get('msg', 'Invalid input')}")
    return JSONResponse(
        status_code=422,
        content={"error": "Input validation failed", "details": errors}
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global fallback exception handler: never leak internal stack traces."""
    logger.error("Unhandled server exception: %s", type(exc).__name__)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"error": "An internal server error occurred."}
    )


# ------------------------------------------------------------------------------
# Database Connection Helper
# ------------------------------------------------------------------------------
async def get_db_pool(request: Request) -> AsyncConnectionPool:
    """Return active database pool or raise 503 if unreachable/unconfigured."""
    pool: Optional[AsyncConnectionPool] = getattr(request.app.state, "pool", None)
    if pool is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable"
        )
    return pool


# ------------------------------------------------------------------------------
# API Endpoints
# ------------------------------------------------------------------------------
@app.get("/", summary="Root Endpoint")
async def root():
    """Welcome and API documentation link."""
    return {
        "message": "Welcome to EventPilot AI API",
        "docs": "/docs",
        "version": "1.0.0"
    }


@app.get("/health", summary="Health Check")
async def health(request: Request):
    """
    Health check endpoint: tests connectivity by executing 'SELECT 1'.
    Returns 200 OK if healthy, or 503 Service Unavailable if degraded/unreachable.
    """
    pool: Optional[AsyncConnectionPool] = getattr(request.app.state, "pool", None)
    if pool is None:
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
        logger.warning("Database health check ping failed: %s", type(exc).__name__)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "degraded", "database": "unreachable"}
        )


@app.post(
    "/api/events",
    response_model=EventResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Event"
)
async def create_event(event: EventCreate, request: Request):
    """
    Create a new event in Supabase public.events.
    If both budget and guest_count are provided, automatically generates and saves the plan.
    """
    pool = await get_db_pool(request)

    # Optional auto-plan generation if budget and guest_count are provided
    generated_plan = None
    if event.budget is not None and event.guest_count is not None:
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
        async with pool.connection(timeout=5.0) as conn:
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
                await conn.commit()
    except Exception as exc:
        logger.error("Error creating event: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable"
        )

    if not row:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save event"
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
    """
    List events ordered by created_at DESC with pagination and optional type filtering.
    """
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
        async with pool.connection(timeout=5.0) as conn:
            async with conn.cursor() as cur:
                await cur.execute(full_query, params)
                rows = await cur.fetchall()
                return rows
    except Exception as exc:
        logger.error("Error listing events: %s", type(exc).__name__)
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
    event_id: UUID = Path(..., description="The unique UUID of the event")
):
    """Retrieve an event by its UUID. Returns 404 if not found."""
    pool = await get_db_pool(request)

    query = """
        SELECT id, name, event_type, event_date, location, guest_count, budget, plan, created_at
        FROM public.events
        WHERE id = %s;
    """

    try:
        async with pool.connection(timeout=5.0) as conn:
            async with conn.cursor() as cur:
                await cur.execute(query, (str(event_id),))
                row = await cur.fetchone()
    except Exception as exc:
        logger.error("Error retrieving event: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable"
        )

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

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
    event_id: UUID = Path(..., description="The unique UUID of the event to update"),
    payload: EventUpdate = Body(...)
):
    """
    Partially update an event by UUID.
    Only provided fields are updated.
    If 'plan' is provided, it is merged via PostgreSQL JSONB concatenation (||).
    Returns the full updated event (200), 404 if not found, 422 if body is empty.
    """
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=422,
            detail="At least one field must be provided for update"
        )

    pool = await get_db_pool(request)

    set_clauses: List[str] = []
    params: List[Any] = []

    for field_name, value in update_data.items():
        if field_name not in ALLOWED_UPDATE_FIELDS:
            continue
        if field_name == "plan":
            set_clauses.append("plan = coalesce(plan, '{}'::jsonb) || %s::jsonb")
            params.append(json.dumps(value))
        else:
            set_clauses.append(f"{field_name} = %s")
            params.append(value)

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
        async with pool.connection(timeout=3.0) as conn:
            async with conn.cursor() as cur:
                await cur.execute(query, params)
                row = await cur.fetchone()
                if row:
                    await conn.commit()
    except Exception as exc:
        logger.error("Error updating event: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable"
        )

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    return row


@app.delete(
    "/api/events/{event_id}",
    summary="Delete Event"
)
async def delete_event(
    request: Request,
    event_id: UUID = Path(..., description="The unique UUID of the event to delete")
):
    """
    Delete an event by UUID.
    Returns {"deleted": true, "id": "<uuid>"} (200), 404 if not found.
    """
    pool = await get_db_pool(request)
    query = "DELETE FROM public.events WHERE id = %s RETURNING id;"

    try:
        async with pool.connection(timeout=3.0) as conn:
            async with conn.cursor() as cur:
                await cur.execute(query, (str(event_id),))
                row = await cur.fetchone()
                if row:
                    await conn.commit()
    except Exception as exc:
        logger.error("Error deleting event: %s", type(exc).__name__)
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
    """
    Generate budget breakdown and checklist using the rule-based engine.
    If event_id is supplied, updates the plan JSONB column in public.events (returns 404 if not found).
    """
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
            async with pool.connection(timeout=3.0) as conn:
                async with conn.cursor() as cur:
                    await cur.execute(update_query, (plan_json, str(payload.event_id)))
                    row = await cur.fetchone()
                    if row:
                        await conn.commit()
        except Exception as exc:
            logger.error("Error saving plan to event: %s", type(exc).__name__)
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
