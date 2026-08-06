import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const RenameSchema = z.object({
  name: z.string().min(1).max(100),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ routeId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { routeId } = await params;
  if (!z.string().uuid().safeParse(routeId).success) {
    return NextResponse.json({ message: "Invalid routeId" }, { status: 400 });
  }

  if (!(await checkRateLimit(session.user.id, "saved-routes-write", 30))) {
    return NextResponse.json(
      { message: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const parsed = RenameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid body", errors: parsed.error.flatten() }, { status: 422 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: existing } = await supabase
    .from("saved_routes")
    .select("id")
    .eq("id", routeId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("saved_routes")
    .update({ name: parsed.data.name })
    .eq("id", routeId)
    .eq("user_id", session.user.id)
    .select()
    .single();

  if (error || !data) {
    console.error("[saved-routes/PATCH]", error?.message ?? "Update failed");
    return NextResponse.json({ message: "Failed to rename route" }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ routeId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { routeId } = await params;
  if (!z.string().uuid().safeParse(routeId).success) {
    return NextResponse.json({ message: "Invalid routeId" }, { status: 400 });
  }

  if (!(await checkRateLimit(session.user.id, "saved-routes-write", 30))) {
    return NextResponse.json(
      { message: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  const supabase = createSupabaseAdminClient();

  const { data: existing } = await supabase
    .from("saved_routes")
    .select("id")
    .eq("id", routeId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("saved_routes")
    .delete()
    .eq("id", routeId)
    .eq("user_id", session.user.id);

  if (error) {
    console.error("[saved-routes/DELETE]", error.message);
    return NextResponse.json({ message: "Failed to delete route" }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
