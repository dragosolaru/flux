-- =============================================================================
-- 034: collapse duplicate chargers that migration 021 could not reach.
--
-- 021 only merged rows sharing a ~11 m grid cell (coordinates rounded to 4
-- decimals). Open Charge Map community submissions for one physical site are
-- routinely 20–50 m apart, so those survived as separate rows and the map drew
-- them as two pins for one station.
--
-- This pass clusters rows within ~40 m of each other — the same SAME_SITE_M
-- radius src/lib/chargers/dedup.ts now uses — and keeps the best row per
-- cluster. Clustering is partitioned by operator so genuinely co-located but
-- different networks (two brands in one car park) are never collapsed into one.
-- Rows with no operator cluster among themselves.
--
-- charger_connectors and charger_sources cascade-delete with the removed rows.
-- On the next ingest the freed source refs fail the definite (source, ref)
-- match and re-attach to the survivor via the same-site merge, so this stays
-- collapsed rather than reappearing.
--
-- Idempotent: re-running is a no-op once each cluster holds a single row.
-- =============================================================================

with clustered as (
  select
    id,
    confidence,
    source_count,
    st_clusterdbscan(
      location::geometry,
      -- ~40 m expressed in degrees of latitude (40 / 111320).
      eps := 0.00036,
      minpoints := 1
    ) over (partition by coalesce(operator_id, '~unknown')) as cluster_id,
    coalesce(operator_id, '~unknown') as operator_key
  from chargers
),
ranked as (
  select
    id,
    row_number() over (
      partition by operator_key, cluster_id
      order by confidence desc, source_count desc, id
    ) as rn
  from clustered
)
delete from chargers
where id in (select id from ranked where rn > 1);
