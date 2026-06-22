import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Send a WhatsApp message to a user via Twilio's REST API, reusing the existing
 * Twilio credentials. Looks up the user's number from profiles.whatsapp_phone
 * and skips silently when absent or unconfigured. Best-effort: never throws.
 */
export async function sendWhatsAppToUser(
  userId: string,
  message: string,
): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM ?? "whatsapp:+14155238886";
  if (!sid || !token) return;

  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("profiles")
    .select("whatsapp_phone")
    .eq("id", userId)
    .maybeSingle();

  const phone = (data as { whatsapp_phone: string | null } | null)?.whatsapp_phone;
  if (!phone) return;

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const params = new URLSearchParams({
    From: from,
    To: `whatsapp:${phone}`,
    Body: message,
  });

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!res.ok) {
      console.error("[sendWhatsAppToUser]", userId, res.status, await res.text());
    }
  } catch (err) {
    console.error("[sendWhatsAppToUser]", userId, err);
  }
}
