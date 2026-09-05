import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createVerificationToken, readVerificationToken } from "@/lib/email-verification";
import { sendEmailToUser } from "@/lib/notifications/email";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";
import { logServer } from "@/lib/debug-log";

/**
 * Proves the signed-in user controls the address on their account.
 *
 * POST sends the link. GET is the link.
 *
 * Registration marks every address confirmed so that signInWithPassword works
 * without SMTP, so Supabase's own flag is not evidence of anything. Anywhere
 * the app treats an email address as identity — today that is
 * /api/documents/recover — needs this instead.
 */
export const dynamic = "force-dynamic";

function appOrigin(req: NextRequest): string {
  // The configured origin wins over the request's Host header, which is
  // caller-set: a forged Host would otherwise put an attacker's domain in the
  // link we mail to the victim.
  const configured = process.env.NEXTAUTH_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // fall through
    }
  }
  return new URL(req.url).origin;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userId = await ensureSupabaseUserId(session);
  if (!userId) {
    return NextResponse.json({ message: "Failed to resolve user" }, { status: 500 });
  }

  // Tight: this sends mail to an address, so a loose limit is a spam cannon
  // pointed at whoever owns it.
  if (!(await checkRateLimit(userId, "verify-email", 5))) {
    return NextResponse.json({ message: "Too many requests" }, { status: 429 });
  }

  const email = session.user.email.toLowerCase();
  const token = createVerificationToken(userId, email);
  const link = `${appOrigin(req)}/api/account/verify-email?token=${encodeURIComponent(token)}`;

  await sendEmailToUser(userId, {
    subject: "Confirm your Flux email address",
    text: `Confirm this address to let Flux match documents you email in:\n\n${link}\n\nThe link is valid for 24 hours. If you did not ask for this, ignore it.`,
    html: `<p>Confirm this address to let Flux match documents you email in.</p><p><a href="${link}">Confirm my email address</a></p><p>The link is valid for 24 hours. If you did not ask for this, ignore this message.</p>`,
  });

  // Says "sent", not "delivered". sendEmailToUser is best-effort and no-ops
  // when RESEND_API_KEY is unset, which is the local and preview case.
  return NextResponse.json({ sent: true, configured: Boolean(process.env.RESEND_API_KEY) });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const origin = appOrigin(req);
  const fail = NextResponse.redirect(`${origin}/settings?email_verified=0`);

  if (!token) return fail;

  const claim = readVerificationToken(token);
  if (!claim) return fail;

  // The link is a bearer token, so it is deliberately NOT gated on an active
  // session — people open mail on a different device. What keeps it safe is
  // that it only ever marks the exact address it was issued for, and only if
  // that is still the address on the account.
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.auth.admin.getUserById(claim.userId);
  const current = data.user?.email?.toLowerCase();
  if (!current || current !== claim.email) {
    logServer("warn", "account/verify-email", "token no longer matches the account address");
    return fail;
  }

  const { error } = await supabase
    .from("profiles")
    .update({ email_verified_at: new Date().toISOString() })
    .eq("id", claim.userId);

  if (error) {
    logServer("error", "account/verify-email", error.message);
    return fail;
  }

  return NextResponse.redirect(`${origin}/settings?email_verified=1`);
}
