# 07 — Deep Verification

*A second pass, 2026-08-09, closing the gaps the first pass explicitly left open.*

The first pass verified that ownership filters **exist** on every route. It did
not verify that they are **correct**, did not read the RLS policies, and did not
audit the inbound-email attribution logic. This document closes that gap.

Every finding below was reported by a specialist agent and then **independently
re-verified** by reading the cited code directly. Verification status is stated
per finding.

---

## Part 1 — Ownership, RLS, and the ingest paths

### The headline

**The session-authenticated surface is sound.** All 13
`vehicles/[vehicleId]/**` routes, both nested `vault/[documentId]` levels,
`documents/[documentId]`, `saved-routes/[routeId]`, `costs`, and all of
`tesla/**` perform the ownership check *before* data access and scope it
correctly. No cross-user read, modify, or delete could be constructed against
any of them. The routes flagged in `01-STATE-OF-THE-APP.md` as "needs a human
pass" — `/api/chargers/*`, `/api/geocode`, `/api/exchange-rates`,
`/api/feedback`, `/api/billing/*`, `/api/me/preferences`, `/api/push/test` — are
all **correctly** not user-scoped: shared reference data, external API proxies,
or self-scoped from the session. That flag is now cleared.

Storage paths are also clean. Every path is built server-side as
`${userId}/${vehicleId}/${crypto.randomUUID()}.${ext}` from database-sourced
UUIDs, with the extension sanitised to `[a-zA-Z0-9]{0,10}`. **The client never
supplies a storage path** — signed URLs are minted from `doc.storage_path` read
off an already-verified row. No traversal, no cross-prefix read.

**The real problems are all in the paths where identity comes from
attacker-controlled input rather than from `auth()`.**

---

### F1 · HIGH · Cross-tenant document injection via email local-part

`src/app/api/documents/inbound-email/route.ts:146-153`

**Verified directly.** `resolveVehicle()` step 2 resolves a *victim's account
from the local part of their email address*, then attributes the document to
their first active vehicle:

```ts
// 2. +subaddress = user email local part
if (subaddress) {
  const userId = await findUserByEmailLocalPart(subaddress, supabase);
  if (userId) {
    const vehicleId = await firstActiveVehicle(userId, supabase);
    if (vehicleId) return { vehicleId, userId };
  }
}
```

The subaddress comes from the `To:` header — whatever the attacker typed.
Cloudmailin relays it verbatim along with a valid `x-webhook-secret`. **The
attacker never needs the secret; they only need to send an email.**

Worse, `extractSubaddress` matches `/\+([^@+\s]+)@/i` against the *entire* To
header with no check that the address belongs to the Cloudmailin domain. Any
`+tag@anything` in the header wins.

**Exploit.** Victim's email is `alice@gmail.com`. Attacker sends mail with
`To: <flux+alice@cloudmailin.net>`. The attachment uploads to
`{victimUserId}/{victimVehicleId}/…`, inserts into `documents` with
`user_id = victim`, and `processDocument()` runs Claude OCR on it. The victim
finds an attacker-supplied document in their vault, and OCR-derived
`energy_costs` rows land on their vehicle.

The identifier this keys on — an email local part — is **public and guessable**,
unlike the vehicle short ID the feature was designed around.

**Fix:** delete step 2. It has no counterpart in the address the UI hands out.

### F2 · HIGH · Same injection via a spoofed `From` header

`src/app/api/documents/inbound-email/route.ts:155-163`

**Verified directly**, including the absence of any DKIM or SPF check — a grep
for `dkim` and `spf` across `src/app/api/documents/` returns **nothing**.
Cloudmailin supplies those results in its payload; the handler never reads them.

`From:` is trivially forgeable. Setting `From: victim@example.com` attributes
the document to the victim's first active vehicle. Same impact as F1, one fewer
step.

There is a sharp irony here worth recording. The comment immediately below
these two steps names this exact attack class as the reason the *nickname*
fallback was removed:

> *"Do NOT fall back to scanning vehicle nicknames across all users — that is a
> cross-tenant IDOR (a spoofed sender could attribute a document to a victim's
> vehicle)."*

Steps 2 and 3 do precisely that, through weaker identifiers, directly above the
comment. The sibling WhatsApp route got this right —
`inbound-whatsapp/route.ts:100-103` attributes *only* via the number the user
registered in Settings, "a trusted signal the user opted into."

**Fix:** delete steps 2 and 3. Unmatched mail already has a correct destination
— the `FALLBACK_USER_ID` pool with `status: needs_review` and no OCR. Also
delete the stale header comment at `:12`, which still advertises the removed
nickname step.

### F3 · MEDIUM · Vehicle subaddress is an unrotatable bearer capability

`src/app/api/documents/inbound-email/route.ts:116-144`

Steps 1a/1b look up any vehicle by UUID or 8-hex short ID with no binding to the
sender. Anyone who learns a vehicle's short ID can post documents into it
indefinitely, and **the ID cannot be rotated** — it is derived from the primary
key. Brute force is impractical (2³²), and the per-sender rate limit does not
constrain it since the attacker controls the `From` used as the limiter key.

**Fix:** store a rotatable random token per vehicle instead of deriving the
address from the PK.

### F4 · HIGH · Unverified registration turns `documents/recover` into document theft

`src/app/api/auth/register/route.ts:39-43` + `src/app/api/documents/recover/route.ts:54-60`

**Verified directly.** Registration marks every account confirmed without ever
sending a verification mail:

```ts
const { data, error } = await supabase.auth.admin.createUser({
  email: parsed.data.email,
  password: parsed.data.password,
  email_confirm: true,          // ← no verification mail is sent
});
```

Anyone can create an account for **any email address they do not own** and sign
in immediately. `documents/recover` then gates claiming on exactly that value,
under a comment asserting a property that does not hold:

```ts
// Only claim docs whose sender_email matches the current user's verified email.
.eq("user_id", UNMATCHED_USER_ID)
.is("vehicle_id", null)
.eq("sender_email", userEmail)
```

**Exploit.** The unmatched pool consists precisely of documents whose sender is
*not* a registered user — that is why attribution failed — so the address is
always free to register. Alice forwards her insurance policy from
`alice.work@corp.com`; it lands unmatched. The attacker registers
`alice.work@corp.com`, POSTs to `/api/documents/recover`, and the document moves
into their vault and is served back with a signed URL. Full read of a third
party's PII — policy number, plate, address.

**Fix:** require `email_confirmed_at` before honouring an address as identity.
At minimum, gate `recover` on a confirmed email.

**Ordering matters:** tightening `resolveVehicle` (F1/F2) pushes *more*
documents into the unmatched pool, which increases exposure to F4. **Fix F4
first, or ship them together.**

### F5 · MEDIUM · Push subscription hijack via `onConflict: "endpoint"`

`src/app/api/push/subscribe/route.ts:46-56` + `supabase/migrations/026_push_subscriptions.sql:7`

The upsert conflicts on `endpoint` alone, and `endpoint` is `unique`, so a POST
carrying another user's endpoint **rewrites that row's `user_id` to the
caller**. The victim silently stops receiving their own alerts, and the
attacker's notifications are delivered to the victim's device — including the
sensitive-command alerts, which is a ready-made phishing surface ("your car was
unlocked — tap here").

Requires knowing the victim's endpoint URL, which is high-entropy and not
exposed through the API — hence MEDIUM rather than HIGH.

**Fix:** `onConflict: "user_id,endpoint"` with a matching composite constraint.

### F6 · MEDIUM–HIGH · `SECURITY DEFINER` charger RPCs are callable by `anon`

**Verified by count.** 27 `security definer` functions across the migrations;
only 5 `revoke` statements, covering 4 functions in migrations 035 and 037.
Roughly **20 charger functions have no revoke at all** (migrations 018–044).

Postgres grants `EXECUTE` to `PUBLIC` by default, and Supabase exposes
public-schema functions as PostgREST RPC to `anon`. The author already knows the
correct pattern — migration 037 does it properly:

```sql
revoke all on function public.exec_sql(text) from public, anon, authenticated;
grant execute on function public.exec_sql(text) to service_role;
```

The charger functions never got it. Several are destructive:
`dedupe_chargers_batch` deletes from `chargers`; `upsert_charger` /
`upsert_chargers_batch` write arbitrary rows.

**This nullifies migration 031's entire purpose.** 031 enabled RLS on the
charger tables because the Supabase advisor flagged them as publicly accessible
— but `security definer` runs as the function owner and bypasses RLS. Anyone
holding the published anon key can still read, poison, or delete the shared
charger index through the RPC door. **031 closed the front door and left the
side door open.**

No user-scoped data is exposed (charger tables are shared reference data), so
this is integrity and availability rather than confidentiality — but the charger
index is the deepest subsystem in the app.

**Fix:** append the 037-style revoke/grant pair to all ~20 functions.

### F7 · LOW–MEDIUM · Account deletion leaves blobs and feedback PII

`src/app/api/user/delete/route.ts:59-69`

Storage paths are `{userId}/{vehicleId}/{uuid}.{ext}`, so `list(userId)` returns
the `{vehicleId}` **folders**, not files — and `remove()` on a folder path
deletes nothing. Any blob without a matching `documents` row survives account
deletion forever.

Relational deletion is otherwise complete via cascades, with one exception:
`feedback.user_id` is `on delete set null` (`023_feedback.sql:4`), so the
deleted user's `name`, `email` and `message` persist.

Both are GDPR erasure gaps rather than access-control bugs.

**Fix:** recurse one level into each vehicle folder; explicitly delete the
user's `feedback` rows.

### F8 · LOW · The vault calendar export has never worked

`src/app/api/vehicles/[vehicleId]/vault/calendar/route.ts:43`

**Verified directly.** The route selects `"id, name, plate_number"` from
`vehicles`. Neither column exists — `vehicles` has `display_name`, and
`plate_number` lives on `vehicle_doc_meta` (migration 025). Confirmed there is
no `alter table vehicles add` anywhere in the 44 migrations.

The select errors, `vehicle` is null, and the route returns **404
unconditionally**. The ICS export has never functioned. It fails in the safe
direction, and the code's own optional-column fallback at `:50-52` is what
masked it.

**Fix:** `display_name`, and join `vehicle_doc_meta` for the plate.

### F9 · LOW · Two identity accessors for the same user

`ensureSupabaseUserId(session)` is used by `documents`, `costs`, `user/*`,
`billing/*`, `me/*`; raw `session.user.id` by `vehicles/[vehicleId]/**`,
`tesla/**`, `saved-routes`. They converge today because the `jwt` callback
resolves Google's `sub` to the Supabase UUID before any route sees it — so this
is **not currently exploitable**. But `tesla/callback:162` *writes*
`vehicles.user_id` from one accessor while `/api/vehicles` POST writes it from
the other. If they ever diverge, ownership filters silently return zero rows,
and a fix that "restores access" would paper over a real mismatch.

**Fix:** pick one accessor.

---

### RLS — a clean result

**All 26 tables have RLS enabled. No user-data table is unprotected, and no
permissive `USING (true)` policy survives** — the one that existed on `feedback`
(migration 023) was dropped by 024.

Every table created *after* 031 also got RLS: `saved_routes` (032), `debug_logs`
and `applied_migrations` (037). **None was missed.**

Two points worth stating so they are not re-flagged later:

1. `FOR ALL` policies specifying only `USING` without `WITH CHECK` are **not** a
   gap. Postgres reuses the `USING` expression as `WITH CHECK` when the latter
   is omitted, so writes are constrained identically.
2. `createSupabaseBrowserClient` and `createSupabaseServerClient` are defined
   but **never imported anywhere**. Every code path uses the service-role
   client. RLS is therefore pure defence-in-depth against direct PostgREST
   access with the anon key — which is exactly why **F6 matters**, since that is
   the one path RLS was there to protect.

This supersedes finding **S-6** in `04-SECURITY-REVIEW.md`: migration 031's
contents are correct, and the real issue is not whether it was applied but that
the RPC layer bypasses it.

---

## Revised priority order

Merging these findings with `04-SECURITY-REVIEW.md`:

| # | Finding | Why first |
|---|---|---|
| 1 | **F4** — unverified email registration | One-line root cause, enables document theft, and gates the F1/F2 fix |
| 2 | **F1 + F2** — delete `resolveVehicle` steps 2 and 3 | Cross-tenant injection into a victim's vault |
| 3 | **S-3** — confirm before unlock / remote start | Cheapest fix, most direct physical risk |
| 4 | **F6** — revoke the ~20 charger RPCs from `anon` | Restores migration 031's intent |
| 5 | **S-2** — restore subscription limits | Blocks public signup safely |
| 6 | **F5** — composite conflict on `push_subscriptions` | |
| 7 | **S-5** — key-rotation procedure | Needed before customers, not after |
| 8 | **S-4** — split the OAuth scopes | Structural risk reduction |
| 9 | **F3, F7, F8, F9** | Hardening and correctness |

---

## Part 2 — Correctness and Tesla platform review

*Two further agents were dispatched — one hunting correctness defects in the
core computational logic (unit conversions, cost attribution, timezone
handling, React hook races, simulator purity), one applying Tesla Fleet API
platform expertise to identifier correctness, regional routing, command
signing, and quota risk. Their findings will be appended here.*
