-- Nexus Canvas chat — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
--
-- Names are NOT stored or reserved here. Uniqueness is enforced live, among
-- currently-connected users, via Supabase Realtime presence (see public/app.js).
-- A name is free again the moment its owner disconnects.

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

-- Row Level Security. This is a public, anonymous chat, so anon may read
-- everything and insert (but never update/delete) messages.
alter table public.messages enable row level security;

drop policy if exists "messages readable"  on public.messages;
drop policy if exists "messages insertable" on public.messages;
create policy "messages readable"  on public.messages for select using (true);
create policy "messages insertable" on public.messages
  for insert with check (
    char_length(body) between 1 and 2000
    and char_length(name) between 1 and 24
  );

-- Realtime: broadcast new rows to subscribed clients.
alter publication supabase_realtime add table public.messages;
