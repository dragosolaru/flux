import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { COMMAND_CAP_MAP } from "@/lib/brands/command-map";
import { getBrand } from "@/lib/brands/registry";
import { TESLA_COMMAND_MAP } from "@/lib/brands/tesla/command-map";
import { isLiveEnabled } from "@/lib/live-integrations";
import { applyCommand } from "@/lib/mock/engine";
import { loadSnapshot, saveSnapshot, recordCommandEvent } from "@/lib/mock/persistence";
import { createInitialSnapshot } from "@/lib/mock/seed";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { sendVehicleCommand } from "@/lib/tesla/api";
import type { CommandName } from "@/types/history";
import type { BrandKey } from "@/lib/brands/types";

const VALID_COMMANDS: CommandName[] = [
  "lock", "unlock", "climate_on", "climate_off", "set_climate_temp",
  "honk", "flash", "set_charge_limit", "set_charge_amps",
  "start_charging", "stop_charging", "open_charge_port", "close_charge_port",
  "vent_windows", "close_windows", "activate_sentry", "deactivate_sentry", "remote_start",
  "schedule_charging", "schedule_departure", "precondition_max", "share_navigation",
];

const bodySchema = z.object({
  command: z.enum(VALID_COMMANDS as [CommandName, ...CommandName[]]),
  args: z.record(z.string(), z.unknown()).optional().nullable(),
});

export async function POST(
  req: NextRequest,
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

  if (!(await checkRateLimit(session.user.id, "commands", 30))) {
    return NextResponse.json(
      { message: "Rate limit exceeded. Try again later." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid request", errors: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const command = parsed.data.command as CommandName;
  const args = parsed.data.args ?? null;

  const supabase = createSupabaseAdminClient();
  const { data: vehicle, error: vehErr } = await supabase
    .from("vehicles")
    .select("id, brand, data_source, display_name, model, tesla_vehicle_id")
    .eq("id", vehicleId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (vehErr || !vehicle) {
    return NextResponse.json({ message: "Vehicle not found" }, { status: 404 });
  }

  const profile = getBrand(vehicle.brand);
  if (!profile) {
    return NextResponse.json({ message: "unknown-brand" }, { status: 400 });
  }

  // Capability check using the shared COMMAND_CAP_MAP (same map the simulator uses)
  if (!profile.capabilities.commands[COMMAND_CAP_MAP[command]]) {
    return NextResponse.json({ message: "command-not-supported" }, { status: 400 });
  }

  // Live path
  if (isLiveEnabled(vehicle.brand) && vehicle.data_source === "live") {
    if (vehicle.brand !== "tesla" || !vehicle.tesla_vehicle_id) {
      return NextResponse.json({ message: "Live commands not supported for this vehicle" }, { status: 501 });
    }
    const entry = TESLA_COMMAND_MAP[command];
    if (!entry) {
      return NextResponse.json({ message: "command-not-supported-live" }, { status: 400 });
    }
    try {
      const result = await sendVehicleCommand({
        vehicleId: vehicle.id,
        userId: session.user.id,
        teslaVehicleId: vehicle.tesla_vehicle_id,
        command: entry.teslaCmd,
        body: entry.buildBody(args),
      });
      await recordCommandEvent(vehicleId, command, args, result.response.result, result.response.reason || null);
      return NextResponse.json({ success: result.response.result, result: result.response.reason });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Command failed";
      await recordCommandEvent(vehicleId, command, args, false, msg).catch(() => null);
      if (msg.includes("Vehicle Command Protocol required")) {
        return NextResponse.json({ success: false, result: msg, code: "VCP_REQUIRED" }, { status: 412 });
      }
      return NextResponse.json({ success: false, result: msg }, { status: 502 });
    }
  }

  // Mock path
  try {
    let prev = await loadSnapshot(vehicleId);
    if (!prev) {
      prev = createInitialSnapshot(
        vehicleId,
        vehicle.display_name,
        vehicle.brand as BrandKey,
        "commuter",
        vehicle.model ?? null,
      );
    }
    const next = applyCommand(prev, command, args ?? null, profile);
    await saveSnapshot(vehicleId, prev, next);
    await recordCommandEvent(vehicleId, command, args ?? null, true, null);
    return NextResponse.json({ success: true });
  } catch (err) {
    const errorCode = err instanceof Error ? err.message : "unknown";
    await recordCommandEvent(vehicleId, command, args ?? null, false, errorCode).catch(() => null);
    return NextResponse.json({ message: errorCode }, { status: 400 });
  }
}
