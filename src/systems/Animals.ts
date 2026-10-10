import { ANIMAL, ANIMAL_COST_GROWTH, BUILDING, ITEMS } from '../data';
import { buildings } from './Buildings';
import { game, type Vec } from './Game';
import type { PlacedBuilding } from './State';
import { animalState, isBuilt } from './Timers';
import { addRolled } from './Quality';
import { claimShepherdBonus, happyHerdChance } from './SkillEffects';
import { qualityBoosts } from './Quality';
import { localDay } from './Progression';
import { saves } from './Save';
import { hashString } from '../world/Procedural';

/** 1.10 animal friendship: friendly names, hearts from a daily pat (3 love points a heart, 5 hearts at most) and better quality when collecting from happy animals. */
const NAMES = ['Clover', 'Biscuit', 'Daisy', 'Mochi', 'Pepper', 'Maple', 'Pumpkin', 'Honey', 'Button', 'Poppy', 'Waffles', 'Nutmeg', 'Peanut', 'Sprout', 'Marshmallow', 'Ginger', 'Truffle', 'Cocoa', 'Bean', 'Pudding', 'Olive', 'Fudge', 'Sunny', 'Thistle', 'Bramble', 'Cricket', 'Dumpling', 'Juniper', 'Pebble', 'Tulip'];
export const LOVE_PER_HEART = 3;
export const MAX_ANIMAL_HEARTS = 5;
let collectLove = 0;
qualityBoosts.push((source) => (source === 'animal' && collectLove > 0 ? { silver: 0.15 * collectLove, gold: 0.05 * collectLove } : null));

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
    const list = (b.animals ??= []);
    list.push({ fedAt: null, name: NAMES[hashString(`${game.state.seed}:${b.uid}:${list.length}:${game.stat('animals_bought')}`) % NAMES.length] });
    game.incStat('animals_bought');
    game.discover(animal, 'animal');
    buildings.updateGauges();
    game.bus.emit('animal:bought', { b, animal });
    game.bus.emit('building:changed', { b });
    game.bus.emit('sfx', { name: def.sound });
    return { ok: true, home: b };
  }

  /** The animal's name (older animals are named the first time anyone asks). */
  nameOf(b: PlacedBuilding, i: number): string {
    const a = b.animals?.[i];
    if (!a) return '';
    if (!a.name) { a.name = NAMES[hashString(`${game.state.seed}:${b.uid}:${i}`) % NAMES.length]; saves.save(); }
    return a.name;
  }
  hearts(b: PlacedBuilding, i: number): number { return Math.min(MAX_ANIMAL_HEARTS, Math.floor((b.animals?.[i]?.love ?? 0) / LOVE_PER_HEART)); }
  canPat(b: PlacedBuilding, i: number): boolean { const a = b.animals?.[i]; return !!a && a.petDay !== localDay(game.now()); }
  /** A pat on one animal: one love point a day. Returns the new heart count, or -1 if already patted today. */
  patOne(b: PlacedBuilding, i: number): number {
    const a = b.animals?.[i];
    if (!a || !this.canPat(b, i)) return -1;
    const before = this.hearts(b, i);
    a.petDay = localDay(game.now());
    a.love = Math.min(LOVE_PER_HEART * MAX_ANIMAL_HEARTS, (a.love ?? 0) + 1);
    game.incStat('animal_pats');
    game.bus.emit('sfx', { name: ANIMAL[BUILDING[b.type].animal!].sound });
    if (this.hearts(b, i) > before) game.bus.emit('toast', { title: `${this.nameOf(b, i)} loves you more!`, sub: `${this.hearts(b, i)} of ${MAX_ANIMAL_HEARTS} hearts: better quality products`, icon: 'heart' });
    game.bus.emit('building:changed', { b });
    saves.save();
    return this.hearts(b, i);
  }

  counts(b: PlacedBuilding): { hungry: number; producing: number; ready: number } {
    const now = game.now();
    const out = { hungry: 0, producing: 0, ready: 0 };
    (b.animals ?? []).forEach((_, i) => { out[animalState(b, i, now)]++; });
    return out;
  }

  /** Feed every hungry animal in a home that we have feed for. Returns how many were fed. */
  feedAll(b: PlacedBuilding, max = Infinity): number {
    const def = ANIMAL[BUILDING[b.type].animal!];
    const now = game.now();
    let fed = 0;
    (b.animals ?? []).forEach((a, i) => {
      if (fed >= max || animalState(b, i, now) !== 'hungry' || game.count(def.feed) <= 0) return;
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
    let n = 0, loveSum = 0;
    (b.animals ?? []).forEach((a, i) => {
      if (animalState(b, i, now) !== 'ready') return;
      loveSum += this.hearts(b, i) / MAX_ANIMAL_HEARTS;
      // Happy Herd: sometimes the animal carries on without needing new feed
      a.fedAt = Math.random() < happyHerdChance() ? now : null;
      n++;
      game.bus.emit('animal:collected', { b, index: i, item: def.product });
    });
    if (n) {
      // Shepherd: once a day, one bonus product
      const bonus = claimShepherdBonus() ? 1 : 0;
      if (bonus) game.bus.emit('toast', { title: 'Shepherd', sub: `A bonus ${ITEMS[def.product]?.name ?? 'product'}`, icon: 'sheep' });
      collectLove = loveSum / n;
      try { addRolled('animal', def.product, n + bonus, at); } finally { collectLove = 0; }
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
