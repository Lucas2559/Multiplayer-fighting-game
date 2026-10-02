# Deploying the chat — Vercel + Cloudflare R2

This `chat-room` folder is its own Vercel project. The game hub and the other
games are a second Vercel project built from the repo root (`games.lucasz.com`,
see the root `vercel.json`).

| Piece | Runs on | Holds |
|---|---|---|
| The chat page (`public/`) | **Vercel** (static), served at `/` | nothing — just files |
| `api/upload.js`, `api/view.js` | **Vercel** (functions), at `/api/…` | the R2 keys, as environment variables |
| Chat pictures and avatars | **Cloudflare R2** (private bucket) | the image files |
| Accounts, chats, messages | **Supabase** (unchanged) | a short `r2:<key>` reference per picture |

Pictures go **browser → R2 directly**. `/api/upload` checks you're logged in and
hands out a link valid for one exact file (its size and type are signed in) for
five minutes. `/api/view` asks the database — *as you* — which pictures you're
allowed to see, and signs one-hour viewing links for only those. The bucket is
never public, so a picture from a private chat can't be opened by someone who
was never in it.

The examples use **`chat.lucasz.com`** as the chat's new address; swap in
whatever you pick.

---

## 1. Cloudflare R2

Same Cloudflare account that already runs `lucasz.com`'s DNS.

1. **R2 → Create bucket.** Any name, e.g. `chat-pictures`. Leave public access **off**.
2. **Bucket → Settings → CORS policy:**
   ```json
   [
     {
       "AllowedOrigins": ["https://chat.lucasz.com", "https://YOUR-PROJECT.vercel.app"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["Content-Type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   Only uploads need this; viewing goes through `<img>` tags, which don't.
3. **R2 → Manage API tokens → Create API token.** *Object Read & Write*, scoped to
   **this bucket only**. Keep the **Access Key ID** and **Secret Access Key** — the
   secret is shown once. Your **Account ID** is on the R2 overview page.

## 2. Vercel

1. **Add New → Project → Import Git Repository →** `Multiplayer-fighting-game`.
   Make sure it says **Importing** from GitHub. A screen that says *Cloning* and
   asks for a new repository name would deploy a copy that never receives updates.
2. **Root Directory → `chat-room`.**
3. Preset and output are fixed by `vercel.json` (*Other*, serving `public/`), so
   whatever the dashboard guesses is overridden — leave Build and Output Settings alone.
4. **Environment Variables.** Vercel accepts a whole block pasted into the first
   *Key* box — it splits the lines itself. Fill in the four R2 values:

   ```
   SUPABASE_URL=https://eexzhpmxcrjqbhvqogkw.supabase.co
   SUPABASE_ANON_KEY=sb_publishable_IxezLk-Of7Hl0K4NMfUpKg_9iLIh5t_
   R2_ACCOUNT_ID=
   R2_ACCESS_KEY_ID=
   R2_SECRET_ACCESS_KEY=
   R2_BUCKET=
   ```

   Already created the project without them? **Settings → Environment Variables**,
   paste the same block, then **Deployments → ⋯ → Redeploy** — variables only
   reach a deploy made after they were added.
5. **Deploy**, and note the `https://….vercel.app` address for the CORS list in step 1.2.

## 3. Database

Run `supabase/schema.sql` in the Supabase SQL Editor. Old inline pictures keep
displaying; new ones are stored as R2 references.

## 4. Try it on the vercel.app address

Open `https://YOUR-PROJECT.vercel.app/`, log in, send a photo, change your avatar.
If something fails, the banner says why:

- *"…not configured on the server (missing …)"* → a variable from step 2.4 is missing,
  or was added after the last deploy (redeploy).
- *"…upload was blocked — the R2 bucket's CORS settings…"* → this exact address isn't
  in the list from step 1.2.
- *"Couldn't reach the picture service"* → you're on a copy without `/api`, e.g. the
  hub's `/chat-room/` path (which now redirects here).

## 5. Give it its own address

1. **Vercel → Project → Settings → Domains →** add `chat.lucasz.com`. Vercel shows the
   record it wants — usually a CNAME to `cname.vercel-dns.com`.
2. **Cloudflare → lucasz.com → DNS → Add record:** type CNAME, name `chat`, target as
   Vercel showed, proxy **DNS only** (grey cloud) so Vercel can issue its certificate.
   The `games` record belongs to the hub's own Vercel project.

## 6. Point the hub at the new chat

Done: the hub's **Chat Room** card links to `https://chat.lucasz.com/`, and the
hub's `vercel.json` redirects any old `games.lucasz.com/chat-room/…` link there.

## 7. Move the existing pictures into R2

From this `chat-room` folder:

```sh
cp .env.example .env.local      # fill in every value, including the two CHAT_OWNER_* lines
npm install
npm run migrate-images -- --dry-run   # lists what it would move
npm run migrate-images                # moves it
```

Safe to re-run: anything already in R2 is skipped, and each swap only happens
if the picture hasn't changed since it was read.

---

## Now and then: tidy R2

Deleting a message, the 500-message trim, clearing a chat and changing an
avatar all drop the database row but leave the file in R2. Those files are
already unreachable — nothing will sign a link to a key the database no longer
holds — so this only reclaims space:

```sh
npm run sweep-r2              # lists unreferenced files over an hour old
npm run sweep-r2 -- --delete  # deletes them
```

## Afterwards: stop accepting inline pictures

Once step 7 reports nothing left to move, `chat_image_ok()` in `schema.sql` no
longer needs its `data:image/%` branch. Deleting that line and re-running the
schema makes R2 the only way a picture can be stored.
