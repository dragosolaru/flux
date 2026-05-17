-- User-level settings: active tariff provider selection.

create table if not exists user_settings (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  tariff_provider  text not null default 'tibber-mock',
  updated_at       timestamptz not null default now()
);

alter table user_settings enable row level security;

drop policy if exists "Users can manage their own settings" on user_settings;
create policy "Users can manage their own settings"
  on user_settings for all
  using (user_id = auth.uid());
