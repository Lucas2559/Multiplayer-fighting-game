# Deploying the hub — Vercel + Cloudflare R2

| Piece | Runs on | Holds |
|---|---|---|
| Every page in this repo | **Vercel** (static) | nothing — just files |
| `api/upload.js`, `api/view.js` | **Vercel** (functions) | the R2 keys, as environment variables |
| Chat pictures and avatars | **Cloudflare R2** (private bucket) | the image files |
| Accounts, chats, messages | **Supabase** (unchanged) | a short `r2:<key>` reference per picture |

Pictures go **browser → R2 directly**. `/api/upload` checks you're logged in and
hands out a link valid for one exact file (its size and type are signed in) for
five minutes. `/api/view` asks the database — *as you* — which pictures you're
allowed to see, and signs one-hour viewing links for only those. The bucket is
never public, so a picture from a private chat can't be opened by someone who
was never in it, even with the code in hand.

Do the steps in order: the old Netlify site keeps working until step 5, and
the migration in step 6 is what finally needs the new site.

---

## 1. Cloudflare R2

Use the same Cloudflare account that already runs `lucasz.com`'s DNS.

1. **R2 → Create bucket.** Any name, e.g. `chat-pictures`. Leave public access **off**.
2. **Bucket → Settings → CORS policy**, paste this (your Vercel URL comes from
   step 2 — come back and add it):
   ```json
   [
     {
       "AllowedOrigins": ["https://games.lucasz.com", "https://YOUR-PROJECT.vercel.app"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["Content-Type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   Only uploads need this. Viewing goes through `<img>` tags, which don't.
3. **R2 → Manage API tokens → Create API token.** Permission *Object Read & Write*,
   scoped to **this bucket only**. Keep the **Access Key ID** and **Secret Access
   Key** — the secret is shown once. Your **Account ID** is on the R2 overview page.

## 2. Vercel

1. **vercel.com → Add New → Project → Import** `Lucas2559/Multiplayer-fighting-game`.
2. Framework preset **Other**. Leave the build command and output directory empty.
3. **Environment Variables** — add all six (`.env.example` lists them):

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | `https://eexzhpmxcrjqbhvqogkw.supabase.co` |
   | `SUPABASE_ANON_KEY` | the `anonKey` from `chat-room/public/config.js` |
   | `R2_ACCOUNT_ID` | from step 1.3 |
   | `R2_ACCESS_KEY_ID` | from step 1.3 |
   | `R2_SECRET_ACCESS_KEY` | from step 1.3 |
   | `R2_BUCKET` | the bucket name from step 1.1 |

4. **Deploy.** Note the `https://….vercel.app` URL and add it to the CORS list in step 1.2.

## 3. Database

Run `chat-room/supabase/schema.sql` in the Supabase SQL Editor. Old inline
pictures keep displaying; new ones are expected to be R2 references.

## 4. Try it on the vercel.app address

Open `https://YOUR-PROJECT.vercel.app/chat-room/public/`, log in, send a photo,
change your avatar. If it fails, the banner says why:

- *"…not configured on the server (missing …)"* → a variable from step 2.3 is missing.
  Changing one needs a **Redeploy** to take effect.
- *"…upload was blocked — the R2 bucket's CORS settings…"* → this exact address isn't
  in the CORS list from step 1.2.
- *"Couldn't reach the picture service"* → you're not on the Vercel site (e.g. still on Netlify).

## 5. Move games.lucasz.com to Vercel

1. **Vercel → Project → Settings → Domains →** add `games.lucasz.com`. Vercel shows
   the DNS record it wants — usually a CNAME to `cname.vercel-dns.com`.
2. **Cloudflare → lucasz.com → DNS →** edit the `games` record. Today it's a CNAME to
   `playful-capybara-iamcool.netlify.app`; change the target to what Vercel showed,
   and set the proxy to **DNS only** (grey cloud) — Vercel issues its own certificate.
3. Wait until Vercel marks the domain valid, then load `games.lucasz.com` and
   check you get the new site (the admin tickbox in the profile dialog is a good tell).

## 6. Move the existing pictures into R2

From the repo folder:

```sh
cp .env.example .env.local      # fill in every value, including the two CHAT_OWNER_* lines
npm install
npm run migrate-images -- --dry-run   # lists what it would move
npm run migrate-images                # moves it
```

Safe to re-run: anything already in R2 is skipped, and each swap only happens
if the picture hasn't changed since it was read. Do this **after** step 5 — the
old Netlify site can't show R2 pictures.

## 7. Retire Netlify

Netlify → the site → **Domain management** → remove `games.lucasz.com`, then
**Site configuration → Delete site**.

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

Once step 6 reports nothing left to move, `chat_image_ok()` in `schema.sql` no
longer needs its `data:image/%` branch. Deleting that line and re-running the
schema makes R2 the only way a picture can be stored.
