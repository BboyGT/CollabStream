create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  plan text not null default 'free' check (plan in ('free', 'pro', 'business')),
  stripe_customer_id text,
  stripe_subscription_id text,
  logo_url text,
  accent_color text default '#22d3ee',
  created_at timestamptz default now()
);

create table if not exists public.sessions (
  id text primary key,
  host_id uuid references public.profiles(id),
  session_name text,
  join_code text,
  short_code text,
  join_mode text default 'open',
  max_guests int,
  duration_minutes int default 120,
  peak_guests int default 0,
  started_at timestamptz default now(),
  ended_at timestamptz,
  recording_url text,
  status text default 'active' check (status in ('active', 'ended'))
);

create table if not exists public.audit_events (
  id bigserial primary key,
  session_id text references public.sessions(id) on delete cascade,
  event_type text not null,
  payload jsonb,
  created_at timestamptz default now()
);

create table if not exists public.whiteboards (
  id uuid default gen_random_uuid() primary key,
  host_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  strokes jsonb default '[]'::jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.webhooks (
  id uuid default gen_random_uuid() primary key,
  host_id uuid references public.profiles(id) on delete cascade,
  url text not null,
  events text[] default array['session.start','session.end','guest.join','recording.ready'],
  active boolean default true,
  created_at timestamptz default now()
);

create index if not exists sessions_host_started_idx on public.sessions(host_id, started_at desc);
create index if not exists audit_events_session_created_idx on public.audit_events(session_id, created_at);
create index if not exists whiteboards_host_updated_idx on public.whiteboards(host_id, updated_at desc);
create index if not exists webhooks_host_active_idx on public.webhooks(host_id, active);

alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.audit_events enable row level security;
alter table public.whiteboards enable row level security;
alter table public.webhooks enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Users can read own sessions" on public.sessions;
create policy "Users can read own sessions" on public.sessions
  for select using (auth.uid() = host_id);

drop policy if exists "Users can read audit events for own sessions" on public.audit_events;
create policy "Users can read audit events for own sessions" on public.audit_events
  for select using (
    exists (
      select 1
      from public.sessions
      where sessions.id = audit_events.session_id
        and sessions.host_id = auth.uid()
    )
  );

drop policy if exists "Users can manage own whiteboards" on public.whiteboards;
create policy "Users can manage own whiteboards" on public.whiteboards
  for all using (auth.uid() = host_id) with check (auth.uid() = host_id);

drop policy if exists "Users can manage own webhooks" on public.webhooks;
create policy "Users can manage own webhooks" on public.webhooks
  for all using (auth.uid() = host_id) with check (auth.uid() = host_id);

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.sessions to authenticated;
grant select on public.audit_events to authenticated;
grant select, insert, update, delete on public.whiteboards to authenticated;
grant select, insert, update, delete on public.webhooks to authenticated;
grant usage, select on all sequences in schema public to authenticated;
