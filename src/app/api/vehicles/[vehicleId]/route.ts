import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ vehicleId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const { vehicleId } = await params;
  if (!uuidSchema.safeParse(vehicleId).success) {
    return NextResponse.json({ message: "Invalid vehicleId" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));

  // Only allow updating virtual_key_paired via this endpoint
  const virtualKeyPaired = typeof body.virtualKeyPaired === "boolean"
    ? body.virtualKeyPaired
    : undefined;

  if (virtualKeyPaired === undefined) {
    return NextResponse.json({ message: "No valid fields to update" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("vehicles")
    .update({ virtual_key_paired: virtualKeyPaired })
    .eq("id", vehicleId)
    .eq("user_id", session.user.id);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ vehicleId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { vehicleId } = await params;
  if (!uuidSchema.safeParse(vehicleId).success) {
    return NextResponse.json({ message: "Invalid vehicleId" }, { status: 400 });
  }
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase
    .from("vehicles")
    .delete()
    .eq("id", vehicleId)
    .eq("user_id", session.user.id);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
