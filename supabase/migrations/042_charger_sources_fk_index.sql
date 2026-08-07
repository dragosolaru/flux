-- =============================================================================
-- 042: index charger_sources.charger_id.
--
-- charger_sources references chargers(id) ON DELETE CASCADE but migration 017
-- only ever indexed (source, source_ref) — the uniqueness constraint — never
-- the foreign key column. charger_connectors got its index (cc_charger); this
-- table was missed.
--
-- Postgres does not index a referencing column for you, so every cascade fired
-- a sequential scan of charger_sources to find the rows to remove. Deleting a
-- 2,000-row dedupe batch against ~20k source rows measured:
--
--   without the index   1,716 ms
--   with the index         25 ms
--
-- That cost rode on top of every dedupe pass, and on any other charger delete.
-- It is not the whole of the timeout that was reported — that was 041's planner
-- problem, compounded by re-applying 038 after 041 and reverting one of its
-- functions — but it is the part that would have kept the passes slow once
-- there were duplicates to actually remove. The earlier benchmark deleted no
-- rows, so it never exercised the cascade at all.
-- =============================================================================

create index if not exists charger_sources_charger_id_idx
  on public.charger_sources(charger_id);
