# ROADMAP

_Status as of 2026-06-23._

Current status: Tesla-only product, deployed on Vercel (flux-alpha-three.vercel.app). Mock simulator runs all vehicles by default. Live Tesla integration is wired but dormant (activated via `LIVE_INTEGRATIONS=tesla` + per-vehicle OAuth pairing; the connect route returns 410 until enabled). Other brands are archived on `demo-brands-archive`. Cost Intelligence (Claude document parsing), document vault, smart charging, trip planner, unified map, push notifications, and Stripe billing are all shipped.

---

## MVP launch checklist

| Item | Status | Notes |
|---|---|---|
| Per-vehicle email ingest | ✓ | Cloudmailin webhook + UUID short-ID matching |
| Auto-refresh dashboard | ✓ | Costs invalidate when docs finish processing |
| Petrol comparison guard | ✓ | Hides when no EV cost data |
| Tesla-only brand registry | ✓ | Other brands on archive branch |
| Tesla live OAuth flow | dormant | Code exists, needs `LIVE_INTEGRATIONS=tesla` + tesla-proxy deploy |
| Security audit pass | ✓ | See `docs/SECURITY-AUDIT.md` |
| Playwright smoke tests | partial | Suite exists in `e2e/`; CI gate not yet enforced |
| README screenshots | TODO | Show simulator, cost dashboard, email ingest |

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

| Feature | Status | Notes |
|---|---|---|
| Real tariff providers | partial | Tibber real (set `TIBBER_TOKEN`); others are mock price curves |
| Real charging-network data | ✓ | PostGIS + OCM + OSM + BNetzA/NDW/IRVE/Austria; see `docs/FEATURES.md` §10 |
| Real trip routing | ✓ | OSRM / ORS / TomTom, multi-strategy, Open-Meteo weather derating |

---

## Product features

| Feature | Notes |
|---|---|
| iOS / Android home screen widget | Battery + range via web push or wrapper app |
| Cost export | ✓ CSV — `/api/costs/export`; PDF not yet |
| Smart-charge coordinator | Multi-vehicle charging schedule vs tariff windows |
| Monetization | ✓ Freemium (1 vehicle, 3 docs/mo) + Pro via Stripe |
| iOS/Android home screen widget | Battery + range via native widget or web push |
| Document triage pre-pass | Wire `DOCUMENT_TRIAGE_PROMPT` into processor as fast first-pass classify step |
