@AGENTS.md

# Flux — Rules for AI Agents

> Full architecture reference: read **CODEBASE_CONTEXT.md** before writing any code.

## Non-negotiable security rules

1. Every API route → `auth()` + check `session?.user?.id` first.
2. Every DB query on user data → `.eq("user_id", session.user.id)`.
3. `getValidAccessToken(vehicleId, userId)` — always pass `userId` (ownership check inside).
4. `callbackUrl` redirects → validate `startsWith("/")` before `router.replace()`.
5. Webhook secrets → `x-webhook-secret` header only, never query params. Fail closed (503) if unconfigured.
6. Rate limit → `checkRateLimit(userId, bucket, max)` from `src/lib/rate-limit.ts`.

## Non-negotiable i18n rules

- All visible strings → `useTranslations("namespace")` in client, `getTranslations` in server.
- Add keys to **all 5** locale files at once: `en.json`, `ro.json`, `de.json`, `fr.json`, `hu.json`.
- Path: `src/lib/i18n/locales/`.

## Adding a command (checklist)

`CommandName` (history.ts) → `CommandCapabilities` (brands/types.ts) → `COMMAND_CAP_MAP` (brands/command-map.ts) → `TESLA_COMMAND_MAP` (brands/tesla/command-map.ts) → `TeslaCommand` (types/tesla.ts) → tesla profile → mock engine switch case.

## Code style

- No `any` — use `unknown` + type guards.
- No comments unless the WHY is non-obvious.
- No abstraction beyond what the task needs. Three similar lines > premature helper.
- `npx tsc --noEmit` must pass before committing.
