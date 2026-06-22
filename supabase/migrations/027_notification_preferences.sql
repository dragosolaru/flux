-- 027_notification_preferences.sql
-- Per-user notification preferences: channel opt-ins + per-scenario opt-ins.
-- One row per user, upserted on first save.

create table if not exists public.notification_preferences (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  push_enabled        boolean not null default true,
  email_enabled       boolean not null default false,
  whatsapp_enabled    boolean not null default false,
  notify_rain_windows boolean not null default true,
  notify_freeze       boolean not null default true,
  notify_heat         boolean not null default true,
  notify_hail         boolean not null default true,
  updated_at          timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists "Users can only access their own notification preferences" on public.notification_preferences;
create policy "Users can only access their own notification preferences"
  on public.notification_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
