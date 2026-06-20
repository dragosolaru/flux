import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";
import { ProductNav } from "@/components/product/ProductNav";
import { ProductHero } from "@/components/product/ProductHero";
import { AnyEvBar } from "@/components/product/AnyEvBar";
import { FeatureExplainers } from "@/components/product/FeatureExplainers";
import { RoadmapSection } from "@/components/product/RoadmapSection";
import { PricingSection } from "@/components/product/PricingSection";
import { TrustStrip } from "@/components/product/TrustStrip";
import { FaqSection } from "@/components/product/FaqSection";
import { FeedbackSection } from "@/components/product/FeedbackSection";
import { ProductFooter } from "@/components/product/ProductFooter";

export async function generateMetadata() {
  const t = await getTranslations("pricing");
  return {
    title: "Pricing · Flux",
    description: t("product_hero_subtitle"),
  };
}

export default async function PricingPage() {
  const session = await auth();
  let currentTier: "free" | "pro" = "free";

  if (session?.user) {
    const userId = await ensureSupabaseUserId(session);
    if (userId) {
      const supabase = createSupabaseAdminClient();
      const { data } = await supabase
        .from("profiles")
        .select("subscription_tier")
        .eq("id", userId)
        .single();
      currentTier = (
        (data as { subscription_tier?: string } | null)?.subscription_tier ?? "free"
      ) as "free" | "pro";
    }
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <ProductNav />
      <ProductHero />
      <AnyEvBar />
      <FeatureExplainers />
      <RoadmapSection />
      <PricingSection currentTier={currentTier} isLoggedIn={!!session?.user} />
      <TrustStrip />
      <FaqSection />
      <FeedbackSection />
      <ProductFooter />
    </div>
  );
}
