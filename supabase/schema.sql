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
-- the profile photo friends see (a public link in the avatars bucket, see the end)
alter table public.profiles add column if not exists avatar_url text;

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
-- group chats: up to 25 people, added from the creator's friends
create table if not exists public.groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 60),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.group_members (
  group_id     uuid not null references public.groups (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'member' check (role in ('admin', 'member')),
  joined_at    timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user on public.group_members (user_id);

-- a message goes to one person (recipient) or to a group (group_id), never both
alter table public.messages add column if not exists group_id uuid references public.groups (id) on delete cascade;
alter table public.messages alter column recipient drop not null;
alter table public.messages drop constraint if exists messages_one_target;
alter table public.messages add constraint messages_one_target check ((recipient is null) <> (group_id is null));
create index if not exists messages_group on public.messages (group_id, created_at desc);
-- a bill split inside a group
alter table public.splits add column if not exists group_id uuid references public.groups (id) on delete set null;

-- photos, videos, files and voice notes: the file lives in the chat-media bucket (see the end)
alter table public.messages add column if not exists media jsonb;
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'payment', 'request', 'split', 'media', 'system'));
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

create or replace function public.is_member(g uuid, u uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members m where m.group_id = g and m.user_id = u)
$$;

create or replace function public.is_admin(g uuid, u uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members m where m.group_id = g and m.user_id = u and m.role = 'admin')
$$;

-- two people in at least one group together
create or replace function public.share_group(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members x join public.group_members y on y.group_id = x.group_id
    where x.user_id = a and y.user_id = b
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
alter table public.groups enable row level security;
alter table public.group_members enable row level security;

drop policy if exists "see self and linked people" on public.profiles;
create policy "see self and linked people" on public.profiles
  for select using (id = auth.uid() or public.are_linked(auth.uid(), id) or public.share_group(auth.uid(), id));

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
    or (group_id is not null and public.is_member(group_id, auth.uid()))
  );

drop policy if exists "see my groups" on public.groups;
create policy "see my groups" on public.groups
  for select using (public.is_member(id, auth.uid()));

drop policy if exists "see my groups' members" on public.group_members;
create policy "see my groups' members" on public.group_members
  for select using (public.is_member(group_id, auth.uid()));

drop policy if exists "see own requests" on public.money_requests;
create policy "see own requests" on public.money_requests
  for select using (auth.uid() in (requester, payer));

drop policy if exists "see own transfers" on public.transfers;
create policy "see own transfers" on public.transfers
  for select using (auth.uid() in (sender, recipient));

drop policy if exists "see own messages" on public.messages;
create policy "see own messages" on public.messages
  for select using (
    auth.uid() in (sender, recipient)
    or (group_id is not null and public.is_member(group_id, auth.uid()))
  );
drop policy if exists "chat with friends" on public.messages;
create policy "chat with friends" on public.messages
  for insert with check (
    sender = auth.uid()
    and (
      -- to a friend
      (group_id is null and public.are_friends(sender, recipient)
        and ((kind = 'text' and media is null and char_length(body) between 1 and 2000)
          -- a media message must point at a file in this pair's own folder
          or (kind = 'media' and jsonb_typeof(media) = 'object'
              and (media ->> 'path') like auth.uid()::text || '/' || recipient::text || '/%')))
      -- to a group I'm in
      or (group_id is not null and recipient is null and public.is_member(group_id, auth.uid())
        and ((kind = 'text' and media is null and char_length(body) between 1 and 2000)
          or (kind = 'media' and jsonb_typeof(media) = 'object'
              and (media ->> 'path') like auth.uid()::text || '/g-' || group_id::text || '/%')))
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
         avatar_url = (select nullif(u.raw_user_meta_data ->> 'avatar_url', '') from auth.users u where u.id = me),
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
    if public.is_group_share(p_request) then
      raise exception 'Group shares are confirmed by the person who paid: mark yours as paid instead';
    end if;
    target := r.requester;
    amt := r.amount;
    if memo = '' then memo := r.note; end if;
  end if;
  if not public.are_friends(me, target)
     and not exists (
       select 1 from public.splits sp
       where sp.id = r.split_id and sp.group_id is not null
         and public.is_member(sp.group_id, me) and public.is_member(sp.group_id, target)
     ) then
    raise exception 'You can only pay friends';
  end if;
  if amt is null or amt <= 0 or amt > 10000 then raise exception 'Amount must be between 0.01 and 10,000'; end if;

  insert into public.transfers (sender, recipient, amount, note, request_id)
  values (me, target, amt, memo, p_request) returning id into tid;
  if p_request is not null then
    update public.money_requests set status = 'paid', settled_at = now() where id = p_request;
  end if;
  -- a group split's payment shows in the group; anything else in the pair's chat
  if r.split_id is not null and exists (select 1 from public.splits sp where sp.id = r.split_id and sp.group_id is not null) then
    insert into public.messages (sender, group_id, kind, body, ref)
    select me, sp.group_id, 'payment', memo, tid from public.splits sp where sp.id = r.split_id;
  else
    insert into public.messages (sender, recipient, kind, body, ref) values (me, target, 'payment', memo, tid);
  end if;
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
     where id = p_id and requester = auth.uid() and status in ('pending', 'claimed');
  else
    raise exception 'Unknown action';
  end if;
  if not found then raise exception 'That request is no longer open'; end if;
end;
$$;

-- split a bill I paid: p_shares = [{"friend": "<uuid>", "amount": 12.5}, ...]
-- with p_group, the people are members of that group (they needn't be my friends)
-- and one split message goes to the group instead of one to each person
drop function if exists public.create_split(text, numeric, jsonb);
create or replace function public.create_split(p_title text, p_total numeric, p_shares jsonb, p_group uuid default null)
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
  if jsonb_typeof(p_shares) <> 'array' or jsonb_array_length(p_shares) not between 1 and 24 then
    raise exception 'Pick between 1 and 24 people';
  end if;
  if p_group is not null and not public.is_member(p_group, me) then raise exception 'You can only split with friends'; end if;
  if (select coalesce(sum((x ->> 'amount')::numeric), 0) from jsonb_array_elements(p_shares) x) > round(p_total, 2) then
    raise exception 'The shares add up to more than the bill';
  end if;
  insert into public.splits (created_by, title, total, group_id) values (me, title, round(p_total, 2), p_group) returning id into sid;
  for s in select * from jsonb_array_elements(p_shares) loop
    friend := (s ->> 'friend')::uuid;
    amt := round((s ->> 'amount')::numeric, 2);
    if friend = me then raise exception 'Your own share isn''t a request'; end if;
    if p_group is null and not public.are_friends(me, friend) then raise exception 'You can only split with friends'; end if;
    if p_group is not null and not public.is_member(p_group, friend) then raise exception 'You can only split with friends'; end if;
    if amt <= 0 or amt > 10000 then raise exception 'Each share must be between 0.01 and 10,000'; end if;
    insert into public.money_requests (requester, payer, amount, note, split_id)
    values (me, friend, amt, title, sid) returning id into rid;
    if p_group is null then
      insert into public.messages (sender, recipient, kind, body, ref) values (me, friend, 'split', title, rid);
    end if;
  end loop;
  if p_group is not null then
    insert into public.messages (sender, group_id, kind, body, ref) values (me, p_group, 'split', title, sid);
  end if;
  return sid;
end;
$$;

-- ---------------- groups ----------------
-- system messages say what happened: created, added:<id>, removed:<id>, left, renamed:<name>

-- start a group with some of my friends (up to 24, so 25 with me); I'm its admin
create or replace function public.create_group(p_name text, p_members uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  gid uuid;
  people uuid[];
  m uuid;
  title text := left(coalesce(trim(p_name), ''), 60);
begin
  if me is null then raise exception 'Not signed in'; end if;
  if title = '' then raise exception 'Give the group a name'; end if;
  people := array(select distinct x from unnest(coalesce(p_members, '{}')) x where x is not null and x <> me);
  if cardinality(people) < 1 then raise exception 'Pick at least one friend'; end if;
  if cardinality(people) > 24 then raise exception 'A group can have up to 25 people'; end if;
  foreach m in array people loop
    if not public.are_friends(me, m) then raise exception 'You can only add friends'; end if;
  end loop;
  insert into public.groups (name, created_by) values (title, me) returning id into gid;
  insert into public.group_members (group_id, user_id, role) values (gid, me, 'admin');
  insert into public.group_members (group_id, user_id) select gid, x from unnest(people) x;
  insert into public.messages (sender, group_id, kind, body) values (me, gid, 'system', 'created');
  return gid;
end;
$$;

-- an admin adds more of their friends, up to 25 in the group
create or replace function public.add_group_members(p_group uuid, p_members uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  people uuid[];
  m uuid;
begin
  if not public.is_admin(p_group, me) then raise exception 'Only group admins can do that'; end if;
  people := array(
    select distinct x from unnest(coalesce(p_members, '{}')) x
    where x is not null and not public.is_member(p_group, x)
  );
  if cardinality(people) = 0 then return; end if;
  if (select count(*) from public.group_members where group_id = p_group) + cardinality(people) > 25 then
    raise exception 'A group can have up to 25 people';
  end if;
  foreach m in array people loop
    if not public.are_friends(me, m) then raise exception 'You can only add friends'; end if;
    insert into public.group_members (group_id, user_id) values (p_group, m);
    insert into public.messages (sender, group_id, kind, body) values (me, p_group, 'system', 'added:' || m::text);
  end loop;
end;
$$;

create or replace function public.remove_group_member(p_group uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if not public.is_admin(p_group, me) then raise exception 'Only group admins can do that'; end if;
  if p_user = me then raise exception 'Use leave instead'; end if;
  delete from public.group_members where group_id = p_group and user_id = p_user;
  if not found then raise exception 'They aren''t in this group'; end if;
  insert into public.messages (sender, group_id, kind, body) values (me, p_group, 'system', 'removed:' || p_user::text);
end;
$$;

-- leave; the last one out closes the group, and if no admin is left the longest member becomes one
create or replace function public.leave_group(p_group uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  delete from public.group_members where group_id = p_group and user_id = me;
  if not found then raise exception 'You aren''t in this group'; end if;
  if not exists (select 1 from public.group_members where group_id = p_group) then
    delete from public.groups where id = p_group;
    return;
  end if;
  if not exists (select 1 from public.group_members where group_id = p_group and role = 'admin') then
    update public.group_members set role = 'admin'
     where group_id = p_group
       and user_id = (select user_id from public.group_members where group_id = p_group order by joined_at limit 1);
  end if;
  insert into public.messages (sender, group_id, kind, body) values (me, p_group, 'system', 'left');
end;
$$;

create or replace function public.rename_group(p_group uuid, p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  title text := left(coalesce(trim(p_name), ''), 60);
begin
  if not public.is_admin(p_group, me) then raise exception 'Only group admins can do that'; end if;
  if title = '' then raise exception 'Give the group a name'; end if;
  update public.groups set name = title where id = p_group;
  insert into public.messages (sender, group_id, kind, body) values (me, p_group, 'system', 'renamed:' || title);
end;
$$;

create or replace function public.mark_group_read(p_group uuid)
returns void language sql security definer set search_path = '' as $$
  update public.group_members set last_read_at = now() where group_id = p_group and user_id = auth.uid()
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
revoke all on function public.create_split(text, numeric, jsonb, uuid) from public, anon;
revoke all on function public.create_group(text, uuid[]) from public, anon;
revoke all on function public.add_group_members(uuid, uuid[]) from public, anon;
revoke all on function public.remove_group_member(uuid, uuid) from public, anon;
revoke all on function public.leave_group(uuid) from public, anon;
revoke all on function public.rename_group(uuid, text) from public, anon;
revoke all on function public.mark_group_read(uuid) from public, anon;
revoke all on function public.mark_read(uuid) from public, anon;
grant execute on function public.ensure_profile(text) to authenticated;
grant execute on function public.connect_with(text, text) to authenticated;
grant execute on function public.accept_connection(uuid) to authenticated;
grant execute on function public.send_to_friend(uuid, numeric, text, uuid) to authenticated;
grant execute on function public.request_from_friend(uuid, numeric, text) to authenticated;
grant execute on function public.respond_request(uuid, text) to authenticated;
grant execute on function public.create_split(text, numeric, jsonb, uuid) to authenticated;
grant execute on function public.create_group(text, uuid[]) to authenticated;
grant execute on function public.add_group_members(uuid, uuid[]) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.rename_group(uuid, text) to authenticated;
grant execute on function public.mark_group_read(uuid) to authenticated;
grant execute on function public.mark_read(uuid) to authenticated;

-- live updates: new messages, requests and payments arrive without a refresh
do $$
declare t text;
begin
  foreach t in array array['connections', 'messages', 'money_requests', 'transfers', 'groups', 'group_members'] loop
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
-- Group files sit in <sender id>/g-<group id>/<file>.
-- Only friends (or group members) can upload into their own folder, only the
-- people in a chat can open its files, and the sender can delete them.
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
    and (
      ((storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
        and public.are_friends(auth.uid(), ((storage.foldername(name))[2])::uuid))
      or ((storage.foldername(name))[2] ~ '^g-[0-9a-f-]{36}$'
        and public.is_member(substr((storage.foldername(name))[2], 3)::uuid, auth.uid()))
    )
  );

drop policy if exists "chat media: the two people can open it" on storage.objects;
create policy "chat media: the two people can open it" on storage.objects
  for select to authenticated using (
    bucket_id = 'chat-media'
    and (
      auth.uid()::text in ((storage.foldername(name))[1], (storage.foldername(name))[2])
      or ((storage.foldername(name))[2] ~ '^g-[0-9a-f-]{36}$'
        and public.is_member(substr((storage.foldername(name))[2], 3)::uuid, auth.uid()))
    )
  );

drop policy if exists "chat media: the sender can delete it" on storage.objects;
create policy "chat media: the sender can delete it" on storage.objects
  for delete to authenticated using (
    bucket_id = 'chat-media' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ==================================================================
-- Profile photos: a public bucket, one folder per user.
-- Anyone with the link can see a photo (so friends' lists can show it);
-- only you can add, change or delete the photos in your own folder.
-- ==================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars: add your own" on storage.objects;
create policy "avatars: add your own" on storage.objects
  for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: change your own" on storage.objects;
create policy "avatars: change your own" on storage.objects
  for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: delete your own" on storage.objects;
create policy "avatars: delete your own" on storage.objects
  for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: list your own" on storage.objects;
create policy "avatars: list your own" on storage.objects
  for select to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ==================================================================
-- Settle up: a group's open debts as the fewest payments.
-- group_debts: every open request inside a group (between two current members),
--   for the group's members to see (each person otherwise sees only their own).
-- simplify_group_debts: cancels those requests and asks for the same money in
--   as few payments as possible. Everyone's net position stays exactly the same:
--   the person owed most is paid by the person who owes most, until all are square.
--   The new requests belong to a "Settle up" split in the group, so they're paid
--   in the group like any split. Any member can run it.
-- ==================================================================
create or replace function public.group_debts(p_group uuid)
returns table (id uuid, requester uuid, payer uuid, amount numeric, note text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.requester, r.payer, r.amount, r.note, r.created_at
    from public.money_requests r
    join public.splits s on s.id = r.split_id
   where s.group_id = p_group
     and r.status = 'pending'
     and public.is_member(p_group, auth.uid())
     and public.is_member(p_group, r.requester)
     and public.is_member(p_group, r.payer)
   order by r.created_at
$$;

create or replace function public.simplify_group_debts(p_group uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  open_ids uuid[];
  ids uuid[];
  bal bigint[];
  before integer;
  made integer := 0;
  owed_total bigint;
  sid uuid;
  i integer;
  j integer;
  k integer;
  c bigint;
  part bigint;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if not public.is_member(p_group, me) then raise exception 'You''re not in this group'; end if;

  -- the open requests, locked so two people can't simplify at the same moment
  select array_agg(r.id order by r.created_at) into open_ids
    from public.money_requests r
    join public.splits s on s.id = r.split_id
   where s.group_id = p_group and r.status = 'pending'
     and public.is_member(p_group, r.requester) and public.is_member(p_group, r.payer)
     and r.requester <> r.payer
     for update of r;
  before := coalesce(array_length(open_ids, 1), 0);
  if before = 0 then return 0; end if;

  -- everyone's net position in cents (positive: they're owed)
  select array_agg(person order by person), array_agg(net order by person) into ids, bal
    from (
      select person, sum(cents) as net from (
        select r.requester as person, round(r.amount * 100)::bigint as cents from public.money_requests r where r.id = any (open_ids)
        union all
        select r.payer, -round(r.amount * 100)::bigint from public.money_requests r where r.id = any (open_ids)
      ) x group by person
    ) y
   where net <> 0;

  update public.money_requests set status = 'cancelled', settled_at = now() where id = any (open_ids);

  select coalesce(sum(b), 0) into owed_total from unnest(bal) b where b > 0;
  if owed_total > 0 then
    if owed_total > 10000000 then raise exception 'That’s too much to settle at once'; end if;
    insert into public.splits (created_by, title, total, group_id) values (me, 'Settle up', owed_total / 100.0, p_group) returning id into sid;
    loop
      -- the person owed most, and the person who owes most (ties by id, like the app's preview)
      i := null;
      j := null;
      for k in 1 .. coalesce(array_length(ids, 1), 0) loop
        if bal[k] > 0 and (i is null or bal[k] > bal[i] or (bal[k] = bal[i] and ids[k] < ids[i])) then i := k; end if;
        if bal[k] < 0 and (j is null or bal[k] < bal[j] or (bal[k] = bal[j] and ids[k] < ids[j])) then j := k; end if;
      end loop;
      exit when i is null or j is null;
      c := least(bal[i], -bal[j]);
      bal[i] := bal[i] - c;
      bal[j] := bal[j] + c;
      -- one request can be at most 10,000
      while c > 0 loop
        part := least(c, 1000000);
        insert into public.money_requests (requester, payer, amount, note, split_id) values (ids[i], ids[j], part / 100.0, 'Settle up', sid);
        made := made + 1;
        c := c - part;
      end loop;
    end loop;
  end if;

  insert into public.messages (sender, group_id, kind, body) values (me, p_group, 'system', 'simplified:' || before || ':' || made);
  if sid is not null then
    insert into public.messages (sender, group_id, kind, body, ref) values (me, p_group, 'split', 'Settle up', sid);
  end if;
  return made;
end;
$$;

revoke all on function public.group_debts(uuid) from public, anon;
revoke all on function public.simplify_group_debts(uuid) from public, anon;
grant execute on function public.group_debts(uuid) to authenticated;
grant execute on function public.simplify_group_debts(uuid) to authenticated;

-- ==================================================================
-- Shared goals: a group saves towards something together ("Goa trip, $2,000").
-- Members see the goal and who put in what; changes only go through the
-- functions below. Money someone adds comes out of their own balance in the
-- app (recorded as savings); the goal keeps the record for everyone.
-- ==================================================================
create table if not exists public.group_goals (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  target     numeric(12, 2) not null check (target > 0 and target <= 1000000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists group_goals_group on public.group_goals (group_id);
create table if not exists public.group_goal_contributions (
  id         uuid primary key default gen_random_uuid(),
  goal_id    uuid not null references public.group_goals (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  amount     numeric(12, 2) not null check (amount > 0 and amount <= 10000),
  created_at timestamptz not null default now()
);
create index if not exists group_goal_contributions_goal on public.group_goal_contributions (goal_id);

alter table public.group_goals enable row level security;
alter table public.group_goal_contributions enable row level security;
drop policy if exists "members see group goals" on public.group_goals;
create policy "members see group goals" on public.group_goals
  for select using (public.is_member(group_id, auth.uid()));
drop policy if exists "members see contributions" on public.group_goal_contributions;
create policy "members see contributions" on public.group_goal_contributions
  for select using (exists (select 1 from public.group_goals g where g.id = goal_id and public.is_member(g.group_id, auth.uid())));

create or replace function public.create_group_goal(p_group uuid, p_name text, p_target numeric)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  gid uuid;
  title text := left(coalesce(trim(p_name), ''), 60);
begin
  if me is null then raise exception 'Not signed in'; end if;
  if not public.is_member(p_group, me) then raise exception 'You''re not in this group'; end if;
  if title = '' then raise exception 'Give the goal a name'; end if;
  if p_target is null or p_target <= 0 or p_target > 1000000 then raise exception 'The target must be between 0.01 and 1,000,000'; end if;
  insert into public.group_goals (group_id, name, target, created_by) values (p_group, title, round(p_target, 2), me) returning id into gid;
  insert into public.messages (sender, group_id, kind, body) values (me, p_group, 'system', 'goalnew:' || title);
  return gid;
end;
$$;

create or replace function public.add_to_group_goal(p_goal uuid, p_amount numeric)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  g public.group_goals;
  cid uuid;
  amt numeric(12, 2) := round(p_amount, 2);
begin
  if me is null then raise exception 'Not signed in'; end if;
  select * into g from public.group_goals where id = p_goal;
  if not found or not public.is_member(g.group_id, me) then raise exception 'That goal isn''t available'; end if;
  if amt is null or amt <= 0 or amt > 10000 then raise exception 'Amount must be between 0.01 and 10,000'; end if;
  insert into public.group_goal_contributions (goal_id, user_id, amount) values (p_goal, me, amt) returning id into cid;
  insert into public.messages (sender, group_id, kind, body) values (me, g.group_id, 'system', 'goaladd:' || amt || '|' || g.name);
  return cid;
end;
$$;

-- the person who started it, or a group admin, can remove a goal
create or replace function public.delete_group_goal(p_goal uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  g public.group_goals;
begin
  select * into g from public.group_goals where id = p_goal;
  if not found then raise exception 'That goal isn''t available'; end if;
  if not (g.created_by = me or public.is_admin(g.group_id, me)) then raise exception 'Only the person who started it or an admin can remove it'; end if;
  delete from public.group_goals where id = p_goal;
  insert into public.messages (sender, group_id, kind, body) values (me, g.group_id, 'system', 'goaldel:' || g.name);
end;
$$;

revoke all on function public.create_group_goal(uuid, text, numeric) from public, anon;
revoke all on function public.add_to_group_goal(uuid, numeric) from public, anon;
revoke all on function public.delete_group_goal(uuid) from public, anon;
grant execute on function public.create_group_goal(uuid, text, numeric) to authenticated;
grant execute on function public.add_to_group_goal(uuid, numeric) to authenticated;
grant execute on function public.delete_group_goal(uuid) to authenticated;

-- ==================================================================
-- Push notifications: each device that turned them on keeps one row here
-- (the browser's push address and keys). Only its owner can see or change
-- it; the push Edge Function reads them with the service key to send.
-- ==================================================================
create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- while the app is open and on screen, each device says so every 30 seconds (seen_at);
-- the push function skips anyone seen in the last minute, since the app shows its own alerts
alter table public.push_subscriptions add column if not exists seen_at timestamptz;

-- ==================================================================
-- Group shares are confirmed by the person who paid the bill.
-- In a group split (or a group settle-up), paying your share doesn't settle
-- it by itself: you claim it ("I paid", in the app or another way), and only
-- the person you owe can confirm it (then it's paid; for an in-app payment
-- the money moves at that moment) or say it hasn't arrived (back to pending).
-- ==================================================================
alter table public.money_requests add column if not exists claim_method text check (claim_method in ('app', 'other'));
alter table public.money_requests add column if not exists claimed_at timestamptz;
alter table public.money_requests drop constraint if exists money_requests_status_check;
alter table public.money_requests add constraint money_requests_status_check
  check (status in ('pending', 'claimed', 'paid', 'declined', 'cancelled'));

-- a group share can't be paid straight through send_to_friend any more: it goes through a claim
create or replace function public.is_group_share(p_request uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.money_requests r join public.splits s on s.id = r.split_id
     where r.id = p_request and s.group_id is not null
  )
$$;

-- the payer: "I've paid my share" (p_method 'app': the money moves when it's confirmed; 'other': cash, bank, ...)
create or replace function public.claim_request(p_id uuid, p_method text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  r public.money_requests;
  gid uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if p_method not in ('app', 'other') then raise exception 'Unknown payment method'; end if;
  select * into r from public.money_requests where id = p_id for update;
  if not found or r.payer <> me or r.status <> 'pending' then raise exception 'That request is no longer open'; end if;
  select s.group_id into gid from public.splits s where s.id = r.split_id;
  if gid is null then raise exception 'Only group shares are confirmed this way'; end if;
  update public.money_requests set status = 'claimed', claim_method = p_method, claimed_at = now() where id = p_id;
  insert into public.messages (sender, group_id, kind, body)
  values (me, gid, 'system', 'claimed:' || r.amount || '|' || r.requester || '|' || p_method);
end;
$$;

-- the person who's owed: confirm it arrived (p_ok true), or say it didn't (back to pending)
create or replace function public.confirm_request(p_id uuid, p_ok boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  r public.money_requests;
  gid uuid;
  tid uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select * into r from public.money_requests where id = p_id for update;
  if not found or r.requester <> me or r.status <> 'claimed' then raise exception 'That payment isn''t waiting for you'; end if;
  select s.group_id into gid from public.splits s where s.id = r.split_id;
  if p_ok then
    if r.claim_method = 'app' then
      insert into public.transfers (sender, recipient, amount, note, request_id)
      values (r.payer, r.requester, r.amount, r.note, r.id) returning id into tid;
      insert into public.messages (sender, group_id, kind, body, ref) values (r.payer, gid, 'payment', r.note, tid);
    end if;
    update public.money_requests set status = 'paid', settled_at = now() where id = p_id;
    insert into public.messages (sender, group_id, kind, body)
    values (me, gid, 'system', 'confirmed:' || r.amount || '|' || r.payer || '|' || coalesce(r.claim_method, 'other'));
  else
    update public.money_requests set status = 'pending', claim_method = null, claimed_at = null where id = p_id;
    insert into public.messages (sender, group_id, kind, body)
    values (me, gid, 'system', 'notreceived:' || r.amount || '|' || r.payer);
  end if;
end;
$$;

revoke all on function public.is_group_share(uuid) from public, anon;
revoke all on function public.claim_request(uuid, text) from public, anon;
revoke all on function public.confirm_request(uuid, boolean) from public, anon;
grant execute on function public.is_group_share(uuid) to authenticated;
grant execute on function public.claim_request(uuid, text) to authenticated;
grant execute on function public.confirm_request(uuid, boolean) to authenticated;

-- ==================================================================
-- Security: two-step login and the devices you're signed in on.
-- Once someone turns on two-step login (an authenticator app), their
-- saved data can only be read or changed by a session that entered a
-- code (aal2). my_sessions lists their signed-in sessions; end_session
-- signs one of them out (its refresh token stops working).
-- ==================================================================
create or replace function public.mfa_ok()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
$$;

drop policy if exists "two-step login when on" on public.user_state;
create policy "two-step login when on" on public.user_state as restrictive
  for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());

create or replace function public.my_sessions()
returns table (id uuid, created_at timestamptz, last_used timestamptz, user_agent text, ip text, aal text, current boolean)
language sql stable security definer set search_path = '' as $$
  select s.id, s.created_at,
         greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'utc'),
         s.user_agent, host(s.ip), s.aal::text,
         s.id::text = (auth.jwt() ->> 'session_id')
    from auth.sessions s
   where s.user_id = auth.uid() and (s.not_after is null or s.not_after > now())
   order by 3 desc nulls last
$$;

create or replace function public.end_session(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  delete from auth.sessions where id = p_id and user_id = auth.uid();
  if not found then raise exception 'That session has already ended'; end if;
end;
$$;

revoke all on function public.mfa_ok() from public, anon;
revoke all on function public.my_sessions() from public, anon;
revoke all on function public.end_session(uuid) from public, anon;
grant execute on function public.mfa_ok() to authenticated;
grant execute on function public.my_sessions() to authenticated;
grant execute on function public.end_session(uuid) to authenticated;

-- ==================================================================
-- Receipt photos on transactions: a private bucket, one folder per person.
-- ==================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['image/*', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "receipts: add your own" on storage.objects;
create policy "receipts: add your own" on storage.objects
  for insert to authenticated with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "receipts: open your own" on storage.objects;
create policy "receipts: open your own" on storage.objects
  for select to authenticated using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "receipts: delete your own" on storage.objects;
create policy "receipts: delete your own" on storage.objects
  for delete to authenticated using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

-- ==================================================================
-- Payment links: ask anyone for money, even without an account. The
-- link (or its QR code) opens a page where they pay by card with
-- Stripe; the payments function checks the payment with Stripe and
-- marks the link paid. Only the owner sees their links.
-- ==================================================================
create table if not exists public.pay_links (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null references auth.users (id) on delete cascade,
  amount       numeric(12, 2) not null check (amount >= 1 and amount <= 10000),
  note         text not null default '' check (char_length(note) <= 140),
  status       text not null default 'open' check (status in ('open', 'paid', 'cancelled')),
  payer_name   text check (char_length(payer_name) <= 60),
  paid_session text unique,
  paid_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists pay_links_owner on public.pay_links (owner, created_at desc);
alter table public.pay_links enable row level security;
drop policy if exists "own pay links" on public.pay_links;
create policy "own pay links" on public.pay_links for select using (owner = auth.uid());

create or replace function public.create_pay_link(p_amount numeric, p_note text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare lid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 10000 then raise exception 'Amount must be between 1 and 10,000'; end if;
  if (select count(*) from public.pay_links where owner = auth.uid() and status = 'open') >= 50 then
    raise exception 'You have 50 open links: cancel some first';
  end if;
  insert into public.pay_links (owner, amount, note) values (auth.uid(), round(p_amount, 2), left(coalesce(trim(p_note), ''), 140)) returning id into lid;
  return lid;
end;
$$;

create or replace function public.cancel_pay_link(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.pay_links set status = 'cancelled' where id = p_id and owner = auth.uid() and status = 'open';
  if not found then raise exception 'That link is no longer open'; end if;
end;
$$;

revoke all on function public.create_pay_link(numeric, text) from public, anon;
revoke all on function public.cancel_pay_link(uuid) from public, anon;
grant execute on function public.create_pay_link(numeric, text) to authenticated;
grant execute on function public.cancel_pay_link(uuid) to authenticated;

-- ==================================================================
-- Group trips: a budget for a trip, by category, with a running total
-- every member sees. A split in the group can belong to a trip (and a
-- category); the trip's total is the sum of its splits.
-- ==================================================================
create table if not exists public.group_trips (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  budget     numeric(12, 2) not null check (budget > 0 and budget <= 1000000),
  categories jsonb not null default '{}'::jsonb,
  starts     date,
  ends       date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists group_trips_group on public.group_trips (group_id);
alter table public.group_trips enable row level security;
drop policy if exists "members see trips" on public.group_trips;
create policy "members see trips" on public.group_trips for select using (public.is_member(group_id, auth.uid()));
alter table public.splits add column if not exists trip_id uuid references public.group_trips (id) on delete set null;
alter table public.splits add column if not exists category text check (char_length(category) <= 40);

create or replace function public.create_trip(p_group uuid, p_name text, p_budget numeric, p_categories jsonb default '{}'::jsonb, p_starts date default null, p_ends date default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  tid uuid;
  title text := left(coalesce(trim(p_name), ''), 60);
begin
  if me is null or not public.is_member(p_group, me) then raise exception 'You''re not in this group'; end if;
  if title = '' then raise exception 'Give the trip a name'; end if;
  if p_budget is null or p_budget <= 0 or p_budget > 1000000 then raise exception 'The budget must be between 0.01 and 1,000,000'; end if;
  if jsonb_typeof(coalesce(p_categories, '{}'::jsonb)) <> 'object' then raise exception 'Categories must be an object'; end if;
  insert into public.group_trips (group_id, name, budget, categories, starts, ends, created_by)
  values (p_group, title, round(p_budget, 2), coalesce(p_categories, '{}'::jsonb), p_starts, p_ends, me) returning id into tid;
  insert into public.messages (sender, group_id, kind, body) values (me, p_group, 'system', 'tripnew:' || title);
  return tid;
end;
$$;

create or replace function public.delete_trip(p_trip uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare tr public.group_trips;
begin
  select * into tr from public.group_trips where id = p_trip;
  if not found then raise exception 'That trip isn''t available'; end if;
  if not (tr.created_by = auth.uid() or public.is_admin(tr.group_id, auth.uid())) then raise exception 'Only the person who started it or an admin can remove it'; end if;
  delete from public.group_trips where id = p_trip;
end;
$$;

-- the person who split a bill puts it in a trip (and a category)
create or replace function public.tag_split(p_split uuid, p_trip uuid, p_category text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare sp public.splits;
begin
  select * into sp from public.splits where id = p_split;
  if not found or sp.created_by <> auth.uid() then raise exception 'That split isn''t yours'; end if;
  if p_trip is not null and not exists (select 1 from public.group_trips tr where tr.id = p_trip and tr.group_id = sp.group_id) then
    raise exception 'That trip isn''t in this group';
  end if;
  update public.splits set trip_id = p_trip, category = left(p_category, 40) where id = p_split;
end;
$$;

revoke all on function public.create_trip(uuid, text, numeric, jsonb, date, date) from public, anon;
revoke all on function public.delete_trip(uuid) from public, anon;
revoke all on function public.tag_split(uuid, uuid, text) from public, anon;
grant execute on function public.create_trip(uuid, text, numeric, jsonb, date, date) to authenticated;
grant execute on function public.delete_trip(uuid) to authenticated;
grant execute on function public.tag_split(uuid, uuid, text) to authenticated;

-- ==================================================================
-- Family: a parent links a friend's account as their child (teen or
-- kid). An allowance is paid in on a schedule (the parent's app sends
-- it when it's due), and with approval on, the child's spending goes to
-- the parent first: approved, it's recorded; declined, it isn't.
-- ==================================================================
create table if not exists public.family_links (
  id             uuid primary key default gen_random_uuid(),
  parent         uuid not null references auth.users (id) on delete cascade,
  child          uuid not null unique references auth.users (id) on delete cascade,
  status         text not null default 'pending' check (status in ('pending', 'active')),
  allowance      numeric(12, 2) not null default 0 check (allowance >= 0 and allowance <= 1000),
  every          text not null default 'weekly' check (every in ('weekly', 'monthly')),
  approve        boolean not null default true,
  next_allowance date,
  created_at     timestamptz not null default now(),
  check (parent <> child)
);
create table if not exists public.spend_requests (
  id         uuid primary key default gen_random_uuid(),
  child      uuid not null references auth.users (id) on delete cascade,
  parent     uuid not null references auth.users (id) on delete cascade,
  amount     numeric(12, 2) not null check (amount > 0 and amount <= 10000),
  name       text not null check (char_length(name) between 1 and 80),
  category   text not null default 'Other' check (char_length(category) <= 40),
  status     text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  recorded   boolean not null default false,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists spend_requests_parent on public.spend_requests (parent, created_at desc);
create index if not exists spend_requests_child on public.spend_requests (child, created_at desc);
alter table public.family_links enable row level security;
alter table public.spend_requests enable row level security;
drop policy if exists "see own family" on public.family_links;
create policy "see own family" on public.family_links for select using (auth.uid() in (parent, child));
drop policy if exists "see own spend requests" on public.spend_requests;
create policy "see own spend requests" on public.spend_requests for select using (auth.uid() in (parent, child));

create or replace function public.invite_child(p_child uuid, p_allowance numeric default 0, p_every text default 'weekly', p_approve boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); fid uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if not public.are_friends(me, p_child) then raise exception 'Add them as a friend first'; end if;
  if exists (select 1 from public.family_links where child = p_child) then raise exception 'They''re already linked to a family'; end if;
  if exists (select 1 from public.family_links where child = me) then raise exception 'A child account can''t add children'; end if;
  if p_allowance is null or p_allowance < 0 or p_allowance > 1000 then raise exception 'The allowance must be between 0 and 1,000'; end if;
  insert into public.family_links (parent, child, allowance, every, approve)
  values (me, p_child, round(p_allowance, 2), case when p_every = 'monthly' then 'monthly' else 'weekly' end, coalesce(p_approve, true))
  returning id into fid;
  insert into public.messages (sender, recipient, kind, body) values (me, p_child, 'system', 'familyinvite:');
  return fid;
end;
$$;

create or replace function public.accept_family(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.family_links set status = 'active', next_allowance = current_date
   where id = p_id and child = auth.uid() and status = 'pending';
  if not found then raise exception 'That invite is no longer open'; end if;
end;
$$;

-- either side can end the link
create or replace function public.leave_family(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.family_links where id = p_id and auth.uid() in (parent, child);
  if not found then raise exception 'That link is already gone'; end if;
end;
$$;

create or replace function public.set_family(p_id uuid, p_allowance numeric, p_every text, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_allowance is null or p_allowance < 0 or p_allowance > 1000 then raise exception 'The allowance must be between 0 and 1,000'; end if;
  update public.family_links
     set allowance = round(p_allowance, 2), every = case when p_every = 'monthly' then 'monthly' else 'weekly' end, approve = coalesce(p_approve, true)
   where id = p_id and parent = auth.uid();
  if not found then raise exception 'Only the parent can change this'; end if;
end;
$$;

-- the parent's app calls this when the allowance is due: the money moves like any friend payment
create or replace function public.pay_allowance(p_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare f public.family_links; tid uuid;
begin
  select * into f from public.family_links where id = p_id and parent = auth.uid() and status = 'active' for update;
  if not found then raise exception 'That family link isn''t active'; end if;
  if f.allowance <= 0 or f.next_allowance is null or f.next_allowance > current_date then return null; end if;
  insert into public.transfers (sender, recipient, amount, note) values (f.parent, f.child, f.allowance, 'Allowance') returning id into tid;
  insert into public.messages (sender, recipient, kind, body, ref) values (f.parent, f.child, 'payment', 'Allowance', tid);
  update public.family_links
     set next_allowance = case when f.every = 'monthly' then (f.next_allowance + interval '1 month')::date else f.next_allowance + 7 end
   where id = p_id;
  -- after a long time away the next one is counted from today, not a pile of missed ones
  update public.family_links set next_allowance = current_date + case when every = 'monthly' then 30 else 7 end
   where id = p_id and next_allowance <= current_date;
  return tid;
end;
$$;

create or replace function public.ask_to_spend(p_amount numeric, p_name text, p_category text default 'Other')
returns uuid language plpgsql security definer set search_path = '' as $$
declare f public.family_links; rid uuid; what text := left(coalesce(nullif(trim(p_name), ''), 'Spending'), 80);
begin
  select * into f from public.family_links where child = auth.uid() and status = 'active';
  if not found then raise exception 'No parent account is linked'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 10000 then raise exception 'Amount must be between 0.01 and 10,000'; end if;
  insert into public.spend_requests (child, parent, amount, name, category)
  values (f.child, f.parent, round(p_amount, 2), what, left(coalesce(p_category, 'Other'), 40))
  returning id into rid;
  insert into public.messages (sender, recipient, kind, body) values (f.child, f.parent, 'system', 'spendask:' || round(p_amount, 2) || '|' || what);
  return rid;
end;
$$;

create or replace function public.decide_spend(p_id uuid, p_ok boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.spend_requests;
begin
  update public.spend_requests set status = case when p_ok then 'approved' else 'declined' end, decided_at = now()
   where id = p_id and parent = auth.uid() and status = 'pending'
  returning * into r;
  if not found then raise exception 'That request is no longer open'; end if;
  insert into public.messages (sender, recipient, kind, body)
  values (r.parent, r.child, 'system', case when p_ok then 'spendok:' else 'spendno:' end || r.amount || '|' || r.name);
end;
$$;

-- the child's app recorded an approved one (so it's only added once)
create or replace function public.spend_recorded(p_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.spend_requests set recorded = true where id = p_id and child = auth.uid() and status = 'approved'
$$;

revoke all on function public.invite_child(uuid, numeric, text, boolean) from public, anon;
revoke all on function public.accept_family(uuid) from public, anon;
revoke all on function public.leave_family(uuid) from public, anon;
revoke all on function public.set_family(uuid, numeric, text, boolean) from public, anon;
revoke all on function public.pay_allowance(uuid) from public, anon;
revoke all on function public.ask_to_spend(numeric, text, text) from public, anon;
revoke all on function public.decide_spend(uuid, boolean) from public, anon;
revoke all on function public.spend_recorded(uuid) from public, anon;
grant execute on function public.invite_child(uuid, numeric, text, boolean) to authenticated;
grant execute on function public.accept_family(uuid) to authenticated;
grant execute on function public.leave_family(uuid) to authenticated;
grant execute on function public.set_family(uuid, numeric, text, boolean) to authenticated;
grant execute on function public.pay_allowance(uuid) to authenticated;
grant execute on function public.ask_to_spend(numeric, text, text) to authenticated;
grant execute on function public.decide_spend(uuid, boolean) to authenticated;
grant execute on function public.spend_recorded(uuid) to authenticated;

-- ==================================================================
-- Receipts that arrive by email (forwarded to your own address, or
-- found in Gmail): they wait here as pending expenses until you
-- confirm or dismiss them in the app. The inbound-email and gmail
-- functions add them with the service key; you only see your own.
-- ==================================================================
create table if not exists public.inbox_tokens (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  token      text not null unique default substr(md5(random()::text || clock_timestamp()::text), 1, 12),
  created_at timestamptz not null default now()
);
alter table public.inbox_tokens enable row level security;
drop policy if exists "own inbox token" on public.inbox_tokens;
create policy "own inbox token" on public.inbox_tokens for select using (user_id = auth.uid());

create table if not exists public.pending_expenses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  source     text not null check (source in ('email', 'gmail')),
  ref        text not null,
  merchant   text not null default '' check (char_length(merchant) <= 80),
  amount     numeric(12, 2) check (amount > 0 and amount <= 100000),
  currency   text not null default 'USD',
  spent_on   date,
  subject    text not null default '' check (char_length(subject) <= 200),
  created_at timestamptz not null default now(),
  unique (user_id, ref)
);
alter table public.pending_expenses enable row level security;
drop policy if exists "own pending expenses" on public.pending_expenses;
create policy "own pending expenses" on public.pending_expenses for select using (user_id = auth.uid());
drop policy if exists "dismiss own pending expenses" on public.pending_expenses;
create policy "dismiss own pending expenses" on public.pending_expenses for delete using (user_id = auth.uid());

-- the private part of your receipts address (made the first time; p_reset makes a new one)
create or replace function public.my_inbox_token(p_reset boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare tok text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_reset then delete from public.inbox_tokens where user_id = auth.uid(); end if;
  insert into public.inbox_tokens (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select token into tok from public.inbox_tokens where user_id = auth.uid();
  return tok;
end;
$$;

-- Gmail: the refresh token is only ever read by the gmail function (no policy lets anyone else see it)
create table if not exists public.gmail_links (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  email         text not null default '',
  refresh_token text not null,
  connected_at  timestamptz not null default now(),
  last_scan     timestamptz
);
alter table public.gmail_links enable row level security;

create or replace function public.gmail_status()
returns table (email text, connected_at timestamptz, last_scan timestamptz)
language sql stable security definer set search_path = '' as $$
  select g.email, g.connected_at, g.last_scan from public.gmail_links g where g.user_id = auth.uid()
$$;

revoke all on function public.my_inbox_token(boolean) from public, anon;
revoke all on function public.gmail_status() from public, anon;
grant execute on function public.my_inbox_token(boolean) to authenticated;
grant execute on function public.gmail_status() to authenticated;

-- ==================================================================
-- Monthly statement by email (opt in) and the calendar feed.
-- The statement-email function runs on the 1st of each month (pg_cron)
-- and emails last month's statement to everyone who turned it on.
-- The calendar function serves bills and repeating payments as a feed
-- at a private link.
-- ==================================================================
create table if not exists public.statement_prefs (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  enabled   boolean not null default true,
  last_sent text
);
alter table public.statement_prefs enable row level security;
drop policy if exists "own statement prefs" on public.statement_prefs;
create policy "own statement prefs" on public.statement_prefs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.calendar_tokens (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  token      text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);
alter table public.calendar_tokens enable row level security;
drop policy if exists "own calendar token" on public.calendar_tokens;
create policy "own calendar token" on public.calendar_tokens for select using (user_id = auth.uid());

create or replace function public.my_calendar_token(p_reset boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare tok text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_reset then delete from public.calendar_tokens where user_id = auth.uid(); end if;
  insert into public.calendar_tokens (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select token into tok from public.calendar_tokens where user_id = auth.uid();
  return tok;
end;
$$;
revoke all on function public.my_calendar_token(boolean) from public, anon;
grant execute on function public.my_calendar_token(boolean) to authenticated;

-- live updates for the new tables
do $$
declare t text;
begin
  foreach t in array array['pay_links', 'group_trips', 'family_links', 'spend_requests', 'pending_expenses'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
