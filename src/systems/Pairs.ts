/**
 * 1.48 Friends Board (pairs.json). Two friends who both say yes share a board of weekly deliveries. Both must give to
 * every task (one friend gives at most 3/4 of it). A finished task pays both of them XP (a share of the XP to their
 * own next level, so it stays worth it at any level) and coins; a full board pays more XP and Friendship Tokens. The
 * bond (every 10 tasks done together) adds 5% XP a level. Goods on tasks that are not finished by the end of the
 * week, or when a friend leaves, come back to whoever gave them.
 *
 * Same trust model as co-op projects (Coop.ts): the goods leave the barn before the server call and whatever the
 * server did not use comes back; rewards and refunds come from pair_claim(), which hands each one out once. Polling
 * is light (every minute while the game is visible), never on the frame loop. Nothing is given while visiting.
 */
import { ITEMS, PAIRS } from '../data';
import { game } from './Game';
import { saves } from './Save';
import { social } from './Social';
import { visiting } from './Visiting';
import { take, giveBack } from './Help';
import { online } from '../online/Online';
import { gameConfig } from '../online/GameConfig';
import { ensureOnline } from '../online/Profile';
import { logEvent } from '../online/Events';
import { pairBond, pairPart } from '../online/Pairs';
import type { PairBoard, PairClaim, PairTask } from '../online/types';

const friendIds = (): string[] => social.state.friends.map((f) => f.id);
const WORDS: Record<string, string> = {
  level: `The Friends Board opens at level ${PAIRS.level}.`,
  'too many': `You can share ${PAIRS.partners} boards at a time (invites you sent count too).`,
  'partner full': `Your friend already shares ${PAIRS.partners} boards. They can make room by leaving one.`,
  'switched off': 'The Friends Board is resting for now. Try again later.',
  blocked: 'You cannot share a board with this farmer.',
  closed: 'That board has ended.', 'not needed': 'That task is already done. Thank you anyway!',
  'your part': 'You have given your part of this one. Your friend gives the rest.',
  'too many today': `That is ${PAIRS.givesPerDay} gifts today. You can give again tomorrow.`,
  'not found': 'That board is not there any more.',
};
/** Answers from the server that mean the gift did not happen (the goods come straight back). */
const REFUSED = new Set(['closed', 'not needed', 'your part', 'not found', 'too many today', 'switched off', 'blocked', 'bad qty', 'no profile', 'not signed in']);
const newKey = (): string => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16)));

/** How much of the XP share is left at a level: all of it to `lateFrom`, shrinking steadily to `lateShare` at `lateTo`. */
export function pairLateShare(level: number): number {
  if (level <= PAIRS.lateFrom) return 1;
  const k = Math.min(1, (level - PAIRS.lateFrom) / Math.max(1, PAIRS.lateTo - PAIRS.lateFrom));
  return 1 - (1 - PAIRS.lateShare) * k;
}

/** XP and coins one finished task (or a full board) pays at the player's own level (XP capped per claim). */
export function pairReward(kind: 'task' | 'full', bond: number, item = '', qty = 0, level = game.level): { xp: number; coins: number; tokens: number } {
  const k = (1 + Math.min(PAIRS.bondMax, Math.max(0, bond)) * PAIRS.bondXp) * pairLateShare(level);
  const raw = game.xpToNext(level) * (kind === 'task' ? PAIRS.xpTask : PAIRS.xpFull) * k;
  const xp = Math.max(1, Math.min(kind === 'task' ? PAIRS.xpTaskMax : PAIRS.xpFullMax, Math.round(raw)));
  const coins = kind === 'task' ? Math.round(qty * (ITEMS[item]?.sell ?? 0) * PAIRS.coinsTask) : 0;
  return { xp, coins, tokens: kind === 'full' ? PAIRS.tokensFull : 0 };
}

class PairsSystem {
  boards: PairBoard[] = [];
  error = '';
  loaded = false;
  private started = false;
  private polling: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  private seen = new Set<string>();
  private claimedAt = 0;

  get available(): boolean { return social.available && game.level >= PAIRS.level && gameConfig.pairs; }
  active(): PairBoard[] { return this.boards.filter((b) => b.status === 'active'); }
  invites(): PairBoard[] { return this.boards.filter((b) => b.status === 'pending' && !b.invitedByMe); }
  sent(): PairBoard[] { return this.boards.filter((b) => b.status === 'pending' && b.invitedByMe); }
  /** Boards that count towards the limit (active and invites sent). */
  used(): number { return this.active().length + this.sent().length; }
  withFriend(id: string): PairBoard | undefined { return this.boards.find((b) => b.partner.id === id); }
  /** Tasks on active boards you can still give to, with what you have. */
  canGive(): number {
    let n = 0;
    for (const b of this.active()) for (const t of b.tasks) if (!t.done && this.myLeft(t) > 0 && game.count(t.item) > 0) n++;
    return n;
  }
  /** How many more you may give to a task. */
  myLeft(t: PairTask): number { return Math.max(0, Math.min(t.qty - t.mine - t.theirs, pairPart(t.qty) - t.mine)); }
  bond(b: PairBoard): number { return pairBond(b.tasksDone); }

  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private changed(): void { for (const fn of this.listeners) { try { fn(); } catch (e) { console.error('[pairs]', e); } } }
  private words(e: unknown): Error { const m = (e as Error)?.message ?? ''; return new Error(WORDS[m] ?? 'Could not reach the village right now.'); }

  start(): void {
    if (this.started) return;
    this.started = true;
    window.setInterval(() => { if (!document.hidden) void this.poll(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void this.poll(); });
    social.onChange(() => void this.poll());
    setTimeout(() => void this.poll(), 7000);
  }

  /** Invite a friend, or say yes to their invite (the same call). */
  async invite(friendId: string): Promise<PairBoard> {
    if (!this.available) throw new Error(WORDS['switched off']);
    if (!social.isFriend(friendId)) throw new Error('Add them as a friend first.');
    try {
      await ensureOnline();
      const b = await online.pairInvite(friendId);
      this.boards = [b, ...this.boards.filter((x) => x.id !== b.id)];
      logEvent(b.status === 'active' ? 'pair_start' : 'pair_invite', {});
      this.changed();
      return b;
    } catch (e) { throw this.words(e); }
  }

  async leave(b: PairBoard): Promise<void> {
    try {
      await online.pairLeave(b.id);
      this.boards = this.boards.filter((x) => x.id !== b.id);
      if (b.status === 'active') logEvent('pair_leave', { done: b.tasksDone });
      await this.collect();
      this.changed();
    } catch (e) { throw this.words(e); }
  }

  /** Give up to qty to a task: the server takes what is still needed (up to your part) and the rest comes back. */
  async give(b: PairBoard, t: PairTask, qty: number): Promise<number> {
    if (visiting.active) throw new Error('You can give this when you are back home.');
    const n = Math.min(Math.floor(qty), this.myLeft(t), game.count(t.item), PAIRS.maxGive);
    if (n < 1) throw new Error(this.myLeft(t) < 1 ? WORDS['your part'] : `You have no ${ITEMS[t.item]?.name ?? 'items'} to give.`);
    const taken = take(t.item, n);
    const key = newKey();
    let r: { used: number; board: PairBoard };
    try {
      await ensureOnline();
      r = await online.pairGive(b.id, t.idx, n, key);
    } catch (e) {
      if (REFUSED.has((e as Error)?.message ?? '')) { giveBack(t.item, taken, n); saves.save(); throw this.words(e); }
      ((game.state.pairs ??= {}).pending ??= []).push({ key, board: b.id, idx: t.idx, item: t.item, n, taken });
      saves.save();
      throw new Error('Could not reach the village. Your gift is set aside and will be delivered when the connection is back.');
    }
    if (r.used < n) giveBack(t.item, taken, n - r.used);
    this.boards = this.boards.map((x) => (x.id === b.id ? r.board : x));
    game.incStat('pair_given', r.used);
    saves.save();
    this.changed();
    if (r.board.tasks.find((x) => x.idx === t.idx)?.done) void this.poll();
    return r.used;
  }

  poll(): Promise<void> {
    if (!this.available || !game.state) return Promise.resolve();
    this.polling ??= this.doPoll().finally(() => { this.polling = null; });
    return this.polling;
  }
  private async doPoll(): Promise<void> {
    const quiet = !friendIds().length && !this.boards.length && !game.state.pairs?.pending?.length && this.loaded;
    this.drip();
    if (quiet && Date.now() - this.claimedAt < 15 * 60000) { this.changed(); return; }
    try {
      await ensureOnline();
      this.boards = await online.pairList(friendIds());
      if (!visiting.active) { await this.retryPending(); await this.collect(); this.drip(); }
      this.announce();
      this.error = '';
      this.loaded = true;
    } catch { this.error = 'Could not reach the village right now.'; }
    this.changed();
  }

  /** A friend invited you, or said yes to your invite. */
  private announce(): void {
    for (const b of this.boards) {
      const key = `${b.id}:${b.status}`;
      if (this.seen.has(key)) continue;
      const first = this.seen.size === 0 && !this.loaded;
      this.seen.add(key);
      if (b.status === 'pending' && !b.invitedByMe) game.bus.emit('toast', { title: `${b.partner.name} wants to team up`, sub: 'Open Friends, then Friends Board, to say yes.', icon: 'hug' });
      else if (b.status === 'active' && !first && this.seen.has(`${b.id}:pending`)) game.bus.emit('toast', { title: `${b.partner.name} said yes!`, sub: 'Your Friends Board is ready with this week\'s tasks.', icon: 'hug' });
    }
  }

  private async retryPending(): Promise<void> {
    const list = game.state.pairs?.pending;
    if (!list?.length) return;
    for (const g of [...list]) {
      try {
        const r = await online.pairGive(g.board, g.idx, g.n, g.key);
        if (r.used < g.n) giveBack(g.item, g.taken, g.n - r.used);
        this.boards = this.boards.map((x) => (x.id === g.board ? r.board : x));
      } catch (e) {
        if (!REFUSED.has((e as Error)?.message ?? '')) continue;
        giveBack(g.item, g.taken, g.n);
      }
      list.splice(list.indexOf(g), 1);
      saves.save();
    }
  }

  /** Claims: finished tasks and full boards pay XP, coins and tokens; refunds bring the goods back. */
  private async collect(): Promise<void> {
    const got: PairClaim[] = await online.pairClaim();
    this.claimedAt = Date.now();
    if (!got.length) return;
    const st = (game.state.pairs ??= {});
    for (const c of got) {
      if (c.kind === 'refund') {
        for (const [item, n] of Object.entries(c.refund ?? {})) game.as('pair_refund').addItem(item, n);
        game.bus.emit('toast', { title: 'Goods returned', sub: `A task with ${c.partner} was not finished, so what you gave is back in your barn.`, icon: 'basket' });
        continue;
      }
      const r = pairReward(c.kind, c.bond, c.item, c.qty);
      st.owed = (st.owed ?? 0) + r.xp;
      if (r.coins) game.addCoins(r.coins);
      if (r.tokens) game.state.village.tokens = (game.state.village.tokens ?? 0) + r.tokens;
      if (c.kind === 'task') {
        st.tasks = (st.tasks ?? 0) + 1;
        game.incStat('pair_tasks');
        game.bus.emit('toast', { title: `Task done with ${c.partner}!`, sub: `${c.qty} ${ITEMS[c.item]?.name ?? c.item}: ${r.xp.toLocaleString()} XP and ${r.coins.toLocaleString()} coins.`, icon: 'hug' });
      } else {
        st.full = (st.full ?? 0) + 1;
        game.incStat('pair_full');
        game.bus.emit('toast', { title: `Full board with ${c.partner}!`, sub: `Every task this week: ${r.xp.toLocaleString()} XP and ${r.tokens} Friendship Tokens.`, icon: 'trophy' });
      }
      logEvent('pair_reward', { kind: c.kind, xp: r.xp, bond: c.bond });
      game.bus.emit('sfx', { name: 'reward' });
    }
    this.drip();
    saves.save();
  }

  /** XP waiting to be paid (Friends Board XP comes in at most `xpPerHour` an hour). */
  owed(): number { return game.state.pairs?.owed ?? 0; }
  /**
   * Pay waiting XP, at most `xpPerHour` in any clock hour, so a week of rewards never lands as one lump (the
   * server's leaderboard check allows about 40,000 XP an hour and notes anything faster).
   */
  drip(): void {
    const st = game.state.pairs;
    if (!st?.owed || visiting.active) return;
    const hour = Math.floor(game.now() / 36e5);
    if (st.hour !== hour) { st.hour = hour; st.paid = 0; }
    const n = Math.min(st.owed, PAIRS.xpPerHour - (st.paid ?? 0));
    if (n <= 0) return;
    st.owed -= n;
    st.paid = (st.paid ?? 0) + n;
    game.addXp(n);
    saves.save();
  }
}

export const pairs = new PairsSystem();
