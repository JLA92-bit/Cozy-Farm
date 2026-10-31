/**
 * 1.35 Higher Ground: the top upgrade of a workshop (level 7, Fine Tools) or an animal home (level 6, Prize Pen)
 * makes a little more silver and gold of what comes out of that one building. Production and Animals say which
 * building is being collected (fromBuilding) while they roll the goods' stars.
 */
import { BUILDING, UPGRADES } from '../data';
import { qualityBoosts } from './Quality';
import type { PlacedBuilding } from './State';

let current: PlacedBuilding | null = null;

/** Run `fn` with `b` as the building whose goods are being rolled. */
export function fromBuilding<T>(b: PlacedBuilding, fn: () => T): T {
  const was = current;
  current = b;
  try { return fn(); } finally { current = was; }
}

type Top = { level: number; silver: number; gold: number };
const top = (cat: string): Top | null => ((cat === 'production' ? UPGRADES.production : cat === 'animal' ? UPGRADES.animal : null) as { top?: Top } | null)?.top ?? null;

/** Fine Tools / Prize Pen: true when this building has its top upgrade. */
export function hasTopUpgrade(b: PlacedBuilding): boolean {
  const t = top(BUILDING[b.type]?.cat ?? '');
  return !!t && b.level >= t.level;
}

qualityBoosts.push((source) => {
  if (!current || (source !== 'production' && source !== 'animal')) return null;
  const t = top(BUILDING[current.type]?.cat ?? '');
  return t && current.level >= t.level ? { silver: t.silver, gold: t.gold } : null;
});
