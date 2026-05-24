# Security Audit — 2026-05-23

> Code-review pass before MVP launch. 15 findings surfaced; 12 fixed in commit batch. The 3 unresolved items are documented below with severity and mitigation plan.

---

## Methodology

5-angle parallel review at extra-high effort:
- **A** — line-by-line diff scan
- **B** — removed-behavior auditor
- **C** — cross-file impact tracer
- **D** — TypeScript/React/Next.js 16 pitfalls
- **E** — security & ACL audit

Scope: `git diff 73e5b33...HEAD` covering the cost-intelligence work, per-vehicle email refactor, and Tesla-only MVP separation.

---

## Fixed

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

## Unresolved (intentional or low-impact)

_All 3 originally unresolved findings have been fixed in the second review pass (2026-05-23). No open items remain for MVP._

---

## Security stance — MVP launch readiness

✅ Inbound webhook auth: constant-time secret check  
✅ Tesla OAuth: state HMAC-bound to user, constant-time verify  
✅ Token encryption: AES-256-GCM with random IV + auth tag, fail-fast key validation  
✅ Document ownership: recover restricted to sender_email match  
✅ Supabase admin client: ownership check via `.eq("user_id", userId)` before reads/writes  
⚠️ RLS policies: present on `documents` (user_id = auth.uid()), `vehicles`. Audit `energy_costs`, `charging_sessions`, `trips` before opening to multi-tenant.  
⚠️ Rate limiting: none on `/api/documents/inbound-email` — depends on Cloudmailin's source IP filter as the primary defense.

---

## Recommendations before public multi-tenant launch

1. **Per-doc claim tokens** in recovery emails (replaces the `sender_email` filter, more robust against email spoofing).
2. **Rate limit** the inbound webhook by source IP and per-email-domain.
3. **RLS audit pass** on `energy_costs`, `charging_sessions`, `trips`, `command_events` tables.
4. **Replace `findUserByEmailLocalPart` normalization** with exact match (drops the cross-user collision risk).
5. **Bot detection** on `/api/auth/[...nextauth]` (Google OAuth has built-in defenses but custom Credentials route is exposed).
6. **Source IP allowlist** for Cloudmailin webhook (their published IP range).
