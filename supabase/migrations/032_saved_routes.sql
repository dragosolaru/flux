create table public.saved_routes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  origin_label    text not null,
  origin_lat      float8 not null,
  origin_lng      float8 not null,
  destination_label text not null,
  destination_lat float8 not null,
  destination_lng float8 not null,
  stops           jsonb not null default '[]',
  plan_snapshot   jsonb not null default '{}',
  created_at      timestamptz not null default now()
);

alter table public.saved_routes enable row level security;

create policy "owner_all" on public.saved_routes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
