-- ============================================================================
-- CollabStream — EXAMPLE base schema
-- ============================================================================
-- This is NOT the maintainer's real production schema or migration history
-- (see supabase/migrations/README.md — that's intentionally private). This
-- file exists so someone standing up their own CollabStream instance from
-- this public repo has a working starting point, derived by reading every
-- Supabase query in apps/server/src/db.js and apps/server/src/index.js.
--
-- Apply this BEFORE the files already in supabase/migrations/ — those are
-- hardening/optimization migrations written as `alter table if exists ...`
-- specifically because they assume a base schema like this one already
-- exists. This file is deliberately NOT placed in supabase/migrations/ so it
-- can't be mistaken for part of the maintainer's real migration history or
-- get silently picked up by `supabase db push` alongside it.
--
-- Review before running in production: adjust RLS policies to your actual
-- auth/plan model, and treat the values here as a reasonable default, not a
-- guarantee of correctness for your deployment.
-- ============================================================================

create extension if not exists pgcrypto;

-- ── profiles ──────────────────────────────────────────────────────────────
-- One row per authenticated user (id matches auth.users.id). Read via
-- requireAuth/requirePlan in index.js on every authenticated request.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro', 'business')),
  stripe_customer_id text,
  stripe_subscription_id text,
  logo_url text,
  accent_color text default '#22d3ee',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by owner" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles are updatable by owner" on public.profiles
  for update using (auth.uid() = id);
create policy "profiles are insertable by owner" on public.profiles
  for insert with check (auth.uid() = id);

-- Auto-create a free-plan profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── sessions ──────────────────────────────────────────────────────────────
-- One row per CollabStream room. id matches the in-memory rooms.js
-- sessionId (nanoid string, not a uuid) — see createSessionRecord in db.js.
create table if not exists public.sessions (
  id text primary key,
  host_id uuid references auth.users (id) on delete set null,
  host_token text,
  session_name text,
  join_code text,
  short_code text,
  join_mode text not null default 'open' check (join_mode in ('open', 'approval', 'locked')),
  max_guests integer,
  duration_minutes integer not null default 120,
  peak_guests integer not null default 0,
  recording_url text,
  status text not null default 'active' check (status in ('scheduled', 'active', 'ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

alter table public.sessions enable row level security;

create policy "sessions are readable by their host" on public.sessions
  for select using (auth.uid() = host_id);

-- ── audit_events ─────────────────────────────────────────────────────────
-- Append-only log per session (host lock/unlock, guest join/leave, etc).
create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  session_id text not null references public.sessions (id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_events enable row level security;

create policy "audit events are readable by the session's host" on public.audit_events
  for select using (
    exists (
      select 1 from public.sessions s
      where s.id = audit_events.session_id and s.host_id = auth.uid()
    )
  );

-- ── webhooks ──────────────────────────────────────────────────────────────
-- Business-plan hosts' configured webhook endpoints.
create table if not exists public.webhooks (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users (id) on delete cascade,
  url text not null,
  events text[] not null default array['session.start', 'session.end', 'guest.join', 'recording.ready'],
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.webhooks enable row level security;

create policy "webhooks are manageable by owner" on public.webhooks
  for all using (auth.uid() = host_id) with check (auth.uid() = host_id);

-- ── webhook_deliveries ───────────────────────────────────────────────────
-- Delivery log for the Settings → Webhooks → "View log" panel (design idea
-- §3.3 in AUDIT.md). Optional: everything else in the app works fine
-- without this table — logging just becomes a silent no-op if it's absent.
create table if not exists public.webhook_deliveries (
  id bigint generated always as identity primary key,
  webhook_id uuid not null references public.webhooks (id) on delete cascade,
  host_id uuid references auth.users (id) on delete cascade,
  event text not null,
  status_code integer,
  ok boolean not null default false,
  error text,
  created_at timestamptz not null default now()
);

alter table public.webhook_deliveries enable row level security;

create policy "webhook deliveries are readable by owner" on public.webhook_deliveries
  for select using (auth.uid() = host_id);

create index if not exists webhook_deliveries_webhook_created_idx
  on public.webhook_deliveries (webhook_id, created_at desc);

-- ── whiteboards ───────────────────────────────────────────────────────────
-- Business-plan saved/persistent whiteboards (separate from the ephemeral
-- in-call whiteboard, which lives only in the WebRTC data channel).
create table if not exists public.whiteboards (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  strokes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whiteboards enable row level security;

create policy "whiteboards are manageable by owner" on public.whiteboards
  for all using (auth.uid() = host_id) with check (auth.uid() = host_id);

-- ── indexes matching the query patterns in db.js ────────────────────────
create index if not exists sessions_host_started_idx on public.sessions (host_id, started_at desc);
create index if not exists sessions_status_started_idx on public.sessions (status, started_at desc);
create index if not exists audit_events_session_created_idx on public.audit_events (session_id, created_at);
create index if not exists webhooks_host_idx on public.webhooks (host_id);
create index if not exists whiteboards_host_updated_idx on public.whiteboards (host_id, updated_at desc);

-- ── grants ────────────────────────────────────────────────────────────────
-- The server itself uses the service role key (bypasses RLS entirely — see
-- db.js's top comment). These grants are for anything queried directly from
-- the browser with the anon/authenticated key instead (auth.js, Supabase
-- Realtime, etc), gated by the RLS policies above.
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.sessions to authenticated;
grant select on public.audit_events to authenticated;
grant select, insert, update, delete on public.webhooks to authenticated;
grant select on public.webhook_deliveries to authenticated;
grant select, insert, update, delete on public.whiteboards to authenticated;
