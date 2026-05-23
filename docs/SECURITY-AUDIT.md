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

---

## Unresolved (intentional or low-impact)

### #13 — Always-poll 15s on costs page (battery trade-off)
**Severity:** Low (UX/perf)
**File:** `src/hooks/useDocuments.ts:15`

Polling at 15s even when no docs are pending. Trade-off: catches email-arrived documents automatically. Could be tightened later with `document.visibilityState === 'hidden'` pause. Not blocking MVP.

### #14 — Full-UUID email format no longer matched
**Severity:** Low (backwards compat)
**File:** `src/app/api/documents/inbound-email/route.ts:104`

The old webhook accepted `flux+f793064e-b685-475e-a557-efb3f1ab18ee@…` (full UUID subaddress). The new code's `SHORT_ID_RE = /^[a-f0-9]{8}$/i` rejects this. Only relevant if someone bookmarked the old format; UI never exposed it. Step-4 (nickname) and recover button cover the recovery path.

### #15 — `findUserByEmailLocalPart` strips dots/dashes → cross-user collision
**Severity:** Low (probability ≈ 0 in current user base)
**File:** `src/app/api/documents/inbound-email/route.ts:71`

`john.doe@` and `johndoe@` both normalize to `johndoe` after `replace(/[^a-z0-9]/g, '')`. If two users with such email variants both register, document routing via local-part match becomes order-dependent. Acceptable for single-tenant pilot; harden by switching to exact email match when opening to public.

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
