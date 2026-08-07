-- =============================================================================
-- 038: collapse one site stored under several operator names.
--
-- Reported from the field (Litochoro, GR): a single charge point drawn as three
-- pins. Each source had attributed it differently — the network on one
-- ("PlugQ"), the fuel station hosting it on another ("Jet Oil ΚΟΥΤΣΙΜΑΝΗ") — and
-- both the runtime dedup and migration 034 keyed on operator equality, so the
-- rows never met.
--
-- src/lib/chargers/dedup.ts now lets hardware agreement override a name
-- disagreement inside a tight radius. This applies the same rule to rows already
-- stored, which no amount of re-ingesting would merge on its own: clustering
-- matches an incoming record against existing ones, it never reconciles two
-- existing rows with each other.
--
-- Deliberately narrower than 034:
--   * 15 m, not 40 — matching hardware is weak evidence on its own (CCS at
--     150 kW is a stock configuration), so it only counts within one bank of
--     stalls, where two different networks do not realistically sit.
--   * identical max_power_kw required — the stand-in for "same physical kit"
--     available in SQL.
--
-- Rows sharing an operator are already handled by 034 and are left alone here.
-- Survivor selection matches 034: highest confidence, then most sources, then
-- greatest id — a total order, so exactly one row of any pair remains.
--
-- Idempotent: re-running is a no-op once each site holds a single row.
-- =============================================================================

create or replace function public.dedupe_same_site_names(p_limit integer default 2000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from chargers
  where id in (
    select c.id
    from chargers c
    where exists (
      select 1
      from chargers k
      where k.id <> c.id
        and st_dwithin(c.location, k.location, 15)
        -- Same rated power stands in for "same physical hardware".
        and k.max_power_kw is not null
        and c.max_power_kw is not null
        and round(k.max_power_kw) = round(c.max_power_kw)
        -- Equal-operator pairs are 034's job; this pass exists for the rows it
        -- cannot see, so restricting to differing names keeps the two disjoint.
        and coalesce(k.operator_id, '~unknown') <> coalesce(c.operator_id, '~unknown')
        and (k.confidence, k.source_count, k.id) > (c.confidence, c.source_count, c.id)
    )
    limit p_limit
  );

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Run repeatedly until it reports 0.
--   select public.dedupe_same_site_names(2000);
