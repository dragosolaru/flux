# REDESIGN-V2 — the working log (closed)

**`/v2` is deleted.** It was judged the way it was meant to be — both versions
on the same screen, same data, same minute — and on the car's screen v1 looked
and worked better. Every screen was deleted; everything useful moved into v1.

That was this file's own rule from the first day: a ported screen either
replaces the original or is deleted, because a permanent `/v2` is the worst of
the three outcomes.

**The log is kept**, because the point of running the redesign on a separate
route was never the screens. It was that looking closely at each one turned up
things that were **broken in the real app**, and those were fixed there rather
than only in the new one. There are 52 of them below. They are still true, still
fixed, and still the reason this file exists.

`docs/FEATURES.md` §26 records what was ported forward at the end.

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

Two handoffs remain, and both are deliberate rather than unfinished:

- **Account deletion and notification channels** stay on v1: a second path to a
  destructive action is a second path to get it wrong, and the typed-confirmation
  guard already lives there.
- **The v1 charger/station detail sheets** are reused where they fit rather than
  redrawn.

Closed since: **reviewing a parsed document** now lives at
`/v2/documents/[documentId]` — it edits in place and commits once, and shows only
the fields the PATCH route accepts, because a field the API will not store is a
field that silently discards a correction. **The charger map** is now a toggle on
`/v2/chargers` rather than a link to v1; the list is still what opens first.

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

## Switching cars

The selected vehicle is global state that decides what nearly every screen
*means*: costs, charging history, documents, commands and the planner are all
per-car. `/v2` let you change it only in the garage — which is how someone reads
one car's costs believing they are the other's. v1 keeps a switcher in the top
bar for exactly this reason; `/v2` has no top bar.

`VehicleSwitch` now sits in the header of every vehicle-scoped screen: the
dashboard's title *is* the switcher, everywhere else it is a small mono chip
left of the state. Tapping opens a sheet with one row per car — the same 46px
arc as the garage, the name, the SoC — plus "add a car".

Three decisions worth stating:

- **It renders nothing when there is one car.** A chooser between one option is
  chrome, and this design does not carry chrome. On the dashboard the name still
  shows, as plain text with nothing suggesting it can be tapped.
- **The sheet reads only the selected car.** Fetching every car's state to draw
  a chooser would contact each linked car the moment you opened it — the
  opposite of what a chooser should cost.
- **The width cap is `42vw`, not `45%`.** A percentage resolves against a parent
  whose own width comes from its content, which collapsed the car name to
  nothing beside a long screen title. Measured at 375/390/430 with long names
  and long titles.

---

## "Let it sleep" reads from us, not from the car

The switch used to be enforced by refusing to fetch at all. That stopped us
reading our **own** database as well, so the screen had no values and printed
*"contacting the car…"* while deliberately contacting nothing — the exact
opposite of what the switch promises.

Leaving the car alone and having nothing to show are two different things.
`GET /state?cached=1` is a promise not to reach for the car: it answers from
`vehicle_snapshots` or returns `NO_CACHED_STATE`, and never calls Tesla. Sleep
mode fetches with that flag instead of not fetching, so the screen shows real
values with their age while no request ever leaves for the car. Pinned by
`no-background-wake.test.ts`, which asserts the cached branch returns *before*
the live fetch.

Three states are now told apart where two were conflated:

| | who stopped | what is on screen | the one action |
| --- | --- | --- | --- |
| **Lăsată în pace** | we did, deliberately | last stored reading, greyed, with its age | switch updates back on — nothing is woken |
| **Doarme** | the car did | last stored reading, greyed, with its age | wake it |
| live | nobody | current values | — |

---

## The asleep screen

A parked Tesla is asleep most of the time, so this is the state the dashboard is
in whenever you open it casually — and it used to render exactly like a live one
with a different word in the corner. Now:

- **The arc goes grey.** Colouring a memory green says the battery is fine
  *now*; grey says "this is the last thing it told us".
- **One line under the hero carries the age**: `ULTIMA CITIRE · ACUM 3 H`.
  Without it every value above reads as current, and none of them is.
- **The wake row is first, not last.** It is the only action that changes
  anything about the rows under it, and putting it after them asks the driver to
  read four stale values before being told they are stale.

Commands stay enabled while asleep: sending one is a deliberate act, and Tesla
waking the car to obey it is what the driver asked for. Only *reads* are refused
on their behalf.

---

## The car diagram

`/v2/commands` opens with the car seen from above: doors that swing out when
open, windows that colour a segment of the car's own side when down, a cabin
that tints while the climate runs, a charge port that pulses while power flows,
a sentry ring at the windscreen, and the whole outline in amber when the car is
unlocked.

It earns its place on **position**, which no row can carry: the eight per-corner
door and window booleans were arriving from the car and being discarded, because
"which window is down" would have needed four more rows.

Three animations, each carrying a fact rather than polish — the outline draws
itself once on arrival (removed under `prefers-reduced-motion`), the port pulses
while charging and the cabin breathes while conditioning (both keep their state
but stop moving). Door swings and window gaps are transitions, not loops: they
are state changes, and a state change must survive reduced motion by arriving
instantly rather than disappearing.

**Every proportion comes from the real car, not from taste.** A Model 3 is
4694 × 1849 mm — **2.54 : 1**. The first drawing was 3.05 : 1, twenty per cent
too long, which is exactly why it read as a capsule and is exactly the kind of
thing that is invisible from source. `MM` in the component holds the real
millimetres and every coordinate is derived from them: axles at the true
overhang and wheelbase, mirrors at 2089/1849 of the body width, glasshouse at
58% — a real one is nowhere near the 90% the second attempt used, which reads as
a lid rather than as glass.

**It was drawn against a rendered sheet of all eight states.** Three attempts
were thrown away. Every fault was one only a picture shows:

- doors rotating **into** the cabin — the left/right angle signs were swapped
- a glasshouse at 90% of body width, reading as a lid
- `opacity` on the glass elements instead of `fill-opacity`, so the whole shape
  vanished — outline included — whenever the climate was off

---

## The tab bar

Four tabs: **Mașina · Comenzi · Încărcare · Mai mult**.

"Find my car" held the second slot until it was pointed out that it is asked
once a week at most — and it is already a row on the dashboard, which is where
you are when you want it. Commands are why the app gets opened on a cold
morning. A tab bar is four decisions about frequency, not four categories of
feature.

Charging holds both halves of one topic: this car's session, and where to get
more. "Stații în apropiere" is a row directly under the session, because
"where do I get more" used to be two taps into a different tab.

A station in the list opens a sheet with **Vezi pe hartă** (centres the map on
it) and **Traseu până acolo** (hands it to the planner as the destination, with
the car's own position as the origin — the planner knows the battery and where
it will need to stop, which a maps app cannot).

`TABS` in `src/components/v2/nav.tsx` is one array. If a week of use says
something else belongs there, it is a one-line change.

---

## Defects found while redesigning

Fixed in the **real** app, not only in `/v2`.

| # | Screen | What was wrong | Fixed in |
| --- | --- | --- | --- |
| 1 | `/charging` | The page fetched charging history server-side for the **first** vehicle by `created_at`, while the client rendered live state for the **selected** one. With two cars linked, the sessions listed belonged to a different car than the battery above them, and nothing on screen said so. | `GET /api/vehicles/[vehicleId]/charging-history` (new, auth + ownership checked), `src/hooks/useChargingHistory.ts`, and both the v1 and v2 charging screens now key the query on the selected vehicle. The server rows are initial data for that one car only. |
| 2 | every `/v2` screen | Every v2 screen called `useVehicle(id, isLive)` without the third argument, so opening Commands, the trip planner, find-my-car or the charger list started a 30-second poll against a parked car. A poll on a sleeping Tesla wakes it, and a car kept out of deep sleep loses roughly ten times more charge per idle day. The garage was worst: it passed `live: false`, which told the hook there was nothing to disturb and disabled the idle cut-off on exactly the linked cars that needed it. | Only the dashboard polls now. Charging polls **only while a session is running** — a charging car is awake anyway. Everything else reads the value once; `useVehicleCommand` already invalidates the query after a command, so the screens stay current without an interval. |
| 3 | `/commands`, `/charging` (v1) | The same defect predated the redesign: both polled a live car every 30 s for ten minutes each time the screen was opened, just for being open. | Same rule applied. `/commands` passes `poll: false`, `/charging` polls only while charging. |
| 4 | `/v2` (all) | The bottom nav was the last child of a flex column, so it only reached the bottom when the content above happened to fill the viewport. On settings, a one-car garage or an empty document list it floated in the middle of the page. | First attempt: `fixed` plus a reserved `--v2-nav-h`. See #6 — that fix was wrong. |
| 30 | The vehicle switcher | The sheet opened showing **only "add a car"** — no cars, no backdrop — while the garage held two. `position: fixed` resolves against the nearest ancestor with a transform, and `.v2-rise` (the arrive-once animation on every ScreenHeader) has `transform` in its keyframes with `fill-mode: both`, so it stays a containing block after it finishes. The switcher lives in that header, so its sheet was laid out inside a **35px strip** at the top of the page and the car rows were pushed out of view above it. Measured in Chromium: overlay 35px against a viewport of 844. | `Sheet` renders through `createPortal` into `document.body`. A modal must not depend on what is above it in the tree — which is the right answer even without this particular animation. Pinned by `src/components/v2/__tests__/sheet-portal.test.ts`. |
| 28 | Every command row | The rule is *label = the action, value = the state it is in now*, and it only reads correctly when the label is an **imperative verb**. The labels were three grammars at once: nouns (`Deblocare`, `Aerisire`), imperatives (`Deschide port`), and — worst — resulting states (`Climatizare pornită`). A noun label looks like a field name, so **"Deblocare · BLOCATĂ"** reads as a contradiction instead of "unlock it — it is locked", and a state label put two states side by side saying opposite things. | Every command label is an imperative in all five locales: `Deblochează · BLOCATĂ`, `Pornește clima · OPRITĂ`, `Aerisește geamurile · ÎNCHISE`. |
| 29 | `/v2/commands` | The screen does not poll, deliberately. So a car unlocked with the physical key or from Tesla's own app left every toggle showing what was true when the screen was opened, with nothing saying so — a row that quietly reports the past looks exactly like one that is current. | The header carries the age of the reading and re-reads on tap. A deliberate act, so it is allowed to contact the car; nothing here happens on a timer. |
| 24 | Every command | Adding a third element to the state cache key broke `useVehicleCommand`, which still wrote to `["vehicle", id]`. Every **optimistic update landed in an entry no screen observed**: unlocking the car left the row reading LOCKED — the worst failure for a control whose job is to say what the car is doing. | `vehicleQueryPrefix()` is exported from `useVehicle` and used by both; the patch goes through `setQueriesData` on the prefix, so it reaches the live entry and the cached-only one. Pinned by `src/hooks/__tests__/vehicle-query-key.test.ts`, which fails if a literal `["vehicle", x]` reappears. |
| 25 | Every command | The reconcile read fired the instant the request returned. Tesla acknowledges a command **before** the car has applied it, so the read came back with the old value and overwrote the optimistic one — unlock flipped to UNLOCKED and straight back to LOCKED. | The reconcile waits 4s when the command has a known state effect. One delayed read rather than an immediate one plus a correction: two reads is two calls to the car. |
| 26 | `/v2/commands` | After pairing, `NEÎMPERECHEATĂ` stayed on screen. The server sets `virtual_key_paired` on the command's outcome, but the flag lives on the **vehicle list**, which is cached for a minute and which nothing invalidated. | A settled command invalidates `["vehicles"]` too. |
| 27 | `/v2/commands` | The header printed the car name twice — once from the switcher, once as `meta`. | The `meta` is gone; the switcher is the one place the car is named. |
| 22 | Commands, everywhere | `virtual_key_paired` was a **one-way latch**: set true by the first accepted command and never cleared. A car whose key was removed afterwards reported itself paired for good, so every command failed and the one prompt that says what to do stayed hidden — it renders on `=== false`. | The car saying *"your public key has not been paired"* is the most authoritative signal Tesla offers, and it now clears the flag. The UI also treats a live `error_vcp_required` as proof, so the row appears on the failed command rather than after the next refetch. |
| 23 | Tesla charging history | Every sync since August returned **400 "Invalid page no"**. `pageNo` defaulted to 0 against an API that numbers pages from 1. I had read it as the endpoint being closed to personal accounts and wrote that into a code comment, where it stood for weeks. | `pageNo` starts at 1. The genuine 403 case (some charging endpoints really are business-fleet only) is still handled separately. |
| 18 | `/debug` | The panel headed *"what we sent to Tesla"* never counted **commands**. `recordTeslaCall("command")` existed as a type and was called from nowhere, so the Comenzi figure read 0 however many were sent — while `debug_logs` was full of them. A counter that only counts some of what it names is worse than none: it makes the other two look trustworthy. | Counted in `sendVehicleCommand`, before the request leaves. |
| 19 | `/debug` | The counts lived behind a second request the **Copy report** button never made, so the one question the panel exists to answer could not be checked from a pasted report. | `teslaCalls` is part of the main diagnostics payload. |
| 20 | `/debug` | The heading claimed everything sent to Tesla; token refresh, `fleet_status` and charging history go to Tesla and never touch the car. | Narrowed to *"what reached the car"*, which is what the three counters actually measure. |
| 21 | `/v2/dashboard` | One label covered two different actions: switching our updates back on (sends nothing) and waking the car (sends `wake_up`). Read as "wake", it produced a wake that never happened — and then a debug panel with no wake in it, which looked like the panel was broken. | Two labels: **Pornește actualizările** while we are the ones not asking, **Trezește mașina** only when the car itself is asleep. |
| 15 | `/v2/dashboard` | With "let it sleep" on, the screen said **CONTACTĂM MAȘINA…** — while the whole point of the switch is that we are not. `enabled: false` had stopped the query reaching our own server, not just the car. | `?cached=1` reads the stored snapshot and never calls Tesla; the centre reads *NU ÎNTREBĂM MAȘINA* when there is nothing stored, and the last reading with its age when there is. |
| 16 | `/v2/dashboard` | The status row fell through to **Parcată** when `state` was null, so a screen with no data at all asserted the car was parked — a fabricated fact printed in the same type as the real ones. | The row only exists when the car reported. |
| 17 | `/v2/dashboard` | The sleep row read *"Lăsată în pace — OPRITĂ"*, which parses as the leaving-alone being off. | The label stays put and the value carries the state, like every other row. While sleeping it is replaced by one amber row: *Vezi din nou mașina*. |
| 12 | Adding any second car | `canAddVehicle` counted **all** active vehicles against a limit of one, but `POST /api/vehicles` only ever creates simulators — so "add a demo car" was refused by a limit written for real cars, and the free tier could never have two of anything. The garage's own row said `FĂRĂ COST` beside it, which was true about Tesla's side and false about ours. | Simulators and linked cars are limited separately: 1 linked car, up to 3 simulators, on the free tier. A mock car uses no Tesla quota and exists so the app can be tried — including tried with two cars, which is the only way to find out whether the switcher works. Reactivation checks the limit for the kind of vehicle it actually is. The false label is deleted. |
| 13 | `/v2/garage` | The failure above surfaced as "couldn't add the demo car". The server had sent a specific, actionable message and the toast discarded it — which is how a refusal became a mystery. | The server's message is shown when there is one. |
| 14 | `/v2/chargers` | "No stations found" appeared a second after the screen opened, while the phone was still being asked where it was. Locating and empty were the same state. | Three states told apart — locating, loading, empty — and the loading one is skeleton rows rather than a sentence that gets replaced by rows and moves everything under it. |
| 9 | `/v2/chargers` | Tapping a station **on the map** selected it correctly and rendered its detail *below the list* — three screens further down. The tap read as doing nothing. | The detail is a bottom sheet (`Sheet`, now shared with the vehicle switcher): a selection made at the bottom of the screen shows its answer where the finger already is. |
| 10 | `/v2/chargers` | The power filter offered a chip reading **0**, meaning "any power". A chip reading 0 asks for chargers of no power at all — the opposite of what it does. | `ChipRow` takes a `format`, and 0 renders as `TOATE`. |
| 11 | `/v2/dashboard` | The find-my-car row still linked to v1's `/map?lat=…&car=1`. Third instance of the same class: a link written before its v2 destination existed. | Points at `/v2/map`. |
| 7 | `/v2/insights` | The state-of-health row decided whether to show a value from the **vampire-drain** field, and when that was null claimed "needs telemetry". The same car reports 84.7% SoH and the v1 screen shows it. Two mistakes in four lines: the wrong source, and a confident explanation for the wrong result. | Each row reads its own field. SoH comes from `batteryHealthPct` on the vehicle state, vampire drain from the stats endpoint. The `needs_telemetry` key is deleted — the claim it made was false. |
| 8 | `/v2/map`, `/v2/costs` | Two rows still pointed at v1 (`/map?mode=plan`, `/documents`) after the v2 planner and the v2 document uploader were built. Written before those existed and never revisited. | Repointed to `/v2/trip` and `/v2/documents`. The three remaining v1 links are deliberate and each labelled `v1` on the row. |
| 6 | `/v2` (all) | The `fixed` nav's height and the padding reserved for it were **two numbers that had to agree**. Giving the links their 44px touch target in the same change made the nav 69px while the reserve stayed 52px, so it covered 17px of the last row — "Actualizări live" vanished behind it. | `sticky bottom-0` + `mt-auto`, in flow. `mt-auto` puts it at the bottom when content is short; `sticky` holds it against the viewport when content is long; being in flow means it occupies exactly the space it needs and there is **no second number**. The class of bug is gone rather than the instance. Measured in a real browser at 375/390/430, short and long, mid-scroll and at the end — and the same measurement was run against the broken version first, to confirm it fails. Pinned by `e2e/v2-nav.spec.ts`. |
| 31 | Six commands, mock **and** live | *"Nu merg toate comenzile pe demo, probabil nici pe tesla."* Half right, and the half that was wrong is the interesting one: all 22 commands were routed, accepted and logged as successful. Six of them then **changed nothing anyone could see**, because `VehicleState` had no field to change — `open_charge_port` and `close_charge_port` sat on `break; // no dedicated field yet`, `set_charge_amps` on `break; // no-op for v1 mock`, `remote_start` and `schedule_departure` on a bare `break`. A `break` with no assignment type-checks, lints, and passes every other test in the file. So the command worked, the screen showed the old value back, and there was nothing to distinguish that from a command that had failed. | `chargeAmps`, `isChargePortOpen`, `isRemoteStartActive`, `scheduledDepartureEnabled` and `scheduledDepartureMinutes` added to `VehicleState`, mapped from `charge_state.charge_current_request`, `charge_state.charge_port_door_open` and `vehicle_state.remote_start` on the live adapter and mutated in the simulator. The mock also keeps the port and the cable consistent — a charging car has its port open, driving away closes it and ends a remote start. Pinned per command by `src/lib/mock/__tests__/engine.test.ts`, because the failure is silent. |
| 32 | Sentry, windows, preconditioning, every setting | Only six commands had an optimistic patch. The rest sent the command and left the row reading its old value for the four seconds until the read-back — the exact symptom of a command that does not work, on commands that do. | `optimisticPatch` covers every command with a state field, and `src/hooks/__tests__/optimistic-patch.test.ts` lists them: adding a command without a patch fails there. It also pins the ones that must stay `null` — `honk` and `flash` are momentary and a patch would invent a state the car does not have. |
| 33 | `/v2/commands` | Every setting lived in one **Setări** block at the bottom, so the charge limit was several scroll-lengths from the charging switch it governs, and the cabin temperature was nowhere near the climate switch. Groups were organised by *kind of control* rather than by *part of the car*. | Grouped like the Tesla app: charge limit, amperage and both schedules inside **Încărcare**; temperature inside **Climatizare**. A group is now one unbroken run of hairlines holding both switches and settings, so `Rows` renders the controls too and the "Setări" block — and its i18n key — is gone. |
| 34 | `/v2/commands` | Charge port was **two rows**, "open" and "close", neither of which said which one the port was in — and the amperage chips lit nothing on arrival, so a car with a setting looked like a car without one. | One row per state, like the lock: label = the command that changes it, value = where it is now. Amperage seeds from `chargeAmps`. |
| 35 | `/v2/commands` | A row whose field was `null` still printed a state — `BLOCATĂ` for a car that had never said. A fabricated value reads exactly like a reading, with nothing to tell them apart. | `reads()` returns `undefined` for `null`, so the right of the row is empty when the car has not answered. |
| 36 | The car diagram | An open door swings about ten units past the body, and an SVG clips at its `viewBox` — so the line was cut at the frame edge on the one state that most needs to read at a glance. Invisible from the source; found by rendering all eight states to a sheet and looking at it. | `viewBox="-14 0 228 375"`. |
| 37 | The car diagram | It read as a pictogram rather than a drawing: the silhouette was decent but its interior was empty — no shutlines, no arches, wheels as four plain rounded rectangles, no lamps, mirrors as two bare sticks, and no system behind the stroke weights. | Restyled to the linework discipline of a technical blueprint: three weights and nothing outside them, panel shutlines, wheel arches, headlamp and tail signatures, mirrors with a shaped head. |
| 38 | The car diagram | Blunt at both ends, the car came out nearly symmetric front-to-back — the mirrors were the only thing saying which end was the front. | The nose tapers across the front overhang, the tail stays flat and square. The taper must **complete** by the front axle (0.175 of the length, the real 841mm overhang) or the front wheels stand outside the bodywork. |
| 39 | The car diagram | The first restyle put its new detail exactly where the eye already goes. Wheels and arches at shutline weight, with tread, became four dark corner blobs that outweighed every state indicator and went to mush at 196px. | Structure that appears four times sits a tier lighter than structure that appears once. Wheels dropped to detail weight, tread removed — at this size it was never tread, it was noise. |
| 40 | The car diagram | The bonnet drawn full-width and lifted 11 units threw an amber horseshoe across the whole nose, crossing the body line: it stopped reading as a lid. A headlamp swept out to `x(52)` ran into the front tyre, which starts at `x(48)`, and the join read as a broken line rather than as either part. | Narrower lids moving 6 units, so an open lid stays recognisably the shape it is when shut; lamps held inboard of the tyre. Both found by rendering, not by reading the source — as was every entry in this block. |
| 41 | `/v2/commands` | Reported as misleading a **second** time, after #28 had already made every label a clean imperative. The labels were not the fault. With an imperative label plus a state beside it, one tap changes *both* halves — the row renames itself and the value flips — so there is no fixed point to read the change against, and the control you were reaching for is no longer called what it was called a second earlier. The icon swapped too, a third moving part saying what the value already said. Tesla's own app has the identical problem in the identical place: its window control reads "Close" when a window is open and "Vent" when they are shut. | Anything with a state is now a **switch** with a stable noun label (`Blocare uși`, `Mod Sentry`, `Port de încărcare`…); the one thing without a state — `remote_start`, which Tesla gives no way to cancel — is the only button. This is the standard split rather than a preference: a control for two mutually exclusive states is a switch that names the option, a label describing what will happen belongs on a button. One thing moves per tap, and the label can be found by memory. |
| 42 | `/v2/commands` | A two-position switch cannot say "the car has not told me". Parked at off it would be a claim, rendered identically to a reading — the same defect as #16 and #35 in a third shape. `role="switch"` has the same trap: ARIA allows it only true/false, so an unknown announced through it is flattened to "not checked". | A third position: centred, dashed track, no state word. Seven pixels of travel is not a difference on a phone, hence the dash as well as the position. Announced as `role="checkbox"` with `aria-checked="mixed"`, the role that carries a third state. Pinned by `src/components/v2/__tests__/toggle-row.test.tsx`. |
| 43 | The car diagram | Drawn in plan view specifically so all four doors and all four windows could be read separately — a justification that does not survive contact with the controls, since `lock`/`unlock` and `vent_windows`/`close_windows` act on **all** of them and no per-door command exists. The precision was real and nothing used it. | Redrawn as a three-quarter view. Far-side openings still show as slivers beyond the roofline, so "you left a door open" survives the change of projection. |
| 44 | `/v2/charging` | Self-inflicted by #33. Moving the settings into their topical groups on Commands left the **charge limit and the charging schedule in two places at once** — and the two copies had different layouts and different contents, since this one never had the amperage. Two places to change one setting is two places for them to disagree. | The copies are gone. In their place a row naming what is on the other screen — `Limită, amperaj, programare` — because a link whose destination you have to guess is a link nobody follows. |
| 45 | Every `Sheet` | No way out. The grab handle LOOKS draggable and is not, so the gesture it invites does nothing, and the only working dismissal was tapping the backdrop — invisible as an affordance, and on the charger screen the backdrop is a map you would rather not poke. Reported as "I can't close the station layer". | An explicit close button beside the handle, 44px, labelled for screen readers from `common.close`. Fixes the vehicle switcher's sheet at the same time. |
| 46 | `/v2/chargers` | Selecting a station changed **nothing visible on the map**. Its marker had selected styling — a white ring, a blue fill — that almost never rendered, because the marker was inside `MarkerClusterGroup` and got swallowed by a cluster bubble at every zoom where its neighbours collapse, which is exactly when you most need to see which one you picked. | The selected station is rendered outside the cluster layer with `zIndexOffset`, so it is always drawn and always on top. |
| 47 | `/v2/chargers` | "Vezi pe hartă" moved the map exactly as far as selecting a row did: not at all. `MapContainer`'s `center` prop is read once at mount, so changing it later does nothing, and nothing else was listening. | A `PanTo` helper on `useMap()`. It only ever *increases* zoom, so arriving at a station never discards a wider view the driver chose. |
| 48 | `/v2/chargers` | The station sheet read **`la {km} km`** — a raw i18n placeholder printed on screen. `distance_km` is the phrase "la {km} km", a whole sentence with a value in it, and it was being used as a bare label with nothing interpolated. Beside it, `address_unknown` ("Adresă indisponibilă") was used as the *label* for the address row while the row printed a perfectly good address next to it. | Two new keys that are labels rather than sentences: `distance_label`, `address_label`. `address_unknown` stays as what it always was — the `reason` shown when there is no address. |
| 49 | Every screen, on a second browser | The app rendered in **English on the car's screen and Romanian on the phone, for the same account**. The locale is a preference the user set and it is stored on their profile — but `resolveLocale()` read only the cookie and `Accept-Language`, and a cookie lives in one browser. Signing in anywhere new meant the stored choice was never consulted and the browser's header won. A preference the user deliberately saved must outrank a header the browser guessed. | The account's `locale` is read when the cookie is absent, between the cookie and the header. Only on the requests that have no cookie, so the usual one pays nothing, and any failure falls through to the header rather than breaking the page — a page in the wrong language beats no page. |
| 50 | `/v2/chargers` | The nearby list showed **the same station twice, three times over**: "iHunt · 110 M · 200 KW" then "iHunt · 110 M · 200 KW", then Renovatio twice, then iHunt again twice. A site with several stalls arrives from the API as several chargers with the same name, coordinates and power — correct data, and a list that reads as broken. | Grouped by site: name plus coordinates rounded to ~100 m, which is one car park and not the next operator down the road. The row says `· 2 puncte` and opens the strongest stall at that site rather than whichever the query returned first. Pinned by `src/lib/chargers/__tests__/site-grouping.test.ts`, including the drift between two feeds of one site and the same chain on a different street. |
| 51 | The bottom bar and More | **Three separate menu entries were all a map** — find my car, the trip planner, and the station list — which is three places to look for one question: where am I going, and where do I charge. Meanwhile the bottom bar spent a quarter of itself on Charging, a look-back screen, while "where can I charge" sat two taps deep under More, which is the decision you make on the road with the battery falling. | One **Hartă** tab holding all three, and Charging moved into More beside Costs. A bottom tab is for what you need while moving. The tab lights on all three of its routes — a tab bar with nothing lit is a tab bar that has lost you. |
| 52 | `/v2/chargers` | Picking a station drew a pin and nothing else. How far it actually is by road, and which road, is the whole question — and the app already had four routing providers wired up for the trip planner, unused here. | `POST /api/route` returns one road between two points: a line, a distance and a time. Not `/api/trip-plan`, which answers where to stop and for how long and pays for it in latency and charger queries — asking the planner to draw an arrow would be running a route optimiser to show a direction. The line is solid and primary-coloured, unlike the dashed walk line, because that one is a bearing we did not compute and this one is a road we did. |
| 53 | `/debug` | The owner read the panel and reported it: it warned that his Virtual Key was not paired, on a morning when **eighteen commands had already reached the car**. The pairing warning had a freshness filter nowhere — `some(...)` over the last 200 log rows — so a refusal from three days earlier warned for ever, and nothing on screen said how old it was or what had happened since. A diagnostic that cries wolf is worse than one that says nothing, because the next real failure is the one you scroll past. | The warning needs the refusal to be **recent AND not since contradicted**: any command counted in the last 24h is the car accepting our key, and it outranks an older line claiming otherwise. The panel now leads with what succeeded — commands, reads, wakes — above the list of what failed. `teslaCalls` was already in the payload and the client had never read it. |
| 54 | `/debug` | The Tesla checklist said `next: partner account registration` permanently. Its fallback was unconditional, so once every environment variable was set there was no state in which it could report "done" — including on a day when commands were demonstrably reaching the car, which is only possible if registration, pairing and the signing proxy all work. | Registration has no environment variable to read, so it is inferred from evidence rather than asserted: commands in the last 24h close it. A checklist whose last item can never be ticked is a checklist nobody believes. |
| 55 | `austria` connector | `AUSTRIA_URL` defaults to empty because the endpoint went away and no replacement has been verified. The country sweep checked that; the per-tile path did not — so every corridor ingest called `fetch("?geometry=…")` with no base and logged `Failed to parse URL`. **An outage that reported itself as a parser bug**, for three weeks. | One guard, both callers. |
| 56 | `ndw` connector | The endpoint rejects any bbox much larger than a province, and the connector had a geographic gate that tested **overlap**. A corridor tile spanning 6,43 → 22,53 clips the Dutch border by a corner while being sixteen degrees wide: it passed the gate and was rejected by the API, on every corridor ingest, for three weeks. **A gate that was necessary and not sufficient** — and the log line read as the API's fault rather than ours. | Clipped to the country, then swept in the same windows `fetchCountryNl` already used. Pinned by three cases in `ndw.test.ts`, including the exact offending bbox. |
| 5 | `/v2` (map, chargers) | Rows linking to Google Maps used `next/link`, which navigates in place. Installed as a PWA there is no back button, so a walking route handed the app's only window to Google Maps. | `Row` renders a plain `<a target="_blank" rel="noreferrer">` for any `http` destination. |

---

## What five attempts at a drawing cost, and what they taught

The car diagram is deleted. It went through five versions — a plan view, a
lit plan view, a three-quarter, a lit three-quarter, and an abandoned filled
silhouette — and the owner's verdict on the last shipped one was that it looked
like a child drew it. He was right, and the cause was never draughtsmanship: a
representational illustration gets judged as an illustration, and at 208px on a
phone it loses that judgement however correct the geometry is. Five rounds is
enough evidence to stop.

Its header carried a list of faults, every one of which was invisible in the
source and obvious in a render. The list is kept here because it is the only
part of that file that was never wrong, and because most of it generalises:

**About the thing being drawn**
- A 3.05:1 body against a car that is 2.54:1 — which is exactly why it read as
  a capsule, and which no amount of source review would show.
- Flanks curving continuously nose to tail. A car is straight-sided between the
  arches; without that straight it is a capsule whatever the length ratio says.
- Both ends blunt, so the car was near-symmetric front-to-back and the mirrors
  were the only thing saying which end was which.
- A nose taper that had not finished by the front axle, so the wheels stood
  outside the bodywork.
- A flat rear deck over a tall tail, which read as a pickup bed.

**About drawing state**
- Doors rotating INTO the cabin: the left/right angle signs were swapped.
- `opacity` on the glass elements instead of `fill-opacity`, so the whole shape
  vanished — outline included — whenever the climate was off.
- A lid translated far enough to stop being a lid: a full-width bonnet slid 11
  units threw an amber horseshoe across the nose.
- A lid opened "a bit". A panel hinged at the cowl passes edge-on at 44°, so a
  bonnet cracked 30° is *less* visible than a shut one.
- A far door swung to the same angle as a near one shows only a spike past the
  roof rail. A readout that cannot be read is wrong in the way that matters,
  even when it is geometrically right.
- An open door clipped at the `viewBox` edge, on the one state that most needs
  to read at a glance.

**About hierarchy and light**
- Detail put where the eye already goes: wheels and arches at shutline weight
  became four dark corner blobs that outweighed every state indicator.
  Structure appearing four times must sit a tier lighter than structure
  appearing once.
- A near-side outline stroked as one closed path, half of which is interior —
  so a silhouette-weight line ran through the car's middle and the hierarchy
  stopped meaning anything.
- A black contact shadow on a page that is already L 0.08. Black is fourteen
  sRGB levels below that ground: the shadow was drawn, was correct, and was
  invisible. On a near-black UI a shadow needs a light, not more black.
- A cast shadow thrown where the light would actually throw it — which is the
  ground the car itself hides. Correct, and invisible for the second time.

**The one that outlives all of them**
Every entry above was found by rendering the component to a page and looking at
it. None was found by reading the source, and several survived multiple careful
readings. That harness — render every state, screenshot it, look — is the only
reason the drawing stopped regressing, and it is what the status panel replacing
it is verified with too. It caught a defect there within minutes: an open window
summoned a schematic that had no window marks on it.

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
