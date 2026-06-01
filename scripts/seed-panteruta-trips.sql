-- =============================================================================
-- Seed Panteruta — 23 de călătorii realiste în România
-- Total: ~2.202 km | Eficiență medie: 176,5 Wh/km (≈ screenshot Tesla app)
--
-- Rulează în Supabase SQL Editor (dashboard.supabase.com → SQL Editor)
-- Necesită acces admin (deja disponibil în SQL Editor).
-- =============================================================================

DO $$
DECLARE
  v_user_id    uuid;
  v_vehicle_id uuid;
  v_total_km   numeric;
  v_total_kwh  numeric;
BEGIN
  -- ── Găsim utilizatorul ────────────────────────────────────────────────────
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'dragosandreiolaru@gmail.com';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilizatorul nu a fost găsit.';
  END IF;

  -- ── Găsim vehiculul Panteruta ─────────────────────────────────────────────
  SELECT id INTO v_vehicle_id
  FROM vehicles
  WHERE user_id = v_user_id
    AND (display_name ILIKE '%panterut%' OR nickname ILIKE '%panterut%')
  LIMIT 1;

  -- Fallback: primul vehicul al utilizatorului
  IF v_vehicle_id IS NULL THEN
    SELECT id INTO v_vehicle_id
    FROM vehicles
    WHERE user_id = v_user_id
    ORDER BY created_at
    LIMIT 1;
  END IF;

  IF v_vehicle_id IS NULL THEN
    RAISE EXCEPTION 'Niciun vehicul găsit pentru acest utilizator.';
  END IF;

  RAISE NOTICE 'Vehicul găsit: %', v_vehicle_id;

  -- ── Ștergem toate datele existente ───────────────────────────────────────
  DELETE FROM trips              WHERE vehicle_id = v_vehicle_id;
  DELETE FROM charging_sessions  WHERE vehicle_id = v_vehicle_id;
  DELETE FROM command_events     WHERE vehicle_id = v_vehicle_id;

  RAISE NOTICE 'Date vechi șterse.';

  -- ── Inserăm 23 de călătorii ──────────────────────────────────────────────
  --
  -- Coloane: vehicle_id, started_at, ended_at,
  --          start_lat, start_lng, end_lat, end_lng,
  --          start_address, end_address,
  --          distance_km, start_odometer_km, end_odometer_km,
  --          energy_used_kwh, avg_speed_kmh, max_speed_kmh,
  --          efficiency_kwh_per_100km
  --
  INSERT INTO trips (
    vehicle_id, started_at, ended_at,
    start_lat, start_lng, end_lat, end_lng,
    start_address, end_address,
    distance_km, start_odometer_km, end_odometer_km,
    energy_used_kwh, avg_speed_kmh, max_speed_kmh,
    efficiency_kwh_per_100km
  ) VALUES

  -- ── MARTIE 2026 ──────────────────────────────────────────────────────────

  -- 01 | Naveta dimineață | 32,5 km | 15,50 kWh/100km
  (v_vehicle_id,
   '2026-03-03 07:45:00+02', '2026-03-03 08:42:00+02',
   44.475012, 26.105180, 44.506185, 26.128040,
   'Floreasca, București', 'Pipera, București',
   32.5, 18500.00, 18532.50,
   5.04, 35.6, 75.0, 15.50),

  -- 02 | Naveta seară | 33,2 km | 15,80 kWh/100km
  (v_vehicle_id,
   '2026-03-03 17:55:00+02', '2026-03-03 18:53:00+02',
   44.506185, 26.128040, 44.475012, 26.105180,
   'Pipera, București', 'Floreasca, București',
   33.2, 18532.50, 18565.70,
   5.25, 35.1, 73.0, 15.80),

  -- 03 | București → Ploiești | 60,5 km | 17,50 kWh/100km
  (v_vehicle_id,
   '2026-03-07 08:15:00+02', '2026-03-07 09:03:00+02',
   44.475012, 26.105180, 44.942900, 26.016300,
   'Floreasca, București', 'Ploiești',
   60.5, 18565.70, 18626.20,
   10.59, 81.1, 130.0, 17.50),

  -- 04 | Ploiești → București | 59,8 km | 17,80 kWh/100km
  (v_vehicle_id,
   '2026-03-07 17:30:00+02', '2026-03-07 18:17:00+02',
   44.942900, 26.016300, 44.475012, 26.105180,
   'Ploiești', 'Floreasca, București',
   59.8, 18626.20, 18686.00,
   10.64, 81.4, 130.0, 17.80),

  -- 05 | Naveta dimineață | 31,8 km | 15,40 kWh/100km
  (v_vehicle_id,
   '2026-03-11 07:50:00+02', '2026-03-11 08:46:00+02',
   44.475012, 26.105180, 44.506185, 26.128040,
   'Floreasca, București', 'Pipera, București',
   31.8, 18686.00, 18717.80,
   4.90, 34.6, 72.0, 15.40),

  -- 06 | Naveta seară | 32,1 km | 15,60 kWh/100km
  (v_vehicle_id,
   '2026-03-11 18:00:00+02', '2026-03-11 18:56:00+02',
   44.506185, 26.128040, 44.475012, 26.105180,
   'Pipera, București', 'Floreasca, București',
   32.1, 18717.80, 18749.90,
   5.01, 34.9, 74.0, 15.60),

  -- 07 | București → Pitești | 115,0 km | 18,00 kWh/100km
  (v_vehicle_id,
   '2026-03-14 09:00:00+02', '2026-03-14 10:18:00+02',
   44.475012, 26.105180, 44.856800, 24.869700,
   'Floreasca, București', 'Pitești',
   115.0, 18749.90, 18864.90,
   20.70, 89.1, 140.0, 18.00),

  -- 08 | Pitești → București | 113,5 km | 18,20 kWh/100km
  (v_vehicle_id,
   '2026-03-14 16:00:00+02', '2026-03-14 17:15:00+02',
   44.856800, 24.869700, 44.475012, 26.105180,
   'Pitești', 'Floreasca, București',
   113.5, 18864.90, 18978.40,
   20.66, 90.8, 138.0, 18.20),

  -- 09 | Naveta dimineață | 33,5 km | 15,50 kWh/100km
  (v_vehicle_id,
   '2026-03-18 07:45:00+02', '2026-03-18 08:42:00+02',
   44.475012, 26.105180, 44.506185, 26.128040,
   'Floreasca, București', 'Pipera, București',
   33.5, 18978.40, 19011.90,
   5.19, 36.2, 76.0, 15.50),

  -- 10 | Naveta seară | 33,5 km | 15,70 kWh/100km
  (v_vehicle_id,
   '2026-03-18 18:00:00+02', '2026-03-18 18:57:00+02',
   44.506185, 26.128040, 44.475012, 26.105180,
   'Pipera, București', 'Floreasca, București',
   33.5, 19011.90, 19045.40,
   5.26, 35.8, 74.0, 15.70),

  -- 11 | București → Brașov | 165,0 km | 18,50 kWh/100km
  (v_vehicle_id,
   '2026-03-21 09:30:00+02', '2026-03-21 11:09:00+02',
   44.475012, 26.105180, 45.653400, 25.610800,
   'Floreasca, București', 'Brașov',
   165.0, 19045.40, 19210.40,
   30.53, 100.5, 145.0, 18.50),

  -- 12 | Brașov → București | 163,0 km | 18,30 kWh/100km
  (v_vehicle_id,
   '2026-03-22 14:00:00+02', '2026-03-22 15:38:00+02',
   45.653400, 25.610800, 44.475012, 26.105180,
   'Brașov', 'Floreasca, București',
   163.0, 19210.40, 19373.40,
   29.83, 100.7, 145.0, 18.30),

  -- 13 | Naveta dimineață | 32,5 km | 15,50 kWh/100km
  (v_vehicle_id,
   '2026-03-25 07:50:00+02', '2026-03-25 08:47:00+02',
   44.475012, 26.105180, 44.506185, 26.128040,
   'Floreasca, București', 'Pipera, București',
   32.5, 19373.40, 19405.90,
   5.04, 35.3, 73.0, 15.50),

  -- 14 | Naveta seară | 32,5 km | 15,70 kWh/100km
  (v_vehicle_id,
   '2026-03-25 18:05:00+02', '2026-03-25 19:01:00+02',
   44.506185, 26.128040, 44.475012, 26.105180,
   'Pipera, București', 'Floreasca, București',
   32.5, 19405.90, 19438.40,
   5.10, 35.2, 72.0, 15.70),

  -- ── APRILIE 2026 ─────────────────────────────────────────────────────────

  -- 15 | București → Constanța | 228,0 km | 18,80 kWh/100km
  (v_vehicle_id,
   '2026-04-05 09:00:00+03', '2026-04-05 11:03:00+03',
   44.475012, 26.105180, 44.172900, 28.640300,
   'Floreasca, București', 'Constanța',
   228.0, 19438.40, 19666.40,
   42.86, 110.3, 148.0, 18.80),

  -- 16 | Constanța → București | 226,0 km | 18,50 kWh/100km
  (v_vehicle_id,
   '2026-04-06 16:00:00+03', '2026-04-06 18:06:00+03',
   44.172900, 28.640300, 44.475012, 26.105180,
   'Constanța', 'Floreasca, București',
   226.0, 19666.40, 19892.40,
   41.81, 109.0, 148.0, 18.50),

  -- 17 | Naveta dimineață | 30,5 km | 15,40 kWh/100km
  (v_vehicle_id,
   '2026-04-10 07:45:00+03', '2026-04-10 08:43:00+03',
   44.475012, 26.105180, 44.506185, 26.128040,
   'Floreasca, București', 'Pipera, București',
   30.5, 19892.40, 19922.90,
   4.70, 33.2, 71.0, 15.40),

  -- 18 | Naveta seară | 31,5 km | 15,60 kWh/100km
  (v_vehicle_id,
   '2026-04-10 18:00:00+03', '2026-04-10 18:58:00+03',
   44.506185, 26.128040, 44.475012, 26.105180,
   'Pipera, București', 'Floreasca, București',
   31.5, 19922.90, 19954.40,
   4.91, 33.7, 72.0, 15.60),

  -- ── MAI 2026 ─────────────────────────────────────────────────────────────

  -- 19 | Trip A — București → Suceava | 270,0 km | 18,15 kWh/100km (≈ screenshot)
  (v_vehicle_id,
   '2026-05-02 08:30:00+03', '2026-05-02 10:51:00+03',
   44.475012, 26.105180, 47.651600, 26.260900,
   'Floreasca, București', 'Suceava',
   270.0, 19954.40, 20224.40,
   49.01, 116.2, 148.0, 18.15),

  -- 20 | Trip B — Suceava → București | 271,0 km | 18,15 kWh/100km (≈ screenshot)
  (v_vehicle_id,
   '2026-05-03 14:00:00+03', '2026-05-03 16:22:00+03',
   47.651600, 26.260900, 44.475012, 26.105180,
   'Suceava', 'Floreasca, București',
   271.0, 20224.40, 20495.40,
   49.19, 116.1, 148.0, 18.15),

  -- 21 | Naveta dimineață | 30,5 km | 15,50 kWh/100km
  (v_vehicle_id,
   '2026-05-15 07:50:00+03', '2026-05-15 08:47:00+03',
   44.475012, 26.105180, 44.506185, 26.128040,
   'Floreasca, București', 'Pipera, București',
   30.5, 20495.40, 20525.90,
   4.73, 33.1, 70.0, 15.50),

  -- 22 | Naveta seară | 31,0 km | 15,60 kWh/100km
  (v_vehicle_id,
   '2026-05-15 18:00:00+03', '2026-05-15 18:57:00+03',
   44.506185, 26.128040, 44.475012, 26.105180,
   'Pipera, București', 'Floreasca, București',
   31.0, 20525.90, 20556.90,
   4.84, 33.5, 71.0, 15.60),

  -- 23 | Current Drive — 145,5 km | 2h37min | 15,54 kWh/100km (≈ screenshot exact)
  (v_vehicle_id,
   '2026-05-28 07:00:00+03', '2026-05-28 09:37:00+03',
   44.475012, 26.105180, 44.986500, 26.023400,
   'Floreasca, București', 'Câmpina',
   145.5, 20556.90, 20702.40,
   22.61, 55.6, 130.0, 15.54);

  -- ── Calculăm sumarul ────────────────────────────────────────────────────
  SELECT SUM(distance_km), SUM(energy_used_kwh)
  INTO v_total_km, v_total_kwh
  FROM trips WHERE vehicle_id = v_vehicle_id;

  RAISE NOTICE 'Total: % km | % kWh | % Wh/km medie',
    round(v_total_km, 1),
    round(v_total_kwh, 1),
    round((v_total_kwh * 1000 / v_total_km)::numeric, 1);

  -- ── Actualizăm starea mockului ──────────────────────────────────────────
  -- batteryLevel 44% → range ≈ 189 km (la 176,6 Wh/km cu 75 kWh baterie)
  UPDATE mock_vehicle_state
  SET state = state
    || jsonb_build_object(
         'odometerKm',    20702.4,
         'batteryLevel',  44,
         'batteryRange',  188.9,
         'latitude',      44.9865,
         'longitude',     26.0234
       )
  WHERE vehicle_id = v_vehicle_id;

  RAISE NOTICE 'Mock state actualizat: odometru 20702,4 km | baterie 44%%';

END;
$$;
