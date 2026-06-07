export type ReliabilityLevel = "offline" | "stale" | "good" | "unknown";

export function stationReliability(station: {
  isOperational?: boolean;
  lastVerifiedAt?: string;
}): ReliabilityLevel {
  if (station.isOperational === false) return "offline";
  if (!station.lastVerifiedAt) return "unknown";
  const days = (Date.now() - new Date(station.lastVerifiedAt).getTime()) / 86_400_000;
  if (Number.isNaN(days)) return "unknown";
  if (days > 90) return "stale";
  return "good";
}

export function daysSinceVerified(lastVerifiedAt: string): number {
  return Math.round((Date.now() - new Date(lastVerifiedAt).getTime()) / 86_400_000);
}
