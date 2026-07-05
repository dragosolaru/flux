-- =============================================================================
-- Flux — migration 033: saved_routes hardening
--
-- Every GET/count/PATCH/DELETE filters by user_id and the RLS policy evaluates
-- user_id = auth.uid() — without an index each is a sequential scan.
-- =============================================================================

create index if not exists saved_routes_user_id_idx
  on public.saved_routes(user_id);
