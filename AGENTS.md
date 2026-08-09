<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Agent Workflow — Flux

## Parallel agent patterns

**When to parallelise:** independent tasks with no shared files — run in one message, multiple `Agent()` calls.

**Implementation pattern:**
```
Agent(research,   subagent_type="Explore")          # find relevant files
Agent(feature-A,  isolation="worktree")              # implement A
Agent(feature-B,  isolation="worktree")              # implement B in parallel
Agent(review,     subagent_type="claude")            # senior review after merge
```

**Review agent prompt template:**
> "Review the diff for security, correctness, and KISS. Check: auth on every route, user_id filter on every DB query, i18n keys in all 5 locales, tsc passes. Report findings as: [BLOCKER] / [WARN] / [OK]."

## KISS rules (Keep It Simple)

- Fix the bug; don't refactor the surrounding code.
- One purpose per file, one responsibility per function.
- No feature flags, no backwards-compat shims — just change the code.
- Prefer reading existing code over guessing. Use `Explore` agent for codebase discovery.

## Before starting any task

1. Read `CODEBASE_CONTEXT.md` — stack, file map, key patterns.
2. For security changes → also read `docs/SECURITY-AUDIT.md`.
3. For Tesla integration → also read `docs/VEHICLE-CONNECTION.md` (setup and
   OAuth) and `docs/TESLA-API-CAPABILITIES.md` (what the API can and cannot
   do, graded — read it before promising a feature).
4. For cost/OCR pipeline → also read `docs/COST-INTELLIGENCE.md`.

## Commit rules

- `npx tsc --noEmit` passes before commit.
- `npm run lint` passes before commit.
- Commit message: `type(scope): short description` — `fix`, `feat`, `docs`, `refactor`.
- **Current mode — commit straight to `main`.** Solo dev, field-testing on mobile, no reviewer available; a feature branch would only add a merge step nobody is waiting on. Commit and push to `main` directly.
- Never `--no-verify`, never `--force-push` main.

> Revert to feature branches once a second person is on the repo, or once
> real customers are on the deploy and a bad `main` is a live outage rather
> than a five-minute fix. The bar is "someone other than the author would
> have to notice the breakage" — until then, `main` is the working branch.
