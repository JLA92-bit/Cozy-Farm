import { ANIMAL, BUILDING, RECIPE } from '../data';
import type { PlacedBuilding } from './State';

/** Pure helpers that derive timer state from timestamps (so offline progress is automatic). */

export function plotProgress(plot: { plantedAt: number; growSec: number }, now: number): number {
  return Math.min(1, Math.max(0, (now - plot.plantedAt) / (plot.growSec * 1000)));
}
/** 0 sprout, 1 young, 2 growing, 3 ready */
export function cropStage(plot: { plantedAt: number; growSec: number }, now: number): number {
  const p = plotProgress(plot, now);
  if (p >= 1) return 3;
  return p < 0.3 ? 0 : p < 0.65 ? 1 : 2;
}
export function plotReady(b: PlacedBuilding, now: number): boolean {
  return !!b.plot && plotProgress(b.plot, now) >= 1;
}
export function plotRemaining(b: PlacedBuilding, now: number): number {
  if (!b.plot) return 0;
  return Math.max(0, b.plot.plantedAt + b.plot.growSec * 1000 - now);
}

export function treeReady(b: PlacedBuilding, now: number): boolean {
  return !!b.tree && b.tree.readyAt <= now && isBuilt(b, now);
}

export function isBuilt(b: PlacedBuilding, now: number): boolean { return !b.buildEnd || b.buildEnd <= now; }
export function isUpgrading(b: PlacedBuilding, now: number): boolean { return !!b.upgradeEnd && b.upgradeEnd > now; }

export type AnimalState = 'hungry' | 'producing' | 'ready';
export function animalState(b: PlacedBuilding, i: number, now: number): AnimalState {
  const a = b.animals?.[i];
  if (!a || a.fedAt === null) return 'hungry';
  const def = ANIMAL[BUILDING[b.type].animal!];
  return now >= a.fedAt + def.produceSec * 1000 ? 'ready' : 'producing';
}
export function animalReadyAt(b: PlacedBuilding, i: number): number {
  const a = b.animals?.[i];
  if (!a || a.fedAt === null) return 0;
  return a.fedAt + ANIMAL[BUILDING[b.type].animal!].produceSec * 1000;
}

/** Production: finished entries are those whose end has passed. */
export function productionState(b: PlacedBuilding, now: number): { running: boolean; done: number; queued: number; current?: { recipe: string; start: number; end: number } } {
  const q = b.queue ?? [];
  let done = b.ready?.length ?? 0;
  let current;
  let queued = 0;
  for (const e of q) {
    if (e.end <= now) done++;
    else { queued++; if (!current && e.start <= now) current = e; }
  }
  return { running: !!current, done, queued, current };
}

/** Move finished queue entries into the building's ready list. */
export function settleProduction(b: PlacedBuilding, now: number): void {
  if (!b.queue?.length) return;
  const keep = [];
  for (const e of b.queue) {
    if (e.end > now) { keep.push(e); continue; }
    const r = RECIPE[e.recipe];
    (b.ready ??= []).push(...Array(r.out).fill(r.item));
    // 1.8: goods made from star ingredients keep that star until collected
    if (e.q) { const st = ((b.readyStar ??= {})[r.item] ??= [0, 0]); st[e.q - 1] += r.out; }
  }
  b.queue = keep;
}

export function formatTime(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return r ? `${m}m ${r}s` : `${m}m`;
  const h = Math.floor(m / 60), mm = m % 60;
  if (h < 24) return mm ? `${h}h ${mm}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}
