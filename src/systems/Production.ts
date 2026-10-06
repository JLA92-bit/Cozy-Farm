import { BUILDING, RECIPE, RECIPES, type RecipeDef } from '../data';
import { buildings, speedupCost } from './Buildings';
import { game, type Vec } from './Game';
import type { PlacedBuilding } from './State';
import { isBuilt, settleProduction } from './Timers';
import { addRolled, rollsQuality, type Quality } from './Quality';

export class ProductionSystem {
  recipesFor(type: string): RecipeDef[] {
    return RECIPES.filter((r) => r.building === type).sort((a, b) => a.level - b.level);
  }

  queued(b: PlacedBuilding): number { return (b.queue ?? []).filter((q) => q.end > game.now()).length; }

  /**
   * 1.8: can one more of this recipe be made entirely from silver (1) or gold (2) ingredients? Only for goods
   * that carry a star (not feed or bait).
   */
  canUseStar(recipe: string, q: 1 | 2): boolean {
    const r = RECIPE[recipe];
    return !!r && rollsQuality(r.item) && Object.entries(r.in).every(([item, n]) => game.qualityCounts(item)[q] >= n);
  }

  canQueue(b: PlacedBuilding, recipe: string, star: Quality = 0): { ok: boolean; reason?: string } {
    const r = RECIPE[recipe];
    if (!isBuilt(b, game.now())) return { ok: false, reason: 'Still being built' };
    if (game.level < r.level) return { ok: false, reason: `Unlocks at level ${r.level}` };
    if (this.queued(b) >= buildings.slots(b)) return { ok: false, reason: 'Queue is full' };
    if (!game.has(r.in)) return { ok: false, reason: 'Missing ingredients' };
    if (star && !this.canUseStar(recipe, star)) return { ok: false, reason: `Not enough ${star === 2 ? 'gold' : 'silver'} ingredients` };
    return { ok: true };
  }

  /** Queue a job. `star` 1 or 2 takes silver or gold ingredients and the goods come out at that quality. */
  queue(b: PlacedBuilding, recipe: string, star: Quality = 0): boolean {
    if (!this.canQueue(b, recipe, star).ok) return false;
    const r = RECIPE[recipe];
    if (star) { for (const [item, n] of Object.entries(r.in)) game.removeQuality(item, star, n); }
    else game.take(r.in);
    const now = game.now();
    settleProduction(b, now);
    const q = (b.queue ??= []);
    const start = q.length ? Math.max(now, q[q.length - 1].end) : now;
    q.push(star ? { recipe, start, end: start + r.sec * 1000, q: star } : { recipe, start, end: start + r.sec * 1000 });
    if (star) game.incStat('star_jobs');
    game.bus.emit('production:queued', { b, recipe });
    game.bus.emit('building:changed', { b });
    game.bus.emit('sfx', { name: 'select' });
    return true;
  }

  /** Take back a job that has not started yet: ingredients are refunded and later jobs move up. */
  cancel(b: PlacedBuilding, index: number): boolean {
    const now = game.now();
    settleProduction(b, now);
    const q = b.queue ?? [];
    const e = q[index];
    if (!e || e.start <= now) return false;
    const dur = e.end - e.start;
    q.splice(index, 1);
    for (let k = index; k < q.length; k++) { q[k].start -= dur; q[k].end -= dur; }
    // star ingredients come back as stars
    for (const [item, n] of Object.entries(RECIPE[e.recipe].in)) game.addItem(item, n, undefined, e.q ?? 0);
    game.bus.emit('building:changed', { b });
    game.bus.emit('sfx', { name: 'close' });
    return true;
  }

  /** Collect everything finished. */
  collect(b: PlacedBuilding, at?: Vec, night = false): string[] {
    settleProduction(b, game.now());
    const items = b.ready ?? [];
    if (!items.length) return [];
    const star = b.readyStar ?? {};
    b.ready = [];
    delete b.readyStar;
    const counts: Record<string, number> = {};
    for (const i of items) counts[i] = (counts[i] ?? 0) + 1;
    let xp = 0;
    for (const [item, n] of Object.entries(counts)) {
      // goods from star ingredients keep their star; the rest roll their own small chance
      const s = Math.min(n, star[item]?.[0] ?? 0), g = Math.min(n - s, star[item]?.[1] ?? 0);
      addRolled('production', item, n - s - g, at);
      if (s) game.addItem(item, s, at, 1);
      if (g) game.addItem(item, g, at, 2);
      const r = RECIPES.find((x) => x.item === item && x.building === b.type);
      xp += Math.round(((r?.xp ?? 1) * n) / (r?.out ?? 1));
    }
    game.addXp(xp, at);
    game.incStat('items_produced', items.length);
    game.incStat(`made_${b.type}`, items.length);
    if (night) game.incStat('night_collects', items.length);
    game.bus.emit('production:collected', { b, items });
    game.bus.emit('building:changed', { b });
    game.bus.emit('sfx', { name: 'collect' });
    return items;
  }

  /** Gem cost to finish the job currently running. */
  speedupCost(b: PlacedBuilding): number {
    const now = game.now();
    const cur = (b.queue ?? []).find((q) => q.start <= now && q.end > now);
    return cur ? speedupCost(cur.end - now) : 0;
  }

  speedup(b: PlacedBuilding): boolean {
    const now = game.now();
    const q = b.queue ?? [];
    const idx = q.findIndex((e) => e.start <= now && e.end > now);
    if (idx < 0) return false;
    if (!game.spend(0, this.speedupCost(b))) return false;
    const shift = q[idx].end - now;
    for (let i = idx; i < q.length; i++) { q[i].end -= shift; if (i > idx) q[i].start -= shift; }
    settleProduction(b, now);
    game.bus.emit('building:changed', { b });
    game.bus.emit('sfx', { name: 'gem' });
    return true;
  }

  /** All production buildings with finished goods (for the HUD/goal hints). */
  readyBuildings(): PlacedBuilding[] {
    const now = game.now();
    return game.state.buildings.filter((b) => BUILDING[b.type].cat === 'production' && ((b.ready?.length ?? 0) > 0 || (b.queue ?? []).some((q) => q.end <= now)));
  }
}

export const production = new ProductionSystem();
