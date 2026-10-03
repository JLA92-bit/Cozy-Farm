import { BUILDING, FARMHOUSE, type BuildingDef } from '../data';
import { game } from './Game';
import type { PlacedBuilding } from './State';

/** Cap keys the Farmhouse raises, in the order players care about them. */
export const CAP_KEYS = ['plot', 'tree', 'decor', 'animal', 'production'] as const;
export type CapKey = (typeof CAP_KEYS)[number];

/** Short names for what each cap counts. animal / production caps apply to each kind of home / workshop. */
export const CAP_NAMES: Record<CapKey, { one: string; many: string; each?: boolean; icon: string }> = {
  plot: { one: 'field', many: 'fields', icon: 'seedling' },
  tree: { one: 'fruit tree', many: 'fruit trees', icon: 'apple' },
  decor: { one: 'decoration', many: 'decorations', icon: 'sparkles' },
  animal: { one: 'of each animal home', many: 'of each animal home', each: true, icon: 'chicken' },
  production: { one: 'of each workshop', many: 'of each workshop', each: true, icon: 'hammer_wrench' },
};

const capsTable = FARMHOUSE.caps as Record<string, number[]>;

/** Cap value for a key at a given farmhouse level (clamped to the table). */
export function capAt(key: CapKey, fhLevel: number): number {
  const arr = capsTable[key];
  if (!arr?.length) return 0;
  return arr[Math.max(0, Math.min(arr.length, fhLevel) - 1)];
}

export const MAX_FARMHOUSE = FARMHOUSE.levels.length;

export function farmhouseBuilding(): PlacedBuilding | undefined { return game.buildingsOf('farmhouse')[0]; }

/** What going from `fromLevel` to `fromLevel + 1` adds, biggest player-facing things first. */
export function farmhouseGains(fromLevel: number): { key: CapKey; add: number }[] {
  if (fromLevel >= MAX_FARMHOUSE) return [];
  const out: { key: CapKey; add: number }[] = [];
  for (const key of CAP_KEYS) {
    const add = capAt(key, fromLevel + 1) - capAt(key, fromLevel);
    if (add > 0) out.push({ key, add });
  }
  return out;
}

export function gainText(g: { key: CapKey; add: number }): string {
  const n = CAP_NAMES[g.key];
  return `+${g.add} ${g.add === 1 ? n.one : n.many}`;
}

/** "+6 fields, +2 fruit trees, +20 decorations" for the next farmhouse level. */
export function farmhouseGainsText(fromLevel: number): string {
  const g = farmhouseGains(fromLevel);
  return g.length ? g.map(gainText).join(', ') : 'Fully upgraded';
}

export interface CapRaise {
  /** Farmhouse level that raises the cap. */
  level: number;
  /** How many more the cap allows at that level. */
  add: number;
  /** Player level needed for that farmhouse upgrade. */
  playerLevel: number;
  cost: number;
}

/** The nearest farmhouse level above the current one that raises `key`, or null when it never grows again. */
export function nextCapRaise(key: CapKey): CapRaise | null {
  const cur = game.farmhouseLevel;
  const now = capAt(key, cur);
  for (const lv of FARMHOUSE.levels) {
    if (lv.level <= cur) continue;
    const add = capAt(key, lv.level) - now;
    if (add > 0) return { level: lv.level, add, playerLevel: lv.playerLevel, cost: lv.cost };
  }
  return null;
}

/** Is this building limited by a farmhouse cap that is currently full? */
export function atFarmhouseCap(def: BuildingDef): boolean {
  if (def.max || !def.cap || def.cap === 'none') return false;
  return game.capUsage(def) >= game.capFor(def);
}

/** Friendly "how do I get more?" line for a capped building, e.g. "Farmhouse level 3 gives 8 more fields". */
export function moreRoomHint(def: BuildingDef): { title: string; sub: string } {
  const key = def.cap as CapKey;
  const names = CAP_NAMES[key];
  const what = key === 'plot' ? 'fields' : names?.each ? `${def.name}s` : names?.many ?? 'of these';
  const raise = names ? nextCapRaise(key) : null;
  if (!raise) return { title: `You have all the ${what} you can have`, sub: 'Your farm is at its biggest - lovely!' };
  const more = key === 'animal' || key === 'production' ? `room for ${raise.add} more` : `${raise.add} more ${raise.add === 1 ? names.one : names.many}`;
  const need = game.level < raise.playerLevel ? ` (opens at player level ${raise.playerLevel})` : '';
  return { title: `No room for more ${what}`, sub: `Upgrade your Farmhouse to level ${raise.level} for ${more}${need}` };
}

/** Short card text for a full cap: "Farmhouse Lv 3: +8". */
export function capCardHint(def: BuildingDef): string {
  const raise = def.cap ? nextCapRaise(def.cap as CapKey) : null;
  return raise ? `Farmhouse Lv ${raise.level}: +${raise.add}` : 'All done!';
}

/** Field counts for goal cards and the shop. */
export function fieldStatus(): { owned: number; cap: number; price: number; free: boolean } {
  const def = BUILDING.plot;
  const owned = game.capUsage(def);
  const cap = game.capFor(def);
  return { owned, cap, price: game.priceOf(def), free: owned < cap };
}
