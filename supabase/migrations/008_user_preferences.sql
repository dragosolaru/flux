-- =============================================================================
-- Migration 008 — User preferences (locale, currency, home location)
--                + virtual_key_paired flag on vehicles for COMMANDS capability
--                + is_home_charge flag on charging_sessions for A.5 attribution
--
-- All changes are additive and backward-compatible. Existing rows get safe
-- defaults (ro / RON / NULL).
-- =============================================================================

-- profiles: user preferences
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'ro'
    CHECK (locale IN ('ro','en','de','hu','fr')),
  ADD COLUMN IF NOT EXISTS display_currency text NOT NULL DEFAULT 'RON'
    CHECK (display_currency IN ('RON','EUR','USD','GBP','HUF','PLN','CHF','NOK','SEK')),
  ADD COLUMN IF NOT EXISTS home_address text,
  ADD COLUMN IF NOT EXISTS home_lat double precision,
  ADD COLUMN IF NOT EXISTS home_lng double precision;

-- vehicles: virtual key pairing state (used by COMMANDS capability check)
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS virtual_key_paired boolean NOT NULL DEFAULT false;

-- charging_sessions: home-charge detection (populated by A.5; column prepared now)
ALTER TABLE charging_sessions
  ADD COLUMN IF NOT EXISTS is_home_charge boolean;

-- Helpful index for home-charge filtering (used by future attribution logic)
CREATE INDEX IF NOT EXISTS charging_sessions_is_home_idx
  ON charging_sessions (vehicle_id, is_home_charge)
  WHERE is_home_charge IS NOT NULL;
