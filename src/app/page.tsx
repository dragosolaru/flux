import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LandingNav } from "@/components/landing/LandingNav";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingSocialProof } from "@/components/landing/LandingSocialProof";
import { LandingFeatureVehicle } from "@/components/landing/LandingFeatureVehicle";
import { LandingBento } from "@/components/landing/LandingBento";
import { LandingFeatureCost } from "@/components/landing/LandingFeatureCost";
import { LandingFeatureTrip } from "@/components/landing/LandingFeatureTrip";
import { LandingCta } from "@/components/landing/LandingCta";
import { LandingFooter } from "@/components/landing/LandingFooter";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("landing");
  return {
    title: "Flux — EV Management for Tesla Owners",
    description: t("hero_subheadline"),
    openGraph: {
      title: "Flux — EV Management for Tesla Owners",
      description: t("hero_subheadline"),
      type: "website",
    },
  };
}

export default async function HomePage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <LandingNav />
      <LandingHero />
      <LandingSocialProof />
      <LandingFeatureVehicle />
      <LandingBento />
      <LandingFeatureCost />
      <LandingFeatureTrip />
      <LandingCta />
      <LandingFooter />
    </div>
  );
}
