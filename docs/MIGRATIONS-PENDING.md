# Migrations waiting to be applied

**Everything here runs from `/debug` on a phone. No SQL editor, no copy-paste.**

`/debug` → Migrations. Each migration has its own Apply button. Tap them
**individually, in order**: `045`, `046`, `047`, `048`. Avoid *Apply all* — it
re-runs `034`–`044` as well, which is wasteful and slow on the dedupe ones.

Above the list there is a **Row-level security** tile with two buttons:

- **Check** — every table in `public`, which lack RLS, who owns them, and
  whether `anon`/`authenticated` can write to them. Write privileges are shown
  in red, because that is the half of the advisor's warning that matters.
- **Enable everywhere** — the sweep. Enables RLS on everything we own that
  lacks it, skips extension-owned tables, and reports each one.

Both need migration `048` applied first; until then Check says so.

Order matters and none of these have been applied; there is no CI runner and no
applied-state record in git for anything applied by hand.

Project `flux` · `bryhduakxqunixxbpsgn`.

---

## 0. The advisor alert — answered

Confirmed on 2026-08-09 by running the query below: **one row,
`spatial_ref_sys`, owner `supabase_admin`.** No table of ours is exposed —
every table created by a migration in this repo has RLS enabled.

```sql
select
  c.relname as table_name,
  pg_catalog.pg_get_userbyid(c.relowner) as owner
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = false
order by c.relname;
```

`spatial_ref_sys` is PostGIS's own table: ~8500 rows of EPSG projection
definitions, identical in every PostGIS installation on earth. It arrived
because migration `017` runs `create extension if not exists postgis` with no
`with schema`, so the extension installed into `public`. There is no user data
in it and never can be.

**The read half of the warning is noise. The write half is worth one query.**
RLS is not the only gate — a role also needs table privileges. Supabase grants
`anon`/`authenticated` broadly in `public`, so the question is whether they can
*modify* this table. A deleted projection row would break every coordinate
transform the charger map depends on: an availability bug, not a data leak, but
a real one.

```sql
select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'spatial_ref_sys'
  and grantee in ('anon', 'authenticated', 'PUBLIC')
group by grantee;
```

- **No rows, or `SELECT` only** → nothing to do. Dismiss the advisor finding.
- **`INSERT` / `UPDATE` / `DELETE` listed** → close it:

```sql
revoke insert, update, delete, truncate on table public.spatial_ref_sys
  from anon, authenticated;
```

That may fail with *must be owner* — `supabase_admin` owns the table and the
SQL editor runs as `postgres`. If it does, raise it with Supabase support; it is
their extension placement, and the app does not need those grants.

**Do not try to move the extension.** An earlier version of this note suggested
`alter extension postgis set schema extensions`. PostGIS does not support
`SET SCHEMA` — it raises *extension "postgis" does not support SET SCHEMA* —
so the only way to relocate it is to drop and recreate the extension, which
means dropping every `geometry`/`geography` column in the charger tables. Not
worth it for a table of projection constants.

---

## 1. `045_push_subscription_ownership.sql`

Re-keys the push subscription unique index from `endpoint` to
`(user_id, endpoint)`.

**Why:** posting another user's endpoint rewrote that row's `user_id` — the
victim lost their subscription and the attacker's notifications were delivered
to the victim's browser.

**Data change:** deletes duplicate `(user_id, endpoint)` rows, keeping the
newest. The old constraint made duplicates impossible, so expect zero deletions.
Safe to run twice.

## 2. `046_email_verification.sql`

Adds `profiles.email_verified_at timestamptz` (nullable).

**Why:** `/api/documents/recover` treated an email address as identity while
registration self-confirms every address. Anyone could register a stranger's
address and claim their unmatched documents.

**Data change:** none. Adds a column.

**After running:** `POST /api/documents/recover` returns `403
EMAIL_NOT_VERIFIED` until the address is confirmed. Intentional and fail-closed.

**You are exempt.** An address listed in `ADMIN_EMAILS` counts as verified —
that list lives in the deployment's environment, so being on it means whoever
controls the environment vouched for the address, which is stronger evidence
than a click in an inbox. So you can apply `046` now and nothing locks you out.

`RESEND_API_KEY` only matters when someone who is *not* on that list needs to
claim documents — i.e. when there is a second user. Until then it can stay
unset; `sendEmailToUser` returns early without it and nothing errors.

When you do want it:

| Variable | What to put |
|---|---|
| `RESEND_API_KEY` | From [resend.com](https://resend.com) → API Keys → Create. Starts `re_`. Free tier is 3 000 emails/month, no card. |
| `RESEND_FROM` | `Flux <onboarding@resend.dev>` to start — Resend's shared sender, works with no DNS setup, but **only delivers to the email address that owns the Resend account**. Fine for testing, useless for real users. For those, verify a domain in Resend (three DNS records) and use `Flux <no-reply@yourdomain>`. |

The current default is `Flux <alerts@flux.app>`, a domain nobody has verified,
so leaving `RESEND_FROM` unset while setting the key would have Resend reject
every send.

## 3. `047_revoke_function_execute_from_anon.sql`

Revokes `EXECUTE` on all functions in `public` from `anon` and `authenticated`,
and sets default privileges so new functions do not reopen the hole.

**Why:** ~20 `SECURITY DEFINER` functions across `018`–`044` run as their owner,
and PostgREST exposes every function the caller holds EXECUTE on at
`/rest/v1/rpc/<name>`. EXECUTE defaults to `PUBLIC`, so the browser-shipped anon
key reached `chargers_in_bbox`, `upsert_charger`, `upsert_chargers_batch` and
the dedupe family with RLS not consulted. Two of them write data. Migration
`031` enabled RLS on those tables and it did not help.

**Read before running.** Safe today because nothing uses those roles: every
access goes through a route holding the service-role key,
`src/lib/supabase/client.ts` is imported by nothing, and no client component
calls `.rpc()`. **If you later want a browser-callable RPC it will need an
explicit `grant execute on function <name>(<args>) to anon;`** — which is the
point of the change.

## 4. `048_enable_rls_everywhere.sql`

Creates three reporting functions and runs the sweep once.

**Why functions and not a plain `DO` block:** the panel applies migrations
through `exec_sql`, which returns `void`. A `DO` block's `RAISE NOTICE` output
goes nowhere, so from a phone the migration would succeed and tell you nothing —
which is the same as not knowing. `debug_rls_status()`,
`debug_table_grants(text)` and `debug_enable_rls_everywhere()` return rows
instead, and the RLS tile shows them.

All three are `SECURITY DEFINER`, revoked from `public`/`anon`/`authenticated`
and granted to `service_role` only — the same pattern as `035`.

**Expect it to change nothing today.** Every table of ours already has RLS and
`spatial_ref_sys` is skipped as extension-owned. `0 enabled, 1 skipped` is the
correct result, not a failure. It earns its place as a guard: the next table
created by hand in the SQL editor is what it is for, and that is exactly how
this alert happened.

---

## After all four

Tap **Check** on the RLS tile. Expected: `26/27 tables protected`, one exposed
row for `spatial_ref_sys`, and a verdict saying only extension-owned tables are
exposed. If the tile shows write privileges in red for it, that is the one thing
left worth chasing with Supabase support — the app does not need those grants
and cannot revoke them itself.
