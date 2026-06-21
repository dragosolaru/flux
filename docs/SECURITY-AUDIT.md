# Security Audit — 2026-06-21 (third pass, 10-agent parallel review)

> 10 independent expert agents (auth, DB/RLS, input validation, secrets/webhooks,
> Tesla tokens, XSS/redirects, React/Next best-practice, i18n, docs/KISS, deps/config)
> audited the whole codebase read-only, then findings were synthesised and fixed.
> **No exploitable vulnerability was found.** The notable issues were a public
> unthrottled write endpoint and missing HTTP headers — both fixed below.

### Fixed in this pass

| # | Severity | Area | Fix |
|---|---|---|---|
| A | High | `/api/feedback` was a public, unauthenticated, **unthrottled** DB-write with unvalidated `name`/`email`/`category` (spam / storage-exhaustion) | Added IP/user rate limit (5/h, register pattern), zod validation + length caps, `email()` format check, generic errors. `src/app/api/feedback/route.ts` |
| B | High | **No HTTP security headers** anywhere | Added `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS via `headers()` in `next.config.ts` |
| C | Medium | `feedback` RLS policy `using (true)` applied to anon/authenticated (contradicts admin-only intent) | Migration `024_feedback_rls_fix.sql` drops the policy → RLS-on, service-role only (like `stripe_events`) |
| D | Medium | Open redirect on Google sign-in: raw `callbackUrl` passed to `signIn("google", …)` | Validate `startsWith("/")` once at component scope; both paths use the safe value. `LoginForm.tsx` |
| E | Medium | `/api/internal/{warm,ingest-stats}` compared cron/webhook secrets with `===` (timing side-channel) | Shared `constantTimeEqual` helper (`src/lib/crypto/timing.ts`); both routes use it |
| F | Medium | `glass-card.tsx` imported framer-motion without `"use client"` (latent server-component crash) | Added `"use client"` |
| G | KISS | Dead component `LandingFeatures.tsx` (no importers) | Deleted |

### Open recommendations (hardening / quality — none are exploitable today)

- **CSP**: add a nonce-based `Content-Security-Policy` (deferred — needs nonce wiring so framer-motion/inline styles don't break). X-Frame-Options already blocks clickjacking.
- **i18n**: hardcoded English strings in landing/product visuals (eyebrows `COST INTELLIGENCE`/`TRIP PLANNER`, chips `Fastest/Balanced/Economy`, vehicle chip labels). Mock/demo text (battery %, city names) lower priority. Add keys to all 5 locales + `t()`.
- **Error leakage**: ~10 routes return raw Supabase/Tesla `error.message` to clients — log server-side, return generic message (follow `billing/checkout`).
- **Rate limits**: add to `vehicles/[vehicleId]` PATCH/DELETE; guard `tariffs/settings` `req.json()`; clamp numeric params on legacy `charging-stations`/`charging-map`.
- **Tesla**: single-flight guard on token refresh (race); use `ensureSupabaseUserId` consistently in Tesla routes (currently raw `session.user.id` — fails closed, not an IDOR).
- **Dashboard**: verify vehicle ownership before the parallel `charging_sessions` fetch (latent; redirect currently discards the result).
- **Deps/CI**: dev-only CRITICAL/HIGH in vitest/vite — schedule `vitest@4`; add `npm audit --omit=dev --audit-level=high` gate to CI; pin actions to SHAs.
- **React**: dynamic index-keys in `GeocodingSearch`/`costs-client`; add `aria-label` to `StationListSheet` search input.
- **KISS**: hoist duplicated framer-motion `EASE`/`fadeUp`/`stagger` (9 files) into the existing `src/lib/animations/variants.ts`.

Note: this file's older entries below had drifted from the implementation (e.g. the
GDPR-export and webhook findings were already fixed in code). The third-pass agents
verified against actual source, not the log.

---

# Security Audit — 2026-05-23 / 2026-05-25 (second pass)

> Multi-agent parallel review (3 independent agents + synthesis) before enabling real Tesla key in production.
> All Critical and High findings have been resolved. One Medium (rate limiting on state/history routes) was deprioritised to post-launch.

---

## First Pass — 2026-05-23

5-angle parallel review before MVP launch. 17 findings, all resolved.

| # | Severity | Area | Fix |
|---|---|---|---|
| 1 | Critical | `/api/documents/recover` ACL bypass | Filter by `sender_email = session.user.email`. Added `documents.sender_email` column in migration 007. |
| 2 | High | Webhook envelope[to] stripped +subaddress | Swapped priority to query `headers[to]` first. |
| 3 | High | Legacy non-Tesla DB rows crashed `getModelSpec` | Migration 007 deactivates them; `getModelSpec`/`softwareVersionFor` fall back to Tesla. |
| 4 | High | `EMAIL_WEBHOOK_SECRET` timing-attack risk | `crypto.timingSafeEqual` with length check. |
| 5 | High | Tesla OAuth state not user-bound | State = `nonce.HMAC(NEXTAUTH_SECRET, nonce ‖ userId)`. Constant-time verify. |
| 6 | Medium | `NEXT_PUBLIC_CLOUDMAILIN_ADDRESS` missing → broken UI address | Function returns `null`; client hides `EmailInbox`. |
| 7 | Medium | Webhook response leaked vehicleId/userId | Trimmed to `{created, skipped}` counts. |
| 8 | Medium | Unsafe `as string \| null` on `FormData.get()` | `pickString()` helper does `typeof === "string"` check. |
| 9 | Medium | Recover route orphans new storage file on DB-update failure | DB update before storage removal; rollback new file on failure. |
| 10 | Medium | `prevHadPending` ref stale across vehicle switch | Reset effect on `vehicleId` change. |
| 11 | Low | `savingsRon === 0` showed "Cu 0.00 lei mai scump" | Three-branch ternary with "Cost echivalent". |
| 12 | Medium | Tesla encryption key validated lazily | `assertTeslaEncryptionKey()` called at OAuth entry. |
| 13 | Low | Always-poll 15s on costs page | `refetchIntervalInBackground: false` — pauses poll when tab hidden. |
| 14 | Low | Full-UUID email subaddress rejected | `FULL_UUID_RE` added; exact `eq("id", …)` lookup before short-ID range query. |
| 15 | Low | `findUserByEmailLocalPart` stripped dots/dashes | Switched to exact local-part match — no normalization. |
| 16 | Critical | `verifyState` could throw (NEXTAUTH_SECRET unset) crashes callback | Try-catch in callback route; treats throw as state mismatch. |
| 17 | Low | `averageConfidence` divides by zero on empty confidence object | Guards `vals.length === 0` → returns 0. |

---

## Second Pass — 2026-05-25

3 independent parallel agents, each reviewing the full codebase independently, then findings synthesised.

### New findings, all fixed

| # | Severity | Area | Finding | Fix |
|---|---|---|---|---|
| 18 | High | `LoginForm.tsx:56` | Open redirect — `router.replace(callbackUrl)` with no origin check | Validate `callbackUrl.startsWith("/")` before redirect |
| 19 | High | `inbound-email/route.ts` | IDOR: `findVehicleByNickname` scanned ALL users' vehicles; From-header spoofing could attribute docs to victim | Scope nickname search to resolved user only; return null if no user resolved |
| 20 | Medium | `inbound-email/route.ts` | `?secret=` query param falls through to access logs | Removed; header-only (`x-webhook-secret`); fail-closed if secret not configured |
| 21 | Medium | `getValidAccessToken` | No userId ownership check inside — IDOR possible if callers are bypassed | Added `userId: string` param, `.eq("user_id", userId)` on vehicles query |
| 22 | Medium | `/api/vehicles/[id]/state` | No rate limit — authenticated user can force continuous Tesla wake-ups | `checkRateLimit(userId, "state", 120)` — 120 req/hr |
| 23 | Medium | `/api/vehicles/[id]/charging-history` | No rate limit | `checkRateLimit(userId, "charging-history", 20)` — 20 req/hr |

### Confirmed secure (all 3 agents agreed)

- **AES-256-GCM token encryption** — random IV per ciphertext, auth tag enforced ✅
- **Tesla PKCE flow** — code_verifier in httpOnly cookie, S256 challenge ✅  
- **HMAC-SHA256 state binding** — `timingSafeEqual` comparison ✅
- **IDOR on vehicle routes** — all routes verify `user_id = session.user.id` before access ✅
- **Service role key not in client bundle** — only `NEXT_PUBLIC_*` vars exposed ✅
- **No secrets in git history** — all keys via env vars ✅

---

## Security stance — Real Tesla key readiness

✅ Open redirect: callbackUrl validated to relative paths only  
✅ IDOR (email webhook): nickname search scoped to resolved user  
✅ IDOR (token access): userId ownership check inside `getValidAccessToken`  
✅ Webhook secret: header-only, fail-closed if unconfigured  
✅ Rate limiting: uploads (10/hr), commands (30/hr), state (120/hr), charging-history (20/hr)  
✅ Rate limiting on `/api/auth/register`: 5 req/hr per IP  
✅ Token encryption: AES-256-GCM, fail-fast key validation  
✅ Tesla OAuth: PKCE + HMAC-bound state + constant-time compare  
⚠️ Rate limiting in-memory — not shared across Vercel instances (good enough for MVP; migrate to Upstash Redis for scale)  
⚠️ RLS policies: audit `energy_costs`, `charging_sessions`, `trips`, `command_events` before full multi-tenant launch  

---

## Third Pass — 2026-05-30

3 independent parallel agents re-audited the full codebase after the Stripe billing
work. This pass found that **several second-pass fixes were not present in the code**
— the audit log had drifted from the implementation. Treat earlier "resolved" claims
as unverified; the table below reflects code actually inspected and re-fixed.

### Findings, all fixed this pass

| # | Severity | Area | Finding | Fix |
|---|---|---|---|---|
| 24 | Blocker | `inbound-whatsapp` | Static-secret check could never match a real Twilio signature (broken auth) | Real HMAC-SHA1 `X-Twilio-Signature` validation keyed by `TWILIO_AUTH_TOKEN` |
| 25 | Blocker | `inbound-whatsapp` | `firstVehicleAnyUser` + global nickname scan injected docs into an arbitrary user's vehicle | Removed; media routes to unmatched pool (no cross-tenant attribution) |
| 26 | Blocker | `inbound-email` | Step-4 nickname fallback scanned ALL users' vehicles (finding #19 was never actually applied) | Removed; only trusted subaddress/sender-email signals attribute |
| 27 | High | `/api/account` | Orphan DELETE route used raw session id (no `ensureSupabaseUserId`) — could delete wrong `auth.users` row | Route deleted; `/api/user` is the canonical deletion path |
| 28 | High | `state`, `charging-history` | Rate limits #22/#23 were never actually applied | Re-added: state 120/hr, charging-history 20/hr |
| 29 | High | `/api/user` | Deletes on `energy_costs`/`command_events`/`charging_sessions` used a non-existent `user_id` column — erasure silently no-op (relied on cascade) | Delete by `vehicle_id` |
| 30 | Medium | `billing/checkout`, `billing/portal` | Attacker-controlled `Origin` header used for Stripe redirect URLs | Use server-side `NEXTAUTH_URL` |

### Fixed this pass

| # | Severity | Area | Finding | Fix |
|---|---|---|---|---|
| 34 | Low | `costs/export` | CSV cells not guarded against `= + - @` formula injection | Added `sanitizeCsvCell()` helper that prefixes dangerous cells with `\t`; covers `=`, `+`, `-`, `@`, `\t`, `\r` triggers |

### Still open (tracked, not yet done)

| # | Severity | Area | Finding |
|---|---|---|---|
| 31 | Medium | `billing/webhook` | No idempotency/ordering guard — retried/out-of-order Stripe events can flip tier. Needs a `stripe_events(id pk)` dedupe table |
| 32 | Medium | `inbound-email` | `?secret=` query-param fallback still present (finding #20 not applied) — should be header-only |
| 33 | Medium | `tesla/command`, `tesla/refresh` | Legacy live routes lack rate limits + own command allowlist; supersede with `/api/vehicles/[id]/commands` or delete |

---

## RLS Audit (2026-06-12)

Audit scope: `energy_costs`, `charging_sessions`, `trips`, `command_events`, `documents`.
Method: migrations inspected for `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY`; API routes grep'd for `.eq("user_id", …)` and vehicle-ownership checks.

### RLS enabled in migrations

| Table | RLS enabled | Policy |
|-------|-------------|--------|
| `documents` | ✅ migration 006 | `for all using (user_id = auth.uid())` — direct user_id column |
| `energy_costs` | ✅ migration 006 | `for all using (vehicle_id in (select id from vehicles where user_id = auth.uid()))` |
| `charging_sessions` | ✅ migration 002 | `for all using (vehicle_id in (select id from vehicles where user_id = auth.uid()))` |
| `trips` | ✅ migration 002 | `for all using (vehicle_id in (select id from vehicles where user_id = auth.uid()))` |
| `command_events` | ✅ migration 002 | `for all using (vehicle_id in (select id from vehicles where user_id = auth.uid()))` |

All five tables have RLS enabled and policies covering SELECT/INSERT/UPDATE/DELETE via the `for all` shorthand.

### API route user_id filter audit

All routes use the admin client (`createSupabaseAdminClient()`) which bypasses RLS, so ownership must be enforced at the application layer.

| Route | Table(s) accessed | Ownership enforced? |
|-------|-------------------|---------------------|
| `GET /api/costs/export` | `vehicles` + `energy_costs` | ✅ vehicles checked with `.eq("user_id", userId)` before energy_costs query |
| `GET /api/costs` | `vehicles` + `energy_costs` + `trips` | ✅ vehicle ownership checked; trips filtered by `vehicle_id` (already verified owned) |
| `GET /api/documents` | `vehicles` + `documents` | ✅ vehicle `.eq("user_id", userId)`; documents `.eq("vehicle_id", …).eq("user_id", userId)` |
| `POST /api/documents` | `vehicles` + `documents` | ✅ vehicle `.eq("user_id", userId)` before insert |
| `GET /api/documents/[id]` | `documents` | ✅ `.eq("id", documentId).eq("user_id", userId)` |
| `PATCH /api/documents/[id]` | `documents` + `energy_costs` | ✅ document `.eq("user_id", userId)`; energy_costs update scoped by `document_id` (already verified owned doc) |
| `DELETE /api/documents/[id]` | `documents` | ✅ `.eq("id", documentId).eq("user_id", userId)` |
| `POST /api/vehicles/[id]/commands` | `vehicles` + `command_events` (via `recordCommandEvent`) | ✅ vehicle `.eq("user_id", session.user.id)`; command events inserted for verified vehicle_id |
| `GET /api/vehicles/[id]/state` | `vehicles` | ✅ `.eq("user_id", session.user.id)` |
| `POST /api/vehicles/[id]/charging-history` | `vehicles` + `charging_sessions` | ✅ vehicle `.eq("user_id", session.user.id)`; sessions upserted for verified vehicle_id |

### Gaps / notes

- **`/api/user/export` — stale column references (finding #29 area):** The export route queries `charging_sessions`, `command_events` with `.eq("user_id", userId)`. Neither table has a direct `user_id` column — these queries silently return empty arrays. This is a data-export gap, not a security vulnerability (no data leaks), but the GDPR export omits these records. Tracked under finding #29 which was marked fixed but the export route was not updated. Should filter by `vehicle_id in (select id from vehicles where user_id = userId)` or join through vehicles. **Not a blocker for multi-tenant security.**
- **`/api/costs` trips query:** Trips are filtered only by `vehicle_id` (no direct `user_id` filter), but vehicleId ownership is verified before the trips query executes. This is safe by construction.
- **RLS as defence-in-depth:** Because the app uses the service-role admin client, RLS policies are not the primary enforcement layer — they are a backstop for any direct Supabase client access (e.g., from future client-side queries using the anon key). All policies are correctly scoped. No gaps in migration-level RLS.

### Verdict

No cross-tenant data leakage paths identified for the five audited tables. The admin-client pattern is consistently paired with application-layer ownership checks. The only functional gap is the GDPR export silently returning empty `charging_sessions` and `command_events` due to the wrong filter column — this is a data completeness issue, not a security issue.

---

## Remaining recommendations before public multi-tenant launch

1. **Upstash Redis rate limiter** — replace in-memory `Map` (per-instance, resets on cold start; currently undermines the `register` brute-force limit too)
2. **Stripe webhook idempotency** (finding #31)
3. **Per-doc claim tokens** in recovery emails (replaces `sender_email` filter)
4. **WhatsApp phone→user registration** — required before WhatsApp ingest can safely auto-attribute (currently unmatched-pool only)
5. **Remove `?secret=` query fallback** on inbound-email (finding #32)
6. **Tesla token revocation detection** + **key rotation tooling** for `TESLA_TOKEN_ENCRYPTION_KEY`
7. **Fix GDPR export** — `charging_sessions` and `command_events` queries in `/api/user/export` use non-existent `user_id` column; should join through `vehicles`

> Process note: keep this document in lockstep with the code. The second pass marked
> #19/#20/#22/#23 resolved while the fixes were absent — always re-grep the code before
> trusting a "resolved" row.
