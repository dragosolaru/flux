-- 021: collapse coincident duplicate chargers already stored.
--
-- Open Charge Map frequently has several community-submitted POIs at the exact
-- same coordinate for one physical site. Earlier ingests stored each as its own
-- row (their match score fell just below the merge threshold), so a single site
-- rendered as a stack of pins that the map spiderfied into one point.
--
-- Keep the best row per ~11 m location cell and delete the rest; charger_connectors
-- and charger_sources cascade-delete with them. On the next ingest the freed OCM
-- source refs fail the definite (source, ref) match and re-attach to the survivor
-- via the same-site merge in src/lib/chargers/dedup.ts — so this stays collapsed.
--
-- Idempotent: re-running is a no-op once each cell holds a single row.

with ranked as (
  select
    id,
    row_number() over (
      partition by
        round(st_y(location::geometry)::numeric, 4),
        round(st_x(location::geometry)::numeric, 4)
      order by confidence desc, source_count desc, id
    ) as rn
  from chargers
)
delete from chargers
where id in (select id from ranked where rn > 1);
