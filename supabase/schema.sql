-- Cozy Acres online play: tables, security rules and server functions for Supabase.
--
-- How to use: open your Supabase project, go to "SQL Editor", paste this whole file and press "Run".
-- It is safe to run again later (for example after an update): it only creates what is missing and
-- replaces the functions and policies.
--
-- Trust model (cozy co-op, not competitive): coins and items live in each player's own save, so the
-- game does the "escrow" (it removes items before listing them, takes coins before buying and refunds
-- if a call fails). The server guarantees the shared parts are fair and atomic:
--   * a listing sells once, a gift is claimed once, sale earnings are collected once
--   * you can only write your own profile, claim gifts sent to you, and cancel/collect your own listings
--   * friend codes are made here and are unique
-- Every write goes through the security definer functions below, which check who is calling
-- (auth.uid()) and validate and limit what they send. Clients can read, but never write tables directly.
--
-- Accounts: players start with an anonymous sign-in. "Sign in with Google" links Google to that same
-- account (same id), which can then keep a cloud save (cloud_saves). delete_my_account() removes
-- everything belonging to the caller.

-- ------------------------------------------------------------------------------------------ tables

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  code        text not null unique check (code ~ '^[A-Z0-9]{3}-[A-Z0-9]{3}$'),
  name        text not null default 'Farmer' check (char_length(name) between 1 and 24),
  farm_name   text check (farm_name is null or char_length(farm_name) <= 32),
  level       integer not null default 1 check (level between 1 and 999),
  total_xp    bigint not null default 0 check (total_xp >= 0),
  farm_value  bigint not null default 0 check (farm_value >= 0),
  charm       integer not null default 0 check (charm >= 0),
  weekly_xp   integer not null default 0 check (weekly_xp >= 0),
  -- Monday (UTC) of the week weekly_xp belongs to; the weekly leaderboard only shows the current week
  week_start  date not null default (date_trunc('week', now() at time zone 'utc'))::date,
  look        jsonb not null default '{}'::jsonb check (jsonb_typeof(look) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.gifts (
  id          uuid primary key default gen_random_uuid(),
  from_id     uuid not null references public.profiles (id) on delete cascade,
  from_name   text not null,
  to_id       uuid not null references public.profiles (id) on delete cascade,
  items       jsonb not null default '{}'::jsonb check (jsonb_typeof(items) = 'object'),
  coins       integer not null default 0 check (coins between 0 and 100000),
  message     text check (message is null or char_length(message) <= 140),
  sent_at     timestamptz not null default now(),
  claimed     boolean not null default false,
  claimed_at  timestamptz
);

create table if not exists public.listings (
  id          uuid primary key default gen_random_uuid(),
  seller_id   uuid not null references public.profiles (id) on delete cascade,
  seller_name text not null,
  item        text not null check (item ~ '^[a-z0-9_]{1,40}$'),
  qty         integer not null check (qty between 1 and 999),
  price       integer not null check (price between 1 and 1000000),
  listed_at   timestamptz not null default now(),
  status      text not null default 'open' check (status in ('open', 'sold', 'cancelled')),
  buyer_id    uuid references public.profiles (id) on delete set null,
  buyer_name  text,
  sold_at     timestamptz,
  collected   boolean not null default false
);

-- ----------------------------------------------------------------------------------------- indexes

create index if not exists profiles_level_idx      on public.profiles (level desc, total_xp desc);
create index if not exists profiles_value_idx      on public.profiles (farm_value desc);
create index if not exists profiles_charm_idx      on public.profiles (charm desc);
create index if not exists profiles_weekly_idx     on public.profiles (week_start, weekly_xp desc);
create index if not exists gifts_inbox_idx         on public.gifts (to_id, sent_at desc) where not claimed;
create index if not exists gifts_sender_idx        on public.gifts (from_id, sent_at desc);
create index if not exists listings_open_idx       on public.listings (listed_at desc) where status = 'open';
create index if not exists listings_open_item_idx  on public.listings (item, listed_at desc) where status = 'open';
create index if not exists listings_seller_idx     on public.listings (seller_id, status);

-- --------------------------------------------------------------------------- row level security

alter table public.profiles enable row level security;
alter table public.gifts    enable row level security;
alter table public.listings enable row level security;

-- Clients (including anonymous sign-ins, which use the "authenticated" role) may only read.
-- All writes go through the functions below.
revoke all on public.profiles, public.gifts, public.listings from anon, authenticated, public;
grant select on public.profiles, public.gifts, public.listings to authenticated;

drop policy if exists "profiles are public to players" on public.profiles;
create policy "profiles are public to players" on public.profiles
  for select to authenticated using (true);

-- Defence in depth: even if write grants are added later, a player can only touch their own row.
drop policy if exists "players write only their own profile" on public.profiles;
create policy "players write only their own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "gifts visible to sender and receiver" on public.gifts;
create policy "gifts visible to sender and receiver" on public.gifts
  for select to authenticated using (to_id = auth.uid() or from_id = auth.uid());

drop policy if exists "receiver updates own gifts" on public.gifts;
create policy "receiver updates own gifts" on public.gifts
  for update to authenticated using (to_id = auth.uid()) with check (to_id = auth.uid());

drop policy if exists "open listings are public, own listings visible" on public.listings;
create policy "open listings are public, own listings visible" on public.listings
  for select to authenticated using (status = 'open' or seller_id = auth.uid() or buyer_id = auth.uid());

drop policy if exists "sellers update own listings" on public.listings;
create policy "sellers update own listings" on public.listings
  for update to authenticated using (seller_id = auth.uid()) with check (seller_id = auth.uid());

-- ------------------------------------------------------------------------------------- functions

-- A fresh, unused friend code like "KX4-92P" (no 0/O or 1/I so it is easy to read out loud).
create or replace function public.gen_friend_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random() * 32)::integer, 1);
    end loop;
    c := substr(c, 1, 3) || '-' || substr(c, 4, 3);
    exit when not exists (select 1 from public.profiles p where p.code = c);
  end loop;
  return c;
end;
$$;

-- Clean a display name: trim, collapse spaces, drop control characters, max length, fallback.
create or replace function public.clean_text(t text, max_len integer, fallback text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(left(btrim(regexp_replace(regexp_replace(coalesce(t, ''), '[[:cntrl:]]', '', 'g'), '\s+', ' ', 'g')), max_len), ''),
    fallback);
$$;

-- Create or update the caller's public profile. The friend code is made once, on first publish.
create or replace function public.upsert_profile(
  p_name text,
  p_farm_name text,
  p_level integer,
  p_total_xp bigint,
  p_farm_value bigint,
  p_charm integer,
  p_weekly_xp integer,
  p_look jsonb
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_look jsonb;
  r public.profiles;
begin
  if uid is null then raise exception 'not signed in'; end if;
  -- keep only the known look fields, as short strings
  v_look := jsonb_build_object(
    'body',   left(coalesce(p_look ->> 'body', ''), 32),
    'skin',   left(coalesce(p_look ->> 'skin', ''), 32),
    'hair',   left(coalesce(p_look ->> 'hair', ''), 32),
    'top',    left(coalesce(p_look ->> 'top', ''), 32),
    'bottom', left(coalesce(p_look ->> 'bottom', ''), 32),
    'hat',    left(coalesce(p_look ->> 'hat', ''), 32));
  for attempt in 1..5 loop
    begin
      insert into public.profiles as p (id, code, name, farm_name, level, total_xp, farm_value, charm, weekly_xp, week_start, look, updated_at)
      values (
        uid,
        public.gen_friend_code(),
        public.clean_text(p_name, 24, 'Farmer'),
        nullif(public.clean_text(p_farm_name, 32, ''), ''),
        least(greatest(coalesce(p_level, 1), 1), 999),
        least(greatest(coalesce(p_total_xp, 0), 0), 1000000000000),
        least(greatest(coalesce(p_farm_value, 0), 0), 1000000000000),
        least(greatest(coalesce(p_charm, 0), 0), 10000000),
        least(greatest(coalesce(p_weekly_xp, 0), 0), 1000000000),
        (date_trunc('week', now() at time zone 'utc'))::date,
        v_look,
        now())
      on conflict (id) do update set
        name       = excluded.name,
        farm_name  = excluded.farm_name,
        level      = excluded.level,
        total_xp   = excluded.total_xp,
        farm_value = excluded.farm_value,
        charm      = excluded.charm,
        weekly_xp  = excluded.weekly_xp,
        week_start = excluded.week_start,
        look       = excluded.look,
        updated_at = now()
      returning p.* into r;
      return r;
    exception when unique_violation then
      -- two new players drew the same friend code at the same moment: draw again
      if attempt = 5 then raise; end if;
    end;
  end loop;
  return r;
end;
$$;

-- Send a gift (items and/or coins) to another player. The game has already taken them from the
-- sender's save. Limits: up to 10 kinds of items, 999 of each, 100,000 coins, 140 character note,
-- 30 gifts per sender per day, 100 unclaimed gifts waiting per receiver.
create or replace function public.send_gift(p_to uuid, p_items jsonb, p_coins integer, p_message text)
returns public.gifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_name text;
  v_items jsonb := '{}'::jsonb;
  v_kinds integer := 0;
  v_coins integer := coalesce(p_coins, 0);
  v_message text := nullif(public.clean_text(p_message, 140, ''), '');
  k text;
  v jsonb;
  n numeric;
  r public.gifts;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select p.name into v_name from public.profiles p where p.id = uid for update; -- also serialises this sender's sends
  if not found then raise exception 'no profile'; end if;
  if p_to is null or p_to = uid then raise exception 'cannot gift yourself'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_to) then raise exception 'unknown player'; end if;
  if v_coins < 0 or v_coins > 100000 then raise exception 'bad coins'; end if;
  if p_items is not null and jsonb_typeof(p_items) <> 'object' then raise exception 'bad items'; end if;

  for k, v in select e.key, e.value from jsonb_each(coalesce(p_items, '{}'::jsonb)) e loop
    if k !~ '^[a-z0-9_]{1,40}$' or jsonb_typeof(v) <> 'number' then raise exception 'bad items'; end if;
    n := (v #>> '{}')::numeric;
    if n <> floor(n) or n < 1 or n > 999 then raise exception 'bad items'; end if;
    v_kinds := v_kinds + 1;
    if v_kinds > 10 then raise exception 'too many items'; end if;
    v_items := v_items || jsonb_build_object(k, n::integer);
  end loop;
  if v_kinds = 0 and v_coins = 0 then raise exception 'empty gift'; end if;

  if (select count(*) from public.gifts g where g.from_id = uid and g.sent_at > now() - interval '1 day') >= 30 then
    raise exception 'too many gifts today';
  end if;
  if (select count(*) from public.gifts g where g.to_id = p_to and not g.claimed) >= 100 then
    raise exception 'inbox full';
  end if;

  insert into public.gifts (from_id, from_name, to_id, items, coins, message)
  values (uid, v_name, p_to, v_items, v_coins, v_message)
  returning * into r;
  return r;
end;
$$;

-- Claim a gift sent to you, exactly once.
create or replace function public.claim_gift(p_id uuid)
returns public.gifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r public.gifts;
begin
  if uid is null then raise exception 'not signed in'; end if;
  update public.gifts g set claimed = true, claimed_at = now()
   where g.id = p_id and g.to_id = uid and not g.claimed
  returning g.* into r;
  if not found then
    if exists (select 1 from public.gifts g where g.id = p_id and g.to_id = uid) then raise exception 'claimed'; end if;
    raise exception 'not found';
  end if;
  return r;
end;
$$;

-- Put goods on the shared market. Limits: 10 open listings per player, 1-999 items, price 1-1,000,000.
create or replace function public.list_item(p_item text, p_qty integer, p_price integer)
returns public.listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_name text;
  r public.listings;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select p.name into v_name from public.profiles p where p.id = uid for update; -- serialises this seller's listings
  if not found then raise exception 'no profile'; end if;
  if p_item is null or p_item !~ '^[a-z0-9_]{1,40}$' then raise exception 'bad item'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 999 then raise exception 'bad qty'; end if;
  if p_price is null or p_price < 1 or p_price > 1000000 then raise exception 'bad price'; end if;
  if (select count(*) from public.listings l where l.seller_id = uid and l.status = 'open') >= 10 then
    raise exception 'too many listings';
  end if;
  insert into public.listings (seller_id, seller_name, item, qty, price)
  values (uid, v_name, p_item, p_qty, p_price)
  returning * into r;
  return r;
end;
$$;

-- Buy an open listing. Only one buyer can ever win: the update only matches while it is still open.
create or replace function public.buy_listing(p_id uuid)
returns public.listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_name text;
  v_seller uuid;
  r public.listings;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select p.name into v_name from public.profiles p where p.id = uid;
  if not found then raise exception 'no profile'; end if;
  update public.listings l set status = 'sold', buyer_id = uid, buyer_name = v_name, sold_at = now()
   where l.id = p_id and l.status = 'open' and l.seller_id <> uid
  returning l.* into r;
  if not found then
    select l.seller_id into v_seller from public.listings l where l.id = p_id;
    if not found then raise exception 'not found'; end if;
    if v_seller = uid then raise exception 'own listing'; end if;
    raise exception 'sold';
  end if;
  return r;
end;
$$;

-- Take your own open listing off the market (fails with 'sold' if someone bought it first).
create or replace function public.cancel_listing(p_id uuid)
returns public.listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r public.listings;
begin
  if uid is null then raise exception 'not signed in'; end if;
  update public.listings l set status = 'cancelled'
   where l.id = p_id and l.seller_id = uid and l.status = 'open'
  returning l.* into r;
  if not found then
    if exists (select 1 from public.listings l where l.id = p_id and l.seller_id = uid and l.status = 'sold') then raise exception 'sold'; end if;
    raise exception 'not found';
  end if;
  return r;
end;
$$;

-- Collect the coins of your own sold listing, exactly once.
create or replace function public.collect_listing(p_id uuid)
returns public.listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r public.listings;
begin
  if uid is null then raise exception 'not signed in'; end if;
  update public.listings l set collected = true
   where l.id = p_id and l.seller_id = uid and l.status = 'sold' and not l.collected
  returning l.* into r;
  if not found then
    if exists (select 1 from public.listings l where l.id = p_id and l.seller_id = uid and l.status = 'sold') then raise exception 'collected'; end if;
    raise exception 'not found';
  end if;
  return r;
end;
$$;

-- Optional tidy-up of old finished rows. Run it now and then from the SQL editor, or schedule it
-- with the pg_cron extension: select cron.schedule('cozy-cleanup', '0 4 * * *', 'select public.cleanup_old_rows()');
create or replace function public.cleanup_old_rows()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.gifts g where g.claimed and g.claimed_at < now() - interval '30 days';
  delete from public.listings l where (l.status = 'cancelled' and l.listed_at < now() - interval '30 days')
                                   or (l.status = 'sold' and l.collected and l.sold_at < now() - interval '30 days');
$$;

-- Only signed-in players may call the game functions; helpers stay private.
revoke all on function public.gen_friend_code() from public, anon, authenticated;
revoke all on function public.clean_text(text, integer, text) from public, anon, authenticated;
revoke all on function public.cleanup_old_rows() from public, anon, authenticated;
revoke all on function public.upsert_profile(text, text, integer, bigint, bigint, integer, integer, jsonb) from public, anon;
revoke all on function public.send_gift(uuid, jsonb, integer, text) from public, anon;
revoke all on function public.claim_gift(uuid) from public, anon;
revoke all on function public.list_item(text, integer, integer) from public, anon;
revoke all on function public.buy_listing(uuid) from public, anon;
revoke all on function public.cancel_listing(uuid) from public, anon;
revoke all on function public.collect_listing(uuid) from public, anon;
grant execute on function public.upsert_profile(text, text, integer, bigint, bigint, integer, integer, jsonb) to authenticated;
grant execute on function public.send_gift(uuid, jsonb, integer, text) to authenticated;
grant execute on function public.claim_gift(uuid) to authenticated;
grant execute on function public.list_item(text, integer, integer) to authenticated;
grant execute on function public.buy_listing(uuid) to authenticated;
grant execute on function public.cancel_listing(uuid) to authenticated;
grant execute on function public.collect_listing(uuid) to authenticated;

-- ------------------------------------------------------------------------------- cloud saves
-- Players who sign in with Google (Update 3) keep a copy of their whole farm here, so it comes back
-- on another device or in the app. One row per account; only that account can read it. Writes go
-- through save_cloud() below, which refuses anonymous accounts and saves over 512 KB.

create table if not exists public.cloud_saves (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  data         jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 524288),
  save_version integer not null default 1 check (save_version >= 0),
  level        integer not null default 1 check (level between 1 and 999),
  coins        bigint not null default 0 check (coins >= 0),
  updated_at   timestamptz not null default now(),
  device       text check (device is null or char_length(device) <= 60)
);

alter table public.cloud_saves enable row level security;
revoke all on public.cloud_saves from anon, authenticated, public;
grant select on public.cloud_saves to authenticated;

drop policy if exists "players read only their own cloud save" on public.cloud_saves;
create policy "players read only their own cloud save" on public.cloud_saves
  for select to authenticated using (user_id = auth.uid());

-- Defence in depth (clients have no write grants; save_cloud() does the writing).
drop policy if exists "players insert only their own cloud save" on public.cloud_saves;
create policy "players insert only their own cloud save" on public.cloud_saves
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "players update only their own cloud save" on public.cloud_saves;
create policy "players update only their own cloud save" on public.cloud_saves
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Save the caller's farm to the cloud. p_base is the updated_at the device last saw: unless p_force,
-- the save is refused with 'conflict' when the cloud copy changed since (another device saved), so
-- the game can ask the player instead of overwriting. Returns the new updated_at.
create or replace function public.save_cloud(
  p_data jsonb,
  p_save_version integer,
  p_level integer,
  p_coins bigint,
  p_device text,
  p_base timestamptz,
  p_force boolean
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_anon boolean;
  v_cur timestamptz;
  v_at timestamptz;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select coalesce(u.is_anonymous, false) into v_anon from auth.users u where u.id = uid;
  if not found then raise exception 'not signed in'; end if;
  if v_anon then raise exception 'sign in with google first'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'bad save'; end if;
  if octet_length(p_data::text) > 524288 then raise exception 'save too big'; end if;

  select c.updated_at into v_cur from public.cloud_saves c where c.user_id = uid for update;
  if found and not coalesce(p_force, false) and (p_base is null or v_cur <> p_base) then
    raise exception 'conflict';
  end if;
  -- always move forward, so a device's p_base never matches a later save by chance
  v_at := greatest(clock_timestamp(), coalesce(v_cur, '-infinity'::timestamptz) + interval '1 millisecond');

  insert into public.cloud_saves as c (user_id, data, save_version, level, coins, updated_at, device)
  values (
    uid,
    p_data,
    least(greatest(coalesce(p_save_version, 1), 0), 1000000),
    least(greatest(coalesce(p_level, 1), 1), 999),
    least(greatest(coalesce(p_coins, 0), 0), 1000000000000000),
    v_at,
    nullif(public.clean_text(p_device, 60, ''), ''))
  on conflict (user_id) do update set
    data         = excluded.data,
    save_version = excluded.save_version,
    level        = excluded.level,
    coins        = excluded.coins,
    updated_at   = excluded.updated_at,
    device       = excluded.device;
  return v_at;
end;
$$;

-- ---------------------------------------------------------------------------- farm snapshots
-- "Visit a neighbour's farm" (Update 4): a small public picture of each player's farm, just what is
-- needed to draw it (buildings, fields and their growth stage, trees, animals, decorations, land and the
-- farmer's look). No coins, items or anything else from the save. Any signed-in player (anonymous ones
-- too) can read every snapshot; writes only go through publish_farm(), which stores the caller's own
-- row, checks the basic shape and refuses snapshots over 64 KB. One row per player.

create table if not exists public.farm_snapshots (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 65536),
  updated_at timestamptz not null default now()
);

alter table public.farm_snapshots enable row level security;
revoke all on public.farm_snapshots from anon, authenticated, public;
grant select on public.farm_snapshots to authenticated;

drop policy if exists "farm snapshots are public to players" on public.farm_snapshots;
create policy "farm snapshots are public to players" on public.farm_snapshots
  for select to authenticated using (true);

-- Defence in depth (clients have no write grants; publish_farm() does the writing).
drop policy if exists "players insert only their own farm snapshot" on public.farm_snapshots;
create policy "players insert only their own farm snapshot" on public.farm_snapshots
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "players update only their own farm snapshot" on public.farm_snapshots;
create policy "players update only their own farm snapshot" on public.farm_snapshots
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Store the caller's farm snapshot (replacing the previous one). The game publishes at most every few
-- minutes; more than one publish per 10 seconds is refused with 'too soon'. Returns the new updated_at.
create or replace function public.publish_farm(p_data jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_cur timestamptz;
  v_at timestamptz := now();
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'bad farm'; end if;
  if octet_length(p_data::text) > 65536 then raise exception 'farm too big'; end if;
  if coalesce(p_data ->> 'v', '') <> '1'
     or jsonb_typeof(p_data -> 'b') is distinct from 'array'
     or jsonb_typeof(p_data -> 'land') is distinct from 'array'
     or jsonb_typeof(coalesce(p_data -> 'obs', '[]'::jsonb)) <> 'array' then
    raise exception 'bad farm';
  end if;
  if jsonb_array_length(p_data -> 'b') > 1200
     or jsonb_array_length(coalesce(p_data -> 'obs', '[]'::jsonb)) > 600
     or jsonb_array_length(p_data -> 'land') > 36 then
    raise exception 'farm too big';
  end if;

  select f.updated_at into v_cur from public.farm_snapshots f where f.user_id = uid for update;
  if found and v_cur > v_at - interval '10 seconds' then raise exception 'too soon'; end if;

  insert into public.farm_snapshots as f (user_id, data, updated_at)
  values (uid, p_data, v_at)
  on conflict (user_id) do update set
    data       = excluded.data,
    updated_at = excluded.updated_at;
  return v_at;
end;
$$;

revoke all on function public.publish_farm(jsonb) from public, anon;
grant execute on function public.publish_farm(jsonb) to authenticated;

-- ---------------------------------------------------------------------------- account deletion
-- "Delete my online account" in Settings (Google Play requires in-app account deletion).
-- Deleting the auth user cascades: profiles -> gifts sent or received (both directions) and the
-- player's own listings; cloud_saves; farm_snapshots. Listings this player bought from others stay for the seller
-- (buyer_id becomes null) with the buyer's name replaced, so no personal data is left behind.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  update public.listings l set buyer_name = 'A farmer' where l.buyer_id = uid;
  delete from public.gifts g where g.from_id = uid or g.to_id = uid;
  delete from public.listings l where l.seller_id = uid;
  delete from public.cloud_saves c where c.user_id = uid;
  delete from public.farm_snapshots f where f.user_id = uid;
  delete from public.profiles p where p.id = uid;
  delete from auth.users u where u.id = uid;
end;
$$;

revoke all on function public.save_cloud(jsonb, integer, integer, bigint, text, timestamptz, boolean) from public, anon;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.save_cloud(jsonb, integer, integer, bigint, text, timestamptz, boolean) to authenticated;
grant execute on function public.delete_my_account() to authenticated;

-- -------------------------------------------------------------------------------------- realtime

-- Live updates for new gifts and market changes (the game also polls, so this is a bonus).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gifts') then
      alter publication supabase_realtime add table public.gifts;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'listings') then
      alter publication supabase_realtime add table public.listings;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------- helping neighbours
-- "Helping neighbours while visiting" (Update 5). A visitor can help a neighbour's farm once per UTC day
-- (water a growing field, feed an animal home or tend a fruit tree) and like it once per UTC day with an
-- optional guestbook note picked from a preset list (no free text). The owner's game reads its own rows,
-- applies the help to its save (after checking the field, home or tree is still there and still needs
-- it) and marks them claimed with claim_farm_help().
--
-- Rules (enforced in farm_help_add() below): not your own farm, the owner must exist, one help and one
-- like per helper per owner per UTC day, notes only from the preset list, at most 50 rows per owner per
-- day and 200 per helper per day. Owners read their own rows; helpers read rows they created. Clients
-- have no write grants. Deleting either account removes the rows (foreign keys cascade both ways, so
-- delete_my_account() cleans them up through the profile).

create table if not exists public.farm_help (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  helper_id   uuid not null references public.profiles (id) on delete cascade,
  helper_name text not null check (char_length(helper_name) between 1 and 24),
  kind        text not null check (kind in ('water', 'feed', 'tend', 'like')),
  -- the helped building: {"type": "plot", "x": 12, "z": 30} (null for likes)
  target      jsonb check (target is null or (jsonb_typeof(target) = 'object' and octet_length(target::text) <= 200)),
  note        text check (note is null or note in ('lovely', 'flowers', 'thanks', 'market', 'animals', 'cozy')),
  -- the UTC day the row counts for (one help and one like per helper per owner per day)
  day         date not null default ((now() at time zone 'utc')::date),
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  check (owner_id <> helper_id),
  check ((kind = 'like') = (target is null)),
  check (note is null or kind = 'like')
);

create unique index if not exists farm_help_once_a_day_idx on public.farm_help (owner_id, helper_id, day, (kind = 'like'));
create index if not exists farm_help_owner_idx  on public.farm_help (owner_id, created_at desc);
create index if not exists farm_help_owner_day_idx on public.farm_help (owner_id, day);
create index if not exists farm_help_likes_idx  on public.farm_help (owner_id) where kind = 'like';
create index if not exists farm_help_helper_idx on public.farm_help (helper_id, day);

alter table public.farm_help enable row level security;
revoke all on public.farm_help from anon, authenticated, public;
grant select on public.farm_help to authenticated;

drop policy if exists "farm help visible to owner and helper" on public.farm_help;
create policy "farm help visible to owner and helper" on public.farm_help
  for select to authenticated using (owner_id = auth.uid() or helper_id = auth.uid());

-- Internal: add one help or like row with every rule checked. Only called by help_farm() and like_farm().
create or replace function public.farm_help_add(p_helper uuid, p_owner uuid, p_kind text, p_target jsonb, p_note text)
returns public.farm_help
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_name text;
  r public.farm_help;
begin
  if p_helper is null then raise exception 'not signed in'; end if;
  if p_owner is null then raise exception 'unknown player'; end if;
  if p_owner = p_helper then raise exception 'not yourself'; end if;
  select p.name into v_name from public.profiles p where p.id = p_helper;
  if not found then raise exception 'no profile'; end if;
  -- lock the owner's profile row so helpers of one farm take turns (keeps the daily cap exact)
  perform 1 from public.profiles p where p.id = p_owner for update;
  if not found then raise exception 'unknown player'; end if;
  if exists (select 1 from public.farm_help h
             where h.owner_id = p_owner and h.helper_id = p_helper and h.day = v_day and (h.kind = 'like') = (p_kind = 'like')) then
    raise exception 'already today';
  end if;
  if (select count(*) from public.farm_help h where h.owner_id = p_owner and h.day = v_day) >= 50 then
    raise exception 'farm busy';
  end if;
  if (select count(*) from public.farm_help h where h.helper_id = p_helper and h.day = v_day) >= 200 then
    raise exception 'too many today';
  end if;
  insert into public.farm_help (owner_id, helper_id, helper_name, kind, target, note, day)
  values (p_owner, p_helper, public.clean_text(v_name, 24, 'Farmer'), p_kind, p_target, p_note, v_day)
  returning * into r;
  return r;
exception when unique_violation then
  raise exception 'already today';
end;
$$;

-- Help a neighbour's farm: p_kind 'water' | 'feed' | 'tend', p_target {"type", "x", "z"} of the building.
create or replace function public.help_farm(p_owner uuid, p_kind text, p_target jsonb)
returns public.farm_help
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_type text;
  v_x numeric;
  v_z numeric;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_kind is null or p_kind not in ('water', 'feed', 'tend') then raise exception 'bad kind'; end if;
  if p_target is null or jsonb_typeof(p_target) <> 'object'
     or jsonb_typeof(p_target -> 'x') is distinct from 'number'
     or jsonb_typeof(p_target -> 'z') is distinct from 'number' then
    raise exception 'bad target';
  end if;
  v_type := p_target ->> 'type';
  v_x := (p_target ->> 'x')::numeric;
  v_z := (p_target ->> 'z')::numeric;
  if v_type is null or v_type !~ '^[a-z0-9_]{1,40}$'
     or v_x <> trunc(v_x) or v_z <> trunc(v_z) or v_x < 0 or v_z < 0 or v_x > 200 or v_z > 200 then
    raise exception 'bad target';
  end if;
  return public.farm_help_add(uid, p_owner, p_kind,
    jsonb_build_object('type', v_type, 'x', v_x::integer, 'z', v_z::integer), null);
end;
$$;

-- Like a neighbour's farm, with an optional preset guestbook note id (null = just a like).
create or replace function public.like_farm(p_owner uuid, p_note text)
returns public.farm_help
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_note text := nullif(p_note, '');
begin
  if uid is null then raise exception 'not signed in'; end if;
  if v_note is not null and v_note not in ('lovely', 'flowers', 'thanks', 'market', 'animals', 'cozy') then
    raise exception 'bad note';
  end if;
  return public.farm_help_add(uid, p_owner, 'like', null, v_note);
end;
$$;

-- A farm's like count, and whether the caller already helped / liked it today (UTC).
create or replace function public.farm_help_status(p_owner uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_day date := (now() at time zone 'utc')::date;
begin
  if uid is null then raise exception 'not signed in'; end if;
  return jsonb_build_object(
    'likes',  (select count(*) from public.farm_help h where h.owner_id = p_owner and h.kind = 'like'),
    'helped', exists (select 1 from public.farm_help h where h.owner_id = p_owner and h.helper_id = uid and h.day = v_day and h.kind <> 'like'),
    'liked',  exists (select 1 from public.farm_help h where h.owner_id = p_owner and h.helper_id = uid and h.day = v_day and h.kind = 'like'));
end;
$$;

-- The owner marks help on their own farm claimed (each row once). Returns the rows claimed by this call.
-- Also forgets the owner's claimed help (not likes) older than 60 days.
create or replace function public.claim_farm_help(p_ids uuid[])
returns setof public.farm_help
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r public.farm_help;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_ids is null or cardinality(p_ids) > 100 then raise exception 'bad ids'; end if;
  delete from public.farm_help h
   where h.owner_id = uid and h.kind <> 'like' and h.claimed_at is not null and h.created_at < now() - interval '60 days';
  for r in
    update public.farm_help h set claimed_at = now()
     where h.owner_id = uid and h.claimed_at is null and h.id = any (p_ids)
    returning h.*
  loop
    return next r;
  end loop;
  return;
end;
$$;

revoke all on function public.farm_help_add(uuid, uuid, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.help_farm(uuid, text, jsonb) from public, anon;
revoke all on function public.like_farm(uuid, text) from public, anon;
revoke all on function public.farm_help_status(uuid) from public, anon;
revoke all on function public.claim_farm_help(uuid[]) from public, anon;
grant execute on function public.help_farm(uuid, text, jsonb) to authenticated;
grant execute on function public.like_farm(uuid, text) to authenticated;
grant execute on function public.farm_help_status(uuid) to authenticated;
grant execute on function public.claim_farm_help(uuid[]) to authenticated;

-- --------------------------------------------------------------------------- phone notifications
-- "Notifications" in Settings (Update 5, see ONLINE.md "Notifications"). Each device that switched them on
-- has a Web Push subscription here (push_subscriptions). The game plans its own reminders for the next day
-- (crops, animals, goods, truck, stall, daily reward) and replaces the player's future schedule in one call
-- (replace_push_schedule). Gifts and Shared Market sales are added here, by triggers. The Edge Function
-- supabase/functions/send-push sends what is due (every 5 minutes, see push_cron_tick at the end).
-- Clients can only read their own rows; writes go through the functions below. Deleting the account
-- (delete_my_account -> auth.users) removes both tables' rows through the foreign keys (on delete cascade).

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  endpoint    text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh      text not null check (p256dh ~ '^[A-Za-z0-9_-]{20,200}=*$'),
  auth        text not null check (auth ~ '^[A-Za-z0-9_-]{8,100}=*$'),
  -- the device's time zone and quiet hours (minutes after local midnight), for gifts and sales
  tz          text not null default 'UTC' check (char_length(tz) <= 64),
  quiet_start smallint not null default 1260 check (quiet_start between 0 and 1439),
  quiet_end   smallint not null default 480 check (quiet_end between 0 and 1439),
  -- gifts and Shared Market sales wanted on this device
  social      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  last_ok_at  timestamptz
);

create table if not exists public.push_schedule (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  fire_at    timestamptz not null,
  kind       text not null check (kind ~ '^[a-z]{1,16}$'),
  title      text not null check (char_length(title) between 1 and 80),
  body       text not null check (char_length(body) between 1 and 200),
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  -- what the sender did: sent, skipped (daily limit), stale (too late), failed (no device took it)
  status     text check (status is null or status in ('sent', 'skipped', 'stale', 'failed'))
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
create index if not exists push_schedule_due_idx       on public.push_schedule (fire_at) where sent_at is null;
create index if not exists push_schedule_user_idx      on public.push_schedule (user_id, fire_at);

alter table public.push_subscriptions enable row level security;
alter table public.push_schedule      enable row level security;
revoke all on public.push_subscriptions, public.push_schedule from anon, authenticated, public;
grant select on public.push_subscriptions, public.push_schedule to authenticated;

drop policy if exists "players read only their own push subscriptions" on public.push_subscriptions;
create policy "players read only their own push subscriptions" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "players read only their own push schedule" on public.push_schedule;
create policy "players read only their own push schedule" on public.push_schedule
  for select to authenticated using (user_id = auth.uid());

-- The first moment at or after p_at that is outside the quiet hours p_qs..p_qe (minutes, local time in p_tz).
create or replace function public.push_after_quiet(p_at timestamptz, p_tz text, p_qs integer, p_qe integer)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local timestamp;
  v_min integer;
  v_end timestamp;
begin
  if p_qs is null or p_qe is null or p_qs = p_qe then return p_at; end if;
  v_local := p_at at time zone coalesce(p_tz, 'UTC');
  v_min := extract(hour from v_local)::integer * 60 + extract(minute from v_local)::integer;
  if (p_qs < p_qe and v_min >= p_qs and v_min < p_qe) or (p_qs > p_qe and (v_min >= p_qs or v_min < p_qe)) then
    v_end := date_trunc('day', v_local) + make_interval(mins => p_qe);
    if v_end <= v_local then v_end := v_end + interval '1 day'; end if;
    return v_end at time zone coalesce(p_tz, 'UTC');
  end if;
  return p_at;
exception when others then
  return p_at; -- unknown time zone: no quiet hours rather than no notification
end;
$$;

-- Save (or move to this account) this device's push subscription and its notification choices.
-- A device belongs to the last account that saved it. At most 10 devices per player (the oldest go).
create or replace function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_tz text,
  p_quiet_start integer,
  p_quiet_end integer,
  p_social boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_tz text := left(coalesce(p_tz, 'UTC'), 64);
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 then raise exception 'bad subscription'; end if;
  if coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_-]{20,200}=*$' or coalesce(p_auth, '') !~ '^[A-Za-z0-9_-]{8,100}=*$' then raise exception 'bad subscription'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_tz) then v_tz := 'UTC'; end if;

  insert into public.push_subscriptions as s (user_id, endpoint, p256dh, auth, tz, quiet_start, quiet_end, social, updated_at)
  values (uid, p_endpoint, p_p256dh, p_auth, v_tz,
          least(greatest(coalesce(p_quiet_start, 1260), 0), 1439), least(greatest(coalesce(p_quiet_end, 480), 0), 1439),
          coalesce(p_social, true), now())
  on conflict (endpoint) do update set
    user_id     = excluded.user_id,
    p256dh      = excluded.p256dh,
    auth        = excluded.auth,
    tz          = excluded.tz,
    quiet_start = excluded.quiet_start,
    quiet_end   = excluded.quiet_end,
    social      = excluded.social,
    updated_at  = now();

  delete from public.push_subscriptions s
   where s.user_id = uid
     and s.id not in (select x.id from public.push_subscriptions x where x.user_id = uid order by x.updated_at desc limit 10);
  return true;
end;
$$;

-- Forget one of the caller's devices (notifications switched off). With no device left, the planned
-- reminders go too. Returns how many devices were removed.
create or replace function public.delete_push_subscription(p_endpoint text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  n integer;
begin
  if uid is null then raise exception 'not signed in'; end if;
  delete from public.push_subscriptions s where s.user_id = uid and s.endpoint = p_endpoint;
  get diagnostics n = row_count;
  if not exists (select 1 from public.push_subscriptions s where s.user_id = uid) then
    delete from public.push_schedule p where p.user_id = uid and p.sent_at is null;
  end if;
  return n;
end;
$$;

-- Replace the caller's planned reminders with p_rows: a JSON array of
-- {"fire_at": "<ISO time>", "kind": "crops", "title": "...", "body": "..."}. Gift, market and test rows
-- (made by the server) are kept. Limits: 30 rows, fire_at from 5 minutes ago to 48 hours ahead (rows
-- outside are skipped, so a device with a wrong clock cannot fill the table), title 80 and body 200
-- characters. Returns how many rows were planned.
create or replace function public.replace_push_schedule(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r jsonb;
  v_at timestamptz;
  v_kind text;
  n integer := 0;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'bad schedule'; end if;
  if jsonb_array_length(p_rows) > 30 then raise exception 'too many notifications'; end if;
  perform 1 from public.profiles p where p.id = uid for update; -- serialises this player's calls (no-op without a profile)

  delete from public.push_schedule p
   where p.user_id = uid and p.sent_at is null and p.kind not in ('gift', 'market', 'test');
  -- tidy up this player's old sent rows
  delete from public.push_schedule p where p.user_id = uid and p.sent_at < now() - interval '2 days';
  if not exists (select 1 from public.push_subscriptions s where s.user_id = uid) then return 0; end if;

  for r in select e.value from jsonb_array_elements(p_rows) e loop
    if jsonb_typeof(r) <> 'object' then raise exception 'bad schedule'; end if;
    v_kind := r ->> 'kind';
    if v_kind is null or v_kind not in ('crops', 'animals', 'goods', 'truck', 'sales', 'daily', 'mixed') then raise exception 'bad schedule'; end if;
    begin
      v_at := (r ->> 'fire_at')::timestamptz;
    exception when others then raise exception 'bad schedule';
    end;
    if v_at is null or v_at < now() - interval '5 minutes' or v_at > now() + interval '48 hours' then continue; end if;
    insert into public.push_schedule (user_id, fire_at, kind, title, body)
    values (uid, v_at, v_kind, public.clean_text(r ->> 'title', 80, 'Cozy Acres'), public.clean_text(r ->> 'body', 200, 'Something is ready on your farm.'));
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- "Send a test" in Settings: one test notification to the caller's devices with the next sender run.
-- At most one every 2 minutes.
create or replace function public.push_test()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.push_subscriptions s where s.user_id = uid) then raise exception 'no device'; end if;
  if exists (select 1 from public.push_schedule p where p.user_id = uid and p.kind = 'test' and p.created_at > now() - interval '2 minutes') then
    raise exception 'too soon';
  end if;
  insert into public.push_schedule (user_id, fire_at, kind, title, body)
  values (uid, now(), 'test', 'Cozy Acres', 'Notifications work! We will let you know when your farm needs you.');
  return now();
end;
$$;

-- Add a server notification (gift, market sale) for a player who has a device that wants them,
-- after their quiet hours. At most one of each kind per 30 minutes: while one is still waiting it
-- becomes the "several" text instead of a second notification.
create or replace function public.push_social(p_user uuid, p_kind text, p_title text, p_body text, p_many_title text, p_many_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.push_subscriptions;
begin
  select x.* into s from public.push_subscriptions x where x.user_id = p_user and x.social order by x.updated_at desc limit 1;
  if not found then return; end if;
  update public.push_schedule p set title = p_many_title, body = p_many_body
   where p.user_id = p_user and p.kind = p_kind and p.sent_at is null;
  if found then return; end if;
  if exists (select 1 from public.push_schedule p where p.user_id = p_user and p.kind = p_kind and p.created_at > now() - interval '30 minutes') then return; end if;
  insert into public.push_schedule (user_id, fire_at, kind, title, body)
  values (p_user, public.push_after_quiet(now(), s.tz, s.quiet_start, s.quiet_end), p_kind,
          public.clean_text(p_title, 80, 'Cozy Acres'), public.clean_text(p_body, 200, 'Something happened on your farm.'));
end;
$$;

-- Triggers on gifts and listings (send_gift and buy_listing are unchanged). A notification problem must
-- never break a gift or a sale, so errors are only logged.
create or replace function public.push_on_gift()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.push_social(new.to_id, 'gift', 'A gift arrived!',
      public.clean_text(new.from_name, 24, 'A neighbour') || ' sent you a gift. Open Cozy Acres to claim it.',
      'Gifts are waiting!', 'Your neighbours sent you gifts. Open Cozy Acres to claim them.');
  exception when others then
    raise warning 'push_on_gift: %', sqlerrm;
  end;
  return new;
end;
$$;

create or replace function public.push_on_sale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'sold' and old.status = 'open' then
    begin
      perform public.push_social(new.seller_id, 'market', 'Sold at the market!',
        public.clean_text(new.buyer_name, 24, 'A farmer') || ' bought your ' || new.qty || ' ' || replace(new.item, '_', ' ')
          || ' for ' || new.price || ' coins. Collect them in the Shared Market.',
        'Sold at the market!', 'Several of your market listings sold. Collect your coins in the Shared Market.');
    exception when others then
      raise warning 'push_on_sale: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists push_on_gift on public.gifts;
create trigger push_on_gift after insert on public.gifts
  for each row execute function public.push_on_gift();
drop trigger if exists push_on_sale on public.listings;
create trigger push_on_sale after update of status on public.listings
  for each row execute function public.push_on_sale();

-- For the sender (Edge Function, service role only): take the due notifications, at most p_limit, and
-- mark them in the same step so two runs never send the same one. Too late (over 3 hours, for example
-- after the sender was paused) = 'stale', not sent. More than 10 sent to a player in 24 hours = 'skipped'.
-- Returns the rows to send now (status 'sent'); the sender sets 'failed' when no device took one.
create or replace function public.claim_due_pushes(p_limit integer default 300)
returns setof public.push_schedule
language sql
security definer
set search_path = ''
as $$
  update public.push_schedule p set sent_at = now(), status = 'stale'
   where p.sent_at is null and p.fire_at < now() - interval '3 hours';
  delete from public.push_schedule p where p.sent_at < now() - interval '3 days';
  with locked as (
    select p.id, p.user_id, p.fire_at
      from public.push_schedule p
     where p.sent_at is null and p.fire_at <= now()
     order by p.fire_at
     limit least(greatest(coalesce(p_limit, 300), 1), 1000)
     for update skip locked
  ), due as (
    select l.id, l.user_id, row_number() over (partition by l.user_id order by l.fire_at, l.id) as nth from locked l
  ), recent as (
    select p.user_id, count(*) as n from public.push_schedule p
     where p.status = 'sent' and p.sent_at > now() - interval '1 day' and p.user_id in (select d.user_id from due d)
     group by p.user_id
  )
  update public.push_schedule p
     set sent_at = now(),
         status = case when coalesce(r.n, 0) + d.nth > 10 then 'skipped' else 'sent' end
    from due d left join recent r on r.user_id = d.user_id
   where p.id = d.id
  returning p.*;
$$;

-- Called every 5 minutes by pg_cron (below): wakes the send-push Edge Function, only when something is due.
-- Needs two Vault secrets (ONLINE.md "Notifications"): cozy_project_url (https://<project>.supabase.co) and
-- cozy_push_secret (the same text as the PUSH_CRON_SECRET Edge Function secret).
create or replace function public.push_cron_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.push_schedule p where p.sent_at is null and p.fire_at <= now()) then return; end if;
  begin
    select d.decrypted_secret into v_url from vault.decrypted_secrets d where d.name = 'cozy_project_url';
    select d.decrypted_secret into v_secret from vault.decrypted_secrets d where d.name = 'cozy_push_secret';
  exception when others then
    v_url := null;
  end;
  if v_url is null or v_url = '' then
    raise warning 'push_cron_tick: add the Vault secret cozy_project_url (see ONLINE.md, Notifications)';
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', coalesce(v_secret, '')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000);
end;
$$;

revoke all on function public.push_after_quiet(timestamptz, text, integer, integer) from public, anon, authenticated;
revoke all on function public.push_social(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.push_on_gift() from public, anon, authenticated;
revoke all on function public.push_on_sale() from public, anon, authenticated;
revoke all on function public.claim_due_pushes(integer) from public, anon, authenticated;
revoke all on function public.push_cron_tick() from public, anon, authenticated;
revoke all on function public.save_push_subscription(text, text, text, text, integer, integer, boolean) from public, anon;
revoke all on function public.delete_push_subscription(text) from public, anon;
revoke all on function public.replace_push_schedule(jsonb) from public, anon;
revoke all on function public.push_test() from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text, integer, integer, boolean) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;
grant execute on function public.replace_push_schedule(jsonb) to authenticated;
grant execute on function public.push_test() to authenticated;
grant execute on function public.claim_due_pushes(integer) to service_role;
-- the sender (service role) also marks failures, removes dead devices and notes when a device last worked
grant select, update, delete on public.push_subscriptions, public.push_schedule to service_role;

-- Every 5 minutes: send what is due. Needs the pg_cron and pg_net extensions (Database > Extensions, or
-- the two "create extension" lines in ONLINE.md). Without them this step is skipped with a notice and
-- nothing else changes; run this file again after enabling them, or use the dashboard Cron instead
-- (Integrations > Cron, ONLINE.md). Running the file again updates the same job.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.schedule('cozy-send-push', '*/5 * * * *', 'select public.push_cron_tick()');
  else
    raise notice 'Phone notifications: pg_cron and pg_net are not both enabled, so the send-push schedule was not created. See ONLINE.md, Notifications.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------- farm transfer codes
-- Support tool: give a player their farm back with a short code (like K7QM-2XPA) instead of a long
-- #farm= link. The developer makes a code in the SQL Editor:
--     select public.make_farm_transfer('<the part after #farm= in a farm link>', 'note, e.g. Mel restore');
-- and the player types it in Settings > Load a farm. A code works for 14 days (up to 5 loads, in case
-- they load it on two devices). Players cannot list or read this table; they can only exchange a code
-- they know for its farm, and wrong guesses are limited to 10 an hour per player.

create table if not exists public.farm_transfers (
  code       text primary key check (code ~ '^[A-Z2-9]{8}$'),
  data       text not null check (data ~ '^[zj]\.[A-Za-z0-9_-]+$' and length(data) <= 2000000),
  note       text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  max_claims integer not null default 5,
  claims     integer not null default 0,
  claimed_at timestamptz
);

create table if not exists public.farm_transfer_tries (
  user_id uuid not null references auth.users (id) on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists farm_transfer_tries_user_at on public.farm_transfer_tries (user_id, at);

alter table public.farm_transfers enable row level security;
alter table public.farm_transfer_tries enable row level security;
revoke all on public.farm_transfers, public.farm_transfer_tries from anon, authenticated, public;

-- Developer only (SQL Editor). Stores farm link data and returns its new code, shown as XXXX-XXXX.
create or replace function public.make_farm_transfer(p_data text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_data text := regexp_replace(coalesce(p_data, ''), '^.*farm=', '');
  v_code text;
  b bytea;
begin
  v_data := regexp_replace(v_data, '[^A-Za-z0-9_.-]', '', 'g');
  v_data := regexp_replace(v_data, '\.+$', '');
  if v_data !~ '^[zj]\.[A-Za-z0-9_-]+$' then raise exception 'that is not farm link data'; end if;
  delete from public.farm_transfers where expires_at < now() - interval '30 days';
  loop
    b := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    v_code := '';
    for i in 0..7 loop v_code := v_code || substr(abc, get_byte(b, i) % 32 + 1, 1); end loop;
    exit when not exists (select 1 from public.farm_transfers t where t.code = v_code);
  end loop;
  insert into public.farm_transfers (code, data, note) values (v_code, v_data, p_note);
  return substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4);
end;
$$;

-- Exchange a code for its farm link data. Spaces, dashes and lower case are fine (codes never use 0, O, 1
-- or I). Returns null when the code is wrong, expired or used up (null, not an error, so the wrong try is
-- kept); raises 'too many tries' after 10 wrong codes in an hour.
create or replace function public.claim_farm_transfer(p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_data text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if (select count(*) from public.farm_transfer_tries t where t.user_id = uid and t.at > now() - interval '1 hour') >= 10 then
    raise exception 'too many tries';
  end if;
  update public.farm_transfers t set claims = t.claims + 1, claimed_at = now()
   where t.code = v_code and t.expires_at > now() and t.claims < t.max_claims
  returning t.data into v_data;
  if v_data is null then
    insert into public.farm_transfer_tries (user_id) values (uid);
    delete from public.farm_transfer_tries t where t.at < now() - interval '1 day';
  end if;
  return v_data;
end;
$$;

revoke all on function public.make_farm_transfer(text, text) from public, anon, authenticated;
revoke all on function public.claim_farm_transfer(text) from public, anon;
grant execute on function public.claim_farm_transfer(text) to authenticated;
