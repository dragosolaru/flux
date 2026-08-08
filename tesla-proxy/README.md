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

1. **New Resource** → **Application** → your Git repository.
2. Build Pack **Dockerfile**, Base Directory **`/tesla-proxy`**.
3. **Environment Variables** → `TESLA_PRIVATE_KEY`, marked as a secret. The EC
   private key PEM, raw or base64 — `entrypoint.sh` accepts either. Tick "Build
   Variable? No"; it is only needed at runtime.
4. **Ports Exposes**: `8080`.
5. **Domains**: a real hostname, e.g. `https://tesla-proxy.example.com`. It must
   be a hostname with a valid certificate, not an IP and not a self-signed one —
   Vercel's `fetch` verifies the chain and will refuse anything else. Let Coolify
   issue the Let's Encrypt certificate.
6. Deploy, then set `TESLA_PROXY_BASE_URL=https://tesla-proxy.example.com` in
   Vercel and redeploy Flux.

Two requirements that are easy to miss: the host must be reachable from the
public internet, because the callers are Vercel's serverless functions with no
fixed egress addresses; and no custom Traefik labels are needed — if you find
yourself setting `loadbalancer.server.scheme=https`, something is wrong, since
the container publishes plain HTTP on purpose.

Health check: `GET /api/1/vehicles` with no token should return **403** from
Tesla. A **400**, a **502**, or a TLS error means the request never made it
through the two hops inside the container.

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
   the EC private key PEM, raw or base64 — `entrypoint.sh` accepts either. This
   is a Fly secret, never a file in the image and never a Vercel variable.
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
fly secrets set TESLA_PRIVATE_KEY="$(base64 < /path/to/private.pem)"

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
