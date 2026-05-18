-- =============================================================================
-- Flux — CONSOLIDATED migration (002 + 003 + 004 in one paste-and-run)
--
-- Paste this entire file into Supabase SQL Editor and run once.
-- All statements are idempotent (use IF NOT EXISTS / IF EXISTS).
-- Safe to re-run if migrations have been partially applied.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 002: Extend vehicles table for multi-brand + mock support
-- -----------------------------------------------------------------------------

alter table vehicles
  add column if not exists data_source text not null default 'mock'
    check (data_source in ('mock', 'live')),
  add column if not exists model       text,
  add column if not exists year        integer,
  add column if not exists trim        text,
  add column if not exists color       text,
  add column if not exists photo_url   text,
  add column if not exists nickname    text;

-- tesla_region becomes nullable (non-Tesla brands don't need it)
alter table vehicles
  alter column tesla_region drop not null,
  alter column tesla_region set default null;

-- Migrate existing real Tesla vehicle to mock for demo consistency
update vehicles set data_source = 'mock' where brand = 'tesla' and data_source is null;

-- -----------------------------------------------------------------------------
-- 002: Per-vehicle mock state (one row per vehicle, updated on every tick)
-- -----------------------------------------------------------------------------

create table if not exists mock_vehicle_state (
  vehicle_id                          uuid primary key references vehicles(id) on delete cascade,
  state                               jsonb not null,
  motion_state                        text not null
    check (motion_state in ('parked', 'driving', 'charging', 'plugged-idle')),
  scenario_id                         text,
  last_tick_at                        timestamptz not null default now(),
  active_charging_session_start       timestamptz,
  active_charging_session_network     text,
  active_charging_session_start_soc   integer,
  active_trip_start                   timestamptz,
  active_trip_start_lat               numeric(9,6),
  active_trip_start_lng               numeric(9,6),
  active_trip_start_odometer_km       numeric(10,2)
);

-- -----------------------------------------------------------------------------
-- 002: Charging sessions
-- -----------------------------------------------------------------------------

create table if not exists charging_sessions (
  id                  uuid primary key default uuid_generate_v4(),
  vehicle_id          uuid not null references vehicles(id) on delete cascade,
  started_at          timestamptz not null,
  ended_at            timestamptz,
  energy_added_kwh    numeric(8,2),
  start_soc           integer,
  end_soc             integer,
  network             text,
  cost_eur            numeric(8,2),
  location_lat        numeric(9,6),
  location_lng        numeric(9,6),
  location_name       text,
  max_charging_rate_kw numeric(6,2)
);

create index if not exists charging_sessions_vehicle_started_idx
  on charging_sessions(vehicle_id, started_at desc);

-- -----------------------------------------------------------------------------
-- 002: Trips
-- -----------------------------------------------------------------------------

create table if not exists trips (
  id                        uuid primary key default uuid_generate_v4(),
  vehicle_id                uuid not null references vehicles(id) on delete cascade,
  started_at                timestamptz not null,
  ended_at                  timestamptz,
  start_lat                 numeric(9,6),
  start_lng                 numeric(9,6),
  end_lat                   numeric(9,6),
  end_lng                   numeric(9,6),
  start_address             text,
  end_address               text,
  distance_km               numeric(8,2),
  energy_used_kwh           numeric(8,2),
  avg_speed_kmh             numeric(6,2),
  max_speed_kmh             numeric(6,2),
  efficiency_kwh_per_100km  numeric(6,2)
);

create index if not exists trips_vehicle_started_idx
  on trips(vehicle_id, started_at desc);

-- -----------------------------------------------------------------------------
-- 002: Command events (audit log of all user / automation commands)
-- -----------------------------------------------------------------------------

create table if not exists command_events (
  id          uuid primary key default uuid_generate_v4(),
  vehicle_id  uuid not null references vehicles(id) on delete cascade,
  command     text not null,
  args        jsonb,
  success     boolean not null,
  error_code  text,
  source      text not null default 'user' check (source in ('user', 'automation')),
  issued_at   timestamptz not null default now()
);

create index if not exists command_events_vehicle_issued_idx
  on command_events(vehicle_id, issued_at desc);

-- -----------------------------------------------------------------------------
-- 002: Row Level Security
-- -----------------------------------------------------------------------------

alter table mock_vehicle_state enable row level security;
alter table charging_sessions  enable row level security;
alter table trips              enable row level security;
alter table command_events     enable row level security;

drop policy if exists "Users can access their own mock state" on mock_vehicle_state;
create policy "Users can access their own mock state"
  on mock_vehicle_state for all
  using (vehicle_id in (select id from vehicles where user_id = auth.uid()));

drop policy if exists "Users can access their own charging sessions" on charging_sessions;
create policy "Users can access their own charging sessions"
  on charging_sessions for all
  using (vehicle_id in (select id from vehicles where user_id = auth.uid()));

drop policy if exists "Users can access their own trips" on trips;
create policy "Users can access their own trips"
  on trips for all
  using (vehicle_id in (select id from vehicles where user_id = auth.uid()));

drop policy if exists "Users can access their own command events" on command_events;
create policy "Users can access their own command events"
  on command_events for all
  using (vehicle_id in (select id from vehicles where user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- 003: vehicle_spec column for brand-specific simulator physics
-- -----------------------------------------------------------------------------

alter table mock_vehicle_state
  add column if not exists vehicle_spec jsonb;

-- -----------------------------------------------------------------------------
-- 004: User settings (tariff provider selection)
-- -----------------------------------------------------------------------------

create table if not exists user_settings (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  tariff_provider  text not null default 'tibber-mock',
  updated_at       timestamptz not null default now()
);

alter table user_settings enable row level security;

drop policy if exists "Users can manage their own settings" on user_settings;
create policy "Users can manage their own settings"
  on user_settings for all
  using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 005: Schema hardening from senior audit (composite index, check constraints,
-- updated_at trigger, tighter RLS)
-- -----------------------------------------------------------------------------

create index if not exists vehicles_user_id_active_idx
  on vehicles(user_id, is_active);

alter table charging_sessions
  drop constraint if exists charging_sessions_network_check;
alter table charging_sessions
  add constraint charging_sessions_network_check
  check (
    network is null
    or network in ('ionity', 'tesla-sc', 'enbw', 'allego', 'fastned', 'home', 'other')
  );

alter table mock_vehicle_state
  drop constraint if exists mock_vehicle_state_scenario_id_check;
alter table mock_vehicle_state
  add constraint mock_vehicle_state_scenario_id_check
  check (
    scenario_id is null
    or scenario_id in ('commuter', 'weekend-errands', 'road-trip', 'vacation')
  );

alter table vehicles
  add column if not exists updated_at timestamptz not null default now();

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists vehicles_set_updated_at on vehicles;
create trigger vehicles_set_updated_at
  before update on vehicles
  for each row execute function set_updated_at();

drop policy if exists "Users can access their own mock state" on mock_vehicle_state;
create policy "Users can access their own mock state"
  on mock_vehicle_state for all
  using (vehicle_id in (select id from vehicles where user_id = auth.uid()))
  with check (vehicle_id in (select id from vehicles where user_id = auth.uid()));

-- =============================================================================
-- Done. Verify by running:
--   select count(*) from mock_vehicle_state;
--   select count(*) from user_settings;
--   select column_name from information_schema.columns where table_name = 'vehicles';
-- =============================================================================
