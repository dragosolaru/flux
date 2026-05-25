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

## Remaining recommendations before public multi-tenant launch

1. **Upstash Redis rate limiter** — replace in-memory `Map` to share limits across Vercel instances
2. **RLS audit** on `energy_costs`, `charging_sessions`, `trips`, `command_events`
3. **Per-doc claim tokens** in recovery emails (replaces `sender_email` filter)
4. **Source IP allowlist** for Cloudmailin webhook
5. **Tesla token revocation detection** — clean up stale tokens on `invalid_grant` from refresh
6. **Key rotation tooling** for `TESLA_TOKEN_ENCRYPTION_KEY`
