-- ============================================================================
-- BATTLESHIP (2-3 players) -- Supabase schema
-- ----------------------------------------------------------------------------
-- Paste this entire file into the Supabase SQL Editor and hit Run.
-- It is idempotent: safe to run again after edits.
--
-- Security model
--   * rooms / players / shots  -> public SELECT (needed for Realtime), no writes
--   * secrets (ships + token)  -> RLS on, ZERO policies => unreachable with the
--                                 publishable key. Only the SECURITY DEFINER
--                                 functions below can read it.
--   * every mutation goes through an RPC that validates the move server-side,
--     so a player cannot fake a hit, peek at a fleet, or move out of turn.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables ---

create table if not exists rooms (
  code         text primary key,
  max_players  int  not null check (max_players in (2, 3)),
  status       text not null default 'lobby'
               check (status in ('lobby', 'playing', 'finished')),
  turn_seat    int  not null default 0,
  winner_seat  int,
  seq          int  not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists players (
  id          uuid primary key default gen_random_uuid(),
  room_code   text not null references rooms(code) on delete cascade,
  seat        int  not null,
  name        text not null,
  ready       boolean not null default false,
  alive       boolean not null default true,
  hits_taken  int  not null default 0,
  created_at  timestamptz not null default now(),
  unique (room_code, seat)
);

-- Never exposed to the client. Holds the session token and the fleet layout.
create table if not exists secrets (
  player_id uuid primary key references players(id) on delete cascade,
  token     uuid not null unique default gen_random_uuid(),
  ships     jsonb,
  hits      text[] not null default '{}'
);

create table if not exists shots (
  id         bigserial primary key,
  room_code  text not null references rooms(code) on delete cascade,
  seq        int  not null,
  shooter    int  not null,
  x          int  not null,
  y          int  not null,
  results    jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists shots_room_idx   on shots(room_code, seq);
create index if not exists players_room_idx on players(room_code);

-- ------------------------------------------------------------- constants ---
-- Standard fleet: 17 cells total on a 10x10 grid.

create or replace function bs_fleet() returns jsonb
language sql immutable as $$
  select '[["Carrier",5],["Battleship",4],["Cruiser",3],["Submarine",3],["Destroyer",2]]'::jsonb;
$$;

create or replace function bs_fleet_cells() returns int
language sql immutable as $$ select 17; $$;

-- Expand one ship {n,x,y,d,l} into its list of "x,y" cells. Raises if off-grid.
create or replace function bs_cells(ship jsonb) returns text[]
language plpgsql immutable as $$
declare out_cells text[] := '{}'; i int; cx int; cy int;
begin
  for i in 0 .. (ship->>'l')::int - 1 loop
    if ship->>'d' = 'h' then
      cx := (ship->>'x')::int + i;  cy := (ship->>'y')::int;
    else
      cx := (ship->>'x')::int;      cy := (ship->>'y')::int + i;
    end if;
    if cx < 0 or cx > 9 or cy < 0 or cy > 9 then
      raise exception 'Ship "%" hangs off the grid', ship->>'n';
    end if;
    out_cells := out_cells || (cx || ',' || cy);
  end loop;
  return out_cells;
end $$;

-- ------------------------------------------------------------------ rpcs ---

create or replace function create_room(p_name text, p_max int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_code text; v_pid uuid; v_tok uuid; v_name text; i int; tries int := 0;
begin
  if p_max not in (2, 3) then raise exception 'Room size must be 2 or 3'; end if;
  v_name := nullif(btrim(p_name), '');
  if v_name is null then raise exception 'Pick a name first'; end if;
  v_name := left(v_name, 16);

  loop
    v_code := '';
    for i in 1 .. 4 loop
      -- no I/O/0/1, so codes are safe to read aloud
      v_code := v_code || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                                 1 + floor(random() * 32)::int, 1);
    end loop;
    exit when not exists (select 1 from rooms where code = v_code);
    tries := tries + 1;
    if tries > 50 then raise exception 'Could not allocate a room code'; end if;
  end loop;

  insert into rooms(code, max_players) values (v_code, p_max);
  insert into players(room_code, seat, name) values (v_code, 0, v_name)
    returning id into v_pid;
  insert into secrets(player_id) values (v_pid) returning token into v_tok;

  return jsonb_build_object('code', v_code, 'token', v_tok, 'seat', 0, 'name', v_name);
end $$;


create or replace function join_room(p_code text, p_name text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_code text; v_max int; v_status text; v_seat int; v_pid uuid; v_tok uuid; v_name text;
begin
  v_code := upper(btrim(coalesce(p_code, '')));
  v_name := nullif(btrim(p_name), '');
  if v_name is null then raise exception 'Pick a name first'; end if;
  v_name := left(v_name, 16);

  select max_players, status into v_max, v_status
    from rooms where code = v_code for update;
  if v_max is null then raise exception 'No room with code %', v_code; end if;
  if v_status <> 'lobby' then raise exception 'That game has already started'; end if;

  select count(*) into v_seat from players where room_code = v_code;
  if v_seat >= v_max then raise exception 'That room is full'; end if;

  if exists (select 1 from players where room_code = v_code and lower(name) = lower(v_name)) then
    v_name := left(v_name, 14) || ' ' || (v_seat + 1);
  end if;

  insert into players(room_code, seat, name) values (v_code, v_seat, v_name)
    returning id into v_pid;
  insert into secrets(player_id) values (v_pid) returning token into v_tok;

  return jsonb_build_object('code', v_code, 'token', v_tok, 'seat', v_seat, 'name', v_name);
end $$;


-- Flip the room to 'playing' once every seat is filled and every fleet is locked.
create or replace function bs_try_start(p_room text) returns void
language plpgsql security definer set search_path = public as $$
declare v_max int; v_n int; v_ready int;
begin
  select max_players into v_max from rooms where code = p_room;
  select count(*), count(*) filter (where ready) into v_n, v_ready
    from players where room_code = p_room;
  if v_n = v_max and v_ready = v_max then
    update rooms set status = 'playing', turn_seat = 0, winner_seat = null
     where code = p_room and status = 'lobby';
  end if;
end $$;


create or replace function place_ships(p_token uuid, p_ships jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_pid uuid; v_room text; v_status text;
        v_all text[] := '{}'; v_c text[]; s jsonb; v_fleet jsonb := bs_fleet(); i int;
begin
  select sec.player_id, p.room_code into v_pid, v_room
    from secrets sec join players p on p.id = sec.player_id
   where sec.token = p_token;
  if v_pid is null then raise exception 'Invalid session'; end if;

  select status into v_status from rooms where code = v_room;
  if v_status <> 'lobby' then raise exception 'Too late to change your fleet'; end if;

  if jsonb_typeof(p_ships) <> 'array' or jsonb_array_length(p_ships) <> 5 then
    raise exception 'You must place all 5 ships';
  end if;

  for i in 0 .. 4 loop
    s := p_ships->i;
    if s->>'n' is distinct from (v_fleet->i->>0)
       or (s->>'l')::int is distinct from (v_fleet->i->1)::int then
      raise exception 'Fleet does not match the standard set';
    end if;
    if coalesce(s->>'d', '') not in ('h', 'v') then raise exception 'Bad orientation'; end if;
    v_c := bs_cells(s);
    if v_all && v_c then raise exception 'Ships overlap'; end if;
    v_all := v_all || v_c;
  end loop;

  update secrets set ships = p_ships, hits = '{}' where player_id = v_pid;
  update players set ready = true, alive = true, hits_taken = 0 where id = v_pid;
  perform bs_try_start(v_room);

  return jsonb_build_object('ok', true);
end $$;


-- One coordinate, fired at EVERY living opponent at once.
create or replace function fire(p_token uuid, p_x int, p_y int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_pid uuid; v_seat int; v_room text; v_status text; v_turn int; v_seq int; v_max int;
  v_cell text; v_results jsonb := '[]'::jsonb;
  t record; v_ships jsonb; v_hits text[]; s jsonb; v_sc text[];
  v_hit boolean; v_sunk text; v_sunk_cells jsonb; v_dead boolean;
  i int; v_alive int; v_next int; v_win int;
begin
  if p_x < 0 or p_x > 9 or p_y < 0 or p_y > 9 then raise exception 'Off the grid'; end if;
  v_cell := p_x || ',' || p_y;

  select sec.player_id, p.seat, p.room_code into v_pid, v_seat, v_room
    from secrets sec join players p on p.id = sec.player_id
   where sec.token = p_token;
  if v_pid is null then raise exception 'Invalid session'; end if;

  select status, turn_seat, seq, max_players
    into v_status, v_turn, v_seq, v_max
    from rooms where code = v_room for update;

  if v_status <> 'playing' then raise exception 'The game is not running'; end if;
  if v_turn <> v_seat then raise exception 'Not your turn'; end if;
  if exists (select 1 from shots
              where room_code = v_room and shooter = v_seat and x = p_x and y = p_y) then
    raise exception 'You already fired at that square';
  end if;

  v_seq := v_seq + 1;

  for t in select p.id, p.seat, p.name
             from players p
            where p.room_code = v_room and p.alive and p.seat <> v_seat
            order by p.seat
  loop
    select ships, hits into v_ships, v_hits from secrets where player_id = t.id for update;
    v_hit := false; v_sunk := null; v_sunk_cells := null; v_dead := false;

    for i in 0 .. jsonb_array_length(coalesce(v_ships, '[]'::jsonb)) - 1 loop
      s := v_ships->i;
      v_sc := bs_cells(s);
      if v_cell = any(v_sc) then
        v_hit := true;
        if not (v_cell = any(v_hits)) then v_hits := v_hits || v_cell; end if;
        if v_hits @> v_sc then
          v_sunk := s->>'n';
          v_sunk_cells := to_jsonb(v_sc);
        end if;
        exit;
      end if;
    end loop;

    if v_hit then
      update secrets set hits = v_hits where player_id = t.id;
      if coalesce(array_length(v_hits, 1), 0) >= bs_fleet_cells() then
        v_dead := true;
        update players set alive = false, hits_taken = bs_fleet_cells() where id = t.id;
      else
        update players set hits_taken = coalesce(array_length(v_hits, 1), 0) where id = t.id;
      end if;
    end if;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'seat', t.seat, 'name', t.name, 'hit', v_hit,
      'sunk', v_sunk, 'cells', v_sunk_cells, 'dead', v_dead));
  end loop;

  insert into shots(room_code, seq, shooter, x, y, results)
       values (v_room, v_seq, v_seat, p_x, p_y, v_results);

  select count(*) into v_alive from players where room_code = v_room and alive;

  if v_alive <= 1 then
    select seat into v_win from players where room_code = v_room and alive limit 1;
    update rooms set status = 'finished', winner_seat = v_win, seq = v_seq where code = v_room;
  else
    v_next := v_seat;
    for i in 1 .. 6 loop
      v_next := (v_next + 1) % v_max;
      exit when exists (select 1 from players
                         where room_code = v_room and seat = v_next and alive);
    end loop;
    update rooms set turn_seat = v_next, seq = v_seq where code = v_room;
  end if;

  return jsonb_build_object('ok', true, 'results', v_results);
end $$;


-- Everything a client needs for one render. Only ever returns YOUR fleet.
create or replace function get_state(p_code text, p_token uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_code text; v_room jsonb; v_players jsonb; v_shots jsonb; v_me jsonb;
begin
  v_code := upper(btrim(coalesce(p_code, '')));
  select to_jsonb(r) into v_room from rooms r where r.code = v_code;
  if v_room is null then raise exception 'Room not found'; end if;

  select coalesce(jsonb_agg(to_jsonb(p) - 'id' order by p.seat), '[]'::jsonb)
    into v_players from players p where p.room_code = v_code;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.seq), '[]'::jsonb)
    into v_shots from shots s where s.room_code = v_code;

  if p_token is not null then
    select jsonb_build_object(
             'seat',  p.seat,
             'name',  p.name,
             'ready', p.ready,
             'alive', p.alive,
             'ships', coalesce(sec.ships, '[]'::jsonb))
      into v_me
      from secrets sec join players p on p.id = sec.player_id
     where sec.token = p_token and p.room_code = v_code;
  end if;

  return jsonb_build_object('room', v_room, 'players', v_players,
                            'shots', v_shots, 'me', v_me);
end $$;


create or replace function unready(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_pid uuid; v_room text; v_status text;
begin
  select sec.player_id, p.room_code into v_pid, v_room
    from secrets sec join players p on p.id = sec.player_id
   where sec.token = p_token;
  if v_pid is null then raise exception 'Invalid session'; end if;

  select status into v_status from rooms where code = v_room;
  if v_status <> 'lobby' then raise exception 'The game has already started'; end if;

  update players set ready = false where id = v_pid;
  return jsonb_build_object('ok', true);
end $$;


create or replace function rematch(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_room text;
begin
  select p.room_code into v_room
    from secrets sec join players p on p.id = sec.player_id
   where sec.token = p_token;
  if v_room is null then raise exception 'Invalid session'; end if;

  delete from shots where room_code = v_room;
  update secrets sec set ships = null, hits = '{}'
    from players p where p.id = sec.player_id and p.room_code = v_room;
  update players set ready = false, alive = true, hits_taken = 0 where room_code = v_room;
  update rooms set status = 'lobby', turn_seat = 0, winner_seat = null, seq = 0
   where code = v_room;

  return jsonb_build_object('ok', true);
end $$;

-- -------------------------------------------------------------------- rls ---

alter table rooms   enable row level security;
alter table players enable row level security;
alter table shots   enable row level security;
alter table secrets enable row level security;  -- deliberately policy-less

drop policy if exists rooms_read   on rooms;
drop policy if exists players_read on players;
drop policy if exists shots_read   on shots;

create policy rooms_read   on rooms   for select using (true);
create policy players_read on players for select using (true);
create policy shots_read   on shots   for select using (true);

grant usage on schema public to anon, authenticated;
grant select on rooms, players, shots to anon, authenticated;
revoke all on secrets from anon, authenticated;

revoke execute on function bs_try_start(text) from public;

grant execute on function create_room(text, int)      to anon, authenticated;
grant execute on function join_room(text, text)       to anon, authenticated;
grant execute on function place_ships(uuid, jsonb)    to anon, authenticated;
grant execute on function fire(uuid, int, int)        to anon, authenticated;
grant execute on function get_state(text, uuid)       to anon, authenticated;
grant execute on function unready(uuid)               to anon, authenticated;
grant execute on function rematch(uuid)               to anon, authenticated;

-- --------------------------------------------------------------- realtime ---

alter table rooms   replica identity full;
alter table players replica identity full;
alter table shots   replica identity full;

do $$
begin
  begin alter publication supabase_realtime add table rooms;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table players; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table shots;   exception when duplicate_object then null; end;
end $$;
