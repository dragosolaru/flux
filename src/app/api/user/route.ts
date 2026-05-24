import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";

export async function DELETE() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userId = await ensureSupabaseUserId(session);
  if (!userId) {
    return NextResponse.json({ message: "Failed to resolve user" }, { status: 500 });
  }

  const supabase = createSupabaseAdminClient();

  // 1. Delete energy_costs (references documents + vehicles)
  await supabase.from("energy_costs").delete().eq("user_id", userId);

  // 2. Delete command_events (references vehicles)
  await supabase.from("command_events").delete().eq("user_id", userId);

  // 3. Delete vehicle_snapshots (references vehicles)
  // Get all vehicle ids first
  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id")
    .eq("user_id", userId);

  const vehicleIds = (vehicles ?? []).map((v: { id: string }) => v.id);
  if (vehicleIds.length > 0) {
    await supabase
      .from("vehicle_snapshots")
      .delete()
      .in("vehicle_id", vehicleIds);
  }

  // 4. Delete charging_sessions (references vehicles)
  await supabase.from("charging_sessions").delete().eq("user_id", userId);

  // 5. Delete documents + Storage files
  const { data: docs } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("user_id", userId);

  if (docs && docs.length > 0) {
    const paths = (docs as Array<{ storage_path: string }>)
      .map((d) => d.storage_path)
      .filter(Boolean);
    if (paths.length > 0) {
      await supabase.storage.from("documents").remove(paths);
    }
  }

  // Also sweep the Storage prefix in case orphaned files exist
  const { data: storageFiles } = await supabase.storage
    .from("documents")
    .list(userId, { limit: 1000 });

  if (storageFiles && storageFiles.length > 0) {
    const orphanPaths = storageFiles.map(
      (f: { name: string }) => `${userId}/${f.name}`,
    );
    await supabase.storage.from("documents").remove(orphanPaths);
  }

  await supabase.from("documents").delete().eq("user_id", userId);

  // 6. Delete tesla_tokens (references vehicles)
  if (vehicleIds.length > 0) {
    await supabase.from("tesla_tokens").delete().in("vehicle_id", vehicleIds);
  }

  // 7. Delete vehicles
  await supabase.from("vehicles").delete().eq("user_id", userId);

  // 8. Delete user_settings
  await supabase.from("user_settings").delete().eq("user_id", userId);

  // 9. Delete profiles
  await supabase.from("profiles").delete().eq("id", userId);

  // 10. Delete from auth.users
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
