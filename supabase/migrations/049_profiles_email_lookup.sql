-- 049_profiles_email_lookup.sql
--
-- Removes a hard scaling cliff on the sign-in path.
--
-- Two places resolve a Supabase user id from an email address, and both do it
-- by paging through `auth.admin.listUsers({ perPage: 100 })` until they find a
-- match, capped at ten pages:
--
--   src/lib/auth.ts:73          — every Google sign-in
--   src/lib/supabase/ensure-user.ts:55 — every write route that needs the id
--
-- That is up to ten sequential admin API round-trips on a login. Slow is the
-- lesser problem. At 1001 users the scan silently fails to find an existing
-- account and `auth.ts` falls through to `createUser`, which means a returning
-- user gets a SECOND account and loses every vehicle, document and cost record
-- attached to the first. Nothing errors; it just looks like the data vanished.
--
-- `profiles` already mirrors `auth.users` through the handle_new_user trigger.
-- Adding the email there makes the lookup one indexed query with no cap.
--
-- The column is a mirror, never a source of truth: auth.users owns the address,
-- and the trigger below keeps this copy in step on insert and on update (an
-- email change previously left the profile row stale forever, because the
-- trigger only fired on insert).

alter table public.profiles
  add column if not exists email text;

-- Backfill what already exists. auth.users is readable from a migration.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is distinct from u.email;

-- Case-insensitive, because addresses are compared lowercased everywhere in the
-- app and a unique index on the raw value would let Alice@ and alice@ coexist.
create unique index if not exists profiles_email_key
  on public.profiles (lower(email))
  where email is not null;

-- Now also fires on update: an address change used to leave this copy stale.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, email)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    new.email
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute procedure public.handle_new_user();

revoke all on function public.handle_new_user() from public, anon, authenticated;
