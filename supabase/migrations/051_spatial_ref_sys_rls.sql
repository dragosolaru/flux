-- 051_spatial_ref_sys_rls.sql
--
-- Closes the Supabase linter's `rls_disabled_in_public` on
-- `public.spatial_ref_sys`.
--
-- What the table is: PostGIS's catalogue of coordinate reference systems — the
-- EPSG definitions every `ST_Transform` looks up. It arrives with the extension
-- and lands in `public` because that is where PostGIS was installed. Nothing in
-- it is ours and nothing in it is secret; the finding is real all the same,
-- because a table in `public` with RLS off is readable by `anon` through
-- PostgREST, and "it is only reference data" is exactly the reasoning that
-- leaves the next such table exposed too.
--
-- Why this is not a one-liner: `spatial_ref_sys` is owned by the extension, not
-- by us, and `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` requires ownership.
-- Depending on how the project was provisioned that statement either works or
-- fails with `insufficient_privilege`, and a migration that dies there would
-- block every migration after it. So it is attempted, and if it cannot be done
-- the grants are withdrawn instead — which removes the same exposure by the
-- other end: with no SELECT for `anon` and `authenticated`, PostgREST has
-- nothing to serve whether RLS is on or not.
--
-- Safe for the app either way: every PostGIS query here runs through the
-- service-role client, and `service_role` bypasses RLS and keeps its grants.

do $$
begin
  execute 'alter table public.spatial_ref_sys enable row level security';
  raise notice 'spatial_ref_sys: RLS enabled';
exception
  when insufficient_privilege or wrong_object_type then
    raise notice 'spatial_ref_sys: not ours to alter, revoking grants instead';
end;
$$;

-- Belt and braces, and the whole fix on a project where the ALTER was refused.
-- PostGIS itself reads this table as the extension owner, so revoking the two
-- PostgREST roles costs nothing.
revoke all on table public.spatial_ref_sys from anon, authenticated;

-- If RLS did switch on, a table with no policy denies everyone who is not the
-- owner and not BYPASSRLS. That is the intent: nobody reaches this through the
-- API, and the server's service-role client is unaffected.
