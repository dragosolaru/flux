import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { FluxLogo } from "@/components/ui/FluxLogo";

export async function ProductNav() {
  const t = await getTranslations("pricing");
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#09090b]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 md:px-8">
        <Link href="/" className="flex items-center gap-2">
          <FluxLogo size={20} />
          <span className="font-bold text-white">Flux</span>
        </Link>
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-white/50 transition-colors hover:text-white"
        >
          <ArrowLeft size={14} />
          {t("back_home")}
        </Link>
      </div>
    </header>
  );
}
