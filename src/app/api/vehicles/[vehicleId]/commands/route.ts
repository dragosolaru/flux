import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { getBrand } from "@/lib/brands/registry";
import { isLiveEnabled } from "@/lib/live-integrations";
import { applyCommand } from "@/lib/mock/engine";
import { loadSnapshot, saveSnapshot, recordCommandEvent } from "@/lib/mock/persistence";
import { createInitialSnapshot } from "@/lib/mock/seed";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { CommandName } from "@/types/history";
import type { BrandKey } from "@/lib/brands/types";

const VALID_COMMANDS: CommandName[] = [
  "lock", "unlock", "climate_on", "climate_off", "set_climate_temp",
  "honk", "flash", "set_charge_limit", "set_charge_amps",
  "start_charging", "stop_charging", "open_charge_port", "close_charge_port",
  "vent_windows", "close_windows", "activate_sentry", "deactivate_sentry", "remote_start",
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
    .select("id, brand, data_source, display_name, tesla_vehicle_id")
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

  // Capability check before any adapter call
  const capMap: Record<CommandName, keyof typeof profile.capabilities.commands> = {
    lock: "lock", unlock: "unlock",
    climate_on: "climateOn", climate_off: "climateOff", set_climate_temp: "setClimateTemp",
    honk: "honk", flash: "flash",
    set_charge_limit: "setChargeLimit", set_charge_amps: "setChargeAmps",
    start_charging: "startCharging", stop_charging: "stopCharging",
    open_charge_port: "openChargePort", close_charge_port: "closeChargePort",
    vent_windows: "ventWindows", close_windows: "closeWindows",
    activate_sentry: "activateSentry", deactivate_sentry: "deactivateSentry",
    remote_start: "remoteStart",
  };
  if (!profile.capabilities.commands[capMap[command]]) {
    return NextResponse.json({ message: "command-not-supported" }, { status: 400 });
  }

  // Live path
  if (isLiveEnabled(vehicle.brand) && vehicle.data_source === "live") {
    return NextResponse.json({ message: "Live commands not yet wired for this brand" }, { status: 501 });
  }

  // Mock path
  try {
    let prev = await loadSnapshot(vehicleId);
    if (!prev) {
      prev = createInitialSnapshot(vehicleId, vehicle.display_name, vehicle.brand as BrandKey, "commuter");
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
