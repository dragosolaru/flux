import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { auth } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json() as unknown;

  if (
    typeof body !== "object" ||
    body === null ||
    !("message" in body) ||
    typeof (body as Record<string, unknown>).message !== "string" ||
    ((body as Record<string, unknown>).message as string).trim().length < 5
  ) {
    return NextResponse.json({ error: "Message too short" }, { status: 400 });
  }

  const { category, name, email, message } = body as {
    category?: string;
    name?: string;
    email?: string;
    message: string;
  };

  const session = await auth();
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.from("feedback").insert({
    user_id: session?.user?.id ?? null,
    category: category ?? "general",
    name: name ?? null,
    email: email ?? null,
    message: message.trim().slice(0, 2000),
  });

  if (error) return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
