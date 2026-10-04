import { BUILDINGS, CROPS, FARMHOUSE, LAND, TREES } from '../data';
import { Game } from '../systems/Game';
import { createNewGame } from '../systems/NewGame';
import type { PlacedBuilding } from '../systems/State';
import { CHUNKS, MAP, chunkOf, rotatedSize } from '../world/Grid';
import { hashString, rng } from '../world/Procedural';
import { cleanLook, type FarmSnapshot, type SnapBuilding, type SnapExtra } from './FarmSnapshot';
import type { PublicLook } from './types';

/**
 * Practice mode: a pleasant, deterministic farm for each demo neighbour, so visiting can be tried
 * without a server. The same bot id always gives the same farm (fields, workshops, animals, trees,
 * decorations and land that fit their level); only the crops' growth and the snapshot time vary.
 */
export interface BotInfo { id: string; name: string; level: number; charm: number; look: PublicLook }

const cache = new Map<string, Omit<FarmSnapshot, 'at'>>();

export function botFarm(bot: BotInfo, now = Date.now()): FarmSnapshot {
  let base = cache.get(bot.id);
  if (!base) { base = generate(bot); cache.set(bot.id, base); }
  return { ...base, at: now - 4 * 60000 };
}

function generate(bot: BotInfo): Omit<FarmSnapshot, 'at'> {
  const seed = hashString(`bot-farm:${bot.id}`);
  const r = rng(seed);
  const L = bot.level;
  const state = createNewGame(0, seed);
  const g = new Game();
  g.load(state);

  // ---- land: the expansions a player of this level could have bought, nearest first
  const expansions = L >= LAND.expansion.baseLevel ? Math.min(10, Math.floor((L - LAND.expansion.baseLevel) / LAND.expansion.levelStep) + 1) : 0;
  for (let i = 0; i < expansions; i++) {
    const opts: { key: string; d: number }[] = [];
    for (let z = 0; z < CHUNKS; z++) for (let x = 0; x < CHUNKS; x++) {
      const key = `${x},${z}`;
      if (g.isUnlocked(key) || ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => g.isUnlocked(`${x + dx},${z + dz}`))) continue;
      opts.push({ key, d: Math.hypot(x + 0.5 - CHUNKS / 2, z + 0.5 - CHUNKS / 2) + r() * 1.2 });
    }
    opts.sort((a, b) => a.d - b.d);
    if (opts[0]) g.unlockChunk(opts[0].key);
  }
  // cleared land keeps a little nature: a couple of obstacles per owned chunk
  const perChunk = new Map<string, number>();
  state.obstacles = state.obstacles.filter((o) => {
    const c = chunkOf(o.x, o.z);
    if (!g.isUnlocked(c)) return true;
    const n = perChunk.get(c) ?? 0;
    perChunk.set(c, n + 1);
    return n < (LAND.startChunks.includes(c) ? 1 : 2);
  });
  g.rebuildOccupancy();

  const extra = new Map<number, SnapExtra>();
  const place = (type: string, x: number, z: number, rot = 0): PlacedBuilding | null => {
    if (!g.canPlace(type, x, z, rot)) return null;
    const b: PlacedBuilding = { uid: g.newUid(), type, x, z, rot, level: 1 };
    state.buildings.push(b);
    g.markBuilding(b, b.uid);
    return b;
  };
  /** Free spots in owned land, nearest to (cx, cz) first with a little randomness. */
  const spots = (cx: number, cz: number, jitter: number, step = 1): [number, number][] => {
    const out: [number, number, number][] = [];
    for (let z = 0; z < MAP; z += step) for (let x = 0; x < MAP; x += step) {
      if (!g.isUnlocked(chunkOf(x, z))) continue;
      out.push([x, z, Math.hypot(x - cx, z - cz) + r() * jitter]);
    }
    return out.sort((a, b) => a[2] - b[2]).map(([x, z]) => [x, z]);
  };
  const placeNear = (type: string, cx: number, cz: number, jitter: number, step = 1): PlacedBuilding | null => {
    const def = BUILDINGS.find((d) => d.id === type);
    if (!def) return null;
    const rot = def.size[0] !== def.size[1] && r() < 0.5 ? 1 : 0;
    const [w, d] = rotatedSize(def.size, rot);
    for (const [x, z] of spots(cx, cz, jitter, step)) {
      // leave a one-tile gap around big buildings so the farm does not look crammed
      if (w * d >= 9 && !roomAround(g, x, z, w, d)) continue;
      const b = place(type, x, z, rot);
      if (b) return b;
    }
    return null;
  };

  // ---- farmhouse level
  const fh = state.buildings.find((b) => b.type === 'farmhouse');
  const fhLevel = FARMHOUSE.levels.filter((l) => l.playerLevel <= L).length;
  if (fh && fhLevel > 1) extra.set(fh.uid, { l: fhLevel });

  // ---- fields: a tidy block below the path, growing with the level
  const plotCaps = (FARMHOUSE.caps as Record<string, number[]>).plot;
  const plotTarget = Math.min(plotCaps[Math.max(0, fhLevel - 1)] ?? 14, 8 + Math.floor(L * 0.6));
  let plots = state.buildings.filter((b) => b.type === 'plot').length;
  for (let z = 22; z < MAP - 1 && plots < plotTarget; z += 2) {
    for (let x = 17; x < MAP - 1 && plots < plotTarget; x += 2) if (place('plot', x, z)) plots++;
  }
  for (const [x, z] of spots(21, 26, 0, 2)) { if (plots >= plotTarget) break; if (place('plot', x, z)) plots++; }

  // ---- workshops and animal homes this level has, placed around the farmyard
  const unlocked = (cat: string) => BUILDINGS.filter((d) => d.cat === cat && d.level <= L && !d.event && d.cost > 0);
  const prod = unlocked('production').slice(0, 1 + Math.floor(L / 4));
  const animals = unlocked('animal').slice(0, 1 + Math.floor(L / 6));
  const specials = BUILDINGS.filter((d) => (d.id === 'roadside_stall' || d.id === 'truck_depot') && d.level <= L);
  for (const d of [...specials, ...animals, ...prod]) {
    const b = placeNear(d.id, 24, 17, 6);
    if (!b) continue;
    if (d.animal) {
      const n = 3 + Math.floor(r() * 3);
      const ready = Math.floor(r() * (n + 1));
      extra.set(b.uid, { a: [n, ready, r() < 0.3 ? Math.min(1, n - ready) : 0] });
    } else if (d.cat === 'production' && r() < 0.65) extra.set(b.uid, { r: 1 });
  }

  // ---- fruit trees in a little orchard
  const trees = TREES.filter((t) => t.level <= L);
  const treeCount = Math.min(10, Math.floor(L / 3));
  for (let i = 0; i < treeCount && trees.length; i++) {
    const t = trees[i % trees.length];
    const def = BUILDINGS.find((d) => d.tree === t.id);
    if (!def) continue;
    const b = placeNear(def.id, 14, 25, 4, 2);
    if (b && r() < 0.55) extra.set(b.uid, { t: 1 });
  }

  // ---- decorations sprinkled around (paths are already there)
  const decor = BUILDINGS.filter((d) => d.cat === 'decor' && !d.path && d.level <= L && !d.event && d.cost > 0 && d.size[0] * d.size[1] <= 4);
  const decorCount = Math.min(36, 4 + Math.floor(L * 0.9));
  for (let i = 0; i < decorCount && decor.length; i++) {
    // fancier pieces are rarer
    const d = decor[Math.floor(Math.pow(r(), 0.8) * decor.length)];
    placeNear(d.id, 22 + (r() - 0.5) * 10, 20 + (r() - 0.5) * 10, 10);
  }
  // a fence along the fields for older farms
  if (L >= 5) for (let x = 16; x < 26; x++) place('fence_picket', x, 21);

  // ---- crops: mostly growing or ready, a few empty fields
  const crops = CROPS.filter((c) => c.level <= L);
  for (const b of state.buildings) {
    if (b.type !== 'plot' || r() < 0.1) continue;
    const c = crops[Math.floor(r() * crops.length)];
    const roll = r();
    extra.set(b.uid, { p: [c.id, roll < 0.15 ? 0 : roll < 0.35 ? 1 : roll < 0.6 ? 2 : 3] });
  }

  const b: SnapBuilding[] = state.buildings.map((pb) => {
    const x = extra.get(pb.uid);
    return x ? [pb.type, pb.x, pb.z, pb.rot, x] : [pb.type, pb.x, pb.z, pb.rot];
  });
  const pets = ['dog', 'cat', 'bunny', 'fox', 'none'];
  return {
    v: 1,
    name: bot.name,
    level: L,
    charm: bot.charm,
    look: cleanLook({ ...bot.look, accessory: 'none', pet: pets[seed % pets.length] }),
    land: [...g.unlockedChunks],
    obs: state.obstacles.map((o) => [o.type, o.x, o.z, o.model]),
    b,
  };
}

/** True when the ring of tiles around a w x d footprint at (x, z) is free (inside owned land). */
function roomAround(g: Game, x: number, z: number, w: number, d: number): boolean {
  for (let tz = z - 1; tz <= z + d; tz++) for (let tx = x - 1; tx <= x + w; tx++) {
    const edge = tz === z - 1 || tz === z + d || tx === x - 1 || tx === x + w;
    if (edge && tx >= 0 && tz >= 0 && tx < MAP && tz < MAP && g.buildingAt(tx, tz)) return false;
  }
  return true;
}

