-- Add vehicle_spec JSONB column to mock_vehicle_state.
-- Stores per-vehicle battery/efficiency/charge-rate overrides so the simulator
-- uses real model specs instead of scenario defaults.

alter table mock_vehicle_state
  add column if not exists vehicle_spec jsonb;
