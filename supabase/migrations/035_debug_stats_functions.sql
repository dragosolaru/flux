-- =============================================================================
-- 035: read-only aggregate helpers for the admin debug panel.
--
-- PostgREST cannot express these as a plain select (count with FILTER, count
-- DISTINCT), and pulling the rows into the app to count them client-side would
-- mean shipping the whole charger table. Both functions are read-only and
-- return aggregates only — no charger rows leave the database through them.
--
-- security definer so the aggregates work regardless of the caller's RLS view;
-- the API route in front of them is admin-gated.
-- =============================================================================

create or replace function public.debug_charger_stats()
returns table (
  total       bigint,
  no_country  bigint,
  operators   bigint,
  no_operator bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*)                                        as total,
    count(*) filter (where country is null)          as no_country,
    count(distinct operator_id)                      as operators,
    count(*) filter (where operator_id is null)      as no_operator
  from chargers;
$$;

create or replace function public.debug_source_counts()
returns table (
  source text,
  rows   bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select source, count(*) as rows
  from charger_sources
  group by source
  order by count(*) desc;
$$;

revoke all on function public.debug_charger_stats() from public, anon;
revoke all on function public.debug_source_counts() from public, anon;
grant execute on function public.debug_charger_stats() to service_role;
grant execute on function public.debug_source_counts() to service_role;
