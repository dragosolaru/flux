-- =============================================================================
-- 044: stop silently dropping stations from a viewport query.
--
-- Reported from the field: stations show on the map, vanish when you zoom in,
-- and come back when you zoom out.
--
-- Four layers disagreed about the limit and nothing reconciled them:
--
--   src/lib/api/chargers.ts      asks for 2000
--   src/app/api/chargers/route.ts  schema allows up to 2000
--   src/lib/chargers/query.ts    MAX_LIMIT 5000, DEFAULT_LIMIT 1000
--   this function                least(coalesce(p_limit, 200), 500)   <-- wins
--
-- So every caller's limit was quietly cut to 500, and because the ordering is
-- `confidence desc`, the 500 kept were the highest-confidence ones — which are
-- spread over the whole bbox, not the part being looked at.
--
-- Reproduced on a local PostGIS with 601 stations in northern Greece and one
-- target at confidence 0.30:
--
--   wide bbox   -> target_found = 0, total = 500   (silently dropped)
--   tight bbox  -> target_found = 1, total = 1     (correct)
--
-- Raising the cap to 2000 matches the contract the API already advertises. It
-- does not make truncation impossible — a continent-wide bbox can still exceed
-- it — but it moves the ceiling above any realistic viewport, and the client
-- already asks for exactly this number.
--
-- Ordering is left as confidence desc: when something must be dropped, the
-- least-trustworthy rows are the right ones to lose. The remaining flaw is that
-- truncation is invisible to the caller, which is recorded in docs/TODO.md
-- rather than papered over here — the response is a bare array with nowhere to
-- report it.
-- =============================================================================

create or replace function chargers_in_bbox(
  p_min_lng        float8,
  p_min_lat        float8,
  p_max_lng        float8,
  p_max_lat        float8,
  p_min_kw         float8 default null,
  p_connector      text   default null,
  p_min_confidence real   default 0,
  p_limit          int    default 1000
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
  -- id as a tiebreak so a truncated page is at least stable between identical
  -- requests; confidence alone leaves ties in arbitrary order, which made the
  -- same viewport return different stations on consecutive fetches.
  order by ch.confidence desc, ch.id
  limit greatest(1, least(coalesce(p_limit, 1000), 2000));
$$;
