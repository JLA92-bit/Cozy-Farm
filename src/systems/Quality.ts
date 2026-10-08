/**
 * 1.8 star quality (silver / gold). The counts live in game.state.quality and are kept in step with the
 * inventory by game.addItem / game.removeQuality (src/systems/Game.ts). This file decides the quality of new
 * items; the 1.8 quality agent wires rollQuality() into harvests, animals, fishing and workshops and adds the
 * bonuses (fertiliser, perks) through qualityBoosts.
 */
import { game, QUALITY_MULT, type Vec } from './Game';
import { ECONOMY, ITEMS } from '../data';

export type Quality = 0 | 1 | 2;
export const QUALITY_NAME = ['Normal', 'Silver', 'Gold'] as const;
export { QUALITY_MULT };

/** Where an item came from, for boosts that only apply to some sources. */
export type QualitySource = 'crop' | 'tree' | 'animal' | 'fish' | 'production' | 'forage' | 'other';

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

/**
 * Does this item come out with a star when made? Feed, bait, fertiliser and event tokens are tools rather than
 * produce, so a "silver chicken feed" would only confuse: they are always normal.
 */
export function rollsQuality(item: string): boolean {
  const c = ITEMS[item]?.cat;
  return !!c && c !== 'feed' && c !== 'event';
}

/** Roll n items one by one: how many came out normal, silver and gold. */
export function rollCounts(source: QualitySource, item: string, n: number, rand: () => number = Math.random): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  if (!rollsQuality(item)) { out[0] = Math.max(0, n); return out; }
  for (let i = 0; i < n; i++) out[rollQuality(source, item, rand)]++;
  return out;
}

/**
 * Add n freshly made items, each rolling its own quality (a harvest of 2 can be 1 normal + 1 gold). Normal
 * first, so the floating "+n" reads in order and the star pops land on top. Returns the split.
 */
export function addRolled(source: QualitySource, item: string, n: number, at?: Vec): [number, number, number] {
  const split = rollCounts(source, item, n);
  split.forEach((k, q) => { if (k > 0) game.addItem(item, k, at, q as Quality); });
  countStars(split[1], split[2]);
  // 1.8.6 mastery plaques count gold items one kind at a time
  if (split[2] > 0) game.incStat(`gold_${item}`, split[2]);
  return split;
}

/** Sell price of one item at a quality (same formula as game.sellItem). */
export function qualityPrice(item: string, q: Quality, n = 1): number {
  return Math.round((ITEMS[item]?.sell ?? 0) * n * ECONOMY.barn.sellMult * QUALITY_MULT[q] * game.sellBonus(item));
}

/** Dashboard counters for stars made in play (not refunds or gifts). */
export function countStars(silver: number, gold: number): void {
  if (silver > 0) game.incStat('silver_items', silver);
  if (gold > 0) game.incStat('gold_items', gold);
}
