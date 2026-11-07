-- Watchdog Wallet: per-user storage.
-- Run this once in your Supabase project: Dashboard > SQL Editor > New query > paste > Run.

-- One row per account holding that user's dashboard (goals, budgets, transactions, bills, contacts…).
create table if not exists public.user_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row Level Security: every user can only ever see and change their own row.
alter table public.user_state enable row level security;

drop policy if exists "read own state" on public.user_state;
create policy "read own state" on public.user_state
  for select using (auth.uid() = user_id);

drop policy if exists "insert own state" on public.user_state;
create policy "insert own state" on public.user_state
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own state" on public.user_state;
create policy "update own state" on public.user_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete own state" on public.user_state;
create policy "delete own state" on public.user_state
  for delete using (auth.uid() = user_id);

-- Account deletion: lets a signed-in user delete their own account and data, and nothing else.
-- The website only has the public key, which can't delete logins, so it calls this instead.
-- "security definer" runs it with the owner's rights; auth.uid() limits it to the caller.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from public.user_state where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
