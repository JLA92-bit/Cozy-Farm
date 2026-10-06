/**
 * Turning what the server keeps into files a player can load (Settings > Import save) or a short farm code:
 * - Google players: their whole cloud save.
 * - Everyone else: their public farm layout (farm_snapshots), rebuilt into a playable save. Coins, gems and
 *   barn items are not in the layout, so the dashboard asks how many to give.
 * Also draws a farm layout as a small map.
 */
import { sanitizeSnapshot, snapshotState } from '../../src/online/FarmSnapshot';
import { BUILDING, CROP, LEVELS } from '../../src/data';
import { encodeFarm } from '../../src/systems/FarmMove';
import { APP_VERSION } from '../../src/systems/Version';
import { MAP, CHUNK, rotatedSize } from '../../src/world/Grid';
import type { SaveData } from '../../src/systems/State';
import { h } from './ui';

/** A playable save from a farm layout. Fields keep growing, trees are ready, animals are hungry, workshops idle. */
export function saveFromSnapshot(raw: unknown, opts: { coins: number; gems: number }): SaveData {
  const snap = sanitizeSnapshot(raw, Date.now());
  if (!snap) throw new Error('This farm layout could not be read.');
  const s = snapshotState(snap);
  const now = Date.now();
  for (const b of s.buildings) {
    delete b.buildEnd;
    if (b.plot) {
      const c = CROP[b.plot.crop];
      if (c) b.plot = { crop: c.id, growSec: c.growSec, plantedAt: now - c.growSec * 1000 * 0.5 };
      else b.plot = null;
    }
    if (b.tree) b.tree = { readyAt: now };
    if (b.animals) b.animals = b.animals.map(() => ({ fedAt: null }));
    if (b.queue) b.queue = [];
  }
  s.createdAt = now;
  s.lastSeen = now;
  s.lastSeenVersion = APP_VERSION;
  s.player = { ...s.player, coins: Math.max(0, Math.floor(opts.coins)), gems: Math.max(0, Math.floor(opts.gems)), xp: 0, created: true };
  s.tutorial = { ...s.tutorial, done: true, step: 99 };
  s.land = { ...s.land, bought: Math.max(0, s.land.unlocked.length - 4) };
  return s;
}

/** Suggested coins and gems for a rebuilt farm: about what the level-up rewards add up to, plus a cushion. */
export function suggestedMoney(level: number): { coins: number; gems: number } {
  const upTo = LEVELS.filter((l) => l.level <= level);
  const coins = upTo.reduce((a, l) => a + l.coins, 0);
  const gems = upTo.reduce((a, l) => a + l.gems, 0);
  return { coins: Math.round((coins + 300 * level) / 50) * 50, gems: Math.max(10, Math.round(gems * 1.5)) };
}

/** The "z.<data>" part of a farm link (for make_farm_transfer). */
export const farmLinkData = (json: string): Promise<string> => encodeFarm(json);

const CAT_COLOR: Record<string, string> = {
  special: 'var(--cat-1)', production: 'var(--cat-2)', animal: 'var(--cat-3)', farm: 'var(--cat-4)', decor: 'var(--cat-5)',
};
const LEGEND: [string, string][] = [['special', 'Farmhouse, barn, stalls'], ['production', 'Workshops'], ['animal', 'Animal homes'], ['farm', 'Fields and trees'], ['decor', 'Decor'], ['path', 'Paths and fences']];

/** Top-down map of a farm layout: owned land, buildings by kind, obstacles. Hover shows what is where. */
export function farmMap(raw: unknown): HTMLElement {
  const snap = sanitizeSnapshot(raw, Date.now());
  if (!snap) return h('div', { class: 'muted' }, 'No farm layout to show.');
  const owned = new Set(snap.land);
  const xs = snap.land.map((k) => Number(k.split(',')[0])), zs = snap.land.map((k) => Number(k.split(',')[1]));
  const cx0 = Math.max(0, Math.min(...xs) - 1), cx1 = Math.min(MAP / CHUNK - 1, Math.max(...xs) + 1);
  const cz0 = Math.max(0, Math.min(...zs) - 1), cz1 = Math.min(MAP / CHUNK - 1, Math.max(...zs) + 1);
  const tx0 = cx0 * CHUNK, tz0 = cz0 * CHUNK, tw = (cx1 - cx0 + 1) * CHUNK, td = (cz1 - cz0 + 1) * CHUNK;
  const S = 9;
  const cv = h('canvas', { width: tw * S, height: td * S, class: 'farm-map', 'aria-label': 'Farm map' });
  const css = getComputedStyle(document.documentElement);
  const col = (v: string) => v.startsWith('var(') ? css.getPropertyValue(v.slice(4, -1)).trim() || '#888' : v;
  const ctx = cv.getContext('2d')!;
  for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
    ctx.fillStyle = col(owned.has(`${cx},${cz}`) ? 'var(--map-land)' : 'var(--map-locked)');
    ctx.fillRect((cx - cx0) * CHUNK * S, (cz - cz0) * CHUNK * S, CHUNK * S, CHUNK * S);
  }
  ctx.fillStyle = col('var(--map-obstacle)');
  for (const [, x, z] of snap.obs) ctx.fillRect((x - tx0) * S + 3, (z - tz0) * S + 3, S - 6, S - 6);
  const spots: { x: number; z: number; w: number; d: number; name: string }[] = [];
  for (const [type, x, z, rot] of snap.b) {
    const def = BUILDING[type];
    if (!def) continue;
    const [w, d] = rotatedSize(def.size as [number, number], rot);
    const isPath = def.cap === 'none';
    ctx.fillStyle = col(isPath ? 'var(--map-path)' : CAT_COLOR[def.cat] ?? 'var(--cat-5)');
    ctx.fillRect((x - tx0) * S + 1, (z - tz0) * S + 1, w * S - 2, d * S - 2);
    spots.push({ x, z, w, d, name: def.name });
  }
  const label = h('div', { class: 'muted small map-hover' }, 'Hover the map to see what is where.');
  cv.addEventListener('pointermove', (e) => {
    const r = cv.getBoundingClientRect();
    const x = tx0 + Math.floor(((e.clientX - r.left) / r.width) * tw), z = tz0 + Math.floor(((e.clientY - r.top) / r.height) * td);
    const hit = spots.find((b) => x >= b.x && x < b.x + b.w && z >= b.z && z < b.z + b.d);
    label.textContent = hit ? `${hit.name} (tile ${x}, ${z})` : `Tile ${x}, ${z}${owned.has(`${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`) ? '' : ' - not owned yet'}`;
  });
  return h('div', { class: 'farm-map-wrap' }, cv, label,
    h('div', { class: 'legend' }, LEGEND.map(([k, t]) => h('span', { class: 'legend-item' }, h('span', { class: 'swatch', style: { background: k === 'path' ? 'var(--map-path)' : CAT_COLOR[k] } }), t)),
      h('span', { class: 'legend-item' }, h('span', { class: 'swatch', style: { background: 'var(--map-obstacle)' } }), 'Rocks, trees, bushes')),
    h('div', { class: 'muted small' }, `${snap.b.length} buildings and decorations, ${snap.land.length} land plots, level ${snap.level}.`));
}
