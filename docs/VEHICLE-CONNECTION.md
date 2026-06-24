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
