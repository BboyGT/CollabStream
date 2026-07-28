alter table if exists public.sessions
  add column if not exists host_token text;

alter table if exists public.sessions
  drop constraint if exists sessions_status_check;

alter table if exists public.sessions
  add constraint sessions_status_check
  check (status in ('scheduled', 'active', 'ended'));

create index if not exists sessions_host_status_started_idx
  on public.sessions (host_id, status, started_at desc);

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

drop policy if exists "webhook deliveries are readable by owner" on public.webhook_deliveries;
create policy "webhook deliveries are readable by owner" on public.webhook_deliveries
  for select using ((select auth.uid()) = host_id);

create index if not exists webhook_deliveries_webhook_created_idx
  on public.webhook_deliveries (webhook_id, created_at desc);

grant select on public.webhook_deliveries to authenticated;
