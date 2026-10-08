import { CROP, ECONOMY, TREE, BUILDING, ITEMS } from '../data';
import { buildings } from './Buildings';
import { game, type Vec } from './Game';
import type { PlacedBuilding } from './State';
import { isBuilt, plotReady, plotRemaining, treeReady } from './Timers';
import { speedupCost } from './Buildings';
import { addRolled, qualityBoosts } from './Quality';
import { plantGrowthMult } from './Weather';
import { bigHarvestChance, cropGrowMult, seedSaverChance } from './SkillEffects';
import { RESTORATION, HELPERS } from '../data';
import { craftFertMult, sprinklerGrowMult, underGlass, hasGlass } from './HelperEffects';
import { seasons } from './Seasons';
import { SEASONS } from '../data';

/** 1.8 fertiliser: the item and what one does to the harvest of the field it was sown with. */
export const FERTILISER = 'fertiliser';
/** 1.8.5 Rosa's rare seeds (Pantry): sown like fertiliser, with a bigger boost. */
export const RARE_SEED = 'rare_seed';
/** 1.8.5 Quality fertiliser (made at Bram's forge): used before plain fertiliser while the toggle is on. */
export const QUALITY_FERT = 'quality_fertiliser';
/** Fertiliser of either kind in the barn. */
export const fertStock = (): number => game.count(FERTILISER) + game.count(QUALITY_FERT);
const FERT_BOOST = { silver: 0.1, gold: 0.05 };
/** true only while a fertilised field is being harvested (the boost reads it) */
let harvestingFert = false;
let harvestingRare = false;
let harvestingQFert = false;
let harvestingInSeason = false;
qualityBoosts.push((source) => (source === 'crop' && harvestingFert ? FERT_BOOST : null));
qualityBoosts.push((source) => {
  if (source !== 'crop' || !harvestingQFert) return null;
  const m = craftFertMult();
  return { silver: HELPERS.qualityFertiliser.silver * m, gold: HELPERS.qualityFertiliser.gold * m };
});
qualityBoosts.push((source) => (source === 'crop' && harvestingInSeason ? { silver: SEASONS.bonus.silver, gold: SEASONS.bonus.gold } : null));
qualityBoosts.push((source) => (source === 'crop' && harvestingRare ? RESTORATION.rewards.rareSeedBoost : null));

export class FarmingSystem {
  /** The seed tray's "Fertiliser" toggle: sow each field with one while the barn has some. */
  useFert = false;
  /** The seed tray's "Rare seeds" toggle (1.8.5): sow each field with one while the barn has some. */
  useRare = false;

  canPlant(b: PlacedBuilding, crop: string): { ok: boolean; reason?: string } {
    const def = CROP[crop];
    if (!def) return { ok: false };
    if (b.type !== 'plot' || b.plot) return { ok: false, reason: 'Field is busy' };
    if (!isBuilt(b, game.now())) return { ok: false, reason: 'Still being built' };
    if (game.level < def.level) return { ok: false, reason: `Unlocks at level ${def.level}` };
    if (!seasons.open(crop) && !underGlass(b)) {
      const back = seasons.nextSeasonFor(crop);
      return { ok: false, reason: back ? `${def.name} is out of season. Back in ${SEASONS.seasons[back.season].name} (${back.days} day${back.days === 1 ? '' : 's'})${hasGlass() ? ', or sow it under a glass frame' : ''}` : `${def.name} is out of season` };
    }
    if (game.coins < def.seedCost) return { ok: false, reason: 'Not enough coins' };
    return { ok: true };
  }

  plant(b: PlacedBuilding, crop: string): boolean {
    if (!this.canPlant(b, crop).ok) return false;
    const def = CROP[crop];
    game.spend(def.seedCost);
    // Charm speeds growth a little; so does a rainy day (1.8 weather)
    const growSec = Math.max(5, Math.round(def.growSec * (1 - buildings.bonuses().growth) * plantGrowthMult() * cropGrowMult() * sprinklerGrowMult(b) * (seasons.seasonal(crop) ? SEASONS.bonus.growMult : 1)));
    b.plot = { crop, plantedAt: game.now(), growSec };
    if (seasons.seasonal(crop)) b.plot.inSeason = true;
    if (this.useFert && fertStock() > 0) {
      const q = game.count(QUALITY_FERT) > 0;
      game.addItem(q ? QUALITY_FERT : FERTILISER, -1);
      b.plot.fert = true;
      if (q) b.plot.qfert = true;
      game.incStat('fertiliser_used');
      // the last bag is gone: the toggle switches itself off
      if (fertStock() <= 0) this.useFert = false;
    }
    if (this.useRare && game.count(RARE_SEED) > 0) {
      game.addItem(RARE_SEED, -1);
      b.plot.rare = true;
      game.incStat('rare_seeds_used');
      if (game.count(RARE_SEED) <= 0) this.useRare = false;
    }
    game.incStat('plants_planted');
    game.discover(crop, 'crop');
    game.bus.emit('crop:planted', { b, crop });
    game.bus.emit('building:changed', { b });
    return true;
  }

  harvest(b: PlacedBuilding, at?: Vec): number {
    if (!b.plot || !plotReady(b, game.now())) return 0;
    const def = CROP[b.plot.crop];
    // 1.8.5 skills: Big Harvest sometimes doubles the crop, Seed Saver sometimes gives the seed money back
    const double = Math.random() < bigHarvestChance();
    const qty = def.yield * (double ? 2 : 1);
    harvestingFert = !!b.plot.fert && !b.plot.qfert;
    harvestingQFert = !!b.plot.qfert;
    harvestingRare = !!b.plot.rare;
    harvestingInSeason = !!b.plot.inSeason;
    try { addRolled('crop', def.id, qty, at); } finally { harvestingFert = false; harvestingQFert = false; harvestingRare = false; harvestingInSeason = false; }
    game.addXp(def.xp, at);
    if (double) game.bus.emit('toast', { title: 'Big Harvest!', sub: 'A double crop', icon: 'basket' });
    if (Math.random() < seedSaverChance()) { game.addCoins(def.seedCost, at); game.bus.emit('toast', { title: 'Seed Saver', sub: `Your seed money came back (${def.seedCost})`, icon: 'seed' }); }
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
    addRolled('tree', def.item, def.yield, at);
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
