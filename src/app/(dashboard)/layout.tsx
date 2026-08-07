import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { BottomNav } from "@/components/layout/BottomNav";
import { MockGlobalBanner } from "@/components/layout/MockGlobalBanner";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { VehicleProvider } from "@/contexts/vehicle";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    // Carry where they were headed. LoginForm already reads and validates
    // callbackUrl; only this guard was dropping it, so a logged-out user
    // opening a bookmark landed on the dashboard instead — which defeats the
    // point of keeping /trip alive as a redirect.
    const headerList = await headers();
    const target = headerList.get("x-pathname");
    redirect(target ? `/login?callbackUrl=${encodeURIComponent(target)}` : "/login");
  }

  return (
    <VehicleProvider>
      <div className="flex h-dvh flex-col">
        <ServiceWorkerRegistrar />
        <div className="flex min-w-0 flex-1 overflow-hidden">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <TopBar />
            <MockGlobalBanner />
            <main className="relative flex-1 overflow-y-auto px-4 py-4 pb-[calc(72px+env(safe-area-inset-bottom))] md:px-8 md:py-6 md:pb-6">{children}</main>
          </div>
          <BottomNav />
          <InstallPrompt />
        </div>
      </div>
    </VehicleProvider>
  );
}
