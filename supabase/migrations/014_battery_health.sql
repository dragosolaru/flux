-- Daily battery State-of-Health (SoH) history for the degradation chart.
-- One row per (vehicle, day); SoH is battery_range / rated_range as a percent.
create table if not exists battery_health_history (
  id            uuid primary key default uuid_generate_v4(),
  vehicle_id    uuid not null references vehicles(id) on delete cascade,
  recorded_date date not null,
  soh_pct       numeric(5,2) not null,
  created_at    timestamptz not null default now(),
  unique (vehicle_id, recorded_date)
);

create index if not exists battery_health_vehicle_date_idx
  on battery_health_history(vehicle_id, recorded_date desc);

alter table battery_health_history enable row level security;

drop policy if exists "Users access own battery health" on battery_health_history;
create policy "Users access own battery health"
  on battery_health_history for all
  using (vehicle_id in (select id from vehicles where user_id = auth.uid()));
