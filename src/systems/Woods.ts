/**
 * 1.9 The Wild Woods: a small island reached from the farm's south beach. Each day some forage spots hold a wild plant
 * (greens, flowers, berries, mushrooms, nuts and roots) and
 * a few dig spots hold a find (minerals, fossils, artifacts). What is where comes from the farm seed and the date, so it
 * is the same on every device; only what was taken today is saved (`state.woods`). Foraging and digging grow the
 * Foraging skill. Finds count towards the Museum and the Collection Book through `woods.found`.
 */
import { ITEMS, WOODS, WOODS_REGIONS, type FindKind, type ForageKind, type WoodsRegion } from '../data';
import { roomDone } from './RestorationEffects';
import { game, type Vec } from './Game';
import { saves } from './Save';
import { localDay } from './Progression';
import { rollQuality, type Quality } from './Quality';
import { extraDigs, keenEyesChance, luckyFinds } from './SkillEffects';
import { manorDigs, manorForageFull } from './Manor';
import { hints } from './Hints';
import { logEvent } from '../online/Events';
import { hashString, rng } from '../world/Procedural';
import type { WoodsState } from './State';

export interface ForageSpot { i: number; active: boolean; picked: boolean; item: string; kind: ForageKind }
export interface PickResult { item: string; n: number; quality: Quality }
export interface DigResult { item: string; kind: FindKind | 'clay'; first: boolean }
/** 1.19 a firefly over Mossy Hollow (night only) and a tap on a Whispering Pines tree. */
export interface Firefly { id: number; i: number; caught: boolean }
export interface Tap { id: string; i: number; readyAt: number; ready: boolean }

/** Spot ids: the glade's spots are 0..; region k (1-based, woods.json order) uses REGION_IDS * k + i, its fireflies + FIREFLY_OFF. */
export const REGION_IDS = 1000;
const FIREFLY_OFF = 500;
const HOUR = 3600000;

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
    if (w.day !== day) { w.day = day; w.picked = []; w.dug = []; w.panned = 0; }
    return w;
  }

  get unlocked(): boolean { return game.state.tutorial.done && game.level >= WOODS.level; }
  get visited(): boolean { return this.st().visited; }
  markVisited(): void { const w = this.st(); if (!w.visited) { w.visited = true; saves.save(); logEvent('woods_first'); } }

  // ------------------------------------------------------------------- 1.19 regions
  regions(): WoodsRegion[] { return WOODS_REGIONS; }
  region(id: string): WoodsRegion | undefined { return WOODS_REGIONS.find((r) => r.id === id); }
  /** A region can be visited once the woods are open and its trail is restored. */
  regionOpen(id: string): boolean { const r = this.region(id); return !!r && this.unlocked && roomDone(r.trail); }
  regionIndex(id: string): number { return WOODS_REGIONS.findIndex((r) => r.id === id) + 1; }

  /** Today's forage spots in a region (ids REGION_IDS * k + i), whether or not it is open yet. */
  regionForage(id: string): ForageSpot[] {
    const reg = this.region(id);
    if (!reg) return [];
    return this.spotsFor(reg.foraged, reg.forage.spots, reg.forage.chance, REGION_IDS * this.regionIndex(id), `forage:${id}`);
  }
  /** Every forage spot that can be picked: the glade's and those of the open regions. */
  allForage(): ForageSpot[] {
    const out = this.forage();
    for (const r of WOODS_REGIONS) if (this.regionOpen(r.id)) out.push(...this.regionForage(r.id));
    return out;
  }

  /** Night over Mossy Hollow: the region's firefly hours (local time). */
  isFireflyTime(id = 'hollow'): boolean {
    const f = this.region(id)?.fireflies;
    if (!f) return false;
    const h = new Date(game.now()).getHours();
    return f.from > f.to ? h >= f.from || h < f.to : h >= f.from && h < f.to;
  }
  fireflies(id = 'hollow'): Firefly[] {
    const reg = this.region(id), w = this.st();
    if (!reg?.fireflies) return [];
    const base = REGION_IDS * this.regionIndex(id) + FIREFLY_OFF;
    return Array.from({ length: reg.fireflies.count }, (_, i) => ({ id: base + i, i, caught: w.picked.includes(base + i) }));
  }
  /** Catch a firefly in a jar (night only, each once a day). */
  catchFirefly(id: number, at?: Vec): string | null {
    const reg = WOODS_REGIONS.find((r) => r.fireflies && this.fireflies(r.id).some((f) => f.id === id));
    if (!reg?.fireflies || !this.regionOpen(reg.id) || !this.isFireflyTime(reg.id)) return null;
    const w = this.st();
    if (w.picked.includes(id)) return null;
    w.picked.push(id);
    game.addItem(reg.fireflies.item, 1, at);
    this.noteFound(reg.fireflies.item);
    game.incStat('fireflies_caught');
    game.bus.emit('woods:changed', {});
    saves.save();
    return reg.fireflies.item;
  }

  /** Pans left today at Crystal Creek. */
  pansLeft(id = 'creek'): number { const p = this.region(id)?.pan; return p ? Math.max(0, p.perDay - (this.st().panned ?? 0)) : 0; }
  /** Swirl the pan: one find from the creek's table. */
  pan(id = 'creek', at?: Vec): { item: string; first: boolean } | null {
    const reg = this.region(id);
    if (!reg?.pan || !this.regionOpen(id) || this.pansLeft(id) <= 0) return null;
    const w = this.st();
    w.panned = (w.panned ?? 0) + 1;
    const item = pickWeighted(reg.pan.table, Math.random).id;
    game.addItem(item, 1, at);
    const first = this.noteFound(item);
    game.incStat('pans_done');
    logEvent('pan', { item });
    game.bus.emit('woods:changed', {});
    saves.save();
    return { item, first };
  }

  /** The taps on a region's trees: full again `hours` after they were last emptied (a tap never emptied is full). */
  taps(id = 'pines'): Tap[] {
    const reg = this.region(id);
    if (!reg?.taps) return [];
    const st = game.state.woods?.taps ?? {}, now = game.now();
    return Array.from({ length: reg.taps.count }, (_, i) => {
      const key = `${id}:${i}`, last = st[key];
      const readyAt = last === undefined ? 0 : last + reg.taps!.hours * HOUR;
      return { id: key, i, readyAt, ready: readyAt <= now };
    });
  }
  /** Empty a full tap: a little maple sap or pine resin, and it starts filling again. */
  collectTap(key: string, at?: Vec): { item: string; n: number } | null {
    const [id] = key.split(':');
    const reg = this.region(id), tap = this.taps(id).find((t) => t.id === key);
    if (!reg?.taps || !tap || !tap.ready || !this.regionOpen(id)) return null;
    const w = this.st();
    (w.taps ??= {})[key] = game.now();
    const item = pickWeighted(reg.taps.items, Math.random).id;
    game.addItem(item, reg.taps.yield, at);
    this.noteFound(item);
    game.incStat('sap_collected', reg.taps.yield);
    game.bus.emit('woods:changed', {});
    saves.save();
    return { item, n: reg.taps.yield };
  }

  /** Today's forage spots (which hold something, what, and which are already picked). */
  forage(): ForageSpot[] {
    return this.spotsFor(WOODS.foraged, WOODS.forage.spots, WOODS.forage.chance, 0, 'forage');
  }

  private spotsFor(list: { id: string; kind: ForageKind; w: number }[], count: number, chance: number, base: number, key: string): ForageSpot[] {
    const w = this.st();
    const out: ForageSpot[] = [];
    for (let k = 0; k < count; k++) {
      const i = base + k;
      const r = rng(hashString(`${game.state.seed}:${key}:${w.day}:${k}`));
      const roll = r();
      const active = manorForageFull() || roll < chance;
      const e = pickWeighted(list, r);
      out.push({ i, active, picked: w.picked.includes(i), item: e.id, kind: e.kind });
    }
    return out;
  }

  digsLeft(): number { return Math.max(0, WOODS.dig.perDay + extraDigs() + manorDigs() - this.st().dug.length); }
  dug(i: number): boolean { return this.st().dug.includes(i); }

  pick(i: number, at?: Vec): PickResult | null {
    if (!this.unlocked) return null;
    const spot = this.allForage().find((s) => s.i === i);
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
  noteFound(item: string): boolean {
    const w = this.st();
    const first = !w.found[item];
    w.found[item] = (w.found[item] ?? 0) + 1;
    return first;
  }

  found(item: string): number { return game.state.woods?.found[item] ?? 0; }
  /** Every distinct item found in the woods so far. */
  foundIds(): string[] { return Object.keys(game.state.woods?.found ?? {}).filter((k) => ITEMS[k]); }

  /** Items of a family, for the Almanac and Collection Book. */
  forageIds(): string[] { return WOODS.foraged.map((e) => e.id); }
  findIds(kind: FindKind): string[] { return WOODS.finds[kind].map((e) => e.id); }

  /** One line for the farm-side sign: what is on offer today. */
  describe(): string {
    const spots = this.allForage().filter((s) => s.active && !s.picked).length;
    return `${spots} forage spots and ${this.digsLeft()} digs left today.`;
  }

  /** First time in the woods: one tip. */
  intro(): void { hints.firstTime('intro:woods'); }
}

export const woods = new WoodsSystem();
