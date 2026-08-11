-- 048_enable_rls_everywhere.sql
--
-- Answers the Supabase advisor's `rls_disabled_in_public` alert, and keeps
-- answering it.
--
-- Every table created by a migration in this repo already has RLS enabled —
-- checked one by one. So whatever the advisor flagged either was created by
-- hand in the SQL editor, or belongs to an extension. This migration enables
-- RLS on every ordinary table in `public` that does not have it, rather than
-- naming one, because a list would go stale the next time a table is created
-- outside a migration — which is how this happened.
--
-- WITH NO POLICIES, DELIBERATELY. That is the model the rest of the schema
-- already uses for shared tables (031, 037): the service-role key bypasses RLS
-- entirely and every database access in the app goes through a Next.js route
-- holding it, while `anon` and `authenticated` are reduced to no access at all.
-- Nothing in the app uses those two roles — src/lib/supabase/client.ts is
-- imported by nothing and no component calls .rpc() — so this cannot break a
-- read path. If a table ever does need browser access, it needs a policy
-- written for it on purpose.
--
-- EXTENSION TABLES ARE SKIPPED, and this is the part that matters for the
-- alert. PostGIS (017) installs into `public`, which creates
-- `public.spatial_ref_sys` — ~8500 rows of EPSG projection definitions, no user
-- data, owned by the extension. `alter table` on it fails with "must be owner
-- of table spatial_ref_sys" for the migration role, so a migration that tried
-- would abort and take the real fixes with it. The loop below skips anything
-- owned by an extension and anything it cannot alter, and reports what it did.
--
-- It IS the flagged table — confirmed 2026-08-09, one row, owner
-- supabase_admin. PostGIS does not support `alter extension ... set schema`,
-- so relocating it means dropping and recreating the extension and every
-- geometry column with it. The remedy is to check whether anon/authenticated
-- hold write privileges on it and revoke those if so; the read is harmless.
-- See docs/MIGRATIONS-PENDING.md §0 for the two queries.

do $$
declare
  t record;
  enabled int := 0;
  skipped int := 0;
begin
  for t in
    select c.oid, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity = false
      -- Anything an extension owns is not ours to alter.
      and not exists (
        select 1 from pg_depend d
        where d.objid = c.oid
          and d.deptype = 'e'
      )
    order by c.relname
  loop
    begin
      execute format('alter table public.%I enable row level security', t.relname);
      raise notice 'RLS enabled on public.%', t.relname;
      enabled := enabled + 1;
    exception when insufficient_privilege then
      -- Not ours. Report rather than abort, so one unowned table cannot
      -- prevent the rest from being secured.
      raise notice 'SKIPPED public.% — not owned by %', t.relname, current_user;
      skipped := skipped + 1;
    end;
  end loop;

  raise notice 'RLS sweep complete: % enabled, % skipped', enabled, skipped;
end $$;

-- What is still exposed after this runs. Expect zero rows; anything listed is
-- extension-owned and needs the decision in the header rather than a migration.
select
  c.relname as still_without_rls,
  pg_catalog.pg_get_userbyid(c.relowner) as owner
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = false
order by c.relname;
