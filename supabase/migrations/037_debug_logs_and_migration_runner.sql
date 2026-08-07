-- =============================================================================
-- 037: bootstrap for the debug panel's log view and one-tap migration runner.
--
-- This is the one migration that must be pasted into the SQL editor by hand;
-- everything after it can be applied from /debug.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- debug_logs — server-side warnings/errors, readable from the app.
--
-- console.error only reaches the platform's log viewer, and each serverless
-- instance is separate, so a failure seen by one invocation is invisible
-- everywhere else. Persisting the important ones makes them reviewable from
-- the debug panel instead.
--
-- Deliberately not a general application log: writes are meant for warn/error
-- on the ingest paths, which are rare, so this stays small.
-- ---------------------------------------------------------------------------
create table if not exists public.debug_logs (
  id         bigserial primary key,
  level      text not null check (level in ('info', 'warn', 'error')),
  scope      text not null,
  message    text not null,
  context    jsonb,
  created_at timestamptz not null default now()
);

create index if not exists debug_logs_created_idx on public.debug_logs (created_at desc);

-- Service-role only: written by the server, read through an admin-gated route.
alter table public.debug_logs enable row level security;

-- Keep the table bounded — this is a rolling window, not an archive.
create or replace function public.prune_debug_logs(p_keep integer default 500)
returns void
language sql
security definer
set search_path = public
as $$
  delete from debug_logs
  where id not in (
    select id from debug_logs order by created_at desc limit p_keep
  );
$$;

-- ---------------------------------------------------------------------------
-- exec_sql — executes a migration body.
--
-- Called ONLY with SQL from the server-side registry in
-- src/lib/migrations/registry.ts. The API route in front of it accepts a
-- migration id, never SQL from the client, so no caller-supplied statement can
-- reach this function through the app.
--
-- Execute is revoked from public/anon and granted to service_role only, which
-- is the same trust level as the key the server already holds.
-- ---------------------------------------------------------------------------
create or replace function public.exec_sql(p_sql text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  execute p_sql;
end;
$$;

revoke all on function public.exec_sql(text) from public, anon, authenticated;
grant execute on function public.exec_sql(text) to service_role;

revoke all on function public.prune_debug_logs(integer) from public, anon, authenticated;
grant execute on function public.prune_debug_logs(integer) to service_role;

-- ---------------------------------------------------------------------------
-- applied_migrations — what the runner has applied.
--
-- Records only what was applied through /debug. Migrations run by hand in the
-- SQL editor are not listed, so the panel reports "unknown" rather than
-- claiming they are missing.
-- ---------------------------------------------------------------------------
create table if not exists public.applied_migrations (
  id         text primary key,
  applied_at timestamptz not null default now(),
  applied_by text
);

alter table public.applied_migrations enable row level security;
