-- =============================================================================
-- 034: collapse duplicate chargers that migration 021 could not reach.
--
-- 021 only merged rows sharing a ~11 m grid cell (coordinates rounded to 4
-- decimals). Open Charge Map community submissions for one physical site are
-- routinely 20–50 m apart, so those survived as separate rows and the map drew
-- them as two pins for one station.
--
-- Implementation notes (an earlier ST_ClusterDBSCAN version of this migration
-- timed out and is deliberately not used):
--
--   * ST_ClusterDBSCAN is a window function — it materialises the whole table
--     in one window and cannot use the GiST index, so on a table holding
--     several bulk-imported countries it exceeds the statement timeout.
--     ST_DWithin on the geography column is index-accelerated
--     (chargers_geo_gix, migration 017) and stays fast.
--   * DBSCAN also had to express the radius in degrees, which is only correct
--     north-south: at 41°N a degree of longitude is ~84 km, so a fixed degree
--     eps traced an ellipse ~40 m tall and ~30 m wide. ST_DWithin on geography
--     measures true metres in every direction.
--
-- A row is deleted when a strictly better row (higher confidence, then more
-- sources, then greater id — a total order, so exactly one row of any pair
-- survives) sits within SAME_SITE_M = 40 m and carries a compatible operator.
-- Rows with no operator are compared against each other only, so a genuinely
-- co-located different network is never collapsed.
--
-- Chains collapse transitively (A–B and B–C both within 40 m merges all three
-- even if A–C is 70 m apart). That matches how the runtime clusters arrivals in
-- src/lib/chargers/dedup.ts and is bounded by the 40 m step.
--
-- charger_connectors and charger_sources cascade-delete with the removed rows.
-- On the next ingest the freed source refs fail the definite (source, ref)
-- match and re-attach to the survivor via the same-site merge, so this stays
-- collapsed rather than reappearing.
--
-- Idempotent: re-running is a no-op once every site holds a single row.
-- =============================================================================

-- p_limit bounds a single call so a very large group can be worked through in
-- batches: re-run the same call until it returns 0. Rows whose country is NULL
-- are usually the largest group (sources that do not report a country), so that
-- pass in particular wants a batch limit.
--
-- The country predicate is branched rather than written as a single
-- `country is not distinct from p_country`: that operator has no btree operator
-- class, so it forces a sequential scan over the whole table. `= p_country` and
-- `is null` both use chargers_country (btree indexes do store NULLs).
create or replace function public.dedupe_chargers_by_site(
  p_country char(2),
  p_limit   integer default 200000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  if p_country is null then
    delete from chargers
    where id in (
      select c.id
      from chargers c
      where c.country is null
        and exists (
          select 1
          from chargers k
          where k.id <> c.id
            and st_dwithin(c.location, k.location, 40)
            and coalesce(k.operator_id, '~unknown') = coalesce(c.operator_id, '~unknown')
            and (k.confidence, k.source_count, k.id) > (c.confidence, c.source_count, c.id)
        )
      limit p_limit
    );
  else
    delete from chargers
    where id in (
      select c.id
      from chargers c
      where c.country = p_country
        and exists (
          select 1
          from chargers k
          where k.id <> c.id
            and st_dwithin(c.location, k.location, 40)
            and coalesce(k.operator_id, '~unknown') = coalesce(c.operator_id, '~unknown')
            and (k.confidence, k.source_count, k.id) > (c.confidence, c.source_count, c.id)
        )
      limit p_limit
    );
  end if;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Country-agnostic batched pass. Prefer this: `country` is NULL on the large
-- majority of rows, because Overpass/OSM data carries no country (addr:country
-- is rarely tagged — country is implied geographically), so partitioning the
-- work by country leaves most of the table untouched and pushes everything into
-- one oversized NULL pass. Re-run until it returns 0.
create or replace function public.dedupe_chargers_batch(p_limit integer default 2000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from chargers
  where id in (
    select c.id
    from chargers c
    where exists (
      select 1
      from chargers k
      where k.id <> c.id
        and st_dwithin(c.location, k.location, 40)
        and coalesce(k.operator_id, '~unknown') = coalesce(c.operator_id, '~unknown')
        and (k.confidence, k.source_count, k.id) > (c.confidence, c.source_count, c.id)
    )
    limit p_limit
  );

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Run repeatedly until it reports 0.
select public.dedupe_chargers_batch(2000) as deleted;

-- Per-country variant, kept for targeting a single country. See the note above:
-- on this dataset it only reaches the minority of rows that carry a country.
select 'ro' as country, public.dedupe_chargers_by_site('RO') as deleted;
select 'bg' as country, public.dedupe_chargers_by_site('BG') as deleted;
select 'gr' as country, public.dedupe_chargers_by_site('GR') as deleted;
select 'rs' as country, public.dedupe_chargers_by_site('RS') as deleted;
select 'mk' as country, public.dedupe_chargers_by_site('MK') as deleted;
select 'hu' as country, public.dedupe_chargers_by_site('HU') as deleted;
select 'at' as country, public.dedupe_chargers_by_site('AT') as deleted;
select 'hr' as country, public.dedupe_chargers_by_site('HR') as deleted;
select 'si' as country, public.dedupe_chargers_by_site('SI') as deleted;
select 'de' as country, public.dedupe_chargers_by_site('DE') as deleted;
select 'fr' as country, public.dedupe_chargers_by_site('FR') as deleted;
select 'nl' as country, public.dedupe_chargers_by_site('NL') as deleted;
-- Rows with no country are typically the largest group; run in batches until 0.
select 'null' as country, public.dedupe_chargers_by_site(null, 2000) as deleted;
