interface FluxLogoProps {
  size?: number;
  className?: string;
}

export function FluxLogo({ size = 24, className }: FluxLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="flux-g" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#14b8a6" />
        </linearGradient>
      </defs>
      <line x1="8" y1="6" x2="8" y2="26" stroke="url(#flux-g)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M 8,6 C 16,5 22,8 24,14" stroke="url(#flux-g)" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="8" y1="16" x2="17" y2="16" stroke="url(#flux-g)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="24" cy="14" r="2.5" fill="#14b8a6" />
    </svg>
  );
}
