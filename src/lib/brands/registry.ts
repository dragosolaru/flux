import { teslaProfile } from "./tesla/profile";
import type { BrandKey, BrandProfile } from "./types";

export const BRANDS: Record<BrandKey, BrandProfile> = {
  tesla: teslaProfile,
} as const;

export const BRAND_KEYS = Object.keys(BRANDS) as BrandKey[];

export function getBrand(key: string): BrandProfile | null {
  return Object.prototype.hasOwnProperty.call(BRANDS, key)
    ? BRANDS[key as BrandKey]
    : null;
}
