// SoC-dependent DC charging curve, ABRP-style. Real EVs charge fast at low state
// of charge and taper sharply past ~50–60%, so a flat average rate badly
// mis-estimates stop times (too slow when topping up from low, too fast when
// charging high). We model power as a fraction of the vehicle's peak DC rate at
// each SoC and integrate over the charged range.

// Per-model charging curve point — normalized fraction of peak DC power at a given SoC.
// Exported so ModelSpec can carry per-vehicle curve data and UI components can
// render a charging-speed visualization.
export interface ChargeCurvePoint {
  soc: number;      // 0–100
  fraction: number; // 0–1, fraction of the vehicle's peak DC power
}

// Tesla NMC 250 kW shape, digitized from EVKX measurements (evkx.net).
// Peak near 10–20% SoC, long taper past 50%, sharp drop above 80%.
// All current Flux Tesla models use this curve; future chemistries get their own.
export const TESLA_NMC_CURVE: ChargeCurvePoint[] = [
  { soc: 0, fraction: 0.85 },
  { soc: 10, fraction: 1.0 },
  { soc: 20, fraction: 1.0 },
  { soc: 30, fraction: 0.9 },
  { soc: 40, fraction: 0.78 },
  { soc: 50, fraction: 0.62 },
  { soc: 60, fraction: 0.5 },
  { soc: 70, fraction: 0.4 },
  { soc: 80, fraction: 0.3 },
  { soc: 90, fraction: 0.2 },
  { soc: 100, fraction: 0.12 },
];

/** Linear-interpolated fraction of peak power at a given SoC (0–100). */
export function chargeCurveFraction(socPct: number): number {
  const s = Math.max(0, Math.min(100, socPct));
  for (let i = 1; i < TESLA_NMC_CURVE.length; i++) {
    const a = TESLA_NMC_CURVE[i - 1]!;
    const b = TESLA_NMC_CURVE[i]!;
    if (s <= b.soc) {
      const t = (s - a.soc) / (b.soc - a.soc);
      return a.fraction + (b.fraction - a.fraction) * t;
    }
  }
  return TESLA_NMC_CURVE[TESLA_NMC_CURVE.length - 1]!.fraction;
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

  const energyPerPct = batteryKwh / 100;
  let minutes = 0;
  const start = Math.floor(fromSoc);
  const end = Math.ceil(toSoc);
  for (let s = start; s < end; s++) {
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
