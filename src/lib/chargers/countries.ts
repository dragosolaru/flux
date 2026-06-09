// Countries covered by the scheduled bulk import (full-country ingest via the
// warm cron). A map read whose bbox falls entirely inside a bulk-fresh country
// skips lazy tile ingest — the data is already as fresh as the daily import.

import type { BBox } from "./types";

export type BulkCountry = "ro" | "de" | "fr" | "at" | "nl" | "hu";

export const BULK_COUNTRIES: Record<BulkCountry, BBox> = {
  ro: { minLat: 43.6, minLng: 20.2, maxLat: 48.3, maxLng: 29.8 },
  de: { minLat: 47.2, minLng: 5.8, maxLat: 55.1, maxLng: 15.1 },
  fr: { minLat: 41.3, minLng: -5.2, maxLat: 51.2, maxLng: 9.6 }, // metropolitan
  at: { minLat: 46.3, minLng: 9.5, maxLat: 49.1, maxLng: 17.2 },
  nl: { minLat: 50.7, minLng: 3.3, maxLat: 53.6, maxLng: 7.3 },
  hu: { minLat: 45.7, minLng: 16.1, maxLat: 48.6, maxLng: 22.9 },
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
