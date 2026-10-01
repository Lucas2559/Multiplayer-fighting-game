-- Nexus Canvas chat — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: everything is idempotent.
--
-- Accounts are real: a name is registered once with a password and stays yours.
-- Chats are rooms with a shareable code; `messages.channel` holds that code.
-- Passwords are hashed with bcrypt (pgcrypto) and NEVER leave the database —
-- the browser only ever calls the security-definer functions at the bottom of
-- this file, which are the only things allowed to touch the accounts table.

create extension if not exists pgcrypto with schema extensions;

-- ============================ Tables ============================

-- Messages. This app is a single room; `channel` is a fixed constant ('main')
-- kept only so the column has a value. It carries a default so inserts that omit
-- it still succeed.
create table if not exists public.messages (
  id          bigint generated always as identity primary key,
  channel     text not null default 'main',
  name        text not null,
  color       text not null,
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);

create index if not exists messages_created_idx
  on public.messages (created_at);

-- Legacy: the very first version of this app tied messages.name to a `handles`
-- table with a foreign key. Posting now goes through chat_post(), so drop it.
alter table public.messages drop constraint if exists messages_name_fkey;

-- Accounts. `name_key` is the lowercased name and is the real identity, so
-- "Lucas" and "lucas" can't both be registered. `token` is a session secret
-- handed to the browser at login; it is what proves "I am this account" on
-- every later call (posting, editing your colour/photo).
create table if not exists public.accounts (
  name_key    text primary key,
  name        text not null check (char_length(name) between 1 and 24),
  pass_hash   text not null,
  color       text not null default '#7c6cf0',
  avatar      text,
  token       uuid not null default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Chats. `code` is the short string you share so other people can join. The
-- original single room keeps the code 'main', which is what every message sent
-- before chats existed already carries.
--
-- NOTE the chat_ prefix: this Supabase project is shared with the Battleship
-- game, which owns its own public.rooms / public.players / public.shots. Never
-- create or alter a bare `rooms` here — it is not ours.
create table if not exists public.chat_rooms (
  code       text primary key check (code ~ '^[A-Za-z0-9]{3,12}$'),
  name       text not null check (char_length(name) between 1 and 40),
  owner_key  text,
  created_at timestamptz not null default now()
);

insert into public.chat_rooms (code, name)
  values ('main', 'Main room') on conflict (code) do nothing;

-- Which chats show up in your switcher. Joining with a code adds a row here.
create table if not exists public.chat_room_members (
  code      text not null references public.chat_rooms(code) on delete cascade,
  name_key  text not null,
  joined_at timestamptz not null default now(),
  primary key (code, name_key)
);

-- Per-chat history and the per-chat trim both read newest-first within a room.
create index if not exists messages_channel_id_idx
  on public.messages (channel, id desc);

-- ============================ Row Level Security ============================

-- Messages: world-readable, but nobody may insert directly. Posting goes
-- through chat_post(), which checks your session token first.
alter table public.messages enable row level security;

drop policy if exists "messages readable"   on public.messages;
drop policy if exists "messages insertable" on public.messages;
create policy "messages readable" on public.messages for select using (true);

-- Accounts: RLS on with NO policies at all, plus the grants revoked. That means
-- the anon key cannot read password hashes or session tokens, or write anything
-- here — only the functions below (which run as the table owner) can.
alter table public.accounts enable row level security;
revoke all on table public.accounts from anon, authenticated;

-- Chats are the same: locked down, reachable only through the functions. This
-- is what stops someone listing every room code that exists.
alter table public.chat_rooms enable row level security;
alter table public.chat_room_members enable row level security;
revoke all on table public.chat_rooms, public.chat_room_members from anon, authenticated;

-- Realtime: broadcast new message rows to subscribed clients.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;

-- ============================ Account API ============================

-- The one password that unlocks changing an account's name or password.
-- Kept in a function (not a column) so it is never selectable by the anon key.
create or replace function public.chat_master_password()
returns text language sql immutable as $$ select 'hiwelecome1234' $$;
revoke all on function public.chat_master_password() from public, anon, authenticated;

-- Logging in with the master password signs you in as this account, whatever
-- username was typed, and pins it to this colour.
create or replace function public.chat_admin_name()
returns text language sql immutable as $$ select 'Lucaca92' $$;
create or replace function public.chat_admin_color()
returns text language sql immutable as $$ select '#ffab00' $$;

-- A second account for you, seeded near the bottom of this file. Same person,
-- but its chat switcher lists EVERY chat that exists, so it can read any of
-- them without being given a code.
create or replace function public.chat_dev_name()
returns text language sql immutable as $$ select 'Lucaca92 Dev' $$;
create or replace function public.chat_dev_password()
returns text language sql immutable as $$ select 'welecome1234' $$;
revoke all on function public.chat_dev_password() from public, anon, authenticated;

-- How many messages the room keeps. Once the 501st message is posted the
-- oldest one is deleted, so the table never holds more than this.
create or replace function public.chat_message_limit()
returns integer language sql immutable as $$ select 500 $$;

-- Verify a session token and hand back the account key. Raises if it's stale.
create or replace function public.chat_auth(p_name text, p_token uuid)
returns text language plpgsql as $$
declare v_key text := lower(btrim(coalesce(p_name, '')));
begin
  if not exists (select 1 from accounts a where a.name_key = v_key and a.token = p_token) then
    raise exception 'Your session expired — please log in again.';
  end if;
  return v_key;
end $$;
revoke all on function public.chat_auth(text, uuid) from public, anon, authenticated;

-- The two built-in accounts, which may delete anything anywhere.
create or replace function public.chat_is_staff(p_key text)
returns boolean language sql stable as $$
  select p_key in (lower(chat_admin_name()), lower(chat_dev_name()))
$$;
revoke all on function public.chat_is_staff(text) from public, anon, authenticated;

-- Shared validation for a display name.
create or replace function public.chat_check_name(p_name text)
returns text language plpgsql as $$
declare v text := btrim(coalesce(p_name, ''));
begin
  if v = '' then raise exception 'Please enter a name.'; end if;
  if char_length(v) > 24 then raise exception 'Names can be at most 24 characters.'; end if;
  if v !~ '^[A-Za-z0-9_.() -]+$' then
    raise exception 'Use letters, numbers, spaces and _ - . ( ) only.';
  end if;
  return v;
end $$;
revoke all on function public.chat_check_name(text) from public, anon, authenticated;

-- Register a new account and return its profile + session token.
create or replace function public.chat_signup(
  p_name text, p_password text, p_color text default null, p_avatar text default null
) returns table (name text, color text, avatar text, token uuid)
language plpgsql security definer set search_path = public, extensions as $$
declare v_name text := chat_check_name(p_name);
        v_key  text := lower(v_name);
begin
  if char_length(coalesce(p_password, '')) < 4 then
    raise exception 'Your password needs at least 4 characters.';
  end if;
  if v_key in (lower(chat_admin_name()), lower(chat_dev_name())) then
    raise exception 'That name is reserved.';
  end if;
  if exists (select 1 from accounts a where a.name_key = v_key) then
    raise exception 'That name is already registered. Log in instead.';
  end if;

  insert into accounts (name_key, name, pass_hash, color, avatar)
  values (v_key, v_name, crypt(p_password, gen_salt('bf')),
          coalesce(nullif(p_color, ''), '#7c6cf0'), p_avatar);

  return query select a.name, a.color, a.avatar, a.token from accounts a where a.name_key = v_key;
end $$;

-- Log in with a name + password.
create or replace function public.chat_login(p_name text, p_password text)
returns table (name text, color text, avatar text, token uuid)
language plpgsql security definer set search_path = public, extensions as $$
declare v_key   text := lower(btrim(coalesce(p_name, '')));
        v_ok    boolean;
        v_admin text;
begin
  -- The master password is a way in regardless of the name typed: it signs you
  -- in as the owner account, creating it the first time. Its own stored hash is
  -- a throwaway random value, so there is no ordinary password for it.
  if coalesce(p_password, '') = chat_master_password() then
    v_admin := chat_admin_name();
    v_key := lower(v_admin);
    insert into accounts (name_key, name, pass_hash, color)
    values (v_key, v_admin, crypt(gen_random_uuid()::text, gen_salt('bf')), chat_admin_color())
    on conflict (name_key) do update
      set name = v_admin, color = chat_admin_color(), updated_at = now();
    return query select a.name, a.color, a.avatar, a.token from accounts a where a.name_key = v_key;
    return;
  end if;

  select a.pass_hash = crypt(coalesce(p_password, ''), a.pass_hash)
    into v_ok from accounts a where a.name_key = v_key;
  if v_ok is null then raise exception 'No account with that name yet. Create one first.'; end if;
  if not v_ok then raise exception 'Wrong password.'; end if;

  return query select a.name, a.color, a.avatar, a.token from accounts a where a.name_key = v_key;
end $$;

-- Resume a stored session (used on page load so a reload doesn't log you out).
create or replace function public.chat_session(p_name text, p_token uuid)
returns table (name text, color text, avatar text, token uuid)
language plpgsql security definer set search_path = public as $$
declare v_key text := lower(btrim(coalesce(p_name, '')));
begin
  return query
    select a.name, a.color, a.avatar, a.token
      from accounts a where a.name_key = v_key and a.token = p_token;
end $$;

-- Change the account's NAME and/or PASSWORD. Gated on the master password:
-- knowing your own password is not enough, you must supply chat_master_password().
create or replace function public.chat_update_account(
  p_name text, p_master text, p_new_name text default null, p_new_password text default null
) returns table (name text, color text, avatar text, token uuid)
language plpgsql security definer set search_path = public, extensions as $$
declare v_key     text := lower(btrim(coalesce(p_name, '')));
        v_wanted  text := nullif(btrim(coalesce(p_new_name, '')), '');
        v_new_key text;
        v_new     text;
begin
  if coalesce(p_master, '') is distinct from chat_master_password() then
    raise exception 'That password does not unlock account changes.';
  end if;
  if not exists (select 1 from accounts a where a.name_key = v_key) then
    raise exception 'No such account.';
  end if;
  if v_wanted is null and coalesce(p_new_password, '') = '' then
    raise exception 'Nothing to change — enter a new name or a new password.';
  end if;

  if v_wanted is not null then
    v_new := chat_check_name(v_wanted);
    v_new_key := lower(v_new);
    if v_new_key <> v_key and exists (select 1 from accounts a where a.name_key = v_new_key) then
      raise exception 'That name is already registered.';
    end if;
    -- Messages keep the name they were posted under; only the account moves.
    update accounts a set name = v_new, name_key = v_new_key, updated_at = now()
      where a.name_key = v_key;
    -- Chats and memberships are keyed by name_key too, so carry them across or
    -- a rename would quietly cost you ownership of every chat you made.
    update chat_rooms r set owner_key = v_new_key where r.owner_key = v_key;
    update chat_room_members m set name_key = v_new_key where m.name_key = v_key;
    v_key := v_new_key;
  end if;

  if coalesce(p_new_password, '') <> '' then
    if char_length(p_new_password) < 4 then
      raise exception 'Your new password needs at least 4 characters.';
    end if;
    -- A password change rotates the session token, so other sessions drop out.
    update accounts a
       set pass_hash = crypt(p_new_password, gen_salt('bf')),
           token = gen_random_uuid(), updated_at = now()
     where a.name_key = v_key;
  end if;

  return query select a.name, a.color, a.avatar, a.token from accounts a where a.name_key = v_key;
end $$;

-- Change colour / photo. Only needs your session token — no master password.
create or replace function public.chat_update_profile(
  p_name text, p_token uuid, p_color text, p_avatar text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_key text := lower(btrim(coalesce(p_name, '')));
begin
  update accounts a
     set color = coalesce(nullif(p_color, ''), a.color), avatar = p_avatar, updated_at = now()
   where a.name_key = v_key and a.token = p_token;
  if not found then raise exception 'Your session expired — please log in again.'; end if;
end $$;

-- ---- Chats ----

-- A fresh 6-character code. Ambiguous characters (0/O, 1/I) are left out so a
-- code can be read aloud without confusion.
create or replace function public.chat_new_code()
returns text language plpgsql as $$
declare v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        v_code  text;
        i int;
begin
  for attempt in 1..25 loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alpha, 1 + floor(random() * length(v_alpha))::int, 1);
    end loop;
    if not exists (select 1 from chat_rooms r where r.code = v_code) then return v_code; end if;
  end loop;
  raise exception 'Could not allocate a chat code — try again.';
end $$;
revoke all on function public.chat_new_code() from public, anon, authenticated;

-- Create a chat and return the code to share.
create or replace function public.chat_create_room(p_name text, p_token uuid, p_room_name text)
returns table (code text, name text)
language plpgsql security definer set search_path = public as $$
declare v_key  text := chat_auth(p_name, p_token);
        v_room text := btrim(coalesce(p_room_name, ''));
        v_code text;
begin
  if v_room = '' then raise exception 'Give your chat a name.'; end if;
  if char_length(v_room) > 40 then raise exception 'Chat names can be at most 40 characters.'; end if;
  if (select count(*) from chat_rooms r where r.owner_key = v_key) >= 20 then
    raise exception 'You already have 20 chats — that is the limit.';
  end if;

  v_code := chat_new_code();
  insert into chat_rooms (code, name, owner_key) values (v_code, v_room, v_key);
  insert into chat_room_members (code, name_key) values (v_code, v_key)
    on conflict do nothing;
  return query select r.code, r.name from chat_rooms r where r.code = v_code;
end $$;

-- Join a chat by its code. Codes are matched case-insensitively.
create or replace function public.chat_join_room(p_name text, p_token uuid, p_code text)
returns table (code text, name text)
language plpgsql security definer set search_path = public as $$
declare v_key  text := chat_auth(p_name, p_token);
        v_code text;
begin
  select r.code into v_code from chat_rooms r
   where upper(r.code) = upper(btrim(coalesce(p_code, '')));
  if v_code is null then raise exception 'No chat with that code.'; end if;

  insert into chat_room_members (code, name_key) values (v_code, v_key)
    on conflict do nothing;
  return query select r.code, r.name from chat_rooms r where r.code = v_code;
end $$;

-- The chats in your switcher: the main room, ones you made, ones you joined.
-- The return type gains can_clear, and Postgres will not change a function's
-- return type in place, so the previous signature has to go first.
drop function if exists public.chat_my_rooms(text, uuid);
create or replace function public.chat_my_rooms(p_name text, p_token uuid)
returns table (code text, name text, is_owner boolean, can_clear boolean)
language plpgsql security definer set search_path = public as $$
declare v_key text := chat_auth(p_name, p_token);
begin
  -- The dev account sees every chat, joined or not.
  if v_key = lower(chat_dev_name()) then
    return query
      select r.code, r.name, (r.owner_key = v_key) as is_owner,
             true as can_clear
        from chat_rooms r
       order by (r.code <> 'main'), r.created_at;
    return;
  end if;

  return query
    select r.code, r.name, (r.owner_key = v_key) as is_owner,
           (r.owner_key = v_key or chat_is_staff(v_key)) as can_clear
      from chat_rooms r
     where r.code = 'main'
        or r.owner_key = v_key
        or exists (select 1 from chat_room_members m
                    where m.code = r.code and m.name_key = v_key)
     order by (r.code <> 'main'), r.created_at;
end $$;

-- Post into a chat as the account that owns this session token. The stored name
-- and colour are used, so nobody can post under someone else's name.
-- The old 3-argument version (before chats) has to go, or both would resolve.
drop function if exists public.chat_post(text, uuid, text);
create or replace function public.chat_post(p_name text, p_token uuid, p_code text, p_body text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_key  text := chat_auth(p_name, p_token);
        v_body text := btrim(coalesce(p_body, ''));
        v_code text;
begin
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then
    raise exception 'Messages must be 1-2000 characters.';
  end if;
  select r.code into v_code from chat_rooms r
   where upper(r.code) = upper(btrim(coalesce(p_code, '')));
  if v_code is null then raise exception 'That chat no longer exists.'; end if;

  insert into messages (channel, name, color, body)
  select v_code, a.name, a.color, v_body from accounts a where a.name_key = v_key;

  -- Rolling window, per chat: drop anything past the newest
  -- chat_message_limit() rows in THIS room. `id` is an identity column, so
  -- ordering by it is oldest-to-newest exactly.
  delete from messages m
   where m.id in (
     select m2.id from messages m2
      where m2.channel = v_code
      order by m2.id desc offset chat_message_limit()
   );
end $$;

-- Delete one message. You can always delete your own; the chat's owner can
-- delete anything in their chat, and the built-in accounts can delete anything.
create or replace function public.chat_delete_message(p_name text, p_token uuid, p_id bigint)
returns void
language plpgsql security definer set search_path = public as $$
declare v_key  text := chat_auth(p_name, p_token);
        v_msg  record;
        v_mine text;
begin
  select m.id, m.channel, m.name into v_msg from messages m where m.id = p_id;
  if not found then raise exception 'That message is already gone.'; end if;

  select a.name into v_mine from accounts a where a.name_key = v_key;

  if not (v_msg.name = v_mine
          or chat_is_staff(v_key)
          or exists (select 1 from chat_rooms r
                      where r.code = v_msg.channel and r.owner_key = v_key)) then
    raise exception 'You can only delete your own messages.';
  end if;

  delete from messages m where m.id = p_id;
end $$;

-- Empty a whole chat. Only its owner, or a built-in account, may do this; the
-- Main room has no owner, so only the built-in accounts can clear it.
create or replace function public.chat_clear_room(p_name text, p_token uuid, p_code text)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_key  text := chat_auth(p_name, p_token);
        v_code text;
        v_n    integer;
begin
  select r.code into v_code from chat_rooms r
   where upper(r.code) = upper(btrim(coalesce(p_code, '')));
  if v_code is null then raise exception 'That chat no longer exists.'; end if;

  if not (chat_is_staff(v_key)
          or exists (select 1 from chat_rooms r
                      where r.code = v_code and r.owner_key = v_key)) then
    raise exception 'Only the owner of this chat can clear it.';
  end if;

  delete from messages m where m.channel = v_code;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Delete a whole chat: its messages, its membership rows and the chat itself.
-- Same permission as clearing, except the Main room can never be deleted —
-- it is where everyone lands.
create or replace function public.chat_delete_room(p_name text, p_token uuid, p_code text)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_key  text := chat_auth(p_name, p_token);
        v_code text;
        v_n    integer;
begin
  select r.code into v_code from chat_rooms r
   where upper(r.code) = upper(btrim(coalesce(p_code, '')));
  if v_code is null then raise exception 'That chat no longer exists.'; end if;
  if v_code = 'main' then raise exception 'The Main room cannot be deleted.'; end if;

  if not (chat_is_staff(v_key)
          or exists (select 1 from chat_rooms r
                      where r.code = v_code and r.owner_key = v_key)) then
    raise exception 'Only the owner of this chat can delete it.';
  end if;

  delete from messages m where m.channel = v_code;
  get diagnostics v_n = row_count;
  -- chat_room_members goes with it, via on delete cascade.
  delete from chat_rooms r where r.code = v_code;
  return v_n;
end $$;

-- ---- Seed the dev account ----
-- Re-running this file re-applies the password defined by chat_dev_password(),
-- so it is always the one the README documents. Its colour matches the admin
-- account's; recolour it in the profile editor and that is not reset.
-- Unlike the functions above, this runs at the top level, where pgcrypto's
-- schema isn't on the path by default. Naming both schemas finds crypt()
-- whether the extension sits in `extensions` (Supabase) or `public`.
set search_path = public, extensions;

insert into public.accounts (name_key, name, pass_hash, color)
values (lower(chat_dev_name()), chat_dev_name(),
        crypt(chat_dev_password(), gen_salt('bf')), chat_admin_color())
on conflict (name_key) do update
  set name       = chat_dev_name(),
      pass_hash  = crypt(chat_dev_password(), gen_salt('bf')),
      updated_at = now();

grant execute on function
  public.chat_signup(text, text, text, text),
  public.chat_login(text, text),
  public.chat_session(text, uuid),
  public.chat_update_account(text, text, text, text),
  public.chat_update_profile(text, uuid, text, text),
  public.chat_post(text, uuid, text, text),
  public.chat_create_room(text, uuid, text),
  public.chat_join_room(text, uuid, text),
  public.chat_my_rooms(text, uuid),
  public.chat_delete_message(text, uuid, bigint),
  public.chat_clear_room(text, uuid, text),
  public.chat_delete_room(text, uuid, text),
  public.chat_dev_name()
to anon, authenticated;
