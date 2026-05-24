"use client";

import type { ReactNode } from "react";

import { checkCapability, type Capability } from "@/lib/capabilities";
import { useCapabilities } from "@/hooks/useCapabilities";

import { CapabilityEmptyState } from "./CapabilityEmptyState";

interface FeatureGateProps {
  capability: Capability;
  children: ReactNode;
  /**
   * Render nothing instead of an empty state when the capability is missing.
   * Useful for optional cards inside a larger page where the gate is implicit.
   */
  fallback?: "empty-state" | "null";
}

export function FeatureGate({
  capability,
  children,
  fallback = "empty-state",
}: FeatureGateProps) {
  const { data: ctx } = useCapabilities();
  if (!ctx) return null;

  const result = checkCapability(capability, ctx);
  if (result.ok) return <>{children}</>;

  if (fallback === "null") return null;
  return <CapabilityEmptyState missing={result.missing as Exclude<Capability, "NONE">} ctaHref={result.cta.href} />;
}
