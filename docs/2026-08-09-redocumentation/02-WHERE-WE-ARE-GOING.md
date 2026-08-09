# 02 — Where We Are Going

*What is in flight, what is next, what is parked. Consolidated 2026-08-09.*

---

## Four roadmaps, one project

Flux currently keeps its plan in four places that disagree with each other:

| Source | Dated | Character |
|---|---|---|
| `src/lib/roadmap.ts` | live code | 5 milestones, **machine-checked** against the running deployment, rendered in `/debug` |
| `docs/LAUNCH-CHECKLIST.md` | 2026-07-05 | Operational go-live steps, in execution order, in Romanian |
| `docs/ROADMAP.md` | 2026-06-23 | Product roadmap — **the most out of date** |
| `docs/TODO.md` | ~2026-08 | 433-line backlog with reasoning per item |
| `CHANGELOG.md` | 2026-05-25 | Its "Road Map" table is 2.5 months stale and contradicts all of the above |

**`src/lib/roadmap.ts` is the one to trust.** It is the only source that cannot
quietly go stale, because each milestone carries a `check()` that resolves
against real deployment config. Its own comment says so, and it is right.

Recommendation: make `roadmap.ts` authoritative, reduce `docs/ROADMAP.md` to
long-form vision, delete the `CHANGELOG.md` roadmap table.

---

## Now — in flight

### 1. Tesla live, end to end

**This is the active work and has been for 40 commits.** The trajectory in the
log is unmistakable: `a69e261` (unpaired car offered no pairing link) →
`f08b316` (commands addressed the car by Fleet API id, which the proxy refuses)
→ `7f8dd87` (measure all four keys, ask Tesla whether the car is paired) →
`e81141b` today (serve the published key from `TESLA_PUBLIC_KEY`, not a
hardcoded PEM).

That last one is the root cause of the whole campaign, and it is worth
recording properly because the failure mode was so well hidden. Two independent
traps concealed the same fact:

1. A `next.config.ts` rewrite — not a route file — serves
   `/.well-known/appspecific/com.tesla.3p.public-key.pem`. A second
   implementation was written at the literal path and would never have run,
   because the rewrite takes precedence.
2. That second file was never in git at all: `.gitignore` has `*.pem`, the
   directory name ends in `.pem`, so git silently ignored the entire tree while
   `git status` stayed clean.

Meanwhile every key rotation went into an environment variable that nothing
read, and the domain kept publishing a hardcoded key from June. Signed commands
were rejected for two months, and the mismatch was misdiagnosed as a pairing
fault, a stale CDN copy, and a wrong proxy key before anyone read
`next.config.ts`.

The lesson is generalisable and belongs in the permanent docs: **a value that
can only be rotated by editing source is invisible to every operator control
there is.** The fix — read from env, serve `no-store`, fail loudly with 503 on
missing or malformed input — is the right shape.

**Next step (from `roadmap.ts`):** register the partner account on the EU host
(there is a button in the `/debug` "Go live" panel), then confirm the proxy
signs commands end to end.

### 2. Charger data good enough to plan a real trip

**Next step:** re-import France with the per-plug grouping fixed, then run
dedupe until it reports 0. Needs `TOMTOM_API_KEY` and `OPEN_CHARGE_MAP_API_KEY`
set — without TomTom the connector returns empty *silently* and roughly a third
of station coverage plus all per-connector power data disappears.

---

## Next — before the first paying customer

These are ordered by what blocks money, and all four are small.

| # | Item | Where | Why it blocks |
|---|---|---|---|
| 1 | **Re-enable subscription limits** | `src/lib/subscription.ts:66-79` | `canUploadDocument` and `canUploadVaultDocument` return `{allowed:true}` unconditionally. Every OCR call costs Anthropic money, and the free tier is currently unlimited. Restore the pre-`9715eb1` bodies. |
| 2 | **Stripe live keys + price IDs** | Vercel env | Cannot take payment. Migration 013 already exists. |
| 3 | **Upstash Redis** | Vercel env | Not optional. Without it rate limiting falls back to per-instance memory that resets on every cold start, *every* map read re-runs full ingest, and the warm cron never reaches countries at the tail of the list. |
| 4 | **Apply the four pending migrations** | Supabase SQL editor | `031` is a security fix (RLS on shared charger tables); without `032` saved routes 500 in production. |

---

## Then — the strategic bet

### Fleet Telemetry

`docs/TESLA-API-CAPABILITIES.md` §2 makes the strongest architectural argument
in the repository, and it should be treated as the north star.

`vehicle_data` is a **live call to the car**. Tesla says plainly that regular
polling is not recommended, and Flux has already felt why — an open dashboard
kept a car awake, which is what the idle-pause logic in
`src/hooks/useVehicle.ts` exists to stop.

Fleet Telemetry inverts the relationship: the car **pushes** to us, up to every
500 ms, over a connection it already holds. No wake-ups, no quota burn, roughly
ten times the signals.

The catch is decisive: **this cannot run on Vercel.** Telemetry is a long-lived
push connection to a host with a fixed address; serverless has neither the
lifetime nor the address. It belongs on the self-hosted box next to
`tesla-proxy` — which retroactively becomes the strongest argument for having
set that box up. The prerequisites are already satisfied by getting commands
working: registered partner domain, served public key, public TLS host.

This is the difference between an app that *polls a car* and a platform that
*receives a car's telemetry*. Everything ambitious in the feature catalogue —
proper state-of-health, consumption decomposition, real trip analytics — is
downstream of it.

### Real tariffs beyond Tibber

Only Tibber is a real provider. Octopus, aWATTar, and all four Romanian
providers (Electrica, E.ON, Enel, Hidroelectrica) are mock price curves.
Romanian tariffs are the named market wedge in `docs/MARKETING.md`, so shipping
them mock while marketing them as a differentiator is the one place where the
positioning is currently ahead of the product. Fix the product, not the copy.

### Real-time stall availability

NDW carries live `availabilities[]` for the Netherlands. The open question from
`roadmap.ts` is whether to surface one country's live data before buying a
commercial feed for the rest. Partial live availability is arguably worse than
none if users cannot tell which is which — though this app has an unusually
good answer to that problem already, in `/about-data`.

---

## Parked, with reasons

| Item | Why parked |
|---|---|
| Non-Tesla brands (BMW, Polestar, Mercedes-EQ, VW, Hyundai/Kia, Renault) | Full mock implementations exist on `demo-brands-archive`. Each needs a real OEM API partnership. Correctly deferred. |
| Charging history sync | In-tree, but `dx/charging/history` returns **403 on personal Tesla accounts** — business fleet only. Not a bug; a platform limitation. |
| SoH for live Tesla | Returns `null`. Honest. Real SoH needs telemetry. |
| PDF cost export | CSV ships at `/api/costs/export`. |
| Home-screen widget | Needs a native wrapper or web push. Listed twice in `docs/ROADMAP.md`. |
| Document triage pre-pass | The prompt is written (`src/lib/ai/prompts/document-triage.ts`) and never imported. Either wire it in or delete it — see issue D-3. |
| Notifications | Complete but dark behind `NEXT_PUBLIC_NOTIFICATIONS_ENABLED`. Needs `CRON_SECRET` and the poll cron. |

---

## Three checklist items that are already done

`docs/LAUNCH-CHECKLIST.md` §4b lists these as missing. They are not — the
checklist has fallen behind the code:

- ~~"Disconnect from the app that revokes access and deletes tokens (does not exist today)"~~ — it exists: `src/components/settings/TeslaConnectionCard.tsx:30` → `DELETE /api/tesla/connection`.
- ~~"Command history visible to the user (`command_events` is written but displayed nowhere)"~~ — it is displayed: `src/components/vehicle/CommandHistory.tsx` → `/api/vehicles/[vehicleId]/command-history`.
- ~~"Playwright smoke tests — suite exists, CI gate not enforced"~~ — partially: the suite exists in `e2e/`; the CI gate genuinely is still unenforced.

**Still genuinely open from that section, and important:** extra confirmation
before remote unlock and remote start (searched for; not found anywhere in
`src/components` or `src/app`), a rotation procedure for
`TESLA_TOKEN_ENCRYPTION_KEY`, and the question of whether `vehicle_cmds` scope
should be requested at all for users who only want costs and routes.
