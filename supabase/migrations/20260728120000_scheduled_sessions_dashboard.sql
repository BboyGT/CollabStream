alter table if exists public.sessions
  add column if not exists host_token text;

alter table if exists public.sessions
  drop constraint if exists sessions_status_check;

alter table if exists public.sessions
  add constraint sessions_status_check
  check (status in ('scheduled', 'active', 'ended'));

create index if not exists sessions_host_status_started_idx
  on public.sessions (host_id, status, started_at desc);
