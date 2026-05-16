# Flux — EV Management Platform

> Flux is an open-source multi-brand EV management platform by [DAO Lab](https://daolab.ai). Connect your electric vehicle, monitor its state, and control it from one clean dashboard — independent of the manufacturer's app.

The MVP targets **Tesla** via the official Tesla Fleet API. The architecture is brand-pluggable; BMW ConnectedDrive, Polestar, Rivian, and Mercedes me are on the roadmap.

---

## Tech stack

| Layer            | Choice                                    |
| ---------------- | ----------------------------------------- |
| Framework        | Next.js 16 (App Router) + TypeScript      |
| Auth             | Auth.js v5 (Google + Credentials)         |
| Database         | Supabase (Postgres) with Row Level Security |
| State / fetching | TanStack Query v5                         |
| Validation       | Zod                                       |
| UI               | shadcn/ui + Tailwind CSS v4               |
| Tesla            | Tesla Fleet API (REST + OAuth 2.0 + PKCE) |
| Deploy           | Vercel                                    |

---

## Getting started

### 1. Clone and install

```bash
git clone <repo-url> flux
cd flux
npm install
```

Requires Node ≥ 20.

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Then fill in the values:

| Variable                       | Where to get it                                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`     | Supabase dashboard → Project settings → API                                                                    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`| Supabase dashboard → Project settings → API                                                                    |
| `SUPABASE_SERVICE_ROLE_KEY`    | Same page, **service_role** key — server-side only                                                             |
| `NEXTAUTH_SECRET`              | `openssl rand -base64 32`                                                                                      |
| `NEXTAUTH_URL`                 | `http://localhost:3000` in dev                                                                                 |
| `GOOGLE_CLIENT_ID/SECRET`      | Google Cloud Console → Credentials. Redirect URI: `http://localhost:3000/api/auth/callback/google`             |
| `TESLA_CLIENT_ID/SECRET`       | developer.tesla.com → application credentials                                                                  |
| `TESLA_REDIRECT_URI`           | Must match the redirect URI configured in the Tesla developer dashboard                                        |
| `TESLA_TOKEN_ENCRYPTION_KEY`   | `openssl rand -hex 32` — 32 bytes hex for AES-256-GCM token encryption                                         |

### 3. Set up Supabase

In the Supabase SQL editor, run `supabase/migrations/001_initial.sql`. This creates the `profiles`, `vehicles`, `tesla_tokens`, and `vehicle_snapshots` tables, plus RLS policies and the auto-profile trigger.

### 4. Run the dev server

```bash
npm run dev
```

Open http://localhost:3000.

---

## How Tesla OAuth works (in one breath)

1. User clicks **Connect Tesla account** → browser goes to `GET /api/tesla/connect`.
2. The server generates a PKCE pair + state, stashes them in HttpOnly cookies, and redirects to `auth.tesla.com`.
3. Tesla signs the user in and calls back to `/api/tesla/callback?code=…&state=…`.
4. We exchange the code for access + refresh tokens, probe each Fleet API region for the user's vehicles, encrypt the tokens with AES-256-GCM, and persist them to `tesla_tokens`.
5. The dashboard polls `/api/tesla/vehicle` every 30 seconds; `getValidAccessToken` transparently refreshes the access token when it is about to expire.

Tokens are **never** sent to the browser. All Tesla API calls live behind `/api/tesla/*` routes.

---

## Project structure

```
src/
├── app/
│   ├── (auth)/                # Login + register pages
│   ├── (dashboard)/           # Dashboard, charging, settings (auth-guarded)
│   ├── api/                   # auth, tesla/*, account, vehicles/*
│   ├── connect/tesla/         # Tesla OAuth onboarding step
│   ├── layout.tsx             # Root layout + providers
│   └── page.tsx               # Landing — redirects to /login or /dashboard
├── components/
│   ├── auth/                  # LoginForm
│   ├── charging/              # ChargingStatus card
│   ├── layout/                # Sidebar, TopBar
│   ├── onboarding/            # ConnectTeslaStep
│   ├── ui/                    # shadcn primitives
│   ├── vehicle/               # VehicleCard, BatteryGauge, StatsGrid, CommandPanel
│   └── providers.tsx          # SessionProvider, ThemeProvider, QueryClient, Toaster
├── hooks/                     # useVehicle, useVehicleCommand
├── lib/
│   ├── auth.ts                # Auth.js v5 config
│   ├── api-fetch.ts           # Typed fetch helper
│   ├── supabase/              # Browser + server clients
│   └── tesla/                 # constants, auth (OAuth), tokens (encrypt + refresh), api
└── types/                     # tesla, vehicle, auth
supabase/migrations/001_initial.sql
docs/{SCOPE,ARCHITECTURE,CHANGELOG}.md
```

---

## Deployment

Flux deploys cleanly to **Vercel**:

```bash
vercel deploy
```

Set all environment variables in the Vercel project settings (including `NEXTAUTH_URL` pointing to your production domain). Then update the Tesla developer dashboard and Google Cloud Console with the production callback URLs.

---

## Built by DAO Lab

DAO Lab is an AI consulting company that ships production-grade software, faster. We work with founders and teams to design, build, and operate AI-augmented products.

Flux is our first public portfolio project — a live demonstration of the engineering quality and AI-augmented workflow we bring to client projects. The code is open, the architecture is deliberate, and every decision is documented in `docs/ARCHITECTURE.md`.

If you'd like to work with us, reach out at hello@daolab.ai.
