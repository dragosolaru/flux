alter table profiles
  add column if not exists subscription_tier text not null default 'free'
    check (subscription_tier in ('free', 'pro')),
  add column if not exists stripe_customer_id text unique,
  add column if not exists subscription_started_at timestamptz,
  add column if not exists subscription_ends_at timestamptz;
