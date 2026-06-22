import { createSupabaseAdminClient } from "@/lib/supabase/server";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

function fromAddress(): string {
  return process.env.RESEND_FROM ?? "Flux <alerts@flux.app>";
}

/**
 * Send a transactional email to a user via Resend's REST API. Looks up the
 * address from Supabase auth. No-ops silently when unconfigured (dev) or when
 * the user has no email. Best-effort: failures are logged, never thrown.
 */
export async function sendEmailToUser(
  userId: string,
  content: EmailContent,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.auth.admin.getUserById(userId);
  const email = data.user?.email;
  if (!email) return;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: email,
        subject: content.subject,
        html: content.html,
        text: content.text,
      }),
    });
    if (!res.ok) {
      console.error("[sendEmailToUser]", userId, res.status, await res.text());
    }
  } catch (err) {
    console.error("[sendEmailToUser]", userId, err);
  }
}
