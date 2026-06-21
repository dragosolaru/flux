-- Harden feedback RLS. The original policy `using (true) with check (true)`
-- applied to ALL roles (anon/authenticated), contradicting the intent that
-- only admins read feedback. Writes go through the service-role admin client,
-- which bypasses RLS — so the table needs NO permissive policy. Dropping it
-- (like stripe_events) leaves RLS enabled with no policy: service-role only,
-- no anon/authenticated read or write.
drop policy if exists "service role full access" on public.feedback;
