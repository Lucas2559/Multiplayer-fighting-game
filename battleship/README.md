# Battleship — 2 or 3 players, online

A single-file browser game backed by Supabase. No build step, no npm install.

**The 3-player twist:** on your turn you pick *one* square, and it is fired at
**both** opponents at the same coordinate. You see a separate board for each
opponent, so one click can produce a hit on one and a miss on the other. When a
fleet is wiped out that board is crossed off and the last two players carry on
one-on-one.

---

## 1. Set up the database (once)

1. Open your project's SQL Editor:
   <https://supabase.com/dashboard/project/eexzhpmxcrjqbhvqogkw/sql/new>
2. Paste the entire contents of `schema.sql` and hit **Run**.
3. Confirm Realtime is on: **Database → Replication → `supabase_realtime`**
   should list `rooms`, `players` and `shots`. The script adds them, but if your
   project has no `supabase_realtime` publication yet, create it and re-run.

The script is idempotent — re-running it after an edit is safe.

## 2. Play

```sh
npx serve .          # then open the printed http://localhost:3000
```

Opening `index.html` directly off disk mostly works too, but a `file://` origin
blocks the clipboard and can upset the Realtime socket, so a local server is the
smoother path.

One player creates a room and shares the 4-character code (click the code to
copy an invite link). Everyone places their fleet, and the game starts the
moment the last fleet is locked in.

**Controls:** click the grid to drop the highlighted ship · <kbd>R</kbd> or
right-click to rotate · **Random** fills the board for you.

Each class has its own silhouette and colour, drawn as SVG on a layer beneath
the grid: the Carrier has a flight deck and island, the Battleship two gun
turrets and a mast, the Cruiser a funnel, the Submarine a conning tower and
periscope, the Destroyer a single stack. Hit markers sit on top of the hull like
pegs on the real board, and an enemy ship reveals its silhouette when it sinks.

To remove a single ship, hit **Erase** (or <kbd>E</kbd>), then click that ship on
the grid — it highlights in red as you hover so you can see exactly what will go.
Erase mode stays on so you can remove several in a row, and switches itself off
once the board is empty. Clicking a ship in the list picks it back up too, and
**Clear all** wipes the whole board.

## 3. Deploy (optional)

`index.html` is fully static — drag the folder onto Netlify/Vercel/Cloudflare
Pages, or `gh-pages` it. The publishable key is designed to ship in client code;
nothing else needs to move.

---

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole game: UI, state, rules rendering, Supabase client |
| `schema.sql` | Tables, RPCs, RLS policies, Realtime publication |

## How it holds together

**Tables.** `rooms` (code, size, status, whose turn), `players` (seat, name,
alive, hits taken), `shots` (an append-only log: who fired where, and a
`results` array with one entry per target), and `secrets` — the fleet layouts
and session tokens.

**The client never sees a fleet but its own.** `secrets` has RLS enabled and
*zero* policies, so the publishable key cannot touch it at all; only the
`SECURITY DEFINER` functions can. The other three tables are read-only to
clients (needed for Realtime) and have no write policies whatsoever.

**Every move is adjudicated server-side.** `fire()` checks the session token,
that the game is running, that it's your turn and that you haven't already
fired at that square — then walks each living opponent's fleet, records hits,
detects sunk ships and eliminations, advances the turn to the next living seat,
and declares a winner when one fleet is left. A tampered client can't fake a
hit, peek at a layout, or move out of turn.

**Rendering is derived from the shot log.** Each client replays `shots` to paint
every board, so all clients agree by construction. Realtime pushes changes and
the client re-reads `get_state()`; a 3-second poll runs alongside it as a
fallback if Realtime is unavailable.

**Sessions.** Joining mints a token stored in `localStorage`, so a refresh or a
closed tab drops you straight back into your seat.

## RPCs

| Function | Purpose |
| --- | --- |
| `create_room(p_name, p_max)` | New room, seat 0. Returns `{code, token, seat, name}` |
| `join_room(p_code, p_name)` | Take the next free seat |
| `place_ships(p_token, p_ships)` | Validate and lock a fleet; starts the game when all are in |
| `unready(p_token)` | Unlock your fleet while still in the lobby |
| `fire(p_token, p_x, p_y)` | Resolve one shot against every living opponent |
| `get_state(p_code, p_token)` | Full room state, plus *your* fleet only |
| `rematch(p_token)` | Wipe the boards, same room and players |

## Notes and limits

- Rooms are never garbage-collected. If you want that, schedule
  `delete from rooms where created_at < now() - interval '1 day';` as a cron job.
- There's no auth — anyone with a room code can take a free seat. That's
  deliberate for a pass-the-link game.
- Adjacent ships are allowed; the fleet is the standard Carrier 5, Battleship 4,
  Cruiser 3, Submarine 3, Destroyer 2 (17 cells) on a 10×10 grid.
- All shot results are public to everyone in the room. In 3-player that's part
  of the game: you learn about your rivals from the shots they trade.
