-- Idempotency ledger for Stripe webhook events. Stripe retries deliveries and
-- can send events out of order; we record each processed event id and skip
-- duplicates so a replayed event can't flip a customer's subscription tier.
create table if not exists stripe_events (
  id           text primary key,
  type         text not null,
  processed_at timestamptz not null default now()
);

alter table stripe_events enable row level security;
-- No policies: only the service-role client (server-side webhook) touches this table.
