-- 053_vehicle_is_a_record.sql
--
-- Two changes that follow from the Tesla integration being withdrawn, and one
-- gap they exposed.
--
-- **`data_source = 'live'` is renamed to `'real'`.** "Live" described a
-- connection that no longer exists — a car we polled. What that row means now
-- is *your car*, as opposed to the simulator: a record that documents, costs
-- and odometer readings hang off, with no telemetry of any kind. Leaving it
-- called `live` is how a screen ends up printing a green "Live" badge next to
-- an empty page, which is exactly what it did.
--
-- **`odometer_readings`.** The gap: `POST /api/vehicles` creates simulators
-- only — the comment in it says so — because a real car used to arrive through
-- the Tesla OAuth flow. With that flow deleted there was no way to add your own
-- car at all, while the paid product is entirely about attaching paperwork to
-- one. Kilometres are the other half: without two readings apart in time there
-- is no cost per kilometre and no saving against petrol, which is what the
-- pricing page promises.
--
-- A separate table rather than a column on `vehicles`, because a reading is an
-- observation with a time and a source, not a property of the car. Writing them
-- into `vehicle_snapshots` was the tempting shortcut and would have mixed
-- hand-typed numbers into a telemetry table with no marker — the same ambiguity
-- that produced C1–C5.

alter table vehicles drop constraint if exists vehicles_data_source_check;
update vehicles set data_source = 'real' where data_source = 'live';
alter table vehicles
  add constraint vehicles_data_source_check
  check (data_source in ('mock', 'real'));

create table if not exists odometer_readings (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references vehicles(id) on delete cascade,
  km          numeric not null check (km >= 0),
  recorded_at timestamptz not null default now(),
  -- How the number arrived. 'manual' is typed by hand, 'document' is read off
  -- an ITP certificate or a service invoice, 'photo' off the car's own screen.
  source      text not null default 'manual'
                check (source in ('manual', 'document', 'photo')),
  -- Below the review threshold the number is confirmed before it counts. Null
  -- for a hand-typed reading, which has no confidence to report.
  confidence  numeric,
  created_at  timestamptz not null default now()
);

-- The two questions asked of this table: the latest reading for a car, and the
-- pair spanning a period. Both are (vehicle, time).
create index if not exists odometer_readings_vehicle_recorded_idx
  on odometer_readings (vehicle_id, recorded_at desc);

-- One reading per car per instant, so a double-submitted form cannot create two.
create unique index if not exists odometer_readings_vehicle_instant_key
  on odometer_readings (vehicle_id, recorded_at);

alter table odometer_readings enable row level security;

-- Read and write your own car's readings, and nobody else's. Ownership is on
-- `vehicles`, so it is checked there rather than duplicated as a column here.
create policy odometer_readings_owner on odometer_readings
  for all
  using (
    exists (
      select 1 from vehicles v
      where v.id = odometer_readings.vehicle_id and v.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from vehicles v
      where v.id = odometer_readings.vehicle_id and v.user_id = auth.uid()
    )
  );
