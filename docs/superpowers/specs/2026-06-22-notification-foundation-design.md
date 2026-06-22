# Spec: Multi-Channel Notification Foundation (Spec 1 of 2)

**Date:** 2026-06-22  
**Status:** Approved — ready for implementation  
**Scope:** Push, email, and WhatsApp delivery infrastructure + vehicle polling cron + alert engine + preferences UI. Weather alert scenarios (Spec 2) layer on top of this foundation without structural changes.

---

## 1. Problem

Flux currently has no way to reach users when the app is closed. Toast notifications (Sonner) appear only while a page is open. The app cannot alert users to time-sensitive vehicle events — windows left open in rain, a coming frost, or a heat wave — unless the user happens to be looking at their phone inside the app at that exact moment.

This spec builds the persistent delivery infrastructure that makes proactive, background-aware alerts possible for this and all future notification scenarios.

---

## 2. Channels (v1)

| Channel | Library | Credential | Works when |
|---------|---------|------------|-----------|
| Web Push | `web-push` (VAPID) | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | PWA installed or browser backgrounded |
| Email | `resend` | `RESEND_API_KEY` | Always |
| WhatsApp | Twilio Messages API | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (already in env) | Always (if user has `whatsapp_phone` in profile) |

SMS dropped from v1 (pay-per-message cost, can be added in a follow-up using same Twilio credentials).

---

## 3. Data Model

### Migration 026 — `push_subscriptions`

```sql
CREATE TABLE push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    text NOT NULL UNIQUE,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX ON push_subscriptions (user_id);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
-- Users manage only their own subscriptions
CREATE POLICY "own subscriptions" ON push_subscriptions
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

### Migration 027 — `notification_preferences`

One row per user, upserted on first save.

```sql
CREATE TABLE notification_preferences (
  user_id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  push_enabled      boolean NOT NULL DEFAULT true,
  email_enabled     boolean NOT NULL DEFAULT false,
  whatsapp_enabled  boolean NOT NULL DEFAULT false,
  notify_rain_windows boolean NOT NULL DEFAULT true,
  notify_freeze       boolean NOT NULL DEFAULT true,
  notify_heat         boolean NOT NULL DEFAULT true,
  notify_hail         boolean NOT NULL DEFAULT true,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prefs" ON notification_preferences
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

### Migration 028 — `vehicle_alert_state`

Dedup table — prevents re-alerting for the same condition within a parking session.

```sql
CREATE TABLE vehicle_alert_state (
  vehicle_id      uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  alert_type      text NOT NULL,   -- 'rain_windows' | 'freeze' | 'heat' | 'hail'
  session_key     text NOT NULL,   -- sha256(vehicleId + floor(lastSeenAt/3600000)) — resets when car moves again
  last_alerted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vehicle_id, alert_type)
);
-- No RLS — only service role (cron) reads/writes this table
```

---

## 4. Notification Dispatcher

**File:** `src/lib/notifications/dispatch.ts`

```ts
interface NotificationPayload {
  title: string;
  body: string;
  url?: string;      // deep-link path, e.g. "/dashboard"
  tag?: string;      // push dedup key
}

async function dispatchNotification(
  userId: string,
  payload: NotificationPayload,
  prefs: NotificationPreferences,
): Promise<void>
```

- Fires all enabled channels in `Promise.allSettled()` — one channel failing doesn't block others
- Logs failures to console without throwing (cron continues processing other vehicles)

---

## 5. Channel Implementations

### 5a. Web Push (`src/lib/push/send.ts`)

```ts
async function sendPushToUser(userId: string, payload: PushPayload): Promise<void>
```

- Loads all `push_subscriptions` rows for user
- Calls `webpush.sendNotification(subscription, JSON.stringify(payload))` per subscription
- On 404 or 410 response: deletes stale subscription row
- VAPID keys generated once (`npx web-push generate-vapid-keys`) and stored as env vars

**API routes:**
- `POST /api/push/subscribe` — save `PushSubscription` object (endpoint, p256dh, auth)
- `DELETE /api/push/subscribe` — remove by endpoint
- `GET /api/push/vapid-public-key` — return `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (public key for client)
- `POST /api/push/test` — send test push, rate-limited 5/min

**Service worker additions to `public/sw.js`:**
```js
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Flux', {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      tag: data.tag,
      data: { url: data.url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/dashboard';
  event.waitUntil(clients.openWindow(url));
});
```

**Client hook:** `src/hooks/usePushNotifications.ts`
- Detects push support (`'PushManager' in window`)
- Requests permission → subscribes → POSTs to `/api/push/subscribe`
- Exposes `{ isSubscribed, subscribe, unsubscribe, isSupported }`

### 5b. Email (`src/lib/notifications/email.ts`)

```ts
async function sendEmailToUser(
  userId: string,
  { subject, html, text }: { subject: string; html: string; text: string },
): Promise<void>
```

- Looks up user email from Supabase `auth.users` (admin client)
- Calls `resend.emails.send({ from: 'alerts@flux.app', to: email, subject, html, text })`
- No-ops silently if `RESEND_API_KEY` not configured (dev mode)

### 5c. WhatsApp (`src/lib/notifications/whatsapp.ts`)

```ts
async function sendWhatsAppToUser(userId: string, message: string): Promise<void>
```

- Looks up `profiles.whatsapp_phone` for user
- Skips silently if no phone stored
- Calls Twilio Messages API: `POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json`
  - Body: `From=whatsapp:+14155238886&To=whatsapp:{phone}&Body={message}`
- Credentials: existing `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN`

---

## 6. Cron — `/api/cron/poll-vehicles`

**Schedule:** `*/15 * * * *` (every 15 minutes)  
**Auth:** `Authorization: Bearer ${CRON_SECRET}` — fails closed (401) if unconfigured  
**maxDuration:** 60 seconds

**Logic:**

```
1. Load all vehicles (service role — no user filter)
2. Batch process in groups of 10 (Promise.allSettled per batch)
3. Per vehicle:
   a. If motionState !== 'parked' → skip
   b. If latitude/longitude === null → skip
   c. Fetch weather: fetchOpenMeteoWeather(lat, lon)
   d. Load user's notification_preferences
   e. alerts = evaluateAlerts(vehicleState, weather, prefs)
   f. For each alert:
      - Compute session_key = sha256(vehicleId + floor(lastSeenAt / 3600000))  -- hour-granular; resets when car moves again
      - Check vehicle_alert_state — if same session_key → skip
      - dispatchNotification(userId, alert.payload, prefs)
      - Upsert vehicle_alert_state row
4. Return { processed: N, alerted: M }
```

**`vercel.json` addition:**
```json
{ "path": "/api/cron/poll-vehicles", "schedule": "*/15 * * * *" }
```

**Live vehicle fetch:** re-uses `fetchVehicleData(vehicleId, ownerId)` from `src/lib/tesla/api.ts`.  
**Mock vehicles:** load snapshot from persistence; run alert engine normally (useful for dev/testing alerts without a real Tesla).

---

## 7. Alert Engine

**File:** `src/lib/notifications/alert-engine.ts`

Pure function — no DB calls, fully unit-testable.

```ts
interface Alert {
  type: 'rain_windows' | 'freeze' | 'heat' | 'hail';
  payload: NotificationPayload;
}

function evaluateAlerts(
  vehicle: VehicleState,
  weather: WeatherSnapshot,
  prefs: NotificationPreferences,
): Alert[]
```

> **Implementation note:** The project's weather provider returns
> `WeatherSnapshot` (`@/lib/external/weather/types`) — `tempC`, `windSpeedMs`,
> `precipMmH`, `conditionLabel`, etc. There are **no WMO codes**, so the
> evaluators below key off precipitation, temperature, wind speed (m/s), and the
> condition label string. The engine also only fires when the vehicle is
> stationary (`motionState` ∈ `parked | charging | plugged-idle`).
>
> Alerts return i18n **keys + params** (not literal copy). The cron dispatcher
> localises them per user via `translateNotification(locale, key, params)`
> against the `notifications` namespace in each locale file.

**Evaluators:**

| Type | Condition | Copy key |
|------|-----------|----------|
| `rain_windows` | `precipMmH > 0.1` AND any `windowsOpen.*` is `true`. Skipped silently if `windowsOpen === null` (live Tesla today; follow-up task maps live window state). | `notifications.rain_windows.*` |
| `freeze` | `tempC ≤ 0` OR `conditionLabel` contains snow/ice/sleet | `notifications.freeze.*` |
| `heat` | `tempC ≥ 35` | `notifications.heat.*` |
| `hail` | `conditionLabel` contains hail/thunder/storm OR `windSpeedMs ≥ 22` (~80 km/h) | `notifications.hail.*` |

Each evaluator only runs if the corresponding `prefs.notify_*` flag is true.

**Live window-state gap:** `windowsOpen` is typed in `VehicleState` but the live Tesla adapter (`src/lib/tesla/api.ts` `mapVehicleData()`) currently returns `null` for it. The `rain_windows` alert silently skips when `windowsOpen === null`. A follow-up task maps `vehicle_state.fd_window`, `rd_window`, `rearLeft/RearRight` from the Tesla Fleet API response — this is a separate task, not a blocker for Spec 1.

---

## 8. Preferences UI

**Location:** New card in `src/app/(dashboard)/settings/` — "Notificări" section

**Layout:**

```
Notificări

Canale:
  🔔 Push notifications    [toggle]   [Test]
  ✉️  Email               [toggle]   (uses account email)
  💬 WhatsApp             [toggle]   (needs phone in profile)

Tipuri de alertă:  [only shown if ≥1 channel enabled]
  ☐ Ploaie + geamuri deschise
  ☐ Îngheț / ninsoare / gheață
  ☐ Val de căldură (35°C+)
  ☐ Grindină / vânt puternic
```

- Push toggle: first activation triggers `Notification.requestPermission()` → subscription flow
- Push toggle shows "Indisponibil" if browser has no PushManager support
- "Test" button: `POST /api/push/test` — instant test notification
- Auto-save on change (debounced 800ms, PATCH to `/api/me/notification-preferences`)

**New files:**
- `src/components/settings/NotificationsCard.tsx`
- `src/hooks/useNotificationPreferences.ts` (TanStack Query)

**API routes:**
- `GET /api/me/notification-preferences`
- `PATCH /api/me/notification-preferences` (Zod-validated, rate-limited 30/h)

**i18n:** `settings.notifications` namespace in all 5 locale files (en, ro, de, fr, hu).

---

## 9. Key Files

| File | Purpose |
|------|---------|
| `supabase/migrations/026_push_subscriptions.sql` | Push subscription storage |
| `supabase/migrations/027_notification_preferences.sql` | Per-user channel + scenario prefs |
| `supabase/migrations/028_vehicle_alert_state.sql` | Alert dedup state |
| `src/lib/push/send.ts` | Web push sender |
| `src/lib/notifications/email.ts` | Resend email sender |
| `src/lib/notifications/whatsapp.ts` | Twilio WhatsApp sender |
| `src/lib/notifications/dispatch.ts` | Multi-channel dispatcher |
| `src/lib/notifications/alert-engine.ts` | Pure alert evaluator |
| `src/hooks/usePushNotifications.ts` | Client push subscription hook |
| `src/hooks/useNotificationPreferences.ts` | Preferences TanStack Query hook |
| `src/components/settings/NotificationsCard.tsx` | Settings UI |
| `src/app/api/cron/poll-vehicles/route.ts` | 15-min vehicle polling cron |
| `src/app/api/push/subscribe/route.ts` | Push subscription management |
| `src/app/api/push/test/route.ts` | Test push endpoint |
| `src/app/api/me/notification-preferences/route.ts` | Preferences CRUD |
| `public/sw.js` | Add push + notificationclick handlers |
| `vercel.json` | Add poll-vehicles cron entry |

---

## 10. Security Checklist

- All API routes: `auth()` + `session?.user?.id` check before any DB access
- All user DB queries: `.eq("user_id", session.user.id)`
- Cron route: `Authorization: Bearer ${CRON_SECRET}` — fails 401 if unconfigured
- Push subscribe: validates endpoint URL starts with `https://`
- Rate limits: push-test 5/min, notification-prefs PATCH 30/h
- WhatsApp: no direct user input in Twilio message body (server-constructed from vehicle + weather data)
- `vehicle_alert_state`: no RLS, service role only — users cannot read or manipulate dedup state

---

## 11. Dependencies

| Package | Purpose | Status |
|---------|---------|--------|
| `web-push` + `@types/web-push` | VAPID push notifications | **Installed** — only new dependency |
| Resend | Transactional email | No SDK — called via REST (`fetch`) to keep deps minimal |
| Twilio | WhatsApp outbound | No SDK — called via REST (`fetch`), reuses existing credentials |

**Feature flag:** The entire feature ships behind `NEXT_PUBLIC_NOTIFICATIONS_ENABLED`
(`src/lib/feature-flags.ts` → `isNotificationsEnabled()`). When unset/false: the
settings card is hidden, every notification API route returns 404, and the
poll-vehicles cron no-ops. The landing-page roadmap entry ("Weather Guardian")
stays visible regardless, as a "coming soon" announcement.

---

## 12. Spec 2 Handoff

Spec 2 (Weather Guardian) will:
- Add new evaluators to `alert-engine.ts` for richer weather scenarios (e.g., temperature trend, precipitation probability from forecast, not just current conditions)
- Add a follow-up task to map live Tesla window state in `src/lib/tesla/api.ts`
- Possibly add a vehicle-specific notification preferences screen (per-vehicle toggles)
- No structural changes to channels, cron, or data model

---

## 13. Open Questions / Decisions Deferred

1. **Resend sender domain:** `alerts@flux.app` assumes domain ownership + DNS setup with Resend. Needs to be configured before email alerts work in production.
2. **Twilio WhatsApp sender:** Sandbox number works for development; production requires registering a WhatsApp Business sender.
3. **Live window state mapping:** `rain_windows` alert requires a follow-up task to extract `fd_window`/`rd_window` from Tesla Fleet API `vehicle_state`. Tracked as a known gap, not a blocker.
4. **Per-scenario × per-channel matrix:** v1 uses global channel toggles. Fine for launch; can add granularity (e.g., "heat alerts only by push, freeze alerts also by email") in a later iteration.
