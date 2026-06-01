-- =============================================================================
-- Flux — DELETE ALL USER DATA
-- Șterge tot: trips, charging, documents, comenzi, mock state
-- Păstrează: cont (profiles), vehicule (vehicles), setări (user_settings,
--            user_preferences), tarife (tariff_rates, tariff_schedules)
--
-- Rulează în Supabase SQL Editor cu drepturi admin.
-- =============================================================================

DO $$
DECLARE
  v_user_id    uuid;
  v_vehicle_id uuid;
BEGIN
  -- ── Găsim utilizatorul ────────────────────────────────────────────────────
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'dragosandreiolaru@gmail.com';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilizatorul nu a fost găsit.';
  END IF;

  RAISE NOTICE 'Utilizator: %', v_user_id;

  -- ── Colectăm ID-urile vehiculelor ─────────────────────────────────────────
  SELECT id INTO v_vehicle_id
  FROM vehicles
  WHERE user_id = v_user_id
  LIMIT 1;

  -- ── Ștergem datele operaționale ──────────────────────────────────────────

  -- Trips (toate călătoriile)
  DELETE FROM trips
  WHERE vehicle_id IN (SELECT id FROM vehicles WHERE user_id = v_user_id);
  RAISE NOTICE 'trips: șters';

  -- Charging sessions (toate sesiunile de încărcare)
  DELETE FROM charging_sessions
  WHERE vehicle_id IN (SELECT id FROM vehicles WHERE user_id = v_user_id);
  RAISE NOTICE 'charging_sessions: șters';

  -- Command events (log comenzi)
  DELETE FROM command_events
  WHERE vehicle_id IN (SELECT id FROM vehicles WHERE user_id = v_user_id);
  RAISE NOTICE 'command_events: șters';

  -- Documents (facturi, OCR)
  DELETE FROM documents
  WHERE user_id = v_user_id;
  RAISE NOTICE 'documents: șters';

  -- Vehicle snapshots (istoricul stărilor)
  DELETE FROM vehicle_snapshots
  WHERE vehicle_id IN (SELECT id FROM vehicles WHERE user_id = v_user_id);
  RAISE NOTICE 'vehicle_snapshots: șters';

  -- Battery health records (dacă există)
  DELETE FROM battery_health
  WHERE vehicle_id IN (SELECT id FROM vehicles WHERE user_id = v_user_id);
  RAISE NOTICE 'battery_health: șters (dacă exista)';

  -- ── Resetăm starea mockului la valori inițiale ───────────────────────────
  -- batteryLevel 80%, range 427 km (Model Y standard), odometru 20700 km
  -- locație: Bucharest (Floreasca)
  UPDATE mock_vehicle_state
  SET
    state = jsonb_build_object(
      'batteryLevel',       80,
      'batteryRangeKm',     320,
      'chargeLimit',        80,
      'chargingState',      'disconnected',
      'chargingRateKw',     0,
      'timeToFullMinutes',  null,
      'speedKmh',           0,
      'odometerKm',         20702,
      'latitude',           44.475012,
      'longitude',          26.105180,
      'exteriorTempC',      18,
      'interiorTempC',      21,
      'isLocked',           true,
      'isSentryOn',         false,
      'motionState',        'parked',
      'recordedAt',         now()
    ),
    motion_state                      = 'parked',
    last_tick_at                      = now(),
    active_charging_session_start     = null,
    active_charging_session_network   = null,
    active_charging_session_start_soc = null,
    active_trip_start                 = null,
    active_trip_start_lat             = null,
    active_trip_start_lng             = null,
    active_trip_start_odometer_km     = null
  WHERE vehicle_id IN (SELECT id FROM vehicles WHERE user_id = v_user_id);

  RAISE NOTICE 'mock_vehicle_state: resetat (80%%, 320 km, odo 20702, București)';

  RAISE NOTICE '=== Gata! Toate datele operaționale au fost șterse. ===';

END;
$$;
