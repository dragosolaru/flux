import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  category: z.enum(["feature", "bug", "general"]).optional(),
  name: z.string().max(100).optional(),
  email: z.string().email().max(200).optional().or(z.literal("")),
  message: z.string().trim().min(5).max(2000),
});

export async function POST(req: NextRequest) {
  const session = await auth();

  // Public endpoint — rate-limit by user id when signed in, else by IP, to
  // stop anonymous spam flooding the feedback table.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const identifier = session?.user?.id ?? ip;
  if (!(await checkRateLimit(identifier, "feedback", 5))) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid feedback" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("feedback").insert({
    user_id: session?.user?.id ?? null,
    category: parsed.data.category ?? "general",
    name: parsed.data.name || null,
    email: parsed.data.email || null,
    message: parsed.data.message,
  });

  if (error) {
    console.error("[feedback]", error.message);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
