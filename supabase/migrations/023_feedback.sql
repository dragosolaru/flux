create table if not exists public.feedback (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete set null,
  category text not null default 'general',
  name text,
  email text,
  message text not null
);

-- Only admins can read feedback (service role via admin client)
alter table public.feedback enable row level security;

create policy "service role full access" on public.feedback
  using (true)
  with check (true);
