# REDESIGN-V2 — the working log

The redesign runs at `/v2`, beside the shipping app. This file is the log: what
is done, what each ported screen changed, and — the point of doing it this way —
what turned up **broken** while looking closely at a screen, because that gets
fixed in the real app too rather than only in the new one.

Design source: the canvas in `design/` (published artboards, one page per
direction). Feature-catalogue entry: `docs/FEATURES.md` §26.

---

## Why a separate route

Three reasons, in order of weight:

1. **It can be judged on glass.** The direction makes claims about a 56px row and
   a 72vw arc that a laptop cannot settle. Both versions on the same phone, same
   data, same minute.
2. **Nothing breaks meanwhile.** The app is in daily use. A redesign that lands
   in place is a redesign that has to be finished in one sitting.
3. **It forces the data layer to stay shared.** `/v2` imports the same hooks and
   the same API routes. If a screen cannot be rebuilt without forking logic,
   that is a finding about the logic, not about the design.

When a screen wins, its client component moves into the real route and the `/v2`
copy is deleted. This is a staging area, not a second app.

---

## Status

Read from `src/app/v2/screens.ts` — the `/v2` index renders the same list, so it
cannot drift.

| Screen | v2 | Compare with | Hands back to v1 |
| --- | --- | --- | --- |
| Car (dashboard) | `/v2/dashboard` | `/dashboard` | — |
| Commands | `/v2/commands` | `/commands` | — |
| Find my car | `/v2/map` | `/map` | — |
| Trip planner | `/v2/trip` | `/map?mode=plan` | — |
| Chargers nearby | `/v2/chargers` | `/charging-map` | the map view |
| Charging | `/v2/charging` | `/charging` | — |
| Costs | `/v2/costs` | `/costs` | — |
| Garage | `/v2/garage` | `/garage` | — |
| Documents | `/v2/documents` | `/documents` | reviewing a parsed document |
| Insights | `/v2/insights` | `/insights` | — |
| Energy | `/v2/energy` | `/energy` | — |
| Settings | `/v2/settings` | `/settings` | account + notifications |
| Sign in / register | `/v2/login`, `/v2/register` | `/login`, `/register` | — |

Four handoffs remain, and each is deliberate rather than unfinished:

- **Reviewing a parsed document** is a form with money in it. Two editors for
  the same rows would drift, and the drift would be in amounts.
- **Account deletion and notification channels** stay on v1: a second path to a
  destructive action is a second path to get it wrong, and the typed-confirmation
  guard already lives there.
- **The charging map view** — the list answers "which one, how far, how fast"
  better than a map does; the map is still one row away for when you need to see
  the shape of a city.
- **The v1 charger/station detail sheets** are reused where they fit rather than
  redrawn.

Everything else that was a handoff in the first pass is now real in `/v2`:
locale and currency commit on tap, home location uses v1's geocoding picker
inline, documents upload through a native picker with the same 10 MB ceiling,
and the garage opens v1's AddVehicleModal rather than navigating away.

**The auth guard does not live in `src/app/v2/layout.tsx`.** Every page under it
calls `auth()` itself. A shared guard would have needed an exception carved out
for `/v2/login` and `/v2/register`, and a conditional guard is one refactor away
from guarding nothing. `LoginForm` is reused unchanged — it owns the
`callbackUrl` validation that stops an open redirect — with one added
`defaultCallbackUrl` prop that is validated by the same rule as the query
parameter.

`/debug` is deliberately not on the list. It is a tool, not a product screen, and
it is the one place where density beats composure.

---

## Ported: Car (`/v2/dashboard`)

**Same data, same commands.** `useVehicle`, `useVehicleCommand`, `useVehicles`,
`useVehicleContext` — unchanged, imported as-is.

What changed in the presentation:

- **The battery is the screen.** One 270° arc with the charge-limit tick on it,
  the reading inside it. The old screen had the number, a 2px rail, a limit
  marker and a separate circular progress in the charging card — four pictures of
  one value.
- **Actions are rows, not a row of circular icon buttons.** A 48px circle with an
  icon and no label asks the driver to guess; a 56px row says *Blochează* on the
  left and *BLOCATĂ* on the right, so the current state is readable without
  tapping anything.
- **Waiting says how long.** The state label goes amber and counts —
  `TRIMIT… 3s`. A spinner says something is happening; after five seconds the
  question is how long it has been. Tesla commands routinely take 4–10s against a
  sleeping car, so this is the normal case, not an edge.
- **"Let it sleep" is a row with its state on it,** not a bordered panel that read
  as an app-wide setting. It shows ON/OFF and toggles in one tap.
- **Errors are rows.** The full-width card with a 32px warning triangle is
  replaced by one row: what happened on the left, the single useful action on the
  right. The Tesla-revoked case still routes to `/connect/tesla?reauth=1`, since
  "check your connection" can never work for it.
- **A refusal states its reason.** No position for the car → the *Find my car* row
  is dimmed and prints `FĂRĂ POZIȚIE` where its value would be.

Deliberately **not** carried over yet: the getting-started checklist, the
onboarding overlay, notifications, stat chips, and the Virtual Key pairing
prompt. Each is real functionality; none of them has been drawn in this language
yet, and shipping a half-drawn version of them would make the comparison
dishonest. They are the next thing on this screen, not an omission that has been
forgotten.

**Defects found while porting:** none on this screen — the v1 dashboard was
worked over heavily in the August remediation pass.

---

## Ported: the other nine

- **Commands (`/v2/commands`).** One column instead of a two-column grid of
  bordered buttons. Two columns halves the width available to a label, so
  several locales truncate at ~13 characters and a cut label is a button you
  have to guess at; the longest German string fits now. Every toggle carries its
  state on the right (`PORNITĂ` / `OPRITĂ`), so the screen answers the question
  you opened it to ask. Charge limit and amps are tappable values, temperature
  is a stepper with Apply — the one control in the system that does not commit
  on tap, because sending a command per degree would spend the quota on the way
  from 18 to 24.
- **Find my car (`/v2/map`).** Its own screen. In v1 this is a banner floating
  over a canvas shared with the explorer and the planner; here the map is the
  top 46% and the rows below are the distance, the walk handoff, the address,
  and honk/flash. The walking route is still handed to the phone's own maps app
  — a real pavement route needs a pedestrian router we do not have.
- **Charging (`/v2/charging`).** The arc's second legitimate home: a session is
  a level filling up. Green while charging regardless of level, because the
  number is going the right way whatever it reads.
- **Costs (`/v2/costs`).** Bars, not an arc — money over months is a comparison,
  not a level, and using the house instrument there would have been style over
  meaning. The "vs petrol" figure is only printed when both sides are known.
- **Garage (`/v2/garage`).** The proof the direction scales: the same arc at
  46px becomes a row ornament that still carries the number, so two cars read at
  a glance without a second component being invented. Only the selected car is
  polled — drawing every car's state would wake every linked car at once.
- **Documents, Insights, Energy, Settings.** List screens, derived directly from
  the row. Insights states plainly that SoH and vampire drain need Fleet
  Telemetry rather than printing a zero that looks like a reading.

---

## Ported in the second pass

- **Trip planner (`/v2/trip`).** The route as a vertical spine: each stop
  carries the SoC it arrives on, the SoC it leaves with, and the power. Not
  arcs — a route is a sequence, and four arcs down a screen would be the house
  instrument used as decoration. Composed from the same pieces v1 uses
  (`tripApi.plan`, `GeocodingSearch`, `shareNavigation`, the precondition
  helpers), so no planning logic is forked. Preconditioning is decided from
  EVERY stop that needs it, via `routeNeedsPreconditioning` — deciding it from
  the first stop is a bug this app has already had once.
- **Chargers nearby (`/v2/chargers`).** A sorted list, not a map. Standing
  somewhere with 12% left, the question is "which one, how far, how fast" —
  three values a list answers directly and a map makes you pinch at. Falls back
  to the car's position when location is denied, which needs no permission and
  is the next most useful centre.
- **Sign in / register (`/v2/login`, `/v2/register`).** A wordmark, a hairline,
  the form, one link. The three blurred colour blobs behind v1's auth screen are
  the only decoration left in the app, and the direction has none anywhere else.

---

## Defects found while redesigning

Fixed in the **real** app, not only in `/v2`.

| # | Screen | What was wrong | Fixed in |
| --- | --- | --- | --- |
| 1 | `/charging` | The page fetched charging history server-side for the **first** vehicle by `created_at`, while the client rendered live state for the **selected** one. With two cars linked, the sessions listed belonged to a different car than the battery above them, and nothing on screen said so. | `GET /api/vehicles/[vehicleId]/charging-history` (new, auth + ownership checked), `src/hooks/useChargingHistory.ts`, and both the v1 and v2 charging screens now key the query on the selected vehicle. The server rows are initial data for that one car only. |
| 2 | every `/v2` screen | Every v2 screen called `useVehicle(id, isLive)` without the third argument, so opening Commands, the trip planner, find-my-car or the charger list started a 30-second poll against a parked car. A poll on a sleeping Tesla wakes it, and a car kept out of deep sleep loses roughly ten times more charge per idle day. The garage was worst: it passed `live: false`, which told the hook there was nothing to disturb and disabled the idle cut-off on exactly the linked cars that needed it. | Only the dashboard polls now. Charging polls **only while a session is running** — a charging car is awake anyway. Everything else reads the value once; `useVehicleCommand` already invalidates the query after a command, so the screens stay current without an interval. |
| 3 | `/commands`, `/charging` (v1) | The same defect predated the redesign: both polled a live car every 30 s for ten minutes each time the screen was opened, just for being open. | Same rule applied. `/commands` passes `poll: false`, `/charging` polls only while charging. |
| 4 | `/v2` (all) | The bottom nav was the last child of a flex column, so it only reached the bottom when the content above happened to fill the viewport. On settings, a one-car garage or an empty document list it floated in the middle of the page. | The nav is `fixed` to the viewport and `Screen` reserves `--v2-nav-h` so nothing lands underneath it. Its links also gained a 44px touch target. |
| 5 | `/v2` (map, chargers) | Rows linking to Google Maps used `next/link`, which navigates in place. Installed as a PWA there is no back button, so a walking route handed the app's only window to Google Maps. | `Row` renders a plain `<a target="_blank" rel="noreferrer">` for any `http` destination. |

---

## Waking, and why the polling rule was only half the answer

Reducing polling was necessary and not sufficient. Tesla answers `vehicle_data`
with **408** while the car is asleep, and `fetchVehicleData` responded by POSTing
`wake_up` and retrying. So *every read was a wake*: one screen opening pulled a
parked car out of deep sleep, and no amount of `poll: false` could have changed
that, because the interval was never the mechanism.

Three changes, in order of how much they matter:

1. **`allowWake` defaults to false.** Only `POST /api/vehicles/[id]/wake` passes
   true, behind a driver's tap, rate-limited to ten an hour. A background read of
   a sleeping car now throws `TeslaAsleepError` instead of waking it.
2. **The state route answers "asleep" with the last known reading** — `isOnline:
   false`, `lastSeenAt` carrying its age — instead of a failure. This needed live
   readings to be stored at all, which they were not: `vehicle_snapshots` was
   written by the simulator only. That absence is *why* the wake existed.
3. **One persisted switch** (`flux:letItSleep`) replaces the per-hook pause,
   which covered a single mounted hook and died on the next navigation.

And the part that makes it checkable rather than merely claimed: `/debug` counts
what actually reached Tesla, per hour, for 24 hours. `wake` should be zero on a
day nobody pressed the button; anything else is a bug with a timestamp on it.

---

## The polling rule

`pollInterval()` in `src/hooks/useVehicle.ts` is the whole rule, as one pure
function, pinned by `src/hooks/__tests__/poll-interval.test.ts`. It is a battery
bill rather than a preference, so it is tested rather than commented:

- A screen that did not ask to poll never polls. This outranks everything else.
- A **live** car whose polling has been paused — by hand or by the ten-minute
  idle timer — is left alone. A simulator is not: there is nothing to disturb.
- After a failure, polling stops. Each retry still tries to wake the car, and no
  timer fixes a car that is asleep, out of signal, or unlinked.

`poll` also accepts a predicate over the last reported state. That is how the
charging screens refresh only while a session is running, without the
chicken-and-egg of needing the data to decide whether to fetch the data.

Who polls, and why:

| Screen | Polls | Why |
| --- | --- | --- |
| `/v2/dashboard`, `/dashboard` | yes | Live state is the point of the screen, and it carries the visible "let it sleep" control plus the idle cut-off. |
| `/v2/charging`, `/charging` | only while charging | The session is already keeping the car awake. |
| everything else | no | One fetch. Commands refresh through the invalidation `useVehicleCommand` already does. |

---

## Open questions only a phone can answer

Carried over from the canvas, unresolved:

- The 64px floor on the hero number — below it the screen loses its subject, but
  64 is a guess.
- `min(72vw, 300px)` for the arc, and whether the 300 cap leaves a tall phone
  looking empty. At 430×932 there are ~256px of deliberate space between the
  values and the actions. If it reads as unfinished, the fix is raising the cap,
  not inventing a row to fill it.
- Whether an 8% hairline survives a blue-light filter on a cheap panel. The whole
  structure rests on it.
- Space Grotesk 300 at 64px+ in direct sunlight. It may need 400.
