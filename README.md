# EventPilot AI

Modern, celebration-grade event planning and run-of-show coordination engine built with React, TypeScript, and Tailwind CSS, fully connected to a FastAPI + Supabase REST backend.

## Features

- **Event Operations Dashboard**: Manage wedding, birthday, and community gatherings with timeline tracking, RSVP counts, and budget utilization.
- **Rule-based Smart Planner**: Deterministic itinerary generation, phase breakdown, and host advisory buffers.
- **Budget & Ledger**: Category allocation, commitments vs. payments ledger, and one-click "Auto-allocate budget (rule-based)" using backend formulas with warnings and per-guest cost insights.
- **Checklist Import**: Import phases and tasks with calculated due dates directly from the backend.
- **Guest RSVP Portal**: Dedicated public view accessible via `#rsvp=<uuid>` hash for guests to respond, select dietary requirements, and note plus-ones with instant state persistence.
- **Optimistic Updates**: Real-time optimistic UI updates with debounced `PATCH` synchronization and rollback protection.

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Set your backend REST API URL in `.env`:

```env
VITE_API_URL=http://localhost:8000
```

### 3. Run Development Server

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

## Backend Endpoints

The frontend connects to the following FastAPI REST routes:

- `GET /health` — Health check status (`{"status": "ok", "database": "connected"}`)
- `GET /api/events` — Retrieve event list with optional `limit`, `offset`, and `event_type`
- `GET /api/events/{id}` — Retrieve specific event by UUID
- `POST /api/events` — Create new event
- `PATCH /api/events/{id}` — Merge and update event fields and workspace plan
- `DELETE /api/events/{id}` — Delete event by UUID
- `POST /api/generate-plan` — Rule-based budget breakdown, warnings, and checklist generator

## Deployment on Vercel

1. Push your repository to GitHub / GitLab.
2. Import the project into Vercel.
3. In the Vercel project settings, navigate to **Environment Variables** and add:
   - `VITE_API_URL`: Your deployed FastAPI backend URL (e.g. `https://api.yourdomain.com`).
4. Build settings:
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
5. **CORS Note**: Ensure your FastAPI backend's `ALLOWED_ORIGINS` configuration includes your Vercel deployment URL (e.g., `https://eventpilot-ai.vercel.app` or `*`) to permit cross-origin requests.
