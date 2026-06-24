# Flux — Production Deployment Guide

Last updated: 2026-06-23

## Overview

Flux runs in production on **Vercel** (Next.js, live at flux-alpha-three.vercel.app)
+ **Supabase** (Postgres + Auth + Storage) + **Stripe** (billing). The Tesla command
proxy deploys on **Fly.io** (optional, only for sending commands to post-2021 vehicles).

> Self-hosting alternative: a Docker Compose + Traefik path for Hetzner is documented in
> **DEPLOYMENT-HETZNER.md**. `next.config.ts` uses `output: "standalone"` so the same
> codebase builds a self-contained Docker image. Vercel is the primary/live target.

---

## Step 1 — Supabase

1. Create a new Supabase project at https://supabase.com
2. Run all migrations in order: `supabase db push` (or paste each file in SQL editor)
   - Migrations live in `supabase/migrations/`
3. Enable RLS on all user-data tables (migrations handle this; verify in Table Editor → RLS)
4. Copy project URL + anon key + service role key from Project Settings → API

## Step 2 — Stripe

1. Create a Stripe account at https://stripe.com
2. Create two Products → one Price each:
   - **Pro Monthly**: recurring, monthly, your price (e.g. €4.99/mo)
   - **Pro Annual**: recurring, yearly, your price (e.g. €39.99/yr)
3. Copy both Price IDs (`price_...`)
4. Add webhook endpoint in Stripe Dashboard → Developers → Webhooks:
   - URL: `https://yourdomain.com/api/billing/webhook`
   - Events handled by the code (`src/app/api/billing/webhook/route.ts`): `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. Other events are accepted and ignored.
   - The webhook is idempotent: each event id is recorded in the `stripe_events` table (migration 013) and replays are acknowledged without re-applying.
5. Copy webhook signing secret

## Step 3 — Anthropic

1. Get API key at https://console.anthropic.com/settings/keys
2. Ensure billing is active (OCR uses Claude Vision — costs ~$0.002/document)

## Step 4 — Google OAuth (optional)

1. Go to https://console.cloud.google.com → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Authorized redirect URIs: `https://yourdomain.com/api/auth/callback/google`
4. Copy Client ID + Secret

## Step 5 — Vercel Deployment

1. Connect repo to Vercel, deploy `main` branch
2. Set ALL required environment variables:

> The canonical, annotated list lives in `.env.local.example`. The tables below are
> grouped by what the code actually reads (`grep "process.env." src/`).

### Required env vars

```bash
# Supabase (NEXT_PUBLIC_* are baked into the client bundle at build time)
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...

# Auth (NextAuth v5)
NEXTAUTH_SECRET=<generate: openssl rand -base64 32>
NEXTAUTH_URL=https://yourdomain.com   # used server-side for Stripe redirect URLs
AUTH_TRUST_HOST=true                  # needed behind Vercel/proxy

# Stripe (billing)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_MONTHLY_PRICE_ID=price_...
STRIPE_PRO_ANNUAL_PRICE_ID=price_...

# Anthropic (OCR — Claude only; there is no OpenAI dependency)
ANTHROPIC_API_KEY=sk-ant-...

# Email ingest (Cloudmailin) — sent as the x-webhook-secret header; fail-closed (503) if unset
EMAIL_WEBHOOK_SECRET=<generate: openssl rand -hex 24>
```

### Optional env vars (feature-gated or have fallbacks)

```bash
# Google OAuth (omit → email/password only)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Tesla live integration (omit to stay in mock/demo mode)
TESLA_CLIENT_ID=...
TESLA_CLIENT_SECRET=...
TESLA_REDIRECT_URI=https://yourdomain.com/api/tesla/callback
TESLA_TOKEN_ENCRYPTION_KEY=<generate: openssl rand -hex 32>   # 32-byte hex, AES-256-GCM
TESLA_PROXY_BASE_URL=https://flux-tesla-proxy.fly.dev          # see Step 6

# Public app config
NEXT_PUBLIC_APP_URL=https://yourdomain.com                     # fallback email domain when CLOUDMAILIN unset
NEXT_PUBLIC_CLOUDMAILIN_ADDRESS=your-address@cloudmailin.net   # inbound email address shown in UI

# Cron / internal endpoints
CRON_SECRET=<generate: openssl rand -hex 24>   # Bearer token for Vercel crons (warm, poll-vehicles)
INGEST_WEBHOOK_SECRET=...                       # x-webhook-secret for manual warm / ingest-stats triggers

# Notifications (ships dark until flipped on)
NEXT_PUBLIC_NOTIFICATIONS_ENABLED=true          # exposes notifications UI/API + poll-vehicles cron
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...                # web push — npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:alerts@yourdomain.com
RESEND_API_KEY=...                              # email notifications (Resend)
RESEND_FROM=Flux <alerts@yourdomain.com>

# WhatsApp ingest (Twilio)
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...                            # HMAC-SHA1 X-Twilio-Signature validation
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
TWILIO_WEBHOOK_URL=...                           # public webhook URL used in signature check

# Charging / routing / geocoding (OSM/free-tier fallbacks if unset)
TOMTOM_API_KEY=...               # geocoding + routing accuracy
OPEN_CHARGE_MAP_API_KEY=...      # higher OCM rate limits for charger import
OPENROUTESERVICE_API_KEY=...     # routing fallback provider
CHARGEPRICE_API_KEY=...          # charger pricing enrichment

# Energy tariffs
TIBBER_TOKEN=...                 # live electricity prices (only if the user has a Tibber contract)

# Production rate limiting (recommended) — falls back to per-instance in-memory if unset
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

> The rate limiter (`src/lib/rate-limit.ts`) uses Upstash Redis when both `UPSTASH_*`
> vars are set, and an in-memory per-process map otherwise. Set Upstash in production —
> the in-memory fallback is per-instance and resets on cold start, so per-user limits
> are not enforced across Vercel instances without it.

3. Verify build passes in Vercel dashboard

## Step 6 — Tesla VCP Proxy (optional, needed for live Tesla)

Required for **Model 3/Y/S/X built after 2021**. Commands without the proxy
return HTTP 412. Read-only data (vehicle state, history) works without it.

```bash
# Prerequisites: flyctl installed (https://fly.io/docs/hands-on/install-flyctl/)
cd tesla-proxy

# Create the Fly app:
fly launch --copy-config --no-deploy

# Set the EC P-256 private key (the public half must be at
# https://yourdomain.com/.well-known/appspecific/com.tesla.3p.public-key.pem)
fly secrets set TESLA_PRIVATE_KEY="$(base64 < /path/to/private.pem)"

# Deploy:
fly deploy
```

Then set `TESLA_PROXY_BASE_URL=https://<your-fly-app>.fly.dev` in Vercel.

## Step 7 — Post-Deployment Smoke Test

```bash
# 1. Auth
curl -I https://yourdomain.com/api/auth/session

# 2. Stripe webhook (send test event from Stripe dashboard)
# Dashboard → Developers → Webhooks → your endpoint → Send test event → checkout.session.completed
# Verify: check Supabase → stripe_events table has 1 row

# 3. OCR (requires ANTHROPIC_API_KEY)
# Upload a fake receipt image via the Costs page

# 4. Trip planner
# Open /map → plan a route → verify stops appear

# 5. Charging map
# Open /map → Explore tab → verify stations load
```

## Step 8 — Enable Live Tesla (after smoke test passes)

```bash
# In Vercel dashboard, add:
LIVE_INTEGRATIONS=tesla

# Redeploy. Live Tesla users can now:
# - Connect their vehicle via OAuth (/settings → Connect Tesla)
# - See real-time state on dashboard
# - Send remote commands
```

---

## Vercel Cron Jobs

These are defined in `vercel.json` and run on Vercel's cron scheduler. Vercel attaches
`Authorization: Bearer $CRON_SECRET`; both routes fail closed (503) if `CRON_SECRET` is unset.

| Path | Schedule | Purpose |
|------|----------|---------|
| `/api/internal/warm?country=ro` | `0 3 * * *` (daily 03:00 UTC) | Bulk-import / refresh the charger DB for the given country from OCM (`bulkImportCountry`) |
| `/api/cron/poll-vehicles` | `0 6 * * *` (daily 06:00 UTC) | Poll vehicles and fire renewal/charge alerts. No-op unless `NEXT_PUBLIC_NOTIFICATIONS_ENABLED=true` |

> OCR is **not** a cron job. Uploaded documents are parsed inline via an `after()` task in
> `POST /api/documents` (`processDocument`), so there is no `/api/costs/cron` endpoint.

---

## Monitoring

- **Vercel Analytics** — page views, Web Vitals
- **Supabase Logs** — DB query logs, auth events
- **Stripe Dashboard** — webhook delivery, failed payments
- **Sentry** (recommended) — add `SENTRY_DSN` + `npm install @sentry/nextjs`

---

## Rollback

```bash
# Vercel: use dashboard Deployments → previous deployment → Promote to Production
# Database: Supabase has point-in-time recovery on paid plans
# Never force-push main; every deploy is a PR merge
```

---

## Security Checklist (pre-launch)

- [ ] `NEXTAUTH_SECRET` is at least 32 random characters
- [ ] `TESLA_TOKEN_ENCRYPTION_KEY` is exactly 64 hex chars (32 bytes)
- [ ] Stripe webhook signature verified (not just relying on URL obscurity)
- [ ] RLS enabled and verified on: `vehicles`, `energy_costs`, `charging_sessions`, `documents`, `trips`, `command_events`, `mock_vehicle_state`, `user_settings`
- [ ] `EMAIL_WEBHOOK_SECRET` set; inbound-email is header-only (no `?secret=` query param) and fails closed (503) if unset
- [ ] `CRON_SECRET` set (prevents unauthenticated cron triggers from outside)
- [ ] Supabase service role key **never** exposed client-side (only `NEXT_PUBLIC_*` vars reach the bundle)
- [ ] All user-data queries enforce ownership (`.eq("user_id", …)` or `vehicle_id` scoped to an owned vehicle)
- [ ] `UPSTASH_REDIS_REST_URL`/`_TOKEN` set so rate limits hold across instances
- [ ] Latest security findings reviewed — see `docs/SECURITY-AUDIT.md` for current open/closed status
