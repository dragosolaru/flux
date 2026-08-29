# What Flux does, what can break it, and what would tell you

The inventory a monitoring strategy has to be built on. `docs/FEATURES.md` says
what the app does for a driver; this says what it does to stay alive, what it
depends on to do that, and — for each thing — **what signal would tell you it
has stopped**, which is the part that decides what is worth watching.

One rule runs through all of it, learned the expensive way and recorded in five
places in this repo: **a claim that outlives its truth is worse than no claim.**
A monitor that cries wolf trains you to scroll past the one real failure. Every
threshold below is chosen so that firing means something.

---

## 1. What runs on a clock

Two scheduled jobs, in `vercel.json`. That is the entire background workload —
everything else happens because a person opened a screen.

| Job | When | What it does | Broken looks like |
| --- | --- | --- | --- |
| `/api/internal/warm?country=…` | 03:00 daily | Refreshes charger data for twelve countries | `ingest_runs` stops gaining rows; `chargers.total` flat for days |
| `/api/cron/poll-vehicles` | 06:00 daily | One reading per linked car, to keep history continuous | `vehicle_snapshots` has a gap; `teslaCalls.read` shows 0 at hour 06 |

Both are guarded by `CRON_SECRET`. **A missing secret does not fail loudly** —
it makes the endpoint refuse Vercel, and the symptom is silence. That is the
first thing to check when data simply stops.

---

## 2. What the app depends on, and what dies with each

Grouped by what you lose, because "is it up" is not a useful question — "what
stops working" is.

### The car cannot be reached at all
- **`auth.tesla.com`** — OAuth and token refresh. Dies → nobody can link a car,
  and existing links expire within hours.
- **`fleet-api.prd.{eu,na,cn}...tesla.com`** — every read and every command.
- **`TESLA_PROXY_BASE_URL`** — the signing proxy. Dies → every command on a
  post-2021 car returns 412 `VCP_REQUIRED`; **reads keep working**, which is why
  this failure reads as "commands are broken" rather than "Tesla is down".

Watch: `debug_logs` scope `vehicles/commands`, and `teslaCalls.command` going to
zero on a day the app was used. A command count of zero is only meaningful
against evidence someone tried.

### The map goes blank or stale
- **CARTO basemap tiles** — currently **unkeyed and watermarked**; see §6.
- **Supabase + PostGIS** — every charger query. Dies → everything dies.
- **OSRM demo server** (`router.project-osrm.org`) — the road drawn to a
  selected station. A public demo host with no SLA, used unkeyed.
  Dies → the route line vanishes; the rest of the map is fine.
- **OpenRouteService** — the trip planner's router, keyed.

### Charger data goes stale
Nine connectors in `src/lib/chargers/ingest/`. They fail **independently and
silently** — a dead connector means a country slowly rots while every screen
keeps working, which is the hardest failure mode here to notice.

| Connector | Source | Status as of Aug 2026 |
| --- | --- | --- |
| `bulk`, `ocm` | OpenChargeMap | working, keyed |
| `tomtom` | TomTom | working, keyed |
| `overpass` | OSM, three mirrors | working |
| `irve` | data.gouv.fr | working; had a CSV-parsed-as-JSON failure in early Aug |
| `ndw` | Dutch road authority | **fixed Aug 29** — see below |
| `austria` | Burgenland GIS | **off**: endpoint gone, `AUSTRIA_URL` unset |
| `bnetza` | German regulator | 404s in early Aug; endpoint likely moved |
| `chargeprice` | Chargeprice | pricing only |

Two of these were logging errors for three weeks before anyone read them, and
both are worth knowing as failure *shapes* rather than as incidents:

- **`austria`** — the URL defaults to empty because the endpoint went away.
  One code path checked that and the other did not, so every corridor ingest
  called `fetch("?geometry=…")` with no base and logged `Failed to parse URL`.
  **An outage that reported itself as a parser bug.**
- **`ndw`** — the endpoint rejects any bbox much larger than a province. There
  was a geographic gate, and it tested *overlap*: a corridor tile spanning
  6,43 → 22,53 clips the Dutch border by a corner while being sixteen degrees
  wide, so it passed the gate and was rejected by the API. **A gate that was
  necessary and not sufficient.** Now clipped to the country and swept.

### Documents stop being read
- **Anthropic API** — OCR for invoices. Dies → uploads succeed and never parse.

### Nobody can be told anything
- **Resend** (email), **Twilio** (WhatsApp), **web push**. All optional; email
  verification is blocked without `RESEND_API_KEY`, and that blocks document
  recovery for any user who is not in `ADMIN_EMAILS`.

### Everything gets slower and more expensive
- **Redis / Vercel KV** — rate limits, tile freshness, the Tesla call log.
  Dies → rate limiting degrades open (deliberate), `/debug` loses its counters,
  and tile freshness is forgotten so ingest re-fetches everything.

---

## 3. The three budgets

Not uptime. These are the numbers that get you throttled or billed, and none of
them is visible without looking.

**Tesla `vehicle_data`: reportedly a few hundred reads per vehicle per day.**
The whole polling policy exists for this (`pollInterval()`, FEATURES §25). The
dashboard polls at 30s with a ten-minute idle cut-off — about twenty reads per
visit. Fifteen visits is the day's budget.
→ **Nothing enforces a ceiling.** `/debug` counts; nothing stops. This is the
most likely way the app breaks for a second user, and it is on the roadmap as
T6.

**Tesla counts per partner account, not per user.** One driver at their limit is
fine; ten drivers is ten times what Tesla allows, and it throttles everyone at
once.

**Waking the car.** A wake costs far more than a read — not in quota but in
battery, roughly ten times the idle drain. `teslaCalls.wake` should be **zero**
on a day nobody pressed the button. It is the cleanest single number in the
system: any non-zero value without a deliberate tap is a bug with a timestamp.

---

## 4. What monitoring should actually watch

In order of what would hurt most, and each with the reason the obvious version
of it is wrong.

1. **Wakes per day.** Expect 0. Non-zero without a tap means something reads a
   sleeping car. *Not* "wake rate" — the number is small enough that any of them
   is worth a look.
2. **Commands attempted vs commands refused, last 24h.** Refusals alone are
   noise: a `key-not-paired` from three days ago warned for weeks while eighteen
   commands a day reached the car. The **ratio, in a window** is the signal.
3. **Charger rows per source, week over week.** A connector that dies produces
   no error at all after the first day — it produces a number that stops moving.
   Watch the derivative, not the value.
4. **Reads per vehicle per day, against the cap.** Alert at 60%, not at 100%:
   at 100% it has already failed.
5. **Ingest run recency.** `ingest_runs.finished_at` older than 48h means the
   cron is not running, which is usually `CRON_SECRET` and never announces
   itself.
6. **OCR failures as a share of uploads.** A dead Anthropic key looks exactly
   like a run of unreadable invoices until you divide.

Deliberately **not** worth alerting on: individual connector errors (they are
expected and self-healing), Overpass timeouts (three mirrors, it retries), and
anything from the simulator.

---

## 5. Where the evidence already is

Everything above is observable today; none of it is aggregated.

- **`debug_logs`** — server-side errors, 500-row rolling window, pruned
  opportunistically. Scope-prefixed (`vehicles/…`, `tesla/…`, connector ids).
- **`ingest_runs`** — one row per source run with fetched/upserted counts.
- **`teslaCalls`** (Redis, hourly buckets, 48h TTL) — reads, wakes and commands
  that actually reached Tesla. Counts what left, not what was intended.
- **`vehicle_snapshots`** — the history the daily poll exists to keep unbroken.
- **`command_events`** — every command with its outcome and error code.
- **`/debug`** — renders all of the above, for one operator, by hand.

**The gap between this and monitoring is one thing: nothing looks unless a
person opens the page.** Every signal in §4 could be computed from what is
already stored; what is missing is something that computes them on a schedule
and says something when they move.

---

## 6. Known and unfixed

Honest list, because a monitoring plan built on a wrong inventory is worse than
none.

- **CARTO basemap has no API key.** Every map tile is watermarked
  `API KEY REQUIRED` in production, on every screenshot taken from the car and
  the phone. Needs an account decision, not code.
- **No daily quota ceiling on `vehicle_data`** (§3). Roadmap T6.
- **The signing proxy is an open relay.** Anyone with the hostname and a valid
  Tesla token for a paired account can have our private key sign commands, on
  our partner account. Roadmap T10 — a shared-secret header, about twenty lines.
- **Commands do not wake a sleeping car** (roadmap T3/T4). Cars sleep most of
  the time, so a large share of real commands fail with nothing explaining why.
- **`bnetza` and `austria` are dark.** Germany and Austria get no national feed;
  OSM and OCM still cover them, thinly.
- **Costs arithmetic (C1–C5)** is wrong in four places and nothing flags it.
  The number the product exists for. Roadmap gate 2.
- **Email verification is unreachable** without `RESEND_API_KEY`, which locks
  document recovery for every non-admin user.

---

## 7. If you build one thing

A single scheduled job that computes §4's six numbers, stores them, and compares
each against the previous run. Most of them are a `count(*)` with a date filter.

Then one screen showing six numbers and whether each moved — and, crucially,
**a timestamp on every one**, because the failure this repo keeps rediscovering
is not a wrong number. It is a right number that stopped being true and said
nothing.
