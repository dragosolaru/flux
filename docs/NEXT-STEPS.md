# NEXT STEPS — Flux (post-pivot, 2026-05-17)

The previous version of this file planned to deploy the Tesla HTTP Proxy on Fly.io to unlock signed commands. That work is **paused**. The reason: Flux is pivoting to a **mock-first, multi-brand platform**. Real Tesla commands aren't the bottleneck anymore; the bottleneck is shipping a credible multi-brand product surface.

The mock-first plan is captured formally in `openspec/changes/pivot-mock-first-platform/`. This file is the human-readable execution roadmap.

## What changed in one paragraph

Every brand becomes a mock backed by a Tier-3 stateful simulator we control. Battery drains while driving, charges while plugged in, commands mutate state, charging sessions and trips accumulate in real time. The dashboard is brand-blind; per-brand capability maps decide which cards and buttons render. Beyond OEM telemetry, we mock energy tariffs, charging-network discovery, weather (with range derating), and trip planning. Multi-vehicle on one account is now first-class — garage page, switcher, fleet aggregates. Mock disclosure is visible and honest (`MOCK` chip per card, demo-mode banner, `/about-data` transparency page). The real Tesla code stays in the tree behind `LIVE_INTEGRATIONS`; we will reactivate brand-by-brand once each brand's full UI surface is locked.

## What's preserved

- The live Tesla OAuth + PKCE + region probe + token refresh + AES-256-GCM encryption code stays in the tree. Don't delete.
- `tesla-proxy/` (Dockerfile + fly.toml + entrypoint) stays. Marked dormant in its README.
- The first user's `Black Panther` vehicle row in DB is migrated to `data_source = 'mock'` with a seeded scenario; the existing demo URL keeps working.

## Execution phases (matches `tasks.md` in the OpenSpec change)

| Phase | Theme                                  | Output                                                                 |
| ----- | -------------------------------------- | ---------------------------------------------------------------------- |
| 1     | Foundations: brand registry            | `src/lib/brands/` + 7 capability profiles + extended `VehicleState`    |
| 2     | Stateful Tier-3 simulator              | `src/lib/mock/engine.ts` + scenarios + persistence + migration 002     |
| 3     | Multi-vehicle architecture             | `/garage`, `/dashboard?v=<id>`, switcher, brand-dispatched API routes  |
| 4     | Brand mock implementations             | Per-brand adapters + seed data for all 7 brands                        |
| 5     | Extended telemetry surface             | TPMS, doors, windows, sentry, dashcam, software, service, SoH, etc.    |
| 6     | Beyond OEM: tariffs                    | Tibber/Octopus/aWATTar mocks, `/energy` page, smart-charge recs        |
| 7     | Beyond OEM: charging-network discovery | Station registry + map + nearest-plug card                             |
| 8     | Beyond OEM: weather + range            | Weather provider + derating model                                      |
| 9     | Beyond OEM: trip planning              | Router + cross-vehicle comparison                                      |
| 10    | Aggregate / cross-vehicle              | Fleet totals, smart-charge coordinator, "Which car?" recommender       |
| 11    | Mock disclosure UX                     | `<MockChip>`, `<MockGlobalBanner>`, `/about-data`                      |
| 12    | Legacy preservation                    | `LIVE_INTEGRATIONS` flag plumbing, Tesla code gated                    |
| 13    | Docs                                   | SCOPE / ARCHITECTURE / README / BRANDS / SIMULATOR                     |
| 14    | Validation + demo                      | Demo user seeded with 3 mock cars, Playwright happy-path, README GIFs  |

## To start implementing

```bash
cd "/Users/dragosolaru/Learn/Tesla Dasboard/flux"
nvm use
npm run dev
```

Then open the OpenSpec change and apply tasks:

```bash
openspec show pivot-mock-first-platform
openspec status pivot-mock-first-platform
# or use the slash command in Claude Code: /opsx:apply
```

## Working remotely while away

Three paths if the laptop is closed:

1. **claude.ai/code** — push to GitHub first, then access the repo from any browser on `claude.ai/code`. Cloud environment; nothing depends on the laptop.
2. **GitHub Codespaces + Claude Code VS Code extension** — open the repo in Codespaces, install the Claude Code extension, work as if local.
3. **Anthropic Console / Claude.ai chat** — planning only; insufficient for actual code edits.

Recommended pre-trip checklist:
- `git init && git add . && git commit -m "checkpoint: pre-pivot snapshot"`
- Push to a GitHub repo (private if desired).
- Verify `claude.ai/code` can open the repo.

## On Tesla developer credentials

For the pivot we don't need the Tesla developer app active. We can leave it as-is — the code will simply ignore Tesla real APIs while `LIVE_INTEGRATIONS` does not include `tesla`. If you want to tidy up:

1. Visit https://developer.tesla.com → your app.
2. Optionally deactivate it. The public-key endpoint stays served by Flux automatically; it's harmless to leave it up.

We will reactivate the app later (phase 0.2 of the post-pivot roadmap) when wiring the first live integration.

## If something blocks the mock-first plan

- `npm run dev` failing → check `nvm use` (Node 22 in `.nvmrc`).
- Supabase migration 002 conflicts with existing data → run on a fresh project, point local at it via `.env.local`, migrate `Black Panther` via the documented script.
- Simulator tick producing non-deterministic output → check that no `Date.now()` or `Math.random()` leaks into `tick()` outside the seeded RNG and the explicit `now` parameter.
