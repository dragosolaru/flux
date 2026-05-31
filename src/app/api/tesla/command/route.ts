import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { isLiveEnabled } from "@/lib/live-integrations";
import { sendVehicleCommand } from "@/lib/tesla/api";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

const SUPPORTED_COMMANDS = [
  "door_lock",
  "door_unlock",
  "honk_horn",
  "flash_lights",
  "auto_conditioning_start",
  "auto_conditioning_stop",
  "set_charge_limit",
] as const;

const bodySchema = z.object({
  vehicleId: z.string().uuid(),
  command: z.enum(SUPPORTED_COMMANDS),
  params: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  if (!isLiveEnabled("tesla")) {
    return NextResponse.json({ message: "Tesla live integration is not enabled" }, { status: 410 });
  }
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!await checkRateLimit(session.user.id, "tesla-command", 10)) {
    return NextResponse.json({ message: "Too many requests" }, { status: 429 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid request body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data: vehicle, error } = await supabase
    .from("vehicles")
    .select("id, tesla_vehicle_id")
    .eq("user_id", session.user.id)
    .eq("id", parsed.data.vehicleId)
    .maybeSingle();

  if (error || !vehicle || !vehicle.tesla_vehicle_id) {
    return NextResponse.json(
      { message: "Vehicle not found" },
      { status: 404 },
    );
  }

  try {
    const result = await sendVehicleCommand({
      vehicleId: vehicle.id,
      userId: session.user.id,
      teslaVehicleId: vehicle.tesla_vehicle_id,
      command: parsed.data.command,
      body: parsed.data.params,
    });

    return NextResponse.json({
      success: result.response.result,
      result: result.response.reason,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Command failed";

    // Tesla deprecated REST commands on Model 3/Y/S/X built after 2021.
    // Surface this as a structured error so the UI can guide the user.
    if (message.includes("Vehicle Command Protocol required")) {
      return NextResponse.json(
        {
          success: false,
          result: "Tesla Vehicle Command Protocol required",
          code: "VCP_REQUIRED",
        },
        { status: 412 },
      );
    }

    return NextResponse.json({ success: false, result: message }, { status: 502 });
  }
}
