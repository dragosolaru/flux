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

function BmwLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={className} aria-hidden>
      <circle cx="50" cy="50" r="47" stroke="currentColor" strokeWidth="6" />
      <circle cx="50" cy="50" r="34" stroke="currentColor" strokeWidth="2" />
      {/* Blue quadrants */}
      <path d="M50 16 A34 34 0 0 1 84 50 L50 50 Z" fill="#1C6BBA" />
      <path d="M50 84 A34 34 0 0 1 16 50 L50 50 Z" fill="#1C6BBA" />
      {/* White quadrants */}
      <path d="M16 50 A34 34 0 0 1 50 16 L50 50 Z" fill="white" />
      <path d="M84 50 A34 34 0 0 1 50 84 L50 50 Z" fill="white" />
    </svg>
  );
}

function PolestarLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 100 100" fill="currentColor" className={className} aria-hidden>
      {/* Polestar asterisk — four bold strokes through center */}
      <rect x="47" y="5" width="6" height="90" rx="3" />
      <rect x="5" y="47" width="90" height="6" rx="3" />
      <rect x="47" y="5" width="6" height="90" rx="3" transform="rotate(45 50 50)" />
      <rect x="5" y="47" width="90" height="6" rx="3" transform="rotate(45 50 50)" />
    </svg>
  );
}

function MercedesLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={className} aria-hidden>
      <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="5" />
      {/* Three-pointed star */}
      <line x1="50" y1="8" x2="50" y2="50" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <line x1="50" y1="50" x2="12" y2="77" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <line x1="50" y1="50" x2="88" y2="77" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      {/* Outer ring of star points */}
      <path d="M50 8 L44 24 L56 24 Z" fill="currentColor" />
      <path d="M12 77 L25 64 L18 52 Z" fill="currentColor" />
      <path d="M88 77 L75 64 L82 52 Z" fill="currentColor" />
    </svg>
  );
}

function VwLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={className} aria-hidden>
      <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="5" />
      {/* V shape */}
      <path d="M30 26 L50 56 L70 26" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* W shape */}
      <path d="M22 44 L35 74 L50 54 L65 74 L78 44" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function HyundaiLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 200 80" fill="currentColor" className={className} aria-hidden>
      {/* Hyundai H — slanted oval with H inside */}
      <ellipse cx="100" cy="40" rx="98" ry="38" fill="none" stroke="currentColor" strokeWidth="7" />
      {/* Italic H letterform */}
      <path d="M58 18 L50 62 L63 62 L67 44 L97 44 L93 62 L106 62 L114 18 L101 18 L97 36 L67 36 L71 18 Z" />
      <path d="M108 18 L100 62 L113 62 L121 18 Z" />
    </svg>
  );
}

function RenaultLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 100 100" fill="currentColor" className={className} aria-hidden>
      {/* Renault diamond */}
      <path d="M50 5 L95 50 L50 95 L5 50 Z" fill="none" stroke="currentColor" strokeWidth="6" />
      {/* Inner diamond with cutout */}
      <path d="M50 22 L78 50 L50 78 L22 50 Z" fill="none" stroke="currentColor" strokeWidth="5" />
      {/* Center line — Renault's characteristic center-split */}
      <line x1="50" y1="22" x2="50" y2="78" stroke="currentColor" strokeWidth="5" />
    </svg>
  );
}

const LOGOS: Record<string, React.FC<LogoProps>> = {
  tesla:    TeslaLogo,
  bmw:      BmwLogo,
  polestar: PolestarLogo,
  mercedes: MercedesLogo,
  vw:       VwLogo,
  hyundai:  HyundaiLogo,
  renault:  RenaultLogo,
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
