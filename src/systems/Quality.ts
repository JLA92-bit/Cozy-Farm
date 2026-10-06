/**
 * 1.8 star quality (silver / gold). The counts live in game.state.quality and are kept in step with the
 * inventory by game.addItem / game.removeQuality (src/systems/Game.ts). This file decides the quality of new
 * items; the 1.8 quality agent wires rollQuality() into harvests, animals, fishing and workshops and adds the
 * bonuses (fertiliser, perks) through qualityBoosts.
 */
import { game, QUALITY_MULT } from './Game';
import { ECONOMY } from '../data';

export type Quality = 0 | 1 | 2;
export const QUALITY_NAME = ['Normal', 'Silver', 'Gold'] as const;
export { QUALITY_MULT };

/** Where an item came from, for boosts that only apply to some sources. */
export type QualitySource = 'crop' | 'tree' | 'animal' | 'fish' | 'production' | 'other';

/** Extra chances (0..1 added to silver / gold) from fertiliser, perks and skills. Systems push functions here. */
export const qualityBoosts: ((source: QualitySource, item: string) => { silver?: number; gold?: number } | null)[] = [];

const BASE = (ECONOMY as unknown as { quality?: { silver: number; gold: number } }).quality ?? { silver: 0.12, gold: 0.03 };

/** The chance of silver and gold right now for this source and item (gold capped at 0.25, both at 0.6). */
export function qualityChances(source: QualitySource, item: string): { silver: number; gold: number } {
  let silver = BASE.silver, gold = BASE.gold;
  for (const f of qualityBoosts) { const b = f(source, item); if (b) { silver += b.silver ?? 0; gold += b.gold ?? 0; } }
  gold = Math.min(0.25, Math.max(0, gold));
  silver = Math.min(0.6 - gold, Math.max(0, silver));
  return { silver, gold };
}

/** Roll the quality of one new item. `rand` is injectable for tests. */
export function rollQuality(source: QualitySource, item: string, rand: () => number = Math.random): Quality {
  const { silver, gold } = qualityChances(source, item);
  const r = rand();
  return r < gold ? 2 : r < gold + silver ? 1 : 0;
}

/** The best quality held of an item (for gifts and bundles that want a star). */
export function bestQuality(item: string): Quality {
  const [, s, g] = game.qualityCounts(item);
  return g > 0 ? 2 : s > 0 ? 1 : 0;
}
