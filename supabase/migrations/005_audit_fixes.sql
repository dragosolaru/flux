-- =============================================================================
-- Migration 005 — schema hardening from senior audit
--   - Composite index on vehicles(user_id, is_active) for hot path queries
--   - Check constraint on charging_sessions.network to prevent garbage values
--   - Check constraint on mock_vehicle_state.scenario_id to surface bad IDs
--   - updated_at on vehicles with auto-update trigger
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Composite index for the most frequent vehicles query
-- -----------------------------------------------------------------------------

create index if not exists vehicles_user_id_active_idx
  on vehicles(user_id, is_active);

-- -----------------------------------------------------------------------------
-- Check constraints for enum-like columns
-- -----------------------------------------------------------------------------

-- network on charging_sessions (drop+add to keep idempotent)
alter table charging_sessions
  drop constraint if exists charging_sessions_network_check;

alter table charging_sessions
  add constraint charging_sessions_network_check
  check (
    network is null
    or network in ('ionity', 'tesla-sc', 'enbw', 'allego', 'fastned', 'home', 'other')
  );

-- scenario_id on mock_vehicle_state
alter table mock_vehicle_state
  drop constraint if exists mock_vehicle_state_scenario_id_check;

alter table mock_vehicle_state
  add constraint mock_vehicle_state_scenario_id_check
  check (
    scenario_id is null
    or scenario_id in ('commuter', 'weekend-errands', 'road-trip', 'vacation')
  );

-- -----------------------------------------------------------------------------
-- vehicles.updated_at with trigger
-- -----------------------------------------------------------------------------

alter table vehicles
  add column if not exists updated_at timestamptz not null default now();

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists vehicles_set_updated_at on vehicles;
create trigger vehicles_set_updated_at
  before update on vehicles
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- Tighten RLS on mock_vehicle_state with a WITH CHECK clause
-- (admin client bypasses RLS so this only affects user-context calls if any)
-- -----------------------------------------------------------------------------

drop policy if exists "Users can access their own mock state" on mock_vehicle_state;
create policy "Users can access their own mock state"
  on mock_vehicle_state for all
  using (vehicle_id in (select id from vehicles where user_id = auth.uid()))
  with check (vehicle_id in (select id from vehicles where user_id = auth.uid()));
