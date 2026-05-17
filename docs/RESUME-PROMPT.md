# Resume prompt — paste into the next Claude Code session

Use this file to brief a fresh Claude Code session (especially when continuing remotely via `claude.ai/code` or Codespaces). Copy the **prompt block** below into the chat as your first message; everything before it is context for *you*, not for Claude.

---

## How to use

1. Open this repo in Claude Code (locally, in Codespaces, or on `claude.ai/code`).
2. As the very first message in the new chat, paste the prompt block below.
3. Claude will load context from `flux/docs/`, `flux/openspec/`, and memory, then ask what you want to tackle.

If you also want Claude to start implementing right away rather than just confirm, append your specific request at the end (e.g. *"start with Phase 1, tasks 1.1 through 1.5"*).

---

## Prompt block — paste this into Claude Code

```
Resume session for Flux (DAO Lab's multi-brand EV management web app).

CONTEXT YOU MUST READ BEFORE ANSWERING:
- flux/docs/SCOPE.md         (product direction, post 2026-05-17 pivot)
- flux/docs/ARCHITECTURE.md  (engineering rationale + new sections on brand
                              registry, Tier-3 simulator, capability-driven
                              UI, external-data abstraction, mock disclosure,
                              legacy live-Tesla preservation)
- flux/docs/NEXT-STEPS.md    (execution roadmap across 14 phases)
- flux/openspec/project.md   (project-wide OpenSpec conventions)
- flux/openspec/changes/pivot-mock-first-platform/{proposal,design,tasks}.md
                              (formal change record, 102 tasks)
- flux/openspec/changes/pivot-mock-first-platform/specs/**/spec.md
                              (8 capability deltas, validated strict)

WHERE WE ARE:
- On branch `claude_feature_pivot-mock-first-platform`.
- A safety backup of pre-pivot main exists at branch
  `backup-main-pre-pivot-2026-05-17`.
- 0/102 tasks implemented. Phase 1 (brand registry + capability system)
  is the natural starting point — nothing else can be built cleanly
  without it.

PRODUCT POSTURE:
- Mock-first, multi-brand. 7 EU brands targeted (Tesla, BMW, Polestar,
  Mercedes-EQ, VW-ID, Hyundai/Kia, Renault), all `dataSource = "mock"`.
- Real Tesla code stays in the tree behind `LIVE_INTEGRATIONS` env flag.
  Do NOT delete `src/lib/tesla/*`, `/api/tesla/*`, or `tesla-proxy/`.
- Tier-3 stateful simulator (per-vehicle state machine, deterministic
  tick on read, commands mutate state, charging sessions and trips
  accumulate from motion-state transitions).
- Capability-driven UI: components gate on `useBrandCapabilities()`;
  unsupported features hide entirely (never disabled).
- Beyond-OEM mocked layers: energy tariffs, charging-network discovery,
  weather + range derating, trip planning.
- Mock disclosure is non-negotiable: `MOCK` chip per simulated card,
  global "Demo mode" banner when all-mock, `/about-data` transparency page.

STACK INVARIANTS (do not change):
- Next.js 16 App Router (read node_modules/next/dist/docs/ before
  writing Next-specific code).
- TypeScript strict; no `any`, no `@ts-ignore`.
- Zod validates every API boundary.
- AES-256-GCM for any OAuth tokens at rest.
- Row-Level Security on every Supabase table.
- Auth.js owns session identity; Supabase auth.users owns the user row.

WHAT TO DO FIRST:
- Run `openspec status pivot-mock-first-platform` to confirm 0/102.
- If validation drift is suspected, run
  `openspec validate pivot-mock-first-platform --strict`.
- Ask me which phase to tackle. Default suggestion: Phase 1, tasks 1.1
  through 1.10 (brand registry scaffolding).

DO NOT:
- Delete any preserved Tesla legacy code.
- Modify capability profiles without updating the spec deltas.
- Implement features outside the current phase without proposing it.
- Push to remote without my explicit confirmation.

If you are about to make a non-trivial structural change that is not in
the OpenSpec tasks list, stop and propose it via a new OpenSpec change
first (`/opsx:propose`).

Please confirm you have read the listed files and tell me where you'd
like to start.
```

---

## Companion commands to know

| What you want                                     | Command                                                        |
| ------------------------------------------------- | -------------------------------------------------------------- |
| List active OpenSpec changes                      | `openspec list`                                                |
| Show this change                                  | `openspec show pivot-mock-first-platform`                      |
| Status (X/N tasks complete)                       | `openspec status pivot-mock-first-platform`                    |
| Strict validation                                 | `openspec validate pivot-mock-first-platform --strict`         |
| Start implementing tasks                          | Use slash command `/opsx:apply` in Claude Code                 |
| Archive when done                                 | Slash command `/opsx:archive` or `openspec archive <name>`     |

## Branches to know about

| Branch                                       | Purpose                                                                                 |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| `main`                                       | Pre-pivot state (last commit was the live-Tesla provisioning).                          |
| `backup-main-pre-pivot-2026-05-17`           | Safety pointer at the same SHA as pre-pivot `main`. Do not delete.                      |
| `claude_feature_pivot-mock-first-platform`   | This branch. Holds the pivot docs + OpenSpec change. Implementation tasks land here.    |

When this branch is ready to merge, open a PR against `main`. The change should be archived via `openspec archive` after merge so the spec deltas fold into `openspec/specs/`.
