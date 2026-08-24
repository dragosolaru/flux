import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { isLiveEnabled } from "@/lib/live-integrations";
import { errorContext, recordDebugLog } from "@/lib/debug-log";
import { fetchVehicleData, TeslaAsleepError } from "@/lib/tesla/api";
import { TeslaAuthError } from "@/lib/tesla/tokens";
import { saveLastKnown } from "@/lib/tesla/last-known";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Wake the car — the ONLY path in the app that may do so.
 *
 * Every other read passes `allowWake: false`, so a parked car stays asleep no
 * matter how many screens are opened. Waking costs real battery, so it is an
 * action with a driver's tap behind it, rate-limited hard, and counted.
 *
 * Ten an hour: waking is deliberate, and anything reaching that number is a
 * loop rather than a person.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ vehicleId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { vehicleId } = await params;
  if (!z.string().uuid().safeParse(vehicleId).success) {
    return NextResponse.json({ message: "Invalid vehicleId" }, { status: 400 });
  }

  if (!(await checkRateLimit(session.user.id, "wake", 10))) {
    return NextResponse.json(
      { message: "Too many requests" },
      { status: 429, headers: { "Retry-After": "600" } },
    );
  }

  const supabase = createSupabaseAdminClient();

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id, brand, data_source, display_name, tesla_vehicle_id")
    .eq("id", vehicleId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!vehicle) {
    return NextResponse.json({ message: "Vehicle not found" }, { status: 404 });
  }

  const car = vehicle as {
    id: string;
    brand: string;
    data_source: string;
    display_name: string;
    tesla_vehicle_id: number | null;
  };

  if (car.data_source !== "live" || !isLiveEnabled(car.brand) || !car.tesla_vehicle_id) {
    // A simulator is never asleep, so there is nothing here to do and saying
    // "ok" would be a lie about a car that does not exist.
    return NextResponse.json({ message: "Only available for live vehicles" }, { status: 400 });
  }

  try {
    const state = await fetchVehicleData({
      vehicleId: car.id,
      userId: session.user.id,
      teslaVehicleId: car.tesla_vehicle_id,
      displayName: car.display_name,
      allowWake: true,
    });
    await saveLastKnown(supabase, car.id, state).catch(() => undefined);
    return NextResponse.json(state);
  } catch (err) {
    if (err instanceof TeslaAuthError) {
      return NextResponse.json(
        { message: "Tesla authorisation is gone", code: "TESLA_REAUTH_REQUIRED" },
        { status: 409 },
      );
    }
    // Tesla answers wake_up before the car is actually up, and a cold car can
    // take longer than the retry allows. That is "not yet", not "broken".
    if (err instanceof TeslaAsleepError) {
      return NextResponse.json(
        { message: "Still waking", code: "STILL_WAKING" },
        { status: 202 },
      );
    }
    recordDebugLog("error", "vehicles/wake", "wake failed", errorContext(err));
    return NextResponse.json({ message: "Wake failed" }, { status: 502 });
  }
}
