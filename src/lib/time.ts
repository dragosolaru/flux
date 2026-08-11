/**
 * Tesla schedules charging and departure in minutes past local midnight, and
 * three screens converted `<input type="time">` to that number independently,
 * with three different fallbacks for a malformed value (0, 23:00 and 08:00) and
 * three different guards. One of them turned a cleared input into midnight.
 */

/** "23:30" → 1410. Returns null for anything that is not hh:mm. */
export function minutesFromMidnight(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** 1410 → "23:30". */
export function minutesToHhmm(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
