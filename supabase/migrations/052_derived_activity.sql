-- 052_derived_activity.sql
--
-- Lets trips and charging sessions be derived from `vehicle_snapshots` for a
-- real car, instead of existing only for the simulator.
--
-- The gap this closes: `trips` and `charging_sessions` were written by
-- `src/lib/mock/persistence.ts` and the history seeder, and by nothing else. So
-- for a linked Tesla the activity feed, the savings and CO₂ tiles, the monthly
-- consumption chart and the planner's personal-efficiency figure were
-- **permanently empty**, and none of them said why — which is how "7 days and
-- 30 days show the same thing" gets reported. They showed the same thing
-- because both windows were empty.
--
-- `source` says where a row came from, so a derived row can be recomputed
-- without touching a simulated or seeded one. It is nullable and unset on
-- existing rows on purpose: backfilling them to 'mock' would be a guess about
-- history, and nothing needs to know.
--
-- The partial unique indexes are what make derivation safe to re-run. A pass
-- upserts on (vehicle_id, started_at), so a period that grows as more snapshots
-- arrive updates in place rather than inserting a second copy of itself. Only
-- derived rows are constrained: the simulator legitimately produces rows that
-- would collide, and its behaviour must not change.

alter table trips add column if not exists source text;
alter table charging_sessions add column if not exists source text;

comment on column trips.source is
  'Null for simulated and seeded rows; ''derived'' for rows computed from vehicle_snapshots.';
comment on column charging_sessions.source is
  'Null for simulated and seeded rows; ''derived'' for rows computed from vehicle_snapshots.';

create unique index if not exists trips_derived_key
  on trips (vehicle_id, started_at)
  where source = 'derived';

create unique index if not exists charging_sessions_derived_key
  on charging_sessions (vehicle_id, started_at)
  where source = 'derived';

-- The derivation walks snapshots oldest-first for one vehicle. The existing
-- index is (vehicle_id, recorded_at desc), which serves that in reverse; this
-- makes the ascending scan the derivation actually does an index scan too.
create index if not exists vehicle_snapshots_vehicle_recorded_asc_idx
  on vehicle_snapshots (vehicle_id, recorded_at);
