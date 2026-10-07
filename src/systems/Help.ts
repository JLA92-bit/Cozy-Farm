import { ITEMS } from '../data';
import { game } from './Game';
import { saves } from './Save';
import { localDay } from './Progression';
import { mail } from './Mail';
import { visiting } from './Visiting';
import { requestedCount } from './Economy';
import { social } from './Social';
import { online } from '../online/Online';
import { logEvent } from '../online/Events';
import { ensureOnline } from '../online/Profile';
import { ASK, askable, hazelUnitPrice, helperReward, isOpen, needOf } from '../online/AskHelp';
import type { HelpFill, HelpReason, HelpRequest } from '../online/types';
import type { HelpState } from './State';

/**
 * Ask a friend (1.8). A player short of an item asks their friends for 1-10 of it; friends send some with one
 * tap (or their game does it by itself with Auto-help) and the items arrive in the asker's barn by themselves.
 *
 * Same trust model as gifts (src/systems/Social.ts): the helper's items leave the barn before the server call
 * and whatever the server did not use comes back; the asker's game adds exactly the fills the server hands it
 * with claimHelpFills, which hands each fill out once. Polling is light (every ~25 s while the game is visible,
 * on return to it and when a panel opens), never on the frame loop. Nothing is added, sent or saved while the
 * player is visiting a neighbour (their save is held then); it waits for the next poll at home.
 */

/** Items that arrived from friends, for the "Thanks, Ben!" card. */
export interface Arrival { from: string; item: string; qty: number; auto: boolean; requestDone: boolean }
/** One line of a refusal, in plain words. */
export type AskCheck = string | null;

const friendIds = (): string[] => social.state.friends.map((f) => f.id);

class HelpSystem {
  /** the player's own requests (open ones and those closed in the last days), newest first */
  mine: HelpRequest[] = [];
  /** friends' open requests the player can help with */
  friendReqs: HelpRequest[] = [];
  /** last connection problem ('' = fine) */
  error = '';
  loaded = false;
  private listeners = new Set<() => void>();
  private arriveListeners = new Set<(a: Arrival[]) => void>();
  private polling: Promise<void> | null = null;
  private started = false;
  private seenFriendReqs = new Set<string>();
  private firstFriendPoll = true;
  /** friend list the server knows for our open requests (to update it when friends change) */
  private audienceSig = '';
  /** sends picked while visiting, done once back home: request id -> qty */
  private queued = new Map<string, number>();
  private busy = new Set<string>();
  /** own older requests were checked once this session (items sent before they expired still arrive) */
  private checkedOld = false;

  get state(): HelpState { return game.state.help; }
  get practice(): boolean { return online.kind === 'local'; }
  /** Ask a friend opens together with Friends: once the farmer is made and the tutorial is done. */
  get available(): boolean { return social.available; }

  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onArrive(fn: (a: Arrival[]) => void): () => void { this.arriveListeners.add(fn); return () => this.arriveListeners.delete(fn); }
  private changed(): void { for (const fn of this.listeners) { try { fn(); } catch (e) { console.error('[help]', e); } } }

  /** Wire polling. Called once after boot. */
  start(): void {
    if (this.started) return;
    this.started = true;
    window.setInterval(() => { if (!document.hidden) void this.poll(); }, ASK.pollSec * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void this.poll(); });
    social.onChange(() => this.syncAudience());
    setTimeout(() => void this.poll(), 3500);
  }

  // ------------------------------------------------------------------ own requests
  /** Open requests of the player (not yet filled, not expired). */
  openMine(now = game.now()): HelpRequest[] { return this.mine.filter((r) => isOpen(r, now)); }
  /** The open request for an item, if any. */
  openFor(item: string): HelpRequest | undefined { return this.openMine().find((r) => r.item === item); }
  /** The latest request for an item made in the last day (open or finished), for showing progress. */
  latestFor(item: string): HelpRequest | undefined {
    const now = game.now();
    return this.mine.find((r) => r.item === item && r.createdAt > now - ASK.expireHours * 3600e3);
  }

  /** Why the player cannot ask for this item right now (plain words), or null when they can. */
  canAsk(item: string): AskCheck {
    if (!this.available) return 'Ask a friend opens after the first-day tips.';
    if (!askable(item)) return 'Friends cannot send this item.';
    if (this.openFor(item)) return 'You already asked for this. Your friends can see it.';
    if (this.openMine().length >= ASK.maxOpen) return `You can have ${ASK.maxOpen} requests open at a time.`;
    const at = this.state.asked[item] ?? 0;
    const wait = at + ASK.sameItemHours * 3600e3 - Date.now();
    if (wait > 0) return `You asked for ${ITEMS[item].name} not long ago. You can ask again in ${waitText(wait)}.`;
    const day = this.mine.filter((r) => r.createdAt > game.now() - 864e5).length;
    if (day >= ASK.asksPerDay) return `That is ${ASK.asksPerDay} requests today. You can ask again tomorrow.`;
    return null;
  }

  /** Ask friends for qty (1-10) of an item. Throws an Error with a plain-words message when refused. */
  async ask(item: string, qty: number, reason: HelpReason): Promise<HelpRequest> {
    const why = this.canAsk(item);
    if (why) throw new Error(why);
    const n = Math.max(1, Math.min(ASK.maxQty, Math.floor(qty)));
    let r: HelpRequest;
    try {
      await this.connect();
      r = await online.askHelp(item, n, reason, friendIds());
    } catch (e) {
      throw new Error(askError(e, item));
    }
    this.state.asked[item] = Date.now();
    this.audienceSig = friendIds().join(',');
    this.mine = [r, ...this.mine.filter((x) => x.id !== r.id)];
    game.incStat('help_asked');
    saves.save();
    this.changed();
    return r;
  }

  /** Take back an open request (items already sent still arrive). */
  async cancel(id: string): Promise<void> {
    try {
      await this.connect();
      const r = await online.cancelHelp(id);
      this.mine = this.mine.map((x) => (x.id === id ? r : x));
      logEvent('help_cancel', { item: r.item, filled: r.filled, qty: r.qty });
    } catch (e) {
      if ((e as Error).message !== 'not open') throw new Error('Could not reach the village. Try again in a moment.');
    }
    this.changed();
    void this.poll();
  }

  /** The friend list changed while requests are open: tell the server who may see them now. */
  private syncAudience(): void {
    const sig = friendIds().join(',');
    if (sig === this.audienceSig || !this.openMine().length) return;
    this.audienceSig = sig;
    void online.setHelpFriends(friendIds()).catch(() => { this.audienceSig = ''; });
  }

  // ------------------------------------------------------------------ helping friends
  /** How many of an item the player has. */
  have(item: string): number { return game.count(item); }
  /** What Auto-help may give away: above the reserve and above what the player's own orders and truck need. */
  spare(item: string): number { return Math.max(0, game.count(item) - Math.max(this.state.reserve, requestedCount(item))); }

  private today(): HelpState {
    const s = this.state;
    const day = localDay(game.now());
    if (s.day !== day) { s.day = day; s.rewarded = 0; }
    return s;
  }
  /** Sends today that still pay a thank-you in coins. */
  rewardsLeft(): number { return Math.max(0, ASK.rewardedPerDay - (this.today().rewarded ?? 0)); }

  /**
   * Send up to qty of a friend's requested item. Items leave the barn first (normal ones first) and whatever the
   * server did not use comes back (best ones first). Returns what was sent and the thank-you coins.
   */
  async send(req: HelpRequest, qty: number, auto = false): Promise<{ sent: number; coins: number }> {
    if (visiting.active) throw new Error('You can send this when you are back home.');
    const n = Math.min(Math.floor(qty), needOf(req), game.count(req.item), ASK.maxQty);
    if (n < 1) throw new Error(game.count(req.item) ? 'They have everything they asked for.' : `You have no ${ITEMS[req.item]?.name ?? 'items'} to send.`);
    if (this.busy.has(req.id)) throw new Error('Sending...');
    this.busy.add(req.id);
    const taken = take(req.item, n);
    let fill: HelpFill;
    try {
      await this.connect();
      fill = await online.fillHelp(req.id, n, auto);
    } catch (e) {
      giveBack(req.item, taken, n);
      this.busy.delete(req.id);
      const m = (e as Error).message;
      if (m === 'closed' || m === 'not found') {
        this.friendReqs = this.friendReqs.filter((x) => x.id !== req.id);
        this.changed();
        throw new Error(`${req.requester.name} has everything they need now. Thank you anyway!`);
      }
      if (m === 'too many today') throw new Error(`That is ${ASK.fillsPerDay} sends today. You can help again tomorrow.`);
      throw new Error('Could not reach the village, so the items are back in your barn.');
    }
    this.busy.delete(req.id);
    const sent = Math.min(n, fill.qty);
    if (sent < n) giveBack(req.item, taken, n - sent);
    let coins = 0;
    const s = this.today();
    if ((s.rewarded ?? 0) < ASK.rewardedPerDay) {
      coins = helperReward(req.item, sent);
      s.rewarded = (s.rewarded ?? 0) + 1;
      game.addCoins(coins);
    }
    game.incStat('help_sent');
    game.incStat('help_items_sent', sent);
    if (auto) {
      const day = localDay(game.now());
      if (!s.log || s.log.day !== day) { this.sendSummary(); s.log = { day, sends: [] }; }
      s.log.sends.push({ to: req.requester.name, item: req.item, qty: sent, coins });
      if (s.log.sends.length > 100) s.log.sends.splice(0, s.log.sends.length - 100);
    }
    const left = { ...req, filled: Math.min(req.qty, req.filled + sent) };
    this.friendReqs = this.friendReqs.map((x) => (x.id === req.id ? left : x)).filter((x) => needOf(x) > 0);
    saves.save();
    this.changed();
    return { sent, coins };
  }

  /** While visiting: remember to send once back home (the save is held during a visit). */
  queue(req: HelpRequest, qty: number): void { this.queued.set(req.id, qty); }
  isQueued(id: string): boolean { return this.queued.has(id); }

  setAuto(on: boolean): void {
    if (this.state.auto !== on) logEvent(on ? 'help_auto_on' : 'help_auto_off', { reserve: this.state.reserve });
    this.state.auto = on;
    saves.save();
    this.changed();
    if (on) void this.poll();
  }
  setReserve(n: number): void {
    this.state.reserve = Math.max(0, Math.min(999, Math.floor(n)));
    saves.save();
    this.changed();
  }

  /** Auto-help: fill friends' requests from spare stock (a few per poll, oldest first). */
  private async autoHelp(): Promise<void> {
    if (!this.state.auto || visiting.active) return;
    let n = 0;
    for (const r of [...this.friendReqs]) {
      if (n >= ASK.autoPerPoll) break;
      const give = Math.min(needOf(r), this.spare(r.item));
      if (give < 1 || this.queued.has(r.id)) continue;
      try { await this.send(r, give, true); n++; } catch (e) {
        if (/sends today/.test((e as Error).message)) break;
      }
    }
  }

  /** The daily Auto-help letter for a past day's sends (once, when a new day starts). */
  private sendSummary(): void {
    const s = this.state;
    const log = s.log;
    if (!log || !log.sends.length || log.day === localDay(game.now())) return;
    s.log = { day: localDay(game.now()), sends: [] };
    const byFriend = new Map<string, string[]>();
    let coins = 0;
    const totals = new Map<string, number>();
    for (const x of log.sends) totals.set(`${x.to}\u0000${x.item}`, (totals.get(`${x.to}\u0000${x.item}`) ?? 0) + x.qty);
    for (const [k, qty] of totals) {
      const [to, item] = k.split('\u0000');
      const list = byFriend.get(to) ?? [];
      list.push(`${qty} ${ITEMS[item]?.name ?? item}`);
      byFriend.set(to, list);
    }
    for (const x of log.sends) coins += x.coins;
    const lines = [...byFriend].map(([to, items]) => `- ${items.join(', ')} to ${to}`);
    const body = [
      'Hello, farmer!',
      '',
      `While you were busy, Auto-help shared your spare harvest with your friends:`,
      ...lines,
      '',
      coins ? `Your friends sent ${coins} coins back as a thank-you.` : 'Your friends say a big thank-you!',
      `Auto-help always keeps at least ${s.reserve} of everything for you. You can change that in Settings.`,
    ].join('\n');
    mail.send('game', 'Auto-help: what you shared', body);
  }

  // ------------------------------------------------------------------ Hazel
  /** Own open requests Hazel offers to finish (unfilled for a while, not turned down). */
  hazelOffers(now = game.now()): HelpRequest[] {
    const no = this.state.hazelNo ?? [];
    return this.openMine(now).filter((r) => now - r.createdAt >= ASK.hazelAfterMin * 60000 && !no.includes(r.id));
  }
  /** Hazel's price for the rest of a request. */
  hazelPrice(r: HelpRequest): { qty: number; coins: number } {
    const qty = needOf(r);
    return { qty, coins: qty * hazelUnitPrice(r.item) };
  }
  hazelDecline(id: string): void {
    const no = (this.state.hazelNo ??= []);
    if (!no.includes(id)) no.push(id);
    if (no.length > 30) no.splice(0, no.length - 30);
    saves.save();
    this.changed();
  }
  /**
   * Hazel brings the rest of a request at her price. The request closes first (on the server), so a friend
   * cannot send the same items as well; she brings only what was still missing at that moment.
   */
  async hazelBuy(r: HelpRequest): Promise<{ qty: number; coins: number }> {
    if (visiting.active) throw new Error('Hazel can bring it when you are back home.');
    const most = this.hazelPrice(r);
    if (game.coins < most.coins) throw new Error(`You need ${most.coins - game.coins} more coins.`);
    let closed: HelpRequest;
    try {
      await this.connect();
      closed = await online.cancelHelp(r.id, true);
    } catch (e) {
      void this.poll();
      throw new Error((e as Error).message === 'not open' ? 'Your friends already sent everything!' : 'Could not reach the village. Try again in a moment.');
    }
    const qty = needOf(closed);
    const coins = qty * hazelUnitPrice(r.item);
    if (qty > 0) {
      // the request is closed now: she brings it even if a few coins were spent meanwhile
      game.addCoins(-Math.min(coins, game.coins));
      game.addItem(r.item, qty);
      game.incStat('help_hazel');
    }
    this.mine = this.mine.map((x) => (x.id === r.id ? closed : x));
    saves.save();
    this.changed();
    return { qty, coins };
  }

  // ------------------------------------------------------------------ polling
  async connect(): Promise<void> {
    try {
      await ensureOnline();
      this.error = '';
    } catch (e) {
      this.error = 'Could not reach the village right now.';
      throw e;
    }
  }

  /** Fetch arrivals, own requests and friends' requests. Safe to call often (calls are merged). */
  poll(): Promise<void> {
    if (!this.available || !game.state) return Promise.resolve();
    this.polling ??= this.doPoll().finally(() => { this.polling = null; });
    return this.polling;
  }
  private async doPoll(): Promise<void> {
    // keep the server quiet for players who do not use Ask a friend: own requests are only checked while one
    // could still be open (plus once a session for late arrivals), friends' only when there are friends
    const now = Date.now();
    const asks = Object.values(this.state.asked);
    const recent = asks.some((t) => now - t < (ASK.expireHours + 2) * 3600e3);
    const lately = asks.some((t) => now - t < 60 * 864e5);
    const ids = friendIds();
    if (!recent && !ids.length && (!lately || this.checkedOld)) { this.loaded = true; this.changed(); return; }
    try {
      await this.connect();
      if (recent || !this.checkedOld) {
        if (!visiting.active) await this.collect();
        this.mine = await online.myHelpRequests();
        this.checkedOld = !visiting.active;
      }
      const list = ids.length ? await online.friendHelpRequests(ids) : [];
      this.friendReqs = list.filter((r) => needOf(r) > 0 && r.requester.id !== online.me()?.id);
      this.announce();
      this.loaded = true;
      if (!visiting.active) {
        await this.sendQueued();
        await this.autoHelp();
        this.sendSummary();
      }
    } catch { /* this.error explains; the next poll tries again */ }
    this.changed();
  }

  /** Claim what friends sent and add it to the barn (exactly the fills the server hands over). */
  private async collect(): Promise<void> {
    const waiting = await online.myHelpFills();
    if (!waiting.length) return;
    const got = await online.claimHelpFills(waiting.map((f) => f.id));
    if (!got.length) return;
    const out: Arrival[] = [];
    for (const f of got) {
      game.addItem(f.item, f.qty);
      game.incStat('help_received', f.qty);
      out.push({ from: f.helper.name, item: f.item, qty: f.qty, auto: f.auto, requestDone: false });
    }
    saves.save();
    // a request is done when all of it arrived (the request list is refreshed right after this)
    const mine = await online.myHelpRequests().catch(() => this.mine);
    for (const a of out) a.requestDone = mine.some((r) => r.item === a.item && r.status === 'filled' && got.some((f) => f.request === r.id));
    for (const fn of this.arriveListeners) { try { fn(out); } catch (e) { console.error('[help arrive]', e); } }
  }

  /** Friends' new requests: a gentle toast (one summary on the first check). */
  private announce(): void {
    const fresh = this.friendReqs.filter((r) => !this.seenFriendReqs.has(r.id));
    for (const r of this.friendReqs) this.seenFriendReqs.add(r.id);
    if (!fresh.length || (this.state.auto && fresh.every((r) => this.spare(r.item) > 0))) { this.firstFriendPoll = false; return; }
    if (this.firstFriendPoll && fresh.length > 1) {
      game.bus.emit('toast', { title: 'Friends need a hand', sub: `${fresh.length} requests are waiting in Friends.`, icon: 'hug' });
    } else {
      const r = fresh[0];
      game.bus.emit('toast', { title: `${r.requester.name} needs a hand`, sub: `${needOf(r)} ${ITEMS[r.item]?.name ?? r.item} - open Friends to send some.`, icon: 'hug' });
    }
    this.firstFriendPoll = false;
  }

  private async sendQueued(): Promise<void> {
    for (const [id, qty] of [...this.queued]) {
      this.queued.delete(id);
      const r = this.friendReqs.find((x) => x.id === id);
      if (!r) continue;
      try {
        const res = await this.send(r, qty);
        game.bus.emit('toast', { title: `Sent ${res.sent} ${ITEMS[r.item]?.name ?? r.item} to ${r.requester.name}`, sub: res.coins ? `+${res.coins} coins thank-you` : 'Thank you for helping!', icon: 'hug' });
      } catch (e) { game.bus.emit('toast', { title: 'Not sent', sub: (e as Error).message, icon: 'info' }); }
    }
  }
}

/** Remove n of an item for sending, normal ones first. Returns how many of each quality left the barn. */
function take(item: string, n: number): [number, number, number] {
  const before = game.qualityCounts(item);
  game.addItem(item, -n);
  const after = game.qualityCounts(item);
  return [before[0] - after[0], before[1] - after[1], before[2] - after[2]];
}
/** Put back n of what take() removed, the best quality first (the server used the plainest ones). */
function giveBack(item: string, taken: [number, number, number], n: number): void {
  let left = n;
  for (const q of [2, 1, 0] as const) {
    const k = Math.min(left, taken[q]);
    if (k > 0) { game.addItem(item, k, undefined, q); taken[q] -= k; left -= k; }
  }
}

function waitText(ms: number): string {
  const m = Math.ceil(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** A backend refusal in plain words. */
function askError(e: unknown, item: string): string {
  const m = e instanceof Error ? e.message : String(e);
  if (m === 'too many open') return `You can have ${ASK.maxOpen} requests open at a time.`;
  if (m === 'asked recently') return `You asked for ${ITEMS[item]?.name ?? 'this'} not long ago. You can ask for it again after ${ASK.sameItemHours} hours.`;
  if (m === 'too many today') return `That is ${ASK.asksPerDay} requests today. You can ask again tomorrow.`;
  if (/^bad /.test(m)) return 'Friends cannot send this item.';
  return 'Could not reach the village. Check your internet and try again.';
}

export const help = new HelpSystem();
Object.assign(window as unknown as Record<string, unknown>, { __help: help });
