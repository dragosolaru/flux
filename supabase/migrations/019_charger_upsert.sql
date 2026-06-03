-- Server-side UPSERT for the charger ingestion pipeline. Geography construction
-- (ST_MakePoint) must happen in SQL, so the orchestrator calls this RPC once per
-- deduplicated cluster instead of writing rows via supabase-js directly.

create or replace function upsert_charger(
  p_id          uuid,
  p_lat         float8,
  p_lng         float8,
  p_name        text,
  p_operator    text,
  p_operator_id text,
  p_country     text,
  p_address     jsonb,
  p_max_power_kw numeric,
  p_pricing     jsonb,
  p_confidence  real,
  p_connectors  jsonb,   -- [{type,powerKw,count}]
  p_sources     jsonb    -- [{source,ref}]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_id is null then
    insert into chargers (
      location, name, operator, operator_id, country, address,
      max_power_kw, pricing, confidence, source_count, last_seen_at, updated_at
    ) values (
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_name, p_operator, p_operator_id, p_country, coalesce(p_address, '{}'::jsonb),
      p_max_power_kw, p_pricing, coalesce(p_confidence, 0),
      coalesce(jsonb_array_length(p_sources), 0), now(), now()
    )
    returning id into v_id;
  else
    update chargers set
      location     = ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      name         = p_name,
      operator     = p_operator,
      operator_id  = p_operator_id,
      country      = p_country,
      address      = coalesce(p_address, '{}'::jsonb),
      max_power_kw = p_max_power_kw,
      pricing      = p_pricing,
      confidence   = coalesce(p_confidence, 0),
      source_count = coalesce(jsonb_array_length(p_sources), 0),
      last_seen_at = now(),
      updated_at   = now()
    where id = p_id
    returning id into v_id;
  end if;

  -- Replace connectors
  delete from charger_connectors where charger_id = v_id;
  insert into charger_connectors (charger_id, type, power_kw, count)
  select v_id,
         coalesce(c->>'type', 'other'),
         nullif(c->>'powerKw', '')::numeric,
         coalesce((c->>'count')::int, 1)
  from jsonb_array_elements(coalesce(p_connectors, '[]'::jsonb)) as c;

  -- Upsert provenance
  insert into charger_sources (charger_id, source, source_ref, raw, last_seen_at)
  select v_id, s->>'source', s->>'ref', '{}'::jsonb, now()
  from jsonb_array_elements(coalesce(p_sources, '[]'::jsonb)) as s
  on conflict (source, source_ref)
  do update set charger_id = excluded.charger_id, last_seen_at = now();

  return v_id;
end;
$$;
