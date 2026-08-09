# VEHICLE CONNECTION — OAuth Flows & User Journey

> How users connect their real EV to Flux. Currently Tesla-only (live code in-tree, dormant). All other brands are mock.

---

## Current state

| Brand | Status | Notes |
|---|---|---|
| Tesla | Live code in-tree, dormant | Activate via `LIVE_INTEGRATIONS=tesla` |
| BMW, Polestar, Mercedes, VW, Hyundai, Renault | Mock only | No live adapter yet |

---

## Tesla OAuth flow (PKCE)

All `/api/tesla/*` routes return **410** unless `isLiveEnabled("tesla")` (i.e. `tesla` is in
`LIVE_INTEGRATIONS`).

```
User clicks "Connect Tesla"
      │
      ▼
GET /api/tesla/connect
  → set HttpOnly cookie: tesla_pkce_verifier  (no state cookie — see below)
  → 302 redirect to auth.tesla.com with code_challenge

Tesla authenticates user
      │
      ▼
GET /api/tesla/callback?code=…&state=…
  → verify state (self-verifying HMAC keyed to session.user.id; no cookie needed)
  → PKCE exchange: code + verifier → access_token + refresh_token
  → probe regions (EU → NA → CN) to find the first vehicle
  → AES-256-GCM encrypt tokens
  → insert vehicles row (is_active = true)
  → insert tesla_tokens row (user_id + encrypted tokens + scopes)
  → 302 /dashboard
```

**OAuth state is cookieless.** `generateState(userId)` produces
`base64url(nonce).base64url(hmac(nonce, userId))` keyed by `NEXTAUTH_SECRET`; the callback
recomputes the HMAC against the current session's user ID. Only `tesla_pkce_verifier` is stored as
an HttpOnly cookie (PKCE requires it).

> **Code bug (not fixed here):** the callback inserts the `vehicles` row **without** setting
> `data_source`, so it falls to the column default `'mock'`. No code path ever sets
> `data_source = 'live'`. As written, an OAuth-paired Tesla is stored as `mock`, so the live
> dispatch path in `/api/vehicles/[id]/state` (which requires `data_source === 'live'`) never
> activates. Pairing succeeds and tokens are stored, but live telemetry won't be fetched until the
> column is set to `'live'`.

### Token refresh

File: `src/lib/tesla/tokens.ts`

Tokens are refreshed when they are within 60 seconds of expiry. The refresh happens on the first API call that needs a valid token; there is no background refresh job.

### Command signing (Model 3/Y/S/X post-2021)

New Tesla vehicles require the Tesla Vehicle Command Protocol (VCP) which uses a signed command flow through the Tesla HTTP Proxy.

- `tesla-proxy/` contains the Dockerfile and `fly.toml` for the proxy
- Flux routes commands through `TESLA_PROXY_BASE_URL` when set
- Without the proxy, commands to newer vehicles return `412 VCP_REQUIRED`

---

## Brand OAuth complexity matrix

| Brand | Protocol | Access program | Activation difficulty |
|---|---|---|---|
| Tesla | OAuth 2.0 + PKCE + VCP | Open (developer.tesla.com) | ★★☆ (proxy needed for new cars) |
| BMW | OAuth 2.0 | BMW Developer Portal | ★★★ |
| Polestar | OAuth 2.0 | Partnership required | ★★★ |
| Mercedes-EQ | OAuth 2.0 | Mercedes Developer Hub | ★★★ |
| Volkswagen ID | OAuth 2.0 | VW API Hub | ★★☆ |
| Hyundai / Kia | OAuth 2.0 | Partnership required | ★★★★ |
| Renault | OAuth 2.0 | Renault Dev Portal | ★★★★ |

---

## User journey (Tesla live)

1. User signs up / logs in to Flux
2. Garage page shows empty state → "Add vehicle" CTA
3. User selects Tesla → taps "Connect with Tesla account"
4. Redirected to `auth.tesla.com` → authenticates with their Tesla credentials
5. Redirected back to Flux → vehicle appears in garage within seconds
6. Dashboard shows live telemetry (battery, location, climate, commands)

### What happens if the user disconnects

`DELETE /api/vehicles/:id` removes the vehicle row and cascades to `tesla_tokens`. The encrypted tokens are destroyed locally. Tesla's own token is not revoked (no server-to-server revocation call) — the user must revoke access manually at tesla.com → Account → Third-Party Apps if desired.

---

## Historical data availability

| Brand | Charging sessions | Trips | Availability |
|---|---|---|---|
| Tesla | Yes (via API) | Yes (via API) | Unlimited |
| BMW | Yes | Yes | 90 days |
| Polestar | Yes | Yes | 90 days |
| Mercedes-EQ | Yes | Limited | 30 days |
| Volkswagen ID | Yes | Yes | 30 days |
| Hyundai / Kia | Yes | No | 30 days |
| Renault | Limited | No | 7 days |

---

## Security model

- OAuth tokens stored AES-256-GCM encrypted in `tesla_tokens` table
- Encryption key: `TESLA_TOKEN_ENCRYPTION_KEY` (32-byte hex, server-only)
- The browser never sees tokens — all Tesla API calls are brokered through `/api/tesla/*`
- Supabase RLS ensures token rows are only readable by the owning user's service-role queries

---

## Going live with the Fleet API

Order matters — each step is useless without the ones above it. The debug panel
reports the same list under `tesla.steps` and names the first unmet one as
`tesla.nextStep`, so you can check progress from a phone.

### 1. Command-signing keypair

Tesla requires an EC P-256 keypair. The public half must be served over HTTPS at
a fixed path on the domain registered with the developer account; the private
half only ever lives on the proxy.

```bash
openssl ecparam -name prime256v1 -genkey -noout -out tesla-private.pem
openssl ec -in tesla-private.pem -pubout -out tesla-public.pem
```

Set `TESLA_PUBLIC_KEY` in Vercel to the contents of `tesla-public.pem`. Vercel
env vars cannot hold real newlines, so escape them:

```bash
awk '{printf "%s\\n", $0}' tesla-public.pem
```

`src/app/.well-known/appspecific/com.tesla.3p.public-key.pem/route.ts` unescapes
and serves it as `application/x-pem-file`. Verify before continuing — Tesla
reports a missing key and a malformed key identically:

```bash
curl https://<domain>/.well-known/appspecific/com.tesla.3p.public-key.pem \
  | openssl ec -pubin -noout -text
```

The route answers **503** rather than an empty 200 when the variable is unset,
because a blank 200 is the harder failure to notice.

### 2. App credentials

From the Tesla developer portal: `TESLA_CLIENT_ID`, `TESLA_CLIENT_SECRET`.

`TESLA_REDIRECT_URI` must equal the **Allowed Redirect URI** registered in the
portal, exactly — Tesla compares it as a string. That is
`https://<domain>/api/tesla/callback`: the API route that exchanges the code.
`/connect/tesla` is the page the callback redirects *back* to when it is done,
and is not the OAuth endpoint. `src/app/api/tesla/connect/route.ts` returns 500
"Tesla OAuth is not configured" when this variable is missing.

Also set `TESLA_TOKEN_ENCRYPTION_KEY` (32 bytes, base64) — refresh tokens are
AES-256-GCM encrypted at rest with it.

Set `LIVE_INTEGRATIONS=tesla` *before* trying any of this: every `/api/tesla/*`
route answers **410** until it is set, so the flow cannot start no matter what
else is configured. Step 5 below is a formality if you did it here.

### 3. Register the partner account

One call per region, with a partner token (client-credentials grant, not a user
token). Tesla fetches the key from step 1 during this call, so it must already
be live.

```bash
TOKEN=$(curl -s -X POST https://auth.tesla.com/oauth2/v3/token \
  -d grant_type=client_credentials \
  -d client_id=$TESLA_CLIENT_ID -d client_secret=$TESLA_CLIENT_SECRET \
  -d 'scope=openid vehicle_device_data vehicle_cmds vehicle_charging_cmds' \
  -d audience=https://fleet-api.prd.eu.vn.cloud.tesla.com | jq -r .access_token)

curl -X POST https://fleet-api.prd.eu.vn.cloud.tesla.com/api/1/partner_accounts \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"domain":"<domain>"}'
```

Use the EU host — `TESLA_REGIONS` in `src/lib/tesla/constants.ts` maps regions,
and a car registered in Europe is not visible from the NA host.

The app needs both OAuth grant types enabled in the portal: `client-credentials`
for this partner token, and `authorization-code` for linking a driver's account.
Check the scopes too. There are **two** lists in `src/lib/tesla/constants.ts`,
deliberately different:

- `TESLA_SCOPES` — the driver flow. Every scope Tesla offers: `openid`,
  `offline_access`, `user_data`, `vehicle_device_data`, `vehicle_location`,
  `vehicle_cmds`, `vehicle_charging_cmds`, `energy_device_data`, `energy_cmds`.
- `TESLA_PARTNER_SCOPES` — the `client_credentials` token above, kept to the
  original four. It authenticates the app, not a driver, and widening it would
  make the registration check fail whenever the portal app lacks one of the
  newer scopes.

**Every scope in `TESLA_SCOPES` must be ticked on the app in the developer
portal.** A scope the app was not granted is refused at the authorize step, not
at build time — the driver gets a Tesla error page instead of the consent screen.

**`vehicle_location` is not optional.** Tesla split location out of
`vehicle_device_data` in November 2024 and cut off grants without it in January
2025. It also needs `location_data` naming in the `vehicle_data?endpoints=`
query (firmware 2023.38+ omits position otherwise). Miss either half and the car
answers every poll normally with `latitude`/`longitude` null — which reads as a
broken map, not a missing permission. `/debug` → "Go live with Tesla" lists the
granted scopes per car and warns when this one is absent.

> **Re-registering is how the key is rotated — deploy the new one first.**
> Tesla re-fetches `/.well-known/appspecific/com.tesla.3p.public-key.pem` on
> every registration call and replaces its record with whatever the domain
> serves at that moment. So the order is: set `TESLA_PUBLIC_KEY`, redeploy the
> app, confirm the domain is serving the new key, *then* press Register.
>
> An earlier version of this note claimed the opposite, from one observation: a
> `POST` returned `200` with a two-month-old key and an unchanged `updated_at`.
> That reading was wrong. Tesla did re-fetch; the deployment was still serving
> the old key, so the record was the old key being written over itself. The
> record only looks frozen when the domain has not actually changed.
>
> Use the panel's "Check status", which decodes the served PEM to the raw EC
> point and compares it with what Tesla reports. A mismatch tells you which side
> is stale: `servedKeyPoint` present means the domain is fine and registering
> will fix it; `servedKeyPoint` null means `TESLA_PUBLIC_KEY` is unset or
> malformed and registering would achieve nothing.
>
> Reading vehicle data does not involve the signing key at all, so a mismatch
> blocks commands only — link the car first, reconcile the key when deploying
> the proxy.

### 4. Deploy the signing proxy

See `tesla-proxy/README.md` — **Coolify** and **Fly** are both documented, and
Coolify has the edge of keeping the signing key on your own hardware.
`tesla-proxy/docker-compose.yaml` declares the build, port, restart policy,
healthcheck and hostname, so a Coolify Docker Compose resource pointed at
`/tesla-proxy` needs only `TESLA_PRIVATE_KEY` filled in. Set
`TESLA_PROXY_BASE_URL` to the resulting URL.

> The signing key never belongs in the compose file, the Dockerfile or a
> committed `.env`. It signs unlock and remote-start; in git history it is
> compromised on the first clone, and recovery means a new keypair, a new
> partner registration and re-pairing the Virtual Key on every car.
>
> It should not go through a **build argument** either. Coolify injects an `ARG`
> per environment variable with the value as its default, so the deployment log
> prints it in clear — observed, not theoretical. Prefer
> `TESLA_PRIVATE_KEY_FILE` pointing at a mounted file: a PEM's five lines fit a
> file naturally, and a mount is never passed to `docker build`. Without it, every command on a
Model 3/Y/S/X built after mid-2021 fails — read-only vehicle data still works,
so this is the step whose absence looks like "the app works but no button does
anything".

Whatever hosts it needs a **publicly reachable hostname with a valid
certificate**: the callers are Vercel serverless functions with no fixed egress
addresses, and their `fetch` verifies the chain, so an IP or a self-signed cert
is refused.

> The container runs two processes, and that is load-bearing rather than
> incidental. `tesla-http-proxy` only calls `ListenAndServeTLS` — upstream
> omitted an `--insecure` flag on purpose — while Coolify and Fly both terminate
> the public certificate at their edge and forward plain HTTP. Pointed straight
> at each other, Go's TLS server answers a flat `400 Bad Request`. So the signing
> proxy binds loopback `127.0.0.1:8443` with a self-signed certificate and Caddy
> publishes plain HTTP on `$PORT` in front of it. Verified against the real
> binaries; see the README for the detail.

### 5. Flip the switch

`LIVE_INTEGRATIONS=tesla`. Until then `src/lib/live-integrations.ts` keeps the
mock simulator in front of every call, which is why the app appears to work
fully with no Tesla credentials at all.

### One key for the whole app — not one per car

This is the thing most likely to be assumed backwards, and it shapes the
multi-user design.

**Flux has exactly one command-signing keypair.** It is registered against our
domain, its public half is served at `/.well-known/...`, and *every* car that
pairs stores *that same* public key as its Virtual Key. A thousand customers
with a thousand cars still means one keypair, one pairing URL, and a thousand
separate approvals.

What is per-user is the **OAuth grant**: access and refresh tokens, one
`tesla_tokens` row per vehicle, encrypted individually. Identity is per driver;
the signing key is per application. Two different things that both get called
"the Tesla key" in conversation.

Three consequences worth designing around:

**Rotating the key re-onboards the entire fleet.** Every paired car validates
commands against the public key it stored at pairing time. A new keypair means
every one of them must visit the pairing link again — an event you cannot do
quietly, and one that leaves commands broken for anyone who ignores the prompt.
Rotate before there are customers, not after.

**One key compromise reaches every customer's car**, because it is the same key
everywhere. That is what makes the handling rules non-negotiable: not a build
argument (Coolify prints those in the deploy log), not in git, not in a chat.
The blast radius is the whole fleet, not one account.

**Nothing about pairing is per-user in our code.** `teslaVirtualKeyUrl()` takes
no arguments and needs none. Resist the pull to store a per-vehicle "pairing
key" — there is no such thing, and the column would only ever hold the same
value repeated.

> **Commands must address the car by VIN, not by Fleet API id.** The proxy
> refuses anything else — `pkg/proxy/proxy.go` checks the path segment is 17
> characters and answers `404 expected 17-character VIN in path (do not user
> Fleet API ID)`. Sending the numeric id makes every signed command fail before
> it reaches Tesla, which looks exactly like an unpaired key and cannot be fixed
> by pairing. Tesla's own REST API accepts either, so `sendVehicleCommand` uses
> the VIN only when routing through the proxy.

### 6. Pair the Virtual Key

Each owner visits `https://tesla.com/_ak/<domain>` on their phone with the Tesla
app installed and approves. Without pairing, signed commands are rejected even
with everything above correct.

`/debug` → "Go live with Tesla" → **Pair Virtual Key** builds that link from
`TESLA_REDIRECT_URI`'s host (`teslaVirtualKeyUrl()`), so the domain cannot drift
from the registered one. It is not a checklist step: nothing on the server can
see whether a car accepted the key, so it would sit unticked forever and pin
`nextStep` to itself.

**Order matters — pairing before step 4 achieves nothing.** The key is only
useful once something signs with its private half. With no proxy the request
reaches Tesla unsigned and is refused whether or not the key is paired.

> **`412 Vehicle Command Protocol required` has two causes and they are not
> interchangeable.** The routes now separate them by whether
> `TESLA_PROXY_BASE_URL` is set:
>
> | code | meaning | who fixes it |
> |---|---|---|
> | `PROXY_NOT_CONFIGURED` | nothing is signing commands — the proxy is not deployed | operator (steps 4–5) |
> | `VCP_REQUIRED` | signed, but this car has not paired the key | owner, on their phone (step 6) |
>
> They used to share one message — "this car needs a Virtual Key set up" — which
> is wrong for the first and by far the more common case. It sent the owner to
> pair a key that would have changed nothing.

> Scope note: `TESLA_SCOPES` requests everything, including `vehicle_cmds`
> (unlock, remote start), `vehicle_location` and `user_data`. `docs/TODO.md`
> item 1b tracks offering a read-only link for owners who only want cost and
> trip tracking. The consent screen has a tickbox per permission, so a driver
> can already hand back a subset — the refresh call sends no `scope` for exactly
> that reason (OAuth forbids widening a grant on refresh, so pinning the full
> list would have broken every refresh for a partial grant), and the granted set
> is stored on the `tesla_tokens` row as Tesla reported it.
