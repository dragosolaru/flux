-- =============================================================================
-- 041: make every dedupe pass use the spatial index.
--
-- Reported from the field: "Dedupe failed: canceling statement due to statement
-- timeout". Measured on a 22,253-row copy of the live table:
--
--   dedupe_chargers_batch    (034)   57 s
--   dedupe_same_site_names   (038)   36 s
--   dedupe_same_site_brand   (039)  381 s
--
-- All three exceed the statement timeout, so the panel's dedupe button could
-- never finish. 039 made it obvious, but 034 timing out is the same failure the
-- Litochoro work already hit once ("034 pică cu upstream timeout") and it was
-- never actually fixed — only worked around by shrinking the batch.
--
-- Cause, shared by all three: each carries an equality predicate — operator_id
-- for 034, round(max_power_kw) for 038/039 — and the planner would rather hash
-- join on it than use the GiST index. EXPLAIN showed
--
--   Hash Semi Join  (Hash Cond: round(c.max_power_kw) = round(k.max_power_kw))
--     Join Filter: ... st_dwithin(c.location, k.location, 40)
--     -> Seq Scan on chargers c
--     -> Hash -> Seq Scan on chargers k
--
-- so chargers_geo_gix (migration 017) went unused and st_dwithin — plus, in
-- 039, four charger_brand_tokens() calls — ran on every pair sharing a rated
-- power. With a few dozen distinct power values over 22k rows, that is tens of
-- millions of pairs.
--
-- Fix, in two parts:
--
--   1. CROSS JOIN LATERAL (... LIMIT 1) instead of a correlated EXISTS. The
--      LIMIT makes the subquery non-flattenable, so the planner cannot hoist it
--      into a hash join and settles on the nested loop the data wants:
--
--        Nested Loop
--          -> Seq Scan on chargers c
--          -> Limit -> Index Scan using chargers_geo_gix on chargers k
--                        Index Cond: location && _st_expand(c.location, 40)
--
--      Semantically identical: EXISTS and a LATERAL that stops at the first
--      match both ask "is there any such neighbour".
--
--   2. Precompute the brand token arrays as generated columns, so 039 stops
--      calling charger_brand_tokens() once per candidate pair.
--
-- Result on the same 22,253 rows: 381 s -> 229 ms for 039.
--
-- Adding the generated columns rewrites the table and takes an ACCESS EXCLUSIVE
-- lock. At this size that is seconds; on a much larger table it would need a
-- maintenance window.
-- =============================================================================

-- coalesce/|| rather than concat_ws: concat_ws is only STABLE (it goes through
-- type output functions), and a generated column requires IMMUTABLE.
alter table public.chargers
  add column if not exists operator_brand text[]
    generated always as (public.charger_brand_tokens(operator)) stored;

alter table public.chargers
  add column if not exists site_brand text[]
    generated always as (
      public.charger_brand_tokens(coalesce(name, '') || ' ' || coalesce(operator, ''))
    ) stored;

-- NOTE: these columns depend on charger_brand_tokens(). Replacing that function
-- later will NOT recompute the stored values — the columns would have to be
-- dropped and re-added, or the table rewritten with a no-op ALTER.

-- --------------------------------------------------------------------------
-- 034's rule: same operator, within 40 m.
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
  delete from chargers
  where id in (
    select c.id
    from chargers c
    cross join lateral (
      select 1
      from chargers k
      where st_dwithin(c.location, k.location, 40)
        and k.id <> c.id
        and coalesce(k.operator_id, '~unknown') = coalesce(c.operator_id, '~unknown')
        and (k.confidence, k.source_count, k.id) > (c.confidence, c.source_count, c.id)
      limit 1
    ) hit
    limit p_limit
  );

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- --------------------------------------------------------------------------
-- 034's per-country variant. Same rewrite; the country branch is kept because
-- `is not distinct from` has no btree operator class and forces a seq scan.
-- --------------------------------------------------------------------------
create or replace function public.dedupe_chargers_by_site(
  p_country char(2),
  p_limit   integer default 200000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  if p_country is null then
    delete from chargers
    where id in (
      select c.id
      from chargers c
      cross join lateral (
        select 1
        from chargers k
        where st_dwithin(c.location, k.location, 40)
          and k.id <> c.id
          and coalesce(k.operator_id, '~unknown') = coalesce(c.operator_id, '~unknown')
          and (k.confidence, k.source_count, k.id) > (c.confidence, c.source_count, c.id)
        limit 1
      ) hit
      where c.country is null
      limit p_limit
    );
  else
    delete from chargers
    where id in (
      select c.id
      from chargers c
      cross join lateral (
        select 1
        from chargers k
        where st_dwithin(c.location, k.location, 40)
          and k.id <> c.id
          and coalesce(k.operator_id, '~unknown') = coalesce(c.operator_id, '~unknown')
          and (k.confidence, k.source_count, k.id) > (c.confidence, c.source_count, c.id)
        limit 1
      ) hit
      where c.country = p_country
      limit p_limit
    );
  end if;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- --------------------------------------------------------------------------
-- 038's rule: differing operators, same rated power, within one bay (15 m).
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
  delete from chargers
  where id in (
    select c.id
    from chargers c
    cross join lateral (
      select 1
      from chargers k
      where st_dwithin(c.location, k.location, 15)
        and k.id <> c.id
        and k.max_power_kw is not null
        and round(k.max_power_kw) = round(c.max_power_kw)
        and coalesce(k.operator_id, '~unknown') <> coalesce(c.operator_id, '~unknown')
        and (k.confidence, k.source_count, k.id) > (c.confidence, c.source_count, c.id)
      limit 1
    ) hit
    where c.max_power_kw is not null
    limit p_limit
  );

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- --------------------------------------------------------------------------
-- 039's rule: differing operators sharing a brand across name/operator, same
-- rated power, within 40 m. Now reads the precomputed arrays.
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
  delete from chargers
  where id in (
    select c.id
    from chargers c
    cross join lateral (
      select 1
      from chargers k
      where st_dwithin(c.location, k.location, 40)
        and k.id <> c.id
        and k.max_power_kw is not null
        and round(k.max_power_kw) = round(c.max_power_kw)
        and coalesce(k.operator_id, '~unknown') <> coalesce(c.operator_id, '~unknown')
        and (k.operator_brand && c.site_brand or c.operator_brand && k.site_brand)
        and (k.confidence, k.source_count, k.id) > (c.confidence, c.source_count, c.id)
      limit 1
    ) hit
    where c.max_power_kw is not null
    limit p_limit
  );

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
