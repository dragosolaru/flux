# Tesla API — what we can build, and what we can't

> Written from `docs/reference/Tesla_API_Developer_Research_Full.pdf` (9 pages,
> committed alongside), checked against what Flux already ships.
>
> What this adds to the research: a **feasibility grade** per feature, the
> **sampling-rate arithmetic** that decides whether telemetry is affordable, and
> the places where our stack differs from the one the research assumes. The
> research is careful — it already marks SOH, consumption decomposition and
> wake-cause as estimates — so §6 is mostly about the handful of items where
> "mark it as an estimate" is not enough and the feature has to change shape.

---

## 1. Where we are today

Already live in Flux, with a real car linked:

| | |
|---|---|
| OAuth + PKCE, all nine scopes | `src/lib/tesla/auth.ts`, `constants.ts` |
| `vehicle_data` with `location_data` | `src/lib/tesla/api.ts` |
| 20 commands, signed through the proxy | `src/types/tesla.ts`, `tesla-proxy/` |
| Charging history via `dx/charging/history` | `src/lib/tesla/charging-history.ts` |
| Partner registration + Virtual Key pairing | `/debug` → Go live with Tesla |

The mapper reads charge, climate, drive, closures, tyres, software and dashcam.
That is the whole of what a **polled** integration can see.

Everything ambitious below needs the thing we do *not* have yet: **Fleet
Telemetry**.

---

## 2. The one architectural decision that gates everything

`vehicle_data` is a **live call to the car**. Tesla says plainly that regular
polling is not recommended, and we have already felt why — an open dashboard
kept the car awake, which is what `IDLE_PAUSE_MS` in `src/hooks/useVehicle.ts`
exists to stop.

Fleet Telemetry inverts it: the **car pushes to us**, up to every 500 ms, over a
connection it already has. No wake-ups, no quota burn, and roughly ten times the
number of signals.

**This cannot run on Vercel.** Telemetry is a long-lived push connection to a
server you host; serverless functions have neither the lifetime nor the fixed
address. It belongs on the Coolify box, next to `tesla-proxy` — which is now the
strongest argument for having set that box up.

```
Tesla vehicle
   │  push, ≤500 ms
   ▼
Telemetry receiver  ── Coolify (public TLS, like tesla-proxy)
   │
   ▼
Postgres / Supabase  ── downsampled, see §5
   │
   ▼
Flux on Vercel       ── reads history, never polls the car
```

Prerequisites we have already satisfied by getting commands working: a registered
partner domain, a served public key, and a public TLS host. Telemetry reuses all
three.

---

## 3. Endpoints worth adding

Ranked by value per hour of work.

| Endpoint | Gives us | Status |
|---|---|---|
| `POST /vehicles/fleet_telemetry_config` | the whole of §4 | **not started** |
| `GET /vehicles/{vin}/fleet_telemetry_errors` | why telemetry is silent | pairs with the above |
| `POST /vehicles/fleet_status` | is the car reachable, is the Virtual Key paired | cheap, useful now |
| `GET /vehicles/{vin}/recent_alerts` | fault codes | cheap |
| `GET /vehicles/{vin}/service_data` | service state | cheap |
| `GET /vehicles/{vin}/release_notes` | firmware changelog | cheap |
| `GET /vehicles/{vin}/nearby_charging_sites` | Superchargers with live stall counts | **better than our charger DB for Tesla sites** |
| `GET /users/region` | correct Fleet API host without probing three | replaces our EU→NA→CN loop |
| `add_precondition_schedule` / `remove_precondition_schedule` | real scheduled preconditioning | we only have `set_preconditioning_max` |
| `add_charge_schedule` / `remove_charge_schedule` | real scheduled charging | we have the older `set_scheduled_charging` |

Two of these deserve a note. `nearby_charging_sites` returns Tesla's own live
stall availability, which no open dataset gives us — it would beat our ingested
data for Superchargers specifically. And `users/region` removes the three-region
probe in `src/app/api/tesla/callback/route.ts`.

---

## 4. The feature catalogue, graded

**Green** — the data exists and says what you want it to say.
**Amber** — buildable, but the output is an *estimate* and must be labelled one.
**Red** — cannot be done as described. Details in §6.

### Battery

| Feature | Grade | Note |
|---|---|---|
| Live pack voltage, current, temperature | 🟢 | telemetry fields |
| Charging efficiency (AC vs DC energy in vs pack energy) | 🟢 | `ACChargingEnergyIn`, `DCChargingEnergyIn` |
| Cell voltage spread | 🟡 | `BrickVoltageMin/Max` exist in the spec; **confirm on the actual car** before designing a screen around them |
| State of health | 🟡 | we already estimate from range-at-SOC. Telemetry improves it. Never an official Tesla number |
| Degradation over time | 🟡 | needs months of our own history first |
| Cycle count | 🟡 | Tesla exposes none. Integrate charge throughput ourselves |
| Projected SOH at 150k km | 🟡 | extrapolation from our own curve; say so |

### Charging

| Feature | Grade | Note |
|---|---|---|
| Per-session record (SOC, kWh, peak/avg kW, temps) | 🟢 | telemetry, far richer than `dx/charging/history` |
| Personal charging curve (kW by SOC) | 🟢 | the single most compelling thing here |
| Cost per session and per 100 km | 🟢 | tariffs already in Flux |
| Smart charging in the cheap window | 🟢 | `add_charge_schedule`, signing proxy works |
| "Your curve vs other Model 3 Performance" | 🔴 | needs a fleet |

### Preconditioning

| Feature | Grade | Note |
|---|---|---|
| Is it running, battery temp rise, energy used | 🟢 | `PreconditioningEnabled`, `BatteryHeaterOn`, `PackTemperature` |
| Scheduled preconditioning before departure | 🟢 | `add_precondition_schedule` |
| "Start preconditioning now for the stop ahead" | 🟢 | we already have the trip planner and the stop list |
| "Preconditioning saved you 8 minutes" | 🔴 | counterfactual — see §6 |
| "Compared with your past sessions at similar SOC and temperature" | 🟡 | the honest version of the above |

### Trips

| Feature | Grade | Note |
|---|---|---|
| Trip recorder (distance, energy, avg speed, temps, elevation) | 🟢 | telemetry |
| Consumption vs your own best on the same route | 🟢 | genuinely useful, no fleet needed |
| Temperature/consumption profile of *your* car | 🟢 | replaces the WLTP figure with the real one |
| "Can I make it?" with confidence | 🟢 | our planner plus the learned profile |
| Energy split: driving / HVAC / conditioning / other | 🟡 | only HVAC and pack total are measured; the rest are residuals |
| "Why did I consume so much?" attribution | 🟡 | correlation across our own history, never causation |

### Behaviour and housekeeping

| Feature | Grade | Note |
|---|---|---|
| Vampire drain | 🟢 | **only** via telemetry — see §6 |
| Driving/efficiency score | 🟡 | our algorithm, not Tesla's |
| Battery care score | 🟡 | ditto — invented metric, label it |
| Geofences (home/work/charger) | 🟢 | `vehicle_location` granted |
| Firmware tracker | 🟢 | `release_notes` |
| "What changed after the update?" | 🟡 | correlation |
| Alerts and service state | 🟢 | `recent_alerts`, `service_data` |
| "Which app woke the car" | 🔴 | see §6 |

---

## 5. What telemetry actually costs

500 ms is the ceiling, not a plan. Every field is configured with its own
interval, and storing everything at the ceiling is the mistake that makes this
project expensive.

One field at 500 ms is 172,800 rows a day. Thirty fields is five million a day,
about **1.8 billion a year** — far past what a hobby Supabase instance absorbs,
and the analyses above do not need it.

Sensible starting intervals:

| Signal group | Interval | Why |
|---|---|---|
| Charging (power, current, SOC) | 10 s **while charging** | this is what draws the curve |
| Pack voltage / current / temperature | 30 s | SOH work is slow-moving |
| Location, speed | 30 s driving, off when parked | trips |
| Climate, preconditioning | 60 s | state changes, not waveforms |
| Odometer, SOC at rest | 15 min | vampire drain needs no more |

That lands near 50–100 MB a year, which Supabase holds without complaint. Raise
the charging interval only if the curves come out too coarse.

Keep raw rows for a bounded window (say 90 days), roll up sessions and trips into
summary tables, and let the raw rows expire. The summaries are what the UI reads.

---

## 6. Not feasible as described

The explicitly-requested list. Each of these appears in the research as a
finished feature; each has a problem.

**"Preconditioning saved you 8 minutes."** You cannot observe the counterfactual.
The car either preconditioned or it did not; there is no run of the same session
without it. The honest version compares against your own past sessions at similar
SOC and ambient temperature, and says *"sessions like this without preconditioning
averaged 32 minutes"*. Presenting a controlled-experiment result from
uncontrolled data would be a fabrication, and a plausible-looking one.

**"Third-party API polling woke your car."** Tesla reports that the car woke. It
does not report who woke it. We can log the transitions and we can rule ourselves
out — we know when Flux polled — but naming another app is a guess. Show the
timeline, not the culprit.

**Energy decomposition into driving / HVAC / battery conditioning / other.**
There are no per-subsystem energy meters. Total pack energy out is measurable
(`PackCurrent × PackVoltage`, integrated) and `HvacPower` is reported. Everything
else is a residual, and residuals absorb every measurement error in the chain.
Ship it as two measured bars and one "everything else", or not at all.

**"Cycles: 312".** No cycle counter is exposed. Integrating charge throughput and
dividing by pack capacity gives a number, but it is our definition of a cycle, not
Tesla's, and it will not match anything the service centre says.

**Comparison against other owners' cars.** Every "vs other Model 3 Performance"
feature needs a fleet of consenting users. Not available at one user. It is also
the feature most likely to attract a privacy problem, so it should arrive with
explicit opt-in or not at all.

**`/api/1/dx/charging/sessions`.** Business fleet accounts only. We use
`dx/charging/history`, which does work for a personal account — do not "upgrade"
to `sessions` expecting richer data on a personal account.

**Vampire drain measured by polling.** Technically the numbers exist, but each
poll wakes the car and adds to the drain being measured. The measurement destroys
the thing it measures. Telemetry only — and until telemetry ships, this feature
should not.

**Per-brick voltages.** In the spec, but availability varies by model and
firmware. Confirm on the actual car before building a screen that assumes them.

---

## 7. The data model, mapped onto what we have

The research proposes six tables. Four of them Flux already has a home for, which
is worth knowing before anyone designs a parallel schema.

| Research table | In Flux today |
|---|---|
| `Vehicle` (id, vin, model, variant, firmware) | `vehicles` — has all of it |
| `ChargingSession` | `charging_sessions` — exists, but only the simulator and the Supercharger sync write to it (`docs/TODO.md` 1f) |
| `Trip` | `trips` exists; not populated from live data |
| `Automation` (trigger, condition, action) | the notification alert engine is the closest thing |
| `TelemetryEvent` (vehicleId, timestamp, field, value) | **new** |
| `BatterySnapshot` | **new** |

So telemetry adds two tables and finally gives the two existing empty ones
something to write them.

One caution on `TelemetryEvent` as `(vehicleId, timestamp, field, value)`: that
shape is flexible and expensive — one row per field per sample, with the field
name repeated on every row. At the intervals in §5 it is fine. If the charging
interval is ever tightened, a wide row per sample (one row, many columns) costs
several times less.

### One signing key, many cars

Worth stating before anyone designs multi-user storage around it: there is **one
command-signing keypair for the whole application**, registered against our
domain. Every car that pairs stores that same public key. A thousand users means
a thousand OAuth grants and a thousand pairing approvals — but still one key.

`tesla_tokens` is per vehicle and holds the per-user half. Nothing about the
signing key is per user, and `teslaVirtualKeyUrl()` correctly takes no arguments.
See `docs/VEHICLE-CONNECTION.md` for the consequences, the sharpest being that
rotating the key forces every paired car to re-pair.

### Where our stack differs from the research's

**TimescaleDB.** The research assumes it. Supabase does not offer it on new
projects, so check before designing around hypertables — native Postgres
partitioning by month, or `pg_partman`, is the fallback and is sufficient at the
volumes in §5.

**Event bus / queue.** Proposed between the receiver and storage. At one car it
is machinery without a job; the receiver can write straight to Postgres. Add it
when there are enough vehicles for ingestion to outpace writes, not before.

**Redis.** Already in place (Upstash, via `isRedisConfigured()`), so the caching
layer in the diagram is the one piece that needs no work.

---

## 8. Implementation principles worth keeping

Lifted from the research because they are correct and easy to abandon under
deadline pressure.

**Raw first.** Keep the original telemetry. Deriving `consumptionPer100Km` and
discarding the samples means every future algorithm change starts from zero
history. Storage is cheap at these volumes; a year of discarded data is not
recoverable at any price.

**Event-driven, not cron.** Detect trip and charge start/stop from the stream.
A cron that samples every five minutes both misses short sessions and cannot say
when one actually began.

**Idempotency.** Telemetry redelivers. The same event arriving twice must not
produce two trips — the same discipline as `upsert_chargers_batch` in the ingest
pipeline.

**AI explains, it does not decide.** The daily summary reads numbers computed
deterministically upstream; it never becomes the source of them. Every claim
should be traceable to the rows that produced it, with a confidence score. This
matters more than it sounds: an AI layer that computes its own figures is
indistinguishable from one that invents them, and the failure is silent.

**Model-specific calibration.** SOH and charge-curve maths depend on pack
chemistry and firmware. `ModelSpec.chargeCurve` already carries per-model curves;
the same discipline applies here.

**Privacy.** Location and driving history are the most sensitive data Flux will
ever hold. Retention limits and encryption are not optional once there is a
second user, and are cheaper to build in now than to retrofit.

---

## 9. Order I would build it

1. **Cheap wins on the API we already have.** `fleet_status`, `recent_alerts`,
   `service_data`, `release_notes`, `nearby_charging_sites`, and `users/region`
   to replace the region probe. Days, not weeks, and no new infrastructure.
2. **Telemetry receiver on Coolify.** The unlock. Nothing in §4 marked green for
   battery or trips is reachable without it.
3. **Sessions and trips tables**, written by the receiver, downsampled per §5.
4. **The charging curve.** The most compelling single screen, and it needs only
   sessions.
5. **Trip history and the learned consumption profile**, which is what makes
   "Can I make it?" better than ABRP's generic model — it knows *this* car.
6. **Scheduling**: `add_charge_schedule`, `add_precondition_schedule`.
7. Scores and the daily AI summary, last, once there is enough history to say
   anything that is not noise.

The competitive argument for the planner is here, in step 5. ABRP models a
generic car of your model. After a few hundred kilometres of telemetry we would
model *yours* — its real consumption at 8 °C into a headwind on 20-inch wheels.
That is a difference no amount of UI work substitutes for.

**Against the research's own P0/P1/P2:** it agrees on telemetry first, then
sessions, trips and battery health. Two differences. The cheap endpoints move
ahead of everything, because they need no infrastructure and `fleet_status`
makes every later step easier to debug. And Battery Health drops behind the
charging curve — the research rates it the differentiator, but SOH needs months
of history before the line means anything, while a charging curve is legible
after one Supercharger stop. Same destination; the curve just pays sooner.

---

## 10. Reference

`docs/reference/Tesla_API_Developer_Research_Full.pdf` — the full research,
committed so it survives this conversation.

Its own source list, kept here so the links are greppable:

- [What is Fleet API](https://developer.tesla.com/docs/fleet-api/getting-started/what-is-fleet-api)
- [Authentication overview](https://developer.tesla.com/docs/fleet-api/authentication/overview)
- [Vehicle endpoints](https://developer.tesla.com/docs/fleet-api/endpoints/vehicle-endpoints)
- [Vehicle commands](https://developer.tesla.com/docs/fleet-api/endpoints/vehicle-commands)
- [Fleet Telemetry — available data](https://developer.tesla.com/docs/fleet-api/fleet-telemetry/available-data)
- [Charging endpoints](https://developer.tesla.com/docs/fleet-api/endpoints/charging-endpoints)
- [Energy endpoints](https://developer.tesla.com/docs/fleet-api/endpoints/energy)
- [Legacy Owner API, community docs](https://tesla-api.timdorr.com/vehicle/state/data)
- [TeslaMate](https://github.com/teslamate-org/teslamate) — the open-source
  benchmark: battery health, charge details, drive stats, efficiency, vampire
  drain, Grafana, MQTT, Home Assistant
- [Tessie Developer API](https://help.tessie.com/article/65-developer-api) — the
  commercial benchmark: realtime plus historical, Siri/Shortcuts/Watch
- [MyTeslaMate](https://www.myteslamate.com/) — hosted TeslaMate

**Legacy Owner API** (`charge_state`, `climate_state`, `drive_state`,
`vehicle_state`, `gui_settings`, `vehicle_config`) is reverse-engineered and
unsupported. Useful for understanding the ecosystem and for reading other
projects' code; not a foundation. Fleet API covers everything we need.
