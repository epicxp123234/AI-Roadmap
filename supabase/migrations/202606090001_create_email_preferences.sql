create table if not exists public.email_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weekly_enabled boolean not null default false,
  checkin_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_preferences enable row level security;

create policy "Users can read their email preferences"
  on public.email_preferences
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create their email preferences"
  on public.email_preferences
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their email preferences"
  on public.email_preferences
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
