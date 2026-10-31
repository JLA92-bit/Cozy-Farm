/**
 * 1.25 mastery lines: what the line picked for a mastered crop or workshop does (mastery.json `lines`). Kept small and
 * free of UI and save imports (like SkillEffects.ts) so farming, workshops and quality rolls can ask cheaply. The
 * picking itself is in Mastery.ts.
 */
import { MASTERY, RECIPES } from '../data';
import { game } from './Game';
import { qualityBoosts } from './Quality';

export type LineKind = 'crop' | 'workshop';
export interface LineDef { id: string; name: string; icon: string; text: string; chance?: number; gold?: number; mult?: number }
export const LINES = MASTERY.lines as unknown as Record<LineKind, LineDef[]>;
/** 1.37 Grand Mastery (mastery.json `grand`). */
export const GRAND = (MASTERY as unknown as { grand: { unlockLevel: number; cropGold: number; workshopGold: number; reward: { coins: number; gems: number }; plaque: string; gold: number } }).grand;
const grand = (entry: string): boolean => !!game.state?.mastery?.grand?.includes(entry);

/** The line picked for an entry (`crop:<id>` or `workshop:<building>`), if any. */
export const pickOf = (entry: string): LineDef | undefined => {
  const id = game.state?.mastery?.picks?.[entry];
  const kind = entry.split(':')[0] as LineKind;
  return id ? LINES[kind]?.find((l) => l.id === id) : undefined;
};
const line = (entry: string, id: string): LineDef | undefined => { const l = pickOf(entry); return l?.id === id ? l : undefined; };

/** Bumper Crop: the chance of one extra crop at a harvest. */
export const cropExtraChance = (crop: string): number => line(`crop:${crop}`, 'yield')?.chance ?? 0;
/** Quick Growth: grow-time multiplier for a crop being sown. */
export const cropGrowMultFor = (crop: string): number => line(`crop:${crop}`, 'speed')?.mult ?? 1;
/** Batch Bonus: the extra chance that a batch makes double at this workshop. */
export const workshopBatchChance = (building: string): number => line(`workshop:${building}`, 'yield')?.chance ?? 0;
/** Quick Hands: time multiplier for a workshop's batches. */
export const workshopTimeMultFor = (building: string): number => line(`workshop:${building}`, 'speed')?.mult ?? 1;

/** Which workshops make an item (for the Gold Standard line). */
let makers: Map<string, string[]> | null = null;
const madeBy = (item: string): string[] => {
  if (!makers) { makers = new Map(); for (const r of RECIPES) makers.set(r.item, [...(makers.get(r.item) ?? []), r.building]); }
  return makers.get(item) ?? [];
};

qualityBoosts.push((source, item) => {
  if (source === 'crop') { const l = line(`crop:${item}`, 'gold'); return l ? { gold: l.gold } : null; }
  if (source === 'production') { for (const b of madeBy(item)) { const l = line(`workshop:${b}`, 'gold'); if (l) return { gold: l.gold }; } }
  return null;
});
// 1.37 Grand Mastery: a little more gold for that crop, or for goods its workshop makes
qualityBoosts.push((source, item) => {
  if (source === 'crop' || source === 'tree') return grand(`crop:${item}`) ? { gold: GRAND.gold } : null;
  if (source === 'production') return madeBy(item).some((b) => grand(`workshop:${b}`)) ? { gold: GRAND.gold } : null;
  return null;
});
