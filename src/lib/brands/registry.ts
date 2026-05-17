import { teslaProfile } from "./tesla/profile";
import { bmwProfile } from "./bmw/profile";
import { polestarProfile } from "./polestar/profile";
import { mercedesProfile } from "./mercedes/profile";
import { vwProfile } from "./vw/profile";
import { hyundaiProfile } from "./hyundai/profile";
import { renaultProfile } from "./renault/profile";
import type { BrandKey, BrandProfile } from "./types";

export const BRANDS: Record<BrandKey, BrandProfile> = {
  tesla: teslaProfile,
  bmw: bmwProfile,
  polestar: polestarProfile,
  mercedes: mercedesProfile,
  vw: vwProfile,
  hyundai: hyundaiProfile,
  renault: renaultProfile,
} as const;

export const BRAND_KEYS = Object.keys(BRANDS) as BrandKey[];

export function getBrand(key: string): BrandProfile | null {
  return Object.prototype.hasOwnProperty.call(BRANDS, key)
    ? BRANDS[key as BrandKey]
    : null;
}
