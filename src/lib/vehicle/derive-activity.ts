/**
 * Trips and charging sessions, reconstructed from what the car was seen doing.
 *
 * `trips` and `charging_sessions` were written by the simulator and by nothing
 * else, so for a linked Tesla every screen built on them was permanently empty
 * — the activity feed, savings, CO₂, the monthly consumption chart, the
 * planner's personal-efficiency figure. The data to rebuild them from was
 * already there: `vehicle_snapshots` carries odometer, battery level, charging
 * flag and position with a timestamp.
 *
 * ## What this can and cannot know
 *
 * Snapshots are sparse and irregular. One is written at most every five minutes
 * while a screen is open, and once a day from the cron — because reading a car
 * more often costs quota and, if it is asleep, battery. So the reconstruction
 * is honest about which parts survive that and which do not:
 *
 * · **Distance is exact.** It is an odometer difference. Two readings a day
 *   apart still give the right number of kilometres between them.
 * · **Energy is close.** A battery-level difference times pack capacity. The
 *   percentage is an integer, so a short hop is coarse; over a day it is fine.
 * · **The count of trips is a lower bound.** Three errands between two readings
 *   are one row here. Nothing can recover the three.
 * · **Average speed is often unknowable**, and is left null rather than
 *   computed — dividing a day's driving by a day's elapsed time produces a
 *   number that looks like a speed and is not one. That is the failure this
 *   codebase keeps meeting: a wrong number says more than a missing one.
 *
 * Totals are therefore trustworthy and counts are not, which is the right way
 * round: savings, CO₂ and consumption are sums.
 */

/** One row of `vehicle_snapshots`, in the shape the derivation needs. */
export interface ActivitySnapshot {
  recordedAt: string;
  batteryLevel: number | null;
  odometerKm: number | null;
  isCharging: boolean | null;
  chargingRateKw: number | null;
  latitude: number | null;
  longitude: number | null;
}

export interface DerivedTrip {
  startedAt: string;
  endedAt: string;
  distanceKm: number;
  energyUsedKwh: number | null;
  avgSpeedKmh: number | null;
  efficiencyKwhPer100km: number | null;
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
}

export interface DerivedChargingSession {
  startedAt: string;
  endedAt: string;
  startSoc: number | null;
  endSoc: number | null;
  energyAddedKwh: number | null;
  maxChargingRateKw: number | null;
  locationLat: number | null;
  locationLng: number | null;
}

export interface DerivedActivity {
  trips: DerivedTrip[];
  sessions: DerivedChargingSession[];
}

/**
 * Below this, an odometer difference is rounding rather than a journey.
 *
 * The column is numeric and the car reports miles that we convert, so a parked
 * car can differ by a few metres between readings. Three hundred metres is
 * under any real trip and over any conversion wobble.
 */
const MIN_TRIP_KM = 0.3;

/**
 * The longest gap between two readings that still lets an average speed mean
 * something. Beyond it the elapsed time is mostly the car sitting still.
 */
const SPEED_MAX_GAP_MS = 30 * 60 * 1000;

/** A trip cannot be one reading long, and two readings a week apart are not one. */
const MAX_TRIP_SPAN_MS = 24 * 60 * 60 * 1000;

function ms(at: string): number {
  return new Date(at).getTime();
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * @param snapshots ordered oldest first
 * @param packCapacityKwh the model's usable pack, for turning percent into kWh
 */
export function deriveActivity(
  snapshots: ActivitySnapshot[],
  packCapacityKwh: number,
): DerivedActivity {
  const usable = snapshots.filter((s) => Number.isFinite(ms(s.recordedAt)));
  return {
    trips: deriveTrips(usable, packCapacityKwh),
    sessions: deriveSessions(usable, packCapacityKwh),
  };
}

function deriveTrips(
  snapshots: ActivitySnapshot[],
  packCapacityKwh: number,
): DerivedTrip[] {
  const trips: DerivedTrip[] = [];
  let run: ActivitySnapshot[] | null = null;

  const close = () => {
    if (!run || run.length < 2) {
      run = null;
      return;
    }
    const first = run[0]!;
    const last = run[run.length - 1]!;
    const distanceKm = round((last.odometerKm ?? 0) - (first.odometerKm ?? 0), 2);
    if (distanceKm >= MIN_TRIP_KM) {
      trips.push(buildTrip(run, distanceKm, packCapacityKwh));
    }
    run = null;
  };

  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1]!;
    const next = snapshots[i]!;
    const moved =
      prev.odometerKm != null &&
      next.odometerKm != null &&
      next.odometerKm - prev.odometerKm >= MIN_TRIP_KM;

    // A pair spanning more than a day says the car moved at some point in that
    // day. It does not describe a journey, and pretending otherwise would put a
    // "trip" in the feed that lasted twenty hours.
    const plausible = ms(next.recordedAt) - ms(prev.recordedAt) <= MAX_TRIP_SPAN_MS;

    if (moved && plausible) {
      run ??= [prev];
      run.push(next);
    } else {
      close();
    }
  }
  close();

  return trips;
}

function buildTrip(
  run: ActivitySnapshot[],
  distanceKm: number,
  packCapacityKwh: number,
): DerivedTrip {
  const first = run[0]!;
  const last = run[run.length - 1]!;
  const elapsedMs = ms(last.recordedAt) - ms(first.recordedAt);

  // Energy only when nothing charged inside the window — a car that gained
  // charge mid-trip makes the level difference say the opposite of what it used.
  const chargedInside = run.some((s) => s.isCharging === true);
  const socDrop =
    !chargedInside && first.batteryLevel != null && last.batteryLevel != null
      ? first.batteryLevel - last.batteryLevel
      : null;
  const energyUsedKwh =
    socDrop != null && socDrop > 0 ? round((socDrop / 100) * packCapacityKwh, 2) : null;

  // Speed is only meaningful when every gap in the run is short enough that the
  // elapsed time is mostly driving. One long gap poisons the whole average, so
  // the test is on the worst gap, not on the total.
  const widestGap = run
    .slice(1)
    .reduce((worst, s, i) => Math.max(worst, ms(s.recordedAt) - ms(run[i]!.recordedAt)), 0);
  const avgSpeedKmh =
    widestGap <= SPEED_MAX_GAP_MS && elapsedMs > 0
      ? round(distanceKm / (elapsedMs / 3_600_000), 1)
      : null;

  return {
    startedAt: first.recordedAt,
    endedAt: last.recordedAt,
    distanceKm,
    energyUsedKwh,
    avgSpeedKmh,
    efficiencyKwhPer100km:
      energyUsedKwh != null && distanceKm > 0
        ? round((energyUsedKwh / distanceKm) * 100, 2)
        : null,
    startLat: first.latitude,
    startLng: first.longitude,
    endLat: last.latitude,
    endLng: last.longitude,
  };
}

function deriveSessions(
  snapshots: ActivitySnapshot[],
  packCapacityKwh: number,
): DerivedChargingSession[] {
  const sessions: DerivedChargingSession[] = [];
  let run: ActivitySnapshot[] = [];

  const close = () => {
    // A single reading with the flag set is a car that was charging when we
    // looked and nothing more — no duration, no energy, nothing to show.
    if (run.length >= 2) sessions.push(buildSession(run, packCapacityKwh));
    run = [];
  };

  for (const snapshot of snapshots) {
    if (snapshot.isCharging === true) run.push(snapshot);
    else close();
  }
  close();

  return sessions;
}

function buildSession(
  run: ActivitySnapshot[],
  packCapacityKwh: number,
): DerivedChargingSession {
  const first = run[0]!;
  const last = run[run.length - 1]!;
  const gained =
    first.batteryLevel != null && last.batteryLevel != null
      ? last.batteryLevel - first.batteryLevel
      : null;
  const rates = run.map((s) => s.chargingRateKw).filter((r): r is number => r != null);

  return {
    startedAt: first.recordedAt,
    endedAt: last.recordedAt,
    startSoc: first.batteryLevel,
    endSoc: last.batteryLevel,
    energyAddedKwh: gained != null && gained > 0 ? round((gained / 100) * packCapacityKwh, 2) : null,
    maxChargingRateKw: rates.length > 0 ? Math.max(...rates) : null,
    locationLat: first.latitude,
    locationLng: first.longitude,
  };
}
