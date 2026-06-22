// Notification domain types shared across the alert engine, dispatcher,
// channels, API routes, and UI.

export type AlertType = "rain_windows" | "freeze" | "heat" | "hail";

export const ALERT_TYPES: readonly AlertType[] = [
  "rain_windows",
  "freeze",
  "heat",
  "hail",
] as const;

export type NotificationChannel = "push" | "email" | "whatsapp";

export interface NotificationPreferences {
  pushEnabled: boolean;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  notifyRainWindows: boolean;
  notifyFreeze: boolean;
  notifyHeat: boolean;
  notifyHail: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  pushEnabled: true,
  emailEnabled: false,
  whatsappEnabled: false,
  notifyRainWindows: true,
  notifyFreeze: true,
  notifyHeat: true,
  notifyHail: true,
};

// An alert produced by the pure engine. Copy is i18n key + params so the
// dispatcher can localise per user. `url` is a deep-link path.
export interface Alert {
  type: AlertType;
  titleKey: string;
  bodyKey: string;
  params: Record<string, string | number>;
  url: string;
  tag: string;
}

// Resolved, ready-to-send payload (after i18n).
export interface NotificationPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}
