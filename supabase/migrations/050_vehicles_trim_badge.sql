-- 050_vehicles_trim_badge.sql
--
-- Remembers what the car said it is, so the answer survives the car sleeping.
--
-- `vehicle_config.trim_badging` arrives with every live read and tells us two
-- things nothing else can: the rated range a state-of-health estimate should be
-- measured against, and the battery chemistry — which decides whether the right
-- daily advice is "keep it between 50 and 80%" (NMC) or "take it to 100% every
-- week" (LFP). Those are opposite instructions, so getting it from the car
-- rather than guessing is the whole point.
--
-- The problem is that a parked Tesla is asleep most of the time, and a sleeping
-- car is answered from `vehicle_snapshots`, which never carried the badge. So
-- the chemistry advice and the SoH percentage appeared only during the minutes
-- the car happened to be awake, and vanished the rest of the day — which reads
-- as a broken feature, not as a car that is asleep.
--
-- The badge is a fact about the vehicle, not a reading: it does not change
-- between polls, and it belongs on the row rather than in a time series. Stored
-- as the key the trim table is keyed on, `car_type:trim_badging`
-- (e.g. `model3:p74d`), so adding a trim stays one lookup and one line.

alter table vehicles add column if not exists trim_badge text;

comment on column vehicles.trim_badge is
  'car_type:trim_badging as reported by the car, e.g. model3:p74d. Source of the SoH baseline and the battery chemistry.';
