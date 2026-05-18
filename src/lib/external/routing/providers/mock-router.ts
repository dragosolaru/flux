import type { RoutePoint, RouteProvider } from "../types";

// Great-circle distance (Haversine) in km
function haversine(a: RoutePoint, b: RoutePoint): number {
  const R = 6371; // km
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

export const mockRouter: RouteProvider = {
  id: "mock-router",
  displayName: "Mock router (great-circle)",
  computeRoute(origin, destination) {
    const greatCircleKm = haversine(origin, destination);
    // Real road distance is typically 1.2–1.3× great-circle in EU
    const distanceKm = Math.round(greatCircleKm * 1.25 * 10) / 10;
    // Avg highway speed ~95 km/h with realistic urban exits
    const drivingMinutes = Math.round((distanceKm / 95) * 60);
    return { distanceKm, drivingMinutes };
  },
};

export { haversine };
