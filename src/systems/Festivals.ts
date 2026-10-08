/**
 * 1.9 Festival Days: the last day of every season (Sunday) is a festival with one short mini-game (festivals.json).
 * The player may play as often as they like that day; the best result counts and the prize (coins, gems, a
 * decoration and a ribbon) is paid once, when they collect it. The mini-games themselves live in
 * ui/panels/FestivalPanel.ts; this file keeps the rules, the stars and the prizes.
 */
import { FESTIVALS, BUILDING, ITEMS, SEASONS, type FestivalDef } from '../data';
import { game } from './Game';
import { saves } from './Save';
import { seasons } from './Seasons';
import { logEvent } from '../online/Events';

export interface FestivalNow { key: string; def: FestivalDef; season: string; year: number }

class FestivalSystem {
  private get st() { return (game.state.festivals ??= { best: {}, done: {}, seen: '' }); }

  /** Today's festival (null on every other day). */
  today(): FestivalNow | null {
    const s = seasons.now();
    if (!s.festival) return null;
    return { key: `${s.year}:${s.index}`, def: FESTIVALS.festivals[s.id], season: s.id, year: s.year };
  }

  stars(def: FestivalDef, score: number): 0 | 1 | 2 | 3 {
    return score >= def.stars[2] ? 3 : score >= def.stars[1] ? 2 : score >= def.stars[0] ? 1 : 0;
  }
  best(key: string): number { return this.st.best[key] ?? 0; }
  doneStars(key: string): number { return this.st.done[key] ?? 0; }
  collected(key: string): boolean { return this.st.done[key] !== undefined; }
  /** Ribbons won, over all years. */
  ribbons(): number { return Object.values(this.st.done).filter((n) => n > 0).length; }
  ribbonKeys(): string[] { return Object.keys(this.st.done).filter((k) => this.st.done[k] > 0); }
  /** Today's festival is on and not yet collected (a badge on the side button). */
  pending(): boolean {
    const t = this.today();
    return !!t && game.state.player.created && game.state.tutorial.done && !this.collected(t.key);
  }

  /** Record the stars of one finished try (best of the day counts). Returns the best so far. */
  record(stars: number): number {
    const t = this.today();
    if (!t) return 0;
    this.st.best[t.key] = Math.max(this.st.best[t.key] ?? 0, stars);
    (this.st.played ??= {})[t.key] = (this.st.played[t.key] ?? 0) + 1;
    game.incStat('festival_plays');
    logEvent('festival_play', { festival: t.def.id, stars });
    saves.save();
    return this.st.best[t.key];
  }

  /** Tries made at a festival (the Feast of Lights can only be shared once). */
  played(key: string): number { return this.st.played?.[key] ?? 0; }

  /** Pay the prize for the best result of one festival (once). Returns what was given, or null. */
  private payout(key: string): { stars: number; coins: number; gems: number; decor: string; item?: { id: string; n: number } } | null {
    if (this.collected(key)) return null;
    const stars = this.best(key);
    const sid = SEASONS.order[Number(key.split(':')[1])];
    const def = sid ? FESTIVALS.festivals[sid] : undefined;
    if (!def || stars < 1) return null;
    const p = FESTIVALS.prizes[stars - 1];
    const gems = (p.gems ?? 0) + (stars === 3 ? def.prize.gems ?? 0 : 0);
    game.addCoins(p.coins);
    if (gems) game.addGems(gems);
    const decor = def.prize.decor;
    const st = game.state.storage;
    if (stars >= 2 && BUILDING[decor]) st[decor] = (st[decor] ?? 0) + 1;
    const item = stars === 3 ? def.prize.item : undefined;
    if (item && ITEMS[item.id]) game.addItem(item.id, item.n);
    this.st.done[key] = stars;
    game.incStat('festival_ribbons');
    game.discover(sid, 'ribbon');
    logEvent('festival_collect', { festival: def.id, stars });
    game.bus.emit('sfx', { name: 'reward' });
    saves.save();
    return { stars, coins: p.coins, gems, decor: stars >= 2 && BUILDING[decor] ? decor : '', item };
  }

  /** Collect today's prize. */
  collect(): { stars: number; coins: number; gems: number; decor: string; item?: { id: string; n: number } } | null {
    const t = this.today();
    return t ? this.payout(t.key) : null;
  }

  /** A prize earned on an earlier festival day that was never collected (the day ended first) is paid out now. */
  settleOld(): void {
    const today = this.today()?.key;
    for (const key of Object.keys(this.st.best)) {
      if (key === today || this.collected(key) || this.best(key) < 1) continue;
      const r = this.payout(key);
      if (r) game.bus.emit('toast', { title: 'Your festival prize arrived', sub: `${r.coins} coins${r.gems ? ` and ${r.gems} gems` : ''}${r.decor ? `, and a ${BUILDING[r.decor].name} in your storage` : ''}`, icon: 'ribbon' });
    }
  }

  /** Once on each festival morning: a toast pointing at the side button. */
  announce(): void {
    if (game.state.player.created && game.state.tutorial.done) this.settleOld();
    const t = this.today();
    if (!t || !game.state.player.created || !game.state.tutorial.done) return;
    if (this.st.seen === t.key) return;
    this.st.seen = t.key;
    game.bus.emit('toast', { title: `${t.def.name} today!`, sub: 'The village is celebrating. Tap the Festival button to join in.', icon: t.def.icon });
    saves.save();
  }
}

export const festivals = new FestivalSystem();
