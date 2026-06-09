// SoC-dependent DC charging curve, ABRP-style. Real EVs charge fast at low state
// of charge and taper sharply past ~50–60%, so a flat average rate badly
// mis-estimates stop times (too slow when topping up from low, too fast when
// charging high). We model power as a fraction of the vehicle's peak DC rate at
// each SoC and integrate over the charged range.

// Fraction of peak DC power vs SoC (%). Approximates a modern 250 kW EV (Tesla
// Model 3/Y on a V3 Supercharger): near-peak below 20%, steady taper after.
const CURVE: { soc: number; frac: number }[] = [
  { soc: 0, frac: 0.85 },
  { soc: 10, frac: 1.0 },
  { soc: 20, frac: 1.0 },
  { soc: 30, frac: 0.9 },
  { soc: 40, frac: 0.78 },
  { soc: 50, frac: 0.62 },
  { soc: 60, frac: 0.5 },
  { soc: 70, frac: 0.4 },
  { soc: 80, frac: 0.3 },
  { soc: 90, frac: 0.2 },
  { soc: 100, frac: 0.12 },
];

/** Linear-interpolated fraction of peak power at a given SoC (0–100). */
export function chargeCurveFraction(socPct: number): number {
  const s = Math.max(0, Math.min(100, socPct));
  for (let i = 1; i < CURVE.length; i++) {
    const a = CURVE[i - 1]!;
    const b = CURVE[i]!;
    if (s <= b.soc) {
      const t = (s - a.soc) / (b.soc - a.soc);
      return a.frac + (b.frac - a.frac) * t;
    }
  }
  return CURVE[CURVE.length - 1]!.frac;
}

/**
 * Minutes to charge from `fromSoc` to `toSoc` (%) for a battery of `batteryKwh`,
 * limited by both the station's max power and the vehicle's peak DC rate. Power
 * at each SoC is `min(stationKw, vehiclePeakKw × curveFraction(soc))`, so a slow
 * station caps a flat rate while a fast one follows the taper. Integrated in 1%
 * steps for accuracy.
 */
export function chargeMinutes(
  fromSoc: number,
  toSoc: number,
  batteryKwh: number,
  stationMaxKw: number,
  vehiclePeakDcKw: number,
): number {
  if (toSoc <= fromSoc || batteryKwh <= 0) return 0;
  const peak = vehiclePeakDcKw > 0 ? vehiclePeakDcKw : stationMaxKw;
  if (peak <= 0 && stationMaxKw <= 0) return 0;

  const energyPerPct = batteryKwh / 100; // kWh per 1% SoC
  let minutes = 0;
  const start = Math.floor(fromSoc);
  const end = Math.ceil(toSoc);
  for (let s = start; s < end; s++) {
    // Fraction of this 1% slice that lies inside [fromSoc, toSoc].
    const lo = Math.max(fromSoc, s);
    const hi = Math.min(toSoc, s + 1);
    const slice = hi - lo;
    if (slice <= 0) continue;
    const midSoc = (lo + hi) / 2;
    const curveKw = peak * chargeCurveFraction(midSoc);
    const powerKw = stationMaxKw > 0 ? Math.min(stationMaxKw, curveKw) : curveKw;
    if (powerKw <= 0) continue;
    const energyKwh = energyPerPct * slice;
    minutes += (energyKwh / powerKw) * 60;
  }
  return minutes;
}
