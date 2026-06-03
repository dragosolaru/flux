-- Charger data platform (spec #1, M3): PostGIS read/query RPC functions.
-- supabase-js cannot express ST_DWithin / ST_Intersects / similarity ordering
-- directly, so we expose them as SQL functions callable via .rpc().
-- Charger tables are shared reference data (no per-user RLS); these run as
-- `security definer` so the service-role client reads consistently.

-- Shared shape: every function returns the canonical charger columns plus
-- decoded lat/lng and aggregated connectors/sources jsonb. The result columns
-- must stay in sync with rowToCharger() in src/lib/chargers/query.ts.

create or replace function chargers_nearby(
  p_lat            float8,
  p_lng            float8,
  p_radius_m       float8,
  p_min_kw         float8 default null,
  p_connector      text   default null,
  p_min_confidence real   default 0,
  p_limit          int    default 200
)
returns table (
  id           uuid,
  lat          float8,
  lng          float8,
  name         text,
  operator     text,
  operator_id  text,
  country      char(2),
  address      jsonb,
  max_power_kw numeric,
  pricing      jsonb,
  availability text,
  confidence   real,
  last_seen_at timestamptz,
  connectors   jsonb,
  sources      jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ch.id,
    st_y(ch.location::geometry) as lat,
    st_x(ch.location::geometry) as lng,
    ch.name,
    ch.operator,
    ch.operator_id,
    ch.country,
    ch.address,
    ch.max_power_kw,
    ch.pricing,
    ch.availability,
    ch.confidence,
    ch.last_seen_at,
    coalesce(
      (select jsonb_agg(jsonb_build_object('type', c.type, 'powerKw', c.power_kw, 'count', c.count))
         from charger_connectors c where c.charger_id = ch.id),
      '[]'::jsonb
    ) as connectors,
    coalesce(
      (select jsonb_agg(jsonb_build_object('source', s.source, 'ref', s.source_ref))
         from charger_sources s where s.charger_id = ch.id),
      '[]'::jsonb
    ) as sources
  from chargers ch
  where st_dwithin(ch.location, st_makepoint(p_lng, p_lat)::geography, p_radius_m)
    and (p_min_kw is null or ch.max_power_kw >= p_min_kw)
    and ch.confidence >= coalesce(p_min_confidence, 0)
    and (
      p_connector is null
      or exists (
        select 1 from charger_connectors c
        where c.charger_id = ch.id and c.type = p_connector
      )
    )
  order by st_distance(ch.location, st_makepoint(p_lng, p_lat)::geography) asc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$$;

create or replace function chargers_in_bbox(
  p_min_lng        float8,
  p_min_lat        float8,
  p_max_lng        float8,
  p_max_lat        float8,
  p_min_kw         float8 default null,
  p_connector      text   default null,
  p_min_confidence real   default 0,
  p_limit          int    default 200
)
returns table (
  id           uuid,
  lat          float8,
  lng          float8,
  name         text,
  operator     text,
  operator_id  text,
  country      char(2),
  address      jsonb,
  max_power_kw numeric,
  pricing      jsonb,
  availability text,
  confidence   real,
  last_seen_at timestamptz,
  connectors   jsonb,
  sources      jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ch.id,
    st_y(ch.location::geometry) as lat,
    st_x(ch.location::geometry) as lng,
    ch.name,
    ch.operator,
    ch.operator_id,
    ch.country,
    ch.address,
    ch.max_power_kw,
    ch.pricing,
    ch.availability,
    ch.confidence,
    ch.last_seen_at,
    coalesce(
      (select jsonb_agg(jsonb_build_object('type', c.type, 'powerKw', c.power_kw, 'count', c.count))
         from charger_connectors c where c.charger_id = ch.id),
      '[]'::jsonb
    ) as connectors,
    coalesce(
      (select jsonb_agg(jsonb_build_object('source', s.source, 'ref', s.source_ref))
         from charger_sources s where s.charger_id = ch.id),
      '[]'::jsonb
    ) as sources
  from chargers ch
  where st_intersects(
          ch.location,
          st_makeenvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)::geography
        )
    and (p_min_kw is null or ch.max_power_kw >= p_min_kw)
    and ch.confidence >= coalesce(p_min_confidence, 0)
    and (
      p_connector is null
      or exists (
        select 1 from charger_connectors c
        where c.charger_id = ch.id and c.type = p_connector
      )
    )
  order by ch.confidence desc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$$;

create or replace function chargers_search(
  p_q       text,
  p_country text default null,
  p_limit   int  default 200
)
returns table (
  id           uuid,
  lat          float8,
  lng          float8,
  name         text,
  operator     text,
  operator_id  text,
  country      char(2),
  address      jsonb,
  max_power_kw numeric,
  pricing      jsonb,
  availability text,
  confidence   real,
  last_seen_at timestamptz,
  connectors   jsonb,
  sources      jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ch.id,
    st_y(ch.location::geometry) as lat,
    st_x(ch.location::geometry) as lng,
    ch.name,
    ch.operator,
    ch.operator_id,
    ch.country,
    ch.address,
    ch.max_power_kw,
    ch.pricing,
    ch.availability,
    ch.confidence,
    ch.last_seen_at,
    coalesce(
      (select jsonb_agg(jsonb_build_object('type', c.type, 'powerKw', c.power_kw, 'count', c.count))
         from charger_connectors c where c.charger_id = ch.id),
      '[]'::jsonb
    ) as connectors,
    coalesce(
      (select jsonb_agg(jsonb_build_object('source', s.source, 'ref', s.source_ref))
         from charger_sources s where s.charger_id = ch.id),
      '[]'::jsonb
    ) as sources
  from chargers ch
  where (ch.name ilike '%' || p_q || '%' or ch.operator ilike '%' || p_q || '%')
    and (p_country is null or ch.country = p_country)
  order by similarity(coalesce(ch.name, '') || ' ' || coalesce(ch.operator, ''), p_q) desc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$$;

create or replace function charger_by_id(p_id uuid)
returns table (
  id           uuid,
  lat          float8,
  lng          float8,
  name         text,
  operator     text,
  operator_id  text,
  country      char(2),
  address      jsonb,
  max_power_kw numeric,
  pricing      jsonb,
  availability text,
  confidence   real,
  last_seen_at timestamptz,
  connectors   jsonb,
  sources      jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ch.id,
    st_y(ch.location::geometry) as lat,
    st_x(ch.location::geometry) as lng,
    ch.name,
    ch.operator,
    ch.operator_id,
    ch.country,
    ch.address,
    ch.max_power_kw,
    ch.pricing,
    ch.availability,
    ch.confidence,
    ch.last_seen_at,
    coalesce(
      (select jsonb_agg(jsonb_build_object('type', c.type, 'powerKw', c.power_kw, 'count', c.count))
         from charger_connectors c where c.charger_id = ch.id),
      '[]'::jsonb
    ) as connectors,
    coalesce(
      (select jsonb_agg(jsonb_build_object('source', s.source, 'ref', s.source_ref))
         from charger_sources s where s.charger_id = ch.id),
      '[]'::jsonb
    ) as sources
  from chargers ch
  where ch.id = p_id;
$$;
