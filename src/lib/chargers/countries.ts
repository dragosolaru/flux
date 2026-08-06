// Countries covered by the scheduled bulk import (full-country ingest via the
// warm cron). A map read whose bbox falls entirely inside a bulk-fresh country
// skips lazy tile ingest — the data is already as fresh as the daily import.

import type { BBox } from "./types";

export type BulkCountry =
  | "ro" | "de" | "fr" | "at" | "nl" | "hu"
  // Balkan corridor: the RO ↔ GR drive crosses these, and none has a national
  // open registry, so OCM full-country import is the only way to have them
  // covered before the driver pans the map onto them.
  | "gr" | "bg" | "rs" | "mk" | "hr" | "si";

export const BULK_COUNTRIES: Record<BulkCountry, BBox> = {
  ro: { minLat: 43.6, minLng: 20.2, maxLat: 48.3, maxLng: 29.8 },
  de: { minLat: 47.2, minLng: 5.8, maxLat: 55.1, maxLng: 15.1 },
  fr: { minLat: 41.3, minLng: -5.2, maxLat: 51.2, maxLng: 9.6 }, // metropolitan
  at: { minLat: 46.3, minLng: 9.5, maxLat: 49.1, maxLng: 17.2 },
  nl: { minLat: 50.7, minLng: 3.3, maxLat: 53.6, maxLng: 7.3 },
  hu: { minLat: 45.7, minLng: 16.1, maxLat: 48.6, maxLng: 22.9 },
  gr: { minLat: 34.7, minLng: 19.3, maxLat: 41.8, maxLng: 28.3 },
  bg: { minLat: 41.2, minLng: 22.3, maxLat: 44.3, maxLng: 28.7 },
  rs: { minLat: 42.2, minLng: 18.8, maxLat: 46.2, maxLng: 23.1 },
  mk: { minLat: 40.8, minLng: 20.4, maxLat: 42.4, maxLng: 23.1 },
  hr: { minLat: 42.3, minLng: 13.4, maxLat: 46.6, maxLng: 19.5 },
  si: { minLat: 45.4, minLng: 13.3, maxLat: 46.9, maxLng: 16.7 },
};

export function isBulkCountry(value: string): value is BulkCountry {
  return value in BULK_COUNTRIES;
}

/** The bulk country whose bounds fully contain the bbox, if any. */
export function bulkCountryContaining(bbox: BBox): BulkCountry | null {
  for (const [cc, bounds] of Object.entries(BULK_COUNTRIES) as [BulkCountry, BBox][]) {
    if (
      bbox.minLat >= bounds.minLat &&
      bbox.maxLat <= bounds.maxLat &&
      bbox.minLng >= bounds.minLng &&
      bbox.maxLng <= bounds.maxLng
    ) {
      return cc;
    }
  }
  return null;
}
