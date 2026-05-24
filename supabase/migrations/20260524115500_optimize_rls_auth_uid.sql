drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles for select
using ((select auth.uid()) = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
on public.profiles for insert
with check ((select auth.uid()) = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Users can read own sessions" on public.sessions;
create policy "Users can read own sessions"
on public.sessions for select
using ((select auth.uid()) = host_id);

drop policy if exists "Users can read audit events for own sessions" on public.audit_events;
create policy "Users can read audit events for own sessions"
on public.audit_events for select
using (
  exists (
    select 1
    from public.sessions
    where sessions.id = audit_events.session_id
      and sessions.host_id = (select auth.uid())
  )
);

drop policy if exists "Users can manage own webhooks" on public.webhooks;
create policy "Users can manage own webhooks"
on public.webhooks for all
using ((select auth.uid()) = host_id)
with check ((select auth.uid()) = host_id);

drop policy if exists "Users can manage own whiteboards" on public.whiteboards;
create policy "Users can manage own whiteboards"
on public.whiteboards for all
using ((select auth.uid()) = host_id)
with check ((select auth.uid()) = host_id);
