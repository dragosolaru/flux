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

## Part 2 — Tesla platform review

*Findings below were checked against the actual `teslamotors/vehicle-command`
source (`pkg/proxy/proxy.go`, `pkg/proxy/command.go`, `pkg/account/account.go`),
not against memory. Every code claim was independently re-verified here.*

### The headline

The key mismatch fixed today in `e81141b` was real, but it was **not the only
thing standing between the app and reliable commands.** Six further issues sit
behind it, and two of them guarantee failure for specific commands and specific
regions regardless of how correct the key is. The good news is that they are
independent and mostly small.

---

### T1 · HIGH · `share_navigation` cannot work through the proxy

`src/lib/brands/tesla/command-map.ts:65-76` + `src/lib/tesla/api.ts:279-280`

**Verified in both codebases.** The command maps to `navigation_gps_request`,
and the routing decision is a single global switch:

```ts
const proxyBase = teslaProxyBaseUrl();
const apiBase = proxyBase || baseUrl(region);   // every command, no exceptions
```

The proxy's command table has **no `navigation_gps_request` key**. In
`pkg/proxy/command.go` the only navigation entry is
`case "navigation_request": return nil, ErrCommandUseRESTAPI`, and the
`default:` arm answers `400 {"response":null,"error":"invalid_command"}`
locally. The REST fallback in `proxy.go:371` fires *only* when the error is
`ErrCommandUseRESTAPI` — an unknown command never reaches Tesla at all.

So "send this trip to my car" — a headline feature in `docs/MARKETING.md` —
returns a 400 that surfaces as a generic 502 "Command failed". The identifier is
fine; the **routing decision** is wrong.

**Fix:** add `signed?: false` to `CommandEntry` and route
`const apiBase = (proxyBase && entry.signed !== false) ? proxyBase : baseUrl(region)`,
using the numeric id as the tag on the direct path. Navigation is
server-processed by Tesla and needs no VCP signing — which is exactly why
upstream returns `ErrCommandUseRESTAPI` for it.

### T2 · HIGH · The OAuth audience is hardcoded to NA while the region is probed separately

`src/lib/tesla/auth.ts:85` + `src/app/api/tesla/callback/route.ts:79-99`

**Verified.** Every code exchange sends
`audience: "https://fleet-api.prd.na.vn.cloud.tesla.com"`, while the region is
discovered independently by probing eu → na → cn. These two can disagree, and
the disagreement is not cosmetic: **the signing proxy picks its upstream host
from the token's JWT, not from the URL you call it on.** From
`pkg/account/account.go`:

```go
const defaultDomain = "fleet-api.prd.na.vn.cloud.tesla.com"
ouCodeMatch := fmt.Sprintf(".%s.", strings.ToLower(p.OUCode))
for _, u := range p.Audiences { ... if strings.Contains(domain, ouCodeMatch) { return domain } }
return domain   // falls back to NA
```

With only the NA audience in `aud`, an EU account (`ou_code: "EU"`) has its
signed commands forwarded to the **NA** host, which Tesla answers with 412 /
"Account must be registered in the current region". This is the documented
failure in `evcc-io/evcc#19355` and `teslamotors/vehicle-command#208`.

**Second-order effect, and this is the nasty part:** `refreshTeslaTokens`
(`auth.ts:110-114`) sends **no audience at all** — verified. So a refreshed
token can carry a different `aud` than the original, and the proxy's target host
changes silently on first refresh. Commands that work at 9am break at 5pm.
**That non-determinism is a strong candidate for part of the two months of
confusion**, and it would have survived the key fix untouched.

**Fix:** after the code exchange call `GET /api/1/users/region` →
`response.fleet_api_base_url`, store that, then immediately re-mint via one
`refresh_token` grant with `audience=<that base>`. Send the same audience on
every subsequent refresh, so JWT audience, `tesla_region`, and the proxy's
chosen host are the same value by construction. This also replaces the
three-region brute-force probe with one call.

### T3 · HIGH · No wake before a command; 4-second retry is the worst of both worlds

`src/lib/tesla/api.ts:64-79` (verified: single retry after `setTimeout(4_000)`)

A Tesla takes 5–30 s to come online from sleep, longer from deep sleep. A
4-second single retry **fails on most sleeping cars while still paying the full
cost of the wake** — the car boots its MCU and cannot re-sleep for ~15 minutes.
Worst of both.

`sendVehicleCommand` never checks vehicle state at all. Through the proxy,
`handleVehicleCommand` does `car.Connect()` then `car.StartSession()`
(`proxy.go:463-475`); against a sleeping car that times out and returns a Go
error string as a 500, which matches neither `notPaired` nor `unsigned` and
becomes generic **"Command failed"**. Now that the key is right, this is very
likely the most common remaining field failure.

Compounding it: the proxy's `DefaultTimeout` is **10 seconds**
(`proxy.go:30`), and `tesla-proxy/Dockerfile` passes neither `-timeout` nor
`TESLA_HTTP_PROXY_TIMEOUT`. A just-woken car frequently needs longer than 10 s
for the session handshake.

**Fix:** check `GET /api/1/vehicles/{id}` (cheap, does not wake); if not
`online`, `wake_up` direct and poll to online with 2/4/8/15 s backoff, then
send. Return a distinct `VEHICLE_ASLEEP` code if it never wakes. Add
`-timeout 25s` to the proxy entrypoint.

### T4 · HIGH · Polling wakes sleeping cars roughly every 30 seconds

`src/hooks/useVehicle.ts` + `src/lib/tesla/api.ts:67`

This qualifies the "Flux will not flatten your battery" claim in
`03-COMPETITIVE-EDGE.md`, and the qualification is important.

The idle pause and stop-on-error are well designed, but the idle pause fires
after 10 minutes of *inactivity* — it never fires while someone is actually
looking at the screen, which is precisely when the polling happens. Each poll of
a sleeping car re-enters the 408 branch and fires **another `wake_up`**. A
dashboard left open for ten minutes issues ~20 wakes and guarantees the car
cannot sleep for at least 25 minutes.

`refetchInterval` returning `false` on error accidentally limits the damage —
but only after the first hard failure.

The daily cron has the same shape: `resolveState` calls the same
`fetchVehicleData`, so once a day **every sleeping car in the fleet is woken**,
ten at a time, purely to evaluate weather and battery alerts. A car parked at an
airport for two weeks gets 14 forced wakes for alerts nobody needed.

**Fix:** add a `wake` parameter defaulting to **false**. Polling and cron pass
`false` and render "asleep — Wake" as an explicit button. The cron should fetch
`/api/1/vehicles` once per user (returns `state` without waking) and skip
anything not `online`.

**The differentiator is still real — the architecture is right — but the claim
should not be made publicly until T3/T4 are fixed.**

### T5 · HIGH · Refresh-token rotation is guarded only by a per-process map

`src/lib/tesla/tokens.ts:16-19`

The single-flight guard the first pass praised is an in-memory `Map`. On Vercel,
`/state`, `/commands` and `/cron` run in **different lambda instances**, so two
concurrent requests in the expiry window both call Tesla with the same refresh
token. Tesla rotates and invalidates on use: the second gets `400
invalid_grant`, and whichever DB write lands last may store a token the first
response already invalidated. The driver sees `TESLA_REAUTH_REQUIRED` and must
re-link — intermittently and unreproducibly.

This corrects the first pass, which called the single-flight guard sufficient.
It is correct in intent and correct on a single server; it does not hold on
serverless.

**Fix:** move the lock to Redis (`SET NX`, 15 s TTL, re-read on contention —
Upstash is already a dependency) or a Postgres advisory lock.

### T6 · HIGH · Every rate limit is per-user; there is no app-wide ceiling

`src/lib/rate-limit.ts:47-58` — every call site keys on `session.user.id`.

**Tesla's quota and billing are per partner account, not per user.** `/state`
allows 120/hour/user and `useVehicle` polls at exactly 30 s = 120/hour, so one
open dashboard sits permanently at its own cap. Ten users with tabs open is
1,200 billable `vehicle_data` calls/hour app-wide, with nothing in the code able
to notice, let alone stop it. `wake_up` is dramatically more expensive, and T4
fires it on every poll of a sleeping car.

**Fix:** a global bucket checked inside `fetchVehicleData` / `sendVehicleCommand`,
plus a server-side Redis cache of `vehicle_data` per vehicle for 20–30 s so
`/state`, `/tesla/vehicle` and a second browser tab share one upstream call.

### T7 · MEDIUM · Two dead Tesla routes that can spend quota and drive the car

**Verified: `/api/tesla/command` and `/api/tesla/vehicle` have zero callers** in
`src/` or `e2e/`.

`/api/tesla/command` accepts 7 commands, passes `params` straight through as the
raw Tesla body with **no `buildBody` mapping**, and skips `recordCommandEvent`,
the `virtual_key_paired` update, the security alert, and the `TeslaAuthError` →
409 handling. `/api/tesla/vehicle` is a second live-fetch path with its own
60/hour budget and its own snapshot write.

These are authenticated endpoints that can spend Fleet API quota and send
commands to a real car with weaker handling than the route that is actually
used. **Delete both.** (Adds to issue D-2 in `05-ISSUES-AND-TECH-DEBT.md`,
which found two dead charger routes — the total is now four.)

### T8 · MEDIUM · A 403 on the command path is not treated as an auth problem

`src/lib/tesla/api.ts:339` vs `:93`

**Verified, and the asymmetry is almost poignant.** The data path handles
`401 || 403` with a comment explaining exactly why 403 counts. The command path
opens with *"Same reasoning as fetchVehicleData"* — and then checks only 401. A
revoked `vehicle_cmds` scope returns 403 on `/command/*` and falls through to
the generic 502, which is precisely the advice-that-cannot-work the 409 reauth
path was built to eliminate.

**Fix:** one character short of trivial — `res.status === 401 || res.status === 403`.

### T9 · MEDIUM · Assorted error-semantics gaps

| Issue | Location | Effect |
|---|---|---|
| 429 invisible | `api.ts:98,344` | Tesla rate-limiting is reported as "check your connection", and the app keeps hammering. Nothing reads `Retry-After`. |
| `response: null` dereferenced | `api.ts:347`, `commands/route.ts:107` | Tesla and the proxy both emit `{"response":null,"error":…}`. Reading `result.response.result` throws a `TypeError` caught by the outer handler and reported as "Command failed" — destroying the actual reason. |
| Nominal refusal bypasses the pairing prompt | `commands/route.ts:167-169` | Car-side refusals arrive as **HTTP 200** with `{"response":{"result":false,"reason":…}}`. The `notPaired`/`unsigned` matching lives only in the `catch` block, so a key-not-paired refusal raised during `Execute` gets no `VCP_REQUIRED` code and no pairing link. Latent today; active once T3 fixes the 500. |
| No `maxDuration` on live routes | `vehicles/[vehicleId]/{commands,state}/route.ts` | **Verified absent on both.** A signed command legitimately takes 10–25 s; the function times out and the driver sees a network error for a command the car may have executed. |
| `min_machines_running = 0` | `tesla-proxy/fly.toml` | Every command after idle pays a cold start *and* loses the in-process session cache, redoing the handshake from scratch. |

### T10 · MEDIUM · The proxy is an open relay

`tesla-proxy/README.md:294-299` documents this honestly, framing it as a Flux
user bypassing rate limiting and the audit trail. That understates it slightly:
**the relay signs with your key**, so any holder of a valid Tesla token for an
account that paired your app can drive commands through your signing key with no
Flux-side record.

The fix is about four lines of Caddyfile — a shared-secret header check — plus
the same header on the two `fetch` calls in `api.ts`. Worth doing before more
cars pair.

### T11 · MEDIUM · `id` is read as a JS number rather than `id_s`

`src/types/tesla.ts:26` types `id: number`. Tesla publishes `id_s` as a string
precisely because these ids can exceed 2⁵³, where `JSON.parse` silently rounds.
TeslaMate, Teslascope and Tessie all key on `id_s` or VIN for this reason. A
rounded id produces a 404 that looks exactly like "vehicle not found".

**Fix:** store `id_s`; at minimum assert `Number.isSafeInteger(first.id)` in the
callback and log if not.

### T12 · Smaller items

- **Scopes are never updated on refresh** (`tokens.ts:144-152`) — Tesla returns `scope` on refresh and a driver can edit permissions at tesla.com. Nothing reads the column to gate the UI either, so the command panel offers 22 commands to a token that may have lost `vehicle_cmds`.
- **No per-command argument validation** (`commands/route.ts` accepts `z.record(z.string(), z.unknown())`) — `set_charge_limit` with `percent: 3` reaches the car and returns an opaque error.
- **Partner registration is per-region** and nothing tracks which regions are done; the panel defaults to `eu`. Make "Check status" run all three in parallel.
- **`set_scheduled_departure` always sends `enable: true`** — no way to cancel a schedule; upstream maps `enable:false` to `ClearScheduledDeparture`.
- **`window_control` sends `lat: 0, lon: 0`** — harmless through the proxy (never read), but Tesla requires real coordinates near the vehicle on the direct path.
- **`dx/charging/history` is called with `?vehicleId=`**; Tesla's endpoint keys on `vin`. Moot while it 403s, wrong the day a business account is tested.
- **`TESLA_SCOPES` includes `energy_device_data` / `energy_cmds`** for code that does not exist — extra consent friction for every user.

### What is right

Worth stating, because a list of twelve findings distorts the picture. Verified
correct: `vehicle_data` and `wake_up` use a valid `vehicle_tag`; the proxy path
correctly uses the 17-char VIN with a hard guard matching `proxy.go:362`;
`fleet_status` correctly POSTs `{vins:[…]}`; the partner-registration flow —
client-credentials with narrow scopes, regional audience, domain taken from the
inbound request so it cannot drift, and a **four-way key comparison with a
CDN-staleness discriminator** — is better than what most third-party Tesla apps
have. The 409 `TESLA_REAUTH_REQUIRED` split (chosen over 401 so `apiFetch` does
not log the user out of Flux) is well reasoned, as are `PROXY_UNREACHABLE`,
`PROXY_NEEDS_VIN`, and logging *which* string matched. Omitting `scope` on
refresh is correct and the comment explaining why is correct.

### Test coverage gap

`src/lib/tesla/__tests__/` contains **one** file, covering `mapVehicleData`
only. There is no test for the proxy-vs-direct routing decision or the VIN/id
choice — the exact logic that broke in `f08b316` and that T1 will change again.
A table-driven test over `TESLA_COMMAND_MAP` asserting `{url, tag, body}` per
command, with and without `TESLA_PROXY_BASE_URL`, would have caught T1 for free.

### Recommended order

1. **T3 + T9 `maxDuration`/proxy timeout** — wake before command. Biggest reliability win now that the key is right; asleep is the most common real-world state.
2. **T2** — make the audience/region binding deterministic. Until then, signed commands depend on which token happens to be current.
3. **T4** — stop waking from the polling and cron paths.
4. **T1** — per-command signing split. Unbreaks `share_navigation`; persist `vehicle_command_protocol_required` from `fleet_status` while there.
5. **T5** — cross-instance refresh lock. Produces unreproducible re-link prompts that will be blamed on Tesla.
6. **T8, T9** — the error-semantics gaps. Small, independent, each removes a "Command failed" that hides a known cause.
7. **T6** — app-wide quota ceiling and a server-side `vehicle_data` cache. **T7** — delete the two dead routes.
8. **T10** proxy secret, **T11** `id_s`, **T12** the rest.

---

## Part 3 — Correctness review

*Arithmetic verified by hand and by targeted vitest probes. All 267 existing
tests still pass; the working tree was not modified. Every P1 below was
independently re-verified here against the cited code.*

### The headline

**Cost Intelligence — the app's flagship differentiator — has four compounding
arithmetic defects that produce wrong money on screen.** They interact: one
selects the wrong sessions, which triggers a second that charges the entire
household bill to the car, while a third divides the result by the attribution
fraction a second time and a fourth shows the undivided figure right next to it.
A user cannot currently trust the cost dashboard.

This is the most important finding in the whole redocumentation pass. It is not
a security hole and it will not lose anyone's car — but it is the feature the
product is sold on.

---

### C1 · P1 · Model 3 state-of-health is computed against the wrong rated range

`src/lib/tesla/api.ts:357`

**Verified.** `RATED_RANGE_BY_VIN_MODEL` keys off `vin[3]` and uses
`F: 358 // Model 3 Long Range`. But `F` is never a position-4 model value — the
repo's **own decoder** (`src/lib/brands/tesla/vin-decoder.ts:8-25`) maps
position 3 to `"3" | Y | S | X | C` and puts `F` in `VARIANT_MAP` as
"Dual Motor AWD".

So every Model 3 and every Cybertruck misses the table and falls back to
`DEFAULT_RATED_RANGE_MILES = 330`.

**Concrete case:** Model 3 LR, `battery_level: 80`, `battery_range: 275` → full
range 343.75 mi. True SoH is `343.75/358 = 96.0%`; the code reports
`343.75/330 = 104.2%`. **A healthy Model 3 is shown as over 100% battery
health**, and that value is persisted into `battery_health_history` and drawn on
the insights degradation chart.

Not covered by any test — `map-vehicle-data.test.ts` tests tyre and speed
conversions but never `estimateSoH`.

**Fix:** key Model 3 as `"3": 358` and add `"C"` for Cybertruck.

### C2 · P1 · Home-bill attribution selects public charging sessions

`src/lib/costs/attribution.ts:23`

**Verified.** The query filters `.is("network", null)` — which is *public*
charging, not home charging:

```ts
.from("charging_sessions")
.select("energy_added_kwh")
.eq("vehicle_id", vehicleId)
.is("network", null)          // ← selects the wrong set
```

Migration `008_user_preferences.sql:4` added `is_home_charge` explicitly "for
A.5 attribution". **Attribution never reads it.** Instead:

- Seeded and labelled home sessions carry `network: "home"` → **excluded**
- Supercharger sessions imported from Tesla write no network at all → **included**
- Simulator sessions write `network: prev.activeChargingSessionNetwork`, hard-coded `null` at `engine.ts:249` with a comment claiming it is "filled by persistence from step info" — `persistence.ts:158` never fills it

**Concrete case:** 100 kWh at home + 200 kWh at Superchargers in March, 500 kWh
household bill → `vehicleKwh` = 200 (the public sessions), fraction 0.4 instead
of 0.2. **The car is billed double its share.** If home sessions were labelled
`"home"`, `sessionCount` is 0 and C3 fires instead.

**Fix:** filter `.or("is_home_charge.eq.true,network.eq.home")`, and actually
set `network` / `is_home_charge` when sessions are written.

### C3 · P1 · Zero matched sessions charges 100% of the household bill to the car

`src/lib/costs/processor.ts:189-195`

**Verified.**

```ts
} else {
  // No charging sessions found for this period — can't attribute proportionally.
  vehicleKwhAttributed = parsed.total_kwh;
  vehicleCostRon = costRon;
```

A 600 RON / 500 kWh monthly bill uploaded for a month the car never charged at
home writes `cost_ron = 600` and `vehicle_kwh_attributed = 500`, and the costs
page reports the **entire household electricity bill** as vehicle energy.

Given C2, this fires for *any* month whose home sessions happen to be labelled
`"home"` — so it is not an edge case, it is a likely default.

**Fix:** on `sessionCount === 0`, write zeros and mark the document
`needs_review` rather than claiming the whole bill.

### C4 · P1 · `cost_ron` has two contradictory meanings; the fraction is applied twice

`src/app/api/costs/route.ts:122-129` vs `src/lib/costs/processor.ts:228`

**Verified — the two writers genuinely disagree.** The processor stores
`cost_ron: vehicleCostRon`, which is *already* `costRon × fraction`. The
aggregator's comment states the opposite and multiplies again:

```ts
// For home bills, cost_ron is the full bill. Only the vehicle's attributed
// proportion (vehicle_kwh_attributed / total_kwh) belongs to the car.
return s + r.cost_ron * (r.vehicle_kwh_attributed / r.total_kwh);
```

Meanwhile the seeder (`seed-history.ts:300`) and the manual-edit PATCH
(`documents/[documentId]/route.ts:107`) both write the **full** amount — so
which meaning applies depends on how the row was created.

**Concrete case:** 600 RON bill, 500 kWh total, 100 kWh vehicle → stored
`cost_ron = 120`; `homeAttributedCostRon = 120 × 0.2 = 24`. The same screen then
shows `homeCostRon = 120 RON` next to a `costPerKmHome` derived from 24 RON —
**5× too low, side by side.** Symmetrically, on seeded and manually edited rows
`totalCostRon`, the monthly bar chart, and `savedRon` in `insights-client.tsx:66`
all use the *un*attributed sum, so the headline "Total" KPI and the
petrol-savings tile include the whole household bill.

**Fix:** pick one meaning (store the attributed amount), delete the
re-multiplication, and use `attributedTotalCostRon` for `totalCostRon`,
`homeCostRon` and `monthlyTrend`.

### C5 · P1 · Simulator `plugged-idle` charges the battery without updating range

`src/lib/mock/engine.ts:103-121`

**Verified.** The `charging` branch recomputes `batteryRangeKm` and
`timeToFullMinutes`; the `plugged-idle` branch updates only `batteryLevel` and
`chargingRateKw`. The commuter scenario enters `plugged-idle` at 17:40 and holds
it until midnight at 7.4 kW, so this is the *normal* evening path, not an edge
case.

Confirmed by running `tick()`: from 18:00 → 21:00, SoC went 40 → 69.6% while
`batteryRangeKm` stayed at 200 (a 43% value) and `timeToFullMinutes` stayed
stale. Since the simulator is the zero-friction demo every evaluator sees, this
is a first-impression bug.

**Fix:** recompute both fields in the plugged-idle charging sub-branch exactly
as the `charging` case does.

---

### P2 — latent, needs a particular path

| Finding | Location | Effect |
|---|---|---|
| **Planner never debits the off-route return leg from SoC** | `routing/planner.ts:434-436` | `drivenKm += offRouteKm` but `socNow` ignores it, and the next iteration measures from the on-route projection, so the leg is never charged to anyone. Verified: 900 km route, two 20 km-off-route stations → reported `arriveSoc: 20`, true value `16.07`. Scales to ~5.3 points at the 25 km limit. **Every stop's arrival SoC is optimistic.** |
| **`iter++ < 30` marks a complete 29-stop plan infeasible** | `routing/planner.ts:295,442` | The pass that reaches the destination also increments `iter` to 30, so the limit fires on a plan that finished normally. `planTripVariants` then drops the variant and the user gets **no route at all**. Gate on `kmLeft > 0` instead. |
| **Tariff hours indexed positionally, from two different clocks** | `tariffs/recommend.ts:21,37,69` | `prices[currentHour]` ignores `HourlyPrice.hour`, and Tibber returns 23 entries on the March DST day and 25 in October — so index ≠ hour and the recommended window slides. Separately `buildForecast` uses the **server's** UTC hour while `energy-client.tsx:66` passes the **browser's** local hour; for a Romanian user in summer those are 3 hours apart. |
| **BNR stamps today's rate onto any historical date** | `external/bnr/client.ts:54-88` | `nbrfxrates.xml` only ever serves the current day; the offset loop re-fetches the same document and upserts today's rate under the *requested* date. A 2024 receipt is converted at today's rate and **poisons that date's cache forever**. The advertised 5-day fallback is dead code. |
| **Vault `.ics` uses `DTEND == DTSTART`** | `vault/calendar/route.ts:94-95` | RFC 5545 makes `DTEND` exclusive for `VALUE=DATE`, so a zero-length event is invalid and Google/Apple Calendar drop it — the ITP/RCA reminder the feature exists for may never appear. Also `toIcalDate` only strips `-`, so an AI-extracted `"2026-03-31T00:00:00.000Z"` corrupts the whole file. (Moot until F8 in Part 1 is fixed — the route 404s unconditionally today.) |
| **Every car document is permanently `needs_review`** | `ai/document-parser.ts:193-197` | `mapCarDoc` fills energy-only fields with three hard-coded zeros, and `averageConfidence` averages all numeric values. A **perfect** extraction scores `3/6 = 0.5`, below the 0.7 threshold. The ceiling is 0.5, so an RCA/ITP/CASCO upload **can never reach `done`**. |
| **Billing period excludes its last day** | `costs/attribution.ts:25` | `"2026-03-31"` parses as midnight UTC and the filter is `.lte`, so every session on 31 March is dropped — understating `vehicleKwh` by up to a full day. |
| **Tibber prices treated as EUR regardless of currency** | `tariffs/providers/tibber.ts:133` | `priceInfo.total` is in the subscription's currency (NOK/SEK/DKK/EUR), mapped straight into `priceEurKwh` and consumed as EUR by `computeSmartCharge` and `trip-plan/route.ts:32`. A Norwegian user sees figures ~11× too large. |

### P3 — fragile but currently correct

- Backfilled SoH can exceed 100% — `battery-health.ts:37` adds up to +3 points; clamp it.
- Wind derating documented as quadratic, implemented linear — `weather/derating.ts:35`. Fix the code or delete the claim.
- `synced` count is always `total` — `charging-history/route.ts:79`; `ignoreDuplicates: true` returns no error for a skipped row.
- Alert dedup buckets on the UTC clock hour — an alert at 10:59 re-fires at 11:00 (`cron/poll-vehicles/route.ts:38`).
- Month bucketing is UTC — a 23:00 local trip on the 31st lands in the previous month for UTC+n users (`stats/route.ts`, `costs/route.ts:86`).

---

### Verified clean

Stated explicitly, because it is a large and reassuring list:

**`mapVehicleData` conversions** — `MILES_TO_KM = 1.609344`, bar→kPa ×100,
hours→minutes ×60, charger power already kW. All correct and tested.
**Charge-curve integration** — the 1%-step loop, the `min(stationKw, peak ×
fraction)` cap, the interpolation boundaries, and the physical `energy/capKw`
floor on rounded minutes. **Temperature derating** — the three piecewise
segments join continuously at −10 °C and 0 °C. **Currency formatting and BNR
XML multiplier parsing** — `fromRON`/`fromEUR` algebra and HUF multiplier
division are right. **Alert engine** — thresholds and the stationary gate,
well tested. **`tick()` purity** — genuinely pure and deterministic, no input
mutation, SoC clamped, odometer monotonic, positive-modulo correct across the
cycle wrap. **`applyCommand` coverage** — all 22 `CommandName` members handled,
`COMMAND_CAP_MAP` exhaustive via `Record<CommandName, …>`. **Efficiency math in
`stats/route.ts`** — both Wh/km derivations correct, vampire-drain weighted
average properly guarded. **`projectOntoRoute` / `scoreStation`** — cos-latitude
projection, segment clamp and rescale all correct, and well covered by
`planner-arithmetic.test.ts`. **Error handling** — every `JSON.parse` guarded,
no floating promises, single-flight map cleans up in `finally`, no reachable
null behind a non-null assertion.

The pattern: **geometry, physics and unit conversion are solid and tested;
money and time are not.**

---

## Consolidated priority across all three parts

| # | Finding | Part | Why here |
|---|---|---|---|
| 1 | **F4** unverified email registration | 1 | Enables third-party PII theft; gates the F1/F2 fix |
| 2 | **F1+F2** cross-tenant document injection | 1 | Attacker writes into a victim's vault |
| 3 | **C2+C3+C4** cost attribution | 3 | The flagship feature shows wrong money today |
| 4 | **T3** wake before command + proxy timeout | 2 | Biggest live-command reliability win |
| 5 | **T2** audience/region binding | 2 | Signed commands depend on which token is current |
| 6 | **F6** revoke charger RPCs from `anon` | 1 | Restores migration 031's intent |
| 7 | **C1** Model 3 SoH | 3 | Shows >100% battery health on the commonest model |
| 8 | **T4** stop waking cars from polling and cron | 2 | Partly addressed on main — see below. Finish it before the battery-safety claim is made publicly |
| 9 | **S-2** restore subscription limits | `04` | Blocks public signup safely |
| 10 | **C5** simulator plugged-idle | 3 | First thing every evaluator sees |
| 11 | Everything else, in the per-part orders above | | |

---

## Addendum — main moved while this audit was being written

This pass was taken against commit `e81141b`. Two commits landed on `main`
afterwards (`6072bae`, `ea3e946`) and they change the standing of three
findings. Re-verified:

| Finding | New status |
|---|---|
| **S-3** confirmation on unlock / remote start | **WITHDRAWN — false positive.** The control existed at `e81141b`; the audit's grep pattern could not match a template-literal i18n key. See `04-SECURITY-REVIEW.md`. |
| **T12 — `window_control` sends `lat: 0, lon: 0`** | **FIXED** in `6072bae`. The car's own reported position is passed now. The commit message confirms the diagnosis exactly: vent tolerated `0,0` and close rejected it, so venting worked and closing silently did not. |
| **T4 — polling wakes sleeping cars** | **PARTIALLY FIXED** in `6072bae`. `useVehicle`'s `live` flag defaulted to `false` and only two of eight call sites passed it, so `/commands`, `/charging`, `/insights` and the energy cards each polled a real car every 30 s forever. It defaults to `true` now. **The root cause is untouched:** `src/lib/tesla/api.ts:67` still fires `wake_up` on every 408, so a poll of a sleeping car still wakes it. The `wake: false` parameter this document recommends is still needed. |

Nothing in Parts 1–3 other than the above was affected. The cost-attribution
findings (C1–C5), the Tesla routing findings (T1, T2, T3, T5–T11), and every
security finding (F1–F9) were re-confirmed as still present.

**Lesson worth keeping:** the one finding this audit got wrong was the one
asserted from a grep that returned nothing. Absence of a match is not absence of
the control — every negative claim needs a positive read of the code that would
have contained it.
