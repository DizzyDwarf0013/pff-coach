-- PFF Coach sync: every client, session, measurement, exercise, class plan and the settings
-- are stored as one JSON document per row, owned by the signed-in account.

create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  store text not null check (store in ('clients', 'sessions', 'measurements', 'exercises', 'classes', 'settings')),
  id text not null check (length(id) between 1 and 200),
  data jsonb,
  deleted boolean not null default false,
  client_updated_at timestamptz not null default now(), -- when the device made the change (last edit wins)
  updated_at timestamptz not null default now(),        -- when the server received it (devices pull changes after this)
  primary key (user_id, store, id)
);

create index if not exists records_user_updated_idx on public.records (user_id, updated_at);

alter table public.records enable row level security;

drop policy if exists "Own records: read" on public.records;
drop policy if exists "Own records: add" on public.records;
drop policy if exists "Own records: change" on public.records;
drop policy if exists "Own records: remove" on public.records;
create policy "Own records: read" on public.records for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own records: add" on public.records for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Own records: change" on public.records for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own records: remove" on public.records for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.records from anon;
grant select, insert, update, delete on public.records to authenticated;

-- Upload a batch of changes. A change is kept only if it is at least as new as what the server has,
-- so an older edit from a device that was offline never overwrites a newer one.
create or replace function public.sync_push(items jsonb)
returns integer
language sql
security invoker
set search_path = ''
as $$
  with incoming as (
    select x.store, x.id, x.data, coalesce(x.deleted, false) as deleted, coalesce(x.client_updated_at, now()) as client_updated_at
    from jsonb_to_recordset(items) as x(store text, id text, data jsonb, deleted boolean, client_updated_at timestamptz)
  ), saved as (
    insert into public.records as r (user_id, store, id, data, deleted, client_updated_at, updated_at)
    select (select auth.uid()), store, id, case when deleted then null else data end, deleted, client_updated_at, clock_timestamp()
    from incoming
    on conflict (user_id, store, id) do update
      set data = excluded.data, deleted = excluded.deleted, client_updated_at = excluded.client_updated_at, updated_at = clock_timestamp()
      where excluded.client_updated_at >= r.client_updated_at
    returning 1
  )
  select count(*)::integer from saved;
$$;

revoke all on function public.sync_push(jsonb) from public, anon;
grant execute on function public.sync_push(jsonb) to authenticated;

-- Tiny query used by the daily keep-alive so the free project isn't paused during quiet weeks.
create or replace function public.ping()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$ select 1 $$;

grant execute on function public.ping() to anon, authenticated;
