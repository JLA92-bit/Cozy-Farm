/**
 * 1.14 Master Challenges: from level 50, a weekly board of 3 challenges (picked from master.json with the farm seed, same
 * UTC week as the weekly leaderboard). Each counts what you do that week by watching the game's own stats; claim a
 * finished challenge for coins and gems, finish all 3 for a bonus, an epic crate and a week on your streak. Streak
 * milestones hand out a big number decoration (streak_4, 12, 26, 52). Nothing is lost by skipping a week except the streak.
 */
import { BUILDING, ITEMS, MASTER } from '../data';
import { game } from './Game';
import { hashString, rng } from '../world/Procedural';
import { weekKey } from '../online/Weekly';
import { logEvent } from '../online/Events';
import { lateXp } from './Endless';

const WEEK_MS = 7 * 86400000;
export interface MasterChallenge { id: string; text: string; icon: string; stat: string; target: number; progress: number; claimed: boolean; done: boolean }

class MasterSystem {
  get open(): boolean { return game.level >= MASTER.level; }
  get streak(): number { return game.state.master?.streak ?? 0; }
  get best(): number { return game.state.master?.best ?? 0; }

  /** Milliseconds until the next Monday 00:00 UTC (new challenges). */
  weekLeftMs(now = Date.now()): number { return Date.parse(`${weekKey(now)}T00:00:00Z`) + WEEK_MS - now; }

  /** Make sure the saved board is this week's: new picks and a fresh baseline each Monday. */
  private ensure(): NonNullable<typeof game.state.master> {
    const wk = weekKey(Date.now());
    let st = game.state.master;
    if (st && st.week === wk) return st;
    const prevWeek = st ? new Date(Date.parse(`${st.week}T00:00:00Z`) + WEEK_MS).toISOString().slice(0, 10) : '';
    // a streak only survives when last week was finished in full
    const keep = !!st && st.done && prevWeek === wk;
    const streak = keep ? st!.streak : 0;
    const r = rng(hashString(`${game.state.seed}:master:${wk}`));
    const pool = [...MASTER.challenges];
    const ids: string[] = [];
    while (ids.length < 3 && pool.length) ids.push(pool.splice(Math.floor(r() * pool.length), 1)[0].id);
    const base: Record<string, number> = {};
    for (const c of MASTER.challenges) base[c.stat] = game.stat(c.stat);
    st = game.state.master = { week: wk, base, ids, claimed: [], streak, best: Math.max(st?.best ?? 0, streak), done: false };
    return st;
  }

  /** Target for a challenge at the player's level (a little more each level past 50), rounded to a friendly number. */
  target(base: number): number {
    const raw = base * (1 + Math.max(0, game.level - MASTER.level) * MASTER.targetPerLevel);
    const step = base >= 100 ? 10 : base >= 25 ? 5 : 1;
    return Math.max(step, Math.round(raw / step) * step);
  }

  list(): MasterChallenge[] {
    const st = this.ensure();
    return st.ids.flatMap((id) => {
      // a challenge removed from master.json since the board was made is simply left out
      const c = MASTER.challenges.find((x) => x.id === id);
      if (!c) return [];
      // a stat the board has no starting point for (e.g. a challenge changed mid-week) counts from now
      if (st.base[c.stat] === undefined) st.base[c.stat] = game.stat(c.stat);
      const target = this.target(c.base);
      const progress = Math.max(0, Math.min(target, game.stat(c.stat) - (st.base[c.stat] ?? 0)));
      return [{ id, text: c.text.split('{n}').join(String(target)), icon: c.icon, stat: c.stat, target, progress, claimed: st.claimed.includes(id), done: progress >= target }];
    });
  }

  /** Something is ready to claim (for the side-bar badge). */
  get claimable(): boolean { return this.open && this.list().some((c) => c.done && !c.claimed); }
  get allClaimed(): boolean { const st = game.state.master; return !!st && st.week === weekKey(Date.now()) && st.done; }

  rewardText(): { coins: number; gems: number; xp: number } { return { coins: MASTER.reward.coinsBase + MASTER.reward.coinsPerLevel * game.level, gems: MASTER.reward.gems, xp: lateXp('master') }; }

  claim(id: string): boolean {
    const c = this.list().find((x) => x.id === id);
    if (!c || !c.done || c.claimed) return false;
    const st = this.ensure();
    st.claimed.push(id);
    const r = this.rewardText();
    game.addCoins(r.coins);
    game.addGems(r.gems);
    if (r.xp) game.addXp(r.xp);
    game.incStat('master_challenges');
    game.bus.emit('sfx', { name: 'purchase' });
    if (this.list().every((x) => x.claimed) && !st.done) this.finishWeek(st);
    return true;
  }

  private finishWeek(st: NonNullable<typeof game.state.master>): void {
    st.done = true;
    st.streak += 1;
    st.best = Math.max(st.best, st.streak);
    game.addGems(MASTER.allBonus.gems);
    const weekXp = lateXp('masterWeek');
    if (weekXp) game.addXp(weekXp);
    game.state.crates.push(MASTER.allBonus.crate);
    game.bus.emit('crate:granted', { rarity: MASTER.allBonus.crate });
    game.incStat('master_weeks');
    let sub = `+${MASTER.allBonus.gems} gems${weekXp ? `, ${weekXp.toLocaleString('en-US')} XP` : ''} and an ${MASTER.allBonus.crate} crate. Streak: ${st.streak} week${st.streak === 1 ? '' : 's'}.`;
    const ms = MASTER.streaks.find((s) => s.weeks === st.streak);
    if (ms && BUILDING[ms.id]) {
      game.state.storage[ms.id] = (game.state.storage[ms.id] ?? 0) + 1;
      game.discover(ms.id, 'building');
      sub += ` A ${BUILDING[ms.id].name} is waiting in your storage!`;
    }
    logEvent('master_week', { streak: st.streak, level: game.level });
    game.bus.emit('toast', { title: 'Master week complete!', sub, icon: 'crown' });
  }
}

export const master = new MasterSystem();

// ======================================================================== gem boutique
class BoutiqueSystem {
  get open(): boolean { return game.level >= MASTER.level; }
  owned(id: string): boolean { return !!game.state.boutique?.owned.includes(id); }

  /** This week's offers: 6 items in a seeded order, skipping ones you owned before this week (what you bought this week stays shown, as Owned). */
  offers(now = Date.now()): { id: string; price: number }[] {
    const wk = weekKey(now);
    const st = game.state.boutique;
    const boughtNow = st && st.week === wk ? st.weekBought ?? [] : [];
    const r = rng(hashString(`${game.state.seed}:boutique:${wk}`));
    const all = MASTER.boutique.items.filter((i) => BUILDING[i.id]);
    const order = all.map((i) => ({ i, k: r() })).sort((a, b) => a.k - b.k).map((x) => x.i);
    return order.filter((i) => !this.owned(i.id) || boughtNow.includes(i.id)).slice(0, MASTER.boutique.slots).map((i) => ({ id: i.id, price: i.price }));
  }
  /** Everything in the boutique is owned. */
  get complete(): boolean { return MASTER.boutique.items.every((i) => this.owned(i.id)); }

  buy(id: string): boolean {
    const o = this.offers().find((x) => x.id === id);
    if (!o || this.owned(id) || !game.spend(0, o.price, `boutique:${id}`)) return false;
    const st = (game.state.boutique ??= { owned: [] });
    const wk = weekKey(Date.now());
    if (st.week !== wk) { st.week = wk; st.weekBought = []; }
    st.owned.push(id);
    st.weekBought!.push(id);
    game.state.storage[id] = (game.state.storage[id] ?? 0) + 1;
    game.discover(id, 'building');
    game.incStat('boutique_buys');
    game.bus.emit('sfx', { name: 'purchase' });
    return true;
  }
  name(id: string): string { return BUILDING[id]?.name ?? ITEMS[id]?.name ?? id; }
}

export const boutique = new BoutiqueSystem();
