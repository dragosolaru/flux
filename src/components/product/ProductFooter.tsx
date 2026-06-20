import Link from "next/link";
import { FluxLogo } from "@/components/ui/FluxLogo";

export function ProductFooter() {
  return (
    <footer className="border-t border-white/[0.06] py-8">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 md:px-8">
        <div className="flex items-center gap-2 text-sm text-white/40">
          <FluxLogo size={16} />
          <span>© 2026 DAO Lab</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-white/40">
          <Link href="/" className="transition-colors hover:text-white">
            Landing
          </Link>
          <Link href="/dashboard" className="transition-colors hover:text-white">
            App
          </Link>
        </div>
      </div>
    </footer>
  );
}
