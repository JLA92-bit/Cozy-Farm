/**
 * 1.9 The expedition board (Wild Woods, data/expeditions.json): send a villager out for 2, 6 or 12 hours and they come
 * back with finds. Each villager is better at some trips and a friend returns sooner. What comes back is fixed by
 * the farm seed and the trip's start time, so it cannot be rerolled by reloading. Two trips can run at once.
 */
import { manorExpeditionTimeMult } from './Manor';
import { EXPEDITIONS, VILLAGER, WOODS, type FindKind } from '../data';
import { game } from './Game';
import { saves } from './Save';
import { village } from './Village';
import { woods } from './Woods';
import { logEvent } from '../online/Events';
import { hashString, rng } from '../world/Procedural';

const HOUR = 3600000;
const FAR = (EXPEDITIONS as unknown as { far: { level: number; slots: number } }).far;
export interface Trip { who: string; trip: string; start: number; end: number }
export interface Loot { item: string; n: number }

class ExpeditionSystem {
  private list(): Trip[] { return (game.state.expeditions ??= { trips: [] }).trips; }

  get unlocked(): boolean { return game.state.tutorial.done && game.level >= EXPEDITIONS.level; }
  /** 1.41 the Far Reaches add a slot from their level. */
  slots(): number { return EXPEDITIONS.slots + (game.level >= FAR.level ? FAR.slots : 0); }
  /** Trips this farm can send (the far one from its level). */
  trips(): typeof EXPEDITIONS.trips { return EXPEDITIONS.trips.filter((t) => game.level >= ((t as { level?: number }).level ?? 0)); }
  active(): Trip[] { return this.list(); }
  freeSlots(): number { return Math.max(0, this.slots() - this.list().length); }
  isOut(who: string): boolean { return this.list().some((t) => t.who === who); }
  ready(t: Trip, now = game.now()): boolean { return now >= t.end; }
  readyCount(now = game.now()): number { return this.list().filter((t) => this.ready(t, now)).length; }

  /** How long a trip takes this villager: friends are quicker. */
  hours(who: string, tripId: string): number {
    const trip = EXPEDITIONS.trips.find((t) => t.id === tripId);
    if (!trip) return 0;
    const hearts = village.hearts(who);
    let mult = 1;
    for (const [need, m] of Object.entries(EXPEDITIONS.hearts)) if (hearts >= Number(need)) mult = Math.min(mult, m);
    return trip.hours * mult * manorExpeditionTimeMult();
  }

  send(who: string, tripId: string): boolean {
    const trip = this.trips().find((t) => t.id === tripId);
    if (!trip || !VILLAGER[who] || !this.unlocked || this.freeSlots() <= 0 || this.isOut(who)) return false;
    const start = game.now();
    this.list().push({ who, trip: tripId, start, end: start + Math.round(this.hours(who, tripId) * HOUR) });
    game.incStat('expeditions_sent');
    logEvent('expedition_send', { who, trip: tripId });
    game.bus.emit('state:changed', {});
    saves.save();
    return true;
  }

  /** Bring a finished trip home. Returns what was found. */
  collect(index: number): Loot[] | null {
    const list = this.list(), t = list[index];
    if (!t || !this.ready(t)) return null;
    const trip = EXPEDITIONS.trips.find((x) => x.id === t.trip)!;
    const r = rng(hashString(`${game.state.seed}:trip:${t.who}:${t.start}`));
    const fav = EXPEDITIONS.favour[t.who] ?? {};
    const kinds: (FindKind | 'forage')[] = ['mineral', 'fossil', 'artifact', 'forage'];
    const w = kinds.map((k) => ({ k, w: trip.weights[k] * (fav[k] ?? 1) }));
    const total = w.reduce((a, b) => a + b.w, 0);
    const got = new Map<string, number>();
    for (let i = 0; i < trip.items; i++) {
      let x = r() * total, kind: FindKind | 'forage' = 'mineral';
      for (const e of w) { x -= e.w; if (x <= 0) { kind = e.k; break; } }
      const table = kind === 'forage' ? WOODS.foraged.map((e) => ({ id: e.id, w: e.w })) : WOODS.finds[kind];
      let y = r() * table.reduce((a, b) => a + b.w, 0), item = table[table.length - 1].id;
      for (const e of table) { y -= e.w; if (y <= 0) { item = e.id; break; } }
      got.set(item, (got.get(item) ?? 0) + 1);
    }
    // 1.41 the far trip also brings back bars, varnish and star ore
    for (const [item, [lo, hi]] of Object.entries((trip as { extra?: Record<string, [number, number]> }).extra ?? {})) {
      const n = lo + Math.floor(r() * (hi - lo + 1));
      if (n > 0) got.set(item, (got.get(item) ?? 0) + n);
    }
    const loot: Loot[] = [];
    for (const [item, n] of got) { game.as('expedition').addItem(item, n); woods.noteFound(item); loot.push({ item, n }); }
    list.splice(index, 1);
    game.incStat('expeditions_done');
    village.addPoints(t.who, 2, 'expedition');
    logEvent('expedition_done', { who: t.who, trip: t.trip });
    game.bus.emit('state:changed', {});
    saves.save();
    return loot;
  }
}

export const expeditions = new ExpeditionSystem();
Object.assign(window as unknown as Record<string, unknown>, { __expeditions: expeditions });
