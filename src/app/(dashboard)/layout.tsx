import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { BottomNav } from "@/components/layout/BottomNav";
import { MockGlobalBanner } from "@/components/layout/MockGlobalBanner";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import { auth } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="flex h-dvh flex-col">
      <ServiceWorkerRegistrar />
      {/* Horizontal row: sidebar + main content */}
      <div className="flex min-w-0 flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar />
          <MockGlobalBanner />
          <main className="relative flex-1 overflow-y-auto px-4 py-6 pb-4 md:px-8 md:pb-6">{children}</main>
        </div>
      </div>
      {/* Bottom nav sits at the base of the flex column — no position:fixed needed */}
      <BottomNav />
      <InstallPrompt />
    </div>
  );
}
