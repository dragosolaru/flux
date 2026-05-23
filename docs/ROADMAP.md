# ROADMAP

Current status: mock-first multi-brand platform is live. Cost Intelligence (AI document parsing) is implemented.

---

## In progress / near-term

| Item | Notes |
|---|---|
| Demo seed data | 3 mock vehicles with 3 months of cost history for demo accounts |
| Playwright smoke tests | Login → garage → upload document → check status |
| README screenshots | GIFs showing simulator, cost dashboard, email ingest |

---

## Live OEM integrations (post-mock)

| Phase | Brand | Prerequisite |
|---|---|---|
| 0.2 | Tesla | Re-deploy `tesla-proxy/` on Fly.io, set `LIVE_INTEGRATIONS=tesla` |
| 0.3 | BMW | BMW Connected Drive API access |
| 0.3 | Polestar | Polestar API partnership |
| 0.4 | Mercedes, VW, Hyundai, Renault | Brand-specific API programs |

---

## Real external data

| Phase | Feature | Notes |
|---|---|---|
| 0.5 | Real tariff providers | Tibber + Octopus APIs replace mocks |
| 0.6 | Real charging-network data | OpenChargeMap + Ionity/Fastned APIs |
| 0.8 | Real trip routing | ABRP-grade planner replaces mock router |

---

## Features

| Feature | Notes |
|---|---|
| iOS / Android home screen widget | Battery + range via web push or wrapper app |
| Cost export | CSV / PDF export of energy_costs table |
| Smart-charge coordinator | Multi-vehicle charging schedule vs tariff windows |
| Monetization | Freemium (1 vehicle) + Pro ~€4.99/month |

---

## Reactivating Tesla live

1. Set `LIVE_INTEGRATIONS=tesla` in Vercel env vars
2. Deploy `tesla-proxy/` on Fly.io (see `tesla-proxy/README.md`)
3. Set `TESLA_PROXY_BASE_URL` in Vercel env vars
4. "Add real Tesla" CTA reappears in onboarding automatically
