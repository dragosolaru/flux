import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

interface VehicleIconProps {
  model?: string;
  size?: Size;
  className?: string;
}

const SIZE_CLASSES: Record<Size, string> = {
  sm: "size-12",
  md: "size-24",
  lg: "size-32",
};

// ---------------------------------------------------------------------------
// Model 3 — compact sedan, sloped roofline
// ---------------------------------------------------------------------------
function Model3Silhouette({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Tesla Model 3" className={className}>
      <path
        d="M5 33 L6 23 Q13 12 24 11 Q35 10 42 23 L43 33 Z"
        fill="currentColor"
        opacity="0.15"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M13 23 Q18 14 24 13 Q30 12 35 23"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <line x1="13" y1="23" x2="16" y2="33" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
      <line x1="35" y1="23" x2="39" y2="33" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
      <circle cx="13" cy="33" r="4.5" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="13" cy="33" r="2" fill="currentColor" opacity="0.25" />
      <circle cx="35" cy="33" r="4.5" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="35" cy="33" r="2" fill="currentColor" opacity="0.25" />
      <line x1="3" y1="33" x2="45" y2="33" stroke="currentColor" strokeWidth="0.8" opacity="0.25" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Model S — long luxury sedan with pronounced fastback sweep
// ---------------------------------------------------------------------------
function ModelSSilhouette({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Tesla Model S" className={className}>
      <path
        d="M4 33 L5 22 Q14 11 24 10 Q36 9 43 22 L44 33 Z"
        fill="currentColor"
        opacity="0.15"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M12 22 Q17 13 24 12 Q32 11 38 18 L42 33"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <line x1="12" y1="22" x2="15" y2="33" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
      <circle cx="12" cy="33" r="4.5" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="12" cy="33" r="2" fill="currentColor" opacity="0.25" />
      <circle cx="36" cy="33" r="4.5" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="36" cy="33" r="2" fill="currentColor" opacity="0.25" />
      <line x1="2" y1="33" x2="46" y2="33" stroke="currentColor" strokeWidth="0.8" opacity="0.25" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Model X — tall SUV, upright roofline with falcon-wing hint
// ---------------------------------------------------------------------------
function ModelXSilhouette({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Tesla Model X" className={className}>
      <path
        d="M4 35 L5 20 Q14 8 24 7 Q35 6 43 20 L44 35 Z"
        fill="currentColor"
        opacity="0.15"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M11 20 Q17 9 24 8 Q32 7 37 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <line x1="11" y1="20" x2="14" y2="35" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
      <line x1="37" y1="20" x2="40" y2="35" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
      <path d="M24 8 Q27 6 30 8" stroke="currentColor" strokeWidth="0.7" opacity="0.35" fill="none" />
      <circle cx="12" cy="35" r="5" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="12" cy="35" r="2.2" fill="currentColor" opacity="0.25" />
      <circle cx="36" cy="35" r="5" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="36" cy="35" r="2.2" fill="currentColor" opacity="0.25" />
      <line x1="2" y1="35" x2="46" y2="35" stroke="currentColor" strokeWidth="0.8" opacity="0.25" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Model Y — compact crossover, taller than Model 3
// ---------------------------------------------------------------------------
function ModelYSilhouette({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Tesla Model Y" className={className}>
      <path
        d="M4 34 L5 21 Q13 10 24 9 Q36 8 43 21 L44 34 Z"
        fill="currentColor"
        opacity="0.15"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M12 21 Q17 11 24 10 Q32 9 36 21"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <line x1="12" y1="21" x2="15" y2="34" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
      <line x1="36" y1="21" x2="40" y2="34" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
      <circle cx="13" cy="34" r="5" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="13" cy="34" r="2.2" fill="currentColor" opacity="0.25" />
      <circle cx="35" cy="34" r="5" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="35" cy="34" r="2.2" fill="currentColor" opacity="0.25" />
      <line x1="2" y1="34" x2="46" y2="34" stroke="currentColor" strokeWidth="0.8" opacity="0.25" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Generic car fallback
// ---------------------------------------------------------------------------
function GenericCarSilhouette({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Vehicle" className={className}>
      <path
        d="M5 33 L6 22 Q14 12 24 11 Q34 10 42 22 L43 33 Z"
        fill="currentColor"
        opacity="0.15"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M14 22 Q19 13 24 12 Q30 11 34 22"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <line x1="14" y1="22" x2="17" y2="33" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
      <line x1="34" y1="22" x2="38" y2="33" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
      <circle cx="14" cy="33" r="4.5" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="14" cy="33" r="2" fill="currentColor" opacity="0.25" />
      <circle cx="34" cy="33" r="4.5" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="34" cy="33" r="2" fill="currentColor" opacity="0.25" />
      <line x1="3" y1="33" x2="45" y2="33" stroke="currentColor" strokeWidth="0.8" opacity="0.25" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export function VehicleIcon({ model, size = "md", className }: VehicleIconProps) {
  const normalized = model?.trim().toLowerCase() ?? "";
  const sizeClass = SIZE_CLASSES[size];
  const iconClass = cn(sizeClass, className);

  const isModel3 = normalized.includes("model 3") || normalized.includes("model3");
  const isModelS = normalized.includes("model s") || normalized.includes("models");
  const isModelX = normalized.includes("model x") || normalized.includes("modelx");
  const isModelY = normalized.includes("model y") || normalized.includes("modely");

  if (isModel3) return <Model3Silhouette className={iconClass} />;
  if (isModelS) return <ModelSSilhouette className={iconClass} />;
  if (isModelX) return <ModelXSilhouette className={iconClass} />;
  if (isModelY) return <ModelYSilhouette className={iconClass} />;

  return <GenericCarSilhouette className={iconClass} />;
}
