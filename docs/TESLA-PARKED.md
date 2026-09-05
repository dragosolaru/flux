# Tesla, parked — what was removed, what you must delete, how it comes back

*2026-09-05. The Tesla integration was withdrawn from the app. The code is not
deleted; it is on branch **`v3`**, which points at commit `57d1d2d` — the last
state of `main` that still had it. Nothing was lost and nothing needs rewriting
to bring it back.*

Why, in one line: five independent analyses reached the same conclusion — as a
Tesla companion app we lose to Tesla's own free app and to Tessie, and the
integration is the only per-request cost in the business. The paid product is
documents and costs, and it needs no car connection at all.

---

## 1. Delete these from the deployment

**Vercel → Settings → Environment Variables.** All seven, in every environment:

| Variable | What it did |
| --- | --- |
| `LIVE_INTEGRATIONS` | The master switch. Every `/api/tesla/*` route answered 410 without it. |
| `TESLA_CLIENT_ID` | OAuth client. |
| `TESLA_CLIENT_SECRET` | Exchanging the callback code for tokens. |
| `TESLA_REDIRECT_URI` | Where Tesla sent the driver back. |
| `TESLA_TOKEN_ENCRYPTION_KEY` | AES-256-GCM key for refresh tokens at rest. |
| `TESLA_PUBLIC_KEY` | Served at `/.well-known/...` for partner registration and Virtual Key pairing. |
| `TESLA_PROXY_BASE_URL` | The command-signing proxy. |

Nothing reads any of them now, so leaving them set changes no behaviour — but
they are credentials, and a credential nothing uses is one nobody notices being
stolen.

**Two things outside Vercel, and these are the ones that actually cost money:**

- **The signing proxy host.** `tesla-proxy/` was deployed somewhere (Coolify,
  Fly, Hetzner). Shut it down. While it runs it is an open relay — anyone with
  the hostname and a valid token for a paired account can have your private key
  sign commands on your partner account. That was roadmap item T10, never fixed,
  and switching the app off does not switch the proxy off.
- **The Tesla developer app.** At developer.tesla.com, set the **billing limit to
  0** or remove the payment method. Nothing calls the API any more, so the bill
  should be zero — but the account is yours and a limit of zero is the only thing
  that guarantees it.

**Optional, and reversible only by re-pairing:** the Virtual Key can be removed
from the car itself (Tesla app → Security → Manage Keys). Not necessary — an
unused key does nothing — but it is the clean end of the relationship.

---

## 2. What was removed from the app

**Whole directories:** `src/lib/tesla/` (API client, OAuth, token encryption,
the call budget, the call log, charging history, last-known readings),
`src/app/api/tesla/` (connect, callback, connection, refresh),
`src/app/connect/tesla/`, `tesla-proxy/`.

**Routes:** `/api/tesla-public-key`, `/api/vehicles/[id]/wake`,
`/api/vehicles/[id]/charging-history`, `/api/debug/nav-probe`, and the four
`/api/internal/debug/tesla-*` endpoints.

**Components:** `ConnectTeslaStep`, `TeslaConnectionCard`, `NavProbe`.

**Live branches, cut out of routes that survive:** the state route and the
commands route are simulator-only now; `/api/trip-plan` plans from stored state
instead of a live reading; the daily cron ticks the simulator and derives
activity, and no longer fetches or stores a live reading.

**`src/lib/brands/tesla/command-map.ts`** — the translation from our command
vocabulary to Tesla's request bodies. `profile.ts` and `vin-decoder.ts` stay:
the first describes what the simulator can do, the second parses a VIN string
offline and is used when adding a vehicle.

**Debug panels:** *Somnul și traficul spre mașină*, *Pornirea cu Tesla*,
*Activitatea mașinii*, the whole **🚗 Mașina** section, and the `car` report.

**Roadmap:** gate 1 was "before we connect someone else's car" and was entirely
Tesla; it is now "before someone else uses the app". Fleet Telemetry, the signing
proxy, the Fleet API quota and the discounted-device-data flag are gone from the
list. One gate-3 item remains, pointing here.

---

## 3. What was removed that was *not* Tesla, and why it matters

Two tests went with the code they protected, and both were guarding something
real:

- **`command-args.test.ts`** asserted that the two independent consumers of a
  command's arguments — Tesla's body builder and the mock engine — read the
  **same key**. It existed because they once disagreed: the charging screen sent
  `limitPct`, the Tesla builder read `percent ?? 80`, and every live charge-limit
  change went to the car as 80% behind a success toast. With one consumer left
  the test cannot do its job, so it is gone — **and the risk returns the day
  Tesla does.** Restore it from `v3` at the same time.
- **`schedule-commands.test.ts`** pinned the schedule command bodies to
  `pkg/proxy/command.go`, transcribed rather than inferred. Same story.

Also gone: `budget.ts` and its ceiling, the `no-background-wake` guard, the
`dormant-live-vehicle` sweep, and the SoH estimate from `vehicle_config`. All of
them describe a car we no longer talk to.

---

## 3b. The command layer went too — a day later, and for a better reason

Withdrawing the integration left the surfaces that existed only to drive it, and
they were not merely redundant: **they were broken and still on the menu.**
`/commands` was visible because its gate read `data_source === "live"` from the
database — the linked car's row still said live — while the route it led to had
started answering `503 LIVE_PAUSED`. `/charging` was visible for any vehicle and
called `/api/vehicles/[id]/charging-history`, a route deleted an hour earlier.
Two menu entries, both pointing at walls.

Keeping them for the simulator was the other option and it is worse: a button
that "locks the doors" of an invented car is not a demo feature, it is a small
lie told on every tap. And no tier in the approved spec contains commands — Free
is the map, the planner and the stations; Pro is documents and costs.

So the whole layer is gone: the `/commands` and `/charging` pages, `AllCommands`,
`CommandPanel`, `QuickActions`, `ConfirmCommandDialog`, `CommandHistory`,
`CommandFlash` with its nine car-state images, `DepartureCard`,
`useVehicleCommand`, the commands and command-history routes, `applyCommand` in
the simulator, and the `LIVE` and `COMMANDS` capabilities.

**One tab survived the first pass and shipped.** The menus live in three files —
`Sidebar.tsx`, `SlideUpMenu.tsx`, `BottomNav.tsx` — two were edited by hand and
the third was missed, so the mobile tab bar kept an **Încărcare** tab pointing at
a deleted route. It was caught by a screenshot from the phone, which is not a
review process, and it is the same failure as the hand-written route list this
document already describes: a manual sweep over "everywhere that mentions X" is
wrong the moment there is somewhere you forgot.
`src/components/layout/__tests__/nav-targets-exist.test.ts` now derives the
check — it reads the hrefs out of all three nav files, lists the pages that
actually exist, and fails on any link that goes nowhere. Verified against the
bug: with the fix reverted, it fails on exactly that tab.

Removed with it: `useChargingHistory`, `useChargingHistorySync`, the two API
helpers calling the deleted charging-history route, `security-alert.ts` (it
warned about `unlock` and `remote_start`, which can no longer be sent), and the
dead `commands` i18n namespace across all five locales.

**Kept, because it is a cost feature rather than a car action:** the smart-charge
recommendation in `SmartChargeCard`. It says when electricity is cheapest. Only
the button that acted on it was a command, and only that button went.

---

## 3c. The dashboard sat on "Contactăm mașina…" forever

Reported from the phone, and it was mine. A vehicle still stored as
`data_source = "live"` was answered `503 LIVE_PAUSED`, the client read that as
"still trying", and the screen showed a spinner and the words *contacting the
car* — for a car nothing will ever contact again.

The 503 was the wrong answer to the wrong question. Such a vehicle is not an
error and not a simulator: it is **a record with no telemetry**, which is
exactly what a vehicle is in the product now — the thing documents, costs and
odometer readings hang off. So the route returns that: the identity we know, and
null for every reading we do not. Screens already hide null fields rather than
substituting placeholders, so an honest empty renders without any of them
needing a special case.

**And the polling machinery went with it.** There was an app-wide sleep switch, a
ten-minute idle cut-off, a `live` flag marking vehicles that could be disturbed,
a `cached=1` query mode and a second cache key — roughly two hundred lines whose
entire purpose was that *a poll on a sleeping Tesla wakes it, and a woken car
loses ten times more charge per idle day*. None of that hazard exists. What is
left of `pollInterval` is: refresh if the screen asked, stop after a failure.
`vehicle-sleep.ts` and the orphaned `SleepPanel` are deleted, and the hook's
`live` parameter is now `hasTelemetry` — the opposite sense, which is why
`map-client` needed its argument inverted rather than left to read plausibly and
mean the reverse.

**One thing was silently lost and is restored.** Removing the Tesla
re-authorisation banner took the whole error branch of the dashboard's ternary
with it, so a failed read showed "—" and nothing else — indistinguishable from a
car with no data, and only one of those is worth retrying. There is an error
card with a Retry again.

---

## 4. What stayed, deliberately

- **The vehicle.** Documents, costs and odometer readings attach to one, and the
  paid product is built on that.
- **The simulator**, and the `tesla` brand profile that describes it. It is a
  demo car; it makes no network calls and costs nothing.
- **`vehicles.tesla_vehicle_id`, `tesla_region`, `trim_badge`, and the
  `tesla_tokens` table.** Schema is not dropped. Dropping columns is
  irreversible, the rows are small, and they are exactly what a restore needs.
  **`tesla_tokens` still holds encrypted refresh tokens** — if you want them
  gone, delete the rows; the encryption key is being deleted with the env vars,
  which makes them unreadable anyway.
- **A vehicle stored as `data_source = "live"`** answers `503 LIVE_PAUSED`
  rather than being handed to the simulator. That path would have called
  `createInitialSnapshot` and **invented a car**, showing a fabricated battery
  level to the owner of a real one.

---

## 5. Bringing it back

`git checkout v3 -- src/lib/tesla src/app/api/tesla tesla-proxy …` and restore
the env vars. But read `docs/HOSTING-AND-DOMAIN.md` first: re-registering the
partner account **unpairs every car**, and the domain, the redirect URI and the
`_ak` pairing link are all bound together. Cheap with one car, expensive with
customers — which is the argument for doing it, if ever, before there are any.
