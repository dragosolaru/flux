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
import { alertOnSensitiveCommand } from "@/lib/notifications/security-alert";
import { createInitialSnapshot } from "@/lib/mock/seed";
import { recordDebugLog } from "@/lib/debug-log";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { sendVehicleCommand } from "@/lib/tesla/api";
import { TeslaAuthError } from "@/lib/tesla/tokens";
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
        vin: vehicle.vin,
        command: entry.teslaCmd,
        body: entry.buildBody(args),
        signed: entry.signed,
      });
      await recordCommandEvent(vehicleId, command, args, result.response.result, result.response.reason || null);
      // A signed command the car accepted is the only proof of pairing there
      // is — Tesla exposes no way to ask. Recording it here is what lets the
      // dashboard stop prompting, and what makes `virtual_key_paired` mean
      // something instead of sitting unread since the column was added.
      if (result.response.result) {
        await supabase
          .from("vehicles")
          .update({ virtual_key_paired: true })
          .eq("id", vehicle.id)
          .eq("user_id", session.user.id);
      }
      alertOnSensitiveCommand({
        userId: session.user.id,
        command,
        vehicleName: vehicle.display_name,
        success: result.response.result,
      });
      return NextResponse.json({ success: result.response.result, result: result.response.reason });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Command failed";
      await recordCommandEvent(vehicleId, command, args, false, msg).catch(() => null);
      // Same 409 the state route uses, for the same reason: a revoked Tesla
      // authorisation is not a failed command, and 401 would sign the driver
      // out of Flux over an unrelated identity.
      if (err instanceof TeslaAuthError) {
        recordDebugLog("warn", "vehicles/commands", "Tesla authorisation is gone", {
          command,
          detail: msg.slice(0, 300),
        });
        return NextResponse.json(
          { success: false, result: msg, code: "TESLA_REAUTH_REQUIRED" },
          { status: 409 },
        );
      }
      // Two different problems, two different fixes, and they arrive worded
      // completely differently because they come from different places:
      //
      //   "Vehicle Command Protocol required" — from Tesla's REST endpoint,
      //     because the request arrived unsigned. Nothing is deployed to sign
      //     it. An operator fixes this.
      //   "your public key has not been paired with the vehicle" — from the
      //     signing proxy itself (protocol.ErrKeyNotPaired in
      //     teslamotors/vehicle-command). Signing worked; this car has not
      //     stored our key. The owner fixes it on their phone.
      //
      // Only the first string was matched, so an unpaired car fell through to
      // the generic 502 and the driver got "command failed" with no pairing
      // prompt — the one case where the app knows exactly what to do next.
      // The proxy is configured but nothing answered. An operator problem, and
      // a different one from "the car said no".
      if (msg.startsWith("PROXY_UNREACHABLE:")) {
        recordDebugLog("error", "vehicles/commands", "signing proxy unreachable", {
          detail: msg.slice(0, 300),
        });
        return NextResponse.json(
          { success: false, result: msg, code: "PROXY_UNREACHABLE" },
          { status: 502 },
        );
      }
      const notPaired = /has not been paired with the vehicle/i.test(msg);
      const unsigned = msg.includes("Vehicle Command Protocol required");
      if (notPaired) {
        // The flag was a one-way latch: set true by the first accepted command
        // and never cleared. So a car whose key was removed afterwards kept
        // reporting itself as paired for good, every command failed, and the
        // one prompt that says what to do about it stayed hidden — because it
        // is shown on `virtual_key_paired === false`.
        //
        // The car saying "your public key has not been paired" is the most
        // authoritative signal that exists; Tesla offers no way to ask. It is
        // recorded, so the flag means "is paired" rather than "was, once".
        await supabase
          .from("vehicles")
          .update({ virtual_key_paired: false })
          .eq("id", vehicle.id)
          .eq("user_id", session.user.id);
      }
      if (notPaired || unsigned) {
        // notPaired can only happen once signing is working, so it always means
        // "pair the key" regardless of how the env looks.
        const code =
          notPaired || process.env.TESLA_PROXY_BASE_URL
            ? "VCP_REQUIRED"
            : "PROXY_NOT_CONFIGURED";
        // Logged, not just returned. Which of the two strings matched is the
        // whole diagnosis and the UI cannot show it: "not paired" means the
        // proxy signed and the car refused, "Protocol required" means the
        // request reached Tesla unsigned — the proxy was bypassed. Same toast,
        // opposite causes. Without this the Tesla log group stayed empty while
        // the command visibly failed.
        recordDebugLog("error", "vehicles/commands", `command refused (${code})`, {
          command,
          matched: notPaired ? "key-not-paired" : "protocol-required",
          detail: msg.slice(0, 300),
        });
        return NextResponse.json(
          { success: false, result: msg, code },
          { status: 412 },
        );
      }
      // logServer, not console.error: this is the branch that hides the real
      // reason behind "Command failed", so the reason has to land somewhere the
      // debug panel can show it.
      recordDebugLog("error", "vehicles/commands", "live command failed", {
        command,
        detail: msg.slice(0, 300),
      });
      return NextResponse.json({ success: false, result: "Command failed" }, { status: 502 });
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
