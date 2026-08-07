-- =============================================================================
-- 036: make the batch upsert tolerate a repeated (source, source_ref).
--
-- charger_sources is written with ON CONFLICT DO UPDATE. Postgres raises
-- "ON CONFLICT DO UPDATE command cannot affect row a second time" when one
-- statement presents the same conflict key twice, and that aborts the whole
-- RPC — so one malformed cluster discarded a chunk of up to 200 chargers and
-- the run recorded "all upserts failed".
--
-- The producing bug is fixed in src/lib/chargers/dedup.ts: a cluster seeded
-- from an existing charger re-appended the very ref that matched it, so every
-- re-ingest of an already-stored area failed while a first ingest of a cold
-- area succeeded. This adds the database-side guard so no future caller can
-- reintroduce the failure.
--
-- Byte-for-byte 022 apart from the two DISTINCT ON clauses; the signature must
-- stay `returns int` because create-or-replace cannot change a return type.
-- =============================================================================

create or replace function upsert_chargers_batch(p_chargers jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row       jsonb;
  v_id        uuid;
  v_hash      text;
  v_old_hash  text;
  v_count     int := 0;
begin
  for v_row in select * from jsonb_array_elements(p_chargers)
  loop
    v_id   := nullif(v_row->>'id', '')::uuid;
    v_hash := v_row->>'hash';

    if v_id is null then
      -- INSERT new charger
      insert into chargers (
        location, name, operator, operator_id, country, address,
        max_power_kw, pricing, confidence, availability, source_count,
        source_hash, last_seen_at, updated_at
      ) values (
        ST_SetSRID(ST_MakePoint(
          (v_row->>'lng')::float8,
          (v_row->>'lat')::float8
        ), 4326)::geography,
        v_row->>'name',
        v_row->>'operator',
        v_row->>'operatorId',
        v_row->>'country',
        coalesce(v_row->'address', '{}'::jsonb),
        nullif(v_row->>'maxPowerKw', '')::numeric,
        v_row->'pricing',
        coalesce((v_row->>'confidence')::real, 0),
        coalesce(v_row->>'availability', 'unknown'),
        coalesce(jsonb_array_length(v_row->'sources'), 0),
        v_hash,
        now(),
        now()
      )
      returning id into v_id;

      -- Insert connectors for the new row
      delete from charger_connectors where charger_id = v_id;
      insert into charger_connectors (charger_id, type, power_kw, count)
      select v_id,
             coalesce(c->>'type', 'other'),
             nullif(c->>'powerKw', '')::numeric,
             coalesce((c->>'count')::int, 1)
      from jsonb_array_elements(coalesce(v_row->'connectors', '[]'::jsonb)) as c;

      -- Insert provenance for the new row
      insert into charger_sources (charger_id, source, source_ref, raw, last_seen_at)
      select distinct on (s->>'source', s->>'ref')
             v_id, s->>'source', s->>'ref', '{}'::jsonb, now()
      from jsonb_array_elements(coalesce(v_row->'sources', '[]'::jsonb)) as s
      on conflict (source, source_ref)
      do update set charger_id = excluded.charger_id, last_seen_at = now();

    else
      -- Check existing hash
      select source_hash into v_old_hash from chargers where id = v_id;

      if v_old_hash is not null and v_old_hash = v_hash then
        -- Hash match: only touch last_seen_at, skip all writes
        update chargers set last_seen_at = now() where id = v_id;
      else
        -- Full update
        update chargers set
          location     = ST_SetSRID(ST_MakePoint(
                           (v_row->>'lng')::float8,
                           (v_row->>'lat')::float8
                         ), 4326)::geography,
          name         = v_row->>'name',
          operator     = v_row->>'operator',
          operator_id  = v_row->>'operatorId',
          country      = v_row->>'country',
          address      = coalesce(v_row->'address', '{}'::jsonb),
          max_power_kw = nullif(v_row->>'maxPowerKw', '')::numeric,
          pricing      = v_row->'pricing',
          confidence   = coalesce((v_row->>'confidence')::real, 0),
          availability = coalesce(v_row->>'availability', 'unknown'),
          source_count = coalesce(jsonb_array_length(v_row->'sources'), 0),
          source_hash  = v_hash,
          last_seen_at = now(),
          updated_at   = now()
        where id = v_id;

        -- Replace connectors
        delete from charger_connectors where charger_id = v_id;
        insert into charger_connectors (charger_id, type, power_kw, count)
        select v_id,
               coalesce(c->>'type', 'other'),
               nullif(c->>'powerKw', '')::numeric,
               coalesce((c->>'count')::int, 1)
        from jsonb_array_elements(coalesce(v_row->'connectors', '[]'::jsonb)) as c;

        -- Upsert provenance
        insert into charger_sources (charger_id, source, source_ref, raw, last_seen_at)
        select distinct on (s->>'source', s->>'ref')
               v_id, s->>'source', s->>'ref', '{}'::jsonb, now()
        from jsonb_array_elements(coalesce(v_row->'sources', '[]'::jsonb)) as s
        on conflict (source, source_ref)
        do update set charger_id = excluded.charger_id, last_seen_at = now();
      end if;
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
