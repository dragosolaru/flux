import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { sendVehicleCommand } from "@/lib/tesla/api";
import type { TeslaCommand } from "@/types/tesla";

/**
 * Which way of sending a destination makes the car warm its battery?
 *
 * The question this settles: Flux sends `navigation_gps_request` with a bare
 * `{ lat, lon }`, and the car never preconditions on the way to a charger.
 * Sharing the same station from Google Maps *does* precondition it. The
 * difference is not the place, it is what the car is told about the place —
 * coordinates cannot say "this is a charger", and a resolved address can,
 * because the car looks it up in its own POI database.
 *
 * That is a hypothesis with one strong data point behind it, and the last time
 * someone in this codebase acted on a hypothesis about a Tesla command without
 * measuring it, every navigation request turned on Max Defrost. So this probe
 * measures instead: it sends the same destination three ways, one at a time,
 * and reports what each returned.
 *
 * It is a diagnostic and it lives here rather than in the command vocabulary on
 * purpose. Two of the three endpoints may turn out to be wrong or unsupported,
 * and a product command list is not the place to keep an experiment.
 */

const bodySchema = z.object({
  vehicleId: z.string().uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** What a human would type into the car's search box. */
  address: z.string().min(3).max(300),
  method: z.enum(["gps", "share", "navigation_request"]),
});

/**
 * The Android share intent, which is what Google Maps sends and therefore the
 * closest thing to a control in this experiment. Shape from timdorr/tesla-api
 * `docs/vehicle/commands/sharing.md`, which notes the endpoint was renamed from
 * `navigation_request` to `share` — hence trying both names rather than betting
 * on one.
 */
function shareBody(address: string): Record<string, unknown> {
  return {
    type: "share_ext_content_raw",
    value: { "android.intent.extra.TEXT": address },
    locale: "ro-RO",
    timestamp_ms: String(Date.now()),
  };
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  // Each press sends a real command to a real car. Low ceiling.
  if (!(await checkRateLimit(session.user.id, "nav-probe", 30))) {
    return NextResponse.json({ message: "rate-limited" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "bad-request" }, { status: 400 });
  }
  const { vehicleId, lat, lng, address, method } = parsed.data;

  // Ownership, the same check every other vehicle route makes. A probe is not
  // an excuse to skip it.
  const supabase = createSupabaseAdminClient();
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id, tesla_vehicle_id, vin, data_source")
    .eq("id", vehicleId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  const row = vehicle as
    | { tesla_vehicle_id: number | null; vin: string | null; data_source: string }
    | null;

  if (!row) return NextResponse.json({ message: "not-found" }, { status: 404 });
  if (row.data_source !== "live" || row.tesla_vehicle_id == null) {
    // The simulator cannot answer this question — the whole point is what a
    // real car's navigation does with the destination.
    return NextResponse.json({ message: "needs-a-linked-car" }, { status: 400 });
  }

  const [command, body]: [TeslaCommand, Record<string, unknown>] =
    method === "gps"
      ? ["navigation_gps_request", { lat, lon: lng, order: 0 }]
      : method === "share"
        ? ["share" as TeslaCommand, shareBody(address)]
        : ["navigation_request" as TeslaCommand, shareBody(address)];

  try {
    const result = await sendVehicleCommand({
      vehicleId,
      userId: session.user.id,
      teslaVehicleId: row.tesla_vehicle_id,
      vin: row.vin,
      command,
      body,
      // Tesla's own proxy answers ErrCommandUseRESTAPI for navigation_request,
      // so none of these three are signed commands.
      signed: false,
    });
    return NextResponse.json({ ok: true, command, sent: body, result: result.response });
  } catch (err) {
    // The failure is the finding here as much as the success is, so it is
    // reported rather than flattened into a generic error.
    return NextResponse.json({
      ok: false,
      command,
      sent: body,
      error: err instanceof Error ? err.message : "unknown",
    });
  }
}
