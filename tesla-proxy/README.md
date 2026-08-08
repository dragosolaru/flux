# Flux Tesla HTTP Proxy

Microservice that signs Tesla vehicle commands on behalf of Flux. Required for
Model 3/Y/S/X built after 2021 (Tesla deprecated unsigned REST commands).

## What it is

A thin Alpine container around Tesla's official `tesla-http-proxy` Go binary
(`github.com/teslamotors/vehicle-command`). It receives REST requests from
Flux, signs each command with the EC P-256 private key paired as a Virtual
Key on the user's vehicle, and forwards them to the Tesla Fleet API as
authenticated `signed_command` protobufs.

The proxy is **stateless** — the only secret it holds is the command-signing
private key, injected as an environment secret and never baked into the image.
Flux passes the user's Tesla access token in the `Authorization` header on every
request.

Deploy it anywhere that runs a container and can give it a real certificate:
**Coolify** (below) and **Fly** (below that) are both covered. Coolify keeps the
signing key on your own hardware, which is the better default if you already
have it running.

## Deploying on Coolify

Works, and keeps the command-signing key on hardware you own instead of a third
party's. Coolify's Traefik terminates the public certificate and forwards plain
HTTP, which is exactly what this image expects.

`docker-compose.yml` declares the build, the port, the restart policy, the
healthcheck and the hostname, so there is almost nothing to fill in by hand:

1. **New Resource** → **Docker Compose** → your Git repository.
2. Base Directory **`/tesla-proxy`**. Coolify finds `docker-compose.yml` there.
3. **Environment Variables** → set `TESLA_PRIVATE_KEY`. It is the one value the
   compose file deliberately leaves empty. **Use single-line base64** —
   `base64 -w0 < private.pem` (`base64 < private.pem | tr -d '\n'` on macOS).
4. Deploy. `SERVICE_FQDN_PROXY_8080` makes Coolify generate the hostname, route
   it to container port 8080 and issue the Let's Encrypt certificate; the result
   shows up in the UI and can be swapped for your own hostname.
5. Set `TESLA_PROXY_BASE_URL` in Vercel to that hostname — **`https://`, not
   `http://`** — and redeploy Flux. Coolify shows the generated hostname as
   `http://` until TLS is enabled for it; the app refuses a plaintext value
   rather than sending the driver's Tesla access token over it in the clear.

Prefer the click-through route? **Application** → Build Pack **Dockerfile**,
Base Directory `/tesla-proxy`, the same environment variable, a domain of your
own, and **Ports Exposes `8080`** — that field defaults to `3000`, and Traefik
targets whatever it says. Get it wrong and the container reports healthy while
the domain answers `no available server`, because the healthcheck runs inside
the container and Traefik knocks on the outside.

### Without Git at all

Coolify's **Create a new Application → "deploy a simple Dockerfile, without
Git"** works too: paste the contents of `Dockerfile` into the box. It is
self-contained — no `COPY` of local files — precisely so that this works, since
that mode gives the build no context to copy from. Everything the container
needs is either fetched during the build or written inline.

Then set **`TESLA_PRIVATE_KEY`** in Environment Variables, expose port **8080**,
and give it a domain. There is no compose file in this mode, so the hostname is
not generated for you and the healthcheck comes from the Dockerfile's own
`HEALTHCHECK` instruction rather than from compose.

Trade-off worth knowing: a pasted Dockerfile has no version history and no
redeploy-on-push. Fine for getting the proxy up today; the Git route is better
once it matters.

### Where the key comes from

`/debug` → "Go live with Tesla" → **Generate keypair** mints the EC P-256 pair
and hands back the private half as single-line base64 and the public half as
PEM. Admin-only, rate limited, generated on an explicit press and stored
nowhere — not in the database, not in a log, and deliberately excluded from
"Copy all", which exists to be pasted into a chat. Close the page and it is
gone.

It exists because the two halves belong in two different places, neither of
which is a shell: the private half on the proxy host, the public half in
`TESLA_PUBLIC_KEY` on the app. From a phone the alternative is finding a machine
with `openssl`.

With a machine to hand, the equivalent is:

```bash
openssl ecparam -genkey -name prime256v1 -noout -out private.pem
openssl ec -in private.pem -pubout -out public.pem
```

**Both halves must come from the same generation**, and if you regenerate you
have to redo both places. Tesla re-fetches the public key from `/.well-known` on
every registration call, so rotating is: new pair → `TESLA_PUBLIC_KEY` deployed
and confirmed being served → press Register → Check status. Skip the "confirmed
being served" step and Tesla re-registers the old key over itself, which looks
exactly like registration being ignored.

### Preferred: mount the key as a file

`TESLA_PRIVATE_KEY_FILE` points the entrypoint at a file instead of an
environment variable, and it avoids both traps below in one move — a file holds
a five-line PEM without ceremony, and it never becomes a build argument.

In Coolify: **Storages** → **Add File Mount**, path `/run/secrets/tesla_key`,
contents the raw PEM. Then set `TESLA_PRIVATE_KEY_FILE=/run/secrets/tesla_key`.
No base64, no single-line juggling.

`TESLA_PRIVATE_KEY` still works and takes raw PEM or base64; the file wins if
both are set.

### Keep the key out of the build

Coolify inserts an `ARG` for every environment variable after each `FROM`, and
**writes the value in as the default**, so the deployment log prints it in
clear:

```
FROM golang:1.23-alpine AS build
ARG TESLA_PRIVATE_KEY=<the actual value, printed three times>
...
SecretsUsedInArgOrEnv: Do not use ARG or ENV instructions for sensitive data
```

Observed in a real deployment log, not theoretical. A key that signs `unlock`
and `remote_start` must not go through that path: it lands in the build log, in
the image metadata, and in anything that scrapes either.

Nothing in this Dockerfile reads the key at build time. Leave **Build
Variable?** off for it, and prefer the file mount above — a mounted file is
never passed to `docker build` at all.

### The one thing that must not go in the file

**Never put `TESLA_PRIVATE_KEY` in `docker-compose.yml`, the Dockerfile, or a
committed `.env`.** That key signs unlock and remote-start commands. In git
history it is compromised the moment the repo is cloned, and the only remedy is
generating a new pair, re-registering the partner account, redeploying the
public key and re-pairing the Virtual Key on every car. Coolify stores it
encrypted and injects it at runtime; that is the whole point of the placeholder.

### Two requirements that are easy to miss

The host must be reachable from the **public internet** — the callers are
Vercel's serverless functions, which have no fixed egress addresses — and it
needs a real certificate for a real hostname, because their `fetch` verifies the
chain and refuses an IP or a self-signed cert.

No custom Traefik labels are needed. If you find yourself setting
`loadbalancer.server.scheme=https`, something is wrong: the container publishes
plain HTTP on purpose.

Health check: `GET /api/1/vehicles` with no token should return **403**. The
proxy rejects the missing token itself rather than asking Tesla — measured at
1.5 ms — so this is free to poll and costs no Fleet API quota. **502** means
Caddy is up but the loopback TLS hop behind it is not; **400** means something
is speaking plain HTTP straight at the signing proxy; a TLS error means the
public certificate is wrong. `docker-compose.yml` encodes exactly this check.

### "no available server" while the container is healthy

That string is Traefik's, returned as a `503` when a router matches the domain
but the service behind it has no reachable backend. A healthy container plus
this message points at the port, not the app.

In the **Application** flow, Coolify's **Ports Exposes** is what Traefik targets,
and it defaults to `3000`. This image publishes **8080**. Traefik then forwards
to a port nothing listens on, while the container's own healthcheck — which
reads `$PORT` from inside — keeps passing. Healthy and unreachable at the same
time, which is why the two readings look contradictory.

Set **Ports Exposes** to `8080`. The Docker Compose flow does not have this
problem: `SERVICE_FQDN_PROXY_8080` names the port explicitly.

Two rarer causes, if the port is already right: the container is not on the
`coolify` network, or Traefik has not reloaded — restarting the Coolify proxy
settles both.

### "not an EC private key"

The value reached the container but is not a key. A placeholder left in the
field is the usual reason; a truncated paste is the other. A real one looks
like:

```
-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIEMy...
-----END EC PRIVATE KEY-----
```

It must be **the key whose public half Tesla holds**. Check with `/debug` → "Go
live with Tesla" → **Check status**, which decodes the served PEM to a raw EC
point and compares it against Tesla's record.

Losing the private half is recoverable: generate a new pair, put the public half
in `TESLA_PUBLIC_KEY`, redeploy, confirm the domain serves it, then **Register**.
Tesla re-fetches `/.well-known` during registration and replaces its record. The
confirm step is the one people skip — register while the old key is still being
served and Tesla dutifully re-registers the old key, which reads as the call
being ignored.

Generating without a machine: use the panel's **Generate keypair**. With one:

```bash
openssl ecparam -genkey -name prime256v1 -noout -out private.pem
openssl ec -in private.pem -pubout -out public.pem   # this half goes in TESLA_PUBLIC_KEY
```

### "TESLA_PRIVATE_KEY env var is required" while the panel shows it set

The value arrived empty, and a multi-line PEM is almost always why. A `.env`
file holds one line per variable, so a five-line PEM pasted into a control panel
does not arrive truncated — it arrives **empty**, which is why the container
reports the variable as missing while the UI clearly shows it filled.

Re-paste it as one unbroken line:

```bash
base64 -w0 < private.pem          # GNU
base64 < private.pem | tr -d '\n' # macOS
```

Plain `base64` wraps at 76 columns, so `-w0` is not optional here. The entrypoint
now names this case directly, and separately reports a value that is set but does
not decode to an EC key.

If the value really is single-line base64 and it still arrives empty, check the
variable is a **runtime** variable rather than build-only.

> **The published URL is an open relay.** Tesla's own binary warns about this:
> anyone who can reach it can forward requests to Tesla's API. They still need a
> valid Tesla token for an account that paired this app's Virtual Key — so the
> practical exposure is a Flux user bypassing Flux's own rate limiting and the
> `command_events` audit trail, not an outsider driving your car. Tracked in
> `docs/TODO.md`; a shared secret between Vercel and Caddy is the fix.

## Deploying on Fly from a phone

`fly deploy` needs flyctl, which needs a machine. `.github/workflows/deploy-tesla-proxy.yml`
runs it on Actions instead, so the whole setup is reachable from a browser:

1. **Fly dashboard** → create an app named `flux-tesla-proxy` (or tick "Create
   the Fly app" on the first workflow run), then **Tokens** → create a deploy
   token.
2. **GitHub** → repo Settings → Secrets and variables → Actions → new secret
   `FLY_API_TOKEN`, paste the token.
3. **Fly dashboard** → the app → Secrets → add `TESLA_PRIVATE_KEY`. The value is
   the EC private key. Fly secrets handle multi-line values, so a raw PEM works
   here; single-line base64 works everywhere and is the safer habit. This is a
   Fly secret, never a file in the image and never a Vercel variable.
4. **GitHub** → Actions → "Deploy Tesla proxy" → Run workflow.
5. Set `TESLA_PROXY_BASE_URL=https://flux-tesla-proxy.fly.dev` in Vercel and
   redeploy.

The workflow refuses to deploy when `TESLA_PRIVATE_KEY` is unset rather than
shipping a proxy that exits on startup — the failure is the same either way, but
this one says why.

## One-time deploy (from a machine with flyctl)

```bash
# In the project root:
cd tesla-proxy

# Create the Fly app (don't deploy yet):
fly launch --copy-config --no-deploy

# Set the private signing key (same one whose public half is published at
# https://flux-alpha-three.vercel.app/.well-known/appspecific/com.tesla.3p.public-key.pem):
fly secrets set TESLA_PRIVATE_KEY="$(base64 -w0 < /path/to/private.pem)"

# Deploy:
fly deploy
```

The app URL will be `https://flux-tesla-proxy.fly.dev`. Set
`TESLA_PROXY_BASE_URL` to that value in the Flux Vercel env vars.

## Why there are two processes in the container

`tesla-http-proxy` only ever calls `ListenAndServeTLS` — upstream deliberately
omitted an `--insecure` flag, with a comment in `cmd/tesla-http-proxy/main.go`
explaining they did not want DIY users exposing cars over cleartext.

Every managed platform, Fly and Coolify included, terminates the public
certificate at its edge and speaks **plain HTTP** to the container. Point one at
the other and Go's TLS server answers `400 Bad Request` — verified against the
real binary, not assumed. So the container runs `tesla-http-proxy` on loopback
`127.0.0.1:8443` behind a self-signed certificate, with Caddy on `$PORT`
translating plain HTTP into that TLS hop.

Caddy skips certificate verification on that hop, which is safe here and only
here: it never leaves the container's loopback interface, so nothing can sit in
the middle of it.

## How Flux uses it

`src/lib/tesla/api.ts` reads `TESLA_PROXY_BASE_URL`:

- If set, `sendVehicleCommand` rewrites the Fleet API base to the proxy URL.
- If empty, calls Tesla directly (legacy path — fine for read-only data and
  pre-2021 Model S/X).

Read-only endpoints (`/vehicle_data`, `/fleet_status`) bypass the proxy because
they don't require command signing.
