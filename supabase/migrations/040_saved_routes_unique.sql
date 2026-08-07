-- =============================================================================
-- 040: one saved route per origin/destination pair, per user.
--
-- Reported from the field: the same route saved twice. Two ways in, and the
-- client-side guard only ever closed the first:
--
--   * Double tap. `routeSaved` is set after the POST resolves, so on a slow
--     mobile connection two taps inside the round-trip both saw it false and
--     both inserted. Three of the four save buttons also lacked the in-flight
--     disable that the fourth had.
--   * Saving the same trip again — a retry after a flaky response, a second
--     tab, or loading a saved route and pressing save. No client guard can see
--     any of these; only the database can.
--
-- route_key is GENERATED, so the value cannot drift from the row it describes
-- and no application code can forget to set it. Coordinates are rounded to 4
-- decimals (~11 m) so re-geocoding the same place lands on the same key,
-- while two genuinely different addresses do not collide.
--
-- Deliberately keyed on origin+destination only, NOT the stops: re-planning
-- A→B picks different chargers as the SoC or the filters change, and storing
-- that as a second route is exactly the duplicate being reported. The list is
-- capped at 10 and reads as "my routes", so re-saving A→B should refresh the
-- stored plan rather than add a row — which is what the API now does.
-- =============================================================================

-- Defined once and used by both the generated column and the API, so the two
-- can never disagree about what "the same route" means. The API calls it as an
-- RPC to learn a payload's key before deciding whether a save is a new route
-- (which counts against the 10-route cap) or a refresh of an existing one
-- (which must not).
create or replace function public.saved_route_key(
  p_origin_lat float8, p_origin_lng float8,
  p_destination_lat float8, p_destination_lng float8
)
returns text
language sql
immutable
parallel safe
as $$
  select md5(
    round(p_origin_lat::numeric, 4)::text || ',' ||
    round(p_origin_lng::numeric, 4)::text || ';' ||
    round(p_destination_lat::numeric, 4)::text || ',' ||
    round(p_destination_lng::numeric, 4)::text
  );
$$;

alter table public.saved_routes
  add column if not exists route_key text generated always as (
    public.saved_route_key(origin_lat, origin_lng, destination_lat, destination_lng)
  ) stored;

-- Existing duplicates must go before the unique index can be built. Keep the
-- most recent of each group: it carries the freshest plan snapshot, and the
-- older row is the accident.
delete from public.saved_routes a
using public.saved_routes b
where a.user_id = b.user_id
  and a.route_key = b.route_key
  and (a.created_at, a.id) < (b.created_at, b.id);

create unique index if not exists saved_routes_user_route_key_uidx
  on public.saved_routes(user_id, route_key);
