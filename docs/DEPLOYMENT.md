# Flux — Production Deployment Guide

Last updated: 2026-06-12

## Overview

Flux deploys on **Vercel** (Next.js) + **Supabase** (Postgres + Auth) + **Stripe** (billing).
The Tesla command proxy deploys on **Fly.io** (optional for live Tesla integration).

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
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
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

### Required env vars

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...

# Auth
NEXTAUTH_SECRET=<generate: openssl rand -base64 32>
NEXTAUTH_URL=https://yourdomain.com
AUTH_TRUST_HOST=true

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_MONTHLY_PRICE_ID=price_...
STRIPE_PRO_ANNUAL_PRICE_ID=price_...

# Anthropic (OCR)
ANTHROPIC_API_KEY=sk-ant-...

# Email ingest (Cloudmailin)
EMAIL_WEBHOOK_SECRET=<generate: openssl rand -hex 20>
NEXT_PUBLIC_CLOUDMAILIN_ADDRESS=your-address@cloudmailin.net  # optional

# App
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

### Optional env vars (have fallbacks)

```bash
# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Tesla live integration (omit to stay in mock/demo mode)
TESLA_CLIENT_ID=...
TESLA_CLIENT_SECRET=...
TESLA_REDIRECT_URI=https://yourdomain.com/api/tesla/callback
TESLA_TOKEN_ENCRYPTION_KEY=<generate: openssl rand -hex 32>
TESLA_PROXY_BASE_URL=https://flux-tesla-proxy.fly.dev  # see Step 6

# External services (have free-tier or OSM fallbacks)
TOMTOM_API_KEY=...           # improves geocoding accuracy
OPEN_CHARGE_MAP_API_KEY=...  # higher OCM rate limits
TWILIO_AUTH_TOKEN=...        # WhatsApp ingest HMAC validation
UPSTASH_REDIS_REST_URL=...   # production rate limiting (replaces in-memory)
UPSTASH_REDIS_REST_TOKEN=... # production rate limiting

# Internal
CRON_SECRET=<generate: openssl rand -hex 20>  # protects /api/internal/warm
```

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

These run automatically if Vercel cron is configured in `vercel.json`:

| Path | Schedule | Purpose |
|------|----------|---------|
| `/api/internal/warm` | Every 5 min | Keep serverless functions warm |
| `/api/charging-stations/bulk-import` | 03:30 UTC daily | Refresh charger DB from OCM (RO/DE/FR/AT/NL/HU) |
| `/api/costs/cron` | Hourly | Process pending OCR documents |

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
- [ ] `EMAIL_WEBHOOK_SECRET` set and header-only (no `?secret=` query param)
- [ ] `CRON_SECRET` set (prevents unauthenticated cron triggers from outside)
- [ ] Supabase service role key **never** exposed client-side
- [ ] All user data queries have `.eq("user_id", session.user.id)` filter
- [ ] Open security findings reviewed: #31 (Stripe idempotency ✅ done), #32, #33, #34
