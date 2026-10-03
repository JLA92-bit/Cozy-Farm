import { BUILDING, ITEMS } from '../data';
import { game } from './Game';
import { animalState, isBuilt, plotReady, treeReady } from './Timers';

export interface OfflineSummary {
  awayMs: number;
  crops: number;
  trees: number;
  animals: number;
  goods: number;
  built: string[];
  stallSold: { item: string; coins: number }[];
}

/**
 * Everything is timestamp-based, so progress continues while the game is closed. This just
 * summarises what became ready since `lastSeen` for the "Welcome back!" screen.
 */
export function offlineSummary(lastSeen: number, now = game.now()): OfflineSummary {
  const s: OfflineSummary = { awayMs: now - lastSeen, crops: 0, trees: 0, animals: 0, goods: 0, built: [], stallSold: [] };
  for (const b of game.state.buildings) {
    if (b.plot && plotReady(b, now) && b.plot.plantedAt + b.plot.growSec * 1000 > lastSeen) s.crops++;
    if (BUILDING[b.type].tree && treeReady(b, now) && b.tree!.readyAt > lastSeen) s.trees++;
    (b.animals ?? []).forEach((_, i) => { if (animalState(b, i, now) === 'ready') s.animals++; });
    s.goods += (b.ready?.length ?? 0) + (b.queue ?? []).filter((q) => q.end <= now).length;
    if (b.buildEnd && b.buildEnd > lastSeen && isBuilt(b, now)) s.built.push(BUILDING[b.type].name);
  }
  for (const slot of game.state.stall.slots) {
    if (slot.item && slot.soldAt && slot.soldAt > lastSeen && slot.soldAt <= now) s.stallSold.push({ item: ITEMS[slot.item]?.name ?? slot.item, coins: slot.price });
  }
  return s;
}

export function hasNews(s: OfflineSummary): boolean {
  return s.crops + s.trees + s.animals + s.goods + s.built.length + s.stallSold.length > 0;
}
