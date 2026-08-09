# 06 — Documentation Audit

*2026-08-09. 27 markdown documents, ~6900 lines, plus 11 dated design specs.*

---

## The core problem

There is no shortage of documentation — there is a shortage of documentation
that agrees with itself. Six files describe the project's status and they give
four different answers. A new reader (human or agent) cannot tell which to
believe, and the instruction in `CLAUDE.md` to treat `CODEBASE_CONTEXT.md` as
"the single source of architectural truth" points at a file that documents dead
functions.

A note on method: **git dates are useless here.** The repository is a squashed
import — all 50 commits are dated 2026-08. Every "last updated" judgement below
comes from the date stamps written inside the documents themselves.

---

## Inventory

| File | Lines | Stamped | Verdict |
|---|---|---|---|
| `README.md` | 141 | 2026-05-23 | **STALE** — says Tesla live is "dormant". It is not. |
| `CLAUDE.md` | 40 | — | **CURRENT** — rules only, correctly short |
| `AGENTS.md` | 53 | — | **CURRENT** — workflow rules |
| `CODEBASE_CONTEXT.md` | 237 | blockers "2026-06-23" | **PARTIALLY STALE** — file map good; blockers resolved; documents dead functions |
| `CHANGELOG.md` | 134 | 2026-05-25 | **STALE** — 2.5 months behind; its roadmap table contradicts every other source |
| `docs/FEATURES.md` | 663 | ~2026-08 | **CURRENT** — the master catalogue, kept up per the `CLAUDE.md` rule. Largest doc, and it is earning it. |
| `docs/TESLA-API-CAPABILITIES.md` | 377 | 2026-08-09 | **CURRENT — the best document in the repo.** Graded feasibility, honest "not feasible as described" section, the Fleet Telemetry argument. |
| `docs/LAUNCH-CHECKLIST.md` | 107 | 2026-07-05 | **MOSTLY CURRENT** — 3 items in §4b already shipped (see `02-WHERE-WE-ARE-GOING.md`) |
| `docs/TODO.md` | 433 | ~2026-08 | **CURRENT** — the real backlog, with reasoning |
| `docs/VEHICLE-CONNECTION.md` | 401 | 2026-08-09 | **CURRENT** |
| `docs/ARCHITECTURE.md` | 529 | 2026-06 | **PARTIALLY STALE** — needs a Tesla-status pass |
| `docs/ROADMAP.md` | 67 | 2026-06-23 | **STALE — the most misleading file in the repo.** Supply of contradictions per line is the highest here. |
| `docs/SECURITY-AUDIT.md` | 269 | 2026-05-20 | **HISTORICAL** — findings from a 2026-05 pass; superseded by `04-SECURITY-REVIEW.md` |
| `docs/USER-JOURNEY.md` | 645 | 2026-06 | **PARTIALLY STALE** — predates the `/trip` retirement |
| `docs/SIMULATOR.md` | 356 | 2026-06 | **CURRENT** |
| `docs/COST-INTELLIGENCE.md` | 301 | 2026-06 | **CURRENT** |
| `docs/SYSTEMS.md` | 217 | 2026-06 | **PARTIALLY STALE** |
| `docs/MARKETING.md` | 358 | 2026-06 | **CURRENT-ish** — one claim now false (Romanian tariffs); see `03-COMPETITIVE-EDGE.md` |
| `docs/LIVE-VS-DEMO.md` | 115 | 2026-06 | **CURRENT** — the design it describes is intact |
| `docs/USER-RESEARCH-2026-06-11.md` | 301 | 2026-06-11 | **HISTORICAL SNAPSHOT** — correctly dated in its filename. Keep as archive. |
| `docs/DESIGN-REVIEW.md` | 119 | 2026-06 | **HISTORICAL SNAPSHOT** |
| `docs/CONFLUENCE-PRODUCT-DOC.md` | 245 | 2026-08 | **REDUNDANT** — an export of material held elsewhere |
| `docs/INTEGRATIONS-CAR-ADMIN.md` | 210 | 2026-06 | **CURRENT** — RCA/ITP/rovinietă integrations |
| `docs/BRANDS.md` | 59 | 2026-06 | **CURRENT** |
| `docs/DEPLOYMENT.md` | 242 | 2026-06 | **PARTIALLY STALE** — Vercel |
| `docs/DEPLOYMENT-HETZNER.md` | 300 | 2026-06 | **NEEDS RECONCILING** — see contradiction 4 |
| `tesla-proxy/README.md` | — | 2026-08-09 | **CURRENT** |
| `docs/superpowers/specs/*.md` (11) | ~110k | 2026-05/06 | **HISTORICAL ARCHIVE** — correctly dated filenames. Keep, do not maintain. |
| `openspec/changes/*` (3) | — | — | **UNCLEAR** — `pivot-mock-first-platform`, `cost-intelligence`, `mobile-ux-simplify` all appear implemented but none is archived. |

---

## Contradictions

### 1. Is live Tesla working? — four answers

| Source | Claim |
|---|---|
| `README.md:5` | "Real Tesla Fleet API integration is wired but **dormant**" |
| `docs/ROADMAP.md:5` | "Live Tesla integration is wired but **dormant** … the connect route returns 410" |
| `CODEBASE_CONTEXT.md` "Active Blockers" | "`virtual_key_paired` — **never set to true**, commands gated" |
| `docs/TESLA-API-CAPABILITIES.md:17-25` | "**Already live in Flux, with a real car linked** … 20 commands, signed through the proxy" |

The last one is dated today and matches the commit log. The other three are
wrong. This is the single most important correction in the whole audit — it
misleads every reader about what the project actually is.

### 2. Two roadmaps, incompatible

`CHANGELOG.md`'s roadmap table lists phases A.2–E as "Planned", including
"Billing: Stripe" and "Romanian energy tariff DB". `docs/ROADMAP.md` marks
Stripe billing as shipped (✓) and tariffs as partial. `src/lib/roadmap.ts`
tracks five milestones that map to neither table.

### 3. Is the launch checklist current?

`docs/LAUNCH-CHECKLIST.md` §4b lists three prerequisites as missing that have
since shipped (disconnect flow, command history, both verified in code). The
one item still genuinely open — confirmation on unlock/remote-start — is
therefore buried among three false alarms, which is the worst possible place
for it.

### 4. Vercel or Hetzner?

`docs/DEPLOYMENT.md` treats Vercel as primary, `docs/DEPLOYMENT-HETZNER.md` as
the self-host alternative. But `docs/TESLA-API-CAPABILITIES.md` §2 argues that
Fleet Telemetry — the stated strategic direction — **cannot run on Vercel** and
belongs on the self-hosted box next to `tesla-proxy`. The deploy docs have not
absorbed the fact that the architecture is heading toward a hybrid.

### 5. Which functions exist?

`CODEBASE_CONTEXT.md` and `CHANGELOG.md` both document
`convertCurrency` / `convertCurrencySync` as live. Both are dead code (issue
D-3). A doc that instructs agents to trust it as architectural truth must not
contain this.

---

## Overlap

- **Status is described in six places** — `README.md`, `ROADMAP.md`, `CHANGELOG.md`, `CODEBASE_CONTEXT.md`, `LAUNCH-CHECKLIST.md`, `roadmap.ts`. Should be one, plus the machine-checked one.
- **Tesla setup in three** — `VEHICLE-CONNECTION.md`, `TESLA-API-CAPABILITIES.md`, `tesla-proxy/README.md`. Defensible: OAuth flow, platform capability, and proxy operations are genuinely different topics. Needs cross-links, not a merge.
- **Positioning in three** — `MARKETING.md`, `CONFLUENCE-PRODUCT-DOC.md`, `USER-RESEARCH-2026-06-11.md`.
- **Deployment in two** — Vercel and Hetzner, now needing a third story (telemetry host).

---

## Gaps — code with no documentation

Checked for each: does the code exist, and does any doc cover it?

| Subsystem | Code | Doc |
|---|---|---|
| Stripe billing | `src/app/api/billing/*`, `src/lib/subscription.ts` | **None.** Mentioned in passing only. Money has no doc. |
| Push notifications | `src/lib/push/`, `src/lib/notifications/`, 3 API routes, migrations 026–028 | **None.** A complete dark-shipped subsystem, undocumented. |
| The `/debug` console | 2252 lines + 11 API routes | **None.** The largest screen and the go-live control panel. |
| Charger ingest pipeline | `src/lib/chargers/ingest/`, 6 dedupe migrations | Partial — `FEATURES.md` §10 only |
| In-app migration runner | `src/lib/migrations/` | **None.** |
| i18n | 5 locales × 1019 keys | Rules in `CLAUDE.md`; no architecture doc |
| PWA | `src/lib/pwa/` | Partial — `USER-JOURNEY.md` install flow only |
| Rate limiting / Redis | `src/lib/rate-limit.ts`, `src/lib/redis.ts` | Only as a checklist bullet |
| Capability model | `src/lib/brands/`, `FeatureGate` | `BRANDS.md` + a 2026-05 design spec |

The pattern is clear: **infrastructure built recently is undocumented, while
product features from May and June are documented well.** The `CLAUDE.md`
documentation rule ("every feature MUST be documented in `docs/FEATURES.md`")
is being followed for user-facing features and skipped for platform work.

---

## Proposed target structure

Aim: **one authoritative doc per question**, plus a dated archive.

```
README.md                     ← rewrite: what it is, how to run, current status
CLAUDE.md / AGENTS.md         ← keep as-is (rules only)
CODEBASE_CONTEXT.md           ← keep as architecture truth; fix the drift

docs/
  STATUS.md                   ← NEW. Replaces ROADMAP.md + CHANGELOG's table.
                                 Points at src/lib/roadmap.ts for live state.
  FEATURES.md                 ← keep. Add the missing subsystems above.
  ARCHITECTURE.md             ← keep; refresh Tesla status
  TESLA.md                    ← merge VEHICLE-CONNECTION + TESLA-API-CAPABILITIES
                                 + tesla-proxy/README, or keep three with
                                 cross-links at the top of each
  SECURITY.md                 ← merge SECURITY-AUDIT + this pack's 04
  POSITIONING.md              ← merge MARKETING §3/§4/§6 + the graded catalogue
  OPERATIONS.md               ← NEW. Deploy (Vercel + Hetzner + telemetry host),
                                 env vars, migrations, cron, the /debug console
  SIMULATOR.md                ← keep
  COST-INTELLIGENCE.md        ← keep
  BRANDS.md                   ← keep
  LIVE-VS-DEMO.md             ← keep
  INTEGRATIONS-CAR-ADMIN.md   ← keep
  TODO.md                     ← keep (the real backlog)

  archive/
    2026-05-20-security-audit.md
    2026-06-11-user-research.md
    2026-06-XX-design-review.md
    2026-07-05-launch-checklist.md
    superpowers/specs/           ← move here as-is
```

**Delete:** `CHANGELOG.md`'s roadmap table (keep the version history),
`docs/CONFLUENCE-PRODUCT-DOC.md` (redundant export).

**Rename with dates:** every snapshot document, following the good precedent
already set by `USER-RESEARCH-2026-06-11.md` and `superpowers/specs/`. A dated
filename is the cheapest possible defence against a stale document being read
as current.

---

## The three edits worth making today

Independent of any restructuring:

1. **`README.md:5`** and **`docs/ROADMAP.md:5`** — remove "dormant". Live Tesla works.
2. **`CODEBASE_CONTEXT.md` "Active Blockers"** — both listed blockers are resolved.
3. **`docs/LAUNCH-CHECKLIST.md` §4b** — strike the three shipped items so the one real open item is visible.

Each is a one-line change, and each currently misleads every reader — including
every agent instructed to read these files before writing code.
