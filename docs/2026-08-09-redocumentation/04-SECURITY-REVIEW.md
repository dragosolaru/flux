# 04 — Security Review

*2026-08-09. Scope: the surface that touches customer Tesla credentials.*

> **The stake.** Connecting a car grants `vehicle_device_data`, `vehicle_cmds`
> and `vehicle_charging_cmds` — live location plus lock/unlock, climate, charge
> port, and remote start. A compromise here is not a data breach; it is
> someone else's car being unlocked. Everything below is graded against that.

**Bottom line:** no critical or high-severity vulnerability was found. The
credential-handling core is well built. The open items are operational
(procedures that do not exist) and commercial (a limit that is stubbed open),
not architectural.

---

## What is done well

Stated first, because it is the larger part of the picture and it is genuinely
above the norm for a project at this stage.

**Token encryption** (`src/lib/tesla/tokens.ts`) — AES-256-GCM, a fresh random
12-byte IV per call, auth tag verified on decrypt, key length validated at
32 bytes with a clear error. `assertTeslaEncryptionKey()` is called at OAuth
entry points so misconfiguration fails *before* the user authorises rather than
crashing in the callback after consent. There is a single-flight guard on
refresh because Tesla rotates refresh tokens on use and two concurrent refreshes
would desync the stored token. Every one of those is a detail that is usually
missed.

**Ownership is enforced twice.** `getValidAccessToken(vehicleId, userId)`
re-verifies `vehicles.user_id = userId` inside the token vault, independently of
whatever the calling route already checked. Defence in depth, correctly applied.

**Admin surface is closed by default.** All 11 `/api/internal/debug/*` routes
call `requireAdmin()` (`src/lib/admin.ts`), which resolves against the
`ADMIN_EMAILS` allowlist. An empty allowlist means nobody qualifies — so the
debug surface is shut in every environment it has not been deliberately opened
for, including production. Unauthorised callers get **404, not 403**, so the
surface does not advertise its own existence.

**Secrets are compared in constant time** — `timingSafeEqual` /
`constantTimeEqual` on every webhook and cron secret checked. The email webhook
runs the comparison *before* the length check so the timing does not leak length.

**Webhooks fail closed.** `CRON_SECRET`, `EMAIL_WEBHOOK_SECRET` and
`INGEST_WEBHOOK_SECRET` all 503 when unconfigured rather than defaulting open.
The `?secret=` query-param fallback was removed; header only.

**Headers.** Nonce-based CSP with `strict-dynamic`, `object-src 'none'`,
`frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`
(`src/proxy.ts`), plus HSTS with preload, `X-Frame-Options: DENY`, `nosniff` and
a `Permissions-Policy` (`next.config.ts`).

**The private signing key is never persisted.** Generated, returned once,
written to no database, no log, no disk.

---

## Findings

### S-1 · MEDIUM · Private signing key is returned over HTTP to a browser

`src/app/api/internal/debug/tesla-keypair/route.ts:52-58`

The EC P-256 command-signing private key is generated server-side and returned
in a JSON response, then rendered in the debug UI with a copy button
(`src/app/(dashboard)/debug/debug-client.tsx:1111`). The private half of the
key that signs vehicle commands crosses a network and lands in browser memory
and the DOM.

**This is a documented, deliberate trade-off**, and the reasoning in the file is
sound: the alternatives are pasting a key through a chat window or leaving
commands broken, and setting this up from a phone otherwise requires finding a
machine with `openssl`. It is admin-only, rate-limited to 5/hour, `no-store`,
and only ever on an explicit button press. The key is never retained — "a
signing key that this app retains a copy of is a signing key with a second
home."

**Residual risk:** an admin session hijack, a malicious browser extension, or a
shoulder-surfed screen yields the signing key. Blast radius is every paired car
on the deployment.

**Recommendation:** accept for now, but (a) log every generation event to an
append-only audit trail — the `logServer` call records *that* one was minted,
which is right, so make sure that log is retained and reviewed; (b) document
the key-rotation procedure so a suspected exposure has a defined response;
(c) revisit once go-live is done and the button is no longer needed weekly.

### S-2 · MEDIUM · Subscription limits stubbed open (cost/abuse)

`src/lib/subscription.ts:66-79`

```ts
// TODO(live): re-enable per-tier limits before launch
export async function canUploadDocument(_userId: string) {
  return { allowed: true };
}
export async function canUploadVaultDocument(_userId: string) {
  return { allowed: true };
}
```

Every document upload triggers a Claude Vision call. Any registered free-tier
user can upload without limit, so the Anthropic bill is unbounded by a
self-service signup. `canAddVehicle` still enforces its limit, so this is
specifically the OCR path.

The routes are rate-limited, which caps the *rate* but not the *total*. This is
a denial-of-wallet exposure, not a data exposure.

**Recommendation:** restore the pre-`9715eb1` bodies before the first public
signup. `src/lib/roadmap.ts` already tracks this as a milestone and correctly
marks it "manual" — the stubs return the same shape as the real check, which is
exactly why config inspection cannot detect it.

### ~~S-3 · No second confirmation on remote unlock or remote start~~ — **WITHDRAWN, FALSE POSITIVE**

**This finding was wrong. The control already exists, and existed at audit time.**

`src/components/vehicle/CommandPanel.tsx:41` holds a `confirming` state and
renders a confirmation dialog at `:141-167`, keyed by command. The i18n keys
`commands.confirm.unlock.*` and `commands.confirm.remote_start.*` are present in
all five locales — and those are the **only** two commands with confirmation
keys, which is exactly the scope this finding recommended: the destructive pair
only, not every command.

Verified present at commit `e81141b`, the snapshot this audit was taken
against. It was not added later.

**Why it was missed:** the search pattern was
`confirm.*unlock|unlock.*confirm`, and the code builds its keys as
``t(`confirm.${confirming}.title`)`` — a template literal the regex could never
match. A grep that finds nothing is not evidence of absence, and this finding
was written as though it were.

`docs/LAUNCH-CHECKLIST.md` §4b lists this item as outstanding. That checklist
entry is **also stale** — like the disconnect flow and the command history in
the same section, it has shipped. All three of §4b's listed gaps are now closed.

### S-4 · MEDIUM · Broad OAuth scopes requested from every user

`src/lib/tesla/constants.ts` — all nine Tesla scopes, including `vehicle_cmds`.

A user who only wants cost tracking and trip planning still grants unlock and
remote-start authority. Least privilege says the command scopes should be
requested only when the user opts into commands.

`docs/LAUNCH-CHECKLIST.md` §4b already raises exactly this question: "evaluate
whether `vehicle_cmds` is worth requesting for accounts that only want costs
and routes — without it the unlock risk disappears entirely." That instinct is
correct and worth acting on.

**Recommendation:** split into a read-only pairing and a command-enabled
pairing. It reduces blast radius for the majority of users and is a selling
point in its own right.

### S-5 · MEDIUM · Encryption-key rotation has no procedure

`TESLA_TOKEN_ENCRYPTION_KEY` protects every stored refresh token. Tokens at
rest are encrypted, so a database-only leak is survivable — but a leak of the
database *plus* the key is full compromise of every linked car.

There is no documented rotation procedure and no re-encryption path. Rotating
the key today would silently invalidate every stored token with no migration.

**Recommendation:** write the procedure — dual-key read (try new, fall back to
old), bulk re-encrypt, retire old — and rehearse it once before customers
arrive. This is listed in the launch checklist and is still open.

### S-6 · LOW–MEDIUM · RLS on shared charger tables may be unapplied

`supabase/migrations/031_enable_rls_charger_tables.sql`

`docs/LAUNCH-CHECKLIST.md` states that without this migration the public anon
key grants read *and write* on `chargers`, `charger_connectors`,
`charger_sources`, `ingest_runs` and `exchange_rates` through PostgREST. That is
data integrity of the charger platform — the deepest subsystem in the app —
exposed to anyone holding a key that ships in the client bundle by design.

Whether it has since been applied **cannot be determined from the repository**;
migrations are applied by hand in the Supabase SQL editor and there is no
applied-state record in git.

**Recommendation:** verify in the Supabase dashboard today. More broadly, the
absence of a migration runner in CI means no one can answer "what is the
schema in production" from the repo. `/api/internal/debug/migrations` mitigates
but does not solve this.

### S-7 · LOW · In-memory rate-limit fallback is ineffective on serverless

`src/lib/rate-limit.ts:5-22`

When Upstash is unconfigured the limiter falls back to a per-process `Map` that
resets on every cold start. On Vercel that means it effectively does not limit.
The fallback is correctly commented as dev-only, and `docs/LAUNCH-CHECKLIST.md`
already marks Upstash as mandatory rather than optional.

**Recommendation:** make it loud — log a warning on boot when
`UPSTASH_REDIS_REST_URL` is absent in production. A silent fallback to
no-enforcement is the kind of thing that is discovered by an invoice.

### S-8 · INFO · Service-role key bypasses RLS everywhere

The app uses `createSupabaseAdminClient()` (service role) for essentially all
data access, which bypasses Row Level Security entirely. RLS is therefore a
backstop against *direct PostgREST access with the anon key*, not a protection
layer for the application itself.

This is a legitimate architecture — it is why every route must filter on
`user_id` in application code — but it means **application-layer ownership
checks are the only thing preventing cross-user data access.** The mechanical
sweep found `auth()` on every user route and `user_id` filters on the
vehicle-scoped ones, which is the right shape.

**Recommendation:** the per-route ownership checks deserve a dedicated review
pass reading each query individually; this pass verified their *presence*, not
their *correctness*. See the flagged list in `01-STATE-OF-THE-APP.md`.

---

## Not found (checked)

- No `any`, `@ts-ignore`, or `as any` anywhere in `src/` — no type-level escape hatches around auth logic.
- No secret accepted via query parameter.
- No hardcoded credential in source. The last one — a PEM public key — was removed today in `e81141b`.
- No unguarded route under `/api/internal/`.
- No token, key, or PEM material found in a `console.*` call on the paths reviewed.
- Open redirect on `callbackUrl` was fixed previously and the validation is in place.

---

## Priority order

1. **S-6** — verify migration 031 is applied. Five minutes, potentially wide exposure. *(Superseded in part by F6 in `07-DEEP-VERIFICATION.md`: 031's contents are correct, but the RPC layer bypasses it.)*
2. **S-2** — restore subscription limits. Blocks public signup safely.
3. **S-5** — write the key-rotation procedure. Needed before customers, not after.
4. **S-4** — split the OAuth scopes. Larger change; structural risk reduction.
5. **S-1** — revisit the keypair endpoint once go-live is complete.
6. **S-7** — boot-time warning when Upstash is missing.
7. **S-8** — dedicated per-route ownership review. *(Closed by Part 1 of `07-DEEP-VERIFICATION.md`.)*

~~S-3~~ — withdrawn, see above.
