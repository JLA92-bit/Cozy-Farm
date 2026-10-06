import { CROP, ECONOMY, TREE, BUILDING, ITEMS } from '../data';
import { buildings } from './Buildings';
import { game, type Vec } from './Game';
import type { PlacedBuilding } from './State';
import { isBuilt, plotReady, plotRemaining, treeReady } from './Timers';
import { speedupCost } from './Buildings';
import { plantGrowthMult } from './Weather';

export class FarmingSystem {
  canPlant(b: PlacedBuilding, crop: string): { ok: boolean; reason?: string } {
    const def = CROP[crop];
    if (!def) return { ok: false };
    if (b.type !== 'plot' || b.plot) return { ok: false, reason: 'Field is busy' };
    if (!isBuilt(b, game.now())) return { ok: false, reason: 'Still being built' };
    if (game.level < def.level) return { ok: false, reason: `Unlocks at level ${def.level}` };
    if (game.coins < def.seedCost) return { ok: false, reason: 'Not enough coins' };
    return { ok: true };
  }

  plant(b: PlacedBuilding, crop: string): boolean {
    if (!this.canPlant(b, crop).ok) return false;
    const def = CROP[crop];
    game.spend(def.seedCost);
    // Charm speeds growth a little; so does a rainy day (1.8 weather)
    const growSec = Math.max(5, Math.round(def.growSec * (1 - buildings.bonuses().growth) * plantGrowthMult()));
    b.plot = { crop, plantedAt: game.now(), growSec };
    game.incStat('plants_planted');
    game.discover(crop, 'crop');
    game.bus.emit('crop:planted', { b, crop });
    game.bus.emit('building:changed', { b });
    return true;
  }

  harvest(b: PlacedBuilding, at?: Vec): number {
    if (!b.plot || !plotReady(b, game.now())) return 0;
    const def = CROP[b.plot.crop];
    const qty = def.yield;
    game.addItem(def.id, qty, at);
    game.addXp(def.xp, at);
    game.incStat('crops_harvested', qty);
    game.incStat(`harvest_${def.id}`, qty);
    const types = new Set(Object.keys(game.state.stats).filter((k) => k.startsWith('harvest_') && CROP[k.slice(8)]));
    game.setGauge('crop_types', types.size);
    this.maybeEventToken(at);
    const crop = def.id;
    b.plot = null;
    game.bus.emit('crop:harvested', { b, crop, qty });
    game.bus.emit('building:changed', { b });
    return qty;
  }

  harvestTree(b: PlacedBuilding, at?: Vec): number {
    if (!treeReady(b, game.now())) return 0;
    const def = TREE[BUILDING[b.type].tree!];
    game.addItem(def.item, def.yield, at);
    game.addXp(def.xp, at);
    game.incStat('fruit_harvested', def.yield);
    game.incStat(`harvest_${def.item}`, def.yield);
    this.maybeEventToken(at);
    const growSec = Math.max(5, Math.round(def.growSec * (1 - buildings.bonuses().growth)));
    b.tree = { readyAt: game.now() + growSec * 1000 };
    game.bus.emit('tree:harvested', { b, item: def.item, qty: def.yield });
    game.bus.emit('building:changed', { b });
    return def.yield;
  }

  /** During a seasonal event, harvesting can drop event tokens. */
  private maybeEventToken(at?: Vec): void {
    const ev = game.state.event;
    if (!ev || Math.random() > ECONOMY.eventTokenChance) return;
    ev.tokens++;
    game.incStat('event_tokens');
    const token = Object.values(ITEMS).find((i) => i.cat === 'event' && i.id === eventTokenItem(ev.id));
    game.bus.emit('item', { item: token?.id ?? 'acorn', delta: 1, total: ev.tokens, at });
  }

  speedupCost(b: PlacedBuilding): number {
    if (b.plot) return speedupCost(plotRemaining(b, game.now()));
    if (b.tree) return speedupCost(b.tree.readyAt - game.now());
    return 0;
  }

  speedup(b: PlacedBuilding): boolean {
    const cost = this.speedupCost(b);
    if (!cost || !game.spend(0, cost)) return false;
    if (b.plot) b.plot.plantedAt = game.now() - b.plot.growSec * 1000;
    else if (b.tree) b.tree.readyAt = game.now();
    game.bus.emit('building:changed', { b });
    game.bus.emit('sfx', { name: 'gem' });
    return true;
  }
}

export function eventTokenItem(eventId: string): string {
  return ({ harvest_festival: 'acorn', winter_wonderland: 'snowflake_token', spring_blossom: 'petal', summer_fair: 'seashell' } as Record<string, string>)[eventId] ?? 'acorn';
}

export const farming = new FarmingSystem();
