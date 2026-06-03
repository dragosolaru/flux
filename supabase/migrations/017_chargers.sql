-- Charger data platform (spec #1): PostGIS-backed, deduped, confidence-scored
-- charging stations fed by hybrid ingestion (OCM + Overpass + ChargePrice).
-- Charger tables are SHARED REFERENCE DATA (not user-scoped) — no per-user RLS.

create extension if not exists postgis;
create extension if not exists pg_trgm;

create table if not exists chargers (
  id           uuid primary key default gen_random_uuid(),
  location     geography(Point, 4326) not null,
  name         text,
  operator     text,
  operator_id  text,
  country      char(2),
  address      jsonb not null default '{}'::jsonb,
  max_power_kw numeric,
  pricing      jsonb,
  availability text not null default 'unknown',
  confidence   real not null default 0,
  source_count int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists chargers_geo_gix  on chargers using gist (location);
create index if not exists chargers_name_tgi on chargers using gin (name gin_trgm_ops);
create index if not exists chargers_op_tgi   on chargers using gin (operator gin_trgm_ops);
create index if not exists chargers_country  on chargers (country);

create table if not exists charger_connectors (
  id         uuid primary key default gen_random_uuid(),
  charger_id uuid not null references chargers(id) on delete cascade,
  type       text not null,
  power_kw   numeric,
  count      int  not null default 1
);
create index if not exists cc_charger on charger_connectors (charger_id);

create table if not exists charger_sources (
  id           uuid primary key default gen_random_uuid(),
  charger_id   uuid not null references chargers(id) on delete cascade,
  source       text not null,
  source_ref   text not null,
  raw          jsonb not null,
  last_seen_at timestamptz not null default now(),
  unique (source, source_ref)
);

create table if not exists ingest_runs (
  id          uuid primary key default gen_random_uuid(),
  tile        text,
  source      text,
  status      text,
  fetched     int,
  upserted    int,
  error       text,
  started_at  timestamptz default now(),
  finished_at timestamptz
);
