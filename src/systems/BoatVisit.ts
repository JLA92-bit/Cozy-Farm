/**
 * 1.10 Boat Visitors: on two days a week (picked from the farm seed) a themed boat ties up at the dock from 10 am to
 * 5 pm. The visitor wants 3 kinds of goods from their theme that the farm can make now, and pays 1.9x the barn price
 * plus gems. The wish list is chosen from the seed and the day and cached in the save so it never changes mid-visit.
 * Cosy by design: nothing is lost by ignoring a boat, and it is the same on every device.
 */
import { BOATVISITS, ITEMS, type BoatTheme } from '../data';
import { game } from './Game';
import { lateXp } from './Endless';
import { localDay } from './Progression';
import { obtainableItems } from './Economy';
import { hashString, rng } from '../world/Procedural';
import type { Vec } from './Game';

/**
 * 1.20 What a boat visitor may ask for: what the farm can make now, plus anything it has caught, found or made before
 * (in the Collection Book), so fish dishes, woods crafts and rarer catches turn up on wish lists once you know them.
 */
function canSupply(): Set<string> {
  const out = new Set(obtainableItems());
  for (const k of Object.keys(game.state.collection ?? {})) {
    const id = k.startsWith('item:') ? k.slice(5) : '';
    if (ITEMS[id] && ITEMS[id].cat !== 'event' && ITEMS[id].cat !== 'feed') out.add(id);
  }
  return out;
}

class BoatVisitSystem {
  get open(): boolean { return game.level >= BOATVISITS.level; }

  /** Is today one of this week's boat days? */
  private isBoatDay(now: number): boolean {
    const d = new Date(now);
    const dow = (d.getDay() + 6) % 7; // Monday = 0
    const monday = localDay(now - dow * 86400000);
    const r = rng(hashString(`${game.state.seed}:boatweek:${monday}`));
    const days = [0, 1, 2, 3, 4, 5, 6];
    const chosen: number[] = [];
    for (let i = 0; i < BOATVISITS.daysPerWeek; i++) chosen.push(days.splice(Math.floor(r() * days.length), 1)[0]);
    return chosen.includes(dow);
  }
  /** Is the boat at the dock right now? */
  here(now = game.now()): boolean {
    if (!this.open || !this.isBoatDay(now)) return false;
    const h = new Date(now).getHours();
    return h >= BOATVISITS.hours[0] && h < BOATVISITS.hours[1];
  }
  closesIn(now = game.now()): number {
    if (!this.here(now)) return 0;
    const d = new Date(now);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), BOATVISITS.hours[1]).getTime() - now;
  }
  /** "10 am" style text for the hours. */
  get hoursText(): string { const t = (h: number) => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`; return `${t(BOATVISITS.hours[0])} to ${t(BOATVISITS.hours[1])}`; }

  /** Today's theme (picked from the seed and day). */
  theme(now = game.now()): BoatTheme {
    const day = localDay(now);
    const saved = game.state.boatvisit;
    if (saved && saved.day === day) { const t = BOATVISITS.themes.find((x) => x.id === saved.theme); if (t) return t; }
    const r = rng(hashString(`${game.state.seed}:boattheme:${day}`));
    // 1.20 only themes the farm can fill at least three wishes from (a young farm never meets the Craft Fair boat)
    const have = canSupply();
    const fit = BOATVISITS.themes.filter((t) => t.items.filter((i) => have.has(i)).length >= 3);
    const pool = fit.length ? fit : BOATVISITS.themes;
    return pool[Math.floor(r() * pool.length)];
  }

  /** Today's wish list, made once and saved. Empty when the farm can make nothing from the theme yet. */
  want(now = game.now()): Record<string, number> {
    const day = localDay(now);
    const saved = game.state.boatvisit;
    if (saved && saved.day === day) return saved.want;
    const theme = this.theme(now);
    const have = canSupply();
    const pool = theme.items.filter((i) => ITEMS[i] && have.has(i));
    const r = rng(hashString(`${game.state.seed}:boatwant:${day}`));
    const want: Record<string, number> = {};
    for (let n = 0; n < 3 && pool.length; n++) {
      const id = pool.splice(Math.floor(r() * pool.length), 1)[0];
      // cheap goods are asked for in bigger numbers, dear ones in ones and twos
      const base = Math.max(1, Math.min(6, Math.round(260 / Math.max(10, ITEMS[id].sell))));
      want[id] = Math.max(1, base - 1 + Math.floor(r() * 3));
    }
    game.state.boatvisit = { day, theme: theme.id, want, done: false };
    return want;
  }

  get done(): boolean { const s = game.state.boatvisit; return !!s && s.day === localDay(game.now()) && s.done; }
  /** What the visitor pays for the whole wish list. */
  reward(want = this.want()): { coins: number; gems: number } {
    let v = 0;
    for (const [id, n] of Object.entries(want)) v += ITEMS[id].sell * n;
    return { coins: Math.round(v * BOATVISITS.coinMult), gems: Object.keys(want).length ? BOATVISITS.gems : 0 };
  }
  canDeliver(): boolean { const w = this.want(); return this.here() && !this.done && Object.keys(w).length > 0 && game.has(w); }

  /** Hand over the goods. Returns false when away, done or short. */
  deliver(at?: Vec): boolean {
    if (!this.canDeliver()) return false;
    const w = this.want();
    if (!game.take(w)) return false;
    const r = this.reward(w);
    game.addCoins(r.coins, at);
    if (r.gems) game.addGems(r.gems, at);
    const xp = lateXp('boat');
    if (xp) game.addXp(xp, at);
    game.state.boatvisit!.done = true;
    game.incStat('boat_deliveries');
    game.bus.emit('sfx', { name: 'purchase' });
    return true;
  }
}

export const boatvisit = new BoatVisitSystem();
