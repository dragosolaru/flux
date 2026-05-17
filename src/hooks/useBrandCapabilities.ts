import { useMemo } from "react";
import { getBrand } from "@/lib/brands/registry";
import type { BrandCapabilities } from "@/lib/brands/types";
import type { VehicleBrand } from "@/types/vehicle";

// Returns the capability map for a given brand.
// Memoized by brand key — reference-stable as long as the brand doesn't change.
export function useBrandCapabilities(brand: VehicleBrand): BrandCapabilities {
  return useMemo(() => {
    const profile = getBrand(brand);
    if (!profile) throw new Error(`Unknown brand: ${brand}`);
    return profile.capabilities;
  }, [brand]);
}
