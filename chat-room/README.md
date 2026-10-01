# Nexus Canvas — Chat Room

A real-time chat app backed by **Supabase** (Postgres + Realtime), with real
accounts and multiple chats: you register a name with a password, and you can
create chats and share a code so other people can join them.

## How it works

- **Accounts** — create one with a name + password, then log in with it. A
  registered name can't be taken by anyone else, ever (not just while you're
  online). Reloading the page keeps you logged in. Names are up to 24 characters
  of letters, numbers, spaces and `_ - . ( )`.
- **Passwords are hashed** with bcrypt (`pgcrypto`) inside Postgres and never
  leave the database. The browser only calls the database functions in
  [`supabase/schema.sql`](supabase/schema.sql); the `accounts` table itself has
  RLS on with no policies and its grants revoked, so the public anon key can't
  read hashes or session tokens.
- **Locked name/password changes** — changing your account's name or password
  requires the **admin password**. Your own password is *not*
  enough. The check happens in the database (`chat_master_password()`), not in
  the browser, so it can't be clicked past with devtools. Colour and photo are
  not locked — you can change those freely.
- **Messages are posted on your behalf** by `chat_post()`, which verifies your
  session token and uses the name/colour stored on your account. Nobody can post
  under someone else's name, and direct inserts into `messages` are rejected.
- **Chats** — everyone starts in the **Main room**. Hit **+ New chat**, name it,
  and you get a 6-character code (no `0`/`O` or `1`/`I`, so it can be read out
  loud). Anyone who enters that code in the **Join code** popup lands in the
  chat and it appears in their switcher from then on. Codes are matched
  case-insensitively. Click the code chip in the top bar to copy it.
- **Who can reach a chat** — every chat is **hidden** by default: only people
  with the code. The dev account can change that from the **People** panel to
  **public** (shows up for everyone, no code) or **private** (only the dev
  account — the owner is locked out too, which is the point). A private chat
  answers a join attempt exactly like a code that doesn't exist, so you can't
  probe for one.
- **Shrijay's account** — `Shrijay WOF` is seeded by `supabase/schema.sql` with
  a known password (see below), because the password was chosen up front rather
  than left for them to pick. It is an *ordinary* account: it reaches a chat
  only once somebody adds it in the **People** panel. Re-running the schema
  resets its password.
- **Letting one person in** — a chat's owner (or the dev account) can open
  **People** and add somebody by name. That chat then appears in their switcher
  without the code ever being shared. If that name has no account yet it is
  **held** for them and you get a 6-character **invite code**: only somebody
  with that code can register the name, so a stranger can't grab it first and
  inherit the permission. They type it in the invite-code box when they sign up.
- **Each chat keeps its own last 500 messages.** When the 501st message is
  posted to a chat, that chat's oldest message is deleted; other chats are
  untouched. The trim runs inside `chat_post()`, so it holds however the message
  was sent, and open tabs trim their own list to match.
- **One way in** — every login is a name plus that account's own password.
  There is no password-only shortcut: the admin password unlocks name/password
  *changes*, and nothing else.
- **The dev account** — `Lucaca92 Dev`. It works like
  any other account except that its chat switcher lists **every chat that
  exists**, so it can open and read any of them without being given a code. The
  name is reserved, so nobody else can register it. The account is created by
  `supabase/schema.sql`, and re-running that file resets its password to
  whatever `chat_dev_password()` says.
- **Deleting** — hover a message and a small **×** appears on the ones you may
  remove: always your own, plus everyone's if you own the chat or are using a
  built-in account. **Clear** empties a chat, **Delete chat** removes it and its
  messages for everyone. Both buttons only appear if you're allowed, and both
  ask first. The Main room can be cleared (built-in accounts only) but never
  deleted. Deletions reach other open tabs live.
- **Profile pictures** — a colour, or a photo/GIF up to **5 MB**. GIFs keep
  every frame; other images are cropped to a small square. Pictures live in the
  `accounts` table and are fetched with `chat_avatars()`, *not* sent over
  realtime presence — presence frames cap out around a megabyte, which is what
  used to limit them. Presence carries only a short hash, so other tabs still
  notice when your picture changes. If a picture can't be displayed, the avatar
  falls back to your initials rather than showing an empty box.
- **Deleting people** — the dev account gets an **Everyone** list in its profile
  dialog, with a Delete next to each member. Deleting removes their login, their
  permissions and the chats they had joined; any chat they *owned* is left
  ownerless rather than deleted out from under the people in it. Messages they
  already sent stay, under the name they were posted with, the same as after a
  rename. The dev account can't delete itself.
- **Live messages + online count** — new rows are pushed to every open client
  through Supabase Realtime; the online count comes from Realtime Presence.

## Setup

1. **Create a Supabase project** at https://supabase.com (free tier is fine).

2. **Create the tables and functions.** In the dashboard: **SQL Editor → New
   query**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql),
   and **Run**. It's safe to re-run, and **you must re-run it after pulling this
   version** — without it the app says "Accounts aren't set up in Supabase yet".

3. **Add your credentials.** Dashboard → **Project Settings → API**. Copy the
   *Project URL* and the *anon / public* key into [`public/config.js`](public/config.js):

   ```js
   window.SUPABASE_CONFIG = {
     url: "https://YOUR-PROJECT.supabase.co",
     anonKey: "eyJhbGci...your-anon-key...",
   };
   ```

   > The anon key is meant to be public; access is controlled by the RLS policies
   > and the function grants in the schema.

4. **Run it.**

   ```bash
   npm start
   # → http://localhost:3000
   ```

   Open the URL in two browsers/windows, create two accounts, and chat live.

## Setting the passwords

**No password is written anywhere in this repository.** `schema.sql` ships
placeholders (`SET-ME-ADMIN`, `SET-ME-DEV`, `SET-ME-SHRIJAY`); the real values
live only in `supabase/secrets.local.sql`, which is git-ignored, and in your
Supabase database.

1. Run `supabase/schema.sql` in the SQL Editor.
2. Run `supabase/secrets.local.sql` straight afterwards.

Start from [`supabase/secrets.example.sql`](supabase/secrets.example.sql) if you
need to recreate it. **Re-running `schema.sql` resets the passwords to the
placeholders, so run the secrets file again each time.**

| Account | Password set by | What's special |
|---------|-----------------|----------------|
| `Lucaca92 Dev` | `chat_dev_password()` | Sees every chat; sets visibility; deletes anything |
| `Shrijay WOF` | `chat_shrijay_password()` | Nothing — an ordinary account |
| *(the admin password)* | `chat_master_password()` | Unlocks name/password changes |

## Changing the message cap

Same idea — edit and re-run this one statement (and keep `MAX_MESSAGES` in
`public/app.js` in step with it):

```sql
create or replace function public.chat_message_limit()
returns integer language sql immutable as $$ select 500 $$;
```

## Files

| File | Purpose |
|------|---------|
| `public/index.html` | Login / signup gate, chat UI, profile + account editor |
| `public/style.css`  | Dark Nexus Canvas theme |
| `public/app.js`     | Supabase client: accounts, realtime messages, presence |
| `public/config.js`  | Your Supabase URL + anon key |
| `supabase/schema.sql` | `messages`, `accounts`, `chat_rooms`, `chat_room_members`, `chat_grants`, `chat_reserved`, RLS, all functions |
| `server.js`         | Zero-dependency static file server for local dev |

## Database API

Everything the browser is allowed to do (all `security definer`, granted to `anon`):

| Function | Purpose |
|----------|---------|
| `chat_signup(name, password, color, avatar, claim)` | Register; `claim` is the invite code, if the name is being held |
| `chat_login(name, password)` | Log in; returns profile + session token |
| `chat_session(name, token)` | Resume a stored session after a reload |
| `chat_update_account(name, master, new_name, new_password)` | Rename / change password — **needs the admin password** |
| `chat_update_profile(name, token, color, avatar)` | Change colour / photo |
| `chat_avatars(name, token, names[])` | Fetch profile pictures for a set of accounts |
| `chat_post(name, token, code, body)` | Send a message to a chat, then trim that chat to 500 |
| `chat_create_room(name, token, chat_name)` | Create a chat; returns its code (20 per account) |
| `chat_join_room(name, token, code)` | Join a chat by code; returns its code + name |
| `chat_my_rooms(name, token)` | The chats in your switcher — every chat, for the dev account |
| `chat_set_visibility(name, token, code, visibility)` | public / hidden / private — **dev account only** |
| `chat_room_people(name, token, code)` | Who has permissions on a chat, and any unclaimed invite codes |
| `chat_grant(name, token, code, who, perm)` | Let someone see a chat; holds the name if they haven't signed up |
| `chat_revoke(name, token, code, who, perm)` | Take it away again |
| `chat_delete_message(name, token, id)` | Delete one message (yours, or any if you own the chat) |
| `chat_clear_room(name, token, code)` | Delete every message in a chat; returns how many |
| `chat_delete_room(name, token, code)` | Delete a chat and its messages; never the Main room |
| `chat_accounts(name, token)` | Everyone who has registered — **dev account only** |
| `chat_delete_account(name, token, who)` | Delete somebody's account — **dev account only** |

## What a stranger can get at

Every table has row level security on with **no policies**, and the grants to
the public key revoked. So the key in `public/config.js` reads nothing at all by
itself: not messages, not accounts, not chats, not permissions. Everything goes
through the `security definer` functions above, and each one checks your session
token and whether you can see the chat before it answers.

Realtime deliberately does **not** carry the `messages` table. A Postgres change
feed ignores those checks, so anyone subscribing to a chat's topic would have
received every message in it. Clients instead send each other a content-free
"something changed" ping and then fetch through `chat_history()`, which does
check. The only things on the wire are that ping, a deleted message's id, and
presence (names, colours and a picture hash of whoever is in the chat with you).

What this does **not** protect against: anybody you give a chat code to, and
anybody using an account you handed out. It is a lock on the door, not a secret
you can keep from the people in the room.

## Notes

- A 5 MB GIF is about 6.7 MB once base64-encoded, and that is what gets stored
  and sent to each person who sees your messages. A handful of large avatars is
  fine; dozens would make the chat slow to load.

- A name change only moves the account. Messages already sent keep the name they
  were posted under.
- Changing a password rotates the session token, so any other logged-in session
  for that account is signed out.
- Messages sent before this version have no account behind them; they still
  display fine.
- The 500-message trim only runs when a message is posted, so a chat sitting
  idle above the cap (e.g. right after you lower the limit) stays that way until
  the next message arrives.
- You can delete a chat you own, but there's no way to *leave* one someone else
  owns, or to rename a chat.
- `see` is the only permission so far. The `chat_grants` table is keyed by
  permission name, so adding (say) `delete` or `clear` is a check constraint and
  a few lines in the matching function.
- Renaming your account carries your chat ownership and memberships across, so
  you keep the chats you made.
- The same account can't be in the *same* chat in two tabs at once, but it can
  be in two different chats.
- To wipe everything — all accounts, all messages, all chats you made — run
  [`supabase/reset.sql`](supabase/reset.sql) in the SQL Editor. It cannot be
  undone, and it leaves the Battleship game (which shares this Supabase project)
  alone.
