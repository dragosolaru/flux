# SYSTEMS — Infrastructure & Third-Party Services

> How every external service is wired into Flux, what it does, and how to reconfigure it when moving to own infrastructure.

---

## Vercel

**Role:** Hosts the Next.js application (serverless functions + CDN).  
**Dashboard:** https://vercel.com/dao-lab/flux  
**Current deployment:** https://flux-alpha-three.vercel.app

### Environment variables (Production)

Set in **Vercel → Settings → Environments → Production**.

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Project URL from Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public anon key (safe to expose) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key — server-only, never exposed to browser |
| `NEXTAUTH_SECRET` | Yes | Random secret: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Yes | `https://flux-alpha-three.vercel.app` |
| `GOOGLE_CLIENT_ID` | Yes | Google Cloud Console → Credentials |
| `GOOGLE_CLIENT_SECRET` | Yes | Same |
| `ANTHROPIC_API_KEY` | Yes | console.anthropic.com → API Keys |
| `EMAIL_WEBHOOK_SECRET` | Yes | Shared secret for email webhook: `openssl rand -hex 24` |
| `NEXT_PUBLIC_CLOUDMAILIN_ADDRESS` | Yes | Full Cloudmailin address: `2b31b9c101b11f6682f3@cloudmailin.net` |
| `NEXT_PUBLIC_APP_URL` | Yes | `https://flux-alpha-three.vercel.app` |
| `LIVE_INTEGRATIONS` | No | Comma-separated brand keys for live APIs (e.g. `tesla`). Empty = all mock. |
| `TESLA_CLIENT_ID` | No | Only when `LIVE_INTEGRATIONS=tesla` |
| `TESLA_CLIENT_SECRET` | No | Same |
| `TESLA_REDIRECT_URI` | No | Same |
| `TESLA_TOKEN_ENCRYPTION_KEY` | No | 32-byte hex: `openssl rand -hex 32` |
| `TESLA_PROXY_BASE_URL` | No | URL of Tesla HTTP proxy (dormant) |

### Redeploy after env var change

Any change to env vars requires a redeploy. Trigger it manually via:
- Vercel dashboard → Deployments → Redeploy latest
- Or push any commit to `main`

### Moving to own infrastructure (VPS / Railway / Fly.io)

1. `npm run build` — produces a `.next/` folder
2. `npm start` runs the server on port 3000
3. Needs Node 22+ and all env vars from the table above
4. For Railway/Fly: point the Dockerfile at node:22 + `npm start`; no special setup needed since Next.js 16 runs as a standard Node server when not on Vercel

---

## Supabase

**Role:** Postgres database (with RLS) + file storage.  
**Dashboard:** https://supabase.com/dashboard/project/\<project-id\>

### Schema overview

| Migration file | What it creates |
|---|---|
| `001_initial.sql` | `profiles`, `vehicles`, `tesla_tokens`, `vehicle_snapshots` |
| `002_mock_platform.sql` | `mock_vehicle_state`, `charging_sessions`, `trips`, `command_events` |
| `003_mock_vehicle_spec.sql` | Adds `vehicle_spec` column to `mock_vehicle_state` |
| `004_user_settings.sql` | `user_settings` table |
| `005_audit_fixes.sql` | RLS policy corrections |
| `006_cost_intelligence.sql` | `documents`, `energy_costs`, `exchange_rates`; adds `cost_ron`/`cost_source` to `charging_sessions` |

Run migrations in order via **Supabase → SQL Editor**. Use `supabase/CONSOLIDATED_MIGRATIONS.sql` for a fresh project (runs all migrations in one shot).

### Storage bucket

Bucket name: `documents`  
Access: **Private** (not public)

Create it: Supabase → Storage → New bucket → name: `documents`, Public: OFF.

Files are stored at path `{user_id}/{vehicle_id}/{uuid}.{ext}` and accessed via short-lived signed URLs (1-hour TTL, generated server-side at `GET /api/documents`).

### Row Level Security

Every table has RLS enabled. The app never queries Supabase from the browser — all data access goes through `/api/*` route handlers using the **service role client**. RLS is a defence-in-depth layer, not the primary access control.

Policies enforce: users can only read/write rows where `user_id = auth.uid()`, or where the related vehicle belongs to them.

### Moving to own PostgreSQL

1. Export schema from Supabase: run all migration SQL files on a fresh Postgres 15+ instance
2. Replace Supabase SDK calls with `pg` or `drizzle` — this is a significant refactor
3. Replace Supabase Storage with S3-compatible storage (MinIO, Cloudflare R2) and update `createSupabaseAdminClient().storage` calls
4. Auth identity still works via Auth.js — just remove the `ensureSupabaseUserId` bridge if you drop Supabase Auth

---

## Cloudmailin

**Role:** Receives emails sent to per-vehicle addresses and forwards them as HTTP POST to the app.  
**Dashboard:** https://app.cloudmailin.com  
**Current address:** `2b31b9c101b11f6682f3@cloudmailin.net`

### How it works

1. User sends email with a document attachment to their vehicle's address:  
   `2b31b9c101b11f6682f3+black-panther-f793064e@cloudmailin.net`
2. Cloudmailin receives it and POSTs multipart/form-data to:  
   `https://flux-alpha-three.vercel.app/api/documents/inbound-email?secret=<EMAIL_WEBHOOK_SECRET>`
3. The webhook extracts `+black-panther-f793064e` from the To address to identify the vehicle
4. Attachments are uploaded to Supabase Storage and queued for Claude Vision parsing

### Configuration

In Cloudmailin → your address → Edit:
- **POST Format:** Multipart - Normalized
- **Target URL:** `https://flux-alpha-three.vercel.app/api/documents/inbound-email?secret=<EMAIL_WEBHOOK_SECRET>`

The `EMAIL_WEBHOOK_SECRET` in the URL must match the env var set in Vercel.

### Vehicle address format

The vehicle email address is constructed from:
- Cloudmailin base: `2b31b9c101b11f6682f3@cloudmailin.net`
- Vehicle subaddress: `+{nickname-slug}-{first-8-hex-of-uuid}`

Example: vehicle "Black Panther" with ID `f793064e-...` → `2b31b9c101b11f6682f3+black-panther-f793064e@cloudmailin.net`

The app builds this via `NEXT_PUBLIC_CLOUDMAILIN_ADDRESS` env var.

### Moving to own email provider

The webhook at `POST /api/documents/inbound-email` accepts:
- **Cloudmailin**: JSON body or multipart (auto-detected by Content-Type)
- **Mailgun**: multipart/form-data with `To`, `Subject`, `attachment-*` fields
- **SendGrid Inbound Parse**: multipart/form-data with same field names

To switch providers: update the webhook URL in the provider's dashboard. Keep `EMAIL_WEBHOOK_SECRET` in the query string or `x-webhook-secret` header.

---

## Anthropic (Claude Vision)

**Role:** Parses energy bills and charger receipts using Claude's vision capability.  
**Dashboard:** https://console.anthropic.com  
**Model used:** `claude-sonnet-4-6`

### What it does

For each uploaded document, the app calls Claude with the document (image/PDF) plus a structured extraction prompt. Claude returns JSON with:
- Document type (home bill vs public charger receipt)
- Provider name, period, kWh consumed, total cost, currency
- Per-field confidence scores (0.0–1.0)

Documents with `min(confidence.cost_total, confidence.document_type) < 0.7` are flagged as `needs_review`.

### Cost estimate

| Document type | Approx. tokens | Cost per document |
|---|---|---|
| Image (JPG/PNG) | ~2k input, ~300 output | ~$0.003 |
| PDF | ~3–5k input, ~300 output | ~$0.005–0.008 |

**Billing:** Pay-as-you-go. Add credits at console.anthropic.com → Settings → Billing.

### Error handling

Errors from the API are mapped to user-friendly Romanian messages in `src/lib/ai/document-parser.ts`:
- 401 → invalid API key
- 402 / "credit balance" → insufficient credits
- 429 → rate limit
- 5xx → service unavailable

---

## Google OAuth

**Role:** Social login ("Sign in with Google").  
**Console:** https://console.cloud.google.com

### Required OAuth credentials

Project: any Google Cloud project  
Credential type: **OAuth 2.0 Client ID** (Web application)

Authorized redirect URI:
- Dev: `http://localhost:3000/api/auth/callback/google`
- Prod: `https://flux-alpha-three.vercel.app/api/auth/callback/google`

### Moving to a new domain

Update the authorized redirect URI in Google Cloud Console to include the new domain. No code changes needed.

---

## BNR (Banca Națională a României)

**Role:** Provides daily EUR→RON (and other currencies→RON) exchange rates.  
**API:** `https://www.bnr.ro/nbrfxrates.xml` — public, no key required

### How it works

When processing a document with a non-RON cost, the app:
1. Checks `exchange_rates` table in Supabase (cache)
2. If not cached: fetches BNR XML, parses it, stores in DB
3. Falls back to previous days (up to `BNR_MAX_FALLBACK_DAYS = 5`) since BNR doesn't publish on weekends/holidays

Fetches are cached by Next.js for `BNR_REVALIDATE_SECONDS = 3600` (1 hour) at the HTTP layer.

Constants in `src/lib/external/bnr/client.ts`.

---

## Tesla Fleet API (dormant)

**Role:** Live vehicle telemetry and commands for real Tesla vehicles.  
**Status:** Code is in-tree but inactive. Activated by setting `LIVE_INTEGRATIONS=tesla`.

See `docs/VEHICLE-CONNECTION.md` for the OAuth flow and activation procedure.
