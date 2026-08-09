# 03 — What We Do Better Than The Others

*The differentiation document, located and stress-tested. 2026-08-09.*

---

## Where it lives

The document you remembered is **`docs/MARKETING.md` §4 "Competitive
landscape"** (lines 43–66), with supporting material in:

- `docs/MARKETING.md` §3 (value propositions) and §6 (messaging framework)
- `docs/USER-RESEARCH-2026-06-11.md` — 25+ persona test sessions across five
  waves, which is where the claims were actually pressure-tested against users
- `docs/TESLA-API-CAPABILITIES.md` §4 — the feature catalogue, graded for
  feasibility, which is the honest counterweight to the marketing claims
- `docs/superpowers/specs/2026-05-31-trip-planner-abrp-design.md` — the direct
  ABRP comparison

It is not one file, and that is part of the problem: the positioning thesis is
spread across a marketing doc, a research doc, and a capability doc, and only
the third of those is currently accurate.

---

## The thesis, as written

### Per-feature comparison (`MARKETING.md` §4)

| Feature | Main alternatives | Claimed Flux difference |
|---|---|---|
| Vehicle dashboard | Tesla official app | Cleaner mobile UX; cost intelligence built in; works offline (PWA) |
| Trip planning | ABRP | Integrated with cost tracking; no separate app; sends to Tesla |
| Charging map | PlugShare, Chargemap, AmpWhere | PostGIS-backed deduped data from 5 open sources; power labels visible at a glance |
| Cost tracking | Manual spreadsheet, Fuelchief | AI OCR from photo or forwarded email; no manual entry |
| Smart charging | Tibber app, Tesla scheduled charging | Provider-agnostic; Romanian tariff providers included |

### The four stated differentiators

1. **All-in-one, premium experience.** Every competing tool solves one problem;
   Flux solves five in a single installable PWA. The UX is deliberately minimal
   — "numbers float on the screen, not inside card-inside-card-inside-modal
   bureaucracy."
2. **Romanian-first, then Europe.** No competitor targets Romanian EV owners
   natively, in Romanian, with Romanian energy providers built in. This is
   named as the wedge.
3. **Zero-friction entry.** ABRP asks for an account and a car before showing
   anything useful. Flux shows a working dashboard, a planned route across
   Europe, and a sample cost report before you type your email.
4. **Honest about what it is.** PWA-first, not native. Tesla-only for now.
   Charger data from open sources that may lag on availability. Said plainly
   rather than buried.

---

## Stress test: does the code back the claims?

This is the part worth having. Each claim graded against what is actually in
the repository.

| Claim | Verdict | Evidence |
|---|---|---|
| **Zero-friction demo** | ✅ **Real, and undersold** | The simulator is not a screenshot. `src/lib/mock/engine.ts` drains on driving physics, charges on real AC/DC rate curves, climate costs kWh, and commands mutate persistent state. Sessions and trips accumulate from motion-state transitions, so history pages fill with real derived data. This is a Tier-3 simulator being marketed as a demo mode. |
| **Cost intelligence via OCR** | ✅ **Real** | `src/lib/costs/` + `src/lib/ai/`. Three ingest paths — upload, forwarded email (Cloudmailin), WhatsApp (Twilio). Home bills are attributed proportionally using actual charging history; public receipts are matched to the nearest session. Nobody else in the comparison set does this. |
| **Charger map from 5 deduped sources** | ✅ **Real, and the deepest subsystem** | `src/lib/chargers/` — OCM + OSM + TomTom + BNetzA/NDW/IRVE/Austria, PostGIS-backed, with six separate dedupe migrations (021, 034, 038, 039, 041, 043). This is genuinely hard and genuinely done. |
| **Trip planning integrated with costs** | ✅ **Real** | `src/lib/external/routing/` — OSRM/ORS/TomTom multi-strategy with Open-Meteo weather derating. Saved routes, share, send-to-car. |
| **Preconditioning for non-Tesla chargers** | ⚠️ **Real but hedged** | `src/lib/trip/precondition.ts` exists and the marketing copy already carries the caveat: Tesla firmware makes the final timing call. The hedge is correct and should stay. |
| **Romanian tariff providers built in** | ❌ **Not yet true** | Only Tibber is a real provider. Electrica, E.ON, Enel and Hidroelectrica are **mock price curves** (`src/lib/external/tariffs/providers/`). This is the named wedge and it is the one claim the product does not support. |
| **Five languages** | ✅ **Verified** | 1019 keys in each of en/ro/de/fr/hu, zero drift. Measured programmatically. |
| **Works offline (PWA)** | ⚠️ **Unverified** | `src/lib/pwa/` exists; actual offline capability was not tested in this pass. |
| **"Honest about what it is"** | ✅ **Structurally enforced** | `/about-data` is a whole screen explaining per-data-type what is live and what is simulated, plus `MockChip` badges per vehicle. Most products make this claim in a footer. This one built a page for it and gates the UI on it. |

**Score: five solid, two hedged, one false, one untested.** That is a strong
position — but the false one is the wedge.

---

## The differentiator the marketing doc misses

Reading the code rather than the copy, the sharpest advantage over
TeslaMate / Teslascope / Tessie is not in `MARKETING.md` at all:

### Flux is careful with the car

The classic third-party Tesla app failure mode is **battery drain from
polling**. Every `vehicle_data` call is a live call to the car, and a naive
integration keeps it awake. Users notice, blame the app, and uninstall.

Flux has already hit this and engineered against it:

- `src/hooks/useVehicle.ts:92-103` — polling stops entirely when the tab is
  idle, and **stops permanently on the first error** rather than retrying every
  30 s forever. The reasoning is in the code: "A car we cannot reach is asleep,
  out of signal, or unlinked — none of which a timer fixes, and each attempt
  still tries to wake it."
- Recovery is an explicit Retry button, so resuming is a decision rather than
  something that happens silently in the background.
- `refetchIntervalInBackground: false` on document polling.
- The vehicle poll cron runs **once daily at 06:00** (`vercel.json`), not
  continuously.
- The whole Fleet Telemetry argument in `docs/TESLA-API-CAPABILITIES.md` §2 is
  motivated by getting off polling entirely.

**"Flux will not flatten your battery"** is a concrete, defensible, checkable
claim against a real and widely-felt competitor weakness. It is worth putting
in the marketing doc, and it is worth keeping true.

### And a second one: the cost of honesty is already paid

`/about-data`, the `MockChip`, the capability-gate system that hides features a
brand cannot support rather than showing dead buttons, and a Tesla capability
doc that **grades its own features for feasibility and has a section titled
"Not feasible as described"** — this is a product that has built machinery for
telling users the truth. That machinery is a moat in a category where
competitors routinely promise what the Tesla API cannot deliver.

---

## What to do with this

1. **Fix the wedge or move it.** Either ship real Romanian tariff providers or
   stop leading with them. Right now the strongest market claim is the weakest
   product claim.
2. **Promote battery-safety to a headline differentiator.** It is real,
   verifiable, and aimed squarely at the competition's soft spot.
3. **Consolidate.** The thesis currently lives in three documents with different
   accuracy levels. Merge §3, §4 and §6 of `MARKETING.md` with the graded
   catalogue from `TESLA-API-CAPABILITIES.md` §4 into one `POSITIONING.md`, and
   put a date on it.
4. **Keep the hedges.** The preconditioning caveat and the charger-data caveat
   are assets, not weaknesses. They are why the fourth differentiator —
   honesty — is credible at all.
