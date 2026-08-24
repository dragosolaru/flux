import type { ReactNode } from "react";
import { Space_Grotesk } from "next/font/google";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { VehicleProvider } from "@/contexts/vehicle";

/**
 * /v2 — the Instrument redesign, running beside the live app rather than
 * replacing it. Same auth, same VehicleProvider, same hooks, same API routes:
 * only the presentation is new. Nothing here forks the data layer, so a screen
 * ported to /v2 stays correct as the app changes underneath it.
 *
 * When a screen wins, its client component moves into the real route and this
 * tree is deleted. It is a staging area, not a second app.
 */
const spaceGrotesk = Space_Grotesk({
  variable: "--font-v2-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

export const metadata = { title: "Flux v2" };

export default async function V2Layout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    const target = (await headers()).get("x-pathname");
    redirect(target ? `/login?callbackUrl=${encodeURIComponent(target)}` : "/login");
  }

  return (
    <VehicleProvider>
      <div className={`v2 ${spaceGrotesk.variable} min-h-dvh`}>{children}</div>
    </VehicleProvider>
  );
}
