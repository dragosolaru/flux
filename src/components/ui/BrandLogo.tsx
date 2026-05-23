import type { FC } from "react";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
}

function TeslaLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 342 342" fill="currentColor" className={className} aria-hidden>
      <path d="M0 67.5C57.5 80 99.5 84.5 171 84.5S284.5 80 342 67.5C335.5 18.5 293 0 171 0S6.5 18.5 0 67.5Z" />
      <path d="M128 76.5L171 342L214 76.5C199 78.5 185 79.5 171 79.5S143 78.5 128 76.5Z" />
    </svg>
  );
}

const LOGOS: Record<string, FC<LogoProps>> = {
  tesla: TeslaLogo,
};

interface BrandLogoProps {
  brand: string;
  className?: string;
}

export function BrandLogo({ brand, className }: BrandLogoProps) {
  const Logo = LOGOS[brand];
  if (!Logo) return null;
  return <Logo className={cn("size-10", className)} />;
}
