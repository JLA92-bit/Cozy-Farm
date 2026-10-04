import { ANIMAL, BUILDING, CROP, TREE } from '../data';
import { cleanHelp, HELP_DONE } from '../online/FarmHelp';
import { online } from '../online/Online';
import { ensureOnline } from '../online/Profile';
import type { FarmHelp, FarmHelpKind, FarmHelpStatus, FarmHelpTarget } from '../online/types';
import { game } from './Game';
import { localDay } from './Progression';
import { saves } from './Save';
import type { NeighbourState } from './State';
import { animalState, isBuilt, plotRemaining } from './Timers';
import { visiting } from './Visiting';

/**
 * Helping neighbours while visiting (Update 5).
 *
 * Visitor side: once per neighbour per day the visitor can water a growing field, feed an animal home
 * or tend a fruit tree, and like the farm (with an optional preset guestbook note). The backend
 * enforces the daily limits; the visitor's small reward (coins + XP) is NOT added while visiting (the
 * player's save is held then). It waits in a small "pending" list in localStorage and is added to the
 * player's real farm and saved as soon as they are back home (or on the next start after a reload).
 * Each reward has an id that the save remembers, so it is never added twice.
 *
 * Owner side: while playing at home, help left on the farm is fetched (on start, every ~30 s while
 * visible and on return), claimed once on the backend, checked against the real farm (the field must
 * still be growing, the home must still have hungry animals, the tree must still be growing; anything
 * else gets a small "thanks anyway" reward) and then shown as "While you were away".
 */

export const HELP = {
  /** a watered field / tended tree loses this share of its remaining time ... */
  speedUp: 0.25,
  /** ... but never more than this (ms) */
  maxCutMs: 2 * 3600_000,
  /** visitor reward: coins = base + per owner level, capped */
  coinsBase: 10,
  coinsPerLevel: 1,
  coinsMax: 40,
  xpBase: 5,
  xpPerLevel: 0.5,
  xpMax: 25,
  /** helps a day that pay coins and XP (more still count for quests and medals) */
  rewardsPerDay: 10,
  /** "thanks anyway" coins when help arrives for something that no longer needs it */
  consolation: 5,
  consolationsPerDay: 10,
  /** most help rows handled per check */
  batch: 50,
  pollSec: 30,
};

const PENDING_KEY = 'cozy-acres-help-rewards';

/** A visitor reward waiting to be added at home. */
interface PendingReward { id: string; day: string; coins: number; xp: number; owner: string }

/** One line of "While you were away". */
export interface AwayEntry {
  name: string;
  helperId: string;
  kind: FarmHelpKind | 'like';
  /** what was helped ("wheat", "Chicken Coop", "Apple Tree"); empty for likes */
  what: string;
  /** the help was used on the farm (false = it was no longer needed, see coins) */
  ok: boolean;
  /** "thanks anyway" coins */
  coins: number;
  note: string | null;
}

export interface VisitorReward { coins: number; xp: number }

const storeGet = (): PendingReward[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((r): r is PendingReward => !!r && typeof r === 'object' && typeof (r as PendingReward).id === 'string')
      .map((r) => ({ id: r.id.slice(0, 64), day: typeof r.day === 'string' ? r.day : '', coins: clampInt(r.coins, 0, HELP.coinsMax), xp: clampInt(r.xp, 0, HELP.xpMax), owner: typeof r.owner === 'string' ? r.owner.slice(0, 24) : '' }))
      .slice(-50);
  } catch { return []; }
};
const storeSet = (list: PendingReward[]): void => {
  try {
    if (list.length) localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-50)));
    else localStorage.removeItem(PENDING_KEY);
  } catch { /* blocked */ }
};
function clampInt(v: unknown, min: number, max: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.floor(v))) : min;
}

class Neighbours {
  /** recent help and likes on this player's farm (newest first), for the Visitors list */
  recent: FarmHelp[] = [];
  /** this farm's like count (from the backend), -1 = not known yet */
  likes = -1;
  /** "While you were away" lines not shown yet */
  away: AwayEntry[] = [];
  error = '';
  private listeners = new Set<() => void>();
  private polling: Promise<void> | null = null;
  /** claimed help that arrived just as a visit started: applied at home */
  private held: FarmHelp[] = [];
  private started = false;

  get state(): NeighbourState {
    const s = game.state.neighbours;
    const day = localDay(game.now());
    if (s.day !== day) { s.day = day; s.rewarded = 0; s.consoled = 0; }
    return s;
  }
  /** Helping opens with Friends: once the farmer is made and the tutorial is done. */
  get available(): boolean { return !!game.state && game.state.player.created && game.state.tutorial.done; }

  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private changed(): void { for (const fn of this.listeners) fn(); }

  /** Light polling while at home and visible. Called once after boot. */
  start(): void {
    if (this.started) return;
    this.started = true;
    window.setInterval(() => { if (!document.hidden) void this.poll(); }, HELP.pollSec * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void this.poll(); });
    setTimeout(() => void this.poll(), 4000);
    this.applyPending();
  }

  // ------------------------------------------------------------------ visitor side

  /** What the visitor already did today for this farm, and its like count. */
  async status(ownerId: string): Promise<FarmHelpStatus> {
    await ensureOnline();
    return online.farmHelpStatus(ownerId);
  }

  /** The visitor's reward for helping a farmer of this level (before the daily cap). */
  rewardFor(ownerLevel: number): VisitorReward {
    const lvl = clampInt(ownerLevel, 1, 999);
    return {
      coins: Math.min(HELP.coinsMax, Math.round(HELP.coinsBase + HELP.coinsPerLevel * lvl)),
      xp: Math.min(HELP.xpMax, Math.round(HELP.xpBase + HELP.xpPerLevel * lvl)),
    };
  }

  /**
   * Help a neighbour's farm. Throws Error with a friendly message when refused. The reward is only
   * remembered here and added at home (see applyPending).
   */
  async help(owner: { id: string; name: string; level: number }, kind: FarmHelpKind, target: FarmHelpTarget): Promise<VisitorReward> {
    try {
      await ensureOnline();
      const row = await online.helpFarm(owner.id, kind, target);
      const day = localDay(game.now());
      const pending = storeGet();
      const usedToday = this.state.rewarded + pending.filter((p) => p.day === day && p.coins > 0).length;
      const r = usedToday < HELP.rewardsPerDay ? this.rewardFor(owner.level) : { coins: 0, xp: 0 };
      if (!pending.some((p) => p.id === `help:${row.id}`)) pending.push({ id: `help:${row.id}`, day, coins: r.coins, xp: r.xp, owner: owner.name.slice(0, 24) });
      storeSet(pending);
      // back home right away when the visit is already over (e.g. the call was slow)
      if (!visiting.active) this.applyPending();
      return r;
    } catch (e) { throw new Error(this.why(e, owner.name)); }
  }

  /** Like a neighbour's farm, with an optional preset note id. */
  async like(owner: { id: string; name: string }, note: string | null): Promise<void> {
    try {
      await ensureOnline();
      await online.likeFarm(owner.id, note);
    } catch (e) { throw new Error(this.why(e, owner.name, true)); }
    // likes given count toward nothing that pays; just a stat for fun (added at home like rewards)
    const pending = storeGet();
    pending.push({ id: `like:${owner.id}:${localDay(game.now())}`, day: localDay(game.now()), coins: 0, xp: 0, owner: '' });
    storeSet(pending);
    if (!visiting.active) this.applyPending();
  }

  private why(e: unknown, name: string, like = false): string {
    const m = e instanceof Error ? e.message : '';
    if (m === 'already') return like ? `You already liked ${name}'s farm today. Come back tomorrow!` : `You already helped ${name} today. Come back tomorrow!`;
    if (m === 'self') return 'That is your own farm!';
    if (m === 'busy') return `${name}'s farm has had lots of help today. Try again tomorrow!`;
    if (m === 'unknown player') return `${name} could not be found any more.`;
    if (m === 'bad') return 'That did not work. Try something else on the farm.';
    return 'Could not reach the village right now. Try again in a moment.';
  }

  /**
   * Add visitor rewards earned on visits to the player's real farm and save. Does nothing while
   * visiting (the save is held then). Returns what was added.
   */
  applyPending(): { coins: number; xp: number; helps: number; names: string[] } {
    const out = { coins: 0, xp: 0, helps: 0, names: [] as string[] };
    if (visiting.active || !this.available) return out;
    const list = storeGet();
    if (!list.length) return out;
    const s = this.state;
    const paid = new Set(s.paid);
    for (const p of list) {
      if (paid.has(p.id)) continue;
      paid.add(p.id);
      s.paid.push(p.id);
      if (p.id.startsWith('like:')) { game.incStat('farms_liked'); continue; }
      if (p.coins > 0 && p.day === s.day) s.rewarded++;
      if (p.coins) game.addCoins(p.coins);
      if (p.xp) game.addXp(p.xp);
      game.incStat('neighbours_helped');
      out.coins += p.coins;
      out.xp += p.xp;
      out.helps++;
      if (p.owner && !out.names.includes(p.owner)) out.names.push(p.owner);
    }
    if (s.paid.length > 100) s.paid.splice(0, s.paid.length - 100);
    // saved first, then the pending list is cleared (a crash in between is safe: ids are remembered)
    saves.save();
    storeSet([]);
    if (out.helps) game.bus.emit('toast', {
      title: 'Thanks for helping!',
      sub: out.coins ? `${out.names.join(' and ') || 'Your neighbour'} will love it. +${out.coins} coins, +${out.xp} XP` : `${out.names.join(' and ') || 'Your neighbour'} will love it.`,
      icon: 'hug',
    });
    return out;
  }

  // ------------------------------------------------------------------ owner side

  /** Fetch help left on this farm; claim and apply the new ones. Safe to call often (calls are merged). */
  poll(): Promise<void> {
    if (!this.available || visiting.active) return Promise.resolve();
    this.polling ??= this.doPoll().finally(() => { this.polling = null; });
    return this.polling;
  }

  private async doPoll(): Promise<void> {
    try {
      const me = await ensureOnline();
      const rows = (await online.myFarmHelp()).map(cleanHelp).filter((r): r is FarmHelp => !!r);
      this.recent = rows;
      try { this.likes = (await online.farmHelpStatus(me.id)).likes; } catch { /* keep the old count */ }
      const fresh = rows.filter((r) => !r.claimed).slice(0, HELP.batch);
      this.error = '';
      if (fresh.length && !visiting.active) {
        const claimed = new Set(await online.claimFarmHelp(fresh.map((r) => r.id)));
        const mine = fresh.filter((r) => claimed.has(r.id)).reverse();
        for (const r of mine) r.claimed = true;
        this.held.push(...mine);
      }
      // a visit may have started while we were waiting: then the help waits until back home
      if (this.held.length && !visiting.active) {
        const list = this.held;
        this.held = [];
        this.away.push(...this.applyHelp(list));
        saves.save();
      }
      this.changed();
    } catch (e) {
      this.error = 'Could not reach the village right now.';
      console.warn('[neighbours] help check failed', e);
      this.changed();
    }
  }

  /** Apply claimed help to the real farm (only where it still makes sense). Pure on `game.state`. */
  applyHelp(rows: FarmHelp[]): AwayEntry[] {
    const out: AwayEntry[] = [];
    const now = game.now();
    for (const r of rows) {
      const base = { name: r.helper.name, helperId: r.helper.id, kind: r.kind, note: r.note };
      if (r.kind === 'like') {
        game.incStat('likes_received');
        out.push({ ...base, what: '', ok: true, coins: 0 });
        continue;
      }
      const t = r.target;
      const b = t ? game.state.buildings.find((x) => x.type === t.type && x.x === t.x && x.z === t.z) : undefined;
      const def = b ? BUILDING[b.type] : undefined;
      let what = def?.name ?? '';
      let ok = false;
      if (b && def && isBuilt(b, now)) {
        if (r.kind === 'water' && def.id === 'plot' && b.plot) {
          const left = plotRemaining(b, now);
          if (left > 0) {
            b.plot.plantedAt -= Math.min(HELP.maxCutMs, left * HELP.speedUp);
            what = (CROP[b.plot.crop]?.name ?? 'crop').toLowerCase();
            ok = true;
          }
        } else if (r.kind === 'tend' && def.tree && b.tree) {
          const left = b.tree.readyAt - now;
          if (left > 0) {
            b.tree.readyAt -= Math.min(HELP.maxCutMs, left * HELP.speedUp);
            what = (TREE[def.tree]?.name ?? def.name).toLowerCase();
            ok = true;
          }
        } else if (r.kind === 'feed' && def.animal && b.animals?.length) {
          let fed = 0;
          b.animals.slice(0, 24).forEach((a, i) => { if (animalState(b, i, now) === 'hungry') { a.fedAt = now; fed++; } });
          if (fed) {
            const an = ANIMAL[def.animal];
            what = fed === 1 ? `${(an?.name ?? 'animal').toLowerCase()}` : `${fed} ${(an?.name ?? 'animal').toLowerCase()}s`;
            ok = true;
          }
        }
      }
      if (ok && b) {
        game.incStat('help_received');
        game.bus.emit('building:changed', { b });
        out.push({ ...base, what, ok: true, coins: 0 });
      } else {
        const s = this.state;
        const coins = s.consoled < HELP.consolationsPerDay ? HELP.consolation : 0;
        if (coins) { s.consoled++; game.addCoins(coins); }
        out.push({ ...base, what: what.toLowerCase(), ok: false, coins });
      }
    }
    return out;
  }

  /** "Kacie watered your wheat" style line. */
  line(e: AwayEntry): string {
    if (e.kind === 'like') return `${e.name} liked your farm`;
    if (!e.ok) return `${e.name} came by to help`;
    return `${e.name} ${HELP_DONE[e.kind]} your ${e.what}`;
  }

  /** Take the "While you were away" lines (once). */
  takeAway(): AwayEntry[] {
    const a = this.away;
    this.away = [];
    return a;
  }
}

export const neighbours = new Neighbours();
