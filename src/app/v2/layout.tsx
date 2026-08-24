import type { ReactNode } from "react";
import { Space_Grotesk } from "next/font/google";

import { VehicleProvider } from "@/contexts/vehicle";

/**
 * /v2 — the Instrument redesign, running beside the live app rather than
 * replacing it. Same auth, same VehicleProvider, same hooks, same API routes:
 * only the presentation is new. Nothing here forks the data layer, so a screen
 * ported to /v2 stays correct as the app changes underneath it.
 *
 * There is deliberately NO auth guard in this layout. Every page under it calls
 * `auth()` itself — the guard belongs where the data is read, not in a shared
 * layout that would then need an exception carved out of it for /v2/login and
 * /v2/register. A conditional guard is the kind of thing that is one refactor
 * away from guarding nothing.
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

export default function V2Layout({ children }: { children: ReactNode }) {
  return (
    <VehicleProvider>
      <div className={`v2 ${spaceGrotesk.variable} min-h-dvh`}>{children}</div>
    </VehicleProvider>
  );
}
