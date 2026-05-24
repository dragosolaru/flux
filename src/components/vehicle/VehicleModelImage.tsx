import { cn } from "@/lib/utils";

interface VehicleModelImageProps {
  model: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Model 3 — low sedan profile
// ---------------------------------------------------------------------------
function Model3({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Tesla Model 3"
      className={className}
    >
      {/* Body */}
      <path
        d="M20 55 L22 38 Q40 18 80 16 Q110 14 130 18 Q155 22 170 38 L178 55 Z"
        fill="currentColor"
        opacity="0.15"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Cabin roof */}
      <path
        d="M55 38 Q72 22 100 20 Q128 18 145 38"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Windshield */}
      <line x1="55" y1="38" x2="68" y2="55" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      {/* Rear window */}
      <line x1="145" y1="38" x2="160" y2="55" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      {/* Ground line */}
      <line x1="15" y1="55" x2="185" y2="55" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      {/* Front wheel */}
      <circle cx="50" cy="55" r="11" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="50" cy="55" r="5" fill="currentColor" opacity="0.2" />
      {/* Rear wheel */}
      <circle cx="148" cy="55" r="11" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="148" cy="55" r="5" fill="currentColor" opacity="0.2" />
      {/* Front bumper */}
      <path d="M20 55 Q16 54 14 58 L16 62 Q18 64 24 64" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* Rear bumper */}
      <path d="M178 55 Q182 54 184 58 L182 62 Q180 64 174 64" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Model Y — taller crossover/SUV profile
// ---------------------------------------------------------------------------
function ModelY({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Tesla Model Y"
      className={className}
    >
      {/* Body */}
      <path
        d="M18 55 L20 35 Q35 14 75 12 Q112 10 135 14 Q158 18 172 35 L180 55 Z"
        fill="currentColor"
        opacity="0.15"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Cabin roof — wider, more upright than Model 3 */}
      <path
        d="M48 35 Q65 18 100 16 Q136 14 152 35"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Windshield */}
      <line x1="48" y1="35" x2="60" y2="55" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      {/* Rear window */}
      <line x1="152" y1="35" x2="163" y2="55" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      {/* Ground line */}
      <line x1="12" y1="55" x2="188" y2="55" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      {/* Front wheel */}
      <circle cx="52" cy="55" r="12" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="52" cy="55" r="5.5" fill="currentColor" opacity="0.2" />
      {/* Rear wheel */}
      <circle cx="150" cy="55" r="12" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="150" cy="55" r="5.5" fill="currentColor" opacity="0.2" />
      {/* Front bumper */}
      <path d="M18 55 Q14 54 12 58 L14 62 Q16 64 22 64" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* Rear bumper */}
      <path d="M180 55 Q184 54 186 58 L184 62 Q182 64 176 64" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Model S — long luxury sedan, fastback roofline
// ---------------------------------------------------------------------------
function ModelS({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 220 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Tesla Model S"
      className={className}
    >
      {/* Body */}
      <path
        d="M15 55 L18 37 Q38 16 82 14 Q120 12 145 16 Q172 20 188 37 L195 55 Z"
        fill="currentColor"
        opacity="0.15"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Fastback roof — long, swooping */}
      <path
        d="M52 37 Q72 18 105 16 Q138 14 158 30 L175 55"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Windshield */}
      <line x1="52" y1="37" x2="65" y2="55" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      {/* Ground line */}
      <line x1="10" y1="55" x2="202" y2="55" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      {/* Front wheel */}
      <circle cx="55" cy="55" r="11" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="55" cy="55" r="5" fill="currentColor" opacity="0.2" />
      {/* Rear wheel */}
      <circle cx="158" cy="55" r="11" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="158" cy="55" r="5" fill="currentColor" opacity="0.2" />
      {/* Front bumper */}
      <path d="M15 55 Q11 54 9 58 L11 62 Q13 64 19 64" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* Rear bumper */}
      <path d="M195 55 Q199 54 201 58 L199 62 Q197 64 191 64" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Model X — large SUV with falcon-wing roof hint
// ---------------------------------------------------------------------------
function ModelX({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 210 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Tesla Model X"
      className={className}
    >
      {/* Body */}
      <path
        d="M15 58 L18 34 Q34 10 78 8 Q115 6 140 10 Q168 14 180 34 L188 58 Z"
        fill="currentColor"
        opacity="0.15"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Tall SUV roof */}
      <path
        d="M44 34 Q62 14 100 12 Q140 10 158 34"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Windshield */}
      <line x1="44" y1="34" x2="56" y2="58" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      {/* Rear */}
      <line x1="158" y1="34" x2="170" y2="58" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      {/* Falcon-wing door hint — subtle raised ridge lines */}
      <path d="M105 12 Q112 9 118 12" stroke="currentColor" strokeWidth="1" opacity="0.35" fill="none" />
      {/* Ground line */}
      <line x1="10" y1="58" x2="196" y2="58" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      {/* Front wheel */}
      <circle cx="52" cy="58" r="13" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="52" cy="58" r="6" fill="currentColor" opacity="0.2" />
      {/* Rear wheel */}
      <circle cx="152" cy="58" r="13" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="152" cy="58" r="6" fill="currentColor" opacity="0.2" />
      {/* Front bumper */}
      <path d="M15 58 Q11 57 9 61 L11 65 Q13 67 19 67" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* Rear bumper */}
      <path d="M188 58 Q192 57 194 61 L192 65 Q190 67 184 67" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Cybertruck — angular, geometric profile
// ---------------------------------------------------------------------------
function Cybertruck({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 220 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Tesla Cybertruck"
      className={className}
    >
      {/* Body — hard angular lines */}
      <path
        d="M18 58 L22 30 L55 14 L155 14 L190 30 L198 58 Z"
        fill="currentColor"
        opacity="0.15"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="miter"
      />
      {/* Cab roof — sharp angles */}
      <polyline
        points="50,58 55,14 140,14 155,30 155,58"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="miter"
        strokeLinecap="square"
      />
      {/* Bed / truck box flat top line */}
      <line x1="155" y1="14" x2="190" y2="30" stroke="currentColor" strokeWidth="1.8" />
      {/* Ground line */}
      <line x1="12" y1="58" x2="206" y2="58" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      {/* Front wheel */}
      <circle cx="55" cy="58" r="13" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="55" cy="58" r="6" fill="currentColor" opacity="0.2" />
      {/* Rear wheel */}
      <circle cx="165" cy="58" r="13" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="165" cy="58" r="6" fill="currentColor" opacity="0.2" />
      {/* Windshield — single flat pane */}
      <line x1="55" y1="14" x2="50" y2="30" stroke="currentColor" strokeWidth="1" opacity="0.4" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Generic car fallback
// ---------------------------------------------------------------------------
function GenericCar({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Vehicle"
      className={className}
    >
      {/* Body */}
      <path
        d="M20 55 L23 38 Q42 18 80 16 Q112 14 132 18 Q158 22 172 38 L178 55 Z"
        fill="currentColor"
        opacity="0.15"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Roof */}
      <path
        d="M58 38 Q75 22 100 20 Q126 18 143 38"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Windshield */}
      <line x1="58" y1="38" x2="70" y2="55" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      {/* Rear window */}
      <line x1="143" y1="38" x2="157" y2="55" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      {/* Ground line */}
      <line x1="15" y1="55" x2="185" y2="55" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      {/* Front wheel */}
      <circle cx="52" cy="55" r="11" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="52" cy="55" r="5" fill="currentColor" opacity="0.2" />
      {/* Rear wheel */}
      <circle cx="148" cy="55" r="11" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="148" cy="55" r="5" fill="currentColor" opacity="0.2" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export function VehicleModelImage({ model, className }: VehicleModelImageProps) {
  const normalized = model.trim().toLowerCase();

  const sharedClass = cn("w-full h-full", className);

  if (normalized === "model 3") return <Model3 className={sharedClass} />;
  if (normalized === "model y") return <ModelY className={sharedClass} />;
  if (normalized === "model s") return <ModelS className={sharedClass} />;
  if (normalized === "model x") return <ModelX className={sharedClass} />;
  if (normalized === "cybertruck") return <Cybertruck className={sharedClass} />;

  return <GenericCar className={sharedClass} />;
}
