-- =============================================================================
-- 043: dedupe transfers provenance instead of discarding it, and source_count
-- is recomputed from the rows that actually exist.
--
-- Two related problems, both visible in the debug panel as chargers outnumbering
-- charger_sources rows (6,300 orphans before the first big dedupe, 1,160 after).
--
-- 1. Deleting a duplicate cascades its charger_sources rows away. The surviving
--    charger never learns a second source corroborated it, so confidence — which
--    is computed from the source count — stays lower than the evidence warrants.
--    Migration 034 noted that re-ingest re-attaches the freed refs, which is
--    true, but it only happens when that area is fetched again.
--
-- 2. source_count is written by upsert_chargers_batch from the payload
--    (jsonb_array_length of the cluster's sources), never counted from the
--    table. So it drifts from reality and nothing reveals it — which is why the
--    orphans were invisible until the totals were compared by hand.
--
-- The transfer picks the best neighbour, ordered exactly like the survivor rule
-- (confidence, source_count, id). In a chain longer than the merge radius that
-- neighbour can itself be deleted in the same pass, and those refs still
-- cascade; the panel loops until no duplicates remain, and re-ingest recovers
-- the rest. Strictly better than discarding every deleted row's provenance,
-- without pretending to be exhaustive.
--
-- charger_sources is unique on (source, source_ref) globally, so a ref can be
-- repointed without any chance of colliding with one the survivor already has.
-- =============================================================================

-- One-off repair: make source_count agree with the table.
update public.chargers c
set source_count = coalesce(s.n, 0)
from (
  select ch.id, count(cs.id) as n
  from public.chargers ch
  left join public.charger_sources cs on cs.charger_id = ch.id
  group by ch.id
) s
where s.id = c.id
  and c.source_count is distinct from coalesce(s.n, 0);

-- --------------------------------------------------------------------------
-- Same operator, within 40 m (034's rule).
-- --------------------------------------------------------------------------
create or replace function public.dedupe_chargers_batch(p_limit integer default 2000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  create temporary table if not exists _dedupe_pairs (dup_id uuid, keep_id uuid)
    on commit drop;
  truncate _dedupe_pairs;

  insert into _dedupe_pairs (dup_id, keep_id)
  select c.id, best.id
  from chargers c
  cross join lateral (
    select k.id
    from chargers k
    where st_dwithin(c.location, k.location, 40)
      and k.id <> c.id
      and coalesce(k.operator_id, '~unknown') = coalesce(c.operator_id, '~unknown')
      and (k.confidence, k.source_count, k.id) > (c.confidence, c.source_count, c.id)
    order by k.confidence desc, k.source_count desc, k.id desc
    limit 1
  ) best
  limit p_limit;

  update charger_sources s
  set charger_id = p.keep_id
  from _dedupe_pairs p
  where s.charger_id = p.dup_id
    and not exists (select 1 from _dedupe_pairs d where d.dup_id = p.keep_id);

  delete from chargers where id in (select dup_id from _dedupe_pairs);
  get diagnostics v_deleted = row_count;

  update chargers c
  set source_count = (select count(*) from charger_sources cs where cs.charger_id = c.id)
  where c.id in (select keep_id from _dedupe_pairs);

  return v_deleted;
end;
$$;

-- --------------------------------------------------------------------------
-- Differing operators, same rated power, within one bay (038's rule).
-- --------------------------------------------------------------------------
create or replace function public.dedupe_same_site_names(p_limit integer default 2000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  create temporary table if not exists _dedupe_pairs (dup_id uuid, keep_id uuid)
    on commit drop;
  truncate _dedupe_pairs;

  insert into _dedupe_pairs (dup_id, keep_id)
  select c.id, best.id
  from chargers c
  cross join lateral (
    select k.id
    from chargers k
    where st_dwithin(c.location, k.location, 15)
      and k.id <> c.id
      and k.max_power_kw is not null
      and round(k.max_power_kw) = round(c.max_power_kw)
      and coalesce(k.operator_id, '~unknown') <> coalesce(c.operator_id, '~unknown')
      and (k.confidence, k.source_count, k.id) > (c.confidence, c.source_count, c.id)
    order by k.confidence desc, k.source_count desc, k.id desc
    limit 1
  ) best
  where c.max_power_kw is not null
  limit p_limit;

  update charger_sources s
  set charger_id = p.keep_id
  from _dedupe_pairs p
  where s.charger_id = p.dup_id
    and not exists (select 1 from _dedupe_pairs d where d.dup_id = p.keep_id);

  delete from chargers where id in (select dup_id from _dedupe_pairs);
  get diagnostics v_deleted = row_count;

  update chargers c
  set source_count = (select count(*) from charger_sources cs where cs.charger_id = c.id)
  where c.id in (select keep_id from _dedupe_pairs);

  return v_deleted;
end;
$$;

-- --------------------------------------------------------------------------
-- Brand split across name and operator, within 40 m (039's rule).
-- --------------------------------------------------------------------------
create or replace function public.dedupe_same_site_brand(p_limit integer default 2000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  create temporary table if not exists _dedupe_pairs (dup_id uuid, keep_id uuid)
    on commit drop;
  truncate _dedupe_pairs;

  insert into _dedupe_pairs (dup_id, keep_id)
  select c.id, best.id
  from chargers c
  cross join lateral (
    select k.id
    from chargers k
    where st_dwithin(c.location, k.location, 40)
      and k.id <> c.id
      and k.max_power_kw is not null
      and round(k.max_power_kw) = round(c.max_power_kw)
      and coalesce(k.operator_id, '~unknown') <> coalesce(c.operator_id, '~unknown')
      and (k.operator_brand && c.site_brand or c.operator_brand && k.site_brand)
      and (k.confidence, k.source_count, k.id) > (c.confidence, c.source_count, c.id)
    order by k.confidence desc, k.source_count desc, k.id desc
    limit 1
  ) best
  where c.max_power_kw is not null
  limit p_limit;

  update charger_sources s
  set charger_id = p.keep_id
  from _dedupe_pairs p
  where s.charger_id = p.dup_id
    and not exists (select 1 from _dedupe_pairs d where d.dup_id = p.keep_id);

  delete from chargers where id in (select dup_id from _dedupe_pairs);
  get diagnostics v_deleted = row_count;

  update chargers c
  set source_count = (select count(*) from charger_sources cs where cs.charger_id = c.id)
  where c.id in (select keep_id from _dedupe_pairs);

  return v_deleted;
end;
$$;
