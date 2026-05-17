-- =============================================================================
-- Flux — migration 002: mock-first multi-brand platform
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extend vehicles table for multi-brand + mock support
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
update vehicles set data_source = 'mock' where brand = 'tesla';

-- -----------------------------------------------------------------------------
-- Per-vehicle mock state (one row per vehicle, updated on every tick)
-- -----------------------------------------------------------------------------

create table if not exists mock_vehicle_state (
  vehicle_id                          uuid primary key references vehicles(id) on delete cascade,
  state                               jsonb not null,
  motion_state                        text not null
    check (motion_state in ('parked', 'driving', 'charging', 'plugged-idle')),
  scenario_id                         text,
  last_tick_at                        timestamptz not null default now(),
  -- open session tracking
  active_charging_session_start       timestamptz,
  active_charging_session_network     text,
  active_charging_session_start_soc   integer,
  active_trip_start                   timestamptz,
  active_trip_start_lat               numeric(9,6),
  active_trip_start_lng               numeric(9,6),
  active_trip_start_odometer_km       numeric(10,2)
);

-- -----------------------------------------------------------------------------
-- Charging sessions
-- -----------------------------------------------------------------------------

create table if not exists charging_sessions (
  id                  uuid primary key default uuid_generate_v4(),
  vehicle_id          uuid not null references vehicles(id) on delete cascade,
  started_at          timestamptz not null,
  ended_at            timestamptz,
  energy_added_kwh    numeric(8,2),
  start_soc           integer,
  end_soc             integer,
  network             text,           -- ionity | tesla-sc | enbw | allego | fastned | home | other
  cost_eur            numeric(8,2),
  location_lat        numeric(9,6),
  location_lng        numeric(9,6),
  location_name       text,
  max_charging_rate_kw numeric(6,2)
);

create index if not exists charging_sessions_vehicle_started_idx
  on charging_sessions(vehicle_id, started_at desc);

-- -----------------------------------------------------------------------------
-- Trips
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
-- Command events (audit log of all user / automation commands)
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
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table mock_vehicle_state enable row level security;
alter table charging_sessions   enable row level security;
alter table trips                enable row level security;
alter table command_events       enable row level security;

-- Users can read/write their own vehicle's mock state
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
