-- =============================================================================
-- Migration 009: Add unique constraint to charging_sessions for upsert support
-- Enables ON CONFLICT (vehicle_id, started_at) in the Tesla charging history sync.
-- =============================================================================

ALTER TABLE charging_sessions
  DROP CONSTRAINT IF EXISTS charging_sessions_vehicle_started_uniq;

ALTER TABLE charging_sessions
  ADD CONSTRAINT charging_sessions_vehicle_started_uniq
  UNIQUE (vehicle_id, started_at);
