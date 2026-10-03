import { ECONOMY, ITEMS } from '../data';
import { game } from './Game';
import { saves } from './Save';
import { localDay } from './Progression';
import type { FriendEntry, SocialState } from './State';
import { online } from '../online/Online';
import { ensureOnline } from '../online/Profile';
import type { Gift, PlayerProfile } from '../online/types';
import { decodeGift, encodeGift, newNonce, type GiftCodeData } from './GiftCode';

export const SOCIAL = ECONOMY.social;

/** A gift's contents after limits and unknown items are removed. */
export interface GiftContents { items: Record<string, number>; coins: number }

/**
 * Friends and gifts. Items and coins live in the local save, so sending works as escrow: they
 * leave the barn first and come back if the send fails. Receiving polls the mailbox lightly
 * (every ~25 s while visible, on return and when the panel opens), never on the frame loop.
 */
class Social {
  inbox: Gift[] = [];
  /** last connection problem, shown in the panel ('' = fine) */
  error = '';
  private listeners = new Set<() => void>();
  private known = new Set<string>();
  private firstPoll = true;
  private polling: Promise<void> | null = null;
  private started = false;
  private botTimer = 0;
  /** a gift code from a ?gift= link, waiting for the farm to be ready */
  pendingCode: string | null = null;

  get state(): SocialState { return game.state.social; }
  get practice(): boolean { return online.kind === 'local'; }
  get mailCount(): number { return this.inbox.length; }
  /** Friends and gifts open once the farmer is made and the tutorial is done. */
  get available(): boolean { return game.state.player.created && game.state.tutorial.done; }

  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private changed(): void { for (const fn of this.listeners) fn(); }

  /** Wire polling, live events and ?gift= links. Called once after boot. */
  start(): void {
    if (this.started) return;
    this.started = true;
    try {
      const url = new URL(location.href);
      const code = url.searchParams.get('gift');
      if (code) {
        this.pendingCode = code;
        url.searchParams.delete('gift');
        history.replaceState(history.state, '', url.pathname + url.search + url.hash);
      }
    } catch { /* no location (tests) */ }
    window.setInterval(() => { if (!document.hidden) void this.poll(); }, SOCIAL.pollSec * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void this.poll(); });
    setTimeout(() => void this.poll(), 2500);
  }

  private subscribed = false;
  private subscribe(): void {
    if (this.subscribed) return;
    this.subscribed = true;
    online.subscribe((e) => {
      if (e.type === 'gift' && e.gift.to === online.me()?.id) void this.poll();
    });
  }

  // ------------------------------------------------------------------ daily limits
  private sentToday(): SocialState['sent'] {
    const day = localDay(game.now());
    if (this.state.sent.day !== day) this.state.sent = { day, gifts: 0, coins: 0 };
    return this.state.sent;
  }
  giftsLeft(): number { return Math.max(0, SOCIAL.giftsPerDay - this.sentToday().gifts); }
  /** Most coins that can go into one more gift right now. */
  coinsLeft(): number {
    return Math.max(0, Math.min(SOCIAL.maxCoinsPerGift, SOCIAL.maxCoinsPerDay - this.sentToday().coins, game.coins));
  }
  /** Why this gift cannot be sent, or null when it is fine. */
  check(items: Record<string, number>, coins: number): string | null {
    const stacks = Object.values(items).filter((n) => n > 0).length;
    const units = Object.values(items).reduce((s, n) => s + n, 0);
    if (!units && coins <= 0) return 'Pick something to give first.';
    if (!this.giftsLeft()) return `That is ${SOCIAL.giftsPerDay} gifts today - more tomorrow!`;
    if (stacks > SOCIAL.maxStacksPerGift) return `Up to ${SOCIAL.maxStacksPerGift} kinds of items per gift.`;
    if (units > SOCIAL.maxItemsPerGift) return `Up to ${SOCIAL.maxItemsPerGift} items per gift.`;
    if (coins > this.coinsLeft()) return 'That is more coins than you can give right now.';
    if (!game.has(items)) return 'You do not have all of those items any more.';
    return null;
  }

  // ------------------------------------------------------------------ escrow
  private escrow(items: Record<string, number>, coins: number): void {
    for (const [k, n] of Object.entries(items)) if (n > 0) game.addItem(k, -n);
    if (coins > 0) {
      game.state.player.coins = Math.max(0, game.state.player.coins - coins);
      game.bus.emit('coins', { delta: -coins, total: game.state.player.coins });
    }
  }
  private refund(items: Record<string, number>, coins: number): void {
    for (const [k, n] of Object.entries(items)) if (n > 0) game.addItem(k, n);
    if (coins > 0) {
      game.state.player.coins += coins;
      game.bus.emit('coins', { delta: coins, total: game.state.player.coins });
    }
  }
  private count(coins: number): void {
    const s = this.sentToday();
    s.gifts++;
    s.coins += coins;
    game.incStat('gifts_sent');
  }

  // ------------------------------------------------------------------ friends
  async connect(): Promise<PlayerProfile> {
    try {
      const me = await ensureOnline();
      this.subscribe();
      this.error = '';
      return me;
    } catch (e) {
      this.error = 'Could not reach the village right now.';
      throw e;
    }
  }

  isFriend(id: string): boolean { return this.state.friends.some((f) => f.id === id); }

  async addFriend(code: string): Promise<FriendEntry> {
    const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length < 4) throw new Error('That code looks too short. Codes look like ABC-123.');
    const me = await this.connect();
    if (me.code.replace(/[^A-Z0-9]/g, '') === clean) throw new Error('That is your own friend code!');
    if (this.state.friends.length >= SOCIAL.maxFriends) throw new Error(`Your friend list is full (${SOCIAL.maxFriends}).`);
    const p = await online.findByCode(clean);
    if (!p) throw new Error('No farmer found with that code. Check it and try again.');
    return this.addProfile(p);
  }
  addProfile(p: PlayerProfile): FriendEntry {
    const have = this.state.friends.find((f) => f.id === p.id);
    if (have) throw new Error(`${p.name} is already your friend.`);
    const f: FriendEntry = { id: p.id, name: p.name, code: p.code, addedAt: game.now() };
    this.state.friends.push(f);
    game.incStat('friends_added');
    saves.save();
    this.changed();
    return f;
  }
  removeFriend(id: string): void {
    this.state.friends = this.state.friends.filter((f) => f.id !== id);
    saves.save();
    this.changed();
  }
  /** Fresh public profiles of all friends (also refreshes their stored names). */
  async friendProfiles(): Promise<Map<string, PlayerProfile>> {
    await this.connect();
    const list = await online.getProfiles(this.state.friends.map((f) => f.id));
    const map = new Map(list.map((p) => [p.id, p]));
    for (const f of this.state.friends) { const p = map.get(f.id); if (p) { f.name = p.name; f.code = p.code; } }
    return map;
  }

  // ------------------------------------------------------------------ sending
  async send(friend: FriendEntry, items: Record<string, number>, coins: number, message: string): Promise<void> {
    const why = this.check(items, coins);
    if (why) throw new Error(why);
    const msg = message.trim().slice(0, SOCIAL.messageMax) || undefined;
    this.escrow(items, coins);
    try {
      await this.connect();
      await online.sendGift(friend.id, { ...items }, coins, msg);
    } catch (e) {
      this.refund(items, coins);
      throw new Error(e instanceof Error && e.message === 'unknown player' ? `${friend.name} could not be found any more.` : 'The gift could not be sent, so it is back in your barn.');
    }
    this.count(coins);
    saves.save();
    if (this.practice && friend.id.startsWith('bot_')) this.scheduleBotGift(friend.id);
    this.changed();
  }

  /** Pack a gift into a shareable code. Items leave the barn now (anyone holding the code can claim it once). */
  makeCode(items: Record<string, number>, coins: number, message: string): string {
    const why = this.check(items, coins);
    if (why) throw new Error(why);
    const nonce = newNonce();
    const code = encodeGift({ from: game.state.player.name, items: { ...items }, coins, message: message.trim().slice(0, SOCIAL.messageMax) || undefined, nonce, at: game.now() });
    this.escrow(items, coins);
    this.count(coins);
    this.state.madeCodes.push(nonce);
    if (this.state.madeCodes.length > 300) this.state.madeCodes.splice(0, this.state.madeCodes.length - 300);
    saves.save();
    this.changed();
    return code;
  }

  // ------------------------------------------------------------------ receiving
  /** Only known items, and never more than one gift may hold. */
  clamp(items: Record<string, number>, coins: number): GiftContents {
    const out: Record<string, number> = {};
    let left = SOCIAL.maxItemsPerGift;
    for (const [k, n] of Object.entries(items)) {
      if (!ITEMS[k] || !(n > 0) || left <= 0) continue;
      const q = Math.min(Math.floor(n), left);
      out[k] = q;
      left -= q;
    }
    return { items: out, coins: Math.max(0, Math.min(SOCIAL.maxCoinsPerGift, Math.floor(coins) || 0)) };
  }
  private grant(c: GiftContents): void {
    for (const [k, n] of Object.entries(c.items)) game.addItem(k, n);
    if (c.coins) game.addCoins(c.coins);
    game.incStat('gifts_received');
  }

  /** Claim a mailbox gift (atomic on the backend: a gift can only be claimed once). */
  async claim(id: string): Promise<GiftContents & { from: string }> {
    await this.connect();
    let g: Gift;
    try { g = await online.claimGift(id); } catch (e) {
      this.inbox = this.inbox.filter((x) => x.id !== id);
      this.changed();
      throw new Error((e as Error).message === 'claimed' ? 'That gift was already opened.' : 'That gift could not be opened. Try again later.');
    }
    const c = this.clamp(g.items, g.coins);
    this.grant(c);
    this.inbox = this.inbox.filter((x) => x.id !== id);
    saves.save();
    this.changed();
    return { ...c, from: g.from.name };
  }

  /** Check a pasted code without claiming it. */
  peekCode(text: string): { ok: GiftCodeData } | { error: string } {
    const d = decodeGift(text);
    if (!d) return { error: 'That code does not look right. Check it was copied in full.' };
    if (this.state.madeCodes.includes(d.nonce)) return { error: 'That is a gift code you made. Share it with a friend!' };
    if (this.state.claimedCodes.includes(d.nonce)) return { error: 'You already opened this gift.' };
    const c = this.clamp(d.items, d.coins);
    if (!Object.keys(c.items).length && !c.coins) return { error: 'That gift is empty.' };
    return { ok: d };
  }
  claimCode(text: string): GiftContents & { from: string; message?: string } {
    const r = this.peekCode(text);
    if ('error' in r) throw new Error(r.error);
    const d = r.ok;
    const c = this.clamp(d.items, d.coins);
    this.state.claimedCodes.push(d.nonce);
    if (this.state.claimedCodes.length > 300) this.state.claimedCodes.splice(0, this.state.claimedCodes.length - 300);
    this.grant(c);
    saves.save();
    this.changed();
    return { ...c, from: d.from, message: d.message };
  }

  // ------------------------------------------------------------------ mailbox polling
  /** Fetch the mailbox; toasts for new gifts. Safe to call often (calls are merged). */
  poll(): Promise<void> {
    if (!this.available || !game.state) return Promise.resolve();
    this.polling ??= this.doPoll().finally(() => { this.polling = null; });
    return this.polling;
  }
  private async doPoll(): Promise<void> {
    try {
      await this.connect();
      const list = await online.inbox();
      const fresh = list.filter((g) => !this.known.has(g.id));
      for (const g of list) this.known.add(g.id);
      this.inbox = list;
      if (fresh.length) {
        if (this.firstPoll) game.bus.emit('toast', { title: 'You have mail!', sub: fresh.length > 1 ? `${fresh.length} gifts are waiting in your mailbox.` : `A gift from ${fresh[0].from.name} is waiting.`, icon: 'mailbox' });
        else for (const g of fresh.slice(0, 2)) game.bus.emit('toast', { title: `Gift from ${g.from.name}!`, sub: 'Open Friends to claim it.', icon: 'gift' });
        game.bus.emit('sfx', { name: 'jingle' });
      }
      this.firstPoll = false;
      this.maybeBotGift();
      this.changed();
    } catch { this.changed(); }
  }

  // ------------------------------------------------------------------ practice mode thank-you gifts
  /** At most once a day a demo neighbour you are friends with (or just gave to) sends a small gift. */
  private maybeBotGift(): void {
    if (!this.practice) return;
    const bot = this.state.friends.find((f) => f.id.startsWith('bot_'));
    if (bot) this.scheduleBotGift(bot.id);
  }
  private scheduleBotGift(botId: string): void {
    const day = localDay(game.now());
    if (!this.practice || this.botTimer || this.state.botGiftDay === day) return;
    this.botTimer = window.setTimeout(() => {
      this.botTimer = 0;
      if (this.state.botGiftDay === localDay(game.now())) return;
      this.state.botGiftDay = localDay(game.now());
      const bg = SOCIAL.botGift;
      const pool = bg.items.filter((i) => ITEMS[i]);
      const item = pool[Math.floor(Math.random() * pool.length)];
      const qty = bg.qty[0] + Math.floor(Math.random() * (bg.qty[1] - bg.qty[0] + 1));
      const coins = bg.coins[0] + Math.floor(Math.random() * (bg.coins[1] - bg.coins[0] + 1));
      const notes = ['Thank you, neighbour! Here is a little something.', 'Fresh from my farm - enjoy!', 'For my favourite neighbour.', 'Saw this and thought of you!'];
      const backend = online as unknown as { botGift?: (id: string, items: Record<string, number>, coins: number, msg?: string) => Promise<Gift> };
      void backend.botGift?.(botId, item ? { [item]: qty } : {}, coins, notes[Math.floor(Math.random() * notes.length)])
        .then(() => this.poll()).catch(() => { /* demo only */ });
    }, SOCIAL.botGift.delaySec * 1000);
  }
}

export const social = new Social();
