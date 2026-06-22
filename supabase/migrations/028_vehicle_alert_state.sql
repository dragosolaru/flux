-- 028_vehicle_alert_state.sql
-- Dedup state for the alert engine: prevents re-firing the same alert within a
-- single parking session. Written only by the poll-vehicles cron (service role).

create table if not exists public.vehicle_alert_state (
  vehicle_id      uuid not null references public.vehicles(id) on delete cascade,
  alert_type      text not null,
  session_key     text not null,
  last_alerted_at timestamptz not null default now(),
  primary key (vehicle_id, alert_type)
);

alter table public.vehicle_alert_state enable row level security;
-- No RLS policies — accessed exclusively via the service role (cron job).
