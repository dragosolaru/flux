import { NextResponse } from "next/server";
import { createHash } from "node:crypto";

import { constantTimeEqual } from "@/lib/crypto/timing";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { isNotificationsEnabled } from "@/lib/feature-flags";
import { getBrand } from "@/lib/brands/registry";
import { applyCapabilityMask } from "@/lib/brands/adapter-utils";
import { deriveAndStoreActivity } from "@/lib/vehicle/persist-activity";
import { loadSnapshot } from "@/lib/mock/persistence";
import { tick } from "@/lib/mock/engine";
import { getWeatherAsync } from "@/lib/external/weather/providers/open-meteo";
import { evaluateAlerts } from "@/lib/notifications/alert-engine";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import {
  loadNotificationPreferences,
  anyChannelEnabled,
} from "@/lib/notifications/preferences";
import { translateNotification } from "@/lib/i18n/notify";
import type { VehicleState } from "@/types/vehicle";

export const maxDuration = 60;

const BATCH_SIZE = 10;

interface VehicleRow {
  id: string;
  user_id: string;
  brand: string;
  data_source: string;
  display_name: string;
  model: string | null;
  tesla_vehicle_id: number | null;
}

function sessionKey(vehicleId: string, state: VehicleState): string {
  const stamp = state.lastSeenAt ?? state.recordedAt;
  const hourBucket = Math.floor(new Date(stamp).getTime() / 3_600_000);
  return createHash("sha256").update(`${vehicleId}:${hourBucket}`).digest("hex");
}

async function resolveState(vehicle: VehicleRow): Promise<VehicleState | null> {
  const profile = getBrand(vehicle.brand);
  if (!profile) return null;

  // Simulator only — the live branch went with the Tesla integration.
  const snapshot = await loadSnapshot(vehicle.id);
  if (!snapshot) return null;
  const next = tick(snapshot, new Date(), profile);
  return applyCapabilityMask(next.state, profile.capabilities.telemetry);
}

/**
 * Tick each vehicle and derive what it did.
 *
 * This used to keep the reading it took from a real car, because the job was
 * documented as existing "to keep history continuous" and did not. With the
 * Tesla integration withdrawn the simulator writes its own snapshots, so what
 * is left is the derivation — which runs on stored history and touches no
 * network at all.
 */
async function pollAndStore(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  vehicle: VehicleRow,
): Promise<VehicleState | null> {
  let state: VehicleState | null = null;
  try {
    state = await resolveState(vehicle);
  } catch (err) {
    console.error("[poll-vehicles] tick", vehicle.id, err);
  }

  await deriveAndStoreActivity(supabase, vehicle).catch((err: unknown) => {
    console.error("[poll-vehicles] derive", vehicle.id, err);
  });

  return state;
}


async function alertFor(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  vehicle: VehicleRow,
  state: VehicleState | null,
): Promise<number> {
  if (!state || state.latitude == null || state.longitude == null) return 0;

  const prefs = await loadNotificationPreferences(supabase, vehicle.user_id);
  if (!anyChannelEnabled(prefs)) return 0;

  const weather = await getWeatherAsync(state.latitude, state.longitude);
  const alerts = evaluateAlerts(state, weather, prefs);
  if (alerts.length === 0) return 0;

  const key = sessionKey(vehicle.id, state);

  const { data: locProfile } = await supabase
    .from("profiles")
    .select("locale")
    .eq("id", vehicle.user_id)
    .maybeSingle();
  const locale = (locProfile as { locale: string | null } | null)?.locale ?? null;

  let fired = 0;
  for (const alert of alerts) {
    const { data: existing } = await supabase
      .from("vehicle_alert_state")
      .select("session_key")
      .eq("vehicle_id", vehicle.id)
      .eq("alert_type", alert.type)
      .maybeSingle();

    if ((existing as { session_key: string } | null)?.session_key === key) continue;

    const [title, body] = await Promise.all([
      translateNotification(locale, alert.titleKey, alert.params),
      translateNotification(locale, alert.bodyKey, alert.params),
    ]);

    await dispatchNotification(
      vehicle.user_id,
      { title, body, url: alert.url, tag: alert.tag },
      prefs,
    );

    await supabase.from("vehicle_alert_state").upsert(
      {
        vehicle_id: vehicle.id,
        alert_type: alert.type,
        session_key: key,
        last_alerted_at: new Date().toISOString(),
      },
      { onConflict: "vehicle_id,alert_type" },
    );
    fired++;
  }

  return fired;
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ message: "Cron not configured" }, { status: 503 });
  }
  if (!constantTimeEqual(req.headers.get("authorization") ?? "", `Bearer ${cronSecret}`)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("vehicles")
    .select("id, user_id, brand, data_source, display_name, model, tesla_vehicle_id")
    .eq("is_active", true);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const vehicles = (data ?? []) as VehicleRow[];
  // Keeping history is what this job is for, and it runs whether or not anyone
  // has notifications switched on. Only the alerting half is gated — that was
  // the bug: with notifications off the whole job returned early, so no history
  // was kept at all and every screen built on it stayed empty.
  const notify = isNotificationsEnabled();
  let alerted = 0;

  for (let i = 0; i < vehicles.length; i += BATCH_SIZE) {
    const batch = vehicles.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (v) => {
        const state = await pollAndStore(supabase, v);
        return notify ? alertFor(supabase, v, state) : 0;
      }),
    );
    for (const r of results) {
      if (r.status === "fulfilled") alerted += r.value;
      else console.error("[poll-vehicles]", r.reason);
    }
  }

  return NextResponse.json({ processed: vehicles.length, alerted, notify });
}
