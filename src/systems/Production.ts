import { BUILDING, RECIPE, RECIPES, type RecipeDef } from '../data';
import { buildings, speedupCost } from './Buildings';
import { game, type Vec } from './Game';
import type { PlacedBuilding } from './State';
import { isBuilt, settleProduction } from './Timers';

export class ProductionSystem {
  recipesFor(type: string): RecipeDef[] {
    return RECIPES.filter((r) => r.building === type).sort((a, b) => a.level - b.level);
  }

  queued(b: PlacedBuilding): number { return (b.queue ?? []).filter((q) => q.end > game.now()).length; }

  canQueue(b: PlacedBuilding, recipe: string): { ok: boolean; reason?: string } {
    const r = RECIPE[recipe];
    if (!isBuilt(b, game.now())) return { ok: false, reason: 'Still being built' };
    if (game.level < r.level) return { ok: false, reason: `Unlocks at level ${r.level}` };
    if (this.queued(b) >= buildings.slots(b)) return { ok: false, reason: 'Queue is full' };
    if (!game.has(r.in)) return { ok: false, reason: 'Missing ingredients' };
    return { ok: true };
  }

  queue(b: PlacedBuilding, recipe: string): boolean {
    if (!this.canQueue(b, recipe).ok) return false;
    const r = RECIPE[recipe];
    game.take(r.in);
    const now = game.now();
    settleProduction(b, now);
    const q = (b.queue ??= []);
    const start = q.length ? Math.max(now, q[q.length - 1].end) : now;
    q.push({ recipe, start, end: start + r.sec * 1000 });
    game.bus.emit('production:queued', { b, recipe });
    game.bus.emit('building:changed', { b });
    game.bus.emit('sfx', { name: 'select' });
    return true;
  }

  /** Collect everything finished. */
  collect(b: PlacedBuilding, at?: Vec, night = false): string[] {
    settleProduction(b, game.now());
    const items = b.ready ?? [];
    if (!items.length) return [];
    b.ready = [];
    const counts: Record<string, number> = {};
    for (const i of items) counts[i] = (counts[i] ?? 0) + 1;
    let xp = 0;
    for (const [item, n] of Object.entries(counts)) {
      game.addItem(item, n, at);
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
