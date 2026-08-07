-- =============================================================================
-- 039: collapse one site whose brand is split across the name and operator
-- fields.
--
-- Reported from the field (Nea Kerdilia, GR): one Shell forecourt drawn as two
-- pins. OCM holds it twice with the brand in opposite fields:
--
--   name: 'SHELL Nea Kerdilia'  operator: 'NRGincharge'
--   name: 'nrg - Shell'         operator: 'Shell ΠΑΡΑΣΚΕΥΟΠΟΥΛΟΣ'
--
-- Operator-to-operator comparison is what both the runtime dedup and every
-- earlier migration key on, and it reads ~0.09 here: the Greek host name
-- reduces to 'shell', nothing like 'nrgincharge'. So the pair looked like two
-- networks. Both records name Shell — only the field differs.
--
-- src/lib/chargers/dedup.ts now retracts the operator conflict when one row's
-- declared operator appears anywhere in the other's name or operator, provided
-- the hardware agrees. This applies the same rule to rows already stored, which
-- re-ingesting cannot fix on its own: clustering matches an incoming record
-- against existing ones, it never reconciles two existing rows with each other.
--
-- Relation to the earlier passes, kept disjoint so they compose:
--   * 034 merges rows that AGREE on operator, within 40 m.
--   * 038 merges rows that DISAGREE, within 15 m, on hardware agreement alone.
--   * 039 (this) merges rows that disagree within 40 m, but only when they
--     share a brand token — a stronger signal than 038's, which is why it is
--     allowed the wider radius.
--
-- Survivor selection matches 034 and 038: highest confidence, then most
-- sources, then greatest id — a total order, so exactly one row of any pair
-- remains.
--
-- Idempotent: re-running is a no-op once each site holds a single row.
-- =============================================================================

-- Brand-ish tokens of a text field: lowercase, split on anything that is not
-- [a-z0-9], keep tokens of 5+ characters, drop the ones that describe a charger
-- rather than name a business.
--
-- Mirrors brandTokens() in src/lib/chargers/dedup.ts, including the 5-char
-- floor (a short generic fragment is not a brand, while Shell/Tesla/Enel/PlugQ
-- reach 5) and the stoplist (length alone cannot filter 'charging' or
-- 'station', both longer than 'shell'). Non-Latin scripts fall out here exactly
-- as they do in the TypeScript: Greek and Cyrillic are not [a-z0-9] and so act
-- as separators, which is why a Greek-only operator yields no tokens and can
-- never be merged on this rule.
create or replace function public.charger_brand_tokens(p_text text)
returns text[]
language sql
immutable
parallel safe
as $$
  select coalesce(array_agg(distinct t), '{}'::text[])
  from unnest(
    regexp_split_to_array(lower(coalesce(p_text, '')), '[^a-z0-9]+')
  ) as t
  where length(t) >= 5
    and t <> all (array[
      'charge', 'charger', 'chargers', 'charging', 'chargepoint',
      'station', 'stations', 'point', 'points', 'plug', 'socket', 'outlet',
      'power', 'energy', 'electric', 'electrical', 'mobility', 'emobility',
      'public', 'private', 'parking', 'garage', 'hotel', 'restaurant',
      'market', 'supermarket', 'center', 'centre', 'centrum', 'plaza',
      'mall', 'store', 'petrol', 'fuel', 'service', 'services', 'motorway',
      'highway', 'north', 'south', 'east', 'west', 'rapid', 'fast', 'ultra',
      'super', 'recharge', 'network', 'group', 'limited', 'gmbh', 'srl',
      'sa', 'bv', 'ltd'
    ]);
$$;

create or replace function public.dedupe_same_site_brand(p_limit integer default 2000)
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
        and st_dwithin(c.location, k.location, 40)
        -- Same rated power stands in for "same physical hardware" — the
        -- corroboration the TypeScript rule requires alongside the brand match,
        -- so a 350 kW Ionity bay on a Shell forecourt is not absorbed by the
        -- host's 60 kW one.
        and k.max_power_kw is not null
        and c.max_power_kw is not null
        and round(k.max_power_kw) = round(c.max_power_kw)
        -- Equal-operator pairs are 034's job; restricting to differing names
        -- keeps the passes disjoint.
        and coalesce(k.operator_id, '~unknown') <> coalesce(c.operator_id, '~unknown')
        -- One row's declared OPERATOR appears in the other's name or operator.
        -- Deliberately not a name-to-name overlap: two unrelated stations in one
        -- village both carry the village in their name, and merging on that
        -- would collapse genuinely separate sites. Requiring the shared token to
        -- be somebody's operator makes it a claim about the network.
        and (
          public.charger_brand_tokens(k.operator)
            && public.charger_brand_tokens(concat_ws(' ', c.name, c.operator))
          or public.charger_brand_tokens(c.operator)
            && public.charger_brand_tokens(concat_ws(' ', k.name, k.operator))
        )
        and (k.confidence, k.source_count, k.id) > (c.confidence, c.source_count, c.id)
    )
    limit p_limit
  );

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Run repeatedly until it reports 0.
--   select public.dedupe_same_site_brand(2000);
