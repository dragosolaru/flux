# More cars, more users, and whether to buy the connection

*2026-08-12. Answers three questions: does a second car cost more, are commands
unlimited, and should a third party sit between Flux and the cars.*

---

## 1. Does another car cost more?

**From Flux: no.** Nothing in the app is priced per vehicle. `vehicles` is a
table, the dashboard renders whatever is in it, and the free-tier limits that
exist are on *document uploads* (5 energy + 10 vehicle a month), not on cars.
`canAddVehicle` caps the free tier at one vehicle, which is a product decision
you can change in one line, not a cost.

**From Tesla: yes, but not per car — per request.** Tesla bills the **partner
account**, not the driver. Adding a car does not cost anything by itself; it
costs whatever that car's data gets polled and commanded.

That distinction is the whole game:

| What we do | How often | Cost weight |
|---|---|---|
| `vehicle_data` poll | every 30 s while a dashboard is open | **dominant** |
| `vehicle_data` poll | daily cron per vehicle | small |
| A command | when someone taps | negligible |
| `wake_up` | when a command hits a sleeping car | small, but wakes the car |

Ten cars whose owners never open the app cost almost nothing. **One car with a
dashboard left open all day costs more than all ten.**

### The numbers — read from Tesla, 2026-09-02

This section used to refuse to quote a price list, on the grounds that quoting
one from memory is guessing. That was right, and it is now unnecessary: the
rates below come from Tesla's own billing page.

| Category | Rate |
| --- | --- |
| Device data (`vehicle_data`) | **$0.002** per request |
| Command | **$0.001** per request |
| Wake | **$0.020** per request |
| Streaming signal (Fleet Telemetry) | **$0.00000667** per signal ($0.00667 per 1,000) |
| Free credit | **$10 per month, per partner account** |

Tesla does not publish these as a table. They are solved from the two worked
examples on the billing page, and the solution is exact — it reproduces all
three of Tesla's own totals to the cent, and independently reproduces the
published "1,211 commands = $1.21":

```
Before optimisation: 384 data + 4 commands + 4 wakes                = $0.852
After optimisation:    0 data + 4 commands + 1 wake + 300 signals   = $0.026
Fleet study:        ~1,000 signals/hour = $0.00667/h; same via data = $0.12/h
```

Three equations, four unknowns, and the fleet study pins two of them directly.

**What it costs us, at those rates:**

| | |
| --- | --- |
| One hour with a dashboard open (30 s poll) | **$0.24** |
| One visit, with the 10-minute idle cut-off | **$0.04** |
| Daily cron, one vehicle, per month | **$0.06** |
| `DAILY_READ_BUDGET = 200`, per vehicle per month | **$12.00** |
| What the $10 credit buys | 5,000 data requests ≈ **4 active users** |

**Every response below HTTP 500 is billable.** A read of a sleeping car answers
408 and is charged in full — the calls that return nothing cost the same as the
ones that work. That makes Tesla's own first optimisation ("ensure the vehicle
is online before requesting data") a billing measure, not just a courtesy, and
it is the same check roadmap T3/T4 needs anyway.

**Rate limits are per minute, per device, per account** — 60 realtime-data
requests, 30 commands, 3 wakes. There is no daily cap. A 30-second poll uses two
of the sixty, so nothing we do is near them; `DAILY_READ_BUDGET` protects the
invoice, not the quota, and its comment said the opposite until today.

**Two things that disable the application, not throttle it:**

- The account's billing limit **defaults to 0** and can only be raised once a
  payment method exists. Applications over the limit, *or with no payment method
  at all*, are auto-disabled. Set both before a second person's car is connected.
- Exceeding the limit **removes every vehicle's Fleet Telemetry configuration,
  and Tesla does not restore them.** Raising the limit does not undo it; each
  car must be reconfigured. Worth knowing before building the receiver.

Still true, and still the thing to check: **developer portal → your app →
usage/billing** is the authority on what you actually spent.

`fleet_status` also returns `discounted_device_data` per VIN, which is Tesla's
own flag for whether that vehicle's data is billed at the reduced rate. We
already call that endpoint from `/debug` → Car → **Check pairing**; surfacing
the flag there is a small addition worth making before you have many cars.

### What keeps it cheap

Three things, in order of effect:

1. **Fleet Telemetry** (gate 3). The car pushes instead of being polled. This
   removes the dominant line from the table above entirely. It is the single
   largest cost lever and it is also the feature you want for other reasons.
2. **A shared server-side cache** of `vehicle_data` per vehicle, 20–30 s (gate
   1, T6). Several tabs, the map, the charging screen and the dashboard
   currently each pull their own copy. One upstream call should serve all of
   them.
3. **The idle pause that already exists.** `useVehicle` stops after ten idle
   minutes, TanStack does not poll a hidden tab, and a failed poll stops rather
   than retrying. That work is done.

---

## 2. Are commands unlimited?

**Effectively yes on cost, no on rate — and the rate limit that will bite you
first is ours, not Tesla's.**

Commands are cheap. Nobody taps *lock* four hundred times an hour. The ceiling
that matters is `checkRateLimit(userId, "commands", 30)` — thirty per hour per
user, which is generous for a human and would be limiting for automation.

The real problem is **T6**, and it is not about commands: every limit in the app
is per user, while Tesla counts per partner account. `/state` allows 120/hour
per user and the dashboard polls at exactly 30 s, so **one** open dashboard
already sits permanently at its own ceiling. Ten users put the app at ten times
whatever Tesla allows, and Tesla throttles all of them at once — which will look
like Flux is broken, not like Flux is popular.

So: unlimited commands per user is fine. Unlimited *polling* per user is the
thing that has to be capped app-wide before the second car appears.

---

## 3. Should we use TeslaFi, Tessie, Teslemetry or similar?

**No — and the reason is that you have already paid the entry price.**

The hard part of talking to a Tesla is not the API. It is:

- a registered partner account, per region
- a public key served at a fixed `.well-known` path on the registered domain
- an EC P-256 signing keypair and a Vehicle Command Protocol proxy
- Virtual Key pairing on each car
- knowing which of those four is wrong when a command fails

That took days. **It is built, deployed and working.** Buying a connection layer
now means paying a per-vehicle monthly fee to skip work already done.

What you would be trading away:

| | Own connection (today) | Reseller (TeslaFi/Tessie/etc.) |
|---|---|---|
| Cost | Tesla's request billing, shared across all users | per vehicle per month, scales linearly with customers |
| Margin | improves with scale | fixed floor under every subscription you sell |
| Latency | you → Tesla | you → them → Tesla |
| Outages | Tesla's, and yours | Tesla's, theirs, **and** yours |
| Data | whatever the API gives | whatever they choose to expose |
| Differentiator | you have the pipeline | you have the same pipeline as their other customers |
| Consent | driver authorises **Flux** | driver authorises a third party, and you explain why |

That last row is not a small thing for a product asking people to hand over
control of their car.

Also worth knowing: most of these are consumer logging services first. TeslaFi
in particular is built for owners logging their own car, not as a B2B connection
layer. Tessie and Teslemetry have real APIs, but you would still typically need
your own partner registration for OAuth, so you would be maintaining both.

### The one place buying is genuinely open

**Fleet Telemetry, and only that.**

A telemetry receiver is a long-lived mTLS service handling protobuf streams with
backpressure and reconnection — a different class of work from the REST proxy,
and the only piece on the roadmap where "a week of building plus a box to run it
on" is a real comparison against a per-vehicle fee.

If you price it: what matters is the break-even car count. Below it, buy and
ship the feature now. Above it, host it — and you are hosting the signing proxy
already, so the marginal operational cost is small.

I would still lean towards hosting, because telemetry *is* the differentiator
(see `docs/NEXT-STEPS.md` gate 3) and renting your differentiator from a vendor
who sells it to everyone else is a weak position. But that is a judgement call
about the product, not a technical constraint, and it is genuinely yours.

---

## Summary

- **Another car costs nothing extra.** Another *actively polled* car does.
- **Commands are not the cost problem.** Polling is, and the fix is gate 1 (T6)
  now and Fleet Telemetry later.
- **Do not put a reseller between Flux and the cars.** You already own the
  hardest part of that pipeline, and it works.
- **The only honest build-vs-buy is the telemetry receiver**, and even there I
  would host it.
