/**
 * 1.9 The Wild Woods: a small island reached from the farm's south beach. Each day some forage spots hold a wild plant
 * for the season (spring greens and blossoms, summer berries, autumn mushrooms and nuts, winter roots and holly) and
 * a few dig spots hold a find (minerals, fossils, artifacts). What is where comes from the farm seed and the date, so it
 * is the same on every device; only what was taken today is saved (`state.woods`). Foraging and digging grow the
 * Foraging skill. Finds count towards the Museum and the Collection Book through `woods.found`.
 */
import { ITEMS, SEASONS, WOODS, type FindKind, type ForageKind } from '../data';
import { game, type Vec } from './Game';
import { saves } from './Save';
import { seasons } from './Seasons';
import { localDay } from './Progression';
import { rollQuality, type Quality } from './Quality';
import { extraDigs, keenEyesChance, luckyFinds } from './SkillEffects';
import { hints } from './Hints';
import { logEvent } from '../online/Events';
import { hashString, rng } from '../world/Procedural';
import type { WoodsState } from './State';

export interface ForageSpot { i: number; active: boolean; picked: boolean; item: string; kind: ForageKind }
export interface PickResult { item: string; n: number; quality: Quality }
export interface DigResult { item: string; kind: FindKind | 'clay'; first: boolean }

const pickWeighted = <T extends { w: number }>(list: T[], r: () => number): T => {
  let x = r() * list.reduce((a, b) => a + b.w, 0);
  for (const e of list) { x -= e.w; if (x <= 0) return e; }
  return list[list.length - 1];
};

class WoodsSystem {
  /** The woods record for today (a new day clears what was taken). */
  private st(): WoodsState {
    const day = localDay(game.now());
    const w = (game.state.woods ??= { day, picked: [], dug: [], found: {}, visited: false });
    if (w.day !== day) { w.day = day; w.picked = []; w.dug = []; }
    return w;
  }

  get unlocked(): boolean { return game.state.tutorial.done && game.level >= WOODS.level; }
  get visited(): boolean { return this.st().visited; }
  markVisited(): void { const w = this.st(); if (!w.visited) { w.visited = true; saves.save(); logEvent('woods_first'); } }

  /** Today's forage spots (which hold something, what, and which are already picked). */
  forage(): ForageSpot[] {
    const w = this.st(), s = seasons.id, list = WOODS.foragedBySeason[s];
    const out: ForageSpot[] = [];
    for (let i = 0; i < WOODS.forage.spots; i++) {
      const r = rng(hashString(`${game.state.seed}:forage:${w.day}:${i}`));
      const active = r() < WOODS.forage.chance;
      const e = pickWeighted(list, r);
      out.push({ i, active, picked: w.picked.includes(i), item: e.id, kind: e.kind });
    }
    return out;
  }

  digsLeft(): number { return Math.max(0, WOODS.dig.perDay + extraDigs() - this.st().dug.length); }
  dug(i: number): boolean { return this.st().dug.includes(i); }

  pick(i: number, at?: Vec): PickResult | null {
    if (!this.unlocked) return null;
    const spot = this.forage()[i];
    if (!spot || !spot.active || spot.picked) return null;
    const w = this.st();
    w.picked.push(i);
    const quality = rollQuality('forage', spot.item);
    const n = Math.random() < keenEyesChance() ? 2 : 1;
    game.addItem(spot.item, n, at, quality);
    this.noteFound(spot.item);
    game.incStat('forage_picked', n);
    logEvent('forage', { item: spot.item, q: quality });
    game.bus.emit('woods:changed', {});
    saves.save();
    return { item: spot.item, n, quality };
  }

  dig(i: number, at?: Vec): DigResult | null {
    if (!this.unlocked || i < 0 || i >= WOODS.dig.spots || this.dug(i) || this.digsLeft() <= 0) return null;
    const w = this.st();
    w.dug.push(i);
    const lucky = luckyFinds() ? WOODS.dig.luckyMult : 1;
    const t = WOODS.dig.table;
    const kinds: { id: FindKind | 'clay'; w: number }[] = [
      { id: 'mineral', w: t.mineral }, { id: 'fossil', w: t.fossil * lucky }, { id: 'artifact', w: t.artifact * lucky }, { id: 'clay', w: t.clay },
    ];
    const kind = pickWeighted(kinds, Math.random).id;
    const item = kind === 'clay' ? WOODS.clayItem : pickWeighted(WOODS.finds[kind], Math.random).id;
    game.addItem(item, 1, at);
    const first = this.noteFound(item);
    game.incStat('digs_done');
    logEvent('dig', { item });
    game.bus.emit('woods:changed', {});
    saves.save();
    return { item, kind, first };
  }

  /** Remember that an item was found here (the Museum and the Collection Book read this). True the first time. */
  private noteFound(item: string): boolean {
    const w = this.st();
    const first = !w.found[item];
    w.found[item] = (w.found[item] ?? 0) + 1;
    return first;
  }

  found(item: string): number { return game.state.woods?.found[item] ?? 0; }
  /** Every distinct item found in the woods so far. */
  foundIds(): string[] { return Object.keys(game.state.woods?.found ?? {}).filter((k) => ITEMS[k]); }

  /** Items of a family, for the Almanac and Collection Book. */
  forageIds(season?: keyof typeof WOODS.foragedBySeason): string[] {
    return (season ? WOODS.foragedBySeason[season] : Object.values(WOODS.foragedBySeason).flat()).map((e) => e.id);
  }
  findIds(kind: FindKind): string[] { return WOODS.finds[kind].map((e) => e.id); }

  /** One line for the farm-side sign: what is on offer today. */
  describe(): string {
    const spots = this.forage().filter((s) => s.active && !s.picked).length;
    return `${SEASONS.seasons[seasons.id].name} in the woods: ${spots} forage spots, ${this.digsLeft()} digs left today.`;
  }

  /** First time in the woods: one tip. */
  intro(): void { hints.firstTime('intro:woods'); }
}

export const woods = new WoodsSystem();
