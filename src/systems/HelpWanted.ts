/**
 * 1.9 Help Wanted: a board of three villager requests each day ("bring me 3 blueberries", "a gold-star cake"). What is
 * asked for comes from the farm seed and the date, so it is the same on every device; only which ones were done today
 * is saved. A request pays coins, friendship with whoever asked and now and then a gem. Items must be things the
 * player can really get now (in-season crops, goods they can make, forage once they have been to the woods).
 */
import { ITEMS, ITEM_LEVEL, VILLAGER, VILLAGERS, WOODS } from '../data';
import { game } from './Game';
import { saves } from './Save';
import { seasons } from './Seasons';
import { obtainableItems } from './Economy';
import { localDay } from './Progression';
import { village } from './Village';
import { woods } from './Woods';
import { logEvent } from '../online/Events';
import { hashString, rng } from '../world/Procedural';

export interface HelpRequest { i: number; who: string; item: string; n: number; star: 0 | 2; coins: number; points: number; gems: number; done: boolean }

const PER_DAY = 3;

class HelpWantedSystem {
  private st() {
    const day = localDay(game.now());
    const s = (game.state.helpwanted ??= { day, done: [] });
    if (s.day !== day) { s.day = day; s.done = []; s.reqs = undefined; }
    return s;
  }

  get unlocked(): boolean { return game.state.tutorial.done && game.level >= 6; }

  requests(): HelpRequest[] {
    const st = this.st();
    // fixed for the day once made, so what you can currently obtain cannot change a request half way through
    if (st.reqs?.length === PER_DAY) return st.reqs.map((r, i) => ({ ...r, i, done: st.done.includes(i) }));
    const pool = [...obtainableItems(), ...(woods.visited ? WOODS.foragedBySeason[seasons.id].map((e) => e.id) : [])].filter((i) => ITEMS[i]);
    if (!pool.length) return [];
    const out: HelpRequest[] = [];
    const used = new Set<string>();
    for (let i = 0; i < PER_DAY; i++) {
      const r = rng(hashString(`${game.state.seed}:help:${st.day}:${i}`));
      const who = VILLAGERS[Math.floor(r() * VILLAGERS.length)].id;
      const v = VILLAGER[who];
      const w = pool.map((it) => (used.has(it) ? 0.1 : 1) * (v.loves.includes(it) ? 4 : v.likes.includes(it) ? 2.5 : 1) * (1 + Math.min(2, (ITEM_LEVEL[it] ?? 1) / Math.max(1, game.level))));
      let x = r() * w.reduce((a, b) => a + b, 0), item = pool[0];
      for (let k = 0; k < pool.length; k++) { x -= w[k]; if (x <= 0) { item = pool[k]; break; } }
      used.add(item);
      const sell = ITEMS[item].sell;
      const star: 0 | 2 = r() < 0.17 ? 2 : 0;
      const n = star ? 1 : sell > 150 ? 1 + Math.floor(r() * 2) : sell > 60 ? 2 + Math.floor(r() * 2) : 3 + Math.floor(r() * 3);
      const coins = Math.round(sell * n * (star ? 3.2 : 1.6));
      out.push({ i, who, item, n, star, coins, points: star ? 20 : 12, gems: star ? 1 : r() < 0.2 ? 1 : 0, done: st.done.includes(i) });
    }
    st.reqs = out.map(({ who, item, n, star, coins, points, gems }) => ({ who, item, n, star, coins, points, gems }));
    return out;
  }

  have(req: HelpRequest): number { return req.star ? game.qualityCounts(req.item)[2] : game.count(req.item); }
  canFill(req: HelpRequest): boolean { return !req.done && this.have(req) >= req.n; }
  /** Requests you could fill right now (the dot on the Village page). */
  fillable(): number { return this.unlocked ? this.requests().filter((r) => this.canFill(r)).length : 0; }
  remaining(): number { return this.unlocked ? this.requests().filter((r) => !r.done).length : 0; }

  fill(i: number): HelpRequest | null {
    const req = this.requests()[i];
    if (!req || !this.canFill(req)) return null;
    if (req.star) game.removeQuality(req.item, 2, req.n); else game.addItem(req.item, -req.n);
    game.addCoins(req.coins);
    if (req.gems) game.addGems(req.gems);
    village.addPoints(req.who, req.points, 'helpwanted');
    this.st().done.push(i);
    game.incStat('help_wanted_done');
    logEvent('help_wanted', { who: req.who, item: req.item, star: req.star });
    game.bus.emit('state:changed', {});
    saves.save();
    return req;
  }
}

export const helpWanted = new HelpWantedSystem();
