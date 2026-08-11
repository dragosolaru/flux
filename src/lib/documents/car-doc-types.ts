import type { DocumentType } from "@/types/costs";

/**
 * Document types that belong to the vehicle vault rather than to energy costs.
 *
 * One list, because it decides three separate things — which uploads count
 * against which monthly quota, what the vault query returns, and whether the
 * cost processor creates an energy_costs row — and it was written out by hand
 * in each of them. The copy in subscription.ts had gone stale at six entries
 * while the other two had nineteen, so restoring the free-tier limits against
 * it would have counted thirteen car-document types as energy documents.
 */
export const CAR_DOC_TYPES: DocumentType[] = [
  "rca",
  "casco",
  "itp",
  "rovinieta",
  "vignette",
  "bridge_toll",
  "car_tax",
  "service",
  "parking",
  "fuel",
  "tires",
  "fine",
  "highway_toll",
  "car_wash",
  "leasing",
  "roadside_assistance",
  "spare_parts",
  "ferry",
  "talon",
];
