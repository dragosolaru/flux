-- =============================================================================
-- Flux — initial schema
-- =============================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- -----------------------------------------------------------------------------
-- Profiles (extends Supabase auth.users)
-- -----------------------------------------------------------------------------
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- -----------------------------------------------------------------------------
-- Vehicles
-- -----------------------------------------------------------------------------
create table if not exists vehicles (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  brand text not null default 'tesla',
  display_name text not null,
  vin text,
  tesla_vehicle_id bigint,
  tesla_region text not null default 'eu',  -- 'eu' | 'na' | 'cn'
  is_active boolean default true,
  created_at timestamptz default now()
);

create index if not exists vehicles_user_id_idx on vehicles(user_id);

-- -----------------------------------------------------------------------------
-- Tesla OAuth tokens (encrypted at application level via AES-256-GCM)
-- -----------------------------------------------------------------------------
create table if not exists tesla_tokens (
  id uuid default uuid_generate_v4() primary key,
  vehicle_id uuid references vehicles(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  access_token_enc text not null,
  refresh_token_enc text not null,
  expires_at timestamptz not null,
  scopes text[] not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists tesla_tokens_vehicle_id_idx on tesla_tokens(vehicle_id);

-- -----------------------------------------------------------------------------
-- Vehicle state snapshots
-- -----------------------------------------------------------------------------
create table if not exists vehicle_snapshots (
  id uuid default uuid_generate_v4() primary key,
  vehicle_id uuid references vehicles(id) on delete cascade not null,
  battery_level integer,
  battery_range_km numeric,
  odometer_km numeric,
  interior_temp_c numeric,
  exterior_temp_c numeric,
  is_locked boolean,
  is_charging boolean,
  charging_rate_kw numeric,
  latitude numeric,
  longitude numeric,
  recorded_at timestamptz default now()
);

create index if not exists vehicle_snapshots_vehicle_id_recorded_at_idx
  on vehicle_snapshots(vehicle_id, recorded_at desc);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table profiles enable row level security;
alter table vehicles enable row level security;
alter table tesla_tokens enable row level security;
alter table vehicle_snapshots enable row level security;

drop policy if exists "Users can only access their own profile" on profiles;
create policy "Users can only access their own profile"
  on profiles for all using (auth.uid() = id);

drop policy if exists "Users can only access their own vehicles" on vehicles;
create policy "Users can only access their own vehicles"
  on vehicles for all using (auth.uid() = user_id);

drop policy if exists "Users can only access their own tokens" on tesla_tokens;
create policy "Users can only access their own tokens"
  on tesla_tokens for all using (auth.uid() = user_id);

drop policy if exists "Users can only access their own snapshots" on vehicle_snapshots;
create policy "Users can only access their own snapshots"
  on vehicle_snapshots for all
  using (vehicle_id in (select id from vehicles where user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- Auto-create profile row on signup
-- -----------------------------------------------------------------------------
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
