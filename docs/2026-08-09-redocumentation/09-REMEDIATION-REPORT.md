# 09 — Remediation Report

*Written 2026-08-10. Covers `898d058..HEAD` on `main`.*

Every finding below was re-verified against the code at HEAD before being
touched. Where the audit was wrong, or where a fix I shipped earlier turned out
to be wrong, it says so — that is the more useful half of this document.

---

## 1. Status by finding

### Security — deep pass (F)

| ID | Status | Evidence |
|---|---|---|
| **F1** | `FIXED` (f408593) | `resolveVehicle` step 2 (email local part) deleted with `findUserByEmailLocalPart`. |
| **F2** | `FIXED` (f408593) | Step 3 (`From` header) deleted with `findUserByEmail`. Stale header comment, which still advertised both plus a removed step 4, rewritten. |
| **F3** | `DEFERRED — needs human` | Real, confirmed at HEAD. The inbox address is derived from the vehicle PK (`vehicleId.slice(0,8)`), so it can never be rotated after disclosure. Needs a schema decision — see §4. |
| **F4** | `FIXED` (f408593), **not** as the audit proposed | See §2 — the audit's minimum fix was a no-op. |
| **F5** | `FIXED` (f408593) + migration `045` | Conflict target is `(user_id, endpoint)`; the global unique on `endpoint` is dropped. |
| **F6** | `FIXED` (f408593) + migration `047` | EXECUTE revoked schema-wide from `anon`/`authenticated`, plus `alter default privileges`. |
| **F8** | `FIXED` | The route selected `name`/`plate_number` from `vehicles`; neither column has ever existed, so it returned 404 for its whole life. Fixed with the two iCalendar defects (exclusive `DTEND`, date slicing) that would have surfaced the moment it worked. |
| F7, F9 | `NOT DONE` | Out of this pass. |

### Tesla (T)

| ID | Status | Evidence |
|---|---|---|
| **T1** | `FIXED` (55dfb2f) | `signed?: false` on `CommandEntry`; `share_navigation` bypasses the proxy. Verified against `pkg/proxy/command.go`: it has a case for `navigation_request` and none for the GPS variant, so the proxy answered `400 invalid_command` locally and "send to navigation" could never have worked. |
| **T7** | `FIXED` (55dfb2f) | `/api/tesla/command` and `/api/tesla/vehicle` deleted; both were unreferenced. |
| **T8** | `FIXED` (0cdfcf6), after I broke it | See §3. |
| **T5** | `FIXED` | Redis `SET NX` (15 s TTL) fronts the in-process map; a loser waits for the fresher row rather than refreshing with a token Tesla has already rotated. Best-effort both ways — no Redis means the old behaviour, and a timed-out waiter refreshes anyway. |
| **T12** (argument validation half) | `FIXED` | `ARG_BOUNDS` in the commands route; percent 50–100, amps 0–48, temp 15–28, schedule minutes 0–1439, nav lat/lng. |
| T3, T4, T6, T9, T11, T12 (scopes half) | `NOT DONE` | T6 (per-user rate limits against a per-partner-account quota) is the one that will bite first in production. |
| **T2** | `DEFERRED — needs human` | Changes the live pairing flow; can break working cars. |
| **T10** | `DEFERRED — needs human` | The signing proxy takes no authentication. Raised in priority: `/proxy-public-key`, which I added for diagnosis, makes the relay self-identifying to a scanner. I did **not** hide it behind a secret header — that is obscurity sold as a control. Fix the relay. |

### Correctness (C)

| ID | Status |
|---|---|
| **Car documents can never reach `done`** (P2) | `FIXED` — the parser padded three absent confidences with zeros, so a perfect extraction scored 0.5 against a 0.7 threshold. Compounded with F8: the calendar reads only `done` documents. |
| C1–C5, rest of P2, P3 | `NOT DONE` — the verification agent for this group hit the session limit before reporting. C2/C3/C4 must still be read together and given one meaning for `energy_costs.cost_ron` before anything is changed. |

Two correctness defects **not** in the audit were found and fixed — see §3.

### Security review (S) and debt (B/D/C)

| ID | Status |
|---|---|
| **S-2 / B-1** | `FIXED` (f408593) — free-tier limits restored. |
| **S-3** | `WITHDRAWN` by the audit itself (54c0beb). |
| **D-2, D-3** | `FIXED` (55dfb2f). |
| **D-4** | `PARTIALLY FIXED` — `components/vehicles/` merged away; pruning `src/lib/external/charging-networks/` remains. |
| S-1, S-4, D-1 | `DEFERRED — needs human`. |
| S-5–S-8, B-2, C-1–C-5 | `NOT DONE`. |

---

## 2. Where the audit was wrong

**F4's "minimum fix" was a no-op.** The remediation prompt said: *"At minimum,
gate `recover` on `email_confirmed_at`."* That column is set for every account
at registration — `createUser({ email_confirm: true })`, because
`signInWithPassword` refuses an unconfirmed address and there is no SMTP behind
it. Gating on it would have passed review, shipped, and protected nothing.

The address had to be verified by something we control. `POST
/api/account/verify-email` mails a signed link through Resend (already a
dependency); `profiles.email_verified_at` records the click; `recover` returns
`403 EMAIL_NOT_VERIFIED` until then. The token is a stateless HMAC over
`userId:email:expiry` on `NEXTAUTH_SECRET`, and the **address is inside the
signed payload** so a token issued for an old address cannot verify a new one.

**S-2's pointer to the previous implementation was wrong.** The prompt said
`git show 9715eb1` has the old bodies. It has the same stubs. The real
implementations are in `32ac1aa` — and restoring them verbatim would have
introduced a bug, because their `CAR_DOC_TYPES` had six entries where the rest
of the app has nineteen. Thirteen vehicle-document types would have been billed
to the energy quota. The list is now one module.

**`window_control` was recorded as "already fixed". It was my mistake, twice.**
The addendum accepted my claim that hardcoded `0,0` coordinates broke
`close_windows`. Reading `pkg/proxy/command.go`: the proxy ignores `lat`/`lon`
entirely and calls `CloseWindows` directly, under an upstream comment saying
coordinates are not required on this protocol. So `0,0` was never the cause, and
no such failure was ever observed. Worse, my "fix" passed the car's own position
from `args`, which is caller-controlled — turning Tesla's proximity interlock
into a field the client fills in. Reverted to constant `0,0` in `0cdfcf6`.

---

## 3. Found while working — not in the audit

- **Every live charge-limit change reached the car as 80 %.** `/charging` sent
  `{limitPct}`; `TESLA_COMMAND_MAP` read `percent ?? 80`. The `??` swallowed it
  behind a success toast. The mock engine also read `limitPct`, so the
  simulator, the UI and the unit test agreed with each other and were wrong
  about the car. Fixed in `0cdfcf6`; `command-args.test.ts` now pins the Tesla
  body builder and the mock engine to the same key.
- **403 as an auth error shadowed the VCP diagnosis** — my regression from
  `55dfb2f`. Tesla answers 403 both for a missing scope and for
  `Vehicle Command Protocol required`, and the route checks `instanceof
  TeslaAuthError` before it string-matches, so an operator who had not deployed
  the proxy was told to re-authorise Tesla. Classified by body now.
- **"Let it sleep" survived ten minutes**, then auto-resumed on the next tap:
  `armIdleTimer()` ran unconditionally in an effect keyed on `active`. And
  `refetchInterval` is scheduled **per observer**, so three hooks mounting their
  own `useVehicle` on the same key polled straight through the pause button.
- **The command grid could not answer "did that work"** — opposing commands side
  by side, identical before and after. `precondition_max` had no off control at
  all, so max defrost could be started and never stopped.
- **The `.well-known` key came from a PEM hardcoded in source since June**,
  reached by a rewrite in `next.config.ts`, while every rotation went into
  `TESLA_PUBLIC_KEY` — which nothing read. A route that *did* read the variable
  existed and was never deployed: `.gitignore`'s `*.pem` matches the directory
  name, so git ignored it while it compiled locally. This is what blocked live
  commands.

---

## 4. Needs you

1. **Apply migrations, in this order.** None have been run.
   - `045_push_subscription_ownership.sql` — de-duplicates then re-keys the
     unique index. Deletes rows only where `(user_id, endpoint)` collides, which
     the old constraint made impossible; safe to run twice.
   - `046_email_verification.sql` — adds a nullable column. No data change.
   - `047_revoke_function_execute_from_anon.sql` — **read the header before
     running.** Safe today because nothing uses the `anon`/`authenticated`
     roles. If you ever want a browser-callable RPC it will need an explicit
     grant afterwards.
2. **Set `RESEND_API_KEY` and `RESEND_FROM`**, or verification mail silently
   no-ops (`sendEmailToUser` returns early) and `recover` stays closed to
   everyone. That is fail-closed, which is the right default, but it is not
   obvious from the outside.
3. **T10 — authenticate the signing proxy.** It is an open relay: anyone holding
   a valid Tesla token for an account that paired the app can have it sign
   commands. Before real customers.
4. **Decisions I did not make for you:** T2 (rebinding OAuth audience/region),
   S-4 (splitting Tesla scopes), D-1 (retiring `/charging-map`), F3 (rotatable
   inbox tokens), S-1 (the keypair endpoint's accepted trade-off).

---

## 5. Tests

**267 → 346.** New files:

| File | Covers |
|---|---|
| `src/lib/costs/__tests__/confidence.test.ts` (5) | The review threshold, keeping the old zero-padded shape as a case so it cannot return. |
| `src/lib/tesla/__tests__/command-routing.test.ts` (52) | URL, vehicle tag and body for every command, with and without a proxy. The decision that broke twice with nothing to catch it. |
| `src/lib/tesla/__tests__/command-errors.test.ts` (6) | 401 vs 403-scope vs 403-VCP vs proxy-not-paired vs unreachable, **and** the route's branch order — the defect lived in the interaction. |
| `src/lib/brands/__tests__/command-args.test.ts` (5) | The Tesla body builder and the mock engine respond to the same argument key. |
| `src/lib/__tests__/email-verification.test.ts` (11) | Tampered payload, wrong secret, expiry, normalisation, odd addresses. |

Two of these were verified to **fail without their fix** by reverting the fix
and re-running.

Also unified while in there: three hand-written `hh:mm` → minutes conversions
with three different fallbacks (`src/lib/time.ts`), and `CAR_DOC_TYPES`.

Still untested: `AllCommands`, the `useVehicle` idle state machine, map fitting,
and the key-diagnosis verdict cascade in `tesla-partner` — which is the densest
reasoning in the codebase and a pure function of six nullable strings, so it is
the cheapest of the four to cover.

---

## 6. Method note

Four review agents (security, architecture, design, correctness) ran over the
day's diff, then a nine-agent workflow re-verified the audit against HEAD; six of
those nine died on the session limit, so C, B/D and all four fresh sweeps are
unreported. Every finding acted on was re-read in the current code first, and
the reviewers were instructed that a confidently-reported false positive costs
more than a miss. Two of my own claims were withdrawn that way.
