# What to build next

*2026-08-12. Written against `main` at `5612a41`.*

Ordered by what blocks the most, not by effort. Each item says what breaks if it
is skipped, because "nice to have" and "the reason a customer leaves" look the
same on a list.

---

## Gate 1 — before a second person's car is linked

Everything here is a defect that only hurts once someone other than you is
using it. That is exactly why it is easy to keep postponing.

### 1. The signing proxy is an open relay (**T10**)

`tesla-proxy` takes no authentication at all. Anyone who finds the hostname and
holds a valid Tesla token for an account that has paired the app can have your
private key sign commands for their car — using your Fleet API quota and your
partner registration. `/proxy-public-key`, which I added for diagnosis, makes
the relay identifiable to a scanner.

**Do:** a shared secret header, checked in Caddy before `reverse_proxy`, set on
both the container and `TESLA_PROXY_SECRET` in Vercel. Roughly twenty lines.

**If skipped:** your partner account is the one Tesla suspends.

### 2. Rate limits are per-user; Tesla's quota is per partner account (**T6**)

`checkRateLimit(userId, …)` bounds one person. Tesla counts requests against the
whole app. `/state` allows 120/hour/user and the dashboard polls every 30 s, so
a single open tab sits permanently at its own ceiling — and ten users put the
app at ten times whatever Tesla allows.

**Do:** an app-wide bucket checked inside `fetchVehicleData`/`sendVehicleCommand`,
plus a short server-side Redis cache of `vehicle_data` per vehicle (20–30 s) so
several tabs and routes share one upstream call.

**If skipped:** Tesla throttles the app, and it looks like the app is broken for
everyone at once.

### 3. Commands fail when the car is asleep (**T3/T4**)

Your own logs show it: `vehicle_data 408 vehicle unavailable: vehicle is offline
or asleep`. A command sent to a sleeping car fails with no explanation and no
retry, and the 4 s single retry in `api.ts` is too short to ever succeed while
still paying the full cost of a wake.

**Do:** before a command, `GET /api/1/vehicles/{id}` (cheap, does not wake); if
not `online`, `wake_up` **direct, never through the proxy**, poll to online with
backoff (2/4/8/15 s), then send. A distinct `VEHICLE_ASLEEP` code with
driver-readable text when it never wakes.

**If skipped:** roughly half of all real-world command attempts fail, because
cars sleep most of the time.

---

## Gate 2 — before anyone pays

### 4. Cost Intelligence reports wrong money (**C1–C5**)

This is the flagship feature and its arithmetic is not trustworthy:

- `attribution.ts:23` filters `.is("network", null)` to find **home** charging.
  That selects *public* sessions. Migration 008 added `is_home_charge` for
  exactly this and nothing reads it.
- `processor.ts:189` attributes the **entire** household bill to the car when no
  session matches.
- `costs/route.ts:122` multiplies by the attribution fraction a second time,
  contradicting what `processor.ts:228` stored.
- The billing-period filter uses `.lte` on a date that parses as midnight UTC,
  dropping the period's last day.
- `estimateSoH` keys off the wrong VIN character, so Model 3 reports over 100 %
  state of health. It still has no test.

**Do:** decide the single meaning of `energy_costs.cost_ron` first — the audit
recommends storing the already-attributed amount — then fix all four together. A
migration will be needed to repair stored rows.

**If skipped:** the number the product exists to produce is wrong, and nobody
tells you; they just stop trusting it.

### 5. Stripe is not live

`config.stripe: false`. Nobody can buy anything.

### 6. Verification has no UI

`POST /api/account/verify-email` works and nothing calls it. You are exempt via
`ADMIN_EMAILS`, so a second user hits `403 EMAIL_NOT_VERIFIED` on document
recovery with no way to resolve it.

**Do:** one button in Settings, one banner when `email_verified_at` is null.

---

## Gate 3 — what actually differentiates the product

Everything above is table stakes. This is the part worth building.

### 7. Fleet Telemetry

The single highest-leverage thing left. The car pushes a stream to a receiver
you host, instead of being polled.

It unlocks, and **nothing else can**:

- **Real charging history.** `dx/charging/history` is 403 on personal accounts —
  business fleet only. Today `/charging` history is simulator data for a linked
  car. This is the feature you asked for and the only way to get it.
- **Real consumption** per trip, per season, per driving style.
- **Vampire drain.** Polling cannot measure it: every measurement wakes the car
  and adds to the drain being measured.
- **Battery health over time** from actual charge curves rather than a VIN
  lookup table.

**Cost:** a separate mTLS service on the same Coolify box as the proxy, plus a
`fleet_telemetry_config` call per vehicle. Comparable in size to the proxy work.

**Why it is the differentiator:** every Tesla app polls. Almost none stream,
because it needs infrastructure. It turns Flux from "a nicer Tesla app" into
something with data nobody else has.

### 8. Real-time stall availability

NDW already carries live `availabilities[]` for the Netherlands, free. Decide
whether to surface it before paying for a commercial feed elsewhere — one
country proves the UI is worth building.

---

## Refactors worth doing, and one worth not doing

**Worth it:**

- **`CommandArgs` typed per `CommandName`.** `args` is `Record<string, unknown>`
  from the button to the Tesla request body. That is how `limitPct` vs `percent`
  sent every live charge-limit change to the car as 80 % behind a success toast.
  `ARG_BOUNDS` and `command-args.test.ts` catch it at runtime now; a discriminated
  union would catch it at compile time. ~20 lines, and it converts a whole class
  of silent failure into a build error.
- **Extract the key-diagnosis verdict cascade** from `tesla-partner/route.ts`
  into `src/lib/tesla/key-diagnosis.ts`. It is a pure function of six nullable
  strings encoding a hard-won precedence order, it is the densest reasoning in
  the codebase, and it is the only part with no test. Reorder two branches and
  an operator is sent to rotate a key that was already correct.
- **`NavigateRow` should use `GeocodingSearch`.** It blind-picks
  `results[0]` and pushes it into a real car's navigation. The existing
  component has debounce, a result list and disambiguation.

**Not worth it:** merging `CommandPanel` and `AllCommands`. They share the
concept "button that sends a command" and essentially no implementation — one is
a 44px icon toggle row with framer-motion staggering, the other a labelled
capability-filtered grid. A component parameterised over both would take more
props than either has lines of JSX. The confirm dialog and the sensitive-command
set were the parts that genuinely duplicated, and both are already extracted.

---

## Still open from the audit

`F3` (inbox address derived from the vehicle PK, so it can never be rotated),
`F7`, `F9`, `S-5`–`S-8`, `B-2`, `T9`, `T11`, `T12`(scopes), `D-1`, `D-4`
(pruning `charging-networks/`). Full status in `09-REMEDIATION-REPORT.md`.

Four decisions are yours and I have deliberately not made them: **T2**
(rebinding the OAuth audience/region), **S-4** (splitting Tesla scopes into
read-only and command-enabled), **D-1** (retiring `/charging-map` in favour of
`/map`), **F3** (rotatable inbox tokens).

---

## Testing

346 tests, up from 267. Covered: command routing, error classification, argument
vocabulary, email verification tokens, confidence thresholds.

**Not covered at all:** `AllCommands`, the `useVehicle` idle state machine, map
fitting, the key-diagnosis cascade, and the entire cost pipeline — which is
§4 above and the least tested code carrying the most consequential arithmetic.
