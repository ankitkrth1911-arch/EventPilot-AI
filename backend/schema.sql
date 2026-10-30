-- ==============================================================================
-- EventPilot AI - Supabase Database Schema
-- Table: public.events
--
-- Instructions:
-- 1. Open your Supabase Dashboard: https://supabase.com/dashboard
-- 2. Select your project and navigate to the "SQL Editor" tab in the left sidebar.
-- 3. Click "New Query", paste the SQL below, and click "Run".
-- ==============================================================================

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

-- Recommended indexes for performant querying:
create index if not exists idx_events_created_at on public.events (created_at desc);
create index if not exists idx_events_event_type on public.events (event_type);
