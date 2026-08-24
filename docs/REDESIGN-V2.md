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

| Screen | v2 | Compare with |
| --- | --- | --- |
| Car (dashboard) | done | `/dashboard` |
| Commands | — | `/commands` |
| Map & find my car | — | `/map` |
| Charging | — | `/charging` |
| Trip | — | `/trip` |
| Costs | — | `/costs` |
| Garage | — | `/garage` |
| Documents | — | `/documents` |
| Insights | — | `/insights` |
| Energy | — | `/energy` |
| Settings | — | `/settings` |

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

**Defects found while porting:** none yet on this screen — the v1 dashboard was
worked over heavily in the August remediation pass. Anything found from here on
gets a row in the table below.

---

## Defects found while redesigning

Fixed in the **real** app, not only in `/v2`. Empty until the first one lands.

| # | Screen | What was wrong | Fixed in |
| --- | --- | --- | --- |

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
