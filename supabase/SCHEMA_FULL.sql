-- =============================================================================
-- FLUX — Schema complet consolidat
-- Rulează în Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Sigur de rulat de mai multe ori (idempotent).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensii
-- ---------------------------------------------------------------------------
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- 1. PROFILES
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id               uuid references auth.users on delete cascade primary key,
  full_name        text,
  avatar_url       text,
  locale           text not null default 'ro'
                   check (locale in ('ro','en','de','hu','fr')),
  display_currency text not null default 'RON'
                   check (display_currency in ('RON','EUR','USD','GBP','HUF','PLN','CHF','NOK','SEK')),
  home_address     text,
  home_lat         double precision,
  home_lng         double precision,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

alter table profiles enable row level security;

drop policy if exists "Users can only access their own profile" on profiles;
create policy "Users can only access their own profile"
  on profiles for all using (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- 2. VEHICLES
-- ---------------------------------------------------------------------------
create table if not exists vehicles (
  id                 uuid default uuid_generate_v4() primary key,
  user_id            uuid references profiles(id) on delete cascade not null,
  brand              text not null default 'tesla',
  display_name       text not null,
  vin                text,
  tesla_vehicle_id   bigint,
  tesla_region       text default null,
  data_source        text not null default 'mock'
                     check (data_source in ('mock', 'live')),
  model              text,
  year               integer,
  trim               text,
  color              text,
  photo_url          text,
  nickname           text,
  virtual_key_paired boolean not null default false,
  is_active          boolean default true,
  created_at         timestamptz default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists vehicles_user_id_idx         on vehicles(user_id);
create index if not exists vehicles_user_id_active_idx  on vehicles(user_id, is_active);

alter table vehicles enable row level security;

drop policy if exists "Users can only access their own vehicles" on vehicles;
create policy "Users can only access their own vehicles"
  on vehicles for all using (auth.uid() = user_id);

-- updated_at trigger
create or replace function set_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists vehicles_set_updated_at on vehicles;
create trigger vehicles_set_updated_at
  before update on vehicles
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. TESLA TOKENS (encrypted AES-256-GCM)
-- ---------------------------------------------------------------------------
create table if not exists tesla_tokens (
  id                 uuid default uuid_generate_v4() primary key,
  vehicle_id         uuid references vehicles(id) on delete cascade not null,
  user_id            uuid references profiles(id) on delete cascade not null,
  access_token_enc   text not null,
  refresh_token_enc  text not null,
  expires_at         timestamptz not null,
  scopes             text[] not null,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create unique index if not exists tesla_tokens_vehicle_id_idx on tesla_tokens(vehicle_id);

alter table tesla_tokens enable row level security;

drop policy if exists "Users can only access their own tokens" on tesla_tokens;
create policy "Users can only access their own tokens"
  on tesla_tokens for all using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. VEHICLE SNAPSHOTS (live data point-in-time)
-- ---------------------------------------------------------------------------
create table if not exists vehicle_snapshots (
  id               uuid default uuid_generate_v4() primary key,
  vehicle_id       uuid references vehicles(id) on delete cascade not null,
  battery_level    integer,
  battery_range_km numeric,
  odometer_km      numeric,
  interior_temp_c  numeric,
  exterior_temp_c  numeric,
  is_locked        boolean,
  is_charging      boolean,
  charging_rate_kw numeric,
  latitude         numeric,
  longitude        numeric,
  recorded_at      timestamptz default now()
);

create index if not exists vehicle_snapshots_vehicle_id_recorded_at_idx
  on vehicle_snapshots(vehicle_id, recorded_at desc);

alter table vehicle_snapshots enable row level security;

drop policy if exists "Users can only access their own snapshots" on vehicle_snapshots;
create policy "Users can only access their own snapshots"
  on vehicle_snapshots for all
  using (vehicle_id in (select id from vehicles where user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 5. MOCK VEHICLE STATE
-- ---------------------------------------------------------------------------
create table if not exists mock_vehicle_state (
  vehicle_id                        uuid primary key references vehicles(id) on delete cascade,
  state                             jsonb not null,
  motion_state                      text not null
                                    check (motion_state in ('parked','driving','charging','plugged-idle')),
  scenario_id                       text
                                    check (scenario_id is null or
                                           scenario_id in ('commuter','weekend-errands','road-trip','vacation')),
  vehicle_spec                      jsonb,
  last_tick_at                      timestamptz not null default now(),
  active_charging_session_start     timestamptz,
  active_charging_session_network   text,
  active_charging_session_start_soc integer,
  active_trip_start                 timestamptz,
  active_trip_start_lat             numeric(9,6),
  active_trip_start_lng             numeric(9,6),
  active_trip_start_odometer_km     numeric(10,2)
);

alter table mock_vehicle_state enable row level security;

drop policy if exists "Users can access their own mock state" on mock_vehicle_state;
create policy "Users can access their own mock state"
  on mock_vehicle_state for all
  using  (vehicle_id in (select id from vehicles where user_id = auth.uid()))
  with check (vehicle_id in (select id from vehicles where user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 6. CHARGING SESSIONS
-- ---------------------------------------------------------------------------
create table if not exists charging_sessions (
  id                   uuid primary key default uuid_generate_v4(),
  vehicle_id           uuid not null references vehicles(id) on delete cascade,
  started_at           timestamptz not null,
  ended_at             timestamptz,
  energy_added_kwh     numeric(8,2),
  start_soc            integer,
  end_soc              integer,
  network              text
                       check (network is null or
                              network in ('ionity','tesla-sc','enbw','allego','fastned','home','other')),
  cost_eur             numeric(8,2),
  cost_ron             numeric(8,2),
  cost_source          text
                       check (cost_source in ('document','tariff_estimate','manual')),
  location_lat         numeric(9,6),
  location_lng         numeric(9,6),
  location_name        text,
  max_charging_rate_kw numeric(6,2),
  is_home_charge       boolean,
  constraint charging_sessions_vehicle_started_uniq unique (vehicle_id, started_at)
);

create index if not exists charging_sessions_vehicle_started_idx
  on charging_sessions(vehicle_id, started_at desc);
create index if not exists charging_sessions_is_home_idx
  on charging_sessions(vehicle_id, is_home_charge)
  where is_home_charge is not null;

alter table charging_sessions enable row level security;

drop policy if exists "Users can access their own charging sessions" on charging_sessions;
create policy "Users can access their own charging sessions"
  on charging_sessions for all
  using (vehicle_id in (select id from vehicles where user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 7. TRIPS
-- ---------------------------------------------------------------------------
create table if not exists trips (
  id                       uuid primary key default uuid_generate_v4(),
  vehicle_id               uuid not null references vehicles(id) on delete cascade,
  started_at               timestamptz not null,
  ended_at                 timestamptz,
  start_lat                numeric(9,6),
  start_lng                numeric(9,6),
  end_lat                  numeric(9,6),
  end_lng                  numeric(9,6),
  start_address            text,
  end_address              text,
  distance_km              numeric(8,2),
  energy_used_kwh          numeric(8,2),
  avg_speed_kmh            numeric(6,2),
  max_speed_kmh            numeric(6,2),
  efficiency_kwh_per_100km numeric(6,2)
);

create index if not exists trips_vehicle_started_idx
  on trips(vehicle_id, started_at desc);

alter table trips enable row level security;

drop policy if exists "Users can access their own trips" on trips;
create policy "Users can access their own trips"
  on trips for all
  using (vehicle_id in (select id from vehicles where user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 8. COMMAND EVENTS
-- ---------------------------------------------------------------------------
create table if not exists command_events (
  id         uuid primary key default uuid_generate_v4(),
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  command    text not null,
  args       jsonb,
  success    boolean not null,
  error_code text,
  source     text not null default 'user' check (source in ('user','automation')),
  issued_at  timestamptz not null default now()
);

create index if not exists command_events_vehicle_issued_idx
  on command_events(vehicle_id, issued_at desc);

alter table command_events enable row level security;

drop policy if exists "Users can access their own command events" on command_events;
create policy "Users can access their own command events"
  on command_events for all
  using (vehicle_id in (select id from vehicles where user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 9. USER SETTINGS (tariff provider)
-- ---------------------------------------------------------------------------
create table if not exists user_settings (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  tariff_provider text not null default 'electrica-ro',
  updated_at      timestamptz not null default now()
);

alter table user_settings enable row level security;

drop policy if exists "Users can manage their own settings" on user_settings;
create policy "Users can manage their own settings"
  on user_settings for all using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 10. DOCUMENTS (OCR pipeline)
-- ---------------------------------------------------------------------------
create table if not exists documents (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  vehicle_id        uuid references vehicles(id) on delete set null,
  source            text not null check (source in ('upload','email')),
  document_type     text check (document_type in ('home_bill','public_receipt','unknown')),
  storage_path      text not null,
  mime_type         text not null,
  original_filename text,
  parsed_json       jsonb,
  status            text not null default 'pending'
                    check (status in ('pending','processing','done','error','needs_review')),
  error_message     text,
  confidence        numeric(4,3),
  sender_email      text,
  created_at        timestamptz not null default now(),
  processed_at      timestamptz
);

create index if not exists documents_vehicle_created_idx on documents(vehicle_id, created_at desc);
create index if not exists documents_user_status_idx     on documents(user_id, status);
create index if not exists documents_sender_email_idx    on documents(sender_email)
  where sender_email is not null;

alter table documents enable row level security;

drop policy if exists "Users see own documents" on documents;
create policy "Users see own documents"
  on documents for all using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 11. ENERGY COSTS
-- ---------------------------------------------------------------------------
create table if not exists energy_costs (
  id                     uuid primary key default gen_random_uuid(),
  document_id            uuid not null references documents(id) on delete cascade,
  vehicle_id             uuid not null references vehicles(id) on delete cascade,
  document_type          text not null check (document_type in ('home_bill','public_receipt')),
  period_start           date not null,
  period_end             date not null,
  total_kwh              numeric(10,3),
  vehicle_kwh_attributed numeric(10,3),
  original_amount        numeric(10,2) not null,
  original_currency      text not null default 'RON',
  exchange_rate          numeric(10,6) not null default 1,
  cost_ron               numeric(10,2) not null,
  provider_name          text,
  charger_network        text,
  location_name          text,
  location_lat           numeric(9,6),
  location_lng           numeric(9,6),
  charging_session_id    uuid references charging_sessions(id) on delete set null,
  is_manually_edited     boolean not null default false,
  created_at             timestamptz not null default now()
);

create index if not exists energy_costs_vehicle_period_idx
  on energy_costs(vehicle_id, period_start desc);

alter table energy_costs enable row level security;

drop policy if exists "Users see own energy costs" on energy_costs;
create policy "Users see own energy costs"
  on energy_costs for all
  using (vehicle_id in (select id from vehicles where user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 12. EXCHANGE RATES (cache BNR)
-- ---------------------------------------------------------------------------
create table if not exists exchange_rates (
  rate_date   date not null,
  currency    text not null,
  rate_to_ron numeric(12,6) not null,
  fetched_at  timestamptz not null default now(),
  primary key (rate_date, currency)
);

-- ---------------------------------------------------------------------------
-- 13. AUTO-CREATE PROFILE LA SIGNUP
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 14. BACKFILL profiles pentru utilizatori existenți
--     (pentru useri care s-au înregistrat înainte de trigger)
-- ---------------------------------------------------------------------------
insert into public.profiles (id, full_name, avatar_url)
select
  id,
  raw_user_meta_data->>'full_name',
  raw_user_meta_data->>'avatar_url'
from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
