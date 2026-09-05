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
