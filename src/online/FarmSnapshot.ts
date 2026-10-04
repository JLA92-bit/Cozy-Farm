import { BUILDING, COSMETICS, CROP, LAND, MAX_LEVEL, RECIPES } from '../data';
import { Game } from '../systems/Game';
import { createNewGame } from '../systems/NewGame';
import type { CharacterLook, Obstacle, PlacedBuilding, SaveData } from '../systems/State';
import { animalState, cropStage, isBuilt, productionState, treeReady } from '../systems/Timers';
import { CHUNKS, MAP, rotatedSize } from '../world/Grid';

/**
 * A farm's public "snapshot": just what is needed to draw it for a visiting neighbour (no coins,
 * items, quests or anything else from the save). Kept compact: a big farm is well under 30 KB of JSON.
 *
 * Growth is stored as a stage (0 sprout .. 3 ready), not as timestamps, so the visited farm looks
 * exactly as it did when the snapshot was taken.
 */
export interface FarmSnapshot {
  v: 1;
  /** when the snapshot was taken (ms) */
  at: number;
  name: string;
  level: number;
  charm: number;
  look: CharacterLook;
  /** unlocked land chunks ("x,z") */
  land: string[];
  /** obstacles: [type, x, z, model variant] */
  obs: [string, number, number, number][];
  /** buildings: [type, x, z, rot, extra] */
  b: SnapBuilding[];
}

export type SnapBuilding = [string, number, number, number] | [string, number, number, number, SnapExtra];
export interface SnapExtra {
  /** under construction */
  c?: 1;
  /** building level (farmhouse, upgrades), only when above 1 */
  l?: number;
  /** field: [crop, stage 0..3] */
  p?: [string, number];
  /** fruit tree is ready */
  t?: 1;
  /** animal home: [animals, ready, hungry] */
  a?: [number, number, number];
  /** production building is busy */
  r?: 1;
}

/** Hard limits for snapshots read from other players (a real farm is far below these). */
export const SNAPSHOT_LIMITS = { buildings: 1200, obstacles: 600, animals: 12, json: 200_000 };

/** The public snapshot of a farm. Pure: reads `state` only, at time `now`. */
export function farmSnapshot(state: SaveData, now: number = Date.now()): FarmSnapshot {
  let charm = 0;
  const b: SnapBuilding[] = [];
  for (const pb of state.buildings) {
    const def = BUILDING[pb.type];
    if (!def) continue;
    const built = isBuilt(pb, now);
    if (built) charm += def.charm;
    const x: SnapExtra = {};
    if (!built) x.c = 1;
    if (pb.level > 1) x.l = pb.level;
    if (built && pb.plot) x.p = [pb.plot.crop, cropStage(pb.plot, now)];
    if (def.tree && treeReady(pb, now)) x.t = 1;
    if (def.animal && pb.animals?.length) {
      let ready = 0, hungry = 0;
      pb.animals.forEach((_a, i) => { const s = animalState(pb, i, now); if (s === 'ready') ready++; else if (s === 'hungry') hungry++; });
      x.a = [pb.animals.length, ready, hungry];
    }
    if (def.cat === 'production' && built && productionState(pb, now).running) x.r = 1;
    b.push(Object.keys(x).length ? [pb.type, pb.x, pb.z, pb.rot, x] : [pb.type, pb.x, pb.z, pb.rot]);
  }
  const l = state.player.look;
  return {
    v: 1,
    at: Math.round(now),
    name: state.player.name,
    level: state.player.level,
    charm,
    look: { body: l.body, skin: l.skin, hair: l.hair, top: l.top, bottom: l.bottom, hat: l.hat, accessory: l.accessory, pet: l.pet },
    land: [...state.land.unlocked],
    obs: state.obstacles.map((o) => [o.type, o.x, o.z, o.model]),
    b,
  };
}

/** The snapshot without its timestamp, for "has the farm changed since we last published?". */
export function snapshotKey(s: FarmSnapshot): string {
  const { at: _at, ...rest } = s;
  return JSON.stringify(rest);
}

// ------------------------------------------------------------------------------------------- reading

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const int = (v: unknown, min: number, max: number, def: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : def;
const HEX = /^#[0-9a-f]{6}$/i;
const DEFAULT_LOOK: CharacterLook = { body: 'female-b', skin: '#f6c9a0', hair: '#8a5a33', top: '#3fa9f5', bottom: '#8a5528', hat: 'straw', accessory: 'none', pet: 'none' };

/** A drawable look: unknown bodies, colours, hats, accessories and pets fall back to safe defaults. */
export function cleanLook(v: unknown): CharacterLook {
  const l = isObj(v) ? v : {};
  const col = (c: unknown, def: string) => (typeof c === 'string' && HEX.test(c) ? c : def);
  const pick = (id: unknown, list: { id: string }[], def: string) => (typeof id === 'string' && list.some((x) => x.id === id) ? id : def);
  return {
    body: pick(l.body, COSMETICS.bodies, DEFAULT_LOOK.body),
    skin: col(l.skin, DEFAULT_LOOK.skin),
    hair: col(l.hair, DEFAULT_LOOK.hair),
    top: col(l.top, DEFAULT_LOOK.top),
    bottom: col(l.bottom, DEFAULT_LOOK.bottom),
    hat: pick(l.hat, COSMETICS.hats, 'none'),
    accessory: pick(l.accessory, COSMETICS.accessories, 'none'),
    pet: pick(l.pet, COSMETICS.pets, 'none'),
  };
}

/** Printable, short player name (no control characters). */
function cleanName(v: unknown): string {
  const s = typeof v === 'string' ? [...v].filter((ch) => { const c = ch.charCodeAt(0); return c >= 32 && !(c >= 0x7f && c <= 0x9f) && c !== 0x2028 && c !== 0x2029; }).join('').trim().slice(0, 24) : '';
  return s || 'Farmer';
}

/**
 * Check a snapshot from another player (or the server) before anything is drawn: unknown building
 * types, crops or obstacles, coordinates outside the map, overlapping buildings and oversized lists are
 * dropped. Returns null when it is not a farm snapshot at all.
 */
export function sanitizeSnapshot(raw: unknown, now: number = Date.now()): FarmSnapshot | null {
  if (typeof raw === 'string') {
    if (raw.length > SNAPSHOT_LIMITS.json) return null;
    try { raw = JSON.parse(raw); } catch { return null; }
  }
  if (!isObj(raw) || raw.v !== 1 || !Array.isArray(raw.b)) return null;
  try { if (JSON.stringify(raw).length > SNAPSHOT_LIMITS.json) return null; } catch { return null; }

  const land = new Set<string>();
  for (const c of Array.isArray(raw.land) ? raw.land.slice(0, CHUNKS * CHUNKS) : []) {
    if (typeof c !== 'string' || !/^\d{1,2},\d{1,2}$/.test(c)) continue;
    const [x, z] = c.split(',').map(Number);
    if (x < CHUNKS && z < CHUNKS) land.add(c);
  }
  if (!land.size) LAND.startChunks.forEach((c) => land.add(c));

  // buildings first (a tile holds one thing), then obstacles on whatever is still free
  const taken = new Uint8Array(MAP * MAP);
  const b: SnapBuilding[] = [];
  for (const e of raw.b.slice(0, SNAPSHOT_LIMITS.buildings)) {
    if (!Array.isArray(e) || typeof e[0] !== 'string') continue;
    const def = BUILDING[e[0]];
    if (!def) continue;
    const x = int(e[1], -1, MAP, -1), z = int(e[2], -1, MAP, -1), rot = int(e[3], 0, 3, 0);
    if (x !== e[1] || z !== e[2]) continue; // not a whole number inside the map
    const [w, d] = rotatedSize(def.size, rot);
    if (x < 0 || z < 0 || x + w > MAP || z + d > MAP) continue;
    let free = true;
    for (let tz = z; tz < z + d && free; tz++) for (let tx = x; tx < x + w; tx++) if (taken[tz * MAP + tx]) { free = false; break; }
    if (!free) continue;
    for (let tz = z; tz < z + d; tz++) for (let tx = x; tx < x + w; tx++) taken[tz * MAP + tx] = 1;
    const src = isObj(e[4]) ? e[4] : {};
    const out: SnapExtra = {};
    if (src.c === 1) out.c = 1;
    const lvl = int(src.l, 1, 10, 1);
    if (lvl > 1) out.l = lvl;
    if (def.id === 'plot' && Array.isArray(src.p) && typeof src.p[0] === 'string' && CROP[src.p[0]]) out.p = [src.p[0], int(src.p[1], 0, 3, 0)];
    if (def.tree && src.t === 1) out.t = 1;
    if (def.animal && Array.isArray(src.a)) {
      const n = int(src.a[0], 0, SNAPSHOT_LIMITS.animals, 0);
      const ready = int(src.a[1], 0, n, 0);
      const hungry = int(src.a[2], 0, n - ready, 0);
      if (n) out.a = [n, ready, hungry];
    }
    if (def.cat === 'production' && src.r === 1) out.r = 1;
    b.push(Object.keys(out).length ? [def.id, x, z, rot, out] : [def.id, x, z, rot]);
  }

  const types = LAND.obstacles.types as Record<string, { models: string[] }>;
  const obs: FarmSnapshot['obs'] = [];
  for (const e of Array.isArray(raw.obs) ? raw.obs.slice(0, SNAPSHOT_LIMITS.obstacles) : []) {
    if (!Array.isArray(e) || typeof e[0] !== 'string' || !types[e[0]]) continue;
    const x = int(e[1], -1, MAP, -1), z = int(e[2], -1, MAP, -1);
    if (x !== e[1] || z !== e[2] || x < 0 || z < 0 || x >= MAP || z >= MAP || taken[z * MAP + x]) continue;
    taken[z * MAP + x] = 1;
    const n = types[e[0]].models.length;
    obs.push([e[0], x, z, ((int(e[3], 0, 1000, 0) % n) + n) % n]);
  }

  return {
    v: 1,
    at: int(raw.at, 0, now, now),
    name: cleanName(raw.name),
    level: int(raw.level, 1, MAX_LEVEL, 1),
    charm: int(raw.charm, 0, 10_000_000, 0),
    look: cleanLook(raw.look),
    land: [...land],
    obs,
    b,
  };
}

// --------------------------------------------------------------------------------- drawing a snapshot

/** Fake timers chosen so the growth stage of each field matches the snapshot. */
const STAGE_PROGRESS = [0.1, 0.5, 0.8, 1.01];
const GROW_SEC = 100;
const FAR = 1e10;

/** A stand-in "game" for a visited farm: its own state and occupancy, and a clock stopped at the snapshot. */
export class FrozenGame extends Game {
  constructor(private at: number) { super(); }
  override now(): number { return this.at; }
}

/**
 * A save-shaped state that draws exactly like the snapshot (fields at their stage, trees, animals,
 * busy workshops). Only for drawing: it is never saved, ticked or given to any game system.
 */
export function snapshotState(s: FarmSnapshot): SaveData {
  const state = createNewGame(s.at, 1);
  const at = s.at;
  state.player = { ...state.player, name: s.name, level: s.level, look: { ...s.look }, created: true };
  state.land = { unlocked: [...s.land], bought: 0 };
  state.obstacles = s.obs.map(([type, x, z, model], i): Obstacle => ({ id: i, type, x, z, model }));
  state.buildings = s.b.map((e, i): PlacedBuilding => {
    const [type, x, z, rot] = e;
    const ex: SnapExtra = e[4] ?? {};
    const def = BUILDING[type];
    const b: PlacedBuilding = { uid: i + 1, type, x, z, rot, level: ex.l ?? 1 };
    if (ex.c) b.buildEnd = at + FAR;
    if (def.id === 'plot') b.plot = ex.p ? { crop: ex.p[0], growSec: GROW_SEC, plantedAt: at - STAGE_PROGRESS[ex.p[1]] * GROW_SEC * 1000 } : null;
    if (def.tree) b.tree = { readyAt: ex.t ? at - 1 : at + FAR };
    if (def.animal) {
      const [n, ready, hungry] = ex.a ?? [0, 0, 0];
      b.animals = Array.from({ length: n }, (_v, k) => ({ fedAt: k < ready ? 0 : k < ready + hungry ? null : at }));
    }
    if (def.cat === 'production' && ex.r) {
      const recipe = RECIPES.find((r) => r.building === type);
      if (recipe) b.queue = [{ recipe: recipe.id, start: at - 1, end: at + FAR }];
    }
    return b;
  });
  state.nextUid = state.buildings.length + 1;
  return state;
}
