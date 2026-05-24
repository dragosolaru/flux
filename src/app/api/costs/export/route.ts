import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";

const QuerySchema = z.object({ vehicleId: z.string().uuid() });

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const userId = await ensureSupabaseUserId(session);
  if (!userId) return NextResponse.json({ message: "Failed to resolve user" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({ vehicleId: searchParams.get("vehicleId") });
  if (!parsed.success) return NextResponse.json({ message: "vehicleId required" }, { status: 400 });

  const supabase = createSupabaseAdminClient();

  // Verify vehicle ownership
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id, display_name")
    .eq("id", parsed.data.vehicleId)
    .eq("user_id", userId)
    .single();
  if (!vehicle) return NextResponse.json({ message: "Vehicle not found" }, { status: 404 });

  const { data: rows, error } = await supabase
    .from("energy_costs")
    .select("document_type, period_start, period_end, total_kwh, vehicle_kwh_attributed, original_amount, original_currency, cost_ron, provider_name, charger_network, location_name, created_at")
    .eq("vehicle_id", parsed.data.vehicleId)
    .order("period_start", { ascending: false });

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  const headers = [
    "type", "period_start", "period_end", "total_kwh", "vehicle_kwh",
    "amount", "currency", "cost_ron", "provider", "network", "location", "created_at",
  ];

  const csvRows = (rows ?? []).map((r) =>
    [
      r.document_type, r.period_start, r.period_end,
      r.total_kwh, r.vehicle_kwh_attributed,
      r.original_amount, r.original_currency, r.cost_ron,
      r.provider_name, r.charger_network, r.location_name, r.created_at,
    ]
      .map((v) => (v == null ? "" : String(v).replace(/"/g, '""')))
      .map((v) => `"${v}"`)
      .join(","),
  );

  const csv = [headers.join(","), ...csvRows].join("\n");
  const filename = `flux-costs-${(vehicle as { display_name: string }).display_name.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
