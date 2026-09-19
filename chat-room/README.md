# Nexus Canvas — Chat Room

A real-time chat room backed by **Supabase** (Postgres + Realtime). Pick a name on
the way in and start chatting. Nothing is reserved permanently — a name is only
yours while you're connected.

## How it works

- **Pick-a-name entry** — you choose a display name when you join. No accounts, no
  registration, nothing stored about the name.
- **Live uniqueness** — no two people who are online at the same time can use the
  same name. This is enforced with Supabase Realtime **Presence**, not a database
  lock: when you disconnect, your name is free again.
- **Live messages** — messages are stored in a `messages` table and pushed to every
  open client via Supabase Realtime (Postgres change feed).
- **Online count** — how many people are currently connected, via Presence.

## Setup

1. **Create a Supabase project** at https://supabase.com (free tier is fine).

2. **Create the table.** In the dashboard: **SQL Editor → New query**, paste the
   contents of [`supabase/schema.sql`](supabase/schema.sql), and **Run**.

3. **Add your credentials.** Dashboard → **Project Settings → API**. Copy the
   *Project URL* and the *anon / public* key into [`public/config.js`](public/config.js):

   ```js
   window.SUPABASE_CONFIG = {
     url: "https://YOUR-PROJECT.supabase.co",
     anonKey: "eyJhbGci...your-anon-key...",
   };
   ```

   > The anon key is meant to be public; access is controlled by the RLS policies
   > in the schema.

4. **Run it.**

   ```bash
   npm start
   # → http://localhost:3000
   ```

   Open the URL in two browsers/windows, pick different names, and chat live.

## Files

| File | Purpose |
|------|---------|
| `public/index.html` | Name picker + chat UI |
| `public/style.css`  | Dark Nexus Canvas theme |
| `public/app.js`     | Supabase client: presence-based names, realtime messages |
| `public/config.js`  | Your Supabase URL + anon key |
| `supabase/schema.sql` | `messages` table, RLS policies, realtime publication |
| `server.js`         | Zero-dependency static file server for local dev |

## Notes

- Names are **not** permanent. Uniqueness only applies to people online at the same
  moment; once you close the tab, the name can be claimed by anyone.
- To clear the chat history during development: `truncate public.messages;` in the
  SQL editor.

### Upgrading from the old "permanent handles" version

If your project was created with the earlier schema, the `messages` table has a
foreign key tying every message to the old `handles` table. Drop it once in the
SQL Editor so anonymous names can post:

```sql
alter table public.messages drop constraint if exists messages_name_fkey;
```

Optional cleanup (the `handles` table is no longer used):

```sql
alter publication supabase_realtime drop table if exists public.handles;
drop table if exists public.handles;
```
