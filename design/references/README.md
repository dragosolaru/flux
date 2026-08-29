# Drawing references

Not shipped. Nothing here is imported by the app — these are things to look at
while drawing `src/components/v2/car-diagram.tsx`, which is authored by hand.

## vecteezy-sedan-side-profile.svg

Supplied by the owner as a candidate for the car diagram. **It cannot ship**,
for four reasons, and they are worth writing down so nobody re-litigates it:

1. **It is a two-door coupé.** The diagram has to show a rear door opening. A
   car without one cannot say that.
2. **1.3 MB, 432 paths, gradient meshes with hundreds of stops.** The whole
   current diagram is a few KB, and this renders on a phone.
3. **It is a recognisable production car**, which the diagram deliberately is
   not — it stands in for whatever car the driver actually owns.
4. It is one welded illustration. Nothing in it can be driven from state: you
   cannot open a door on it.

What it IS good for, and why it is kept: **proportion and stance.** The upper,
outline version is a clean professional side profile — the greenhouse cut, the
wheel-arch treatment, the sill line, the ground shadow. Draw against it.

**Licence: Vecteezy.** Free downloads require attribution and the terms are
theirs, not ours. Since it is reference only and never reaches a user, no
attribution is owed — but if any part of it were ever traced into shipped
artwork, that changes, and the licence would have to be checked and credited
visibly rather than in a comment.
