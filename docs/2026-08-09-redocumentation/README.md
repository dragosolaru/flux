# Redocumentation — 2026-08-09

A full pass over the Flux codebase and its documentation, done on 2026-08-09.
The goal was to answer three questions honestly: **what is this today**, **where
is it going**, and **what is half-finished** — plus a separate, actionable list
of everything broken, dead, or duplicated.

Nothing outside this folder was changed. These documents describe the repository;
they do not replace `docs/` yet. See `06-DOCS-AUDIT.md` for the proposed merge.

---

## The pack

| # | Document | What it answers |
|---|----------|-----------------|
| 1 | [`01-STATE-OF-THE-APP.md`](01-STATE-OF-THE-APP.md) | **What is now.** Every page, every API route, every module, graded SHIPPED / PARTIAL / MOCK-ONLY / DEAD. |
| 2 | [`02-WHERE-WE-ARE-GOING.md`](02-WHERE-WE-ARE-GOING.md) | **What we want to do, and what is in flight.** Consolidated from four disagreeing sources into one ordered list. |
| 3 | [`03-COMPETITIVE-EDGE.md`](03-COMPETITIVE-EDGE.md) | **What we do better than the others.** The differentiation doc you remembered — located, consolidated, and stress-tested against the code. |
| 4 | [`04-SECURITY-REVIEW.md`](04-SECURITY-REVIEW.md) | **Can someone steal a customer's car?** Findings ranked by severity, focused on Tesla tokens and command signing keys. |
| 5 | [`05-ISSUES-AND-TECH-DEBT.md`](05-ISSUES-AND-TECH-DEBT.md) | **The fix-later list.** Bugs, dead code, duplication — every entry with a `file:line` reference. |
| 6 | [`06-DOCS-AUDIT.md`](06-DOCS-AUDIT.md) | **Which documents lie.** Contradictions between docs, and the proposed target structure. |

---

## The one-paragraph summary

Flux is further along than its own documentation says. The engineering
substance is real — `tsc` and `eslint` are both clean, there is not a single
`any` in 378 source files, all five locales carry exactly 1019 keys with zero
drift, secrets are compared in constant time, the debug surface is behind an
email allowlist, and the CSP is nonce-based. **The live Tesla integration
works** — as of today's commit it is signing real commands to a real car — while
`README.md` and `docs/ROADMAP.md` both still describe it as "dormant". The
genuine gaps are commercial and operational, not architectural: subscription
limits are stubbed open, three charger APIs exist where one is used, two map
screens do the same job, and there is no second confirmation before a remote
unlock.

---

## Coverage and honesty note

This pass was originally dispatched to five parallel specialist agents
(feature inventory, security, code health, docs audit, Tesla integration). All
five were killed early by a shared API session limit, so the work was redone
directly and sequentially. That changes what the coverage looks like, and it is
worth being precise about it:

**Verified by reading code or running tools:**
- `npx tsc --noEmit` — clean (exit 0)
- `npm run lint` — clean (no output)
- i18n key parity across all 5 locale files — computed programmatically, 1019/1019
- `auth()` and `user_id` presence across all 70 API routes — enumerated
- Admin guard coverage on all 11 `/api/internal/debug/*` routes — enumerated
- Token encryption (`src/lib/tesla/tokens.ts`) — read in full
- Public-key serving path and the `next.config.ts` rewrite — read in full
- Dead-module scan across `src/lib`, `src/components`, `src/hooks`, `src/contexts`
- Consumer analysis for the three charger endpoints and the map pages
- `MARKETING.md`, `ROADMAP.md`, `LAUNCH-CHECKLIST.md`, `LIVE-VS-DEMO.md`,
  `CHANGELOG.md`, `README.md`, `CODEBASE_CONTEXT.md` — read in full

**Not verified, and therefore not claimed:**
- Per-route IDOR analysis. The presence of a `user_id` filter was counted
  mechanically; each query's *correctness* was not individually read. The
  routes with `uid=0` in `01-STATE-OF-THE-APP.md` are flagged for a human pass.
- RLS policy contents across all 44 migrations. Only the launch-critical
  migration `031_enable_rls_charger_tables.sql` was traced, via its mention in
  the launch checklist.
- Runtime behaviour. Nothing was executed against a live deployment, a real
  Tesla, or a populated database.
- The mock simulator's physics and the OCR pipeline's accuracy.

Where a statement below is inference rather than observation, it says so.
