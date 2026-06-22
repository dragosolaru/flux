import { sendPushToUser } from "@/lib/push/send";
import { sendEmailToUser } from "@/lib/notifications/email";
import { sendWhatsAppToUser } from "@/lib/notifications/whatsapp";
import type { NotificationPayload, NotificationPreferences } from "@/types/notifications";

/**
 * Fan a single notification out to every channel the user has enabled. Each
 * channel runs independently — one failing never blocks the others, and nothing
 * throws back to the caller (the cron must keep processing other vehicles).
 */
export async function dispatchNotification(
  userId: string,
  payload: NotificationPayload,
  prefs: NotificationPreferences,
): Promise<void> {
  const tasks: Promise<void>[] = [];

  if (prefs.pushEnabled) {
    tasks.push(sendPushToUser(userId, payload));
  }
  if (prefs.emailEnabled) {
    tasks.push(
      sendEmailToUser(userId, {
        subject: payload.title,
        text: payload.body,
        html: `<p>${payload.body}</p>`,
      }),
    );
  }
  if (prefs.whatsappEnabled) {
    tasks.push(sendWhatsAppToUser(userId, `${payload.title}\n${payload.body}`));
  }

  await Promise.allSettled(tasks);
}
