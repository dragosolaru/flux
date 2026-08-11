-- 047_revoke_function_execute_from_anon.sql
--
-- Close the RLS bypass that PostgREST leaves open on SECURITY DEFINER functions.
--
-- Migration 031 enabled row level security on the charger tables. It did not
-- help: roughly twenty functions across 018–044 are SECURITY DEFINER, they run
-- as their owner, and PostgREST exposes every function the caller has EXECUTE
-- on at POST /rest/v1/rpc/<name>. EXECUTE defaults to PUBLIC, so anyone holding
-- the anon key — which ships in the browser bundle by design — could call
-- chargers_in_bbox, upsert_charger, upsert_chargers_batch, the dedupe family
-- and the debug stats functions directly, with the owner's privileges and RLS
-- not consulted. Two of them mutate the charger tables.
--
-- 035 and 037 already did this per-function for the debug helpers and exec_sql
-- (which executes arbitrary SQL — that one was correctly locked from the
-- start). This applies the same rule to the whole schema instead of listing
-- twenty signatures, which is both shorter and impossible to leave a gap in.
--
-- SAFE HERE, and the reason is specific rather than general: no application
-- code uses the anon or authenticated roles. Every database access goes through
-- a Next.js route holding the service-role key, and service_role is exempt from
-- the revoke below. src/lib/supabase/client.ts (createBrowserClient) exists but
-- is imported by nothing — verified by grep across src/ — and no client
-- component calls .rpc() anywhere.
--
-- IF THAT CHANGES: a function you deliberately want callable from the browser
-- needs an explicit `grant execute on function <name>(<args>) to anon;` after
-- this migration. Adding one is a decision; having twenty by default was not.

revoke execute on all functions in schema public from anon, authenticated;

-- New functions default to PUBLIC too, so without this the gap reopens with the
-- next migration that adds one. Applies to functions created by the role that
-- runs this statement, which is the role every migration here runs as.
alter default privileges in schema public
  revoke execute on functions from anon, authenticated;

-- Belt and braces: the server holds this role, and it must keep working.
grant execute on all functions in schema public to service_role;

alter default privileges in schema public
  grant execute on functions to service_role;
