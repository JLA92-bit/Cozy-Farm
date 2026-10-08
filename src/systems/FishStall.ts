/**
 * 1.8.7 Marlow Pike's fish stall: the player BUYS fish here, at steep prices and in small daily stock. Prices are a
 * multiple of the barn price (fishstall.json), so fish can never be bought here and sold for profit. The stock is
 * chosen from the farm seed and the trading night, so it is the same on every device and refreshes each time he opens;
 * only what was bought today is saved. Marlow trades only in his hours (`isOpen`). Legendary and mythic fish are never for sale.
 */
import { FISH, FISHING, FISHSTALL, ITEMS } from '../data';
import { seasons } from './Seasons';
import { game } from './Game';
import { localDay } from './Progression';
import { roomDone } from './RestorationEffects';
import { hashString, rng } from '../world/Procedural';
import type { Vec } from './Game';

export interface FishOffer { id: string; price: number; stock: number; left: number; rarity: 'common' | 'uncommon' | 'rare' }

class FishStallSystem {
  /** The stall is open once the player can fish. */
  get open(): boolean { return game.level >= FISHING.level; }

  /** The trading "night" a time belongs to: the stock changes each time he opens, not at midnight. */
  private day(now = game.now()): string { return localDay(now - FISHSTALL.hours.open * 3600000); }

  /** Is Marlow trading right now (his hours are local time, in fishstall.json)? */
  isOpen(now = game.now()): boolean {
    const h = new Date(now).getHours(), { open, close } = FISHSTALL.hours;
    // a close before the open means the hours run past midnight (7 pm to 7 am)
    return open <= close ? h >= open && h < close : h >= open || h < close;
  }
  /** Milliseconds until he opens again (0 when open). */
  opensIn(now = game.now()): number {
    if (this.isOpen(now)) return 0;
    const d = new Date(now);
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), FISHSTALL.hours.open).getTime();
    return (t > now ? t : t + 86400000) - now;
  }
  /** Milliseconds until he closes (0 when closed). */
  closesIn(now = game.now()): number {
    if (!this.isOpen(now)) return 0;
    const d = new Date(now);
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), FISHSTALL.hours.close).getTime();
    return (t > now ? t : t + 86400000) - now;
  }
  /** "7 am" / "7 pm" for the opening hours. */
  hourText(h: number): string { return `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`; }
  get hoursText(): string { return `${this.hourText(FISHSTALL.hours.open)} to ${this.hourText(FISHSTALL.hours.close)}`; }

  private bought(): Record<string, number> {
    const s = game.state.fishstall;
    return s && s.day === this.day() ? s.bought : {};
  }

  /** Today's stock with what is left after the player's purchases. */
  offers(now = game.now()): FishOffer[] {
    const day = this.day(now);
    const r = rng(hashString(`${game.state.seed}:fishstall:${day}`));
    const pierOpen = roomDone('pier');
    const can = (f: (typeof FISHING.species)[number]) => f.level <= game.level && (f.spot !== 'pier' || pierOpen) && (!f.season || f.season === seasons.id);
    const pick = <T,>(list: T[], n: number): T[] => {
      const a = [...list];
      const out: T[] = [];
      while (a.length && out.length < n) out.push(a.splice(Math.floor(r() * a.length), 1)[0]);
      return out;
    };
    const mult = FISHSTALL.priceMult;
    const [lo, hi] = FISHSTALL.common.qty;
    const made: Omit<FishOffer, 'left'>[] = [];
    const add = (id: string, rarity: FishOffer['rarity'], stock: number) => made.push({ id, rarity, stock, price: Math.max(ITEMS[id].sell + 1, Math.round(ITEMS[id].sell * mult[rarity])) });
    for (const f of FISHING.species.filter((x) => x.rarity === 'common' && can(x))) add(f.id, 'common', lo + Math.floor(r() * (hi - lo + 1)));
    const [ulo, uhi] = FISHSTALL.uncommon.qty;
    for (const f of pick(FISHING.species.filter((x) => x.rarity === 'uncommon' && can(x)), FISHSTALL.uncommon.species)) add(f.id, 'uncommon', ulo + Math.floor(r() * (uhi - ulo + 1)));
    const rares = FISHING.species.filter((x) => x.rarity === 'rare' && can(x));
    if (rares.length && r() < FISHSTALL.rare.chance) add(pick(rares, 1)[0].id, 'rare', FISHSTALL.rare.qty);
    const got = this.bought();
    return made.map((o) => ({ ...o, left: Math.max(0, o.stock - (got[o.id] ?? 0)) }));
  }

  /** Buy one fish. Returns false when sold out, closed or the player cannot pay. */
  buy(id: string, at?: Vec): boolean {
    if (!this.open || !this.isOpen()) return false;
    const o = this.offers().find((x) => x.id === id);
    if (!o || o.left <= 0 || !game.spend(o.price)) return false;
    const day = this.day();
    const st = game.state.fishstall && game.state.fishstall.day === day ? game.state.fishstall : (game.state.fishstall = { day, bought: {} });
    st.bought[id] = (st.bought[id] ?? 0) + 1;
    game.addItem(id, 1, at);
    game.incStat('fishstall_buys');
    game.bus.emit('sfx', { name: 'purchase' });
    return true;
  }

  /** Marlow's name and shop for text. */
  get name(): string { return FISHSTALL.name; }
  get shop(): string { return FISHSTALL.shop; }
  isFish(id: string): boolean { return !!FISH[id]; }
}

export const fishstall = new FishStallSystem();
