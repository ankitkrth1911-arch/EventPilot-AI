# EventPilot AI: Comprehensive Authentication & Multi-Tenancy Architecture Plan

> **STATUS: PROPOSAL & DESIGN REPORT ONLY**  
> **RULE:** Do NOT execute schema changes or apply this migration until formal owner approval is received.  
> **Author:** Senior Backend + Security + SRE Lead  
> **Date:** October 2026  

---

## 1. Executive Summary & Threat Model

### Current Vulnerabilities (As-Is State)
In the current MVP release, the EventPilot backend provides unauthenticated, globally accessible CRUD operations on all events:
1. **Broken Object Level Authorization (BOLA / IDOR - OWASP API1:2023):**
   - Any client possessing network reachability to the backend can execute `GET /api/events`, retrieving all events across all hosts.
   - An adversary guessing or scanning a UUID can invoke `GET /api/events/{id}`, `PATCH /api/events/{id}`, or `DELETE /api/events/{id}`, corrupting or destroying other users' event logistics.
2. **PII Data Exposure (OWASP API3:2023):**
   - The `plan` JSONB payload and `EventDetail` responses store guest lists containing full names, personal email addresses, phone numbers, RSVP statuses, and sensitive dietary/medical preferences.
   - Anyone accessing the RSVP portal link or inspecting browser traffic receives unredacted visibility into all other invitees and financial budget ledgers.

---

## 2. Target Architecture

```
                                  [ Browser / Mobile Client ]
                                               │
                       ┌───────────────────────┴───────────────────────┐
                       │                                               │
             Host / Organizer (JWT)                            Guest (Signed RSVP Token)
                       │                                               │
         Authorization: Bearer <JWT>                       GET/POST /api/public/rsvp/<token>
                       │                                               │
                       ▼                                               ▼
     ┌───────────────────────────────────┐           ┌───────────────────────────────────┐
     │  FastAPI Host Endpoints           │           │  FastAPI Public RSVP Endpoints    │
     │  - Authenticated via Supabase     │           │  - HMAC Token Verification        │
     │    JWKS (RS256 / ES256)           │           │  - Zero PII Leakage               │
     │  - Extracts `auth_user_id` (UUID) │           │  - Atomic append of RSVP response │
     └─────────────────┬─────────────────┘           └─────────────────┬─────────────────┘
                       │                                               │
                       ▼                                               ▼
     ┌───────────────────────────────────────────────────────────────────────────────────┐
     │                       PostgreSQL Database (Supabase)                              │
     │  Table: public.events (owner_id UUID REFERENCES auth.users(id))                   │
     │  - Indexed on (owner_id, created_at DESC)                                         │
     │  - Host Queries: WHERE owner_id = :auth_user_id                                   │
     │  - Public RSVP: Updates guest record matching token's event_id                     │
     │  - Row Level Security (RLS) enabled as defense-in-depth                           │
     └───────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Component Design & Specifications

### 3.1. Supabase Auth & JWT Verification in FastAPI via JWKS
Instead of sharing a static HMAC secret (which complicates key rotation and risks secret leakage), the backend verifies asymmetric JWT tokens using Supabase's public JSON Web Key Set (JWKS).

- **JWKS Endpoint:** `https://<supabase-project-ref>.supabase.co/auth/v1/.well-known/jwks.json`
- **Algorithm:** Asymmetric `RS256` or `ES256`.
- **In-Memory Key Caching:** Public keys are fetched once and cached in memory using `PyJWT` with `PyJWKClient` (refreshed every 24 hours or on unknown `kid`).
- **Token Claims Validated:**
  - `iss`: Must match `https://<supabase-project-ref>.supabase.co/auth/v1`
  - `aud`: `authenticated`
  - `exp`: Reject expired tokens with standard 401 response and `WWW-Authenticate: Bearer error="invalid_token"`
  - `sub`: Extracted as `owner_id` (UUID).

#### FastAPI Dependency Implementation (`backend/auth.py`)
```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from jwt import PyJWKClient

security = HTTPBearer(auto_error=True)

SUPABASE_URL = os.environ["SUPABASE_URL"]
JWKS_URL = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
jwks_client = PyJWKClient(JWKS_URL, cache_keys=True, max_cached_keys=10)

class AuthenticatedUser(BaseModel):
    user_id: UUID
    email: Optional[str] = None
    role: str = "authenticated"

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> AuthenticatedUser:
    token = credentials.credentials
    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            audience="authenticated",
            issuer=f"{SUPABASE_URL}/auth/v1",
        )
        user_uuid = UUID(payload["sub"])
        return AuthenticatedUser(
            user_id=user_uuid,
            email=payload.get("email"),
            role=payload.get("role", "authenticated")
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has expired",
            headers={"WWW-Authenticate": "Bearer error=\"invalid_token\", error_description=\"token expired\""}
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer error=\"invalid_token\""}
        )
```

---

### 3.2. Per-User Query Scoping
Every SQL query interacting with `public.events` must strictly enforce multi-tenant isolation by joining or filtering on `owner_id`:

1. **List Events:**
   ```sql
   SELECT id, name, event_type, event_date, location, guest_count, budget, plan, created_at
   FROM public.events
   WHERE owner_id = %s
   ORDER BY created_at DESC
   LIMIT %s OFFSET %s;
   ```
2. **Get Single Event:**
   ```sql
   SELECT id, name, event_type, event_date, location, guest_count, budget, plan, created_at
   FROM public.events
   WHERE id = %s AND owner_id = %s;
   ```
3. **Patch Event:**
   ```sql
   UPDATE public.events
   SET name = %s, location = %s, ...
   WHERE id = %s AND owner_id = %s
   RETURNING id, name, ...;
   ```
4. **Delete Event:**
   ```sql
   DELETE FROM public.events
   WHERE id = %s AND owner_id = %s
   RETURNING id;
   ```

*Result:* If a user attempts to access an event belonging to another user, the query returns 0 rows, yielding an immediate `404 Not Found` (never leaking whether the ID exists).

---

### 3.3. Public Minimal RSVP Flow (Zero-PII Exposure)

#### Problem
Currently, sharing an event URL `#rsvp=<event-id>` forces the guest's browser to fetch the entire event object with `GET /api/events/{id}`, exposing:
- Total event budget and vendor allocations
- All tasks and coordinator phone numbers
- The complete guest roster (names, emails, responses)

#### Solution: Signed RSVP Tokens & Minimal Endpoints
Organizers generate a shareable RSVP link: `https://eventpilot.app/rsvp/<signed-token>`.
The token is an HMAC-SHA256 signed JWT (or `itsdangerous` token) containing:
```json
{
  "event_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "scope": "public_rsvp",
  "exp": 1735689600
}
```

1. **Public Metadata Retrieval:**
   - **Route:** `GET /api/public/rsvp/{token}`
   - **Authentication:** None (token signature verified against backend `RSVP_TOKEN_SECRET`).
   - **Response Payload (Exposes strictly minimal public fields):**
     ```json
     {
       "event_title": "Rahul & Priya's Wedding Reception",
       "event_category": "wedding",
       "event_date": "2026-12-15",
       "start_time": "18:00",
       "venue_name": "Royal Orchid Convention Center",
       "location": "Bengaluru, Karnataka",
       "host_name": "Rahul Sharma"
     }
     ```
   - **Zero PII Leakage:** Does NOT return the guest list, budget, tasks, or other guests' responses.

2. **Public RSVP Submission:**
   - **Route:** `POST /api/public/rsvp/{token}`
   - **Request Body (Strict Pydantic Validation):**
     ```json
     {
       "guest_name": "Aditi Roy",
       "guest_email": "aditi@example.com",
       "attending_status": "attending",
       "headcount": 2,
       "dietary_notes": "Vegetarian",
       "message_to_host": "Looking forward to celebrating!"
     }
     ```
   - **Backend Processing:**
     - Verifies token signature and checks that event date is not in the past.
     - Performs an atomic JSONB merge/update into `plan.workspace.guests` matching by email or creating a new entry.
     - Sanitizes all string inputs against HTML injection.
     - Returns `{ "status": "success", "message": "RSVP recorded" }`.

---

## 4. Database Schema Migration Script (SQL)

> **IMPORTANT:** Do NOT run this SQL script until approved by the repository owner.

```sql
-- =============================================================================
-- Migration: Add Multi-Tenant Owner Isolation & Row Level Security
-- Target Table: public.events
-- =============================================================================

BEGIN;

-- 1. Add owner_id column referencing Supabase auth.users
-- Note: Nullable initially to allow migrating existing records
ALTER TABLE public.events 
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Create high-performance compound index for per-user queries
CREATE INDEX IF NOT EXISTS idx_events_owner_created 
  ON public.events (owner_id, created_at DESC);

-- 3. Enable Row Level Security (RLS) on public.events
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies for Supabase direct access (Defense-in-Depth)

-- Policy: Users can view only their own events
CREATE POLICY events_owner_select ON public.events
  FOR SELECT
  USING (auth.uid() = owner_id);

-- Policy: Users can insert events assigned to themselves
CREATE POLICY events_owner_insert ON public.events
  FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- Policy: Users can update only their own events
CREATE POLICY events_owner_update ON public.events
  FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Policy: Users can delete only their own events
CREATE POLICY events_owner_delete ON public.events
  FOR DELETE
  USING (auth.uid() = owner_id);

COMMIT;

-- =============================================================================
-- Rollback / Down Migration (in case of need)
-- =============================================================================
-- BEGIN;
-- DROP POLICY IF EXISTS events_owner_delete ON public.events;
-- DROP POLICY IF EXISTS events_owner_update ON public.events;
-- DROP POLICY IF EXISTS events_owner_insert ON public.events;
-- DROP POLICY IF EXISTS events_owner_select ON public.events;
-- ALTER TABLE public.events DISABLE ROW LEVEL SECURITY;
-- DROP INDEX IF EXISTS idx_events_owner_created;
-- ALTER TABLE public.events DROP COLUMN IF EXISTS owner_id;
-- COMMIT;
```

---

## 5. Migration Strategy & Rollout Plan

1. **Pre-Deployment:**
   - Execute Step 1 (add `owner_id` as nullable column with index).
   - Existing orphaned records assigned to an administrative service user or grandfathered account.
2. **Backend Rollout:**
   - Deploy FastAPI code with `get_current_user` dependency and `WHERE owner_id = %s`.
   - Add new public RSVP endpoints (`/api/public/rsvp/...`).
3. **Frontend Rollout:**
   - Integrate `@supabase/supabase-js` Auth (Google OAuth + Magic Link / Email & Password).
   - Inject `Authorization: Bearer <session.access_token>` into `frontend/src/services/api.ts`.
   - Update RSVP share link generator to output the signed public token URL.
4. **Post-Deployment:**
   - Make `owner_id` NOT NULL in PostgreSQL.
   - Verify 0 regression on performance and 100% IDOR protection.
