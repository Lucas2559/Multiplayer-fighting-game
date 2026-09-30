-- Nexus Canvas chat — WIPE ACCOUNTS AND HISTORY
--
-- Run this in the Supabase SQL Editor. IT CANNOT BE UNDONE: every account,
-- every message and every chat you created is gone for good.
--
-- It does NOT touch the Battleship game, which shares this project and owns
-- public.rooms / public.players / public.shots / public.secrets.
--
-- Afterwards: everyone is signed out, nobody has an account, and the Main room
-- is empty. Names are all free again, so re-register yours. Logging in with the
-- admin password recreates Lucaca92 automatically.

begin;

-- Every message, in every chat.
truncate public.messages;

-- Chat membership, then the chats themselves — except the Main room, which is
-- where everyone lands and must keep existing.
delete from public.chat_room_members;
delete from public.chat_rooms where code <> 'main';

-- Every account: names, password hashes, colours, photos, session tokens.
truncate public.accounts;

commit;

-- Sanity check: all three should come back 0.
select
  (select count(*) from public.messages)                          as messages,
  (select count(*) from public.accounts)                          as accounts,
  (select count(*) from public.chat_rooms where code <> 'main')   as extra_chats;
