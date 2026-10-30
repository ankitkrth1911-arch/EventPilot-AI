# EventPilot AI: Production-Hardened Event Management Engine

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Python: 3.14+](https://img.shields.io/badge/Python-3.14+-3776AB.svg?logo=python&logoColor=white)](https://python.org)
[![FastAPI: 0.135+](https://img.shields.io/badge/FastAPI-0.135+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React: 19](https://img.shields.io/badge/React-19.0-61DAFB.svg?logo=react&logoColor=black)](https://react.dev)
[![TypeScript: 7.0+](https://img.shields.io/badge/TypeScript-7.0+-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Docker: Ready](https://img.shields.io/badge/Docker-Ready-2496ED.svg?logo=docker&logoColor=white)](https://www.docker.com)

EventPilot AI is a production-grade, hardened event operations platform designed for coordinators, hosts, and community organizers. It combines a resilient **FastAPI** backend with asynchronous **psycopg 3** connection pooling on Supabase PostgreSQL, a deterministic **rule-based planning and budget allocation engine**, and an interactive, responsive **React + Vite** frontend.

---

## 1. Repository Layout

```
.
├── backend/                  # FastAPI REST API + psycopg 3 Connection Pool + Dockerfile
│   ├── main.py               # Core application, middlewares, rate limiters, routes
│   ├── requirements.txt      # Production Python dependencies
│   ├── schema.sql            # Supabase PostgreSQL schema definition
│   ├── Dockerfile            # Multi-stage production container running as non-root
│   └── tests/
│       └── test_contract.py  # Pytest + HTTPX comprehensive contract tests
├── frontend/                 # React 19 + TypeScript + Vite + Tailwind CSS
│   ├── src/                  # Components, tabs, mappers, API service
│   ├── e2e/                  # Playwright end-to-end smoke tests (smoke.spec.ts)
│   ├── vercel.json           # Production security headers & Content-Security-Policy (CSP)
│   └── package.json          # Dependencies, linting, build, and test scripts
├── loadtest/                 # Performance & Stress Testing Suite
│   ├── locustfile.py         # 100-user concurrent traffic generator (60/20/15/5 distribution)
│   └── run_stages.py         # Multi-stage automated load test orchestrator (20/50/100/soak)
├── docs/                     # Architecture & Audit Reports
│   ├── AUDIT_REPORT.md       # Comprehensive full-stack audit findings & remediations
│   └── AUTH_PLAN.md          # Multi-tenant Supabase Auth + RLS design report
├── scripts/                  # Utility & Security Scripts
│   └── secrets_scan.py       # High-entropy credential & secret scanner
└── README.md                 # System documentation & deployment guide
```

---

## 2. Environment Variables & Configuration

### Backend (`backend/.env`)

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | String | *Required* | PostgreSQL connection string. Must include `sslmode=require`. |
| `ENVIRONMENT` | String | `development` | Deployment environment (`development`, `staging`, `production`). |
| `ALLOWED_ORIGINS` | String | `http://localhost:3000,http://localhost:5173` | Comma-separated CORS origins. Wildcard `*` is strictly forbidden in production. |
| `ENABLE_DOCS` | Boolean | `false` (prod), `true` (dev) | Toggles `/docs`, `/redoc`, and `/openapi.json`. |
| `ADMIN_TOKEN` | String | `""` | Secret bearer token required to read `GET /internal/metrics`. |
| `DB_POOL_MAX` | Integer | `10` | Maximum active connections in psycopg `AsyncConnectionPool`. |
| `DB_POOL_MIN` | Integer | `0` | Minimum warm connections maintained in pool. |
| `DB_POOL_TIMEOUT` | Float | `5.0` | Seconds to wait for an available connection before fast 503 response. |
| `DB_POOL_MAX_WAITING` | Integer | `50` | Maximum callers queued for a connection before shedding load. |
| `DB_USE_TRANSACTION_POOLER` | Boolean | Auto (`false`) | Forces `prepare_threshold=None` for Supabase Transaction Pooler (port 6543). |
| `MAX_INFLIGHT` | Integer | `60` | Maximum simultaneous requests across the API before shedding load with 503. |
| `RATE_LIMIT_READS` | Integer | `120` | Max GET requests allowed per minute per client IP. |
| `RATE_LIMIT_WRITES` | Integer | `30` | Max POST/PATCH/DELETE requests allowed per minute per client IP. |
| `RATE_LIMIT_BURSTS` | Integer | `10` | Max burst requests allowed per minute for creation & plan generation. |

### Frontend (`frontend/.env`)

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `VITE_API_URL` | String | `http://localhost:8000` | Backend API base URL. |

---

## 3. Database & Connection Pool Architecture

### Supabase Session Pooler vs Transaction Pooler

Supabase provides two connection pooler ports via Supavisor / PgBouncer:
1. **Session Pooler (Port 5432):**
   - Allocates one physical backend PostgreSQL connection per client connection.
   - Ideal for stateful sessions and prepared statements.
   - **Crucial limitation:** Supabase free/hobby instances enforce low connection limits (often 15–20 total connections). Running multiple container replicas can quickly exhaust the database server.
2. **Transaction Pooler (Port 6543):**
   - Pools connections at the transaction level, enabling hundreds of concurrent clients to share 5–10 PostgreSQL backend connections.
   - **Requirement for psycopg 3:** Because transactions can alternate connections, prepared statements must be disabled by setting `prepare_threshold=None` in `AsyncConnectionPool` kwargs.

### Sizing Formula
To prevent pool exhaustion, calculate maximum backend pool capacity:
$$\text{Total Connections} = \text{Replicas} \times \text{DB\_POOL\_MAX} \le \text{Supabase Pooler Cap}$$
Example: With 2 container replicas on Northflank and a Supabase limit of 25 connections, set `DB_POOL_MAX=10` ($2 \times 10 = 20 < 25$).

### Statement & Lock Timeouts
Every connection automatically injects PostgreSQL query and lock timeouts to eliminate orphaned hanging transactions:
- `statement_timeout = 5000ms` (kills any query running over 5 seconds)
- `lock_timeout = 5000ms` (aborts transactions waiting over 5 seconds for row/table locks)
- `connect_timeout = 5s`

---

## 4. Northflank Deployment Configuration

### 1. Service Specification
- **Service Type:** Combined Service or Deployment Service
- **Build Source:** Dockerfile (`backend/Dockerfile`)
- **Port:** `8000` (Protocol: HTTP, Public access: Enabled)
- **Resource Sizing:**
  - Recommended minimum: `0.5 vCPU`, `512 MB RAM`
  - High traffic production: `1.0 vCPU`, `1024 MB RAM`

### 2. Health & Liveness Probes
Northflank provides two separate health probe settings:

| Probe Type | Path | Purpose |
| :--- | :--- | :--- |
| **Liveness Probe** | `/livez` | **Must point to `/livez`**. Returns HTTP 200 without querying PostgreSQL. Ensures Northflank does NOT restart the container during transient database maintenance. |
| **Readiness Probe** | `/health` | Probes PostgreSQL connectivity via `SELECT 1;`. Returns HTTP 200 when ready or HTTP 503 (`status: degraded`) when DB is unreachable, temporarily pausing traffic ingress without killing the container. |

### 3. Proxy Headers & Client IP Trust
The `Dockerfile` CMD launches Uvicorn with proxy headers enabled:
```dockerfile
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*", "--limit-concurrency", "60", "--timeout-keep-alive", "30"]
```
This guarantees `request.headers["x-forwarded-for"]` contains the actual client IP for rate limiting and audit logging behind Northflank's reverse proxy.

---

## 5. Traffic Observability, Metrics & Logs

### Structured JSON Request Logs
Every HTTP request generates a structured single-line JSON log entry (excluding request/response bodies and secrets):
```json
{
  "request_id": "c1f72e9a-41df-4b77-8fa9-281b3699c80d",
  "method": "POST",
  "path": "/api/events",
  "status": 201,
  "duration_ms": 14.82,
  "client_ip": "203.0.113.195",
  "origin": "https://eventpilot.vercel.app",
  "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}
```

### Scanner & Abuse Detection Logs
The in-memory rate limiter automatically detects and warns on suspicious traffic patterns without blocking legitimate users:
- **Rate Limit Abuse Warning:** Emitted when an IP exceeds $3\times$ the configured rate limit threshold:
  ```text
  [WARNING] eventpilot: TRAFFIC WARNING: Client IP 198.51.100.22 exceeded 3x rate limit on burst (count=31, limit=10)
  ```
- **Vulnerability Scanner Detection:** Emitted when an IP accumulates $\ge 15$ HTTP 404 or 422 errors within 60 seconds:
  ```text
  [WARNING] eventpilot: SECURITY WARNING: Potential scanner/abuse pattern from client IP 198.51.100.22: 18 404/422 errors within 60s
  ```

### Real-Time Metrics Endpoint (`GET /internal/metrics`)
Protected by HTTP Bearer authentication matching `ADMIN_TOKEN`. Returns in-memory counters and latency percentiles:
```bash
curl -H "Authorization: Bearer secret-metrics-token-12345" http://localhost:8000/internal/metrics
```
Example Output:
```json
{
  "in_flight_requests": 3,
  "total_requests": 1450,
  "status_codes": { "200": 1180, "201": 190, "412": 15, "429": 45, "503": 20 },
  "errors": { "count_429": 45, "count_503": 20 },
  "latency_ms": {
    "p50": 1.20,
    "p95": 4.80,
    "p99": 9.40,
    "samples_tracked": 1450
  },
  "pool": {
    "max_size": 10,
    "waiting": 0
  }
}
```

---

## 6. Testing & Quality Assurance

### 1. Contract & Unit Tests (Pytest + HTTPX)
Validates all backend route schemas, 422 boundary conditions, UUID formatting, plan depth/size restrictions, idempotency keys, and optimistic concurrency ETags:
```bash
pytest backend/tests/test_contract.py -v
```

### 2. End-to-End Smoke Tests (Playwright)
Executes a browser smoke test against real local backend and frontend instances:
```bash
npm --prefix frontend run test:e2e
```

### 3. Multi-Stage Load & Soak Testing (Locust)
Simulates up to 100 concurrent users across realistic traffic distributions (60% read, 20% create, 15% patch, 5% delete):
```bash
python loadtest/run_stages.py
```

### 4. Dependency Audits & Secrets Scanning
```bash
# Python backend dependency audit
.\backend\.venv\Scripts\pip-audit.exe

# Node.js frontend dependency audit
npm --prefix frontend audit

# Regex & Git history secrets scanner
python scripts/secrets_scan.py
```
