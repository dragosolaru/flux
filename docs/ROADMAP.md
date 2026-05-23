# ROADMAP

Current status: Tesla-only MVP. Mock simulator runs all vehicles by default. Live Tesla integration is wired but dormant (activated via `LIVE_INTEGRATIONS=tesla` + per-vehicle OAuth pairing). Other brands are archived on `demo-brands-archive`. Cost Intelligence (AI document parsing) is fully working.

---

## MVP launch checklist

| Item | Status | Notes |
|---|---|---|
| Per-vehicle email ingest | ✓ | Cloudmailin webhook + UUID short-ID matching |
| Auto-refresh dashboard | ✓ | Costs invalidate when docs finish processing |
| Petrol comparison guard | ✓ | Hides when no EV cost data |
| Tesla-only brand registry | ✓ | Other brands on archive branch |
| Tesla live OAuth flow | dormant | Code exists, needs `LIVE_INTEGRATIONS=tesla` + tesla-proxy deploy |
| Playwright smoke tests | TODO | Login → garage → add vehicle → upload doc |
| README screenshots | TODO | Show simulator, cost dashboard, email ingest |
| Security audit pass | TODO | See `docs/SECURITY-AUDIT.md` (to be generated) |

---

## Reactivating Tesla live

1. Set `LIVE_INTEGRATIONS=tesla` in Vercel env vars
2. Set `TESLA_CLIENT_ID`, `TESLA_CLIENT_SECRET`, `TESLA_TOKEN_ENCRYPTION_KEY` (32-byte hex)
3. Deploy `tesla-proxy/` on Fly.io (see `tesla-proxy/README.md`)
4. Set `TESLA_PROXY_BASE_URL` in Vercel env vars
5. "Pair Tesla account" CTA becomes available in vehicle settings

---

## Future brand expansion

When ready to bring back additional brands:

| Phase | Brand | Prerequisite |
|---|---|---|
| 0.3 | BMW | BMW Connected Drive API access; cherry-pick from `demo-brands-archive` |
| 0.3 | Polestar | Polestar API partnership |
| 0.4 | Mercedes-EQ, VW, Hyundai/Kia, Renault | Brand-specific API programs |

See `docs/BRANDS.md` → "Adding a new brand" for the 10-step recovery procedure.

---

## Real external data

| Phase | Feature | Notes |
|---|---|---|
| 0.5 | Real tariff providers | Tibber + Octopus APIs replace mocks |
| 0.6 | Real charging-network data | OpenChargeMap + Ionity/Fastned APIs |
| 0.8 | Real trip routing | ABRP-grade planner replaces mock router |

---

## Product features

| Feature | Notes |
|---|---|
| iOS / Android home screen widget | Battery + range via web push or wrapper app |
| Cost export | CSV / PDF export of `energy_costs` table |
| Smart-charge coordinator | Multi-vehicle charging schedule vs tariff windows |
| Monetization | Freemium (1 vehicle) + Pro ~€4.99/month |
