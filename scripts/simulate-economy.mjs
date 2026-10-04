// Economy and growth simulation for Cozy Acres.
//
// Reads src/data/*.json and plays an engaged player for N days: a long first session (the "first hour"), then a
// few short check-ins a day. The player harvests, replants, feeds animals, runs every production building, fills
// orders and trucks, sells spare goods at the stall, and spends coins on fields, buildings, animals, upgrades,
// land, farmhouse levels and decorations. Timers keep running between sessions like the real game.
//
// It prints: time to every level (active play and real days), what each level unlocks and how long it took to
// afford, income and XP per hour by source and level band, per-minute value tables for crops, trees, animals and
// recipes, and a list of flagged balance problems.
//
//   node scripts/simulate-economy.mjs                    # 60 days, 3 sessions a day of 12 min, 60 min first session
//   node scripts/simulate-economy.mjs --days 30 --sessions 4 --session-min 15
//   node scripts/simulate-economy.mjs --json             # machine-readable summary
//   node scripts/simulate-economy.mjs --brief            # only the level table and the flags
//   node scripts/simulate-economy.mjs --data /tmp/old    # simulate another copy of src/data (before/after)
//   DEBUG_TRUCK=1 / DEBUG_ORDERS=1 (or 2)                 # log trucks that leave and orders given up on
//
// The model is deliberately simple (a greedy player, averaged crate rewards, approximated achievements), so treat
// the output as the shape of the curve, not exact minutes. Keep the policy honest: it should play like a keen
// player, not an optimiser.
import { readFileSync, existsSync } from 'node:fs';

// ------------------------------------------------------------------ options
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : typeof def === 'number' ? Number(v) : v;
};
const DAYS = opt('days', 60);
const SESSIONS = opt('sessions', 3);
const SESSION_MIN = opt('session-min', 12);
const FIRST_MIN = opt('first-min', 60);
const SEED = opt('seed', 7);
const JSON_OUT = !!opt('json', false);
const BRIEF = !!opt('brief', false);
const STEP = 10; // seconds between player actions while online
const XP_W = 2; // how many coins one XP is worth to the player's choices
const STALL_MULT = Number(opt('stall-mult', 0)) || null; // price the player lists at (default: the max allowed)
const SPEEDUPS = !opt('no-speedups', false); // spend spare gems on building and upgrade timers
const GEM_KEEP = 30;
// Attention: every tap, swipe and panel costs the player a few seconds, and only part of a session goes into
// farming (reading, looking around, decorating by hand, chatting...). EFF_FIRST covers the first session, where
// the tutorial and learning the game take most of the time; it is calibrated so the unchanged data matches the
// first-hour targets in BALANCE.md and tools/playtest.mjs.
const EFF_FIRST = opt('eff-first', 0.3);
const EFF = opt('eff', 0.6);
let budget = 0, shopBudget = 0;
const busy = (sec) => { if (budget < sec) return false; budget -= sec; return true; };
/** Shopping and decorating come out of their own slice of the session, so farming chores cannot starve them. */
const shopBusy = (sec) => { if (shopBudget < sec) return false; shopBudget -= sec; return true; };

// ------------------------------------------------------------------ data
const DATA = opt('data', null);
const dir = DATA ? new URL(`file://${DATA.startsWith('/') ? DATA : `${process.cwd()}/${DATA}`}/`) : new URL('../src/data/', import.meta.url);
const read = (f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
const { crops: CROPS, trees: TREES } = read('crops.json');
const { animals: ANIMALS, costGrowth: ANIMAL_GROWTH } = read('animals.json');
const ITEMS = read('items.json').items;
const RECIPES = read('recipes.json').recipes;
const { buildings: BUILDINGS, farmhouse: FARMHOUSE, upgrades: UPGRADES } = read('buildings.json');
const LV = read('levels.json');
const ECON = read('economy.json');
const LAND = read('land.json');
const REWARDS = read('rewards.json');
const QUESTS = read('quests.json');
const ACH = read('achievements.json');
// fishing at the dock (optional so older data sets in --data still run)
const FISHING = existsSync(new URL('fish.json', dir)) ? read('fish.json') : null;

const BLD = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));
const CROP = Object.fromEntries(CROPS.map((c) => [c.id, c]));
const TREE = Object.fromEntries(TREES.map((t) => [t.id, t]));
const ANIMAL = Object.fromEntries(ANIMALS.map((a) => [a.id, a]));
const RECIPE_OF = {};
for (const r of RECIPES) RECIPE_OF[r.item] ??= r;
const MAX_LEVEL = LV.maxLevel;
const xpToNext = (l) => LV.levels[l - 1]?.xpToNext ?? 0;
const sell = (i) => ITEMS[i]?.sell ?? 0;
const itemXp = (i) => Math.max(1, Math.round(sell(i) / ECON.orders.xpDivisor));
const ITEM_LEVEL = {};
for (const c of CROPS) ITEM_LEVEL[c.id] = c.level;
for (const t of TREES) ITEM_LEVEL[t.item] = t.level;
for (const a of ANIMALS) ITEM_LEVEL[a.product] = a.level;
for (const r of RECIPES) ITEM_LEVEL[r.item] = Math.min(ITEM_LEVEL[r.item] ?? 99, Math.max(r.level, BLD[r.building]?.level ?? 1));
const inputValue = (r) => Object.entries(r.in).reduce((s, [i, n]) => s + sell(i) * n, 0);
const valueAdd = (r) => r.out * sell(r.item) - inputValue(r);

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);

// ------------------------------------------------------------------ sessions
const HOUR = 3600, DAY = 86400;
const sessions = [];
{
  const hours = SESSIONS === 1 ? [19] : Array.from({ length: SESSIONS }, (_, k) => 8 + (k * 13) / (SESSIONS - 1));
  for (let d = 0; d < DAYS; d++) {
    hours.forEach((h, k) => {
      const start = d * DAY + Math.round(h * HOUR);
      const len = d === 0 && k === 0 ? FIRST_MIN : SESSION_MIN;
      sessions.push({ day: d, index: k, start, end: start + len * 60 });
    });
  }
}
const END = DAYS * DAY;
/** Earliest time >= x when the player is online (or END). */
function nextOnline(x) {
  let lo = 0, hi = sessions.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sessions[m].end <= x) lo = m + 1; else hi = m; }
  if (lo >= sessions.length) return END + DAY;
  return Math.max(x, sessions[lo].start);
}

// ------------------------------------------------------------------ state
const S = {
  t: 0, level: 1, xp: 0, coins: ECON.start.coins, gems: ECON.start.gems, active: 0,
  inv: { ...ECON.start.items },
  fields: [], trees: [], homes: [], prods: [],
  fh: { level: 1, upEnd: 0, pending: 0 },
  stall: null, depot: null, stallSlots: [],
  orders: [], nextOrder: 1, truck: null, truckNextAt: 0,
  land: 0, tiles: 0, decor: [], decorCharm: 0, decorCount: 0,
  stats: {}, ach: {}, crates: [], streak: 0,
  usedRecipes: {}, requested: {}, produced: {}, fishCaught: {},
};
for (let i = 0; i < 6; i++) S.fields.push(i >= 4 ? { crop: 'wheat', readyAt: 0 } : { crop: null, readyAt: 0 });
// usable tiles: 4 starting chunks, minus borders, obstacles and the starting buildings (with walking room)
const SPACE = 1.5;
S.tiles = 4 * 64 * 0.8 - (9 + 9 + 4 + 6 * 4) * SPACE;

// ledgers
const levelInfo = Array.from({ length: MAX_LEVEL + 1 }, () => ({ t: null, active: null, coinsAt: 0, earned: {}, xp: {}, spent: {} }));
levelInfo[1].t = 0; levelInfo[1].active = 0;
const unlockLog = []; // { level, kind, id, cost, unlockedAt, boughtAt }
const unlockIndex = new Map();
const add = (o, k, n) => { o[k] = (o[k] ?? 0) + n; };

function stat(name, n = 1) {
  add(S.stats, name, n);
  checkAch(name);
}
function gauge(name, v) {
  S.stats[name] = Math.max(S.stats[name] ?? 0, v);
  checkAch(name);
}
function checkAch(name) {
  for (const a of ACH.achievements) {
    if (a.stat !== name) continue;
    let tier = S.ach[a.id] ?? 0;
    while (tier < 3 && (S.stats[name] ?? 0) >= a.tiers[tier]) {
      tier++;
      S.ach[a.id] = tier;
      const r = ACH.rewards[tier - 1];
      addCoins(r.coins, 'awards'); addGems(r.gems, 'awards'); addXp(r.xp, 'awards');
    }
  }
}
function addCoins(n, src) {
  if (n <= 0) return;
  S.coins += n;
  add(levelInfo[S.level].earned, src, n);
  stat('coins_earned', n);
}
function spend(n, sink) {
  S.coins -= n;
  add(levelInfo[S.level].spent, sink, n);
  stat('coins_spent', n);
}
const gemLog = { earned: {}, spent: {} };
function addGems(n, src) {
  if (n <= 0) return;
  S.gems += n; add(gemLog.earned, src, n);
  stat('gems_earned', n);
}
function addXp(n, src) {
  if (n <= 0) return;
  add(levelInfo[S.level].xp, src, n);
  if (S.level >= MAX_LEVEL) return;
  S.xp += n;
  while (S.level < MAX_LEVEL && S.xp >= xpToNext(S.level)) {
    S.xp -= xpToNext(S.level);
    S.level++;
    const li = levelInfo[S.level];
    li.t = S.t; li.active = S.active; li.coinsAt = S.coins;
    const def = LV.levels[S.level - 1];
    addCoins(def.coins, 'level-ups'); addGems(def.gems, 'level-ups');
    gauge('level', S.level);
    onLevel(S.level);
  }
}

// unlock bookkeeping: what each level opens, and when the player first bought it
function registerUnlocks() {
  const reg = (level, kind, id, cost) => {
    const u = { level, kind, id, cost, unlockedAt: null, boughtAt: null };
    unlockLog.push(u); unlockIndex.set(`${kind}:${id}`, u);
  };
  for (const c of CROPS) reg(c.level, 'crop', c.id, 0);
  for (const b of BUILDINGS) if (!b.event && b.cost > 0 && b.id !== 'plot') reg(b.level, b.cat === 'decor' ? 'decor' : 'building', b.id, b.cost);
  for (const a of ANIMALS) reg(a.level, 'animal', a.id, a.cost);
  for (const r of RECIPES) reg(r.level, 'recipe', r.id, 0);
  FARMHOUSE.levels.slice(1).forEach((f) => reg(f.playerLevel, 'farmhouse', `level ${f.level}`, f.cost));
}
registerUnlocks();
function onLevel(l) {
  for (const u of unlockLog) if (u.level === l && u.unlockedAt === null) {
    u.unlockedAt = S.t;
    if (u.cost === 0) u.boughtAt = S.t;
  }
  fillOrders();
}
for (const u of unlockLog) if (u.level <= 1) { u.unlockedAt = 0; if (!u.cost) u.boughtAt = 0; }
function upgradesDone() {
  for (const b of [...S.prods, ...S.homes]) if (b.pendingLevel && b.upEnd <= S.t) { b.level = b.pendingLevel; b.pendingLevel = 0; }
}
/** Spare gems go on skipping construction and upgrade timers (the game's main gem sink). */
function useGems() {
  if (!SPEEDUPS) return;
  const cost = (sec) => Math.max(ECON.speedup.minGems, Math.ceil(sec / 60 * ECON.speedup.gemsPerMinute));
  const timers = [];
  if (S.fh.pending && S.fh.upEnd > S.t) timers.push([S.fh.upEnd - S.t, () => { S.fh.upEnd = S.t; }]);
  for (const b of [...S.prods, ...S.homes]) {
    if (b.built > S.t) timers.push([b.built - S.t, () => { b.built = S.t; }]);
    if (b.pendingLevel && b.upEnd > S.t) timers.push([b.upEnd - S.t, () => { b.upEnd = S.t; }]);
  }
  for (const [left, finish] of timers) {
    const c = cost(left);
    if (left < 600 || S.gems - c < GEM_KEEP) continue;
    S.gems -= c; add(gemLog.spent, 'speed-ups', c); finish();
  }
  upgradesDone();
}
function markBought(kind, id) {
  const u = unlockIndex.get(`${kind}:${id}`);
  if (u && u.boughtAt === null) u.boughtAt = S.t;
}

// ------------------------------------------------------------------ derived
const count = (i) => S.inv[i] ?? 0;
const give = (i, n) => { S.inv[i] = count(i) + n; };
const take = (i, n) => { S.inv[i] = count(i) - n; };
const built = (b) => b.built <= S.t;
const capOf = (key) => FARMHOUSE.caps[key][S.fh.level - 1];
const animalsOwned = (id) => S.homes.filter((h) => BLD[h.type].animal === id).reduce((s, h) => s + h.animals.length, 0);
const homesOf = (type) => S.homes.filter((h) => h.type === type);
const prodsOf = (type) => S.prods.filter((p) => p.type === type);
const charm = () => S.decorCharm + S.trees.length + S.homes.reduce((s, h) => s + BLD[h.type].charm, 0) +
  S.prods.reduce((s, p) => s + BLD[p.type].charm, 0) + (S.stall ? BLD.roadside_stall.charm : 0) + (S.depot ? BLD.truck_depot.charm : 0);
function bonuses() {
  const c = ECON.charm, steps = Math.floor(charm() / c.step);
  return { growth: Math.min(c.growthMax, steps * c.growthPerStep), orderCoins: Math.min(c.orderCoinsMax, steps * c.orderCoinsPerStep) };
}
const growEff = (sec) => Math.max(5, Math.round(sec * (1 - bonuses().growth)));
const slotsOf = (p) => UPGRADES.production.baseSlots + (p.level - 1);
const capacityOf = (h) => UPGRADES.animal.baseCapacity + (h.level - 1);

function obtainable() {
  const out = new Set();
  for (const c of CROPS) if (c.level <= S.level) out.add(c.id);
  for (const t of S.trees) out.add(TREE[t.type].item);
  for (const h of S.homes) if (h.animals.length) out.add(ANIMAL[BLD[h.type].animal].product);
  // common fish that bite at any time, once caught (like the game's fishing.orderable())
  for (const f of FISHING?.species ?? []) if (f.rarity === 'common' && f.level <= S.level && f.times.length === 4 && S.fishCaught[f.id]) out.add(f.id);
  const makeable = RECIPES.filter((r) => r.level <= S.level && S.prods.some((p) => p.type === r.building && built(p)));
  for (let changed = true; changed;) {
    changed = false;
    for (const r of makeable) {
      if (out.has(r.item)) continue;
      if (Object.keys(r.in).every((i) => out.has(i))) { out.add(r.item); changed = true; }
    }
  }
  return [...out].filter((i) => ITEMS[i] && ITEMS[i].cat !== 'feed' && ITEMS[i].cat !== 'event');
}

// ------------------------------------------------------------------ orders and truck
function orderSlots() {
  let n = 3;
  for (const [lv, s] of Object.entries(LV.orderSlots)) if (S.level >= Number(lv)) n = s;
  return n;
}
function maxQty() {
  let q = 3;
  for (const [lv, n] of ECON.orders.maxQtyByLevel) if (S.level >= lv) q = n;
  return q;
}
function genOrder(readyAt, forced) {
  const id = S.nextOrder++;
  let lines;
  if (forced) lines = forced;
  else {
    const pool = obtainable();
    const weights = pool.map((i) => 1 + Math.min(3, (ITEM_LEVEL[i] ?? 1) / Math.max(1, S.level) * 2) + (ITEMS[i].cat === 'crop' ? 1 : 0));
    const total = weights.reduce((a, b) => a + b, 0);
    const pick = () => { let x = rnd() * total; for (let k = 0; k < pool.length; k++) { x -= weights[k]; if (x <= 0) return pool[k]; } return pool[0]; };
    const nLines = Math.min(ECON.orders.maxLines, S.level < 3 ? 1 : S.level < 8 ? 1 + Math.floor(rnd() * 2) : 1 + Math.floor(rnd() * 3));
    const used = new Set();
    const others = new Set(S.orders.flatMap((o) => o.lines.map((l) => l.item)));
    lines = [];
    for (let k = 0; k < nLines; k++) {
      let item = pick();
      for (let t = 0; t < 8 && (used.has(item) || (t < 5 && others.has(item))); t++) item = pick();
      if (used.has(item)) continue;
      used.add(item);
      const v = sell(item);
      const cap = Math.max(1, Math.round(maxQty() * (v > 150 ? 0.4 : v > 60 ? 0.7 : 1)));
      lines.push({ item, qty: 1 + Math.floor(rnd() * cap) });
    }
  }
  for (const l of lines) add(S.requested, l.item, l.qty);
  const value = lines.reduce((s, l) => s + sell(l.item) * l.qty, 0);
  return {
    id, lines, readyAt, posted: readyAt,
    coins: Math.round(value * ECON.orders.coinMult * (1 + bonuses().orderCoins)),
    xp: Math.max(ECON.orders.minXp, lines.reduce((s, l) => s + itemXp(l.item) * l.qty, 0)),
    gems: rnd() < ECON.orders.gemChance ? 1 : 0,
  };
}
function fillOrders() {
  if (S.nextOrder === 1 && !S.orders.length) S.orders.push(genOrder(S.t, [{ item: 'wheat', qty: 2 }]));
  while (S.orders.length < orderSlots()) S.orders.push(genOrder(S.t));
}
const catOf = (i) => ITEMS[i]?.cat ?? 'other';
function completeOrders() {
  for (let k = 0; k < S.orders.length; k++) {
    const o = S.orders[k];
    if (o.readyAt > S.t || !o.lines.every((l) => count(l.item) >= l.qty)) continue;
    if (!busy(5)) return;
    const value = o.lines.reduce((s, l) => s + sell(l.item) * l.qty, 0);
    for (const l of o.lines) take(l.item, l.qty);
    // split order coins across item categories so income-by-source stays meaningful
    for (const l of o.lines) addCoins(Math.round(o.coins * sell(l.item) * l.qty / value), `orders/${catOf(l.item)}`);
    addXp(o.xp, 'orders');
    if (o.gems) addGems(o.gems, 'orders');
    stat('orders_completed');
    S.orders[k] = genOrder(S.t + ECON.orders.refillSec);
  }
}
function discardStale() {
  for (let k = 0; k < S.orders.length; k++) {
    const o = S.orders[k];
    o.seen = (o.seen ?? 0) + 1;
    // a player gives up on an order that has sat on the board for three visits without getting closer
    if (o.readyAt <= S.t && o.seen > 3 && !o.lines.every((l) => count(l.item) >= l.qty)) {
      if (process.env.DEBUG_ORDERS) console.error(`L${S.level} d${(S.t / DAY).toFixed(1)} discard: ${o.lines.map((l) => `${l.item}x${l.qty}(${count(l.item)})`).join(' ')}`);
      if (process.env.DEBUG_ORDERS > 1) for (const p of S.prods) console.error(`   ${p.type} L${p.level}: ${p.queue.map((q) => `${q.recipe}${q.demanded ? '!' : ''}@${Math.round((q.end - S.t) / 60)}m`).join(' ')}`);
      if (process.env.DEBUG_ORDERS > 1) console.error(`   inv ${JSON.stringify(S.inv)}`);
      S.orders[k] = genOrder(S.t + ECON.orders.discardSec);
      stat('orders_discarded');
    }
  }
}
function truckTick() {
  if (!S.depot || !built(S.depot)) return;
  if (S.truck && S.t >= S.truck.leavesAt) {
    if (process.env.DEBUG_TRUCK) console.error(`L${S.level} d${(S.t / DAY).toFixed(1)} truck left: ${S.truck.crates.map((c) => `${c.item}x${c.qty}${c.filled ? '+' : `(${count(c.item)})`}`).join(' ')}`);
    S.truckNextAt = S.truck.leavesAt + ECON.truck.cooldownSec; S.truck = null; stat("trucks_missed");
  }
  if (S.truck || S.t < S.truckNextAt) return;
  const pool = obtainable();
  if (pool.length < 3) return;
  const [lo, hi] = ECON.truck.crates;
  const n = Math.min(hi, lo + Math.floor(S.level / 8));
  const left = [...pool], crates = [];
  for (let i = 0; i < n; i++) {
    const item = left.length ? left.splice(Math.floor(rnd() * left.length), 1)[0] : pool[Math.floor(rnd() * pool.length)];
    const v = sell(item);
    const qty = Math.max(2, Math.round((v > 150 ? 2 : v > 60 ? 4 : 7) * ECON.truck.qtyMult * (0.7 + rnd() * 0.6)));
    add(S.requested, item, qty);
    crates.push({ item, qty, coins: Math.round(v * qty * ECON.truck.coinMult), xp: itemXp(item) * qty, filled: false });
  }
  S.truck = { crates, leavesAt: S.t + ECON.truck.durationSec, bonus: Math.round(crates.reduce((s, c) => s + c.coins, 0) * ECON.truck.bonusMult) };
}
function truckFill() {
  const tr = S.truck;
  if (!tr) return;
  for (const c of tr.crates) {
    if (c.filled || count(c.item) < c.qty) continue;
    if (!busy(4)) return;
    take(c.item, c.qty); c.filled = true;
    addCoins(c.coins, `truck/${catOf(c.item)}`); addXp(c.xp, 'truck');
    stat('truck_crates');
  }
  if (tr.crates.every((c) => c.filled)) {
    addCoins(tr.bonus, 'truck/bonus');
    openCrate(ECON.truck.rewardCrate);
    stat('trucks_completed');
    S.truck = null; S.truckNextAt = S.t + ECON.truck.cooldownSec;
  }
}

// ------------------------------------------------------------------ crates (rolled like the game)
const decorPool = BUILDINGS.filter((b) => b.cat === 'decor' && !b.event && !b.path);
function openCrate(rarity) {
  const C = REWARDS.crates;
  const ix = C.rarities.indexOf(rarity);
  const up = C.upgradeChance[rarity];
  let x = rnd(), final = rarity;
  for (let k = 0; k < up.length; k++) { x -= up[k]; if (x <= 0) { final = C.rarities[k]; break; } }
  if (C.rarities.indexOf(final) < ix) final = rarity;
  const pool = C.pools[final];
  const scale = 1 + S.level * 0.06;
  for (let i = 0; i < C.rolls[final]; i++) {
    let w = rnd() * pool.reduce((s, p) => s + p.w, 0), pick = pool[0];
    for (const p of pool) { w -= p.w; if (w <= 0) { pick = p; break; } }
    const amt = (lo = 1, hi = 1) => lo + Math.floor(rnd() * (hi - lo + 1));
    if (pick.type === 'coins') addCoins(Math.round(amt(pick.min, pick.max) * scale), 'crates');
    else if (pick.type === 'gems') addGems(amt(pick.min, pick.max), 'crates');
    else if (pick.type === 'items') {
      const crops = CROPS.filter((c) => c.level <= S.level);
      give(crops[Math.floor(rnd() * crops.length)].id, amt(pick.min, pick.max));
    } else if (pick.type === 'decor') {
      const cap = final === 'legendary' ? 99 : final === 'epic' ? S.level + 15 : S.level + 6;
      const list = decorPool.filter((b) => b.level <= cap && b.cost >= (final === 'rare' ? 20 : 150));
      const d = list[Math.floor(rnd() * list.length)];
      if (S.decorCount < capOf('decor')) placeDecor(d, true);
    }
  }
  stat('crates_opened');
  if (final === 'legendary') stat('legendary_crates');
}

// ------------------------------------------------------------------ demand: what orders, trucks and feed need
function pipeline() {
  const p = {};
  for (const f of S.fields) if (f.crop) add(p, f.crop, CROP[f.crop].yield);
  for (const pr of S.prods) for (const q of pr.queue) add(p, q.item, q.out);
  for (const h of S.homes) { const a = ANIMAL[BLD[h.type].animal]; for (const x of h.animals) if (x.fedAt !== null) add(p, a.product, 1); }
  for (const t of S.trees) add(p, TREE[t.type].item, TREE[t.type].yield);
  return p;
}
function demand() {
  const want = {}, reserved = {};
  for (const o of S.orders) if (o.readyAt <= S.t + 600) for (const l of o.lines) add(want, l.item, l.qty);
  if (S.truck) for (const c of S.truck.crates) if (!c.filled) add(want, c.item, c.qty);
  Object.assign(reserved, want);
  // feed: keep two rounds per animal
  for (const a of ANIMALS) { const n = animalsOwned(a.id); if (n) add(want, a.feed, n * 2); }
  // a little bait for fishing once the dock opens
  if (FISHING && S.level >= FISHING.level) add(want, FISHING.baitItem, 4);
  const pipe = pipeline();
  const short = {};
  const queue = Object.entries(want).map(([i, n]) => [i, n - count(i) - (pipe[i] ?? 0)]);
  const seen = {};
  while (queue.length) {
    const [item, n] = queue.shift();
    if (n <= 0) continue;
    add(short, item, n);
    if ((seen[item] = (seen[item] ?? 0) + 1) > 6) continue;
    const r = RECIPE_OF[item];
    if (r && r.level <= S.level && prodsOf(r.building).length) {
      const batches = Math.ceil(n / r.out);
      for (const [i, k] of Object.entries(r.in)) queue.push([i, batches * k - Math.max(0, count(i) - (reserved[i] ?? 0))]);
    }
    const an = ANIMALS.find((a) => a.product === item);
    if (an && animalsOwned(an.id)) queue.push([an.feed, n - Math.max(0, count(an.feed) - animalsOwned(an.id))]);
  }
  return { short, reserved };
}

// ------------------------------------------------------------------ choices
/** Coins + XP per second of a crop, given when the player will next be around to harvest it. */
function cropScore(c, t) {
  const harvestAt = nextOnline(t + growEff(c.growSec));
  return (c.yield * sell(c.id) * 1.4 + XP_W * c.xp - c.seedCost) / Math.max(STEP, harvestAt - t);
}
function bestCrop(t) {
  let best = null, bs = -1;
  for (const c of CROPS) if (c.level <= S.level) { const s = cropScore(c, t); if (s > bs) { bs = s; best = c; } }
  return best;
}
function recipeScore(r, gap, slots) {
  return (valueAdd(r) * 1.4 + XP_W * r.xp) / Math.max(r.sec, gap / slots);
}
const available = (i, reserved) => count(i) - (reserved[i] ?? 0);
function canMake(r, reserved) { return Object.entries(r.in).every(([i, n]) => available(i, reserved) >= n); }
function make(p, r, demanded = false) {
  for (const [i, n] of Object.entries(r.in)) take(i, n);
  const last = p.queue.length ? p.queue[p.queue.length - 1].end : S.t;
  const start = Math.max(S.t, last);
  p.queue.push({ item: r.item, out: r.out, xp: r.xp, recipe: r.id, start, end: start + r.sec, demanded });
  add(S.usedRecipes, r.id, 1);
}

// ------------------------------------------------------------------ actions
function collect() {
  for (const f of S.fields) if (f.crop && f.readyAt <= S.t) {
    if (!busy(1)) return;
    const c = CROP[f.crop];
    give(c.id, c.yield); addXp(c.xp, 'crops'); add(S.produced, c.id, c.yield);
    stat('crops_harvested', c.yield); stat(`harvest_${c.id}`, c.yield);
    f.crop = null;
  }
  for (const tr of S.trees) if (tr.readyAt <= S.t) {
    if (!busy(2)) return;
    const d = TREE[tr.type];
    give(d.item, d.yield); addXp(d.xp, 'trees'); add(S.produced, d.item, d.yield);
    stat('fruit_harvested', d.yield);
    tr.readyAt = S.t + growEff(d.growSec);
  }
  for (const h of S.homes) {
    if (!built(h)) continue;
    const a = ANIMAL[BLD[h.type].animal];
    if (h.animals.some((x) => x.fedAt !== null && x.fedAt + a.produceSec <= S.t) && !busy(3)) return;
    for (const x of h.animals) if (x.fedAt !== null && x.fedAt + a.produceSec <= S.t) {
      x.fedAt = null; give(a.product, 1); addXp(a.xp, 'animals'); add(S.produced, a.product, 1);
      stat('animal_products'); stat(`collect_${a.product}`);
    }
  }
  for (const p of S.prods) {
    if (p.queue.length && p.queue[0].end <= S.t && !busy(2)) return;
    while (p.queue.length && p.queue[0].end <= S.t) {
      const q = p.queue.shift();
      give(q.item, q.out); addXp(q.xp, 'production'); add(S.produced, q.item, q.out);
      stat('items_produced', q.out); stat(`made_${p.type}`, q.out);
    }
  }
  for (const s of S.stallSlots) if (s.item && s.soldAt <= S.t) {
    if (!busy(2)) return;
    addCoins(s.price, `stall/${catOf(s.item)}`); stat('stall_sales', s.qty);
    s.item = null;
  }
}
function feed() {
  for (const h of S.homes) {
    if (!built(h)) continue;
    const a = ANIMAL[BLD[h.type].animal];
    for (const x of h.animals) if (x.fedAt === null && count(a.feed) > 0) { take(a.feed, 1); x.fedAt = S.t; stat('animals_fed'); }
  }
}
function produce(dem, sess) {
  const gap = nextOnline(sess.end) - S.t;
  for (const p of S.prods) {
    if (!built(p)) continue;
    const slots = slotsOf(p);
    const recipes = RECIPES.filter((r) => r.building === p.type && r.level <= S.level);
    while (p.queue.filter((q) => q.end > S.t).length < slots) {
      // 1) something an order, truck or hungry animal needs  2) the best value we have ingredients for
      let pick = demandedRecipe(recipes, dem), demanded = !!pick;
      if (!pick) {
        let bs = 0;
        for (const r of recipes) {
          if (ITEMS[r.item].cat === 'feed' && count(r.item) > 4 * Math.max(1, animalsOwnedByFeed(r.item))) continue;
          if (!canMake(r, dem.reserved)) continue;
          // do not use up anything an order, the truck or an animal is waiting on further up the chain
          if (Object.keys(r.in).some((i) => (dem.short[i] ?? 0) > 0)) continue;
          const s = recipeScore(r, gap, slots);
          if (s > bs) { bs = s; pick = r; }
        }
      }
      if (!pick) break;
      if (pick.building !== p.type || !busy(2.5)) break;
      make(p, pick, demanded);
      dem.short[pick.item] = (dem.short[pick.item] ?? 0) - pick.out;
    }
    // queue full but an order needs something from here: take back a filler job that has not started yet
    const want = demandedRecipe(recipes, dem);
    const idx = p.queue.findLastIndex((q) => q.start > S.t && !q.demanded);
    if (want && idx >= 0 && busy(3)) {
      const [q] = p.queue.splice(idx, 1);
      const dur = q.end - q.start;
      for (let k = idx; k < p.queue.length; k++) { p.queue[k].start -= dur; p.queue[k].end -= dur; }
      for (const [i, n] of Object.entries(RECIPES.find((r) => r.id === q.recipe).in)) give(i, n);
      add(S.usedRecipes, q.recipe, -1);
      if (canMake(want, {})) { make(p, want, true); dem.short[want.item] = (dem.short[want.item] ?? 0) - want.out; }
    }
  }
}
function demandedRecipe(recipes, dem) {
  return recipes.filter((r) => (dem.short[r.item] ?? 0) > 0 && canMake(r, {}))
    .sort((a, b) => (dem.short[b.item] ?? 0) * sell(b.item) - (dem.short[a.item] ?? 0) * sell(a.item))[0];
}
function animalsOwnedByFeed(feedItem) { return ANIMALS.filter((a) => a.feed === feedItem).reduce((s, a) => s + animalsOwned(a.id), 0); }
/** Ingredients the production buildings would like in stock for their best recipes. */
function stockWants(sess) {
  const want = {};
  const gap = nextOnline(sess.end) - S.t;
  for (const p of S.prods) {
    const recipes = RECIPES.filter((r) => r.building === p.type && r.level <= S.level && ITEMS[r.item].cat !== 'feed');
    recipes.sort((a, b) => recipeScore(b, gap, slotsOf(p)) - recipeScore(a, gap, slotsOf(p)));
    const r = recipes[0];
    if (r) for (const [i, n] of Object.entries(r.in)) add(want, i, n * slotsOf(p));
  }
  return want;
}
function plant(dem, sess) {
  const empty = S.fields.filter((f) => !f.crop);
  if (!empty.length || !busy(2)) return;
  const stock = stockWants(sess);
  const pipe = pipeline();
  const plan = [];
  const needOf = (src) => {
    for (const [i, n] of Object.entries(src)) {
      const c = CROP[i];
      if (!c || c.level > S.level) continue;
      const short = n - (src === stock ? count(i) + (pipe[i] ?? 0) : 0);
      if (short > 0) plan.push([c, Math.ceil(short / c.yield)]);
    }
  };
  needOf(dem.short);
  needOf(stock);
  const fallback = bestCrop(S.t);
  let k = 0;
  for (const f of empty) {
    let c = fallback;
    while (k < plan.length && plan[k][1] <= 0) k++;
    if (k < plan.length) { c = plan[k][0]; plan[k][1]--; }
    if (!c || S.coins < c.seedCost || !busy(1)) break;
    spend(c.seedCost, 'seeds');
    f.crop = c.id; f.readyAt = S.t + growEff(c.growSec);
    stat('plants_planted');
  }
}
function keepOf(i, dem, stock) {
  const cat = catOf(i);
  if (cat === 'feed' || cat === 'event') return Infinity;
  const base = cat === 'goods' ? 2 : 6;
  return base + (dem.reserved[i] ?? 0) + (dem.short[i] ? 0 : 0) + (stock[i] ?? 0) + (isIngredient(i) ? 6 : 0);
}
const INGREDIENTS = new Set(RECIPES.flatMap((r) => Object.keys(r.in)));
const isIngredient = (i) => INGREDIENTS.has(i);
function sellSurplus(dem, sess) {
  const stock = stockWants(sess);
  const surplus = Object.keys(S.inv).map((i) => [i, count(i) - keepOf(i, dem, stock)]).filter(([, n]) => n > 0)
    .sort((a, b) => sell(b[0]) * b[1] - sell(a[0]) * a[1]);
  if (S.stall && built(S.stall)) {
    for (const s of S.stallSlots) {
      if (s.item || !surplus.length) continue;
      if (!busy(8)) return;
      const [item, qty] = surplus.shift();
      const mult = STALL_MULT ?? ECON.stall.maxPriceMult;
      const v = sell(item) * qty;
      const min = v * ECON.stall.minPriceMult, max = v * ECON.stall.maxPriceMult;
      const price = Math.round(Math.min(max, v * mult));
      const tt = (price - min) / Math.max(1, max - min);
      const [lo, hi] = ECON.stall.buyDelaySec;
      take(item, qty);
      Object.assign(s, { item, qty, price, soldAt: S.t + (lo + (hi - lo) * (0.2 + tt * 0.8)) });
    }
  }
  // the barn takes anything piling up badly
  for (const [item, n] of surplus) if (n > 40) { take(item, n - 20); addCoins(Math.round(sell(item) * (n - 20) * ECON.barn.sellMult), `barn/${catOf(item)}`); }
}

// ------------------------------------------------------------------ shopping
function needTiles(def) { return def.size[0] * def.size[1] * (def.cat === 'decor' ? 1.2 : SPACE); }
function nextExpansion() {
  const e = LAND.expansion, n = S.land;
  return { cost: Math.round(e.baseCost * Math.pow(e.costGrowth, n) / 50) * 50, level: Math.floor(e.baseLevel + n * e.levelStep), n };
}
const MAX_EXPANSIONS = (LAND.mapSize / LAND.chunkSize) ** 2 - LAND.startChunks.length;
function expand() {
  const x = nextExpansion();
  spend(x.cost, 'land'); S.land++; S.tiles += 64 * 0.85; stat('land_expanded');
  addXp(LAND.expansion.xp, 'land');
  // its obstacles get cleared over time: small coins, XP and the odd gem
  const per = LAND.obstacles.perLockedChunk;
  const types = Object.values(LAND.obstacles.types);
  for (let i = 0; i < per; i++) {
    const t = types[Math.floor(rnd() * types.length)];
    spend(t.clearCost, 'clearing'); addCoins(Math.round((t.drops.coins[0] + t.drops.coins[1]) / 2), 'clearing'); addXp(t.xp, 'clearing');
    if (t.drops.gems && rnd() < t.drops.gems) addGems(1, 'clearing');
    stat(t.icon === 'pick' ? 'clear_rock' : 'clear_tree');
  }
  if (S.land === LAND.expansion.gemsAfter) { /* later expansions cost gems in some versions; not here */ }
}
function placeDecor(def, free = false) {
  if (!free) spend(def.cost, 'decor');
  S.decor.push(def.id); S.decorCharm += def.charm; S.decorCount++; S.tiles -= needTiles(def);
  stat('decorations_placed'); gauge('charm', charm());
  markBought('decor', def.id);
}
function candidates() {
  const L = S.level, out = [];
  const push = (prio, cost, def, buy, label) => out.push({ prio, cost, def, buy, label });
  // farmhouse
  const fl = FARMHOUSE.levels[S.fh.level];
  if (fl && L >= fl.playerLevel && S.fh.upEnd <= S.t && !S.fh.pending) {
    push(1, fl.cost, null, () => { spend(fl.cost, 'farmhouse'); S.fh.pending = S.fh.level + 1; S.fh.upEnd = S.t + fl.sec; markBought('farmhouse', `level ${fl.level}`); stat('upgrades_done'); }, `farmhouse ${fl.level}`);
  }
  // special buildings
  if (!S.stall && L >= BLD.roadside_stall.level) push(2, BLD.roadside_stall.cost, BLD.roadside_stall, () => {
    spend(BLD.roadside_stall.cost, 'buildings'); S.stall = { built: S.t + (BLD.roadside_stall.buildSec ?? 0) }; S.tiles -= needTiles(BLD.roadside_stall);
    for (let i = 0; i < ECON.stall.slots; i++) S.stallSlots.push({ item: null });
    markBought('building', 'roadside_stall'); stat('buildings_built');
  }, 'stall');
  if (!S.depot && L >= BLD.truck_depot.level) push(2, BLD.truck_depot.cost, BLD.truck_depot, () => {
    spend(BLD.truck_depot.cost, 'buildings'); S.depot = { built: S.t + BLD.truck_depot.buildSec }; S.tiles -= needTiles(BLD.truck_depot);
    S.truckNextAt = S.depot.built; markBought('building', 'truck_depot'); stat('buildings_built');
  }, 'depot');
  // production buildings and animal homes (first one is urgent, more later)
  for (const def of BUILDINGS) {
    if ((def.cat !== 'production' && def.cat !== 'animal') || def.level > L) continue;
    const have = def.cat === 'production' ? prodsOf(def.id).length : homesOf(def.id).length;
    const cap = capOf(def.cap);
    if (have >= cap) continue;
    push(have ? 6 : 2, def.cost, def, () => {
      spend(def.cost, 'buildings'); S.tiles -= needTiles(def); stat('buildings_built');
      if (def.cat === 'production') S.prods.push({ type: def.id, level: 1, built: S.t + (def.buildSec ?? 0), queue: [] });
      else S.homes.push({ type: def.id, level: 1, built: S.t + (def.buildSec ?? 0), animals: [] });
      markBought('building', def.id);
    }, def.id);
  }
  // animals
  // fill the emptiest home first, so a new kind of animal gets its first residents straight away
  for (const h of [...S.homes].sort((x, y) => x.animals.length - y.animals.length)) {
    if (h.animals.length >= capacityOf(h)) continue;
    const a = ANIMAL[BLD[h.type].animal];
    const price = Math.round(a.cost * (1 + ANIMAL_GROWTH * animalsOwned(a.id)) / 5) * 5;
    push(3, price, null, () => { spend(price, 'animals'); h.animals.push({ fedAt: null }); markBought('animal', a.id); gauge('animals_owned', S.homes.reduce((s, x) => s + x.animals.length, 0)); }, a.id);
    break;
  }
  // fields
  if (S.fields.length < capOf('plot')) {
    const def = BLD.plot;
    const price = def.cost + def.costStep * Math.max(0, S.fields.length - def.freeCount);
    push(4, price, def, () => { spend(price, 'fields'); S.fields.push({ crop: null, readyAt: 0 }); S.tiles -= needTiles(def); gauge('plots_owned', S.fields.length); }, 'field');
  }
  // fruit trees: the newest kind
  if (S.trees.length < capOf('tree')) {
    const kinds = BUILDINGS.filter((b) => b.tree && b.level <= L);
    if (kinds.length) {
      // spread trees over the kinds we have, newest first
      const def = kinds.sort((a, b) => S.trees.filter((t) => t.type === a.tree).length - S.trees.filter((t) => t.type === b.tree).length || b.level - a.level)[0];
      push(5, def.cost, def, () => { spend(def.cost, 'trees'); S.trees.push({ type: def.tree, readyAt: S.t + growEff(TREE[def.tree].growSec) }); S.tiles -= needTiles(def); markBought('building', def.id); stat('trees_planted'); }, def.id);
    }
  }
  // upgrades
  for (const b of [...S.prods, ...S.homes]) {
    const def = BLD[b.type];
    const kind = def.cat === 'production' ? UPGRADES.production : UPGRADES.animal;
    const lv = kind.levels[b.level - 1];
    if (!lv || L < def.level + b.level * 2 || !built(b)) continue;
    const cost = Math.round(lv.cost * (def.upgradeMult ?? 1));
    if (b.pendingLevel) continue;
    push(7, cost, null, () => { spend(cost, 'upgrades'); b.pendingLevel = b.level + 1; b.upEnd = S.t + lv.sec; stat('upgrades_done'); }, `${b.type} upgrade`);
  }
  // land: when we are short of room, or rich
  const x = nextExpansion();
  if (S.land < MAX_EXPANSIONS && L >= x.level) push(S.tiles < 40 ? 1.5 : 8, x.cost, null, expand, 'land');
  // decorations: only from spare coins, see shop()
  return out.sort((a, b) => a.prio - b.prio || a.cost - b.cost);
}
function shop() {
  for (let guard = 0; guard < 60; guard++) {
    const list = candidates();
    let blocked = null, bought = false;
    for (const c of list) {
      if (c.def && c.label !== 'land' && S.tiles < needTiles(c.def)) continue; // no room until we expand
      if (c.prio >= 8 && S.coins < c.cost * 2.5) continue; // land without need: only when comfortably rich
      if (blocked && c.cost > blocked.cost * 0.1) continue; // saving for something more important
      if (S.coins >= c.cost) {
        if (!shopBusy(c.label === 'field' ? 6 : c.def || c.label === 'land' ? 15 : 6)) return blocked;
        c.buy(); bought = true; break;
      }
      if (!blocked) blocked = c;
    }
    if (!bought) {
      decorate(blocked);
      return blocked;
    }
  }
  return null;
}
/** An engaged player spends some spare coins on decorations they like (the priciest unlocked ones). */
function decorate(blocked) {
  const reserve = blocked ? blocked.cost : 0;
  let spare = S.coins - reserve - 200;
  if (spare <= 0) return;
  const money = spare * 0.35;
  const list = decorPool.filter((d) => d.level <= S.level && d.cap === 'decor').sort((a, b) => b.cost - a.cost);
  let spent = 0;
  for (const d of list) {
    while (S.decorCount < capOf('decor') && spent + d.cost <= money && S.tiles > needTiles(d) + 30 && shopBusy(10)) {
      placeDecor(d); spent += d.cost;
      if (S.decor.filter((x) => x === d.id).length >= 6) break; // variety
    }
  }
}

// ------------------------------------------------------------------ daily things
let lastLoginDay = -1;
function sessionStart(s) {
  if (s.day !== lastLoginDay) {
    lastLoginDay = s.day;
    S.streak++;
    gauge('best_streak', S.streak); stat('login_days');
    const r = REWARDS.daily.days[(s.day) % 7];
    if (r.coins) addCoins(Math.round(r.coins * (1 + S.level * REWARDS.daily.levelScale)), 'daily');
    if (r.gems) addGems(r.gems, 'daily');
    if (r.items) { const c = CROPS.filter((x) => x.level <= S.level); give(c[Math.floor(rnd() * c.length)].id, r.items); }
    if (r.crate) openCrate(r.crate);
  }
}
function sessionEnd(s) {
  // daily quests are done by the end of the day's last session; weekly ones on the 7th day
  if (s.index === SESSIONS - 1) {
    const q = QUESTS.daily.reward;
    for (let i = 0; i < QUESTS.daily.count; i++) { addCoins(q.coinsBase + q.coinsPerLevel * S.level, 'quests'); addXp(q.xpBase + q.xpPerLevel * S.level, 'quests'); stat('quests_completed'); }
    openCrate(QUESTS.daily.bonusCrate);
    if (s.day % 7 === 6) {
      const w = QUESTS.weekly.reward;
      const done = 4; // an engaged player finishes most, not always all five
      for (let i = 0; i < done; i++) {
        addCoins(w.coinsBase + w.coinsPerLevel * S.level, 'quests'); addXp(w.xpBase + w.xpPerLevel * S.level, 'quests'); addGems(w.gems, 'quests');
        openCrate(QUESTS.weekly.bonusCrate); stat('quests_completed');
      }
    }
    stat('animal_pets', 4);
  }
  // gems: an engaged player buys the extra stall slots
  if (S.stall && S.stallSlots.length < ECON.stall.maxSlots && S.gems >= ECON.stall.slotCostGems + 10) {
    S.gems -= ECON.stall.slotCostGems; add(gemLog.spent, 'stall slots', ECON.stall.slotCostGems); S.stallSlots.push({ item: null });
  }
}

// ------------------------------------------------------------------ fishing
// A light model of the dock mini-game: the player uses the free casts every day and spends bait when orders, the
// truck or a Fish Shack recipe want fish. Each cast costs ~20 s of attention; hooking and reeling succeed more often
// for easy fish. Time of day follows the game's 24 min clock.
const FISH_OK = [0.95, 0.9, 0.8, 0.7, 0.6];
let fishDay = -1, fishFree = 0;
function fishTimeOfDay() {
  const p = ((S.t * 1000) % (24 * 60000)) / (24 * 60000);
  for (const [t, [a, b]] of Object.entries(FISHING.times)) if (a <= b ? p >= a && p < b : p >= a || p < b) return t;
  return 'day';
}
function fishWanted(dem) {
  for (const f of FISHING.species) if ((dem.short[f.id] ?? 0) > 0) return true;
  return RECIPES.some((r) => BLD[r.building]?.id === 'fish_shack' && r.level <= S.level && prodsOf('fish_shack').some(built) && Object.entries(r.in).some(([i, n]) => FISHING.species.some((f) => f.id === i) && count(i) < n * 2));
}
function fish(dem, s) {
  if (!FISHING || S.level < FISHING.level) return;
  if (fishDay !== s.day) { fishDay = s.day; fishFree = FISHING.freeCastsPerDay; }
  const bait = count(FISHING.baitItem);
  if (!(fishFree > 0 || (bait > 0 && fishWanted(dem)))) return;
  if (!busy(20)) return;
  if (fishFree > 0) fishFree--; else take(FISHING.baitItem, 1);
  stat('fish_casts');
  if (rnd() < FISHING.junkChance) {
    const j = FISHING.junk[Math.floor(rnd() * FISHING.junk.length)];
    if (ITEMS[j.id]) give(j.id, 1); else addCoins((j.coinsBase ?? 0) + (j.coinsPerLevel ?? 0) * S.level, 'fishing');
    addXp(j.xp, 'fishing'); stat('junk_caught');
    return;
  }
  const time = fishTimeOfDay();
  const pool = FISHING.species.filter((f) => f.level <= S.level && f.times.includes(time));
  const tiers = Object.keys(FISHING.rarityChance).filter((r) => pool.some((f) => f.rarity === r));
  let x = rnd() * tiers.reduce((a, r) => a + FISHING.rarityChance[r], 0), tier = tiers[0];
  for (const r of tiers) { x -= FISHING.rarityChance[r]; if (x <= 0) { tier = r; break; } }
  const list = pool.filter((f) => f.rarity === tier);
  const f = list[Math.floor(rnd() * list.length)];
  if (!f || rnd() > FISH_OK[f.difficulty - 1]) return; // it got away
  give(f.id, 1); addXp(f.xp, 'fishing'); stat('fish_caught'); add(S.fishCaught, f.id, 1);
}

// ------------------------------------------------------------------ run
const snapshots = []; // per session end
let fhDone = () => { if (S.fh.pending && S.fh.upEnd <= S.t) { S.fh.level = S.fh.pending; S.fh.pending = 0; gauge('farmhouse_level', S.fh.level); } };
let savingFor = {};
for (const s of sessions) {
  S.t = s.start;
  fhDone();
  sessionStart(s);
  budget = 0;
  for (S.t = s.start; S.t < s.end; S.t += STEP) {
    const eff = s.day === 0 && s.index === 0 ? EFF_FIRST : EFF;
    budget = Math.min(budget + STEP * eff * 0.8, 30);
    shopBudget = Math.min(shopBudget + STEP * eff * 0.2, 120);
    fhDone();
    upgradesDone();
    collect();
    truckTick();
    completeOrders();
    if (S.t === s.start) discardStale();
    truckFill();
    feed();
    let dem = demand();
    produce(dem, s);
    dem = demand();
    plant(dem, s);
    const blocked = shop();
    useGems();
    fhDone();
    if (blocked) savingFor[blocked.label] = (savingFor[blocked.label] ?? 0) + STEP;
    sellSurplus(demand(), s);
    fillOrders();
    fish(demand(), s);
    S.active += STEP;
  }
  sessionEnd(s);
  snapshots.push({ day: s.day, t: s.end, level: S.level, coins: Math.round(S.coins), gems: S.gems, fields: S.fields.length, charm: charm(), land: S.land, fh: S.fh.level });
}
S.t = END;

// ------------------------------------------------------------------ reports
const fmtH = (sec) => sec === null || sec === undefined ? '-' : sec < 3600 ? `${Math.round(sec / 60)}m` : sec < 3 * DAY ? `${(sec / 3600).toFixed(1)}h` : `${(sec / DAY).toFixed(1)}d`;
const fmtN = (n) => n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}k` : `${Math.round(n)}`;
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
const flags = [];
const flag = (kind, msg) => flags.push({ kind, msg });

// level table
const rows = [];
for (let l = 1; l <= MAX_LEVEL; l++) {
  const li = levelInfo[l];
  const next = levelInfo[l + 1];
  const span = li.t === null ? null : (next?.t ?? END) - li.t;
  const activeSpan = li.active === null ? null : (next?.active ?? S.active) - li.active;
  const unl = unlockLog.filter((u) => u.level === l);
  rows.push({ l, xp: xpToNext(l), reachedReal: li.t, reachedActive: li.active, span, activeSpan, coinsH: span ? sum(li.earned) / (span / 3600) : 0, xpH: span ? sum(li.xp) / (span / 3600) : 0, earned: sum(li.earned), spent: sum(li.spent), unl });
}

// targets from BALANCE.md (active play minutes)
const target = { 2: [1, 4], 5: [15, 45], 7: [40, 90], 10: [60, 240] };
for (const [l, [lo, hi]] of Object.entries(target)) {
  const a = levelInfo[l].active;
  if (a === null) flag('pace', `level ${l} not reached`);
  else if (a / 60 < lo || a / 60 > hi) flag('pace', `level ${l} at ${Math.round(a / 60)} min of play (target ${lo}-${hi} min)`);
}
for (const r of rows) {
  if (r.l < 10 || r.l >= MAX_LEVEL || r.span === null || levelInfo[r.l + 1]?.t === null) continue;
  if (r.span > 4 * DAY) flag('slow', `level ${r.l} -> ${r.l + 1} takes ${fmtH(r.span)} of real time`);
  if (r.l >= 12 && r.span < Math.min(4 * HOUR, (0.9 * 13 * HOUR) / Math.max(1, SESSIONS - 1))) flag('fast', `level ${r.l} -> ${r.l + 1} takes only ${fmtH(r.span)} (levels fly by)`);
}
const reached = rows.filter((r) => r.reachedReal !== null).length;
if (reached < MAX_LEVEL) flag('pace', `reached level ${reached} of ${MAX_LEVEL} in ${DAYS} days`);
else if (levelInfo[MAX_LEVEL].t < 30 * DAY) flag('fast', `max level reached in ${fmtH(levelInfo[MAX_LEVEL].t)}: the long-term goal is too short`);

// unlock affordability
const lateUnlocks = [];
for (const u of unlockLog) {
  if (!u.cost || u.unlockedAt === null) continue;
  const wait = (u.boughtAt ?? END) - u.unlockedAt;
  if (u.kind === 'decor') continue;
  if (u.boughtAt === null || wait > 2 * DAY) lateUnlocks.push({ ...u, wait });
}
for (const u of lateUnlocks) flag('afford', `${u.kind} ${u.id} (level ${u.level}, ${fmtN(u.cost)} coins) ${u.boughtAt === null ? 'never bought' : `bought ${fmtH(u.wait)} after unlocking`}`);
const decorUnbought = unlockLog.filter((u) => u.kind === 'decor' && u.unlockedAt !== null && u.boughtAt === null).map((u) => u.id);

// static value tables
function cropTable() {
  return CROPS.map((c) => {
    const perCycle = c.yield * sell(c.id) - c.seedCost;
    const gap = DAY / SESSIONS; // average check-in spacing
    const cyc = Math.max(c.growSec, Math.ceil(c.growSec / gap) * gap);
    return { id: c.id, level: c.level, grow: c.growSec, coinsMinActive: perCycle / (c.growSec / 60), xpMinActive: c.xp / (c.growSec / 60), coinsDay: perCycle * DAY / cyc, xpDay: c.xp * DAY / cyc, orderValue: c.yield * sell(c.id) * ECON.orders.coinMult };
  });
}
function recipeTable() {
  return RECIPES.map((r) => ({ id: r.id, building: r.building, level: r.level, sec: r.sec, add: valueAdd(r), addH: valueAdd(r) / (r.sec / 3600), xpH: r.xp / (r.sec / 3600), ratio: (r.out * sell(r.item)) / Math.max(1, inputValue(r)), used: S.usedRecipes[r.id] ?? 0 }));
}
function animalTable() {
  return ANIMALS.map((a) => {
    const fr = RECIPES.find((r) => r.item === a.feed);
    const feedCost = fr ? inputValue(fr) / fr.out : sell(a.feed);
    const cycles = DAY / Math.max(a.produceSec, Math.ceil(a.produceSec / (DAY / SESSIONS)) * (DAY / SESSIONS));
    return { id: a.id, level: a.level, sec: a.produceSec, net: sell(a.product) - feedCost, netH: (sell(a.product) - feedCost) / (a.produceSec / 3600), xpH: a.xp / (a.produceSec / 3600), cost: a.cost, netDay: (sell(a.product) - feedCost) * cycles };
  });
}
function treeTable() {
  return TREES.map((t) => {
    const cycles = DAY / Math.max(t.growSec, Math.ceil(t.growSec / (DAY / SESSIONS)) * (DAY / SESSIONS));
    return { id: t.id, level: t.level, cost: t.cost, grow: t.growSec, coinsH: t.yield * sell(t.item) / (t.growSec / 3600), coinsDay: t.yield * sell(t.item) * cycles, payback: t.cost / (t.yield * sell(t.item) / (t.growSec / 3600)) };
  });
}
const crops = cropTable(), recipes = recipeTable(), animals = animalTable(), trees = treeTable();

// dominance: within a band of unlock levels, is one option far better?
for (const r of recipes) {
  const peers = recipes.filter((x) => x.building === r.building && x.id !== r.id && ITEMS[x.id]?.cat !== 'feed' && Math.abs(x.level - r.level) <= 8);
  if (ITEMS[r.id]?.cat === 'feed' || !peers.length) continue;
  const best = Math.max(...peers.map((x) => x.addH));
  if (r.id === 'bread' && r.level <= 4) { if (r.addH > 2 * best) flag('note', `bread makes ${Math.round(r.addH)} coins/h of added value (${(r.addH / best).toFixed(1)}x later bakery recipes): the generous first recipe is intentional`); continue; }
  if (r.addH > 2 * best && r.addH > 40) flag('dominant', `recipe ${r.id} makes ${Math.round(r.addH)} coins/h of added value, ${(r.addH / best).toFixed(1)}x its nearest ${r.building} peers`);
  if (r.add <= 0) flag('dead', `recipe ${r.id} loses value (${Math.round(r.add)} coins per batch)`);
}
for (const c of crops) {
  const peers = crops.filter((x) => x.id !== c.id && Math.abs(x.level - c.level) <= 6);
  const best = Math.max(...peers.map((x) => x.coinsDay));
  if (c.coinsDay > 1.6 * best) flag('dominant', `crop ${c.id} earns ${Math.round(c.coinsDay)} coins/field/day at ${SESSIONS} check-ins, ${(c.coinsDay / best).toFixed(1)}x its peers`);
}
for (const r of recipes) if (!r.used && r.level <= reached) flag('unused', `recipe ${r.id} (level ${r.level}) was never chosen by the simulated player`);
// selling channels: the stall takes any amount within minutes, so per item it must stay clearly below orders
if (ECON.stall.maxPriceMult > ECON.orders.coinMult * 0.85) flag('dominant', `the stall pays up to ${ECON.stall.maxPriceMult}x item value for any amount within ${ECON.stall.buyDelaySec[1] / 60} min, close to orders (${ECON.orders.coinMult}x): dumping goods at the stall rivals filling orders`);
if (ECON.truck.coinMult * (1 + ECON.truck.bonusMult) < ECON.orders.coinMult * 1.2) flag('dominant', `a full truck pays ${(ECON.truck.coinMult * (1 + ECON.truck.bonusMult)).toFixed(2)}x item value, hardly more than orders (${ECON.orders.coinMult}x)`);
{
  const done = S.stats.trucks_completed ?? 0, gone = S.stats.trucks_missed ?? 0;
  if (done + gone > 10 && done / (done + gone) < 0.15) flag('afford', `only ${done} of ${done + gone} trucks were filled completely before leaving`);
}
const neverMade = Object.keys(ITEMS).filter((i) => ITEMS[i].cat !== 'event' && ITEM_LEVEL[i] <= reached && !S.produced[i] && !RECIPES.some((r) => r.item === i && S.usedRecipes[r.id]));
for (const i of neverMade) flag('unused', `item ${i} never produced`);
const deadItems = Object.keys(ITEMS).filter((i) => ITEMS[i].cat === 'goods' && !INGREDIENTS.has(i) && !(S.requested[i] > 0) && ITEM_LEVEL[i] <= reached);
for (const i of deadItems) flag('dead', `${i} is never asked for and not an ingredient`);

// late game coins
const last = snapshots[snapshots.length - 1];
const dayIncome = (() => {
  const from = END - 7 * DAY;
  let e = 0;
  for (let l = 1; l <= MAX_LEVEL; l++) { const li = levelInfo[l]; if (li.t !== null && (levelInfo[l + 1]?.t ?? END) > from) e += sum(li.earned) * Math.min(1, ((levelInfo[l + 1]?.t ?? END) - Math.max(from, li.t)) / Math.max(1, (levelInfo[l + 1]?.t ?? END) - li.t)); }
  return e / 7;
})();
const leftToBuy = candidates().filter((c) => c.prio < 8 || c.label === 'land');
const goal = leftToBuy.reduce((m, c) => (c.cost > m.cost ? c : m), { cost: 0, label: 'nothing' });
if (last.coins > dayIncome * 5 && last.coins > 50000) {
  if (last.coins > goal.cost) flag('inflation', `ends with ${fmtN(last.coins)} coins banked (${(last.coins / Math.max(1, dayIncome)).toFixed(1)} days of income) and ${leftToBuy.length ? `only ${leftToBuy.map((c) => c.label).slice(0, 4).join(', ')} left to buy` : 'nothing left to buy'}`);
  else flag('note', `ends with ${fmtN(last.coins)} coins banked (${(last.coins / Math.max(1, dayIncome)).toFixed(1)} days of income), saving for ${goal.label} (${fmtN(goal.cost)})`);
}
const gemsEarned = sum(gemLog.earned), gemsSpent = sum(gemLog.spent);
if (S.gems > 400) flag('gems', `${S.gems} gems banked after ${DAYS} days (${gemsEarned} earned, ${gemsSpent} spent on the simulated sinks); speed-ups (${ECON.speedup.gemsPerMinute}/min) are the only big sink`);

// ------------------------------------------------------------------ output
if (JSON_OUT) {
  console.log(JSON.stringify({
    options: { DAYS, SESSIONS, SESSION_MIN, FIRST_MIN, SEED },
    levels: rows.map((r) => ({ level: r.l, reachedActiveMin: r.reachedActive === null ? null : Math.round(r.reachedActive / 60), reachedDay: r.reachedReal === null ? null : +(r.reachedReal / DAY).toFixed(2), coinsH: Math.round(r.coinsH), xpH: Math.round(r.xpH) })),
    final: last, gems: { earned: gemLog.earned, spent: gemLog.spent, banked: S.gems }, flags,
  }, null, 1));
  process.exit(0);
}

const out = [];
const p = (s = '') => out.push(s);
p(`Cozy Acres economy simulation: ${DAYS} days, ${SESSIONS} sessions/day of ${SESSION_MIN} min (first session ${FIRST_MIN} min), seed ${SEED}`);
p(`Active play time simulated: ${(S.active / 3600).toFixed(1)} h. Final: level ${S.level}, ${fmtN(S.coins)} coins, ${S.gems} gems, ${S.fields.length} fields, ${S.trees.length} trees, ` +
  `${S.homes.reduce((s, h) => s + h.animals.length, 0)} animals, ${S.prods.length} production buildings, farmhouse ${S.fh.level}, ${S.land} expansions, ${S.decorCount} decorations, ${charm()} charm`);
p();
p('LEVELS  (play = minutes of active play when reached; day = real day reached; span = real time spent in the level)');
p(`${pad('Lv', 4)}${lpad('XP', 7)}${lpad('play', 8)}${lpad('day', 7)}${lpad('span', 8)}${lpad('coins/h', 9)}${lpad('xp/h', 7)}  unlocks (cost, time to buy)`);
for (const r of rows) {
  const unl = r.unl.filter((u) => u.kind !== 'decor' || u.cost >= 1000).map((u) => {
    if (!u.cost) return u.id;
    const w = u.boughtAt === null ? 'never' : u.boughtAt < (u.unlockedAt ?? 0) ? 'early, crate' : fmtH(u.boughtAt - (u.unlockedAt ?? 0));
    return `${u.id} ${fmtN(u.cost)} (${w})`;
  });
  p(`${pad(r.l, 4)}${lpad(r.xp || '-', 7)}${lpad(r.reachedActive === null ? '-' : fmtH(r.reachedActive), 8)}${lpad(r.reachedReal === null ? '-' : (r.reachedReal / DAY).toFixed(1), 7)}${lpad(fmtH(r.span), 8)}${lpad(r.span ? fmtN(r.coinsH) : '-', 9)}${lpad(r.span ? fmtN(r.xpH) : '-', 7)}  ${unl.join(', ')}`);
}
p();
if (!BRIEF) {
  // income by source per level band
  const bands = [[1, 5], [6, 10], [11, 15], [16, 20], [21, 25], [26, 30], [31, 35], [36, 40], [41, 45], [46, 50]];
  const bandSum = (lo, hi, key) => { const o = {}; for (let l = lo; l <= hi; l++) for (const [k, v] of Object.entries(levelInfo[l][key])) { const g = k.split('/')[0]; add(o, g === 'orders' || g === 'truck' || g === 'stall' || g === 'barn' ? k.replace(/\/.*/, '') : k, v); } return o; };
  const bandCat = (lo, hi) => { const o = {}; for (let l = lo; l <= hi; l++) for (const [k, v] of Object.entries(levelInfo[l].earned)) { const c = k.split('/')[1]; if (c) add(o, c, v); } return o; };
  const bandSpan = (lo, hi) => { const a = levelInfo[lo].t; if (a === null) return null; const b = levelInfo[hi + 1]?.t ?? (S.level >= lo ? END : null); return b === null ? null : b - a; };
  p('COINS PER HOUR OF REAL TIME BY SOURCE (level bands)');
  const srcs = ['orders', 'truck', 'stall', 'barn', 'level-ups', 'quests', 'daily', 'crates', 'awards', 'clearing'];
  p(`${pad('Levels', 8)}${lpad('span', 7)}${srcs.map((s) => lpad(s, 10)).join('')}${lpad('total', 9)}`);
  for (const [lo, hi] of bands) {
    const sp = bandSpan(lo, hi); if (!sp) continue;
    const o = bandSum(lo, hi, 'earned');
    p(`${pad(`${lo}-${hi}`, 8)}${lpad(fmtH(sp), 7)}${srcs.map((s) => lpad(fmtN((o[s] ?? 0) / (sp / 3600)), 10)).join('')}${lpad(fmtN(sum(o) / (sp / 3600)), 9)}`);
  }
  p();
  p('SALES BY WHAT WAS SOLD, coins/h (orders + truck + stall + barn)');
  const cats = ['crop', 'fruit', 'animal', 'goods', 'bonus'];
  p(`${pad('Levels', 8)}${cats.map((s) => lpad(s, 10)).join('')}`);
  for (const [lo, hi] of bands) {
    const sp = bandSpan(lo, hi); if (!sp) continue;
    const o = bandCat(lo, hi);
    p(`${pad(`${lo}-${hi}`, 8)}${cats.map((s) => lpad(fmtN((o[s] ?? 0) / (sp / 3600)), 10)).join('')}`);
  }
  p();
  p('XP PER HOUR OF REAL TIME BY SOURCE');
  const xs = ['crops', 'trees', 'animals', 'production', 'orders', 'truck', 'quests', 'awards', 'land', 'clearing', 'fishing'];
  p(`${pad('Levels', 8)}${xs.map((s) => lpad(s, 11)).join('')}`);
  for (const [lo, hi] of bands) {
    const sp = bandSpan(lo, hi); if (!sp) continue;
    const o = bandSum(lo, hi, 'xp');
    p(`${pad(`${lo}-${hi}`, 8)}${xs.map((s) => lpad(fmtN((o[s] ?? 0) / (sp / 3600)), 11)).join('')}`);
  }
  p();
  p('SPENDING BY SINK, total coins per band');
  const sinks = ['seeds', 'fields', 'buildings', 'animals', 'trees', 'upgrades', 'farmhouse', 'land', 'decor', 'clearing'];
  p(`${pad('Levels', 8)}${sinks.map((s) => lpad(s, 10)).join('')}${lpad('banked', 10)}`);
  for (const [lo, hi] of bands) {
    const sp = bandSpan(lo, hi); if (!sp) continue;
    const o = bandSum(lo, hi, 'spent');
    const bank = levelInfo[hi + 1]?.coinsAt ?? S.coins;
    p(`${pad(`${lo}-${hi}`, 8)}${sinks.map((s) => lpad(fmtN(o[s] ?? 0), 10)).join('')}${lpad(fmtN(bank), 10)}`);
  }
  p();
  p(`CROPS  (per field; "day" columns assume a harvest at each of ${SESSIONS} daily check-ins)`);
  p(`${pad('crop', 12)}${lpad('lv', 4)}${lpad('grow', 7)}${lpad('c/min', 8)}${lpad('xp/min', 8)}${lpad('c/day', 8)}${lpad('xp/day', 8)}`);
  for (const c of crops) p(`${pad(c.id, 12)}${lpad(c.level, 4)}${lpad(fmtH(c.grow), 7)}${lpad(c.coinsMinActive.toFixed(1), 8)}${lpad(c.xpMinActive.toFixed(2), 8)}${lpad(Math.round(c.coinsDay), 8)}${lpad(Math.round(c.xpDay), 8)}`);
  p();
  p('TREES');
  p(`${pad('tree', 14)}${lpad('lv', 4)}${lpad('cost', 7)}${lpad('grow', 7)}${lpad('c/h', 7)}${lpad('c/day', 7)}${lpad('payback', 9)}`);
  for (const t of trees) p(`${pad(t.id, 14)}${lpad(t.level, 4)}${lpad(t.cost, 7)}${lpad(fmtH(t.grow), 7)}${lpad(Math.round(t.coinsH), 7)}${lpad(Math.round(t.coinsDay), 7)}${lpad(fmtH(t.payback * 3600), 9)}`);
  p();
  p('ANIMALS  (net = product value minus feed ingredients)');
  p(`${pad('animal', 10)}${lpad('lv', 4)}${lpad('cost', 7)}${lpad('cycle', 7)}${lpad('net', 6)}${lpad('net/h', 7)}${lpad('xp/h', 7)}${lpad('net/day', 9)}`);
  for (const a of animals) p(`${pad(a.id, 10)}${lpad(a.level, 4)}${lpad(a.cost, 7)}${lpad(fmtH(a.sec), 7)}${lpad(Math.round(a.net), 6)}${lpad(Math.round(a.netH), 7)}${lpad(a.xpH.toFixed(1), 7)}${lpad(Math.round(a.netDay), 9)}`);
  p();
  p('RECIPES  (added value = output minus ingredient sell value; used = batches the simulated player made)');
  p(`${pad('recipe', 18)}${pad('building', 12)}${lpad('lv', 4)}${lpad('time', 7)}${lpad('add', 6)}${lpad('add/h', 7)}${lpad('xp/h', 7)}${lpad('x', 6)}${lpad('used', 7)}`);
  for (const r of recipes) p(`${pad(r.id, 18)}${pad(r.building, 12)}${lpad(r.level, 4)}${lpad(fmtH(r.sec), 7)}${lpad(Math.round(r.add), 6)}${lpad(Math.round(r.addH), 7)}${lpad(r.xpH.toFixed(1), 7)}${lpad(r.ratio.toFixed(2), 6)}${lpad(r.used, 7)}`);
  p();
  p(`GEMS  earned ${gemsEarned} (${Object.entries(gemLog.earned).map(([k, v]) => `${k} ${v}`).join(', ')}), spent ${gemsSpent} (${Object.entries(gemLog.spent).map(([k, v]) => `${k} ${v}`).join(', ') || 'nothing'}), banked ${S.gems}`);
  p(`Orders completed ${S.stats.orders_completed ?? 0}, discarded ${S.stats.orders_discarded ?? 0}; trucks sent ${S.stats.trucks_completed ?? 0}, missed ${S.stats.trucks_missed ?? 0}; stall sales ${S.stats.stall_sales ?? 0}; crates ${S.stats.crates_opened ?? 0}`);
  p(`Achievement tiers earned: ${Object.values(S.ach).reduce((a, b) => a + b, 0)} of ${ACH.achievements.length * 3}`);
  if (decorUnbought.length) p(`Decorations never bought: ${decorUnbought.join(', ')}`);
  const longest = Object.entries(savingFor).sort((a, b) => b[1] - a[1]).slice(0, 6);
  p(`Most active time spent saving up for: ${longest.map(([k, v]) => `${k} ${fmtH(v)}`).join(', ')}`);
  p();
  p('DAY BY DAY (end of day)');
  p(`${pad('day', 5)}${lpad('level', 6)}${lpad('coins', 9)}${lpad('gems', 6)}${lpad('fields', 7)}${lpad('charm', 7)}${lpad('land', 6)}${lpad('house', 6)}`);
  for (const sn of snapshots.filter((x, i) => i % SESSIONS === SESSIONS - 1 && (x.day < 10 || x.day % 5 === 4))) p(`${pad(sn.day + 1, 5)}${lpad(sn.level, 6)}${lpad(fmtN(sn.coins), 9)}${lpad(sn.gems, 6)}${lpad(sn.fields, 7)}${lpad(sn.charm, 7)}${lpad(sn.land, 6)}${lpad(sn.fh, 6)}`);
  p();
}
p(`FLAGS (${flags.length})`);
const order = ['pace', 'slow', 'fast', 'afford', 'dominant', 'dead', 'unused', 'inflation', 'gems', 'note'];
for (const k of order) for (const f of flags.filter((x) => x.kind === k)) p(`  [${f.kind}] ${f.msg}`);
if (!flags.length) p('  none');
console.log(out.join('\n'));
