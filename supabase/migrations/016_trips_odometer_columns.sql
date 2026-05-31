-- =============================================================================
-- Flux — migration 016: add odometer columns to trips for distance fallback
--
-- The simulator already tracks active_trip_start_odometer_km on
-- mock_vehicle_state, but never persisted those values into the trips row.
-- This migration adds start_odometer_km / end_odometer_km so that when
-- distance_km is NULL we can derive it as end_odometer_km - start_odometer_km.
-- =============================================================================

alter table trips
  add column if not exists start_odometer_km numeric(10,2),
  add column if not exists end_odometer_km   numeric(10,2);
