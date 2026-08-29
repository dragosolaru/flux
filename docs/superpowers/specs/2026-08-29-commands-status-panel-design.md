# The car drawing goes; a status panel takes its place

**Status:** design, awaiting review
**Screen:** `/v2/commands`

## Why

The drawing has had five attempts, three of them thrown away, and the owner's
verdict on the last was that it looks like a child drew it. That verdict is
correct and the cause is not draughtsmanship: a representational illustration
is judged as an illustration, and at 208px on a phone it will lose that
judgement no matter how the geometry is fixed. Five rounds is enough evidence.

What the drawing was *for* survives it. It answered one question no row below it
can answer — **which** door, **which** window — because `doorsOpen` and
`windowsOpen` arrive per corner and no row can say that without becoming four
rows nobody wants.

So: keep the job, drop the picture.

## The shape

Two levels of the same information, shown one at a time.

**Always: a chip strip.** Five chips — doors, windows, bonnet, boot, port —
each a label and a dot. Dark when shut, amber when open, dotted when the car has
not reported. A count where one helps (`1 UȘĂ`). Purely typographic: there is no
shape to draw badly, and it reads at any size.

**Only when something is open: a schematic footprint.** An abstract rounded
rectangle with a mark at each position — four door marks, bonnet, boot, port.
Amber where open. It is a schematic, not a picture: nobody looks at a rounded
rectangle and calls it badly drawn.

Progressive, because the common case is that everything is shut. That case costs
five chips and no vertical space worth arguing about. The uncommon case — the
one where "which" is a real question — gets a full answer, and only then.

## Decisions taken

The owner delegated these three.

**Windows get positions in the footprint, doors do not lose theirs.** Eight
marks on one small shape is too many, so the footprint carries **doors** at four
positions plus bonnet, boot and port; windows stay a chip with a count. Rationale:
a window left down is a weather problem, not a security one — knowing *that* one
is down matters, knowing *which* rarely changes what you do. A door is different:
which door tells you where to walk.

**Climate and sentry leave the panel entirely.** They already have switches with
state twelve pixels below, which the doors do not. Repeating them buys nothing
and dilutes the panel's one job: things that are *open*.

**Charging keeps the port.** The port is the one thing that is both an opening
and a running state, and green-while-charging is information the chip strip
should carry.

## Behaviour

- **Tri-state, as everywhere else.** `null` is dotted and fainter than shut, and
  is never drawn as shut. A panel that reports "closed" for a car that has said
  nothing is the same defect as the status row that fell through to "Parcată".
- **The reading's age moves into the panel.** `Actualizat acum 2 min ·
  reîmprospătează` currently floats below the drawing as a separate control. It
  belongs here, so the panel is one thing that says: this is the state, as of
  then, tap to re-read.
- **Nothing animates on arrival.** The panel is read at a glance; a chip that
  fades in is a chip you read late.

## What is deleted

`src/components/v2/car-diagram.tsx` and its tests. The `MM` proportion block,
the projection machinery, the lighting model — all of it. Its header carries a
list of fifteen faults found by rendering rather than reading; **that list moves
into the new component's header before the file goes**, because every entry is a
way to fail at any drawing and it is the only part of the file that was never
wrong.

## Testing

- Unit: the panel renders no state word and a dotted mark for `null`; a count
  that matches the number of open doors; the footprint mounts only when
  something is open.
- Visual: the render-and-look harness, at 208px and 600px, across every state —
  the method that found every real defect in this component's history.

## Not in this spec

**In-car navigation.** The browser GPS probe answered on the car's own screen:
Chromium 148, permission granted, ±1–2 m, ~10 fixes per second. That removes the
blocker recorded in `docs/FEATURES.md` §25b and makes navigation in the browser
possible with no Fleet Telemetry, no mTLS and no always-on host. It is a bigger
piece of work than this one and gets its own spec.
