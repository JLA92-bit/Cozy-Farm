import { ANIMAL, ANIMAL_COST_GROWTH, BUILDING, ITEMS } from '../data';
import { buildings } from './Buildings';
import { game, type Vec } from './Game';
import type { PlacedBuilding } from './State';
import { animalState, isBuilt } from './Timers';
import { addRolled } from './Quality';
import { claimShepherdBonus, happyHerdChance } from './SkillEffects';

export class AnimalSystem {
  owned(animal: string): number {
    let n = 0;
    for (const b of game.state.buildings) if (BUILDING[b.type].animal === animal) n += b.animals?.length ?? 0;
    return n;
  }

  price(animal: string): number {
    const def = ANIMAL[animal];
    return Math.round(def.cost * (1 + ANIMAL_COST_GROWTH * this.owned(animal)) / 5) * 5;
  }

  homeWithSpace(animal: string): PlacedBuilding | null {
    const def = ANIMAL[animal];
    return game.buildingsOf(def.house).find((b) => isBuilt(b, game.now()) && (b.animals?.length ?? 0) < buildings.capacity(b)) ?? null;
  }

  buy(animal: string, home?: PlacedBuilding): { ok: boolean; reason?: string; home?: PlacedBuilding } {
    const def = ANIMAL[animal];
    if (game.level < def.level) return { ok: false, reason: `Unlocks at level ${def.level}` };
    const b = home ?? this.homeWithSpace(animal);
    if (!b) {
      const any = game.buildingsOf(def.house).length;
      return { ok: false, reason: any ? 'No space: upgrade or build another home' : `Build a ${BUILDING[def.house].name} first` };
    }
    const cost = this.price(animal);
    if (!game.spend(cost)) return { ok: false, reason: 'Not enough coins' };
    (b.animals ??= []).push({ fedAt: null });
    game.discover(animal, 'animal');
    buildings.updateGauges();
    game.bus.emit('animal:bought', { b, animal });
    game.bus.emit('building:changed', { b });
    game.bus.emit('sfx', { name: def.sound });
    return { ok: true, home: b };
  }

  counts(b: PlacedBuilding): { hungry: number; producing: number; ready: number } {
    const now = game.now();
    const out = { hungry: 0, producing: 0, ready: 0 };
    (b.animals ?? []).forEach((_, i) => { out[animalState(b, i, now)]++; });
    return out;
  }

  /** Feed every hungry animal in a home that we have feed for. Returns how many were fed. */
  feedAll(b: PlacedBuilding): number {
    const def = ANIMAL[BUILDING[b.type].animal!];
    const now = game.now();
    let fed = 0;
    (b.animals ?? []).forEach((a, i) => {
      if (animalState(b, i, now) !== 'hungry' || game.count(def.feed) <= 0) return;
      game.addItem(def.feed, -1);
      a.fedAt = now;
      fed++;
      game.incStat('animals_fed');
      game.bus.emit('animal:fed', { b, index: i });
    });
    if (fed) {
      game.bus.emit('building:changed', { b });
      game.bus.emit('sfx', { name: def.sound });
    }
    return fed;
  }

  /** Collect every ready product. */
  collectAll(b: PlacedBuilding, at?: Vec): number {
    const def = ANIMAL[BUILDING[b.type].animal!];
    const now = game.now();
    let n = 0;
    (b.animals ?? []).forEach((a, i) => {
      if (animalState(b, i, now) !== 'ready') return;
      // Happy Herd: sometimes the animal carries on without needing new feed
      a.fedAt = Math.random() < happyHerdChance() ? now : null;
      n++;
      game.bus.emit('animal:collected', { b, index: i, item: def.product });
    });
    if (n) {
      // Shepherd: once a day, one bonus product
      const bonus = claimShepherdBonus() ? 1 : 0;
      if (bonus) game.bus.emit('toast', { title: 'Shepherd', sub: `A bonus ${ITEMS[def.product]?.name ?? 'product'}`, icon: 'sheep' });
      addRolled('animal', def.product, n + bonus, at);
      game.addXp(def.xp * n, at);
      game.incStat('animal_products', n);
      game.incStat(`collect_${def.product}`, n);
      game.bus.emit('building:changed', { b });
      game.bus.emit('sfx', { name: 'collect' });
    }
    return n;
  }

  pet(b: PlacedBuilding): void {
    game.incStat('animal_pets');
    game.bus.emit('sfx', { name: ANIMAL[BUILDING[b.type].animal!].sound });
  }
}

export const animals = new AnimalSystem();
