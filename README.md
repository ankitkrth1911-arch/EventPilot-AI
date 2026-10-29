# EventPilot AI - Backend Service

EventPilot AI is a production-style MVP backend built with **FastAPI**, **Supabase PostgreSQL** (using `psycopg 3` connection pooling), and a **rule-based planning engine** for automated event budget allocation and checklist generation. It is fully containerized and ready to deploy on **Northflank**.

> **Note on AI Planning**: Event budgets and checklists are currently generated using a deterministic rule-based engine (`rule-based-v1`) designed as pure functions so an AI API (e.g., Gemini) can seamlessly replace it in future iterations.

---

## Features

- **FastAPI + Pydantic v2**: High performance, strict input validation, automatic OpenAPI `/docs`.
- **Supabase Connection Pooling**: Uses `psycopg 3` with `AsyncConnectionPool` tailored for Supabase Session Pooler with `sslmode=require`.
- **Degraded Resilient Startup**: The service starts reliably even if the database is temporarily unreachable; only `/health` reports degraded and DB endpoints return clean HTTP 503 errors.
- **Rule-Based Planning Engine**:
  - Event types supported: `wedding`, `birthday`, `community`.
  - Realistic category percentage budget allocation with drift-fix rounding.
  - Multi-phase checklists ("3 months before", "1 month before", "Week of") with stable IDs.
  - Heuristic warning detection (short timelines, low per-guest budget, high guest count anomalies).
- **Security & Hardening**:
  - Strict CORS support (comma-separated origins from `ALLOWED_ORIGINS` + `http://localhost:5173`).
  - Parameterized SQL queries preventing SQL injection.
  - Global exception handler hiding internal stack traces and sanitizing errors.
  - Docker container running as non-root user.

---

## API Endpoints

| Method | Endpoint | Description | Status Code |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Root greeting and documentation URL | `200 OK` |
| `GET` | `/health` | DB ping (`SELECT 1`). Returns `ok` or `degraded` | `200 OK` / `503 Service Unavailable` |
| `POST` | `/api/events` | Create new event (auto-generates plan if budget & guest count are provided) | `201 Created` |
| `GET` | `/api/events` | List events (`created_at DESC`, `limit`, `offset`, `event_type` filter) | `200 OK` |
| `GET` | `/api/events/{id}` | Get event details by UUID | `200 OK` / `404 Not Found` |
| `PATCH` | `/api/events/{id}` | Partially update event fields; merges `plan` JSONB via `\|\|` | `200 OK` / `404 Not Found` / `422 Unprocessable` |
| `DELETE` | `/api/events/{id}` | Delete event by UUID | `200 OK` / `404 Not Found` |
| `POST` | `/api/generate-plan` | Generate rule-based plan (optionally persists to `event_id`) | `200 OK` / `404 Not Found` |

Interactive Swagger documentation is available at `/docs` and ReDoc at `/redoc`.

---

## Local Setup on Windows (PowerShell)

### 1. Clone & Enter Project Directory
```powershell
cd "eventpilot-backend"
```

### 2. Create and Activate Virtual Environment
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### 3. Install Dependencies
```powershell
pip install -r requirements.txt
```

### 4. Configure Environment Variables
Copy the template and configure your connection:
```powershell
Copy-Item .env.example .env
```
Edit `.env` using Notepad or your editor:
```env
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@<pooler-host>:5432/postgres?sslmode=require
ALLOWED_ORIGINS=http://localhost:5173,https://your-app.vercel.app
```

### 5. Run the Application
```powershell
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
Visit http://localhost:8000/docs to explore the API.

---

## Supabase Database Setup

### 1. Execute `schema.sql` in Supabase
1. Open your [Supabase Dashboard](https://supabase.com/dashboard).
2. Select your project.
3. Click on **SQL Editor** from the left navigation panel.
4. Click **New query**, paste the contents of `schema.sql`, and click **Run**:

```sql
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_type text not null check (event_type in ('wedding','birthday','community')),
  event_date date,
  location text,
  guest_count integer check (guest_count >= 0),
  budget numeric(12,2) check (budget >= 0),
  plan jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_events_created_at on public.events (created_at desc);
create index if not exists idx_events_event_type on public.events (event_type);
```

### 2. Which Connection String to Use
In Supabase:
- Navigate to **Project Settings** -> **Database**.
- Scroll to **Connection Pooling**.
- Select **Session Pooler** (Port `5432` or `6543`), **NOT** the Direct Connection (direct connection is IPv6-only on many free tier instances and does not scale well with serverless/container restarts).
- Always include `sslmode=require` in the URI.

---

## Docker Setup

### 1. Build the Docker Image
```bash
docker build -t eventpilot-backend:latest .
```

### 2. Run the Container Locally
```bash
docker run -d --name eventpilot-api -p 8000:8000 --env-file .env eventpilot-backend:latest
```

Check logs:
```bash
docker logs -f eventpilot-api
```

---

## Deploying to Northflank

1. **Push to GitHub**:
   - Push your `eventpilot-backend` repository to GitHub.
   - Verify `.env` is **never** committed (`git check-ignore -v .env`).

2. **Create a Combined Service on Northflank**:
   - Log in to [Northflank](https://northflank.com/).
   - Select your Project (or create a new one).
   - Click **Create Service** -> **Deployment / Combined Service**.
   - Choose **Build from VCS** and connect your GitHub repository and branch.
   - Build Type: **Dockerfile** (Context: `/`, Dockerfile path: `Dockerfile`).

3. **Configure Environment Variables (Secrets)**:
   In the **Environment Variables** / **Secrets** section, configure:
   - `DATABASE_URL`: Your Supabase Session Pooler connection string (`sslmode=require`).
   - `ALLOWED_ORIGINS`: Comma-separated domains of your frontend applications (e.g., `https://your-frontend.vercel.app,http://localhost:5173`).

4. **Port & Networking**:
   - Add Port: `8000` (Protocol: `HTTP`).
   - Enable **Public access** to generate an HTTPS endpoint (e.g., `https://eventpilot-xyz.northflank.app`).

5. **Deploy**:
   - Click **Deploy Service**. Northflank will build the Docker container and start Uvicorn.
   - Access the health check at `https://<your-service>.northflank.app/health`.

---

## cURL Examples

### 1. Root Welcome
```bash
curl -X GET "http://localhost:8000/"
```

### 2. Health Check
```bash
curl -X GET "http://localhost:8000/health"
```

### 3. Create Event (Wedding with Auto-Generated Plan)
```bash
curl -X POST "http://localhost:8000/api/events" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Aarav & Diya Wedding",
    "event_type": "wedding",
    "event_date": "2026-12-15",
    "location": "Udaipur Palace Gardens",
    "guest_count": 250,
    "budget": 800000
  }'
```

### 4. Create Event (Birthday)
```bash
curl -X POST "http://localhost:8000/api/events" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Rohan 10th Birthday Bash",
    "event_type": "birthday",
    "event_date": "2026-11-20",
    "location": "Skyline Activity Club",
    "guest_count": 40,
    "budget": 35000
  }'
```

### 5. Create Event (Community Festival)
```bash
curl -X POST "http://localhost:8000/api/events" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Green Earth Community Fair",
    "event_type": "community",
    "event_date": "2026-12-05",
    "location": "Central Community Grounds",
    "guest_count": 400,
    "budget": 120000
  }'
```

### 6. List Events with Pagination & Filter
```bash
curl -X GET "http://localhost:8000/api/events?limit=10&offset=0&event_type=wedding"
```

### 7. Get Event by UUID
```bash
curl -X GET "http://localhost:8000/api/events/<event-uuid>"
```

### 8. Update Event (PATCH - Name, Budget, or Merge Workspace into Plan)
```bash
# Update name only (other fields unchanged)
curl -X PATCH "http://localhost:8000/api/events/<event-uuid>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Event Name"
  }'

# Merge workspace data into plan JSONB (without overwriting rule-based plan)
curl -X PATCH "http://localhost:8000/api/events/<event-uuid>" \
  -H "Content-Type: application/json" \
  -d '{
    "plan": {
      "workspace": {
        "guests": ["John Doe", "Jane Smith"]
      }
    }
  }'
```

### 9. Delete Event by UUID
```bash
curl -X DELETE "http://localhost:8000/api/events/<event-uuid>"
```

### 10. Generate Plan (Without persisting to DB)
```bash
curl -X POST "http://localhost:8000/api/generate-plan" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "wedding",
    "budget": 800000,
    "guest_count": 250,
    "event_date": "2026-12-15"
  }'
```

### 11. Generate Plan and Save to Existing Event
```bash
curl -X POST "http://localhost:8000/api/generate-plan" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "birthday",
    "budget": 50000,
    "guest_count": 50,
    "event_id": "<event-uuid>"
  }'
```

### 12. Testing Validation Errors (HTTP 422)
```bash
# Empty PATCH body (rejected with 422)
curl -X PATCH "http://localhost:8000/api/events/<event-uuid>" \
  -H "Content-Type: application/json" \
  -d '{}'

# Negative budget (rejected by Pydantic)
curl -X POST "http://localhost:8000/api/events" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Invalid Budget Event",
    "event_type": "birthday",
    "budget": -500
  }'
```

---

## Free-Tier Limitations & Operational Considerations

1. **Supabase Free Tier Inactivity Pause**:
   - Supabase projects on the free tier automatically pause after **7 days of inactivity**.
   - If paused, the EventPilot AI backend will start in degraded mode, returning `503 Service Unavailable` on database operations until the database is unpaused in the Supabase Dashboard.
2. **Northflank Free Sandbox**:
   - Free tier workloads share CPU/Memory resources and may sleep or restart during maintenance windows.
   - The connection pooler handles transient reconnections smoothly.
