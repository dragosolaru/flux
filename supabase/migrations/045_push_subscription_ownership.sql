-- 045_push_subscription_ownership.sql
--
-- A push endpoint was globally unique, and /api/push/subscribe upserted with
-- onConflict: "endpoint". Posting an endpoint that already belonged to someone
-- else therefore rewrote that row's user_id: the victim silently lost their
-- subscription and the attacker's notifications were delivered to the victim's
-- browser.
--
-- The conflict target becomes (user_id, endpoint), so a repeat subscribe still
-- updates your own row and a foreign endpoint can only ever create a row of
-- your own. It cannot take one over.
--
-- Duplicates are removed first, newest kept, or the new unique index cannot be
-- built. There should be none — the old constraint made them impossible — but
-- this must be safe to run twice.

delete from public.push_subscriptions a
using public.push_subscriptions b
where a.user_id = b.user_id
  and a.endpoint = b.endpoint
  and a.ctid < b.ctid;

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_endpoint_key;

create unique index if not exists push_subscriptions_user_endpoint_key
  on public.push_subscriptions (user_id, endpoint);
