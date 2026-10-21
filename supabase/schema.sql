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
-- 1.22 The highest level a total of XP can reach: XP at the start of levels 1 to 60 (levels.json), then the same
-- 62,810 XP for every level after (endless.xpPerLevel 0). validate-data checks this table matches levels.json.
create or replace function public.level_for_xp(p_xp bigint)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_xp >= x.cum[array_length(x.cum, 1)] then least(999, array_length(x.cum, 1) + ((p_xp - x.cum[array_length(x.cum, 1)]) / 62810)::integer)
    else (select max(i) from generate_subscripts(x.cum, 1) i where x.cum[i] <= p_xp)
  end
  from (select array[0,15,42,93,178,303,476,702,987,1377,1892,2557,3392,4422,5677,7182,8967,11057,13492,16297,19507,23157,27282,31922,37107,42882,49282,56352,64127,72652,81967,92122,103157,115117,128052,142007,157032,173177,190487,209017,228817,249937,272437,296367,321777,348727,377272,407467,439372,473047,508747,546587,586697,629217,674287,722057,772697,826377,883277,943587]::bigint[] as cum) x;
$$;

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
  v_prev public.profiles;
  v_week date := (date_trunc('week', now() at time zone 'utc'))::date;
  v_h double precision;
  v_level integer := least(greatest(coalesce(p_level, 1), 1), 999);
  v_xp bigint := least(greatest(coalesce(p_total_xp, 0), 0), 1000000000000);
  v_value bigint := least(greatest(coalesce(p_farm_value, 0), 0), 1000000000000);
  v_charm integer := least(greatest(coalesce(p_charm, 0), 0), 10000000);
  v_weekly integer := least(greatest(coalesce(p_weekly_xp, 0), 0), 1000000000);
  v_cap numeric;
  v_gain numeric;
  v_bx numeric;
  v_bv numeric;
  v_bc numeric;
  v_mv bigint;
  v_mc integer;
  v_why text := '';
  v_far boolean := false;
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
  -- 1.22 plausibility. XP, farm value and charm can only grow out of an allowance that refills with time (a token
  -- bucket, so calling often gains nothing), set far above real play (late levels are about 63,000 XP and 2.4 days
  -- each). The level can be no higher than the XP behind it allows, and this week's XP no more than was gained. A
  -- too-fast value is capped (the save itself is never refused) and the reason noted for the dashboard; asking for
  -- over three times the allowance also takes the player off the public leaderboards until a developer looks.
  select * into v_prev from public.profiles x where x.id = uid;
  if found then
    v_h := greatest(extract(epoch from (now() - v_prev.updated_at)) / 3600.0, 0);
    v_bx := least(120000, coalesce(v_prev.lb_xp_budget, 120000) + v_h * 40000);
    v_bv := least(3000000, coalesce(v_prev.lb_value_budget, 3000000) + v_h * 1000000);
    v_bc := least(1000, coalesce(v_prev.lb_charm_budget, 1000) + v_h * 400);
    -- XP only grows: an older save (another device, a restored backup) never lowers the published total or level
    if v_xp < v_prev.total_xp then v_xp := v_prev.total_xp; v_level := greatest(v_level, v_prev.level); end if;
    v_gain := v_xp - v_prev.total_xp;
    if v_gain > v_bx then v_why := v_why || 'xp '; v_far := v_far or v_gain > 3 * v_bx; v_xp := v_prev.total_xp + floor(v_bx); end if;
    v_bx := v_bx - greatest(v_xp - v_prev.total_xp, 0);
    -- farm value and charm can fall and rise again (selling, storing decor): only growth past the highest ever
    -- published uses the allowance
    v_mv := greatest(coalesce(v_prev.lb_value_max, 0), v_prev.farm_value);
    v_mc := greatest(coalesce(v_prev.lb_charm_max, 0), v_prev.charm);
    v_gain := v_value - v_mv;
    if v_gain > v_bv then v_why := v_why || 'farm_value '; v_far := v_far or v_gain > 3 * v_bv; v_value := v_mv + floor(v_bv); end if;
    v_bv := v_bv - greatest(v_value - v_mv, 0);
    v_gain := v_charm - v_mc;
    if v_gain > v_bc then v_why := v_why || 'charm '; v_far := v_far or v_gain > 3 * v_bc; v_charm := v_mc + floor(v_bc); end if;
    v_bc := v_bc - greatest(v_charm - v_mc, 0);
    v_mv := greatest(v_mv, v_value);
    v_mc := greatest(v_mc, v_charm);
    v_cap := (case when v_prev.week_start = v_week then v_prev.weekly_xp else 0 end) + greatest(v_xp - v_prev.total_xp, 0) + 1000;
  else
    -- a new profile: what a long-time player could bring back on a fresh account, no more. A new account already
    -- past level 60 waits off the public boards until a developer looks (Leaderboards page of the dashboard).
    v_far := v_xp > 1006397;
    if v_far then v_why := v_why || 'past level 60 '; end if;
    if v_xp > 3000000 then v_why := v_why || 'xp '; v_xp := 3000000; end if;
    if v_value > 30000000 then v_why := v_why || 'farm_value '; v_value := 30000000; end if;
    if v_charm > 20000 then v_why := v_why || 'charm '; v_charm := 20000; end if;
    v_bx := 0; v_bv := 0; v_bc := 0;
    v_mv := v_value; v_mc := v_charm;
    v_cap := least(v_xp, 6720000);
  end if;
  if v_weekly > v_cap then v_why := v_why || 'weekly_xp '; v_weekly := v_cap; end if;
  if v_level > public.level_for_xp(v_xp) then v_why := v_why || 'level '; v_level := greatest(1, public.level_for_xp(v_xp)); end if;
  for attempt in 1..5 loop
    begin
      insert into public.profiles as p (id, code, name, farm_name, level, total_xp, farm_value, charm, weekly_xp, week_start, look, updated_at,
                                        lb_xp_budget, lb_value_budget, lb_charm_budget, lb_value_max, lb_charm_max, lb_flag, lb_flagged_at, lb_hidden)
      values (
        uid,
        public.gen_friend_code(),
        public.clean_text(p_name, 24, 'Farmer'),
        nullif(public.clean_text(p_farm_name, 32, ''), ''),
        v_level, v_xp, v_value, v_charm, v_weekly,
        v_week,
        v_look,
        now(),
        floor(v_bx), floor(v_bv), floor(v_bc), v_mv, v_mc,
        case when v_why <> '' then left('new profile: ' || trim(v_why), 120) end,
        case when v_why <> '' then now() end,
        v_far)
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
        lb_flag    = case when v_why <> '' then left(trim(v_why) || ' too fast', 120) else p.lb_flag end,
        lb_flagged_at = case when v_why <> '' then now() else p.lb_flagged_at end,
        lb_hidden  = p.lb_hidden or v_far,
        lb_xp_budget = floor(v_bx),
        lb_value_budget = floor(v_bv),
        lb_charm_budget = floor(v_bc),
        lb_value_max = v_mv,
        lb_charm_max = v_mc,
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
  perform public.assert_not_locked(uid);
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
  perform public.assert_not_locked(uid);
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
  perform public.assert_not_locked(uid);
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
  data       jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 262144),
  updated_at timestamptz not null default now()
);

-- 1.28.2: big late-game farms (well over 1,200 paths, fences and decorations) were refused for good, so
-- visitors saw an old picture of the farm and their help missed. The limits are now 256 KB and 3,000
-- buildings (the game also leaves out decorations to fit), and a refusal is written down for the dashboard
-- instead of only failing on the player's phone.
alter table public.farm_snapshots drop constraint if exists farm_snapshots_data_check;
alter table public.farm_snapshots add constraint farm_snapshots_data_check
  check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 262144);

-- The last time each player's farm could not be shared, and why (one row per player, for the dashboard).
create table if not exists public.farm_share_refusals (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  at         timestamptz not null default now(),
  reason     text not null check (char_length(reason) <= 40),
  bytes      integer not null default 0,
  buildings  integer not null default 0,
  times      integer not null default 1
);
alter table public.farm_share_refusals enable row level security;
revoke all on public.farm_share_refusals from anon, authenticated, public;

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
-- minutes; more than one publish per 10 seconds is refused with 'too soon'. Returns the new updated_at, or
-- null when the farm is too big or the wrong shape: then nothing is stored, the reason is written to
-- farm_share_refusals for the dashboard (a raised error would undo that) and the game tries a smaller one.
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
  v_bytes integer;
  v_n integer := 0;
  v_why text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  perform public.assert_not_locked(uid);
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'bad farm'; end if;
  v_bytes := octet_length(p_data::text);
  if jsonb_typeof(p_data -> 'b') = 'array' then v_n := jsonb_array_length(p_data -> 'b'); end if;
  if v_bytes > 262144 then v_why := 'too big (size)';
  elsif coalesce(p_data ->> 'v', '') <> '1'
     or jsonb_typeof(p_data -> 'b') is distinct from 'array'
     or jsonb_typeof(p_data -> 'land') is distinct from 'array'
     or jsonb_typeof(coalesce(p_data -> 'obs', '[]'::jsonb)) <> 'array' then v_why := 'bad shape';
  elsif v_n > 3000 then v_why := 'too big (buildings)';
  elsif jsonb_array_length(coalesce(p_data -> 'obs', '[]'::jsonb)) > 600 then v_why := 'too big (wild plants)';
  elsif jsonb_array_length(p_data -> 'land') > 36 then v_why := 'too big (land)';
  end if;
  if v_why is not null then
    insert into public.farm_share_refusals as r (user_id, at, reason, bytes, buildings)
    values (uid, v_at, v_why, v_bytes, v_n)
    on conflict (user_id) do update set at = excluded.at, reason = excluded.reason, bytes = excluded.bytes,
      buildings = excluded.buildings, times = least(r.times + 1, 1000000);
    return null;
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
  perform public.assert_not_locked(uid);
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
  perform public.assert_not_locked(uid);
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
-- {"fire_at": "<ISO time>", "kind": "crops", "title": "...", "body": "..."}. Gift, market, help and test rows
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
   where p.user_id = uid and p.sent_at is null and p.kind not in ('gift', 'market', 'test', 'news', 'help');
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

-- ---------------------------------------------------------------------------- reward codes
-- Support tool: a short code (like K7QM-2XPA) that gives coins, gems and items, e.g. as an apology after
-- a lost farm. Bigger than player gift codes (500 coins, no gems), so it lives here, where it cannot be
-- forged. The developer makes one in the SQL Editor:
--     select public.make_reward_code(20000);                          -- 20,000 coins, one player
--     select public.make_reward_code(20000, 100, 'Sorry about your farm!');   -- plus 100 gems and a note
-- and the player types it in Friends > Gift codes. One claim per player; a code works for 30 days and
-- for max_claims players (default 1). Wrong guesses share the 10-an-hour limit of farm codes.

create table if not exists public.reward_codes (
  code       text primary key check (code ~ '^[A-Z2-9]{8}$'),
  coins      integer not null default 0 check (coins between 0 and 1000000),
  gems       integer not null default 0 check (gems between 0 and 10000),
  items      jsonb not null default '{}'::jsonb check (jsonb_typeof(items) = 'object'),
  message    text check (length(message) <= 120),
  note       text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  max_claims integer not null default 1,
  claims     integer not null default 0
);

create table if not exists public.reward_claims (
  code    text not null references public.reward_codes (code) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  at      timestamptz not null default now(),
  primary key (code, user_id)
);

alter table public.reward_codes enable row level security;
alter table public.reward_claims enable row level security;
revoke all on public.reward_codes, public.reward_claims from anon, authenticated, public;

-- Developer only (SQL Editor). Returns the new code as XXXX-XXXX.
create or replace function public.make_reward_code(p_coins integer, p_gems integer default 0, p_message text default null,
  p_max_claims integer default 1, p_items jsonb default '{}'::jsonb, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  b bytea;
begin
  loop
    b := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    v_code := '';
    for i in 0..7 loop v_code := v_code || substr(abc, get_byte(b, i) % 32 + 1, 1); end loop;
    exit when not exists (select 1 from public.reward_codes r where r.code = v_code)
          and not exists (select 1 from public.farm_transfers t where t.code = v_code);
  end loop;
  insert into public.reward_codes (code, coins, gems, items, message, max_claims, note)
  values (v_code, coalesce(p_coins, 0), coalesce(p_gems, 0), coalesce(p_items, '{}'::jsonb), p_message, greatest(1, coalesce(p_max_claims, 1)), p_note);
  return substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4);
end;
$$;

-- Claim a reward code once. Returns {coins, gems, items, message}, or null when the code is wrong, expired
-- or used up (null, not an error, so the wrong try is kept). Raises 'already claimed' or 'too many tries'.
create or replace function public.claim_reward_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  r public.reward_codes;
begin
  if uid is null then raise exception 'not signed in'; end if;
  perform public.assert_not_locked(uid);
  if (select count(*) from public.farm_transfer_tries t where t.user_id = uid and t.at > now() - interval '1 hour') >= 10 then
    raise exception 'too many tries';
  end if;
  if exists (select 1 from public.reward_claims c where c.code = v_code and c.user_id = uid) then
    raise exception 'already claimed';
  end if;
  update public.reward_codes rc set claims = rc.claims + 1
   where rc.code = v_code and rc.expires_at > now() and rc.claims < rc.max_claims
  returning rc.* into r;
  if r.code is null then
    insert into public.farm_transfer_tries (user_id) values (uid);
    return null;
  end if;
  insert into public.reward_claims (code, user_id) values (v_code, uid);
  return jsonb_build_object('coins', r.coins, 'gems', r.gems, 'items', r.items, 'message', r.message);
end;
$$;

revoke all on function public.make_reward_code(integer, integer, text, integer, jsonb, text) from public, anon, authenticated;
revoke all on function public.claim_reward_code(text) from public, anon;
grant execute on function public.claim_reward_code(text) to authenticated;

-- ================================================================================= admin dashboard
-- The private dashboard at /admin/ (ADMIN.md). Only Google accounts whose email is in admin_users can use
-- the admin_* functions. admin_users is empty in this file: add your own email once in the SQL Editor
--     insert into public.admin_users (email) values ('you@gmail.com') on conflict do nothing;
-- so it is never written in the (public) repository. Every admin action is written to admin_log.
--
-- New for players: play-time stats (player_days, written by log_activity), gifts from the developer that
-- arrive by themselves (admin_gifts), in-game feedback (feedback), hiding a player from leaderboards
-- (profiles.lb_hidden) and daily farm backups (farm_backups).

create table if not exists public.admin_users (
  email      text primary key check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+$'),
  created_at timestamptz not null default now()
);

create table if not exists public.admin_log (
  id     bigint generated always as identity primary key,
  at     timestamptz not null default now(),
  admin  text not null,
  action text not null,
  target uuid,
  detail jsonb
);
create index if not exists admin_log_at_idx on public.admin_log (at desc);

create table if not exists public.admin_notes (
  id      bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at      timestamptz not null default now(),
  admin   text not null,
  note    text not null check (char_length(note) between 1 and 2000)
);
create index if not exists admin_notes_user_idx on public.admin_notes (user_id, at desc);

-- One row per player per UTC day they played: sessions, minutes (from a heartbeat every few minutes while
-- the game is open), and the platform and game version they used.
create table if not exists public.player_days (
  user_id  uuid not null references auth.users (id) on delete cascade,
  day      date not null,
  sessions integer not null default 0 check (sessions >= 0),
  minutes  integer not null default 0 check (minutes between 0 and 1440),
  platform text check (platform is null or platform in ('android', 'pwa', 'web', 'ios')),
  version  text check (version is null or version ~ '^[0-9A-Za-z.+-]{1,16}$'),
  first_at timestamptz not null default now(),
  last_at  timestamptz not null default now(),
  primary key (user_id, day)
);
create index if not exists player_days_day_idx on public.player_days (day);

-- Gifts from the developer: coins, gems, items and land plots. The game picks them up by itself (no code to
-- type), shows "A gift from Cozy Acres" and adds them to the farm.
create table if not exists public.admin_gifts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  coins      integer not null default 0 check (coins between 0 and 10000000),
  gems       integer not null default 0 check (gems between 0 and 100000),
  items      jsonb not null default '{}'::jsonb check (jsonb_typeof(items) = 'object'),
  land       integer not null default 0 check (land between 0 and 36),
  message    text check (message is null or char_length(message) <= 200),
  created_at timestamptz not null default now(),
  created_by text,
  claimed_at timestamptz
);
create index if not exists admin_gifts_open_idx on public.admin_gifts (user_id) where claimed_at is null;

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete cascade,
  player_name text,
  created_at  timestamptz not null default now(),
  category    text not null check (category in ('bug', 'idea', 'praise', 'other')),
  message     text not null check (char_length(message) between 1 and 2000),
  version     text check (version is null or char_length(version) <= 16),
  platform    text check (platform is null or char_length(platform) <= 16),
  device      text check (device is null or char_length(device) <= 200),
  level       integer,
  status      text not null default 'new' check (status in ('new', 'seen', 'done')),
  admin_note  text check (admin_note is null or char_length(admin_note) <= 2000)
);
create index if not exists feedback_created_idx on public.feedback (created_at desc);

create table if not exists public.farm_backups (
  id       bigint generated always as identity primary key,
  user_id  uuid not null references auth.users (id) on delete cascade,
  taken_at timestamptz not null default now(),
  source   text not null check (source in ('cloud', 'snapshot')),
  name     text,
  level    integer,
  hash     text not null,
  data     jsonb not null check (jsonb_typeof(data) = 'object')
);
create index if not exists farm_backups_user_idx on public.farm_backups (user_id, taken_at desc);
create index if not exists farm_backups_taken_idx on public.farm_backups (taken_at);

alter table public.profiles add column if not exists lb_hidden boolean not null default false;
-- 1.22 leaderboard plausibility checks (upsert_profile): why the last too-fast jump was capped, and when
alter table public.profiles add column if not exists lb_flag text check (lb_flag is null or char_length(lb_flag) <= 120);
alter table public.profiles add column if not exists lb_flagged_at timestamptz;
alter table public.profiles add column if not exists lb_xp_budget bigint;
alter table public.profiles add column if not exists lb_value_budget bigint;
alter table public.profiles add column if not exists lb_charm_budget integer;
-- the highest farm value and charm published so far: only growth past them uses the allowance, so a stale save or
-- decor moved into storage and back never looks like a jump
alter table public.profiles add column if not exists lb_value_max bigint;
alter table public.profiles add column if not exists lb_charm_max integer;

alter table public.admin_users  enable row level security;
alter table public.admin_log    enable row level security;
alter table public.admin_notes  enable row level security;
alter table public.player_days  enable row level security;
alter table public.admin_gifts  enable row level security;
alter table public.feedback     enable row level security;
alter table public.farm_backups enable row level security;
revoke all on public.admin_users, public.admin_log, public.admin_notes, public.player_days, public.admin_gifts,
  public.feedback, public.farm_backups from anon, authenticated, public;
-- players can read only their own developer gifts (the game polls for them)
grant select on public.admin_gifts to authenticated;
drop policy if exists "players read only their own developer gifts" on public.admin_gifts;
create policy "players read only their own developer gifts" on public.admin_gifts
  for select to authenticated using (user_id = auth.uid());

-- --------------------------------------------------------------------------------- player functions

-- Called by the game when a session starts (p_session) and every few minutes while it is open (p_minutes,
-- at most 10 per call and only after 3 quiet minutes, so the numbers cannot be pumped).
create or replace function public.log_activity(p_session boolean, p_minutes integer, p_platform text, p_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_day date := (now() at time zone 'utc')::date;
  v_platform text := case when p_platform in ('android', 'pwa', 'web', 'ios') then p_platform else null end;
  v_version text := case when p_version ~ '^[0-9A-Za-z.+-]{1,16}$' then p_version else null end;
  v_min integer := case when coalesce(p_session, false) then 0 else least(greatest(coalesce(p_minutes, 0), 0), 10) end;
begin
  if uid is null then return; end if;
  insert into public.player_days as d (user_id, day, sessions, minutes, platform, version)
  values (uid, v_day, case when coalesce(p_session, false) then 1 else 0 end, v_min, v_platform, v_version)
  on conflict (user_id, day) do update set
    sessions = d.sessions + case when coalesce(p_session, false) and d.last_at < now() - interval '2 minutes' then 1 else 0 end,
    minutes  = least(1440, d.minutes + case when d.last_at < now() - interval '3 minutes' then v_min else 0 end),
    platform = coalesce(v_platform, d.platform),
    version  = coalesce(v_version, d.version),
    last_at  = case when coalesce(p_session, false) or d.last_at < now() - interval '3 minutes' then now() else d.last_at end;
end;
$$;

-- Mark one of the caller's developer gifts as received, exactly once; returns it (the game then adds it).
create or replace function public.claim_admin_gift(p_id uuid)
returns public.admin_gifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r public.admin_gifts;
begin
  if uid is null then raise exception 'not signed in'; end if;
  update public.admin_gifts g set claimed_at = now()
   where g.id = p_id and g.user_id = uid and g.claimed_at is null
  returning g.* into r;
  if not found then raise exception 'not found'; end if;
  return r;
end;
$$;

-- Settings > Send feedback. At most 10 messages per player per day.
create or replace function public.submit_feedback(p_category text, p_message text, p_version text, p_platform text, p_device text, p_level integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if (select count(*) from public.feedback f where f.user_id = uid and f.created_at > now() - interval '1 day') >= 10 then
    raise exception 'too many';
  end if;
  if p_message is null or char_length(btrim(p_message)) = 0 then raise exception 'empty'; end if;
  insert into public.feedback (user_id, player_name, category, message, version, platform, device, level)
  values (uid, (select p.name from public.profiles p where p.id = uid),
          case when p_category in ('bug', 'idea', 'praise', 'other') then p_category else 'other' end,
          left(btrim(p_message), 2000), left(p_version, 16), left(p_platform, 16), left(p_device, 200),
          least(greatest(coalesce(p_level, 0), 0), 999))
  returning id into v_id;
  return v_id;
end;
$$;

-- Snapshot every farm into farm_backups: the cloud save for Google players, otherwise the public farm
-- layout. Unchanged farms are skipped. Backups older than 60 days are removed, except each player's newest.
create or replace function public.backup_all_farms()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
  m integer := 0;
begin
  with src as (
    select c.user_id, 'cloud'::text as source, c.data, c.level, md5(c.data::text) as hash from public.cloud_saves c
    union all
    select f.user_id, 'snapshot', f.data, coalesce((f.data ->> 'level')::integer, null), md5(f.data::text)
      from public.farm_snapshots f
     where not exists (select 1 from public.cloud_saves c where c.user_id = f.user_id)
  ), fresh as (
    select s.* from src s
     where not exists (select 1 from public.farm_backups b
                        where b.user_id = s.user_id and b.hash = s.hash
                          and b.taken_at = (select max(b2.taken_at) from public.farm_backups b2 where b2.user_id = s.user_id))
  ), ins as (
    insert into public.farm_backups (user_id, source, name, level, hash, data)
    select fr.user_id, fr.source, (select p.name from public.profiles p where p.id = fr.user_id), fr.level, fr.hash, fr.data from fresh fr
    returning 1
  )
  select count(*) into n from ins;
  delete from public.farm_backups b
   where b.taken_at < now() - interval '60 days'
     and b.taken_at < (select max(b2.taken_at) from public.farm_backups b2 where b2.user_id = b.user_id);
  get diagnostics m = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------------- admin helpers

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
     and exists (select 1 from auth.identities i
                   join public.admin_users a on a.email = lower(i.identity_data ->> 'email')
                  where i.user_id = auth.uid() and i.provider = 'google');
$$;

-- Raises 'not admin' unless the caller is an admin; returns their email (for the log).
create or replace function public.admin_guard()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  select lower(i.identity_data ->> 'email') into v_email from auth.identities i
   where i.user_id = auth.uid() and i.provider = 'google' limit 1;
  return v_email;
end;
$$;

create or replace function public.admin_note_log(p_admin text, p_action text, p_target uuid, p_detail jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.admin_log (admin, action, target, detail) values (p_admin, p_action, p_target, p_detail);
$$;

-- Who am I (the dashboard asks first, to show "not an admin" instead of empty pages).
create or replace function public.admin_whoami()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then return jsonb_build_object('admin', false); end if;
  return jsonb_build_object('admin', true, 'email', public.admin_guard());
end;
$$;

-- -------------------------------------------------------------------------------- admin: analytics

create or replace function public.admin_overview(p_days integer default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 90), 7), 365);
  today date := (now() at time zone 'utc')::date;
  out jsonb;
begin
  perform public.admin_guard();
  select jsonb_build_object(
    'generatedAt', now(),
    'players',      (select count(*) from public.profiles),
    'accounts',     (select count(*) from auth.users),
    'anonymousNoFarm', (select count(*) from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id)),
    'google',       (select count(distinct i.user_id) from auth.identities i join public.profiles p on p.id = i.user_id where i.provider = 'google'),
    'cloudSaves',   (select count(*) from public.cloud_saves),
    'snapshots',    (select count(*) from public.farm_snapshots),
    'pushPlayers',  (select count(distinct s.user_id) from public.push_subscriptions s),
    'pushDevices',  (select count(*) from public.push_subscriptions),
    'new1',  (select count(*) from public.profiles p where p.created_at > now() - interval '1 day'),
    'new7',  (select count(*) from public.profiles p where p.created_at > now() - interval '7 days'),
    'new30', (select count(*) from public.profiles p where p.created_at > now() - interval '30 days'),
    'active1',  (select count(distinct d.user_id) from public.player_days d where d.day = today),
    -- rolling 24 hours (last time each player's farm reported in), not the UTC calendar day
    'active24', (select count(distinct d.user_id) from public.player_days d where d.last_at > now() - interval '24 hours'),
    'active7',  (select count(distinct d.user_id) from public.player_days d where d.day > today - 7),
    'active30', (select count(distinct d.user_id) from public.player_days d where d.day > today - 30),
    'seen7',    (select count(*) from public.profiles p where p.updated_at > now() - interval '7 days'),
    'minutes1', (select coalesce(sum(d.minutes), 0) from public.player_days d where d.day = today),
    'minutes7', (select coalesce(sum(d.minutes), 0) from public.player_days d where d.day > today - 7),
    'sessions7', (select coalesce(sum(d.sessions), 0) from public.player_days d where d.day > today - 7),
    'gifts7',   (select count(*) from public.gifts g where g.sent_at > now() - interval '7 days'),
    'listingsOpen', (select count(*) from public.listings l where l.status = 'open'),
    'sales7',   (select count(*) from public.listings l where l.status = 'sold' and l.sold_at > now() - interval '7 days'),
    'helps7',   (select count(*) from public.farm_help h where h.kind <> 'like' and h.created_at > now() - interval '7 days'),
    'likes7',   (select count(*) from public.farm_help h where h.kind = 'like' and h.created_at > now() - interval '7 days'),
    'feedbackNew', (select count(*) from public.feedback f where f.status = 'new'),
    'giftsPending', (select count(*) from public.admin_gifts g where g.claimed_at is null),
    'hidden',   (select count(*) from public.profiles p where p.lb_hidden),
    'lastBackup', (select max(b.taken_at) from public.farm_backups b),
    'backups',  (select count(*) from public.farm_backups),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', g.day, 'active', coalesce(a.active, 0), 'minutes', coalesce(a.minutes, 0),
               'sessions', coalesce(a.sessions, 0), 'new', coalesce(n.new, 0)) order by g.day), '[]'::jsonb)
        from (select (today - i) as day from generate_series(0, v_days - 1) i) g
        left join (select d.day, count(*) as active, sum(d.minutes) as minutes, sum(d.sessions) as sessions
                     from public.player_days d where d.day > today - v_days group by d.day) a on a.day = g.day
        left join (select (p.created_at at time zone 'utc')::date as day, count(*) as new
                     from public.profiles p where p.created_at > now() - make_interval(days => v_days) group by 1) n on n.day = g.day),
    'levels', (select coalesce(jsonb_agg(jsonb_build_object('level', x.level, 'n', x.n) order by x.level), '[]'::jsonb)
                 from (select p.level, count(*) as n from public.profiles p group by p.level) x),
    'platforms', (select coalesce(jsonb_agg(jsonb_build_object('platform', x.platform, 'n', x.n) order by x.n desc), '[]'::jsonb)
                    from (select coalesce(l.platform, 'unknown') as platform, count(*) as n
                            from (select distinct on (d.user_id) d.user_id, d.platform from public.player_days d
                                   where d.day > today - 30 order by d.user_id, d.day desc) l group by 1) x),
    'versions', (select coalesce(jsonb_agg(jsonb_build_object('version', x.version, 'n', x.n) order by x.n desc), '[]'::jsonb)
                   from (select coalesce(l.version, 'unknown') as version, count(*) as n
                           from (select distinct on (d.user_id) d.user_id, d.version from public.player_days d
                                  where d.day > today - 7 order by d.user_id, d.day desc) l group by 1) x),
    'weekdays', (select coalesce(jsonb_agg(jsonb_build_object('dow', x.dow, 'active', x.active, 'minutes', x.minutes) order by x.dow), '[]'::jsonb)
                   from (select extract(isodow from d.day)::integer as dow, count(*) as active, sum(d.minutes) as minutes
                           from public.player_days d where d.day > today - 56 group by 1) x),
    'cohorts', (select coalesce(jsonb_agg(c order by c ->> 'week' desc), '[]'::jsonb) from (
                  select jsonb_build_object(
                    'week', w.week,
                    'size', count(*),
                    'd1',  count(*) filter (where exists (select 1 from public.player_days d where d.user_id = w.id and d.day = w.start + 1)),
                    'd7',  count(*) filter (where exists (select 1 from public.player_days d where d.user_id = w.id and d.day between w.start + 7 and w.start + 13)),
                    'd14', count(*) filter (where exists (select 1 from public.player_days d where d.user_id = w.id and d.day >= w.start + 14)),
                    'eligible1',  count(*) filter (where w.start + 1 <= today),
                    'eligible7',  count(*) filter (where w.start + 7 <= today),
                    'eligible14', count(*) filter (where w.start + 14 <= today)) as c
                    from (select p.id, (p.created_at at time zone 'utc')::date as start,
                                 date_trunc('week', p.created_at at time zone 'utc')::date as week
                            from public.profiles p where p.created_at > now() - interval '12 weeks') w
                   group by w.week) cs),
    'tester14', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'code', x.code, 'days', x.days, 'minutes', x.minutes, 'last', x.last, 'platform', x.platform) order by x.days desc, x.minutes desc), '[]'::jsonb)
                   from (select p.id, p.name, p.code, count(d.day) as days, coalesce(sum(d.minutes), 0) as minutes, max(d.day) as last,
                                (array_agg(d.platform order by d.day desc))[1] as platform
                           from public.profiles p join public.player_days d on d.user_id = p.id and d.day > today - 14
                          group by p.id, p.name, p.code) x),
    'top', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'level', x.level, 'charm', x.charm, 'minutes', x.minutes) order by x.minutes desc), '[]'::jsonb)
              from (select p.id, p.name, p.level, p.charm, sum(d.minutes) as minutes
                      from public.profiles p join public.player_days d on d.user_id = p.id and d.day > today - 30
                     group by p.id, p.name, p.level, p.charm order by sum(d.minutes) desc limit 10) x)
  ) into out;
  return out;
end;
$$;

-- -------------------------------------------------------------------------------- admin: players

-- Search and list players. p_filter: all, google, nobackup, active7, inactive14, new7, hidden, gifts.
-- p_sort: last, level, created, name, minutes, days, charm.
create or replace function public.admin_players(p_search text default null, p_filter text default 'all', p_sort text default 'last',
  p_limit integer default 100, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_code text := upper(regexp_replace(coalesce(p_search, ''), '[^A-Za-z0-9]', '', 'g'));
  today date := (now() at time zone 'utc')::date;
  out jsonb;
begin
  perform public.admin_guard();
  with base as (
    select p.id, p.name, p.farm_name, p.code, p.level, p.total_xp, p.farm_value, p.charm, p.created_at, p.updated_at, p.lb_hidden,
           p.weekly_xp, p.lb_flag,
           (public.active_lock(p.id)).id is not null as locked, (public.active_lock(p.id)).until_at as locked_until,
           (select count(*) from public.feedback fb where fb.user_id = p.id and fb.status = 'new') as feedback_new,
           (select lower(i.identity_data ->> 'email') from auth.identities i where i.user_id = p.id and i.provider = 'google' limit 1) as email,
           c.updated_at as cloud_at, c.device as cloud_device,
           f.updated_at as snap_at,
           a.days, a.minutes, a.last_day, a.platform, a.version, a.sessions, a.min7,
           exists (select 1 from public.push_subscriptions s where s.user_id = p.id) as push,
           (select count(*) from public.admin_gifts g where g.user_id = p.id and g.claimed_at is null) as gifts_pending,
           (select count(*) from public.admin_notes n where n.user_id = p.id) as notes
      from public.profiles p
      left join public.cloud_saves c on c.user_id = p.id
      left join public.farm_snapshots f on f.user_id = p.id
      left join lateral (select count(*) as days, coalesce(sum(d.minutes), 0) as minutes, max(d.day) as last_day,
                                coalesce(sum(d.sessions), 0) as sessions,
                                coalesce(sum(d.minutes) filter (where d.day > today - 7), 0) as min7,
                                (array_agg(d.platform order by d.day desc))[1] as platform,
                                (array_agg(d.version order by d.day desc))[1] as version
                           from public.player_days d where d.user_id = p.id) a on true
  ), hit as (
    select b.* from base b
     where (v_q is null or b.name ilike '%' || v_q || '%' or coalesce(b.farm_name, '') ilike '%' || v_q || '%'
            or replace(b.code, '-', '') = v_code or coalesce(b.email, '') ilike '%' || v_q || '%' or b.id::text = v_q)
       and case coalesce(p_filter, 'all')
             when 'google' then b.email is not null
             when 'nobackup' then b.cloud_at is null
             when 'active7' then b.last_day > today - 7
             when 'inactive14' then coalesce(b.last_day, (b.updated_at at time zone 'utc')::date) <= today - 14
             when 'new7' then b.created_at > now() - interval '7 days'
             when 'hidden' then b.lb_hidden
             when 'gifts' then b.gifts_pending > 0
             -- the dashboard's player list (admin player deep dive section)
             when 'online' then b.updated_at > now() - interval '3 minutes'
             when 'today' then b.last_day = today
             when 'flagged' then b.lb_flag is not null
             when 'push' then b.push
             when 'feedback' then b.feedback_new > 0
             when 'regulars' then b.days >= 30
             when 'drifting' then b.days >= 5 and b.last_day <= today - 7 and b.last_day > today - 30
             when 'level60' then b.level >= 60
             when 'notes' then b.notes > 0
             when 'locked' then b.locked
             else true end
  )
  select jsonb_build_object(
    'total', (select count(*) from hit),
    'rows', coalesce((select jsonb_agg(to_jsonb(r)) from (
      select h.* from hit h
       order by case when p_sort = 'level' then h.level end desc nulls last,
                case when p_sort = 'level' then h.total_xp end desc nulls last,
                case when p_sort = 'created' then h.created_at end desc nulls last,
                case when p_sort = 'name' then lower(h.name) end asc nulls last,
                case when p_sort = 'minutes' then h.minutes end desc nulls last,
                case when p_sort = 'days' then h.days end desc nulls last,
                case when p_sort = 'charm' then h.charm end desc nulls last,
                case when p_sort = 'xp' then h.total_xp end desc nulls last,
                case when p_sort = 'value' then h.farm_value end desc nulls last,
                case when p_sort = 'week' then h.weekly_xp end desc nulls last,
                case when p_sort = 'min7' then h.min7 end desc nulls last,
                case when p_sort = 'sessions' then h.sessions end desc nulls last,
                h.updated_at desc
       limit least(greatest(coalesce(p_limit, 100), 1), 5000) offset greatest(coalesce(p_offset, 0), 0)) r), '[]'::jsonb)
  ) into out;
  return out;
end;
$$;

create or replace function public.admin_player(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  out jsonb;
begin
  perform public.admin_guard();
  if not exists (select 1 from auth.users u where u.id = p_id) then raise exception 'not found'; end if;
  select jsonb_build_object(
    'id', p_id,
    'profile', (select to_jsonb(p) from public.profiles p where p.id = p_id),
    'auth', (select jsonb_build_object('created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at, 'is_anonymous', u.is_anonymous,
               'providers', (select coalesce(jsonb_agg(distinct i.provider), '[]'::jsonb) from auth.identities i where i.user_id = u.id),
               'email', (select lower(i.identity_data ->> 'email') from auth.identities i where i.user_id = u.id and i.provider = 'google' limit 1))
             from auth.users u where u.id = p_id),
    'cloud', (select jsonb_build_object('updated_at', c.updated_at, 'device', c.device, 'level', c.level, 'coins', c.coins,
                'save_version', c.save_version, 'bytes', octet_length(c.data::text)) from public.cloud_saves c where c.user_id = p_id),
    'snapshot', (select jsonb_build_object('updated_at', f.updated_at, 'data', f.data) from public.farm_snapshots f where f.user_id = p_id),
    'days', (select coalesce(jsonb_agg(to_jsonb(d) - 'user_id' order by d.day desc), '[]'::jsonb)
               from (select * from public.player_days d where d.user_id = p_id order by d.day desc limit 180) d),
    'giftsSent', (select count(*) from public.gifts g where g.from_id = p_id),
    'giftsReceived', (select count(*) from public.gifts g where g.to_id = p_id),
    'recentGifts', (select coalesce(jsonb_agg(x order by x ->> 'sent_at' desc), '[]'::jsonb) from (
                      select jsonb_build_object('id', g.id, 'from', g.from_name, 'from_id', g.from_id, 'to_id', g.to_id,
                               'to', (select p.name from public.profiles p where p.id = g.to_id), 'items', g.items, 'coins', g.coins,
                               'message', g.message, 'sent_at', g.sent_at, 'claimed', g.claimed) as x
                        from public.gifts g where g.from_id = p_id or g.to_id = p_id order by g.sent_at desc limit 30) y),
    'listings', (select coalesce(jsonb_agg(to_jsonb(l) order by l.listed_at desc), '[]'::jsonb)
                   from (select * from public.listings l where l.seller_id = p_id or l.buyer_id = p_id order by l.listed_at desc limit 30) l),
    'helpGiven', (select count(*) from public.farm_help h where h.helper_id = p_id),
    'helpReceived', (select count(*) from public.farm_help h where h.owner_id = p_id),
    'push', (select jsonb_build_object('devices', count(*), 'last_ok_at', max(s.last_ok_at)) from public.push_subscriptions s where s.user_id = p_id),
    'feedback', (select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at desc), '[]'::jsonb) from public.feedback f where f.user_id = p_id),
    'adminGifts', (select coalesce(jsonb_agg(to_jsonb(g) order by g.created_at desc), '[]'::jsonb) from public.admin_gifts g where g.user_id = p_id),
    'backups', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'taken_at', b.taken_at, 'source', b.source, 'level', b.level,
                  'bytes', octet_length(b.data::text)) order by b.taken_at desc), '[]'::jsonb) from public.farm_backups b where b.user_id = p_id),
    'notes', (select coalesce(jsonb_agg(to_jsonb(n) order by n.at desc), '[]'::jsonb) from public.admin_notes n where n.user_id = p_id)
  ) into out;
  return out;
end;
$$;

-- A player's whole cloud save (Google players), for "Download save file".
create or replace function public.admin_cloud_save(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := public.admin_guard();
  v jsonb;
begin
  select c.data into v from public.cloud_saves c where c.user_id = p_id;
  if v is null then raise exception 'not found'; end if;
  perform public.admin_note_log(v_admin, 'download cloud save', p_id, null);
  return v;
end;
$$;

create or replace function public.admin_backup_data(p_backup bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := public.admin_guard();
  b public.farm_backups;
begin
  select * into b from public.farm_backups x where x.id = p_backup;
  if b.id is null then raise exception 'not found'; end if;
  perform public.admin_note_log(v_admin, 'download backup', b.user_id, jsonb_build_object('backup', p_backup));
  return jsonb_build_object('id', b.id, 'user_id', b.user_id, 'name', b.name, 'source', b.source, 'taken_at', b.taken_at, 'data', b.data);
end;
$$;

-- All the newest backups at once (one per player), for "Download everything".
create or replace function public.admin_backup_bundle()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := public.admin_guard();
  v jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('user_id', b.user_id, 'name', b.name, 'code', (select p.code from public.profiles p where p.id = b.user_id),
           'source', b.source, 'level', b.level, 'taken_at', b.taken_at, 'data', b.data)), '[]'::jsonb)
    into v
    from (select distinct on (x.user_id) x.* from public.farm_backups x order by x.user_id, x.taken_at desc) b;
  perform public.admin_note_log(v_admin, 'download all backups', null, jsonb_build_object('farms', jsonb_array_length(v)));
  return v;
end;
$$;

create or replace function public.admin_backup_now()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := public.admin_guard();
  n integer;
begin
  n := public.backup_all_farms();
  perform public.admin_note_log(v_admin, 'backup all farms', null, jsonb_build_object('new', n));
  return n;
end;
$$;

create or replace function public.admin_backups(p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'count', (select count(*) from public.farm_backups),
    'players', (select count(distinct b.user_id) from public.farm_backups b),
    'bytes', (select coalesce(sum(octet_length(b.data::text)), 0) from public.farm_backups b),
    'last', (select max(b.taken_at) from public.farm_backups b),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'user_id', b.user_id, 'name', b.name, 'source', b.source, 'level', b.level,
               'taken_at', b.taken_at, 'bytes', octet_length(b.data::text)) order by b.taken_at desc), '[]'::jsonb)
             from (select * from public.farm_backups x order by x.taken_at desc limit least(greatest(coalesce(p_limit, 200), 1), 2000)) b));
end;
$$;

create or replace function public.admin_set_hidden(p_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := public.admin_guard();
begin
  update public.profiles p set lb_hidden = coalesce(p_hidden, false) where p.id = p_id;
  if not found then raise exception 'not found'; end if;
  perform public.admin_note_log(v_admin, case when p_hidden then 'hide from leaderboards' else 'show on leaderboards' end, p_id, null);
end;
$$;

create or replace function public.admin_add_note(p_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := public.admin_guard();
begin
  insert into public.admin_notes (user_id, admin, note) values (p_id, v_admin, left(btrim(p_note), 2000));
  perform public.admin_note_log(v_admin, 'add note', p_id, null);
end;
$$;

create or replace function public.admin_delete_note(p_note bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := public.admin_guard();
  v_user uuid;
begin
  delete from public.admin_notes n where n.id = p_note returning n.user_id into v_user;
  perform public.admin_note_log(v_admin, 'delete note', v_user, null);
end;
$$;

-- Delete a player completely (like Settings > Delete my online account, for them). Their farm on their
-- device is not touched; it starts again as a new online account next time they play.
create or replace function public.admin_delete_player(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := public.admin_guard();
  v_who jsonb;
begin
  select jsonb_build_object('name', p.name, 'code', p.code, 'level', p.level) into v_who from public.profiles p where p.id = p_id;
  if not exists (select 1 from auth.users u where u.id = p_id) then raise exception 'not found'; end if;
  update public.listings l set buyer_name = 'A farmer' where l.buyer_id = p_id;
  delete from public.gifts g where g.from_id = p_id or g.to_id = p_id;
  delete from public.listings l where l.seller_id = p_id;
  delete from public.cloud_saves c where c.user_id = p_id;
  delete from public.farm_snapshots f where f.user_id = p_id;
  delete from public.profiles p where p.id = p_id;
  delete from auth.users u where u.id = p_id;
  perform public.admin_note_log(v_admin, 'delete player', null, coalesce(v_who, '{}'::jsonb) || jsonb_build_object('id', p_id));
end;
$$;

-- Remove online accounts that never made a farmer (anonymous sign-ins with no profile) older than p_days.
-- p_dry_run = true only counts them.
create or replace function public.admin_cleanup_accounts(p_days integer, p_dry_run boolean default true)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := public.admin_guard();
  n integer;
begin
  if coalesce(p_dry_run, true) then
    select count(*) into n from auth.users u
     where u.is_anonymous and u.created_at < now() - make_interval(days => greatest(coalesce(p_days, 30), 7))
       and not exists (select 1 from public.profiles p where p.id = u.id);
    return n;
  end if;
  with del as (
    delete from auth.users u
     where u.is_anonymous and u.created_at < now() - make_interval(days => greatest(coalesce(p_days, 30), 7))
       and not exists (select 1 from public.profiles p where p.id = u.id)
    returning 1)
  select count(*) into n from del;
  perform public.admin_note_log(v_admin, 'clean up empty accounts', null, jsonb_build_object('deleted', n, 'days', p_days));
  return n;
end;
$$;

-- -------------------------------------------------------------------------------- admin: gifts

-- Give coins, gems, items and land plots. To p_ids, or (when p_ids is null) to an audience:
-- all, active7, active14, active30, google. Returns how many players get the gift.
create or replace function public.admin_give(p_ids uuid[], p_audience text, p_coins integer, p_gems integer, p_items jsonb, p_land integer, p_message text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := public.admin_guard();
  v_items jsonb := '{}'::jsonb;
  k text;
  v jsonb;
  today date := (now() at time zone 'utc')::date;
  n integer;
begin
  if p_items is not null and jsonb_typeof(p_items) = 'object' then
    for k, v in select * from jsonb_each(p_items) loop
      if k ~ '^[a-z0-9_]{1,40}$' and jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric >= 1 then
        v_items := v_items || jsonb_build_object(k, least(floor((v #>> '{}')::numeric), 100000)::integer);
      end if;
    end loop;
  end if;
  if coalesce(p_coins, 0) <= 0 and coalesce(p_gems, 0) <= 0 and v_items = '{}'::jsonb and coalesce(p_land, 0) <= 0 then
    raise exception 'empty gift';
  end if;
  with who as (
    select p.id from public.profiles p
     where (p_ids is not null and p.id = any (p_ids))
        or (p_ids is null and case coalesce(p_audience, '')
              when 'all' then true
              when 'active7' then exists (select 1 from public.player_days d where d.user_id = p.id and d.day > today - 7)
              when 'active14' then exists (select 1 from public.player_days d where d.user_id = p.id and d.day > today - 14)
              when 'active30' then exists (select 1 from public.player_days d where d.user_id = p.id and d.day > today - 30)
              when 'google' then exists (select 1 from auth.identities i where i.user_id = p.id and i.provider = 'google')
              else false end)
  ), ins as (
    insert into public.admin_gifts (user_id, coins, gems, items, land, message, created_by)
    select w.id, least(greatest(coalesce(p_coins, 0), 0), 10000000), least(greatest(coalesce(p_gems, 0), 0), 100000), v_items,
           least(greatest(coalesce(p_land, 0), 0), 36), nullif(left(btrim(coalesce(p_message, '')), 200), ''), v_admin
      from who w
    returning 1)
  select count(*) into n from ins;
  perform public.admin_note_log(v_admin, 'give gift', case when array_length(p_ids, 1) = 1 then p_ids[1] end,
    jsonb_build_object('players', n, 'audience', coalesce(p_audience, 'chosen'), 'coins', p_coins, 'gems', p_gems, 'items', v_items, 'land', p_land, 'message', p_message));
  return n;
end;
$$;

create or replace function public.admin_gifts_list(p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  return (select coalesce(jsonb_agg(to_jsonb(g) || jsonb_build_object('name', (select p.name from public.profiles p where p.id = g.user_id)) order by g.created_at desc), '[]'::jsonb)
            from (select * from public.admin_gifts x order by x.created_at desc limit least(greatest(coalesce(p_limit, 200), 1), 2000)) g);
end;
$$;

create or replace function public.admin_cancel_gift(p_gift uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := public.admin_guard();
  v_user uuid;
begin
  delete from public.admin_gifts g where g.id = p_gift and g.claimed_at is null returning g.user_id into v_user;
  if v_user is null then raise exception 'not found'; end if;
  perform public.admin_note_log(v_admin, 'cancel gift', v_user, jsonb_build_object('gift', p_gift));
end;
$$;

-- -------------------------------------------------------------------------------- admin: codes

create or replace function public.admin_codes()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'reward', (select coalesce(jsonb_agg(to_jsonb(r) || jsonb_build_object('claimers',
                 (select coalesce(jsonb_agg(jsonb_build_object('id', c.user_id, 'name', (select p.name from public.profiles p where p.id = c.user_id), 'at', c.at)), '[]'::jsonb)
                    from public.reward_claims c where c.code = r.code)) order by r.created_at desc), '[]'::jsonb) from public.reward_codes r),
    'transfers', (select coalesce(jsonb_agg(jsonb_build_object('code', t.code, 'note', t.note, 'created_at', t.created_at, 'expires_at', t.expires_at,
                    'claims', t.claims, 'max_claims', t.max_claims, 'claimed_at', t.claimed_at, 'bytes', length(t.data)) order by t.created_at desc), '[]'::jsonb)
                    from public.farm_transfers t));
end;
$$;

create or replace function public.admin_make_reward_code(p_coins integer, p_gems integer, p_message text, p_max_claims integer, p_items jsonb, p_note text, p_days integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := public.admin_guard();
  v_code text;
begin
  v_code := public.make_reward_code(p_coins, p_gems, nullif(left(btrim(coalesce(p_message, '')), 120), ''), p_max_claims, coalesce(p_items, '{}'::jsonb), p_note);
  update public.reward_codes r set expires_at = now() + make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365))
   where r.code = replace(v_code, '-', '');
  perform public.admin_note_log(v_admin, 'make reward code', null, jsonb_build_object('code', v_code, 'coins', p_coins, 'gems', p_gems, 'max', p_max_claims, 'note', p_note));
  return v_code;
end;
$$;

create or replace function public.admin_make_farm_transfer(p_data text, p_note text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := public.admin_guard();
  v_code text;
begin
  v_code := public.make_farm_transfer(p_data, p_note);
  perform public.admin_note_log(v_admin, 'make farm code', null, jsonb_build_object('code', v_code, 'note', p_note));
  return v_code;
end;
$$;

create or replace function public.admin_delete_code(p_kind text, p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := public.admin_guard();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if p_kind = 'reward' then delete from public.reward_codes r where r.code = v_code;
  elsif p_kind = 'transfer' then delete from public.farm_transfers t where t.code = v_code;
  else raise exception 'bad kind'; end if;
  perform public.admin_note_log(v_admin, 'delete ' || p_kind || ' code', null, jsonb_build_object('code', v_code));
end;
$$;

-- -------------------------------------------------------------------------- admin: feedback, market

create or replace function public.admin_feedback_list(p_status text default null, p_limit integer default 300)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  return (select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at desc), '[]'::jsonb)
            from (select * from public.feedback x where p_status is null or x.status = p_status
                   order by x.created_at desc limit least(greatest(coalesce(p_limit, 300), 1), 2000)) f);
end;
$$;

create or replace function public.admin_feedback_set(p_id uuid, p_status text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := public.admin_guard();
begin
  update public.feedback f set status = coalesce(p_status, f.status), admin_note = coalesce(p_note, f.admin_note) where f.id = p_id;
  if not found then raise exception 'not found'; end if;
  perform public.admin_note_log(v_admin, 'feedback ' || coalesce(p_status, 'note'), null, jsonb_build_object('feedback', p_id));
end;
$$;

create or replace function public.admin_listings(p_status text default 'open', p_limit integer default 300)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'rows', (select coalesce(jsonb_agg(to_jsonb(l) order by l.listed_at desc), '[]'::jsonb)
               from (select * from public.listings x where p_status is null or x.status = p_status
                      order by x.listed_at desc limit least(greatest(coalesce(p_limit, 300), 1), 2000)) l),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('item', x.item, 'sold', x.sold, 'qty', x.qty, 'coins', x.coins, 'avg', x.avg) order by x.coins desc), '[]'::jsonb)
                from (select l.item, count(*) as sold, sum(l.qty) as qty, sum(l.price) as coins, round(avg(l.price::numeric / l.qty), 1) as avg
                        from public.listings l where l.status = 'sold' and l.sold_at > now() - interval '30 days' group by l.item) x));
end;
$$;

-- Take a listing off the market (e.g. a silly price). The seller gets the items back as a developer gift.
create or replace function public.admin_remove_listing(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := public.admin_guard();
  r public.listings;
begin
  update public.listings l set status = 'cancelled' where l.id = p_id and l.status = 'open' returning l.* into r;
  if r.id is null then raise exception 'not open'; end if;
  insert into public.admin_gifts (user_id, items, message, created_by)
  values (r.seller_id, jsonb_build_object(r.item, r.qty),
          left('Your market listing was taken down' || coalesce(': ' || nullif(btrim(p_reason), ''), '.') || ' Here are your items back.', 200), v_admin);
  perform public.admin_note_log(v_admin, 'remove listing', r.seller_id, jsonb_build_object('listing', p_id, 'item', r.item, 'qty', r.qty, 'price', r.price, 'reason', p_reason));
end;
$$;

-- ------------------------------------------------------------------- admin: leaderboards, news, health

create or replace function public.admin_leaderboard(p_kind text, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  return (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'code', p.code, 'level', p.level, 'total_xp', p.total_xp,
            'farm_value', p.farm_value, 'charm', p.charm, 'weekly_xp', p.weekly_xp, 'lb_hidden', p.lb_hidden,
            'lb_flag', p.lb_flag, 'lb_flagged_at', p.lb_flagged_at)), '[]'::jsonb)
            from (select * from public.profiles x
                   where p_kind <> 'weekly' or x.week_start = (date_trunc('week', now() at time zone 'utc'))::date
                   order by case when p_kind = 'level' then x.level end desc nulls last,
                            case when p_kind = 'level' then x.total_xp end desc nulls last,
                            case when p_kind = 'farmValue' then x.farm_value end desc nulls last,
                            case when p_kind = 'charm' then x.charm end desc nulls last,
                            case when p_kind = 'weekly' then x.weekly_xp end desc nulls last
                   limit least(greatest(coalesce(p_limit, 50), 1), 500)) p);
end;
$$;

-- Send a phone notification to every player with notifications on (or only those active in the last
-- 7/14/30 days). Goes out with the next send run (every 5 minutes), within each device's quiet hours rules.
create or replace function public.admin_push_all(p_title text, p_body text, p_audience text default 'all')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := public.admin_guard();
  today date := (now() at time zone 'utc')::date;
  n integer;
begin
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_body), '') = '' then raise exception 'empty'; end if;
  with who as (
    select distinct s.user_id from public.push_subscriptions s
     where case coalesce(p_audience, 'all')
             when 'active7' then exists (select 1 from public.player_days d where d.user_id = s.user_id and d.day > today - 7)
             when 'active14' then exists (select 1 from public.player_days d where d.user_id = s.user_id and d.day > today - 14)
             when 'active30' then exists (select 1 from public.player_days d where d.user_id = s.user_id and d.day > today - 30)
             else true end
  ), ins as (
    insert into public.push_schedule (user_id, fire_at, kind, title, body)
    select w.user_id, now(), 'news', left(btrim(p_title), 80), left(btrim(p_body), 200) from who w
    returning 1)
  select count(*) into n from ins;
  perform public.admin_note_log(v_admin, 'send notification', null, jsonb_build_object('players', n, 'audience', p_audience, 'title', p_title, 'body', p_body));
  return n;
end;
$$;

create or replace function public.admin_push_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'devices', (select count(*) from public.push_subscriptions),
    'players', (select count(distinct s.user_id) from public.push_subscriptions s),
    'workingDevices', (select count(*) from public.push_subscriptions s where s.last_ok_at > now() - interval '14 days'),
    'byStatus', (select coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'status', coalesce(x.status, 'waiting'), 'n', x.n)), '[]'::jsonb)
                   from (select p.kind, p.status, count(*) as n from public.push_schedule p
                          where p.created_at > now() - interval '3 days' group by p.kind, p.status) x));
end;
$$;

create or replace function public.admin_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tables jsonb;
  v_cron jsonb := '[]'::jsonb;
  v_runs jsonb := '[]'::jsonb;
begin
  perform public.admin_guard();
  select coalesce(jsonb_agg(jsonb_build_object('table', c.relname, 'rows', c.reltuples::bigint, 'bytes', pg_total_relation_size(c.oid)) order by pg_total_relation_size(c.oid) desc), '[]'::jsonb)
    into v_tables
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r';
  if to_regclass('cron.job') is not null then
    execute 'select coalesce(jsonb_agg(jsonb_build_object(''name'', jobname, ''schedule'', schedule, ''active'', active)), ''[]''::jsonb) from cron.job' into v_cron;
  end if;
  if to_regclass('cron.job_run_details') is not null then
    execute 'select coalesce(jsonb_agg(x), ''[]''::jsonb) from (select jsonb_build_object(''job'', j.jobname, ''status'', r.status, ''start'', r.start_time, ''message'', left(r.return_message, 200)) as x
               from cron.job_run_details r left join cron.job j on j.jobid = r.jobid
              where r.start_time > now() - interval ''2 days'' and r.status <> ''succeeded'' order by r.start_time desc limit 30) y' into v_runs;
  end if;
  return jsonb_build_object('dbBytes', pg_database_size(current_database()), 'tables', v_tables, 'cron', v_cron, 'cronFailures', v_runs,
    'users', (select count(*) from auth.users), 'anonymousNoFarm', (select count(*) from auth.users u where u.is_anonymous and not exists (select 1 from public.profiles p where p.id = u.id)),
    'emptyOld', (select count(*) from auth.users u where u.is_anonymous and u.created_at < now() - interval '30 days' and not exists (select 1 from public.profiles p where p.id = u.id)));
end;
$$;

create or replace function public.admin_log_list(p_limit integer default 300)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  return (select coalesce(jsonb_agg(to_jsonb(l) || jsonb_build_object('name', (select p.name from public.profiles p where p.id = l.target)) order by l.at desc), '[]'::jsonb)
            from (select * from public.admin_log x order by x.at desc limit least(greatest(coalesce(p_limit, 300), 1), 2000)) l);
end;
$$;

-- ---------------------------------------------------------------------------------- grants and jobs

revoke all on function public.backup_all_farms() from public, anon, authenticated;
revoke all on function public.admin_guard() from public, anon, authenticated;
revoke all on function public.admin_note_log(text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.log_activity(boolean, integer, text, text) from public, anon;
revoke all on function public.claim_admin_gift(uuid) from public, anon;
revoke all on function public.submit_feedback(text, text, text, text, text, integer) from public, anon;
grant execute on function public.log_activity(boolean, integer, text, text) to authenticated;
grant execute on function public.claim_admin_gift(uuid) to authenticated;
grant execute on function public.submit_feedback(text, text, text, text, text, integer) to authenticated;
-- the admin_* functions check admin_guard() themselves; signed-in callers may try them
do $$
declare
  f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like 'admin\_%' or p.proname = 'is_admin')
              and p.proname not in ('admin_guard', 'admin_note_log') loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end;
$$;

-- Daily backup of every farm at 03:17 UTC (needs pg_cron, like the notifications). Without pg_cron, use the
-- dashboard's "Back up all farms now" button.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('cozy-backup-farms', '17 3 * * *', 'select public.backup_all_farms()');
  else
    raise notice 'Farm backups: pg_cron is not enabled, so the daily backup job was not created. Use the dashboard button instead.';
  end if;
end;
$$;

-- ===== 1.8 help =====
-- "Ask a friend" (1.8.0 Village Friends, src/systems/Help.ts). A player who is short of an item asks their
-- friends for 1-10 of it; friends send some with one tap (or their game does it by itself with Auto-help),
-- and the items arrive in the asker's barn by themselves. Same trust model as gifts: the helper's game takes
-- the items out of its barn before fill_help() and puts back whatever the server did not use; the asker's
-- game adds the items of the fills that claim_help_fills() hands it, and the server hands each fill out
-- exactly once.
--
-- Friends live on each device (like gifts), so the server learns them from both sides:
--   * ask_help() stores the asker's friend list with the request (audience, at most 30). Only those players
--     can see the request (friend_help_requests) and fill it (fill_help). set_help_friends() updates it when
--     the asker adds or removes a friend while a request is open.
--   * friend_help_requests() remembers who looks at whose requests (help_watch). A phone notification about
--     a new request only goes to players who are in the audience AND look at the asker's requests, so no one
--     can send notifications to strangers.
-- Rules: qty 1-10, 3 open requests per player, the same item at most once per 8 hours, 10 requests per day,
-- requests stay open 24 hours, a fill never goes past what is still needed and never to your own request,
-- 30 fills per helper per day. Clients only read their own rows; every write goes through the functions.
-- Deleting an account removes its requests, fills and watch rows (on delete cascade through profiles).

create table if not exists public.help_requests (
  id             uuid primary key default gen_random_uuid(),
  requester      uuid not null references public.profiles (id) on delete cascade,
  requester_name text not null check (char_length(requester_name) between 1 and 24),
  item           text not null check (item ~ '^[a-z0-9_]{1,40}$'),
  qty            integer not null check (qty between 1 and 10),
  filled         integer not null default 0 check (filled between 0 and qty),
  reason         text not null default 'other' check (reason in ('order', 'recipe', 'truck', 'visit', 'bundle', 'other')),
  -- the asker's friends when they asked (only they see and fill it)
  audience       uuid[] not null default '{}' check (cardinality(audience) <= 30),
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '24 hours',
  -- when the last item arrived (status filled), or when it was cancelled / expired
  filled_at      timestamptz,
  closed_at      timestamptz,
  -- cancelled because Hazel brought the rest (for the dashboard)
  hazel          boolean not null default false,
  status         text not null default 'open' check (status in ('open', 'filled', 'expired', 'cancelled'))
);

create table if not exists public.help_fills (
  id          uuid primary key default gen_random_uuid(),
  request     uuid not null references public.help_requests (id) on delete cascade,
  requester   uuid not null references public.profiles (id) on delete cascade,
  item        text not null check (item ~ '^[a-z0-9_]{1,40}$'),
  helper      uuid not null references public.profiles (id) on delete cascade,
  helper_name text not null check (char_length(helper_name) between 1 and 24),
  qty         integer not null check (qty between 1 and 10),
  auto        boolean not null default false,
  at          timestamptz not null default now(),
  claimed_at  timestamptz,
  check (helper <> requester)
);

-- who looks at whose requests (see above); refreshed at most twice a day per pair
create table if not exists public.help_watch (
  watcher  uuid not null references public.profiles (id) on delete cascade,
  target   uuid not null references public.profiles (id) on delete cascade,
  seen_at  timestamptz not null default now(),
  primary key (watcher, target),
  check (watcher <> target)
);

create index if not exists help_requests_requester_idx on public.help_requests (requester, created_at desc);
create index if not exists help_requests_open_idx      on public.help_requests (requester) where status = 'open';
create index if not exists help_requests_expiry_idx    on public.help_requests (expires_at) where status = 'open';
create index if not exists help_requests_created_idx   on public.help_requests (created_at);
create index if not exists help_fills_unclaimed_idx    on public.help_fills (requester, at) where claimed_at is null;
create index if not exists help_fills_helper_idx       on public.help_fills (helper, at desc);
create index if not exists help_fills_request_idx      on public.help_fills (request);
create index if not exists help_watch_target_idx       on public.help_watch (target, seen_at);

alter table public.help_requests enable row level security;
alter table public.help_fills    enable row level security;
alter table public.help_watch    enable row level security;
revoke all on public.help_requests, public.help_fills, public.help_watch from anon, authenticated, public;
grant select on public.help_requests, public.help_fills to authenticated;

drop policy if exists "askers read their own help requests" on public.help_requests;
create policy "askers read their own help requests" on public.help_requests
  for select to authenticated using (requester = auth.uid());
drop policy if exists "help fills visible to asker and helper" on public.help_fills;
create policy "help fills visible to asker and helper" on public.help_fills
  for select to authenticated using (requester = auth.uid() or helper = auth.uid());

-- Internal, cheap: mark requests past their 24 hours expired, forget old finished ones (30 days; a fill the
-- asker never collected is kept 60 days) and stale watch rows. Bounded, so it never makes a call slow.
create or replace function public.help_cleanup()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.help_requests r set status = 'expired', closed_at = r.expires_at
   where r.id in (select x.id from public.help_requests x where x.status = 'open' and x.expires_at < now() limit 500);
  delete from public.help_requests r
   where r.id in (select x.id from public.help_requests x
                   where x.status <> 'open' and x.created_at < now() - interval '30 days'
                     and (x.created_at < now() - interval '60 days'
                          or not exists (select 1 from public.help_fills f where f.request = x.id and f.claimed_at is null))
                   limit 500);
  delete from public.help_watch w
   where (w.watcher, w.target) in (select x.watcher, x.target from public.help_watch x where x.seen_at < now() - interval '30 days' limit 500);
end;
$$;

-- Internal: the caller's friend ids, cleaned (real players, not the caller, no repeats, at most 30).
create or replace function public.help_audience(p_uid uuid, p_ids uuid[])
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(x.id), '{}'::uuid[])
    from (select distinct p.id from public.profiles p
           where p.id = any (coalesce(p_ids[1:30], '{}'::uuid[])) and p.id <> p_uid) x;
$$;

-- Ask friends for p_qty (1-10) of p_item. p_reason: order, recipe, truck, visit, bundle or other.
-- p_friends: the asker's friend ids from their device (at most 30). Returns the new request.
create or replace function public.ask_help(p_item text, p_qty integer, p_reason text, p_friends uuid[] default null)
returns public.help_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_name text;
  v_aud uuid[];
  r public.help_requests;
begin
  if uid is null then raise exception 'not signed in'; end if;
  perform public.assert_not_locked(uid);
  select public.clean_text(p.name, 24, 'Farmer') into v_name from public.profiles p where p.id = uid for update; -- serialises this player's asks
  if not found then raise exception 'no profile'; end if;
  if p_item is null or p_item !~ '^[a-z0-9_]{1,40}$' then raise exception 'bad item'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 10 then raise exception 'bad qty'; end if;
  if p_reason is null or p_reason not in ('order', 'recipe', 'truck', 'visit', 'bundle', 'other') then raise exception 'bad reason'; end if;
  if p_friends is not null and cardinality(p_friends) > 30 then raise exception 'too many friends'; end if;
  perform public.help_cleanup();
  if (select count(*) from public.help_requests x where x.requester = uid and x.status = 'open' and x.expires_at > now()) >= 3 then
    raise exception 'too many open';
  end if;
  if exists (select 1 from public.help_requests x where x.requester = uid and x.item = p_item and x.created_at > now() - interval '8 hours') then
    raise exception 'asked recently';
  end if;
  if (select count(*) from public.help_requests x where x.requester = uid and x.created_at > now() - interval '1 day') >= 10 then
    raise exception 'too many today';
  end if;
  v_aud := public.help_audience(uid, p_friends);
  insert into public.help_requests (requester, requester_name, item, qty, reason, audience)
  values (uid, v_name, p_item, p_qty, p_reason, v_aud)
  returning * into r;

  -- a phone notification for friends who have the asker on their list too (one per friend per hour, after
  -- their quiet hours). A notification problem never stops the request.
  if cardinality(v_aud) > 0 then
    begin
      insert into public.push_schedule (user_id, fire_at, kind, title, body)
      select s.user_id, public.push_after_quiet(now(), s.tz, s.quiet_start, s.quiet_end), 'help',
             'A friend needs a hand',
             left(v_name || ' is asking for ' || p_qty || ' x ' || replace(p_item, '_', ' ') || '. Open Cozy Acres to send some.', 200)
        from (select distinct on (x.user_id) x.* from public.push_subscriptions x
               where x.user_id = any (v_aud) and x.social order by x.user_id, x.updated_at desc) s
       where exists (select 1 from public.help_watch w where w.watcher = s.user_id and w.target = uid and w.seen_at > now() - interval '14 days')
         and not exists (select 1 from public.push_schedule p where p.user_id = s.user_id and p.kind = 'help' and p.created_at > now() - interval '1 hour');
    exception when others then
      raise warning 'ask_help push: %', sqlerrm;
    end;
  end if;
  return r;
end;
$$;

-- The asker's friend list changed: update who can see their open requests. Returns how many were updated.
create or replace function public.set_help_friends(p_friends uuid[])
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
  if p_friends is not null and cardinality(p_friends) > 30 then raise exception 'too many friends'; end if;
  update public.help_requests r set audience = public.help_audience(uid, p_friends)
   where r.requester = uid and r.status = 'open' and r.expires_at > now();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Cancel your own open request (also used when Hazel brings the rest, p_hazel). Returns it, with how many
-- had arrived by then. Fills that already arrived stay yours (my_help_fills still lists them).
create or replace function public.cancel_help(p_id uuid, p_hazel boolean default false)
returns public.help_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r public.help_requests;
begin
  if uid is null then raise exception 'not signed in'; end if;
  update public.help_requests x set status = 'cancelled', closed_at = now(), hazel = coalesce(p_hazel, false)
   where x.id = p_id and x.requester = uid and x.status = 'open'
  returning x.* into r;
  if not found then
    if exists (select 1 from public.help_requests x where x.id = p_id and x.requester = uid) then raise exception 'not open'; end if;
    raise exception 'not found';
  end if;
  return r;
end;
$$;

-- Open requests of these players (the caller's friends, at most 30 ids) that the caller may help with,
-- with what is still needed. Also notes that the caller looks at these players' requests (help_watch).
create or replace function public.friend_help_requests(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_ids uuid[];
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then return '[]'::jsonb; end if;
  if cardinality(p_ids) > 30 then raise exception 'too many friends'; end if;
  v_ids := public.help_audience(uid, p_ids);
  insert into public.help_watch as w (watcher, target, seen_at)
  select uid, t, now() from unnest(v_ids) t
  on conflict (watcher, target) do update set seen_at = now() where w.seen_at < now() - interval '12 hours';
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'id', r.id, 'requester', r.requester, 'requester_name', r.requester_name, 'item', r.item, 'qty', r.qty,
            'filled', r.filled, 'need', r.qty - r.filled, 'reason', r.reason, 'created_at', r.created_at, 'expires_at', r.expires_at)
            order by r.created_at), '[]'::jsonb)
            from public.help_requests r
           where r.requester = any (v_ids) and r.status = 'open' and r.expires_at > now()
             and r.filled < r.qty and uid = any (r.audience));
end;
$$;

-- Send p_qty (1-10) of the requested item to a friend's request. Never more than is still needed: the
-- returned fill says how many were used (the helper's game puts the rest back). p_auto = sent by Auto-help.
-- Refused: 'not found' (gone, or not one of your friends' requests), 'yourself', 'closed' (filled, expired or
-- cancelled), 'too many today' (30 fills a day).
create or replace function public.fill_help(p_id uuid, p_qty integer, p_auto boolean default false)
returns public.help_fills
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_name text;
  v_take integer;
  r public.help_requests;
  f public.help_fills;
begin
  if uid is null then raise exception 'not signed in'; end if;
  perform public.assert_not_locked(uid);
  if p_qty is null or p_qty < 1 or p_qty > 10 then raise exception 'bad qty'; end if;
  select public.clean_text(p.name, 24, 'Farmer') into v_name from public.profiles p where p.id = uid for update; -- serialises this helper
  if not found then raise exception 'no profile'; end if;
  select x.* into r from public.help_requests x where x.id = p_id for update;
  if not found then raise exception 'not found'; end if;
  if r.requester = uid then raise exception 'yourself'; end if;
  if not (uid = any (r.audience)) then raise exception 'not found'; end if;
  if r.status <> 'open' or r.expires_at <= now() or r.filled >= r.qty then raise exception 'closed'; end if;
  if (select count(*) from public.help_fills x where x.helper = uid and x.at > now() - interval '1 day') >= 30 then
    raise exception 'too many today';
  end if;
  v_take := least(p_qty, r.qty - r.filled);
  insert into public.help_fills (request, requester, item, helper, helper_name, qty, auto)
  values (r.id, r.requester, r.item, uid, v_name, v_take, coalesce(p_auto, false))
  returning * into f;
  update public.help_requests x
     set filled = x.filled + v_take,
         status = case when x.filled + v_take >= x.qty then 'filled' else x.status end,
         filled_at = case when x.filled + v_take >= x.qty then now() else x.filled_at end,
         closed_at = case when x.filled + v_take >= x.qty then now() else x.closed_at end
   where x.id = r.id;
  return f;
end;
$$;

-- Items friends sent to the caller that their game has not added yet (oldest first).
create or replace function public.my_help_fills()
returns setof public.help_fills
language sql
stable
security definer
set search_path = ''
as $$
  select f.* from public.help_fills f
   where f.requester = auth.uid() and f.claimed_at is null
   order by f.at limit 100;
$$;

-- Mark fills of the caller's requests as arrived, each exactly once. Returns only the fills claimed by this
-- call: the caller's game adds exactly these to the barn.
create or replace function public.claim_help_fills(p_ids uuid[])
returns setof public.help_fills
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  f public.help_fills;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_ids is null or cardinality(p_ids) > 100 then raise exception 'bad ids'; end if;
  for f in
    update public.help_fills x set claimed_at = now()
     where x.requester = uid and x.claimed_at is null and x.id = any (p_ids)
    returning x.*
  loop
    return next f;
  end loop;
  return;
end;
$$;

-- Dashboard: Requests page. Totals for the last p_days (7-365), most asked items (a balance hint: what is
-- hard to get), how often and how fast requests fill, the most helpful players and the open requests.
create or replace function public.admin_help_overview(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 7), 365);
  v_since timestamptz;
begin
  perform public.admin_guard();
  perform public.help_cleanup();
  v_since := now() - make_interval(days => v_days);
  return jsonb_build_object(
    'days', v_days,
    'totals', (select jsonb_build_object(
        'asked', count(*),
        'filled', count(*) filter (where r.status = 'filled'),
        'partly', count(*) filter (where r.status <> 'filled' and r.filled > 0),
        'expired', count(*) filter (where r.status = 'expired'),
        'cancelled', count(*) filter (where r.status = 'cancelled' and not r.hazel),
        'hazel', count(*) filter (where r.hazel),
        'open', count(*) filter (where r.status = 'open'),
        'unitsAsked', coalesce(sum(r.qty), 0),
        'unitsGiven', coalesce(sum(r.filled), 0),
        'askers', count(distinct r.requester),
        'avgFillMin', round(coalesce(avg(extract(epoch from (r.filled_at - r.created_at)) / 60) filter (where r.status = 'filled'), 0)::numeric, 1),
        'medianFillMin', round(coalesce((percentile_cont(0.5) within group (order by extract(epoch from (r.filled_at - r.created_at)) / 60)
                                           filter (where r.status = 'filled')), 0)::numeric, 1))
        from public.help_requests r where r.created_at > v_since),
    'fills', (select jsonb_build_object('n', count(*), 'units', coalesce(sum(f.qty), 0), 'auto', count(*) filter (where f.auto),
                                        'helpers', count(distinct f.helper), 'unclaimed', count(*) filter (where f.claimed_at is null))
                from public.help_fills f where f.at > v_since),
    'items', (select coalesce(jsonb_agg(to_jsonb(x) order by x.asked desc, x.units desc), '[]'::jsonb) from (
        select r.item, count(*) as asked, sum(r.qty) as units, sum(r.filled) as given,
               count(*) filter (where r.status = 'filled') as filled, count(distinct r.requester) as players,
               jsonb_object_agg(r.reason, 1) as reasons
          from public.help_requests r where r.created_at > v_since
         group by r.item order by count(*) desc, sum(r.qty) desc limit 30) x),
    'reasons', (select coalesce(jsonb_object_agg(x.reason, x.n), '{}'::jsonb) from (
        select r.reason, count(*) as n from public.help_requests r where r.created_at > v_since group by r.reason) x),
    'helpers', (select coalesce(jsonb_agg(to_jsonb(x) order by x.units desc), '[]'::jsonb) from (
        select f.helper as id, max(f.helper_name) as name, count(*) as fills, sum(f.qty) as units,
               count(*) filter (where f.auto) as auto, count(distinct f.requester) as friends
          from public.help_fills f where f.at > v_since group by f.helper order by sum(f.qty) desc limit 20) x),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', g.day, 'asked', coalesce(a.n, 0), 'filled', coalesce(b.n, 0), 'fills', coalesce(c.n, 0)) order by g.day), '[]'::jsonb)
        from (select d::date as day from generate_series((now() at time zone 'utc')::date - least(v_days, 60) + 1, (now() at time zone 'utc')::date, interval '1 day') d) g
        left join (select (r.created_at at time zone 'utc')::date as day, count(*) as n from public.help_requests r where r.created_at > v_since group by 1) a on a.day = g.day
        left join (select (r.filled_at at time zone 'utc')::date as day, count(*) as n from public.help_requests r
                    where r.status = 'filled' and r.filled_at > v_since group by 1) b on b.day = g.day
        left join (select (f.at at time zone 'utc')::date as day, count(*) as n from public.help_fills f where f.at > v_since group by 1) c on c.day = g.day),
    'open', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) from (
        select r.id, r.requester, r.requester_name, r.item, r.qty, r.filled, r.reason, r.created_at, r.expires_at,
               cardinality(r.audience) as friends,
               (select count(*) from public.help_fills f where f.request = r.id) as fills
          from public.help_requests r where r.status = 'open' and r.expires_at > now()
         order by r.created_at desc limit 200) x));
end;
$$;

revoke all on function public.help_cleanup() from public, anon, authenticated;
revoke all on function public.help_audience(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.ask_help(text, integer, text, uuid[]) from public, anon;
revoke all on function public.set_help_friends(uuid[]) from public, anon;
revoke all on function public.cancel_help(uuid, boolean) from public, anon;
revoke all on function public.friend_help_requests(uuid[]) from public, anon;
revoke all on function public.fill_help(uuid, integer, boolean) from public, anon;
revoke all on function public.my_help_fills() from public, anon;
revoke all on function public.claim_help_fills(uuid[]) from public, anon;
revoke all on function public.admin_help_overview(integer) from public, anon;
grant execute on function public.ask_help(text, integer, text, uuid[]) to authenticated;
grant execute on function public.set_help_friends(uuid[]) to authenticated;
grant execute on function public.cancel_help(uuid, boolean) to authenticated;
grant execute on function public.friend_help_requests(uuid[]) to authenticated;
grant execute on function public.fill_help(uuid, integer, boolean) to authenticated;
grant execute on function public.my_help_fills() to authenticated;
grant execute on function public.claim_help_fills(uuid[]) to authenticated;
-- admin_help_overview checks admin_guard() itself; signed-in callers may try it (like the other admin_* functions)
grant execute on function public.admin_help_overview(integer) to authenticated;

-- ===== 1.8 welcome =====
-- 1.8 "Village Friends" (ADMIN.md, "1.8 Village" page). Safe to run again.
-- - player_events: small named game moments per player for the dashboard (welcome steps, gifts to villagers
--   and how they landed, hearts gained, daily villager visits, Ask a friend). Written only by log_event(): at
--   most 200 a day per player, a short kind and a small flat detail object, kept 180 days. Players cannot read
--   them back; deleting the account removes them (cascade).
-- - admin_letters / admin_letter_inbox: a letter from the developer to every player (or the ones active
--   lately). The game picks it up with the developer gifts and puts it in the mailbox, exactly once per player.

create table if not exists public.player_events (
  id      bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at      timestamptz not null default now(),
  kind    text not null check (kind ~ '^[a-z0-9_.:-]{1,40}$'),
  detail  jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object' and pg_column_size(detail) <= 2000)
);
create index if not exists player_events_user_idx on public.player_events (user_id, at desc);
create index if not exists player_events_kind_idx on public.player_events (kind, at desc);

create table if not exists public.admin_letters (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 80),
  body       text not null check (char_length(body) between 1 and 2000),
  audience   text not null,
  recipients integer not null default 0,
  created_at timestamptz not null default now(),
  created_by text
);
create index if not exists admin_letters_created_idx on public.admin_letters (created_at desc);

create table if not exists public.admin_letter_inbox (
  letter_id    uuid not null references public.admin_letters (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  delivered_at timestamptz,
  primary key (letter_id, user_id)
);
create index if not exists admin_letter_inbox_open_idx on public.admin_letter_inbox (user_id) where delivered_at is null;

alter table public.player_events      enable row level security;
alter table public.admin_letters      enable row level security;
alter table public.admin_letter_inbox enable row level security;
revoke all on public.player_events, public.admin_letters, public.admin_letter_inbox from anon, authenticated, public;

-- One game event. Returns false (and stores nothing) when not signed in, the kind is not a short id, or the
-- player already logged 200 events in the last day. A detail that is not a small object is stored as {}.
create or replace function public.log_event(p_kind text, p_detail jsonb default '{}'::jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_detail jsonb := case when p_detail is not null and jsonb_typeof(p_detail) = 'object' and pg_column_size(p_detail) <= 2000 then p_detail else '{}'::jsonb end;
begin
  if uid is null or p_kind is null or p_kind !~ '^[a-z0-9_.:-]{1,40}$' then return false; end if;
  if (select count(*) from public.player_events e where e.user_id = uid and e.at > now() - interval '1 day') >= 200 then return false; end if;
  insert into public.player_events (user_id, kind, detail) values (uid, p_kind, v_detail);
  -- now and then, tidy this player's old rows (cheap: the index covers it)
  if random() < 0.02 then delete from public.player_events e where e.user_id = uid and e.at < now() - interval '180 days'; end if;
  return true;
end;
$$;

-- The caller's letters from the developer that are not in their mailbox yet (oldest first).
create or replace function public.my_admin_letters()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'body', l.body, 'created_at', l.created_at) order by l.created_at), '[]'::jsonb)
    from public.admin_letter_inbox i join public.admin_letters l on l.id = i.letter_id
   where i.user_id = auth.uid() and i.delivered_at is null;
$$;

-- Mark one developer letter delivered to the caller, exactly once; returns it (the game then puts it in the mailbox).
create or replace function public.claim_admin_letter(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r jsonb;
begin
  if uid is null then raise exception 'not signed in'; end if;
  update public.admin_letter_inbox i set delivered_at = now()
   where i.letter_id = p_id and i.user_id = uid and i.delivered_at is null;
  if not found then raise exception 'not found'; end if;
  select jsonb_build_object('id', l.id, 'title', l.title, 'body', l.body, 'created_at', l.created_at) into r
    from public.admin_letters l where l.id = p_id;
  return r;
end;
$$;

-- Dashboard: queue a letter for every player (or those who played in the last 7/14/30 days, or Google players).
-- It arrives in each mailbox the next time the game checks for developer gifts. Returns how many players get it.
create or replace function public.admin_letter_all(p_title text, p_body text, p_audience text default 'all')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := public.admin_guard();
  today date := (now() at time zone 'utc')::date;
  v_aud text := coalesce(p_audience, 'all');
  v_id uuid;
  n integer;
begin
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_body), '') = '' then raise exception 'empty'; end if;
  if v_aud not in ('all', 'active7', 'active14', 'active30', 'google') then raise exception 'unknown audience'; end if;
  insert into public.admin_letters (title, body, audience, created_by)
  values (left(btrim(p_title), 80), left(btrim(p_body), 2000), v_aud, v_admin)
  returning id into v_id;
  insert into public.admin_letter_inbox (letter_id, user_id)
  select v_id, p.id from public.profiles p
   where case v_aud
           when 'active7' then exists (select 1 from public.player_days d where d.user_id = p.id and d.day > today - 7)
           when 'active14' then exists (select 1 from public.player_days d where d.user_id = p.id and d.day > today - 14)
           when 'active30' then exists (select 1 from public.player_days d where d.user_id = p.id and d.day > today - 30)
           when 'google' then exists (select 1 from auth.identities x where x.user_id = p.id and x.provider = 'google')
           else true end;
  get diagnostics n = row_count;
  update public.admin_letters l set recipients = n where l.id = v_id;
  perform public.admin_note_log(v_admin, 'letter to everyone', null, jsonb_build_object('players', n, 'audience', v_aud, 'title', p_title));
  return n;
end;
$$;

-- Dashboard "1.8 Village": the welcome funnel, villager popularity, daily visits, Ask a friend and recent letters.
create or replace function public.admin_v18_overview(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 180);
  v_from timestamptz := now() - make_interval(days => v_days);
  today date := (now() at time zone 'utc')::date;
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'generatedAt', now(),
    'days', v_days,
    'playersWithEvents', (select count(distinct e.user_id) from public.player_events e where e.at > v_from),
    'events', (select count(*) from public.player_events e where e.at > v_from),
    -- welcome funnel (all time: the welcome happens once per farm): players per step and variant
    'funnel', (select coalesce(jsonb_agg(jsonb_build_object('variant', x.variant, 'step', x.step, 'players', x.n)), '[]'::jsonb) from (
        select coalesce(e.detail ->> 'variant', 'full') as variant,
               case e.kind when 'welcome_start' then 'start' when 'welcome_step' then coalesce(e.detail ->> 'step', '?')
                           when 'welcome_gift' then 'gift_given' when 'welcome_done' then 'done' end as step,
               count(distinct e.user_id) as n
          from public.player_events e
         where e.kind in ('welcome_start', 'welcome_step', 'welcome_gift', 'welcome_done')
         group by 1, 2) x),
    'later', (select count(distinct e.user_id) from public.player_events e where e.kind = 'welcome_later'),
    'skippedGift', (select count(distinct e.user_id) from public.player_events e where e.kind = 'welcome_skip_gift'),
    'headStart', (select jsonb_build_object('players', count(distinct e.user_id), 'avgHearts', coalesce(round(avg((e.detail ->> 'hearts')::numeric), 1), 0))
                    from public.player_events e where e.kind = 'headstart' and jsonb_typeof(e.detail -> 'hearts') = 'number'),
    -- gifts in the window, by villager and taste; hearts = each player's highest heart count reached, added up
    'villagers', (select coalesce(jsonb_agg(jsonb_build_object('villager', v.villager, 'gifts', coalesce(g.gifts, 0), 'givers', coalesce(g.givers, 0),
                    'loved', coalesce(g.loved, 0), 'liked', coalesce(g.liked, 0), 'disliked', coalesce(g.disliked, 0),
                    'hearts', coalesce(hh.hearts, 0), 'friends', coalesce(hh.friends, 0)) order by coalesce(g.gifts, 0) desc, v.villager), '[]'::jsonb)
                  from (select distinct e.detail ->> 'villager' as villager from public.player_events e
                         where e.kind in ('gift', 'hearts') and e.detail ->> 'villager' ~ '^[a-z0-9_]{1,30}$') v
                  left join (select e.detail ->> 'villager' as villager, count(*) as gifts, count(distinct e.user_id) as givers,
                                    count(*) filter (where e.detail ->> 'taste' = 'love') as loved,
                                    count(*) filter (where e.detail ->> 'taste' = 'like') as liked,
                                    count(*) filter (where e.detail ->> 'taste' = 'dislike') as disliked
                               from public.player_events e where e.kind = 'gift' and e.at > v_from group by 1) g on g.villager = v.villager
                  left join (select m.villager, sum(m.hearts) as hearts, count(*) filter (where m.hearts >= 1) as friends
                               from (select e.user_id, e.detail ->> 'villager' as villager, max((e.detail ->> 'hearts')::integer) as hearts
                                       from public.player_events e where e.kind = 'hearts' and jsonb_typeof(e.detail -> 'hearts') = 'number' group by 1, 2) m
                              group by 1) hh on hh.villager = v.villager),
    -- daily villager visits done, against players who played that day
    'visits', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'done', coalesce(vv.n, 0), 'active', d.n) order by d.day), '[]'::jsonb)
                 from (select pd.day, count(*) as n from public.player_days pd where pd.day > today - v_days group by 1) d
                 left join (select (e.at at time zone 'utc')::date as day, count(distinct e.user_id) as n from public.player_events e
                             where e.kind = 'visit' and e.at > v_from group by 1) vv on vv.day = d.day),
    -- Ask a friend and mailbox moments (one event per counter step: help_ask, help_send, visit_give, find_collect...)
    'activity', (select coalesce(jsonb_agg(jsonb_build_object('kind', a.kind, 'n', a.n, 'players', a.p) order by a.n desc), '[]'::jsonb)
               from (select e.kind, count(*) as n, count(distinct e.user_id) as p from public.player_events e
                      where e.at > v_from and (e.kind like 'help\_%' or e.kind in ('visit_give', 'find_collect', 'find_return', 'mail_open', 'mail_collect'))
                      group by 1) a),
    'letters', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'body', l.body, 'audience', l.audience, 'recipients', l.recipients,
                   'delivered', (select count(*) from public.admin_letter_inbox i where i.letter_id = l.id and i.delivered_at is not null),
                   'created_at', l.created_at, 'created_by', l.created_by) order by l.created_at desc), '[]'::jsonb)
                  from (select * from public.admin_letters x order by x.created_at desc limit 20) l));
end;
$$;

revoke all on function public.log_event(text, jsonb) from public, anon;
revoke all on function public.my_admin_letters() from public, anon;
revoke all on function public.claim_admin_letter(uuid) from public, anon;
revoke all on function public.admin_letter_all(text, text, text) from public, anon;
revoke all on function public.admin_v18_overview(integer) from public, anon;
grant execute on function public.log_event(text, jsonb) to authenticated;
grant execute on function public.my_admin_letters() to authenticated;
grant execute on function public.claim_admin_letter(uuid) to authenticated;
-- the admin_* functions check admin_guard() themselves; signed-in callers may try them
grant execute on function public.admin_letter_all(text, text, text) to authenticated;
grant execute on function public.admin_v18_overview(integer) to authenticated;

-- ===== 1.8.5 skills and village restoration =====
-- Nothing new is stored by this release: the game writes small named moments with log_event() (skill_level,
-- skill_perk, skills_headstart, bundle_done, room_done), kept 180 days like the other 1.8 events. This adds one
-- read-only dashboard function that summarises them. Safe to re-run.

-- Dashboard "1.8.5 Square and Skills": which rooms and bundles players finish, how far the skills have grown and
-- which perks players choose. Room and bundle counts are all time; the rest is the chosen window.
create or replace function public.admin_v185_overview(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 180);
  v_from timestamptz := now() - make_interval(days => v_days);
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'generatedAt', now(),
    'days', v_days,
    'rooms', (select coalesce(jsonb_agg(jsonb_build_object('room', x.room, 'players', x.n) order by x.n desc, x.room), '[]'::jsonb) from (
        select e.detail ->> 'room' as room, count(distinct e.user_id) as n
          from public.player_events e
         where e.kind = 'room_done' and e.detail ->> 'room' ~ '^[a-z0-9_]{1,30}$'
         group by 1) x),
    'bundles', (select coalesce(jsonb_agg(jsonb_build_object('room', x.room, 'bundle', x.bundle, 'players', x.n) order by x.room, x.n desc), '[]'::jsonb) from (
        select e.detail ->> 'room' as room, e.detail ->> 'bundle' as bundle, count(distinct e.user_id) as n
          from public.player_events e
         where e.kind = 'bundle_done' and e.detail ->> 'room' ~ '^[a-z0-9_]{1,30}$' and e.detail ->> 'bundle' ~ '^[a-z0-9_]{1,30}$'
         group by 1, 2) x),
    'bundlePlayers', (select count(distinct e.user_id) from public.player_events e where e.kind = 'bundle_done'),
    -- players per skill who reached level 5 and level 10 (the highest level each player reported)
    'skills', (select coalesce(jsonb_agg(jsonb_build_object('skill', m.skill, 'players', m.players, 'level5', m.l5, 'level10', m.l10, 'top', m.top) order by m.skill), '[]'::jsonb) from (
        select s.skill, count(*) as players, count(*) filter (where s.lvl >= 5) as l5, count(*) filter (where s.lvl >= 10) as l10, max(s.lvl) as top
          from (select e.user_id, e.detail ->> 'skill' as skill, max((e.detail ->> 'level')::integer) as lvl
                  from public.player_events e
                 where e.kind = 'skill_level' and jsonb_typeof(e.detail -> 'level') = 'number' and e.detail ->> 'skill' ~ '^[a-z]{1,20}$'
                 group by 1, 2) s
         group by 1) m),
    'perks', (select coalesce(jsonb_agg(jsonb_build_object('skill', x.skill, 'perk', x.perk, 'players', x.n) order by x.skill, x.n desc), '[]'::jsonb) from (
        select e.detail ->> 'skill' as skill, e.detail ->> 'perk' as perk, count(distinct e.user_id) as n
          from public.player_events e
         where e.kind = 'skill_perk' and e.detail ->> 'skill' ~ '^[a-z]{1,20}$' and e.detail ->> 'perk' ~ '^[a-z0-9_]{1,30}$'
         group by 1, 2) x),
    'headStart', (select count(distinct e.user_id) from public.player_events e where e.kind = 'skills_headstart'),
    'recent', (select jsonb_build_object('roomsDone', count(*) filter (where e.kind = 'room_done'), 'bundlesDone', count(*) filter (where e.kind = 'bundle_done'),
                       'levelUps', count(*) filter (where e.kind = 'skill_level'), 'players', count(distinct e.user_id))
                 from public.player_events e where e.at > v_from and e.kind in ('room_done', 'bundle_done', 'skill_level')));
end;
$$;

revoke all on function public.admin_v185_overview(integer) from public, anon;
-- the admin_* functions check admin_guard() themselves; signed-in callers may try them
grant execute on function public.admin_v185_overview(integer) to authenticated;

-- ===== 1.9 a year in the valley =====
-- Two small things. (1) game_config: a few settings the developer can change from the dashboard without a new
-- release (for now: which weekday is market day, and the weather for one chosen date). The game reads them with
-- get_game_config() and always has an offline default, so it never depends on the server. (2) one read-only
-- dashboard function that summarises the 1.9 moments the game writes with log_event() (festival_play,
-- festival_collect, woods_first, forage, dig, museum_give, museum_shelf, museum_curator, expedition_send,
-- expedition_done, help_wanted). Safe to re-run.

create table if not exists public.game_config (
  key text primary key check (key ~ '^[a-z0-9_]{1,40}$'),
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.game_config enable row level security;
revoke all on public.game_config from public, anon, authenticated;

-- Everyone (signed in or not) may read the settings; nobody can write them except through admin_set_game_config.
create or replace function public.get_game_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(c.key, c.value), '{}'::jsonb) from public.game_config c;
$$;

-- Dashboard: set one setting (a JSON value), or clear it with null. Logged in admin_log.
create or replace function public.admin_set_game_config(p_key text, p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := public.admin_guard();
begin
  if p_key not in ('market_day', 'weather', 'upkeep', 'coop') then raise exception 'unknown setting'; end if;
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    delete from public.game_config where key = p_key;
  else
    if p_key = 'market_day' and not (jsonb_typeof(p_value) = 'number' and (p_value #>> '{}')::integer between 0 and 6) then raise exception 'market_day must be 0-6'; end if;
    if p_key = 'coop' and jsonb_typeof(p_value) <> 'boolean' then raise exception 'coop must be true or false'; end if;
    if p_key = 'upkeep' and not (jsonb_typeof(p_value) = 'number' and (p_value #>> '{}')::numeric between 0 and 2) then raise exception 'upkeep must be 0-2'; end if;
    if p_key = 'weather' and not (jsonb_typeof(p_value) = 'object' and (p_value ->> 'date') ~ '^\d{4}-\d{2}-\d{2}$' and (p_value ->> 'kind') in ('sunny', 'rain', 'mist')) then raise exception 'weather needs a date and a kind'; end if;
    insert into public.game_config (key, value, updated_at) values (p_key, p_value, now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
  perform public.admin_note_log(v_admin, 'game setting', null, jsonb_build_object('key', p_key, 'value', p_value));
  return public.get_game_config();
end;
$$;

create or replace function public.admin_v19_overview(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 180);
  v_from timestamptz := now() - make_interval(days => v_days);
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'generatedAt', now(),
    'days', v_days,
    'config', public.get_game_config(),
    -- festival plays and prizes collected, per festival, with the stars players got
    'festivals', (select coalesce(jsonb_agg(jsonb_build_object('festival', x.festival, 'plays', x.plays, 'players', x.players, 'collected', x.collected, 'threeStar', x.three) order by x.festival), '[]'::jsonb) from (
        select e.detail ->> 'festival' as festival,
               count(*) filter (where e.kind = 'festival_play') as plays,
               count(distinct e.user_id) filter (where e.kind = 'festival_play') as players,
               count(*) filter (where e.kind = 'festival_collect') as collected,
               count(*) filter (where e.kind = 'festival_collect' and (e.detail ->> 'stars') = '3') as three
          from public.player_events e
         where e.kind in ('festival_play', 'festival_collect') and e.at > v_from and e.detail ->> 'festival' ~ '^[a-z_]{1,30}$'
         group by 1) x),
    'woods', (select jsonb_build_object(
                'visitors', count(distinct e.user_id) filter (where e.kind = 'woods_first'),
                'foragers', count(distinct e.user_id) filter (where e.kind = 'forage'),
                'forages', count(*) filter (where e.kind = 'forage'),
                'diggers', count(distinct e.user_id) filter (where e.kind = 'dig'),
                'digs', count(*) filter (where e.kind = 'dig'),
                'expeditions', count(*) filter (where e.kind = 'expedition_send'),
                'expeditionsDone', count(*) filter (where e.kind = 'expedition_done'))
                from public.player_events e where e.kind in ('woods_first', 'forage', 'dig', 'expedition_send', 'expedition_done') and e.at > v_from),
    'museum', jsonb_build_object(
        'givers', (select count(distinct e.user_id) from public.player_events e where e.kind = 'museum_give' and e.at > v_from),
        'pieces', (select count(*) from public.player_events e where e.kind = 'museum_give' and e.at > v_from),
        'curators', (select count(distinct e.user_id) from public.player_events e where e.kind = 'museum_curator' and e.at > v_from),
        'shelves', (select coalesce(jsonb_agg(jsonb_build_object('shelf', x.shelf, 'players', x.n) order by x.n desc), '[]'::jsonb) from (
            select e.detail ->> 'shelf' as shelf, count(distinct e.user_id) as n from public.player_events e
             where e.kind = 'museum_shelf' and e.at > v_from and e.detail ->> 'shelf' ~ '^[a-z_]{1,30}$' group by 1) x)),
    'helpWanted', (select jsonb_build_object('players', count(distinct e.user_id), 'filled', count(*)) from public.player_events e where e.kind = 'help_wanted' and e.at > v_from));
end;
$$;

revoke all on function public.get_game_config() from public;
revoke all on function public.admin_set_game_config(text, jsonb) from public, anon;
revoke all on function public.admin_v19_overview(integer) from public, anon;
grant execute on function public.get_game_config() to anon, authenticated;
-- the admin_* functions check admin_guard() themselves; signed-in callers may try them
grant execute on function public.admin_set_game_config(text, jsonb) to authenticated;
grant execute on function public.admin_v19_overview(integer) to authenticated;

-- ===== 1.28 co-op village projects =====
-- "Together" (1.28, src/systems/Coop.ts, src/data/coop.json). A player hosts one project at a time (a footbridge,
-- a community garden, a fireworks night) and their friends add goods to it. Same trust model as Ask a friend:
-- the giver's game takes the items out of its barn before coop_give() and puts back whatever the server did not
-- use. When every need is met, every giver gets a claim row; coop_claim() hands each one out exactly once and the
-- giver's game then adds the project's decoration and a plaque with everyone's names. If the project runs out of
-- time (30 days) or the host cancels it (only while nobody else has given), every giver gets a claim with exactly
-- what they gave (refund), so nothing is ever lost.
--
-- Friends live on each device (like Ask a friend): coop_start() stores the host's friend list with the project
-- (audience, at most 30) and coop_set_friends() updates it. Only the host and the audience can see a project
-- (coop_list) or give to it (coop_give). Names shown to the others are profile names only.
-- Rules: one open project per host, 2 starts a week, at most 50 of an item per gift and only what is still
-- needed, 40 gifts per player a day. The catalog (level and needs per project) is the server's own copy:
-- validate-data checks coop_catalog() against src/data/coop.json. game_config 'coop' = false switches it off.
-- Clients cannot read the tables; everything goes through the functions. Deleting an account removes its
-- projects, gifts and claims (on delete cascade through profiles).

create table if not exists public.coop_projects (
  id          uuid primary key default gen_random_uuid(),
  host        uuid not null references public.profiles (id) on delete cascade,
  host_name   text not null check (char_length(host_name) between 1 and 24),
  kind        text not null check (kind ~ '^[a-z_]{1,30}$'),
  needs       jsonb not null,
  given       jsonb not null default '{}'::jsonb,
  audience    uuid[] not null default '{}' check (cardinality(audience) <= 30),
  status      text not null default 'open' check (status in ('open', 'done', 'expired', 'cancelled')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '30 days',
  closed_at   timestamptz
);

create table if not exists public.coop_gifts (
  id          uuid primary key default gen_random_uuid(),
  project     uuid not null references public.coop_projects (id) on delete cascade,
  giver       uuid not null references public.profiles (id) on delete cascade,
  giver_name  text not null check (char_length(giver_name) between 1 and 24),
  item        text not null check (item ~ '^[a-z0-9_]{1,40}$'),
  qty         integer not null check (qty between 1 and 50),
  at          timestamptz not null default now()
);

-- one per giver when a project closes: done (the reward, with the givers' names) or a refund of exactly what they
-- gave. A claim keeps its own copy of what it needs, so it outlives the project (a host who deletes their account
-- still leaves every friend's refund behind).
create table if not exists public.coop_claims (
  id          uuid primary key default gen_random_uuid(),
  project     uuid references public.coop_projects (id) on delete set null,
  member      uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind ~ '^[a-z_]{1,30}$'),
  host_name   text not null check (char_length(host_name) between 1 and 24),
  done        boolean not null,
  refund      jsonb,
  names       jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  unique (project, member)
);

create index if not exists coop_projects_host_idx    on public.coop_projects (host, created_at desc);
create index if not exists coop_projects_open_idx    on public.coop_projects (expires_at) where status = 'open';
create index if not exists coop_gifts_project_idx    on public.coop_gifts (project);
create index if not exists coop_gifts_giver_idx      on public.coop_gifts (giver, at desc);
create index if not exists coop_claims_unclaimed_idx on public.coop_claims (member) where claimed_at is null;
create index if not exists coop_claims_created_idx   on public.coop_claims (created_at);

alter table public.coop_projects enable row level security;
alter table public.coop_gifts    enable row level security;
alter table public.coop_claims   enable row level security;
revoke all on public.coop_projects, public.coop_gifts, public.coop_claims from anon, authenticated, public;

-- The server's copy of the projects (level to host, needs). Keep in step with src/data/coop.json (validate-data checks it).
create or replace function public.coop_catalog()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{"footbridge":{"level":20,"needs":{"wheat":400,"bread":80,"yarn":30,"cheese":30,"iron_ore":20}},"garden":{"level":25,"needs":{"strawberry":150,"carrot":250,"apple":100,"honey":30,"fertiliser":20}},"fireworks":{"level":35,"needs":{"sugar":120,"beeswax_candle":40,"berry_juice":50,"cookie":60,"copper_ore":20}}}'::jsonb;
$$;

-- Switched on unless game_config 'coop' is false.
create or replace function public.coop_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (c.value #>> '{}')::boolean from public.game_config c where c.key = 'coop' and jsonb_typeof(c.value) = 'boolean'), true);
$$;

-- Internal: refund every giver of a project that closes without finishing (exactly what each gave).
drop function if exists public.coop_refund(uuid);
create or replace function public.coop_refund(p_id uuid, p_skip uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.coop_claims (project, member, kind, host_name, done, refund)
  select g.project, g.giver, p.kind, p.host_name, false, jsonb_object_agg(g.item, g.n)
    from (select x.project, x.giver, x.item, sum(x.qty)::integer as n from public.coop_gifts x where x.project = p_id group by 1, 2, 3) g
    join public.coop_projects p on p.id = g.project
   where g.giver <> coalesce(p_skip, '00000000-0000-0000-0000-000000000000'::uuid)
   group by g.project, g.giver, p.kind, p.host_name
  on conflict (project, member) do nothing;
$$;

-- Internal, cheap and bounded: expire projects past their time (refunding their givers) and forget old closed
-- projects once every claim is collected (or after 120 days).
create or replace function public.coop_cleanup()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in
    update public.coop_projects p set status = 'expired', closed_at = now()
     where p.id in (select x.id from public.coop_projects x where x.status = 'open' and x.expires_at < now() limit 200)
    returning p.id
  loop
    perform public.coop_refund(v_id);
  end loop;
  delete from public.coop_projects p
   where p.id in (select x.id from public.coop_projects x where x.status <> 'open' and x.closed_at < now() - interval '60 days' limit 200);
  delete from public.coop_claims c
   where c.id in (select x.id from public.coop_claims x
                   where (x.claimed_at is not null and x.claimed_at < now() - interval '60 days') or x.created_at < now() - interval '180 days'
                   limit 200);
end;
$$;

-- Internal: an open project that is deleted (its host deleted their account) refunds every other giver first.
create or replace function public.coop_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'open' then perform public.coop_refund(old.id, old.host); end if;
  return old;
end;
$$;
drop trigger if exists coop_projects_refund on public.coop_projects;
create trigger coop_projects_refund before delete on public.coop_projects for each row execute function public.coop_before_delete();

-- Internal: a project as the caller sees it (givers by name only, the caller's own line marked).
create or replace function public.coop_view(p public.coop_projects, p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id, 'host', jsonb_build_object('id', p.host, 'name', p.host_name), 'kind', p.kind,
    'needs', p.needs, 'given', p.given, 'status', p.status,
    'created_at', p.created_at, 'expires_at', p.expires_at, 'closed_at', p.closed_at,
    'givers', coalesce((select jsonb_agg(jsonb_build_object('name', g.name, 'qty', g.n, 'me', g.me) order by g.n desc)
                          from (select max(x.giver_name) as name, sum(x.qty)::integer as n, bool_or(x.giver = p_uid) as me
                                  from public.coop_gifts x where x.project = p.id group by x.giver order by 2 desc limit 30) g), '[]'::jsonb));
$$;

-- Host a project of p_kind with your friends p_friends (ids from your device, at most 30). Returns the project.
create or replace function public.coop_start(p_kind text, p_friends uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_name text;
  v_level integer;
  v_cat jsonb;
  r public.coop_projects;
begin
  if uid is null then raise exception 'not signed in'; end if;
  perform public.assert_not_locked(uid);
  if not public.coop_enabled() then raise exception 'switched off'; end if;
  select public.clean_text(p.name, 24, 'Farmer'), p.level into v_name, v_level from public.profiles p where p.id = uid for update; -- serialises this host
  if not found then raise exception 'no profile'; end if;
  if p_kind is null or p_kind !~ '^[a-z_]{1,30}$' then raise exception 'bad kind'; end if;
  v_cat := public.coop_catalog() -> p_kind;
  if v_cat is null then raise exception 'bad kind'; end if;
  if coalesce(v_level, 1) < (v_cat ->> 'level')::integer then raise exception 'level'; end if;
  if p_friends is not null and cardinality(p_friends) > 30 then raise exception 'too many friends'; end if;
  perform public.coop_cleanup();
  if exists (select 1 from public.coop_projects x where x.host = uid and x.status = 'open') then raise exception 'already hosting'; end if;
  if (select count(*) from public.coop_projects x where x.host = uid and x.created_at > now() - interval '7 days') >= 2 then raise exception 'too many'; end if;
  insert into public.coop_projects (host, host_name, kind, needs, audience)
  values (uid, v_name, p_kind, v_cat -> 'needs', public.help_audience(uid, p_friends))
  returning * into r;
  return public.coop_view(r, uid);
end;
$$;

-- The host's friend list changed: update who can see and give to their open project. Returns how many were updated.
create or replace function public.coop_set_friends(p_friends uuid[])
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
  if p_friends is not null and cardinality(p_friends) > 30 then raise exception 'too many friends'; end if;
  update public.coop_projects p set audience = public.help_audience(uid, p_friends) where p.host = uid and p.status = 'open';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Projects the caller can see: their own, and those of these friends (ids, at most 30) whose audience includes
-- them; open ones and those closed in the last 7 days, newest first.
create or replace function public.coop_list(p_ids uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_ids is not null and cardinality(p_ids) > 30 then raise exception 'too many friends'; end if;
  perform public.coop_cleanup();
  return coalesce((select jsonb_agg(public.coop_view(p, uid) order by p.created_at desc)
    from public.coop_projects p
   where p.id in (select x.id from public.coop_projects x
                   where (x.host = uid or (x.host = any (coalesce(p_ids, '{}'::uuid[])) and uid = any (x.audience)))
                     and (x.status = 'open' or x.closed_at > now() - interval '7 days')
                   order by x.created_at desc limit 20)), '[]'::jsonb);
end;
$$;

-- Give up to p_qty (1-50) of p_item to a project you host or were invited to. Never more than is still needed:
-- returns {used, project}. When every need is met the project is done and every giver gets a claim. p_key (made
-- by the game) makes a retry safe: giving again with the same key returns the first answer instead of giving twice.
drop function if exists public.coop_give(uuid, text, integer);
create or replace function public.coop_give(p_id uuid, p_item text, p_qty integer, p_key uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_name text;
  v_need integer;
  v_used integer;
  r public.coop_projects;
begin
  if uid is null then raise exception 'not signed in'; end if;
  perform public.assert_not_locked(uid);
  if not public.coop_enabled() then raise exception 'switched off'; end if;
  if p_item is null or p_item !~ '^[a-z0-9_]{1,40}$' then raise exception 'bad item'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 50 then raise exception 'bad qty'; end if;
  select public.clean_text(p.name, 24, 'Farmer') into v_name from public.profiles p where p.id = uid for update; -- serialises this giver
  if not found then raise exception 'no profile'; end if;
  select x.* into r from public.coop_projects x where x.id = p_id for update;
  if not found or not (r.host = uid or uid = any (r.audience)) then raise exception 'not found'; end if;
  -- already given with this key (the answer was lost on the way): the same answer again
  if p_key is not null then
    select g.qty into v_used from public.coop_gifts g where g.id = p_key and g.giver = uid and g.project = r.id;
    if found then return jsonb_build_object('used', v_used, 'project', public.coop_view(r, uid)); end if;
  end if;
  if r.status <> 'open' or r.expires_at <= now() then raise exception 'closed'; end if;
  v_need := coalesce((r.needs ->> p_item)::integer, 0) - coalesce((r.given ->> p_item)::integer, 0);
  if v_need <= 0 then raise exception 'not needed'; end if;
  if (select count(*) from public.coop_gifts x where x.giver = uid and x.at > now() - interval '1 day') >= 40 then raise exception 'too many today'; end if;
  v_used := least(p_qty, v_need);
  insert into public.coop_gifts (id, project, giver, giver_name, item, qty) values (coalesce(p_key, gen_random_uuid()), r.id, uid, v_name, p_item, v_used);
  update public.coop_projects x set given = x.given || jsonb_build_object(p_item, coalesce((x.given ->> p_item)::integer, 0) + v_used)
   where x.id = r.id returning * into r;
  -- every need met: done, and a reward claim for everyone who gave
  if not exists (select 1 from jsonb_each_text(r.needs) n where coalesce((r.given ->> n.key)::integer, 0) < n.value::integer) then
    update public.coop_projects x set status = 'done', closed_at = now() where x.id = r.id returning * into r;
    insert into public.coop_claims (project, member, kind, host_name, done, names)
    select r.id, g.giver, r.kind, r.host_name, true,
           (select coalesce(jsonb_agg(n.name order by n.qty desc, n.name), '[]'::jsonb) from (
              select max(x.giver_name) as name, sum(x.qty) as qty from public.coop_gifts x where x.project = r.id group by x.giver order by 2 desc, 1 limit 30) n)
      from (select distinct x.giver from public.coop_gifts x where x.project = r.id) g
    on conflict (project, member) do nothing;
  end if;
  return jsonb_build_object('used', v_used, 'project', public.coop_view(r, uid));
end;
$$;

-- Cancel your own open project, only while nobody else has given to it. Your own goods come back as a claim.
create or replace function public.coop_cancel(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r public.coop_projects;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select x.* into r from public.coop_projects x where x.id = p_id and x.host = uid for update;
  if not found then raise exception 'not found'; end if;
  if r.status <> 'open' then raise exception 'closed'; end if;
  if exists (select 1 from public.coop_gifts g where g.project = r.id and g.giver <> uid) then raise exception 'others joined'; end if;
  update public.coop_projects x set status = 'cancelled', closed_at = now() where x.id = r.id returning * into r;
  perform public.coop_refund(r.id);
  return public.coop_view(r, uid);
end;
$$;

-- Hand the caller's waiting claims over, each exactly once: finished projects (the caller's game adds the
-- decoration and a plaque with the givers' names) and refunds (it adds back exactly the items listed).
create or replace function public.coop_claim()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_out jsonb := '[]'::jsonb;
  c record;
begin
  if uid is null then raise exception 'not signed in'; end if;
  perform public.coop_cleanup();
  for c in
    update public.coop_claims x set claimed_at = now()
     where x.member = uid and x.claimed_at is null
    returning x.id, x.project, x.done, x.refund, x.kind, x.host_name, x.names, x.created_at
  loop
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'project', coalesce(c.project, c.id), 'kind', c.kind, 'host', c.host_name, 'done', c.done, 'refund', c.refund,
      'closed_at', c.created_at, 'names', c.names));
  end loop;
  return v_out;
end;
$$;

revoke all on function public.coop_catalog() from public;
revoke all on function public.coop_enabled() from public, anon, authenticated;
revoke all on function public.coop_refund(uuid, uuid) from public, anon, authenticated;
revoke all on function public.coop_before_delete() from public, anon, authenticated;
revoke all on function public.coop_cleanup() from public, anon, authenticated;
revoke all on function public.coop_view(public.coop_projects, uuid) from public, anon, authenticated;
revoke all on function public.coop_start(text, uuid[]) from public, anon;
revoke all on function public.coop_set_friends(uuid[]) from public, anon;
revoke all on function public.coop_list(uuid[]) from public, anon;
revoke all on function public.coop_give(uuid, text, integer, uuid) from public, anon;
revoke all on function public.coop_cancel(uuid) from public, anon;
revoke all on function public.coop_claim() from public, anon;
grant execute on function public.coop_catalog() to authenticated;
grant execute on function public.coop_start(text, uuid[]) to authenticated;
grant execute on function public.coop_set_friends(uuid[]) to authenticated;
grant execute on function public.coop_list(uuid[]) to authenticated;
grant execute on function public.coop_give(uuid, text, integer, uuid) to authenticated;
grant execute on function public.coop_cancel(uuid) to authenticated;
grant execute on function public.coop_claim() to authenticated;

-- ===== 1.28.2 visits and help (dashboard) =====
-- The dashboard's "Visits and help" page and the Visits card on a player's page (ADMIN.md). Read only, admins
-- only (admin_guard). Uses farm_snapshots, farm_share_refusals (written by publish_farm when a farm cannot be
-- shared), farm_help, the co-op tables and the game events 'farm_visit' (one per visit: how many things on the
-- farm needed help, whether the visitor helped or liked, how old the farm picture was), 'farm_visit_failed',
-- 'farm_share_trimmed' and 'farm_share_failed'.

create index if not exists farm_help_created_idx on public.farm_help (created_at);

create or replace function public.admin_visits_overview(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 180);
  v_from timestamptz := now() - make_interval(days => v_days);
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'generatedAt', now(),
    'days', v_days,
    'sharing', (select jsonb_build_object(
        'farms', count(*),
        'shared24h', count(*) filter (where f.updated_at > now() - interval '1 day'),
        'shared7d', count(*) filter (where f.updated_at > now() - interval '7 days'),
        'avgBytes', coalesce(round(avg(octet_length(f.data::text))), 0),
        'maxBuildings', coalesce(max(jsonb_array_length(f.data -> 'b')), 0),
        'over1200', count(*) filter (where jsonb_array_length(f.data -> 'b') > 1200),
        'refused', (select count(*) from public.farm_share_refusals r
                     where r.at > coalesce((select f2.updated_at from public.farm_snapshots f2 where f2.user_id = r.user_id), '-infinity'::timestamptz)))
      from public.farm_snapshots f),
    -- played in the last 3 days but their farm picture is 2+ days old (or missing): visitors see an old farm
    'stale', (select coalesce(jsonb_agg(x order by x ->> 'played' desc), '[]'::jsonb) from (
        select jsonb_build_object('id', p.id, 'name', p.name, 'level', p.level, 'played', p.updated_at, 'shared', f.updated_at,
                 'reason', r.reason, 'refusedAt', r.at, 'bytes', r.bytes, 'buildings', r.buildings, 'times', r.times) as x
          from public.profiles p
          left join public.farm_snapshots f on f.user_id = p.id
          left join public.farm_share_refusals r on r.user_id = p.id
         where p.updated_at > now() - interval '3 days'
           and (f.updated_at is null or f.updated_at < p.updated_at - interval '2 days')
         order by p.updated_at desc limit 40) y),
    'biggest', (select coalesce(jsonb_agg(x order by (x ->> 'buildings')::integer desc), '[]'::jsonb) from (
        select jsonb_build_object('id', f.user_id, 'name', p.name, 'level', p.level, 'buildings', jsonb_array_length(f.data -> 'b'),
                 'bytes', octet_length(f.data::text), 'shared', f.updated_at) as x
          from public.farm_snapshots f join public.profiles p on p.id = f.user_id
         order by jsonb_array_length(f.data -> 'b') desc limit 12) y),
    'help', (select jsonb_build_object(
        'helps', count(*) filter (where h.kind <> 'like'),
        'water', count(*) filter (where h.kind = 'water'),
        'feed', count(*) filter (where h.kind = 'feed'),
        'tend', count(*) filter (where h.kind = 'tend'),
        'likes', count(*) filter (where h.kind = 'like'),
        'helpers', count(distinct h.helper_id) filter (where h.kind <> 'like'),
        'farms', count(distinct h.owner_id) filter (where h.kind <> 'like'),
        'claimed', count(*) filter (where h.kind <> 'like' and h.claimed_at is not null),
        'waiting', count(*) filter (where h.kind <> 'like' and h.claimed_at is null and h.created_at < now() - interval '3 days'),
        'notes', (select coalesce(jsonb_object_agg(n.note, n.c), '{}'::jsonb) from (
                    select h2.note, count(*) as c from public.farm_help h2
                     where h2.kind = 'like' and h2.note is not null and h2.created_at > v_from group by h2.note) n),
        'busyDays', (select count(*) from (select 1 from public.farm_help h3 where h3.created_at > v_from
                       group by h3.owner_id, h3.day having count(*) >= 50) b))
      from public.farm_help h where h.created_at > v_from),
    'helpDays', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'water', d.water, 'feed', d.feed, 'tend', d.tend,
                   'likes', d.likes, 'helpers', d.helpers) order by d.day), '[]'::jsonb) from (
        select h.day, count(*) filter (where h.kind = 'water') as water, count(*) filter (where h.kind = 'feed') as feed,
               count(*) filter (where h.kind = 'tend') as tend, count(*) filter (where h.kind = 'like') as likes,
               count(distinct h.helper_id) filter (where h.kind <> 'like') as helpers
          from public.farm_help h where h.created_at > v_from group by h.day) d),
    'topHelpers', (select coalesce(jsonb_agg(jsonb_build_object('id', t.helper_id, 'name', p.name, 'level', p.level, 'helps', t.n) order by t.n desc), '[]'::jsonb) from (
        select h.helper_id, count(*) as n from public.farm_help h where h.kind <> 'like' and h.created_at > v_from
         group by h.helper_id order by count(*) desc limit 10) t join public.profiles p on p.id = t.helper_id),
    'topFarms', (select coalesce(jsonb_agg(jsonb_build_object('id', t.owner_id, 'name', p.name, 'level', p.level, 'helps', t.n, 'likes', t.l) order by t.n + t.l desc), '[]'::jsonb) from (
        select h.owner_id, count(*) filter (where h.kind <> 'like') as n, count(*) filter (where h.kind = 'like') as l
          from public.farm_help h where h.created_at > v_from
         group by h.owner_id order by count(*) desc limit 10) t join public.profiles p on p.id = t.owner_id),
    -- from the game's own 'farm_visit' events (1.28.2 and later)
    'visits', (select jsonb_build_object(
        'visits', count(*),
        'visitors', count(distinct e.user_id),
        'nothing', count(*) filter (where (e.detail ->> 'helpable') = '0'),
        'helped', count(*) filter (where (e.detail ->> 'helped') = 'true'),
        'liked', count(*) filter (where (e.detail ->> 'liked') = 'true'),
        'refusedAlready', count(*) filter (where e.detail ->> 'refused' = 'already'),
        'refusedBusy', count(*) filter (where e.detail ->> 'refused' = 'busy'),
        'refusedOffline', count(*) filter (where e.detail ->> 'refused' = 'offline'),
        'refusedOther', count(*) filter (where e.detail ->> 'refused' = 'other'),
        'oldPictures', count(*) filter (where (e.detail ->> 'ageH') ~ '^[0-9.]+$' and (e.detail ->> 'ageH')::numeric >= 24),
        'avgMins', coalesce(round(avg((e.detail ->> 'mins')::numeric) filter (where (e.detail ->> 'mins') ~ '^[0-9.]+$'), 1), 0))
      from public.player_events e where e.kind = 'farm_visit' and e.at > v_from),
    'visitDays', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'visits', d.visits, 'helped', d.helped, 'nothing', d.nothing) order by d.day), '[]'::jsonb) from (
        select (e.at at time zone 'utc')::date as day, count(*) as visits,
               count(*) filter (where (e.detail ->> 'helped') = 'true') as helped,
               count(*) filter (where (e.detail ->> 'helpable') = '0') as nothing
          from public.player_events e where e.kind = 'farm_visit' and e.at > v_from group by 1) d),
    'problems', (select coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'reason', x.reason, 'events', x.n, 'players', x.p) order by x.n desc), '[]'::jsonb) from (
        select e.kind, coalesce(nullif(e.detail ->> 'reason', ''), '-') as reason, count(*) as n, count(distinct e.user_id) as p
          from public.player_events e
         where e.kind in ('farm_visit_failed', 'farm_share_failed', 'farm_share_trimmed') and e.at > v_from
         group by 1, 2) x),
    'coop', (select jsonb_build_object(
        'open', (select count(*) from public.coop_projects c where c.status = 'open'),
        'started', count(*),
        'done', count(*) filter (where c.status = 'done'),
        'expired', count(*) filter (where c.status = 'expired'),
        'cancelled', count(*) filter (where c.status = 'cancelled'),
        'hosts', count(distinct c.host),
        'gifts', (select count(*) from public.coop_gifts g where g.at > v_from),
        'givers', (select count(distinct g.giver) from public.coop_gifts g where g.at > v_from),
        'unclaimed', (select count(*) from public.coop_claims k where k.claimed_at is null),
        'kinds', (select coalesce(jsonb_object_agg(k.kind, k.n), '{}'::jsonb) from (
                    select c2.kind, count(*) as n from public.coop_projects c2 where c2.created_at > v_from group by c2.kind) k))
      from public.coop_projects c where c.created_at > v_from)
  );
end;
$$;

-- One player's visits and help, for the Visits card on their page.
create or replace function public.admin_player_visits(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'farm', (select jsonb_build_object('shared', f.updated_at, 'bytes', octet_length(f.data::text),
               'buildings', jsonb_array_length(f.data -> 'b'), 'pictureAt', f.data -> 'at')
             from public.farm_snapshots f where f.user_id = p_id),
    'refusal', (select to_jsonb(r) - 'user_id' from public.farm_share_refusals r where r.user_id = p_id),
    'given30', (select jsonb_build_object('helps', count(*) filter (where h.kind <> 'like'), 'likes', count(*) filter (where h.kind = 'like'))
                  from public.farm_help h where h.helper_id = p_id and h.created_at > now() - interval '30 days'),
    'got30', (select jsonb_build_object('helps', count(*) filter (where h.kind <> 'like'), 'likes', count(*) filter (where h.kind = 'like'),
                'unclaimed', count(*) filter (where h.kind <> 'like' and h.claimed_at is null))
                from public.farm_help h where h.owner_id = p_id and h.created_at > now() - interval '30 days'),
    'recent', (select coalesce(jsonb_agg(x order by x ->> 'at' desc), '[]'::jsonb) from (
        select jsonb_build_object('at', h.created_at, 'kind', h.kind, 'what', h.target ->> 'type', 'note', h.note,
                 'dir', case when h.helper_id = p_id then 'gave' else 'got' end,
                 'other', case when h.helper_id = p_id then (select p.name from public.profiles p where p.id = h.owner_id) else h.helper_name end,
                 'claimed', h.claimed_at is not null) as x
          from public.farm_help h where h.helper_id = p_id or h.owner_id = p_id
         order by h.created_at desc limit 25) y),
    'visits', (select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'kind', e.kind, 'detail', e.detail) order by e.at desc), '[]'::jsonb) from (
        select * from public.player_events e
         where e.user_id = p_id and e.kind in ('farm_visit', 'farm_visit_failed', 'farm_share_failed', 'farm_share_trimmed')
         order by e.at desc limit 20) e),
    'coop', (select coalesce(jsonb_agg(jsonb_build_object('kind', c.kind, 'status', c.status, 'created', c.created_at, 'closed', c.closed_at,
               'gifts', (select count(*) from public.coop_gifts g where g.project = c.id)) order by c.created_at desc), '[]'::jsonb)
             from (select * from public.coop_projects c where c.host = p_id order by c.created_at desc limit 10) c),
    'coopGiven', (select count(*) from public.coop_gifts g where g.giver = p_id)
  );
end;
$$;

revoke all on function public.admin_visits_overview(integer) from public, anon;
revoke all on function public.admin_player_visits(uuid) from public, anon;
grant execute on function public.admin_visits_overview(integer) to authenticated;
grant execute on function public.admin_player_visits(uuid) to authenticated;

-- ===== admin player deep dive =====
-- The dashboard's player page (ADMIN.md "Player page"): everything about one player in one call, their full save
-- (logged, since it is the whole farm), and actions for one player: a letter in their mailbox, a phone
-- notification, clearing a leaderboard flag. Admins only (admin_guard); every action is written to admin_log.

create or replace function public.admin_player_deep(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  v_today date := (now() at time zone 'utc')::date;
begin
  perform public.admin_guard();
  select * into p from public.profiles x where x.id = p_id;
  return jsonb_build_object(
    -- the newest 400 game events, and how many of each kind ever
    'events', (select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'kind', e.kind, 'detail', e.detail) order by e.at desc), '[]'::jsonb)
                 from (select * from public.player_events e where e.user_id = p_id order by e.at desc limit 400) e),
    'eventKinds', (select coalesce(jsonb_object_agg(k.kind, k.n), '{}'::jsonb)
                     from (select e.kind, count(*) as n from public.player_events e where e.user_id = p_id group by e.kind) k),
    -- when they play (UTC hour), from events and from the start and end of each play day
    'hours', (select coalesce(jsonb_agg(coalesce(c.n, 0) order by g.h), '[]'::jsonb)
                from generate_series(0, 23) g(h)
                left join (select extract(hour from x.t)::integer as h, count(*) as n from (
                             select e.at as t from public.player_events e where e.user_id = p_id and e.at > now() - interval '90 days'
                             union all select d.first_at from public.player_days d where d.user_id = p_id and d.day > v_today - 90
                             union all select d.last_at from public.player_days d where d.user_id = p_id and d.day > v_today - 90) x
                           group by 1) c on c.h = g.h),
    'weekdays', (select coalesce(jsonb_agg(coalesce(c.m, 0) order by g.d), '[]'::jsonb)
                   from generate_series(0, 6) g(d)
                   left join (select extract(dow from d.day)::integer as d, sum(d.minutes) as m from public.player_days d
                               where d.user_id = p_id group by 1) c on c.d = g.d),
    -- where they stand: rank on each board among farmers shown on the leaderboards, and against everyone's play time
    'ranks', case when p.id is null then null else jsonb_build_object(
        'players', (select count(*) from public.profiles x where not x.lb_hidden),
        'level', (select count(*) + 1 from public.profiles x where not x.lb_hidden and x.level > p.level),
        'xp', (select count(*) + 1 from public.profiles x where not x.lb_hidden and x.total_xp > p.total_xp),
        'value', (select count(*) + 1 from public.profiles x where not x.lb_hidden and x.farm_value > p.farm_value),
        'charm', (select count(*) + 1 from public.profiles x where not x.lb_hidden and x.charm > p.charm),
        'weekly', (select count(*) + 1 from public.profiles x where not x.lb_hidden and x.week_start = p.week_start and x.weekly_xp > p.weekly_xp),
        'minutesPct', (with m as (select d.user_id, sum(d.minutes) as m from public.player_days d group by d.user_id)
                       select round(100.0 * count(*) filter (where m.m <= coalesce((select m2.m from m m2 where m2.user_id = p_id), 0)) / greatest(count(*), 1))
                         from m),
        'medianLevel', (select percentile_cont(0.5) within group (order by x.level) from public.profiles x),
        'medianMinutes', (select percentile_cont(0.5) within group (order by m.m) from (select sum(d.minutes) as m from public.player_days d group by d.user_id) m)) end,
    -- the players they deal with most (gifts and help, both ways)
    'contacts', (select coalesce(jsonb_agg(jsonb_build_object('id', c.other, 'name', pr.name, 'level', pr.level, 'giftsOut', c.go, 'giftsIn', c.gi, 'helpOut', c.ho, 'helpIn', c.hi, 'coop', c.co) order by c.go + c.gi + c.ho + c.hi + c.co desc), '[]'::jsonb)
                   from (select x.other, sum(x.go) as go, sum(x.gi) as gi, sum(x.ho) as ho, sum(x.hi) as hi, sum(x.co) as co from (
                           select g.to_id as other, 1 as go, 0 as gi, 0 as ho, 0 as hi, 0 as co from public.gifts g where g.from_id = p_id
                           union all select g.from_id, 0, 1, 0, 0, 0 from public.gifts g where g.to_id = p_id
                           union all select h.owner_id, 0, 0, 1, 0, 0 from public.farm_help h where h.helper_id = p_id
                           union all select h.helper_id, 0, 0, 0, 1, 0 from public.farm_help h where h.owner_id = p_id
                           union all select c.host, 0, 0, 0, 0, 1 from public.coop_gifts g join public.coop_projects c on c.id = g.project where g.giver = p_id and c.host <> p_id
                           union all select g.giver, 0, 0, 0, 0, 1 from public.coop_gifts g join public.coop_projects c on c.id = g.project where c.host = p_id and g.giver <> p_id) x
                         group by x.other order by count(*) desc limit 15) c
                   join public.profiles pr on pr.id = c.other),
    'askHelp', (select coalesce(jsonb_agg(jsonb_build_object('at', r.created_at, 'item', r.item, 'qty', r.qty, 'filled', r.filled, 'reason', r.reason, 'closed', r.closed_at) order by r.created_at desc), '[]'::jsonb)
                  from (select * from public.help_requests r where r.requester = p_id order by r.created_at desc limit 20) r),
    'askFilled', (select count(*) from public.help_fills f where f.helper = p_id),
    'letters', (select coalesce(jsonb_agg(jsonb_build_object('title', l.title, 'audience', l.audience, 'sent', l.created_at, 'delivered', i.delivered_at) order by l.created_at desc), '[]'::jsonb)
                  from public.admin_letter_inbox i join public.admin_letters l on l.id = i.letter_id where i.user_id = p_id),
    'pushQueue', (select coalesce(jsonb_agg(jsonb_build_object('kind', s.kind, 'title', s.title, 'body', s.body, 'fire', s.fire_at, 'sent', s.sent_at, 'status', s.status) order by s.fire_at desc), '[]'::jsonb)
                    from (select * from public.push_schedule s where s.user_id = p_id order by s.fire_at desc limit 30) s),
    'codes', (select coalesce(jsonb_agg(jsonb_build_object('code', c.code, 'at', c.at) order by c.at desc), '[]'::jsonb) from public.reward_claims c where c.user_id = p_id),
    'adminLog', (select coalesce(jsonb_agg(jsonb_build_object('at', l.at, 'admin', l.admin, 'action', l.action, 'detail', l.detail) order by l.at desc), '[]'::jsonb)
                   from (select * from public.admin_log l where l.target = p_id order by l.at desc limit 60) l),
    'coopGifts', (select coalesce(jsonb_agg(jsonb_build_object('at', g.at, 'item', g.item, 'qty', g.qty, 'kind', c.kind, 'host', c.host_name) order by g.at desc), '[]'::jsonb)
                    from (select * from public.coop_gifts g where g.giver = p_id order by g.at desc limit 30) g join public.coop_projects c on c.id = g.project),
    'refusal', (select to_jsonb(r) - 'user_id' from public.farm_share_refusals r where r.user_id = p_id),
    'saveAt', (select c.updated_at from public.cloud_saves c where c.user_id = p_id)
  );
end;
$$;

-- A player's whole cloud save for the dashboard's farm inspector (read only; logged because it is the whole farm).
create or replace function public.admin_player_save(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := public.admin_guard();
  v jsonb;
begin
  select c.data into v from public.cloud_saves c where c.user_id = p_id;
  if v is null then return null; end if;
  perform public.admin_note_log(v_admin, 'view save', p_id, null);
  return v;
end;
$$;

-- A letter from the developer to one player (arrives in their mailbox the next time they play).
create or replace function public.admin_letter_to(p_id uuid, p_title text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := public.admin_guard();
  v_id uuid;
begin
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_body), '') = '' then raise exception 'empty'; end if;
  if not exists (select 1 from auth.users u where u.id = p_id) then raise exception 'not found'; end if;
  insert into public.admin_letters (title, body, audience, recipients, created_by)
  values (left(btrim(p_title), 80), left(btrim(p_body), 2000), 'player', 1, v_admin)
  returning id into v_id;
  insert into public.admin_letter_inbox (letter_id, user_id) values (v_id, p_id);
  perform public.admin_note_log(v_admin, 'letter to player', p_id, jsonb_build_object('title', p_title));
  return v_id;
end;
$$;

-- A phone notification to one player (on every device they switched notifications on). Returns the devices.
create or replace function public.admin_push_to(p_id uuid, p_title text, p_body text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := public.admin_guard();
  n integer;
begin
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_body), '') = '' then raise exception 'empty'; end if;
  select count(*) into n from public.push_subscriptions s where s.user_id = p_id;
  if n = 0 then raise exception 'notifications are off for this player'; end if;
  insert into public.push_schedule (user_id, fire_at, kind, title, body)
  values (p_id, now(), 'news', left(btrim(p_title), 80), left(btrim(p_body), 200));
  perform public.admin_note_log(v_admin, 'notification to player', p_id, jsonb_build_object('title', p_title, 'body', p_body));
  return n;
end;
$$;

-- Clear a leaderboard fair-play flag (the player stays hidden or shown as they are; use admin_set_hidden for that).
create or replace function public.admin_clear_lb_flag(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := public.admin_guard();
  v_flag text;
begin
  select p.lb_flag into v_flag from public.profiles p where p.id = p_id;
  update public.profiles p set lb_flag = null, lb_flagged_at = null where p.id = p_id;
  perform public.admin_note_log(v_admin, 'clear leaderboard flag', p_id, jsonb_build_object('flag', v_flag));
end;
$$;

revoke all on function public.admin_player_deep(uuid) from public, anon;
revoke all on function public.admin_player_save(uuid) from public, anon;
revoke all on function public.admin_letter_to(uuid, text, text) from public, anon;
revoke all on function public.admin_push_to(uuid, text, text) from public, anon;
revoke all on function public.admin_clear_lb_flag(uuid) from public, anon;
grant execute on function public.admin_player_deep(uuid) to authenticated;
grant execute on function public.admin_player_save(uuid) to authenticated;
grant execute on function public.admin_letter_to(uuid, text, text) to authenticated;
grant execute on function public.admin_push_to(uuid, text, text) to authenticated;
grant execute on function public.admin_clear_lb_flag(uuid) to authenticated;

-- ===== account locks =====
-- Suspending a player (ADMIN.md "Locking a player"): from the dashboard's player page an admin locks an account until
-- a time (or with no end), with a reason the player sees. While locked the game shows a full-screen notice with the
-- reason and a countdown (my_lock), and the server refuses the player's online actions: gifts, market, help and
-- likes, Ask a friend, Village Projects, sharing their farm and reward codes (assert_not_locked in each). Locking
-- also hides them from the leaderboards; unlocking puts them back unless they were hidden before. Every lock is
-- kept as history; deleting the account deletes its locks (on delete cascade).

create table if not exists public.account_locks (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  locked_at   timestamptz not null default now(),
  -- null = no end date
  until_at    timestamptz,
  reason      text not null check (char_length(reason) between 1 and 500),
  locked_by   text,
  -- the lock hid the player from the leaderboards (unlocking shows them again)
  hid         boolean not null default false,
  lifted_at   timestamptz,
  lifted_by   text
);
create index if not exists account_locks_user_idx on public.account_locks (user_id, locked_at desc);
create index if not exists account_locks_open_idx on public.account_locks (user_id) where lifted_at is null;
alter table public.account_locks enable row level security;
revoke all on public.account_locks from anon, authenticated, public;

-- The lock in force for a player right now, if any.
create or replace function public.active_lock(p_uid uuid)
returns public.account_locks
language sql
stable
security definer
set search_path = ''
as $$
  select l.* from public.account_locks l
   where l.user_id = p_uid and l.lifted_at is null and (l.until_at is null or l.until_at > now())
   order by l.locked_at desc limit 1;
$$;

-- Called at the start of the player functions that reach other players or the server's shared state.
create or replace function public.assert_not_locked(p_uid uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_uid is not null and (public.active_lock(p_uid)).id is not null then raise exception 'account locked'; end if;
end;
$$;

-- For the game: the caller's lock (until, reason) or null. The game shows its lock screen from this.
create or replace function public.my_lock()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l public.account_locks;
begin
  if auth.uid() is null then return null; end if;
  l := public.active_lock(auth.uid());
  if l.id is null then return null; end if;
  return jsonb_build_object('until', l.until_at, 'reason', l.reason, 'since', l.locked_at, 'now', now());
end;
$$;

-- Lock a player until p_until (null = no end date) with a reason they will see. Replaces a lock already in force.
create or replace function public.admin_lock_player(p_id uuid, p_until timestamptz, p_reason text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := public.admin_guard();
  v_hidden boolean;
  v_hid boolean := false;
  v_id bigint;
begin
  if coalesce(btrim(p_reason), '') = '' then raise exception 'write a reason'; end if;
  if p_until is not null and p_until <= now() then raise exception 'the end time is in the past'; end if;
  if not exists (select 1 from auth.users u where u.id = p_id) then raise exception 'not found'; end if;
  -- a lock already in force is replaced; it keeps track of whether the player was hidden before any lock
  select coalesce(bool_or(l.hid), false) into v_hid from public.account_locks l where l.user_id = p_id and l.lifted_at is null;
  update public.account_locks l set lifted_at = now(), lifted_by = v_admin where l.user_id = p_id and l.lifted_at is null;
  select p.lb_hidden into v_hidden from public.profiles p where p.id = p_id;
  if coalesce(v_hidden, false) = false then
    update public.profiles p set lb_hidden = true where p.id = p_id;
    v_hid := true;
  end if;
  insert into public.account_locks (user_id, until_at, reason, locked_by, hid)
  values (p_id, p_until, left(btrim(p_reason), 500), v_admin, v_hid)
  returning id into v_id;
  perform public.admin_note_log(v_admin, 'lock player', p_id, jsonb_build_object('until', p_until, 'reason', left(btrim(p_reason), 500)));
  return v_id;
end;
$$;

-- Lift a player's lock now (and put them back on the leaderboards if the lock hid them).
create or replace function public.admin_unlock_player(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := public.admin_guard();
  v_hid boolean;
begin
  select coalesce(bool_or(l.hid), false) into v_hid from public.account_locks l where l.user_id = p_id and l.lifted_at is null;
  update public.account_locks l set lifted_at = now(), lifted_by = v_admin where l.user_id = p_id and l.lifted_at is null;
  if v_hid then update public.profiles p set lb_hidden = false where p.id = p_id; end if;
  perform public.admin_note_log(v_admin, 'unlock player', p_id, null);
end;
$$;

-- Locks that ran out on their own put the player back on the leaderboards too (run by the jobs below and by the
-- dashboard; cheap). Marks them lifted by 'expired'.
create or replace function public.expire_account_locks()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_users uuid[];
  n integer;
begin
  with done as (
    update public.account_locks l set lifted_at = l.until_at, lifted_by = 'expired'
     where l.lifted_at is null and l.until_at is not null and l.until_at <= now()
    returning l.user_id, l.hid)
  select array_agg(d.user_id) filter (where d.hid), count(*) into v_users, n from done d;
  -- a separate statement, so it sees the locks just lifted (another lock still in force keeps them hidden)
  if v_users is not null then
    update public.profiles p set lb_hidden = false
     where p.id = any (v_users)
       and not exists (select 1 from public.account_locks x where x.user_id = p.id and x.lifted_at is null);
  end if;
  return n;
end;
$$;

-- Every lock a player has had, newest first (the dashboard's player page).
create or replace function public.admin_player_locks(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  perform public.expire_account_locks();
  return (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'lockedAt', l.locked_at, 'until', l.until_at, 'reason', l.reason,
            'by', l.locked_by, 'liftedAt', l.lifted_at, 'liftedBy', l.lifted_by,
            'active', l.lifted_at is null and (l.until_at is null or l.until_at > now())) order by l.locked_at desc), '[]'::jsonb)
            from public.account_locks l where l.user_id = p_id);
end;
$$;

-- Everyone locked right now (the dashboard's Players list filter and badge).
create or replace function public.admin_locked_players()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  perform public.expire_account_locks();
  return (select coalesce(jsonb_object_agg(l.user_id, jsonb_build_object('until', l.until_at, 'reason', l.reason)), '{}'::jsonb)
            from public.account_locks l where l.lifted_at is null and (l.until_at is null or l.until_at > now()));
end;
$$;

-- Every 10 minutes (needs pg_cron; scheduling the same name again updates the job). Never stops this file: without
-- pg_cron, or if scheduling is refused, expired locks are still lifted whenever the dashboard looks at locks.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('cozy-expire-locks', '*/10 * * * *', 'select public.expire_account_locks()');
  end if;
exception when others then
  raise notice 'Account locks: the expiry schedule was not created (%). Locks still end on time.', sqlerrm;
end;
$$;

revoke all on function public.active_lock(uuid) from public, anon, authenticated;
revoke all on function public.assert_not_locked(uuid) from public, anon, authenticated;
revoke all on function public.expire_account_locks() from public, anon, authenticated;
revoke all on function public.my_lock() from public, anon;
revoke all on function public.admin_lock_player(uuid, timestamptz, text) from public, anon;
revoke all on function public.admin_unlock_player(uuid) from public, anon;
revoke all on function public.admin_player_locks(uuid) from public, anon;
revoke all on function public.admin_locked_players() from public, anon;
grant execute on function public.my_lock() to authenticated;
grant execute on function public.admin_lock_player(uuid, timestamptz, text) to authenticated;
grant execute on function public.admin_unlock_player(uuid) to authenticated;
grant execute on function public.admin_player_locks(uuid) to authenticated;
grant execute on function public.admin_locked_players() to authenticated;
