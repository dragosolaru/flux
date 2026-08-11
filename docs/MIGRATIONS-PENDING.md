# Migrations waiting to be applied

Run these in the Supabase SQL editor, **in this order**. None of them have been
applied — there is no CI runner and no applied-state record in git for
hand-applied migrations.

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
EMAIL_NOT_VERIFIED` for everyone until they confirm. That is intentional and
fail-closed. **Set `RESEND_API_KEY` and `RESEND_FROM` in Vercel first**, or the
verification mail silently no-ops (`sendEmailToUser` returns early when the key
is missing) and nobody can pass the gate.

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

Enables RLS on every ordinary table in `public` that lacks it, skipping
extension-owned tables, and prints what it did.

**It will change nothing today**, and that is the honest expectation: the sweep
found every one of our tables already has RLS, and it skips `spatial_ref_sys`
because PostGIS owns it. Expect `RLS sweep complete: 0 enabled, 0 skipped` and
one row from the trailing select.

Run it anyway, or don't. It earns its place as a guard, not a fix — the next
table created by hand in the SQL editor is the one it is for, and that is
exactly how this alert happened.

---

## After all four

Re-run the query in §0. The expected result is one row, `spatial_ref_sys`. If a
table of **ours** appears, `048` skipped it for a privilege reason and its
`NOTICE` output will say which.
