# 08 — Remediation Prompt

*Hand the block below to a fresh agent. It is written to be self-contained.*

---

## The prompt

You are a senior engineer working on **Flux**, an EV management platform for
Tesla owners at `/home/user/flux` (Next.js 16 App Router, TypeScript strict,
Supabase Postgres, Auth.js v5, TanStack Query v5, next-intl, Tailwind v4).

An audit on 2026-08-09 found a set of security, correctness and reliability
defects. Your job is to **fix them, prove the fixes work, and leave the code
better tested than you found it.**

### Read first

1. `docs/2026-08-09-redocumentation/07-DEEP-VERIFICATION.md` — **the primary
   work order.** Every finding, with `file:line`, a concrete failing case, and
   a suggested fix. Findings are identified as F1–F9 (security), T1–T12
   (Tesla), C1–C5 + P2/P3 tables (correctness).
2. `docs/2026-08-09-redocumentation/04-SECURITY-REVIEW.md` — findings S-1…S-8.
3. `docs/2026-08-09-redocumentation/05-ISSUES-AND-TECH-DEBT.md` — findings
   B-1…B-2, D-1…D-4, C-1…C-5.
4. `CLAUDE.md` and `AGENTS.md` — the project's non-negotiable rules.
5. `CODEBASE_CONTEXT.md` — architecture, before touching anything structural.

### The audit is dated — main has moved since

The audit was taken against commit `e81141b`. Commits landed afterwards, and
the addendum at the end of `07-DEEP-VERIFICATION.md` records which findings that
changed: one was **withdrawn as a false positive** (S-3), one is **already
fixed** (`window_control` coordinates), and one is **partly fixed** (T4 — the
call sites were corrected, the root cause in `src/lib/tesla/api.ts:67` was not).

Assume more has moved since. **Check `git log` before you start**, and re-read
the addendum.

### Treat every finding as a hypothesis, not as fact

The audit verified each finding against the code at the time. Code moves.
**Before fixing anything, re-read the cited lines and confirm the defect is
still there and still means what the report says it means.** If a finding is
wrong, stale, or already fixed, say so explicitly in your report and move on —
that is a valuable result, not a failure. Do not "fix" something you could not
first reproduce or demonstrate.

### Non-negotiable rules (from the repo)

- `npm run typecheck` (`tsc --noEmit`) **must pass** before every commit.
- `npm run lint` **must pass** before every commit. CI fails on errors.
- `npm test` (vitest) **must pass** before every commit. 267 tests exist today;
  none may regress.
- **No `any`.** Use `unknown` plus type guards. The codebase currently has zero
  `any`/`as any`/`@ts-ignore` — keep it that way.
- **Every user-visible string** goes through `useTranslations` (client) or
  `getTranslations` (server), and new keys go into **all five** locale files at
  once: `en.json`, `ro.json`, `de.json`, `fr.json`, `hu.json` in
  `src/lib/i18n/locales/`. All five currently hold exactly 1019 keys with zero
  drift — keep them equal.
- **No comments unless the WHY is non-obvious.** This codebase's comments
  explain reasoning, not mechanics. Match that.
- **KISS.** Fix the bug; do not refactor the surrounding code. Three similar
  lines beat a premature helper. No feature flags, no backwards-compat shims.
- **Security rules:** every API route calls `auth()` and checks
  `session?.user?.id`; every query on user data filters
  `.eq("user_id", session.user.id)`; `getValidAccessToken(vehicleId, userId)`
  always receives `userId`; webhook secrets come from headers only and fail
  closed; rate limiting via `checkRateLimit` from `src/lib/rate-limit.ts`.
- **Document what you change** in `docs/FEATURES.md`, in the same commit as the
  change, per the rule in `CLAUDE.md`.
- Commit messages: `type(scope): short description` — `fix`, `feat`, `docs`,
  `refactor`. Never `--no-verify`, never force-push.
- Work on the branch you are given. Commit each wave separately so the history
  is reviewable; do not squash six unrelated fixes into one commit.

### Method — apply this to every single item

1. **Reproduce.** Write a failing test *first* where the defect is testable
   (all of C1–C5, most of the P2 table, T1's routing decision). For anything
   not unit-testable, write down the exact reasoning and evidence that shows
   the defect is real.
2. **Fix**, minimally.
3. **Prove.** The new test passes; the full suite still passes; typecheck and
   lint are clean.
4. **Record** one line in your final report: finding ID, what you did, how you
   proved it.

A fix without a test that would have caught the bug is not finished, unless you
explain why the defect cannot be tested.

---

## The work, in dependency order

Do the waves in order. **Stop after each wave**, run the full gate
(`typecheck` + `lint` + `test`), and commit.

### Wave 1 — Cross-tenant data (do this first; the items are coupled)

- **F4** — `src/app/api/auth/register/route.ts:39-43` sets `email_confirm: true`
  with no verification mail, so anyone can register an address they do not own.
  `src/app/api/documents/recover/route.ts:54-60` then gates document claiming on
  that address under a comment asserting it is "verified". Require a confirmed
  email before an address is honoured as identity. **At minimum**, gate
  `recover` on `email_confirmed_at`.
- **F1 + F2** — `src/app/api/documents/inbound-email/route.ts:146-163`. Delete
  `resolveVehicle` steps 2 (user email local-part) and 3 (sender email); there
  is no DKIM/SPF verification anywhere in the handler, and both identifiers are
  attacker-controlled. Unmatched mail already has a correct destination: the
  `FALLBACK_USER_ID` pool with `status: needs_review` and no OCR. Also delete
  the stale header comment at `:12` that still advertises the removed nickname
  step.

  **Order matters:** tightening this pushes more documents into the unmatched
  pool, which increases exposure to F4. Fix F4 first, in the same wave.
- **F5** — `src/app/api/push/subscribe/route.ts:46-56` upserts with
  `onConflict: "endpoint"`, so posting another user's endpoint rewrites that
  row's `user_id`. Use a composite conflict target and add the matching unique
  constraint in a new migration.

### Wave 2 — Cost Intelligence arithmetic (the flagship feature shows wrong money)

These four interact. Read C2, C3 and C4 together before changing any of them,
and decide the **single** meaning of `energy_costs.cost_ron` before you start —
the audit recommends storing the already-attributed amount.

- **C2** — `src/lib/costs/attribution.ts:23` filters `.is("network", null)`,
  which selects *public* charging. Migration `008` added `is_home_charge`
  explicitly for this and it is never read. Select home sessions properly, and
  make the writers actually set `network` / `is_home_charge` — including
  `src/lib/mock/engine.ts:249`, where `activeChargingSessionNetwork` is
  hard-coded `null` under a comment claiming persistence fills it, and
  `src/lib/mock/persistence.ts:158`, which does not.
- **C3** — `src/lib/costs/processor.ts:189-195` attributes the **entire**
  household bill to the car when no sessions match. Write zeros and mark the
  document `needs_review` instead.
- **C4** — `src/app/api/costs/route.ts:122-129` multiplies by the attribution
  fraction a second time, contradicting what `processor.ts:228` stored, while
  `seed-history.ts:300` and `documents/[documentId]/route.ts:107` write the full
  amount. Unify the meaning, delete the double multiplication, and make
  `totalCostRon`, `homeCostRon`, the monthly trend, and `savedRon` in
  `insights-client.tsx:66` all consistent with it.
- **Billing-period boundary** (P2 table) — `attribution.ts:25` uses `.lte` on a
  date that parses as midnight UTC, dropping the period's last day.
- **C1** — `src/lib/tesla/api.ts:357`: `RATED_RANGE_BY_VIN_MODEL` keys off a
  variant character. Cross-check against the repo's own
  `src/lib/brands/tesla/vin-decoder.ts` and fix the model keys. **`estimateSoH`
  has no test at all — add one**, including the Model 3 case that currently
  reports over 100%.
- **C5** — `src/lib/mock/engine.ts:103-121`: the `plugged-idle` charging
  sub-branch updates `batteryLevel` but not `batteryRangeKm` or
  `timeToFullMinutes`, so the commuter scenario's whole evening shows a stale
  range. Mirror what the `charging` case does.

A migration may be needed to repair already-stored `energy_costs` rows. **Write
it, do not run it** — see "What you must not do".

### Wave 3 — Live Tesla reliability

- **T3 + the `maxDuration` item in T9** — commands never wake the car, and the
  4 s single retry in `src/lib/tesla/api.ts:64-79` is too short to succeed while
  still paying the full cost of a wake. Before a command: `GET
  /api/1/vehicles/{id}` (cheap, does not wake); if not `online`, `wake_up`
  **direct, never through the proxy**, poll to online with backoff (2/4/8/15 s,
  ~30 s ceiling), then send. Return a distinct `VEHICLE_ASLEEP` code with
  driver-actionable text if it never wakes. Add `export const maxDuration = 60`
  to both `vehicles/[vehicleId]/commands/route.ts` and `.../state/route.ts`.
- **T4** — add a `wake` parameter to `fetchVehicleData`, **defaulting to
  false**. The polling path and the cron pass `false`: on 408, return the last
  snapshot with `isOnline: false` and let the UI offer an explicit "Wake"
  button. In `cron/poll-vehicles`, fetch `/api/1/vehicles` once per user (it
  returns `state` without waking) and skip anything not `online`.
- **T1 + T8** — introduce a per-command notion of signing. Add `signed?: false`
  to the command entry type; route
  `const apiBase = (proxyBase && entry.signed !== false) ? proxyBase : baseUrl(region)`,
  using the numeric id as the tag on the direct path. Mark `share_navigation`
  unsigned — the signing proxy has no `navigation_gps_request` and answers 400
  locally without ever reaching Tesla, so "send trip to car" cannot work today.
  While there, make the command path treat **403** as an auth error exactly as
  the data path at `api.ts:93` already does (`api.ts:339` checks only 401,
  under a comment claiming it uses the same reasoning).
- **T9 remainder** — surface 429 as a typed rate-limit error carrying
  `Retry-After`; parse command responses defensively (Tesla and the proxy both
  emit `{"response":null,"error":…}`, and `commands/route.ts:107` dereferences
  it unguarded); run the `notPaired`/`unsigned` string matching on
  `result.response.reason` when `result === false`, not only in the `catch`.
- **T5** — replace the in-memory single-flight map in
  `src/lib/tesla/tokens.ts:16-19` with a cross-instance lock. It is correct on
  one server and useless on serverless, where `/state`, `/commands` and the cron
  run in different lambdas and both refresh with the same rotating token.
  Upstash is already a dependency: a Redis `SET NX` with a ~15 s TTL and a
  re-read on contention is the smallest change.
- **T12 (scopes)** — persist `fresh.scope` on refresh in `tokens.ts:144-152`,
  and gate the live command path on the granted scopes with a distinct
  `SCOPE_MISSING` code.

**Add the missing test.** `src/lib/tesla/__tests__/` has one file, covering
`mapVehicleData` only. Write a table-driven test over `TESLA_COMMAND_MAP`
asserting `{url, tag, body}` per command, with and without
`TESLA_PROXY_BASE_URL`. That is the exact logic that broke in commit `f08b316`,
that T1 changes again, and that has never had a test.

### Wave 4 — Cheap, high-value hardening

- **B-1 / S-2** — `src/lib/subscription.ts:66-79`: `canUploadDocument` and
  `canUploadVaultDocument` are `TODO(live)` stubs returning `{allowed: true}`,
  so free-tier OCR is unlimited and the Anthropic bill is unbounded. Restore the
  real per-tier limits (`git show 9715eb1` has the previous bodies).
- **F6** — roughly 20 charger RPCs are `SECURITY DEFINER` with no `REVOKE`, so
  the anon key reaches them through PostgREST and bypasses the RLS that
  migration `031` added. Write a new migration applying the pattern already used
  in `037_debug_logs_and_migration_runner.sql:68-71` to every one of them.
- **F8** — `vehicles/[vehicleId]/vault/calendar/route.ts:43` selects `name` and
  `plate_number` from `vehicles`; neither column has ever existed, so the route
  returns 404 unconditionally and the ICS export has never worked. Use
  `display_name` and join `vehicle_doc_meta` for the plate. Then fix the two
  `.ics` defects in the P2 table: `DTEND` must be exclusive (`validUntil + 1
  day`) for an all-day event, and `toIcalDate` must slice to the first 10
  characters so an AI-extracted timestamp cannot corrupt the file.
- **Car documents can never reach `done`** (P2 table) —
  `src/lib/ai/document-parser.ts:193-197` pads energy-only fields with three
  hard-coded zeros, and `averageConfidence` averages all of them, so a perfect
  extraction scores 0.5 against a 0.7 threshold. Average only the keys the car
  schema reports.

### Wave 5 — Dead code (pure deletion, no behaviour change)

Verify each is still unreferenced before deleting.

- **T7** — delete `/api/tesla/command` and `/api/tesla/vehicle`. No callers.
  They are authenticated endpoints that spend Fleet API quota and drive a real
  car with weaker handling than the route actually in use (no `buildBody`
  mapping, no `recordCommandEvent`, no security alert, no 409 reauth handling).
- **D-2** — delete `/api/charging-map` and `/api/charging-stations`. No callers.
- **D-3** — delete `src/lib/currency/convert.ts`,
  `src/hooks/useVirtualKeyPair.ts`, `src/components/vehicles/VehicleIcon.tsx`.
  Then fix `CODEBASE_CONTEXT.md`, which documents `convertCurrency` /
  `convertCurrencySync` as live infrastructure.
- **D-4** — after the above, prune `src/lib/external/charging-networks/` to what
  `src/lib/external/routing/` still imports.
- **`src/lib/ai/prompts/document-triage.ts`** — the triage prompt is written and
  never imported. Either wire it into `src/lib/costs/processor.ts` as the
  fast first-pass classifier `docs/ROADMAP.md` describes, **or** delete it. Pick
  one and say which.
- Merge `src/components/vehicles/` into `src/components/vehicle/` — two
  directories one letter apart is a trap.

### Wave 6 — Improvements you may make (bounded)

Only after waves 1–5 are green. Keep each small and separately committed.

- **B-2** — charger viewport truncation is invisible to callers. Migration 044's
  own comment records this as unfixed: the response is a bare array with nowhere
  to report it. Wrap it (`{ chargers, truncated }`) and show a "zoom in for
  more" hint when truncated.
- **T6** — every rate limit is per-user, but **Tesla's quota and billing are
  per partner account**. `/state` allows 120/hour/user and the client polls at
  exactly 30 s, so one open dashboard sits permanently at its own cap. Add an
  app-wide bucket checked inside `fetchVehicleData`/`sendVehicleCommand`, and a
  short server-side Redis cache of `vehicle_data` per vehicle (20–30 s) so
  multiple tabs and routes share one upstream call.
- **T12 (argument validation)** — `commands/route.ts` accepts
  `z.record(z.string(), z.unknown())`, so `set_charge_limit` with `percent: 3`
  reaches the car. Add per-command zod schemas (percent 50–100, amps 0–48,
  temp 15–28).
- **P3 items** — clamp backfilled SoH to 100; make wind derating match its own
  comment (or delete the claim); stop counting skipped rows as `synced`; bucket
  alert dedup on elapsed time rather than the UTC clock hour.
- **C-5** — surface missing-but-important env keys (notably `TOMTOM_API_KEY`,
  whose absence silently costs about a third of charger coverage) as warnings in
  the `/debug` config panel, which already reports booleans for other
  integrations.

---

## What you must NOT do

- **Do not run database migrations.** Write them; leave them to be applied by
  hand in the Supabase SQL editor. There is no CI runner and no applied-state
  record in git. Say clearly in your report which migrations you added and in
  what order they must run.
- **Do not touch production configuration** — no Vercel env vars, no Fly.io, no
  Stripe, no Tesla developer portal. Where a fix needs one (for example the
  proxy's `-timeout 25s`, `min_machines_running = 1`, or the proxy shared
  secret in T10), write the code and config change and **flag it for a human**.
- **Do not make product or architecture decisions alone.** These need the
  owner and are explicitly out of scope: **T2** (rebinding the OAuth
  audience/region — it changes the live pairing flow and can break working
  cars), **S-4** (splitting the Tesla scopes into read-only and
  command-enabled), **D-1** (retiring `/charging-map` in favour of `/map`),
  **F3** (replacing derived vehicle email addresses with rotatable tokens),
  **S-1** (the keypair endpoint's accepted trade-off). Analyse them, propose an
  approach, and **stop**.
- **Do not refactor beyond the fix.** No renaming sweeps, no restructuring, no
  "while I was in here". The audit found this codebase unusually clean — zero
  `any`, clean lint, perfect i18n parity. Leave it that way.
- **Do not weaken a security control to make a test pass.**
- **Do not report something as fixed that you did not verify.** If you ran out
  of time or hit a blocker, say exactly where you stopped.

---

## When you are done

Run the full gate one final time: `npm run typecheck`, `npm run lint`,
`npm test`, and `npm run test:e2e` if it runs in your environment.

Then write **`docs/2026-08-09-redocumentation/09-REMEDIATION-REPORT.md`**
containing:

1. **A table of every finding ID** (F1–F9, T1–T12, C1–C5, S-1–S-8, B/D/C items)
   with status: `FIXED` / `PARTIALLY FIXED` / `NOT REPRODUCIBLE` /
   `DEFERRED — needs human` / `NOT DONE`, and one line of evidence each.
2. **Anything the audit got wrong.** Findings that were stale, already fixed, or
   simply incorrect. Be specific — this is as valuable as the fixes.
3. **Tests added**, with the count before and after, and which findings are now
   covered by a regression test.
4. **Migrations written**, in the order they must be applied, and what each
   repairs. Flag any that rewrite existing rows.
5. **Human action required** — the deferred decisions, the config changes, and
   anything needing production access, each with enough context to act on
   without re-reading the audit.
6. **Anything new you found** while working. You will be reading this code
   closely; the audit will have missed things.

Be honest and precise. A report saying "eleven fixed, three deferred, one was
wrong" is far more useful than one claiming everything is done.
