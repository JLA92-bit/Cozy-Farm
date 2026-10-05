import { ANIMAL, BUILDING, ECONOMY, FARMHOUSE, TREE, UPGRADES, type BuildingDef } from '../data';
import { game, type Vec } from './Game';
import type { PlacedBuilding } from './State';
import { isBuilt, isUpgrading, settleProduction } from './Timers';
import { farmhouseGainsText, nextCapRaise, type CapKey } from './Caps';

export type BuyCheck = { ok: true } | { ok: false; reason: string };

/** Gem cost to finish a timer now. */
export function speedupCost(msLeft: number): number {
  const min = msLeft / 60000;
  return Math.max(ECONOMY.speedup.minGems, Math.ceil(min * ECONOMY.speedup.gemsPerMinute));
}

export function isStorable(def: BuildingDef): boolean {
  return def.cat === 'decor' || def.id === 'plot' || !!def.tree;
}

export function eventCostOf(def: BuildingDef): number { return def.eventCost ?? 0; }

export class BuildingSystem {
  /** Can the player buy another one of these right now? */
  canBuy(type: string): BuyCheck {
    const def = BUILDING[type];
    if (def.cat === 'special' && def.cost === 0 && !def.max) return { ok: false, reason: 'Already built' };
    if (def.event) {
      if (game.state.event?.id !== def.event) return { ok: false, reason: 'Event item' };
      if (game.state.event.tokens < eventCostOf(def)) return { ok: false, reason: 'Not enough tokens' };
    } else if (game.level < def.level) return { ok: false, reason: `Unlocks at level ${def.level}` };
    if (game.capUsage(def) >= game.capFor(def)) {
      if (def.max) return { ok: false, reason: 'Already built' };
      const raise = nextCapRaise(def.cap as CapKey);
      return { ok: false, reason: raise ? `Upgrade the Farmhouse to level ${raise.level} for more` : 'No room for more' };
    }
    if (!def.event && game.coins < game.priceOf(def)) return { ok: false, reason: 'Not enough coins' };
    return { ok: true };
  }

  /** Create and place a new or stored building. */
  place(type: string, x: number, z: number, rot: number, fromStorage = false): PlacedBuilding | null {
    const def = BUILDING[type];
    if (!game.canPlace(type, x, z, rot)) return null;
    if (fromStorage) {
      if ((game.state.storage[type] ?? 0) <= 0) return null;
      game.state.storage[type]--;
      if (!game.state.storage[type]) delete game.state.storage[type];
    } else {
      const check = this.canBuy(type);
      if (!check.ok) return null;
      if (def.event) game.state.event!.tokens -= eventCostOf(def);
      else game.spend(game.priceOf(def));
    }
    const now = game.now();
    const b: PlacedBuilding = { uid: game.newUid(), type, x, z, rot, level: 1 };
    if (def.buildSec && !fromStorage) b.buildEnd = now + def.buildSec * 1000;
    if (type === 'plot') b.plot = null;
    if (def.tree) b.tree = { readyAt: (b.buildEnd ?? now) + TREE[def.tree].growSec * 1000 };
    if (def.animal) b.animals = [];
    if (def.cat === 'production') { b.queue = []; b.ready = []; }
    game.state.buildings.push(b);
    game.markBuilding(b, b.uid);
    if (!fromStorage) this.recordPlacedStats(def);
    this.updateGauges();
    game.bus.emit('building:placed', { b, isNew: !fromStorage });
    game.bus.emit('sfx', { name: 'build' });
    game.discover(type, 'building');
    return b;
  }

  private recordPlacedStats(def: BuildingDef): void {
    if (def.cat === 'decor') {
      if (def.path) game.incStat('paths_placed');
      else if (def.link || def.id === 'hedge') game.incStat('fences_placed');
      else game.incStat('decorations_placed');
    } else game.incStat('buildings_built');
    if (def.tree) game.incStat('trees_planted');
  }

  updateGauges(): void {
    game.setGauge('plots_owned', game.ownedCount('plot'));
    let animals = 0;
    for (const b of game.state.buildings) animals += b.animals?.length ?? 0;
    game.setGauge('animals_owned', animals);
    const charm = this.charm();
    game.setGauge('charm', charm);
    game.bus.emit('charm', { value: charm });
  }

  move(uid: number, x: number, z: number, rot: number): boolean {
    const b = game.byUid(uid);
    if (!b || !game.canPlace(b.type, x, z, rot, uid)) return false;
    game.markBuilding(b, 0);
    b.x = x; b.z = z; b.rot = rot;
    game.markBuilding(b, uid);
    game.bus.emit('building:moved', { b });
    return true;
  }

  store(uid: number): boolean {
    const b = game.byUid(uid);
    if (!b) return false;
    const def = BUILDING[b.type];
    if (!isStorable(def)) return false;
    if (b.plot) return false; // never lose a growing crop
    game.markBuilding(b, 0);
    game.state.buildings = game.state.buildings.filter((x) => x.uid !== uid);
    game.state.storage[b.type] = (game.state.storage[b.type] ?? 0) + 1;
    this.updateGauges();
    game.bus.emit('building:removed', { b, stored: true });
    return true;
  }

  /** Plain removal (e.g. paths), refunding nothing. */
  remove(uid: number): void {
    const b = game.byUid(uid);
    if (!b) return;
    game.markBuilding(b, 0);
    game.state.buildings = game.state.buildings.filter((x) => x.uid !== uid);
    this.updateGauges();
    game.bus.emit('building:removed', { b, stored: false });
  }

  // ------------------------------------------------------------ upgrades
  /** Max level for a building and the next upgrade's cost/time/requirement. */
  upgradeInfo(b: PlacedBuilding): { next: number; cost: number; sec: number; needLevel: number; label: string } | null {
    const def = BUILDING[b.type];
    if (b.type === 'farmhouse') {
      const lv = FARMHOUSE.levels[b.level];
      if (!lv) return null;
      return { next: b.level + 1, cost: lv.cost, sec: lv.sec, needLevel: lv.playerLevel, label: farmhouseGainsText(b.level) };
    }
    const kind = def.cat === 'production' ? UPGRADES.production : def.cat === 'animal' ? UPGRADES.animal : null;
    if (!kind) return null;
    const lv = kind.levels[b.level - 1];
    if (!lv) return null;
    const mult = def.upgradeMult ?? 1;
    return {
      next: b.level + 1, cost: Math.round(lv.cost * mult), sec: lv.sec, needLevel: def.level + b.level * 2,
      label: def.cat === 'production' ? '+1 production slot' : '+1 animal space',
    };
  }

  canUpgrade(b: PlacedBuilding): BuyCheck {
    const info = this.upgradeInfo(b);
    if (!info) return { ok: false, reason: 'Fully upgraded' };
    const now = game.now();
    if (!isBuilt(b, now) || isUpgrading(b, now)) return { ok: false, reason: 'Busy' };
    if (game.level < info.needLevel) return { ok: false, reason: `Needs level ${info.needLevel}` };
    if (game.coins < info.cost) return { ok: false, reason: 'Not enough coins' };
    return { ok: true };
  }

  upgrade(b: PlacedBuilding): boolean {
    const info = this.upgradeInfo(b);
    if (!info || !this.canUpgrade(b).ok) return false;
    game.spend(info.cost);
    b.upgradeEnd = game.now() + info.sec * 1000;
    if (info.sec === 0) this.completeUpgrade(b);
    game.bus.emit('building:changed', { b });
    game.bus.emit('sfx', { name: 'build2' });
    return true;
  }

  private completeUpgrade(b: PlacedBuilding): void {
    b.level++;
    delete b.upgradeEnd;
    game.incStat('upgrades_done');
    if (b.type === 'farmhouse') game.setGauge('farmhouse_level', b.level);
    game.bus.emit('building:changed', { b });
    game.bus.emit('building:complete', { b });
    game.bus.emit('toast', { title: `${BUILDING[b.type].name} upgraded!`, sub: `Now level ${b.level}`, icon: 'hammer' });
  }

  /** Finish construction or an upgrade immediately for gems. */
  speedup(b: PlacedBuilding): boolean {
    const now = game.now();
    const end = b.upgradeEnd && b.upgradeEnd > now ? b.upgradeEnd : b.buildEnd && b.buildEnd > now ? b.buildEnd : 0;
    if (!end) return false;
    const cost = speedupCost(end - now);
    if (!game.spend(0, cost)) return false;
    if (b.upgradeEnd && b.upgradeEnd > now) b.upgradeEnd = now;
    if (b.buildEnd && b.buildEnd > now) {
      // keep trees' growth relative to completion
      const shift = b.buildEnd - now;
      b.buildEnd = now;
      if (b.tree) b.tree.readyAt -= shift;
    }
    this.tick(now);
    game.bus.emit('building:changed', { b });
    return true;
  }

  /** Complete timers that ended. Called on the logic tick and on load (offline progress). */
  tick(now: number): void {
    for (const b of game.state.buildings) {
      if (b.buildEnd && b.buildEnd <= now) {
        delete b.buildEnd;
        game.bus.emit('building:complete', { b });
        game.bus.emit('building:changed', { b });
        game.bus.emit('toast', { title: `${BUILDING[b.type].name} is ready!`, icon: 'construction' });
      }
      if (b.upgradeEnd && b.upgradeEnd <= now) this.completeUpgrade(b);
      if (b.queue?.length) settleProduction(b, now);
    }
  }

  charm(): number {
    let c = 0;
    for (const b of game.state.buildings) if (isBuilt(b, game.now())) c += BUILDING[b.type].charm;
    return c;
  }

  /** Charm-derived bonuses (see economy.json -> charm). */
  bonuses(): { growth: number; orderCoins: number; villagers: number } {
    const ch = ECONOMY.charm;
    const steps = Math.floor(this.charm() / ch.step);
    return {
      growth: Math.min(ch.growthMax, steps * ch.growthPerStep),
      orderCoins: Math.min(ch.orderCoinsMax, steps * ch.orderCoinsPerStep),
      villagers: Math.min(ch.villagersMax, ch.villagersBase + Math.floor(this.charm() / ch.villagersPerCharm)),
    };
  }

  /** Animal capacity of a housing building. */
  capacity(b: PlacedBuilding): number { return UPGRADES.animal.baseCapacity + (b.level - 1); }
  /** Production queue slots. */
  slots(b: PlacedBuilding): number { return UPGRADES.production.baseSlots + (b.level - 1); }

  animalDef(b: PlacedBuilding) { return ANIMAL[BUILDING[b.type].animal!]; }

  center(b: PlacedBuilding): Vec {
    const def = BUILDING[b.type];
    const [w, d] = b.rot % 2 ? [def.size[1], def.size[0]] : def.size;
    return { x: b.x - 24 + w / 2, y: 1, z: b.z - 24 + d / 2 };
  }
}

export const buildings = new BuildingSystem();
