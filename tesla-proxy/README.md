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
private key (a Fly secret, not in the image). Flux passes the user's Tesla
access token in the `Authorization` header on every request.

## One-time deploy

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

## How Flux uses it

`src/lib/tesla/api.ts` reads `TESLA_PROXY_BASE_URL`:

- If set, `sendVehicleCommand` rewrites the Fleet API base to the proxy URL.
- If empty, calls Tesla directly (legacy path — fine for read-only data and
  pre-2021 Model S/X).

Read-only endpoints (`/vehicle_data`, `/fleet_status`) bypass the proxy because
they don't require command signing.
