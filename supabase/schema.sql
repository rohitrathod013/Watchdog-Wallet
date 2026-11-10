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

-- ==================================================================
-- Friends, chat and shared money: send, request and split a bill.
-- Safe to run again: everything here is "if not exists" or "or replace".
-- Money only moves through the functions below, which check that both
-- people are friends. Row level security lets each person see only
-- their own friends, messages, requests and transfers.
-- ==================================================================

-- name and email, so friends can find and recognise each other
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null default '',
  email       text not null default '',
  invite_code text not null unique default substr(md5(random()::text || clock_timestamp()::text), 1, 10),
  updated_at  timestamptz not null default now()
);

-- a friend request (pending) or a friendship (accepted), one per pair
create table if not exists public.connections (
  id         uuid primary key default gen_random_uuid(),
  requester  uuid not null references auth.users (id) on delete cascade,
  addressee  uuid not null references auth.users (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester <> addressee)
);
create unique index if not exists connections_pair
  on public.connections (least(requester, addressee), greatest(requester, addressee));

-- a shared bill; each friend's share is a money request below
create table if not exists public.splits (
  id         uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 80),
  total      numeric(12, 2) not null check (total > 0 and total <= 100000),
  created_at timestamptz not null default now()
);

-- "please pay me": the requester gets the money, the payer is asked for it
create table if not exists public.money_requests (
  id         uuid primary key default gen_random_uuid(),
  requester  uuid not null references auth.users (id) on delete cascade,
  payer      uuid not null references auth.users (id) on delete cascade,
  amount     numeric(12, 2) not null check (amount > 0 and amount <= 10000),
  note       text not null default '' check (char_length(note) <= 140),
  split_id   uuid references public.splits (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'paid', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

-- money that moved from one friend to another
create table if not exists public.transfers (
  id         uuid primary key default gen_random_uuid(),
  sender     uuid not null references auth.users (id) on delete cascade,
  recipient  uuid not null references auth.users (id) on delete cascade,
  amount     numeric(12, 2) not null check (amount > 0 and amount <= 10000),
  note       text not null default '' check (char_length(note) <= 140),
  request_id uuid references public.money_requests (id) on delete set null,
  created_at timestamptz not null default now()
);

-- chat; payments, requests and splits also post a message that points at them (ref)
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  sender     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipient  uuid not null references auth.users (id) on delete cascade,
  kind       text not null default 'text' check (kind in ('text', 'payment', 'request', 'split')),
  body       text not null default '' check (char_length(body) <= 2000),
  ref        uuid,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
-- photos, videos, files and voice notes: the file lives in the chat-media bucket (see the end)
alter table public.messages add column if not exists media jsonb;
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'payment', 'request', 'split', 'media'));
create index if not exists messages_sender on public.messages (sender, created_at desc);
create index if not exists messages_recipient on public.messages (recipient, created_at desc);

-- helpers (security definer, so the policies below don't loop through each other)
create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.connections c
    where c.status = 'accepted'
      and ((c.requester = a and c.addressee = b) or (c.requester = b and c.addressee = a))
  )
$$;

create or replace function public.are_linked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.connections c
    where (c.requester = a and c.addressee = b) or (c.requester = b and c.addressee = a)
  )
$$;

-- make sure someone has a profile, using the name and email on their login
create or replace function public.seed_profile(uid uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.profiles (id, name, email)
  select u.id,
         left(coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), nullif(u.raw_user_meta_data ->> 'name', ''), split_part(u.email, '@', 1)), 60),
         coalesce(u.email, '')
  from auth.users u where u.id = uid
  on conflict (id) do nothing
$$;
revoke all on function public.seed_profile(uuid) from public, anon, authenticated;

alter table public.profiles enable row level security;
alter table public.connections enable row level security;
alter table public.splits enable row level security;
alter table public.money_requests enable row level security;
alter table public.transfers enable row level security;
alter table public.messages enable row level security;

drop policy if exists "see self and linked people" on public.profiles;
create policy "see self and linked people" on public.profiles
  for select using (id = auth.uid() or public.are_linked(auth.uid(), id));

drop policy if exists "see own connections" on public.connections;
create policy "see own connections" on public.connections
  for select using (auth.uid() in (requester, addressee));
drop policy if exists "end own connections" on public.connections;
create policy "end own connections" on public.connections
  for delete using (auth.uid() in (requester, addressee));

drop policy if exists "see own splits" on public.splits;
create policy "see own splits" on public.splits
  for select using (
    created_by = auth.uid()
    or exists (select 1 from public.money_requests r where r.split_id = splits.id and r.payer = auth.uid())
  );

drop policy if exists "see own requests" on public.money_requests;
create policy "see own requests" on public.money_requests
  for select using (auth.uid() in (requester, payer));

drop policy if exists "see own transfers" on public.transfers;
create policy "see own transfers" on public.transfers
  for select using (auth.uid() in (sender, recipient));

drop policy if exists "see own messages" on public.messages;
create policy "see own messages" on public.messages
  for select using (auth.uid() in (sender, recipient));
drop policy if exists "chat with friends" on public.messages;
create policy "chat with friends" on public.messages
  for insert with check (
    sender = auth.uid() and public.are_friends(sender, recipient)
    and (
      (kind = 'text' and media is null and char_length(body) between 1 and 2000)
      -- a media message must point at a file in this pair's own folder
      or (kind = 'media' and jsonb_typeof(media) = 'object'
          and (media ->> 'path') like auth.uid()::text || '/' || recipient::text || '/%')
    )
  );

-- create or refresh my profile; returns it (with my invite code)
create or replace function public.ensure_profile(p_name text default null)
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  result public.profiles;
begin
  if me is null then raise exception 'Not signed in'; end if;
  perform public.seed_profile(me);
  update public.profiles p
     set name = left(coalesce(nullif(trim(p_name), ''), p.name), 60),
         email = coalesce((select u.email from auth.users u where u.id = me), p.email),
         updated_at = now()
   where p.id = me
  returning * into result;
  return result;
end;
$$;

-- send a friend request by email or invite code (or accept theirs if they already asked)
create or replace function public.connect_with(p_email text default null, p_code text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  them uuid;
  them_name text;
  c public.connections;
begin
  if me is null then raise exception 'Not signed in'; end if;
  perform public.seed_profile(me);
  if coalesce(trim(p_code), '') <> '' then
    select p.id into them from public.profiles p where p.invite_code = lower(trim(p_code));
  elsif coalesce(trim(p_email), '') <> '' then
    select u.id into them from auth.users u where lower(u.email) = lower(trim(p_email));
  end if;
  if them is null then return jsonb_build_object('status', 'not_found'); end if;
  if them = me then return jsonb_build_object('status', 'self'); end if;
  perform public.seed_profile(them);
  select p.name into them_name from public.profiles p where p.id = them;

  select * into c from public.connections x
   where (x.requester = me and x.addressee = them) or (x.requester = them and x.addressee = me);
  if found then
    if c.status = 'accepted' then
      return jsonb_build_object('status', 'already', 'id', them, 'name', them_name);
    end if;
    if c.addressee = me then
      update public.connections set status = 'accepted' where id = c.id;
      return jsonb_build_object('status', 'accepted', 'id', them, 'name', them_name);
    end if;
    return jsonb_build_object('status', 'pending', 'id', them, 'name', them_name);
  end if;
  insert into public.connections (requester, addressee) values (me, them);
  return jsonb_build_object('status', 'sent', 'id', them, 'name', them_name);
end;
$$;

create or replace function public.accept_connection(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.connections set status = 'accepted'
   where id = p_id and addressee = auth.uid() and status = 'pending';
  if not found then raise exception 'That friend request is no longer open'; end if;
end;
$$;

-- pay a friend, or pay one of their requests (then the amount and person come from the request)
create or replace function public.send_to_friend(p_to uuid, p_amount numeric, p_note text default '', p_request uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  r public.money_requests;
  target uuid := p_to;
  amt numeric(12, 2) := round(p_amount, 2);
  memo text := left(coalesce(trim(p_note), ''), 140);
  tid uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if p_request is not null then
    select * into r from public.money_requests where id = p_request for update;
    if not found or r.payer <> me or r.status <> 'pending' then
      raise exception 'That request is no longer open';
    end if;
    target := r.requester;
    amt := r.amount;
    if memo = '' then memo := r.note; end if;
  end if;
  if not public.are_friends(me, target) then raise exception 'You can only pay friends'; end if;
  if amt is null or amt <= 0 or amt > 10000 then raise exception 'Amount must be between 0.01 and 10,000'; end if;

  insert into public.transfers (sender, recipient, amount, note, request_id)
  values (me, target, amt, memo, p_request) returning id into tid;
  if p_request is not null then
    update public.money_requests set status = 'paid', settled_at = now() where id = p_request;
  end if;
  insert into public.messages (sender, recipient, kind, body, ref) values (me, target, 'payment', memo, tid);
  return tid;
end;
$$;

create or replace function public.request_from_friend(p_from uuid, p_amount numeric, p_note text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  amt numeric(12, 2) := round(p_amount, 2);
  memo text := left(coalesce(trim(p_note), ''), 140);
  rid uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if not public.are_friends(me, p_from) then raise exception 'You can only ask friends'; end if;
  if amt is null or amt <= 0 or amt > 10000 then raise exception 'Amount must be between 0.01 and 10,000'; end if;
  insert into public.money_requests (requester, payer, amount, note) values (me, p_from, amt, memo) returning id into rid;
  insert into public.messages (sender, recipient, kind, body, ref) values (me, p_from, 'request', memo, rid);
  return rid;
end;
$$;

-- the payer declines, or the requester cancels
create or replace function public.respond_request(p_id uuid, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_action = 'decline' then
    update public.money_requests set status = 'declined', settled_at = now()
     where id = p_id and payer = auth.uid() and status = 'pending';
  elsif p_action = 'cancel' then
    update public.money_requests set status = 'cancelled', settled_at = now()
     where id = p_id and requester = auth.uid() and status = 'pending';
  else
    raise exception 'Unknown action';
  end if;
  if not found then raise exception 'That request is no longer open'; end if;
end;
$$;

-- split a bill I paid: p_shares = [{"friend": "<uuid>", "amount": 12.5}, ...]
create or replace function public.create_split(p_title text, p_total numeric, p_shares jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  sid uuid;
  rid uuid;
  s jsonb;
  friend uuid;
  amt numeric(12, 2);
  title text := left(coalesce(trim(p_title), ''), 80);
begin
  if me is null then raise exception 'Not signed in'; end if;
  if title = '' then raise exception 'Give the bill a name'; end if;
  if jsonb_typeof(p_shares) <> 'array' or jsonb_array_length(p_shares) not between 1 and 20 then
    raise exception 'Pick between 1 and 20 friends';
  end if;
  if (select coalesce(sum((x ->> 'amount')::numeric), 0) from jsonb_array_elements(p_shares) x) > round(p_total, 2) then
    raise exception 'The shares add up to more than the bill';
  end if;
  insert into public.splits (created_by, title, total) values (me, title, round(p_total, 2)) returning id into sid;
  for s in select * from jsonb_array_elements(p_shares) loop
    friend := (s ->> 'friend')::uuid;
    amt := round((s ->> 'amount')::numeric, 2);
    if not public.are_friends(me, friend) then raise exception 'You can only split with friends'; end if;
    if amt <= 0 or amt > 10000 then raise exception 'Each share must be between 0.01 and 10,000'; end if;
    insert into public.money_requests (requester, payer, amount, note, split_id)
    values (me, friend, amt, title, sid) returning id into rid;
    insert into public.messages (sender, recipient, kind, body, ref) values (me, friend, 'split', title, rid);
  end loop;
  return sid;
end;
$$;

create or replace function public.mark_read(p_friend uuid)
returns void language sql security definer set search_path = '' as $$
  update public.messages set read_at = now()
   where recipient = auth.uid() and sender = p_friend and read_at is null
$$;

revoke all on function public.ensure_profile(text) from public, anon;
revoke all on function public.connect_with(text, text) from public, anon;
revoke all on function public.accept_connection(uuid) from public, anon;
revoke all on function public.send_to_friend(uuid, numeric, text, uuid) from public, anon;
revoke all on function public.request_from_friend(uuid, numeric, text) from public, anon;
revoke all on function public.respond_request(uuid, text) from public, anon;
revoke all on function public.create_split(text, numeric, jsonb) from public, anon;
revoke all on function public.mark_read(uuid) from public, anon;
grant execute on function public.ensure_profile(text) to authenticated;
grant execute on function public.connect_with(text, text) to authenticated;
grant execute on function public.accept_connection(uuid) to authenticated;
grant execute on function public.send_to_friend(uuid, numeric, text, uuid) to authenticated;
grant execute on function public.request_from_friend(uuid, numeric, text) to authenticated;
grant execute on function public.respond_request(uuid, text) to authenticated;
grant execute on function public.create_split(text, numeric, jsonb) to authenticated;
grant execute on function public.mark_read(uuid) to authenticated;

-- live updates: new messages, requests and payments arrive without a refresh
do $$
declare t text;
begin
  foreach t in array array['connections', 'messages', 'money_requests', 'transfers'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ==================================================================
-- Chat media: photos, videos, files and voice notes.
-- A private bucket; files sit in <sender id>/<recipient id>/<file>.
-- Only friends can upload into their own folder for a friend, only the
-- two people in a chat can open its files, and the sender can delete them.
-- ==================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 10485760,
        array['image/*', 'video/*', 'audio/*', 'application/pdf', 'text/plain'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "chat media: upload to a friend" on storage.objects;
create policy "chat media: upload to a friend" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
    and public.are_friends(auth.uid(), ((storage.foldername(name))[2])::uuid)
  );

drop policy if exists "chat media: the two people can open it" on storage.objects;
create policy "chat media: the two people can open it" on storage.objects
  for select to authenticated using (
    bucket_id = 'chat-media'
    and auth.uid()::text in ((storage.foldername(name))[1], (storage.foldername(name))[2])
  );

drop policy if exists "chat media: the sender can delete it" on storage.objects;
create policy "chat media: the sender can delete it" on storage.objects
  for delete to authenticated using (
    bucket_id = 'chat-media' and (storage.foldername(name))[1] = auth.uid()::text
  );
