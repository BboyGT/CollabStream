create extension if not exists pgcrypto;

alter table if exists public.profiles enable row level security;
alter table if exists public.sessions enable row level security;
alter table if exists public.audit_events enable row level security;
alter table if exists public.webhooks enable row level security;
alter table if exists public.whiteboards enable row level security;

do $$
begin
  if to_regclass('public.profiles') is not null and not exists (
    select 1 from pg_constraint where conname = 'profiles_plan_check' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_plan_check check (plan in ('free', 'pro', 'business')) not valid;
  end if;

  if to_regclass('public.sessions') is not null and not exists (
    select 1 from pg_constraint where conname = 'sessions_join_mode_check' and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_join_mode_check check (join_mode in ('open', 'approval', 'locked')) not valid;
  end if;

  if to_regclass('public.sessions') is not null and not exists (
    select 1 from pg_constraint where conname = 'sessions_status_check' and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_status_check check (status in ('active', 'ended')) not valid;
  end if;

  if to_regclass('public.sessions') is not null then
    alter table public.sessions validate constraint sessions_join_mode_check;
    alter table public.sessions validate constraint sessions_status_check;
  end if;
  if to_regclass('public.profiles') is not null then
    alter table public.profiles validate constraint profiles_plan_check;
  end if;
end $$;

create index if not exists sessions_host_started_idx on public.sessions (host_id, started_at desc);
create index if not exists sessions_status_started_idx on public.sessions (status, started_at desc);
create index if not exists audit_events_session_created_idx on public.audit_events (session_id, created_at);
create index if not exists webhooks_host_idx on public.webhooks (host_id);
create index if not exists whiteboards_host_updated_idx on public.whiteboards (host_id, updated_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists whiteboards_set_updated_at on public.whiteboards;
create trigger whiteboards_set_updated_at
before update on public.whiteboards
for each row execute function public.set_updated_at();

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.sessions to authenticated;
grant select on public.audit_events to authenticated;
grant select, insert, update, delete on public.webhooks to authenticated;
grant select, insert, update, delete on public.whiteboards to authenticated;
