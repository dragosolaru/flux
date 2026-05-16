# Changelog

All notable changes to Flux are documented here.
Format: [Version] — Date · Description

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
