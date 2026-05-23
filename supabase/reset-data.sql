-- =============================================================================
-- Flux — DATA RESET (start fresh with an empty database)
--
-- Paste into Supabase SQL Editor and run.
-- This removes ALL user data: documents, costs, vehicles, tokens, sessions.
-- Schema (tables, indexes, RLS policies) is PRESERVED.
-- Storage bucket contents must be cleared separately in the Storage dashboard
-- (select all files in "documents" bucket → delete).
-- =============================================================================

-- Cost intelligence data
TRUNCATE TABLE energy_costs RESTART IDENTITY CASCADE;
TRUNCATE TABLE exchange_rates RESTART IDENTITY CASCADE;

-- Documents (inbound email + uploaded)
TRUNCATE TABLE documents RESTART IDENTITY CASCADE;

-- Vehicle telemetry
TRUNCATE TABLE charging_sessions RESTART IDENTITY CASCADE;
TRUNCATE TABLE trips RESTART IDENTITY CASCADE;
TRUNCATE TABLE command_events RESTART IDENTITY CASCADE;

-- Mock simulator state (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mock_vehicle_state') THEN
    EXECUTE 'TRUNCATE TABLE mock_vehicle_state RESTART IDENTITY CASCADE';
  END IF;
END $$;

-- Tesla OAuth tokens
TRUNCATE TABLE tesla_tokens RESTART IDENTITY CASCADE;

-- Vehicles (deletes all vehicles for all users)
TRUNCATE TABLE vehicles RESTART IDENTITY CASCADE;

-- User profiles (keeps auth.users intact — users can still log in)
TRUNCATE TABLE profiles RESTART IDENTITY CASCADE;

-- Done. Users can log in again and re-connect their vehicles.
SELECT 'Data reset complete. Clear the "documents" storage bucket manually.' AS status;
