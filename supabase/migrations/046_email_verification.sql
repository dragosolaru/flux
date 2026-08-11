-- 046_email_verification.sql
--
-- Proof that a user controls the address they registered with.
--
-- /api/auth/register calls createUser with email_confirm: true and sends no
-- verification mail, because login goes through signInWithPassword and Supabase
-- refuses an unconfirmed address. So auth.users.email_confirmed_at is set for
-- everyone the moment they register and proves nothing.
--
-- That mattered because /api/documents/recover treats the address as identity:
-- it hands over every unmatched inbound document whose sender_email matches.
-- Register someone else's address — which nothing prevented — and their
-- documents were claimable. Gating on Supabase's own confirmed_at would have
-- looked like a fix and changed nothing, since it is always set.
--
-- This column is ours, defaults to null, and is only ever written by
-- /api/account/verify-email after a signed link is opened from the inbox.

alter table public.profiles
  add column if not exists email_verified_at timestamptz;

comment on column public.profiles.email_verified_at is
  'Set when the user opened a signed verification link sent to this address. '
  'NOT the same as auth.users.email_confirmed_at, which registration forces.';
