# Migrations waiting to be applied

Run these in the Supabase SQL editor, **in this order**. None of them have been
applied — there is no CI runner and no applied-state record in git for
hand-applied migrations.

Project `flux` · `bryhduakxqunixxbpsgn`.

---

## 0. First, see what the advisor is actually flagging

Before running anything, paste this and keep the output:

```sql
select
  c.relname as table_name,
  pg_catalog.pg_get_userbyid(c.relowner) as owner,
  (select count(*) from pg_depend d where d.objid = c.oid and d.deptype = 'e') > 0 as owned_by_extension
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = false
order by c.relname;
```

Every table created by a migration in this repo already has RLS enabled —
verified one at a time. So the flagged table is either one created by hand in
the SQL editor, or an extension's.

**The likely answer is `spatial_ref_sys`.** Migration `017` runs
`create extension if not exists postgis` with no `with schema`, so PostGIS
installs into `public` and brings `public.spatial_ref_sys` with it: about 8500
rows of EPSG projection definitions. It is reference data shipped with the
extension — no user data, nothing of yours in it — and it is world-readable in
every PostGIS install. `alter table` on it fails with *must be owner*, so it
cannot be fixed by a migration.

If that is what the query returns, the options are:

- **Accept it.** Read-only projection constants being readable is not a data
  exposure. This is the common choice and Supabase's own advisor documentation
  treats it as a known case.
- **Move the extension out of `public`:** `alter extension postgis set schema
  extensions;`. Disruptive — every `geography`/`geometry` type reference has to
  resolve through the new schema, so the charger tables and every PostGIS
  function in `018`–`044` need `search_path` checked afterwards. Do not do this
  in the same sitting as the migrations below.

If the query returns anything **else**, that is a real finding and `048` fixes
it.

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

**Why:** the advisor alert. Written as a sweep rather than a named table so it
also covers anything created by hand in the SQL editor since.

**No policies are added, deliberately** — service-role bypasses RLS, and
`anon`/`authenticated` are unused. A table that genuinely needs browser access
needs a policy written for it on purpose.

**Read the `NOTICE` output.** It names each table it enabled and each it
skipped. The trailing `select` shows what is still exposed — expect zero rows,
or `spatial_ref_sys` and the decision above.

---

## After all four

Re-run the query in §0. Then re-run the Supabase advisor. Anything still listed
should be extension-owned and explainable; if a table of ours appears, `048`
skipped it for a privilege reason and the `NOTICE` output will say which.
