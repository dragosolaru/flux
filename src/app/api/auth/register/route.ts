import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logServer } from "@/lib/debug-log";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function POST(req: NextRequest) {
  // Rate-limit registrations by IP to prevent account-creation spam.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await checkRateLimit(ip, "register", 5))) {
    return NextResponse.json(
      { message: "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid email or password" },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  });

  if (error || !data.user) {
    logServer("error", "auth/register", error?.message ?? "no user returned");
    return NextResponse.json(
      { message: "Could not create user" },
      { status: 400 },
    );
  }

  return NextResponse.json({ id: data.user.id });
}
