-- 048_enable_rls_everywhere.sql
--
-- Answers the Supabase advisor's `rls_disabled_in_public` alert, keeps
-- answering it, and — the part that matters — reports what it found somewhere
-- a phone can read.
--
-- Every table created by a migration in this repo already has RLS enabled,
-- checked one by one. Whatever the advisor flagged was created by hand in the
-- SQL editor or belongs to an extension. Confirmed 2026-08-09: one row,
-- `public.spatial_ref_sys`, owner supabase_admin — PostGIS's EPSG projection
-- table, no user data, brought in because 017 installs the extension without
-- `with schema`.
--
-- Written as FUNCTIONS rather than a DO block on purpose. The debug panel
-- applies migrations through `exec_sql`, which returns void, so a DO block's
-- RAISE NOTICE output goes nowhere — from a phone the migration would succeed
-- and say nothing, which is the same as not knowing. These return rows, so
-- /debug can show them and re-show them later.
--
-- The sweep enables RLS WITH NO POLICIES, deliberately: that is the model the
-- rest of the schema uses for shared tables (031, 037). The service-role key
-- bypasses RLS and every database access in the app holds it, while `anon` and
-- `authenticated` are reduced to nothing. Neither role is used anywhere —
-- src/lib/supabase/client.ts is imported by nothing and no component calls
-- .rpc() — so this cannot break a read path. A table that genuinely needs
-- browser access needs a policy written for it on purpose.

-- ---------------------------------------------------------------------------
-- What is exposed, right now.
-- ---------------------------------------------------------------------------
create or replace function public.debug_rls_status()
returns table (
  table_name text,
  rls_enabled boolean,
  owner text,
  owned_by_extension boolean
)
language sql
security definer
set search_path = public
as $$
  select
    c.relname::text,
    c.relrowsecurity,
    pg_catalog.pg_get_userbyid(c.relowner)::text,
    exists (
      select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e'
    )
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
  order by c.relrowsecurity, c.relname;
$$;

-- ---------------------------------------------------------------------------
-- Who can touch a given table, regardless of RLS.
--
-- RLS is not the only gate: a role also needs table privileges. This is what
-- turns "spatial_ref_sys is world-readable" from an alert into a decision —
-- reading EPSG constants is harmless, but a DELETE would break every
-- coordinate transform the charger map depends on.
-- ---------------------------------------------------------------------------
create or replace function public.debug_table_grants(p_table text)
returns table (grantee text, privileges text)
language sql
security definer
set search_path = public
as $$
  select
    g.grantee::text,
    string_agg(g.privilege_type, ', ' order by g.privilege_type)::text
  from information_schema.role_table_grants g
  where g.table_schema = 'public'
    and g.table_name = p_table
    and g.grantee in ('anon', 'authenticated', 'PUBLIC')
  group by g.grantee;
$$;

-- ---------------------------------------------------------------------------
-- The sweep. Returns one row per table it considered.
--
-- Extension-owned tables are skipped, and that is what keeps this runnable:
-- `alter table public.spatial_ref_sys` fails with "must be owner" for the
-- migration role, and a statement that aborts would take the real fixes with
-- it. Anything else that cannot be altered is caught per table and reported
-- rather than raised.
-- ---------------------------------------------------------------------------
create or replace function public.debug_enable_rls_everywhere()
returns table (table_name text, action text)
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  for t in
    select c.oid, c.relname,
           exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e') as from_extension
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity = false
    order by c.relname
  loop
    if t.from_extension then
      table_name := t.relname; action := 'skipped — owned by an extension';
      return next;
      continue;
    end if;

    begin
      execute format('alter table public.%I enable row level security', t.relname);
      table_name := t.relname; action := 'RLS enabled';
      return next;
    exception when insufficient_privilege then
      table_name := t.relname;
      action := format('skipped — not owned by %s', current_user);
      return next;
    end;
  end loop;
end $$;

revoke all on function public.debug_rls_status() from public, anon, authenticated;
revoke all on function public.debug_table_grants(text) from public, anon, authenticated;
revoke all on function public.debug_enable_rls_everywhere() from public, anon, authenticated;
grant execute on function public.debug_rls_status() to service_role;
grant execute on function public.debug_table_grants(text) to service_role;
grant execute on function public.debug_enable_rls_everywhere() to service_role;

-- Run it once, now. Applying the migration is meant to fix the thing, not just
-- install the ability to.
select public.debug_enable_rls_everywhere();
