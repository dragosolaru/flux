# Changelog

All notable changes to Flux are documented here.
Format: [Version] — Date · Description

## [Unreleased]

- Provisioned the live environment end-to-end: Supabase project + migration,
  Google OAuth credentials, Tesla developer app, Vercel deployment on
  `flux-alpha-three.vercel.app`.
- Registered Flux as a Tesla EU partner (`partner_accounts` POST) and exposed
  the EC P-256 command-signing public key at
  `/.well-known/appspecific/com.tesla.3p.public-key.pem` via a route handler.
- Virtual Key paired with the first user's vehicle (Model 3, 2023).
- Defensive parsing of `vehicle_data` so partially-asleep cars don't crash the
  dashboard; auto wake-on-408 with one retry.
- `/api/tesla/command` returns `412 VCP_REQUIRED` for cars that require Tesla's
  Vehicle Command Protocol. UI surfaces a dedicated toast and a dismissible
  banner explaining the limitation.
- Scaffolded `tesla-proxy/` (Dockerfile + fly.toml + entrypoint) for the
  upcoming Tesla HTTP Proxy deployment on Fly.io. Flux already routes commands
  through `TESLA_PROXY_BASE_URL` when set; otherwise falls back to Tesla
  direct (legacy REST, works for pre-2021 cars).
- Documented the next-session plan in `docs/NEXT-STEPS.md`.

## [0.1.0] — 2026-05-16 · Initial scaffold

- Project initialized: **Flux by DAO Lab**
- Next.js 16 (App Router) + TypeScript strict, Tailwind CSS v4
- Auth.js v5 — Google OAuth + email/password (Credentials provider backed by Supabase)
- Supabase Postgres schema: `profiles`, `vehicles`, `tesla_tokens`, `vehicle_snapshots` with Row Level Security
- Tesla Fleet API integration: OAuth 2.0 + PKCE, multi-region probe (EU / NA / CN), encrypted-at-rest tokens (AES-256-GCM), in-place refresh
- Dashboard page: live vehicle card with SVG battery gauge, stats grid (range, odometer, climate), quick commands (lock, climate, horn, flash)
- Charging page: live status card, charge-limit slider, scheduled-charging stub, recent-session history
- Settings page: account info, vehicle disconnect, danger-zone account deletion
- shadcn/ui primitives (hand-written: button, card, input, label, skeleton, slider, switch, separator, avatar, sonner)
- TanStack Query v5 with 30s polling on vehicle state and mutation-triggered invalidation
- `next-themes` for dark/light mode toggle (dark-first)
- Documentation: SCOPE, ARCHITECTURE (with implementation decisions), README
