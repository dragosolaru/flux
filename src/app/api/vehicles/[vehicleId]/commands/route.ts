import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { COMMAND_CAP_MAP } from "@/lib/brands/command-map";
import { getBrand } from "@/lib/brands/registry";
import { applyCommand } from "@/lib/mock/engine";
import { loadSnapshot, saveSnapshot, recordCommandEvent } from "@/lib/mock/persistence";
import { alertOnSensitiveCommand } from "@/lib/notifications/security-alert";
import { createInitialSnapshot } from "@/lib/mock/seed";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { CommandName } from "@/types/history";
import type { BrandKey } from "@/lib/brands/types";

const VALID_COMMANDS: CommandName[] = [
  "lock", "unlock", "climate_on", "climate_off", "set_climate_temp",
  "honk", "flash", "set_charge_limit", "set_charge_amps",
  "start_charging", "stop_charging", "open_charge_port", "close_charge_port",
  "vent_windows", "close_windows", "activate_sentry", "deactivate_sentry", "remote_start",
  "schedule_charging", "schedule_departure", "precondition_max", "share_navigation",
  "add_charge_schedule", "add_precondition_schedule",
  "remove_charge_schedule", "remove_precondition_schedule",
];

/**
 * The day names Tesla's proxy accepts, and only those.
 *
 * Copied from `dayNamesBitMask` in teslamotors/vehicle-command; an unknown name
 * is rejected there with "unrecognized day name", which would arrive here as a
 * generic command failure with nothing pointing at the real cause.
 */
const DAY = "SUN|SUNDAY|MON|MONDAY|TUES|TUESDAY|WED|WEDNESDAY|THURS|THURSDAY|FRI|FRIDAY|SAT|SATURDAY";
const DAYS_RE = new RegExp(`^(ALL|WEEKDAYS|(${DAY})(,(${DAY}))*)$`);

const bodySchema = z.object({
  command: z.enum(VALID_COMMANDS as [CommandName, ...CommandName[]]),
  args: z.record(z.string(), z.unknown()).optional().nullable(),
});

/**
 * Bounds for the commands that carry a number to the car.
 *
 * `args` is an open record — it has to be, since each command takes a different
 * shape — so nothing stopped `set_charge_limit` with `percent: 3` or
 * `set_charge_amps` with a negative value from being built into a request and
 * sent. The car is the last thing that should be validating this: a rejected
 * command is a wasted Fleet API call at best, and Tesla's own bounds are not
 * documented as stable.
 *
 * Only the commands with a numeric range are listed. Everything else passes
 * through, because `buildBody` already ignores what it does not read.
 */
const ARG_BOUNDS: Partial<Record<CommandName, z.ZodType>> = {
  set_charge_limit: z.object({ percent: z.number().int().min(50).max(100) }).loose(),
  set_charge_amps: z.object({ amps: z.number().int().min(0).max(48) }).loose(),
  set_climate_temp: z.object({ temp: z.number().min(15).max(28) }).loose(),
  // Minutes past local midnight.
  schedule_charging: z
    .object({ time: z.number().int().min(0).max(1439) })
    .loose(),
  schedule_departure: z
    .object({ time: z.number().int().min(0).max(1439) })
    .loose(),
  // Bound to a place and to days, unlike the older pair. The day string is
  // validated against exactly what Tesla's proxy accepts — anything else is
  // rejected there with "unrecognized day name", which would reach the driver
  // as a generic failure.
  add_charge_schedule: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      days: z.string().regex(DAYS_RE),
      startTime: z.number().int().min(0).max(1439).optional(),
      endTime: z.number().int().min(0).max(1439).optional(),
      enabled: z.boolean().optional(),
      oneTime: z.boolean().optional(),
      id: z.number().int().nonnegative().optional(),
    })
    .loose(),
  add_precondition_schedule: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      time: z.number().int().min(0).max(1439),
      days: z.string().regex(DAYS_RE),
      enabled: z.boolean().optional(),
      oneTime: z.boolean().optional(),
      id: z.number().int().nonnegative().optional(),
    })
    .loose(),
  remove_charge_schedule: z.object({ id: z.number().int().nonnegative() }).loose(),
  remove_precondition_schedule: z.object({ id: z.number().int().nonnegative() }).loose(),
  share_navigation: z
    .object({
      destination: z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      }),
    })
    .loose(),
};

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

  const bounds = ARG_BOUNDS[command];
  if (bounds) {
    const checked = bounds.safeParse(args ?? {});
    if (!checked.success) {
      return NextResponse.json(
        { message: "invalid-command-args", errors: z.treeifyError(checked.error) },
        { status: 400 },
      );
    }
  }

  const supabase = createSupabaseAdminClient();
  const { data: vehicle, error: vehErr } = await supabase
    .from("vehicles")
    .select("id, brand, data_source, display_name, model, tesla_vehicle_id, vin")
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

  // The live path is gone with the Tesla integration. A vehicle still stored as
  // `live` must be refused rather than falling through to the simulator below,
  // which would apply the command to an invented snapshot and answer "locked"
  // while nothing left the building.
  if (vehicle.data_source === "live") {
    return NextResponse.json(
      { message: "Vehicle link is not available", code: "LIVE_PAUSED" },
      { status: 503 },
    );
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
    alertOnSensitiveCommand({
      userId: session.user.id,
      command,
      vehicleName: vehicle.display_name,
      success: true,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    const errorCode = err instanceof Error ? err.message : "unknown";
    await recordCommandEvent(vehicleId, command, args ?? null, false, errorCode).catch(() => null);
    return NextResponse.json({ message: errorCode }, { status: 400 });
  }
}
