-- 031: Enable RLS on charger reference tables and exchange_rates.
--
-- These tables are shared (not user-scoped) and accessed exclusively via the
-- service-role admin client, which bypasses RLS. Enabling RLS with no
-- permissive policies is the correct model: service-role reads/writes freely;
-- anon/authenticated have no access (same pattern as stripe_events,
-- vehicle_alert_state).
--
-- The Supabase advisor flagged these five tables as publicly accessible.

alter table public.chargers          enable row level security;
alter table public.charger_connectors enable row level security;
alter table public.charger_sources   enable row level security;
alter table public.ingest_runs       enable row level security;
alter table public.exchange_rates    enable row level security;
