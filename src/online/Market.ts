import { ECONOMY, ITEMS } from '../data';
import { game } from '../systems/Game';
import { online } from './Online';
import { ensureOnline } from './Profile';
import type { Listing, OnlineEvent } from './types';

/**
 * Shared market: players list goods from their barn, other players buy them.
 *
 * The game does the escrow (see the trust model in types.ts): items leave the barn before a listing
 * is created, coins leave the wallet before a buy, and both come back if the backend says no.
 * This module keeps a small cache of the last browse / my-listings results so the panel opens
 * instantly, polls lightly (every pollSec, on panel open and when the tab becomes visible) and never
 * runs on the frame loop.
 */
export const MARKET = ECONOMY.market;

export type MarketCat = 'all' | 'crop' | 'fruit' | 'animal' | 'goods' | 'feed';

/** Items that may be traded: known to this version of the game, worth something, not event tokens. */
export function tradable(item: string): boolean {
  const d = ITEMS[item];
  return !!d && d.sell > 0 && d.cat !== 'event';
}

/** Open listing slots at a player level. */
export function slotsFor(level: number): number {
  let n = 0;
  for (const [lv, s] of MARKET.slotsByLevel) if (level >= lv) n = s;
  return n;
}
/** Next level that adds a slot, or 0 when maxed. */
export function nextSlotLevel(level: number): number {
  for (const [lv] of MARKET.slotsByLevel) if (lv > level) return lv;
  return 0;
}

/** What the game itself pays for a stack (the barn price). */
export function gameValue(item: string, qty: number): number {
  return Math.round((ITEMS[item]?.sell ?? 0) * qty * ECONOMY.barn.sellMult);
}
/** Allowed total price range for a stack: [min, max, default, quick]. */
export function priceRange(item: string, qty: number): [number, number, number, number] {
  const v = (ITEMS[item]?.sell ?? 0) * qty;
  const min = Math.max(1, Math.round(v * MARKET.minPriceMult));
  const max = Math.max(min, Math.round(v * MARKET.maxPriceMult));
  const clamp = (x: number) => Math.max(min, Math.min(max, Math.round(x)));
  return [min, max, clamp(v * MARKET.defaultPriceMult), clamp(v * MARKET.quickPriceMult)];
}

/** Friendly message for a failed backend call. */
export function errorText(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (m === 'sold') return 'Someone else was quicker!';
  if (m === 'collected') return 'Those coins were already collected.';
  if (m === 'not found') return 'That listing is gone.';
  if (m === 'own listing') return 'That is your own listing.';
  return 'The market could not be reached. Please try again in a moment.';
}

type Listener = () => void;

class MarketService {
  /** Last results; null until the first successful load. */
  browseList: Listing[] | null = null;
  mine: Listing[] | null = null;
  /** true after a load failed (shown as "offline" in the panel) */
  failed = false;
  loading = false;
  private listeners = new Set<Listener>();
  private notified = new Set<string>();
  private firstLoad = true;
  private started = false;
  private lastPoll = 0;
  private pollTimer = 0;
  /** Shown once per session, the first time a load finds sales made while the game was closed. */
  onSold?: (sold: Listing[], whileAway: boolean) => void;

  get unlocked(): boolean { return game.level >= MARKET.level; }
  get practice(): boolean { return online.kind === 'local'; }
  get myId(): string { return online.me()?.id ?? ''; }

  /** Sold listings whose coins are waiting to be collected. */
  get soldCount(): number { return this.mine?.filter((l) => l.status === 'sold' && !l.collected).length ?? 0; }
  get openCount(): number { return this.mine?.filter((l) => l.status === 'open').length ?? 0; }
  get slots(): number { return slotsFor(game.level); }

  onChange(fn: Listener): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private changed(): void { for (const fn of this.listeners) fn(); }

  /** Starts background polling (once). Safe to call before the market is unlocked: it waits. */
  start(): void {
    if (this.started) return;
    this.started = true;
    online.subscribe((e) => this.onEvent(e));
    this.pollTimer = window.setInterval(() => { if (!document.hidden) void this.poll(); }, MARKET.pollSec * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void this.poll(); });
    void this.poll();
  }
  stop(): void { clearInterval(this.pollTimer); }

  private onEvent(e: OnlineEvent): void {
    if (!this.unlocked) return;
    if (e.type === 'sold' && e.listing.seller.id === this.myId) void this.refreshMine();
    else if (e.type === 'listings' || e.type === 'sold') {
      // someone (another tab or player) changed the market: refresh soon, but not in a burst
      if (this.listeners.size) void this.refresh();
    }
  }

  /** Light background poll: only my listings (for sale notifications), throttled. */
  async poll(force = false): Promise<void> {
    if (!this.unlocked) return;
    const now = Date.now();
    if (!force && now - this.lastPoll < 10000) return;
    this.lastPoll = now;
    await this.refreshMine();
  }

  /** Full refresh for the open panel: browse + my listings. */
  async refresh(): Promise<void> {
    if (!this.unlocked || this.loading) return;
    this.loading = true;
    this.changed();
    try {
      await ensureOnline();
      const [list] = await Promise.all([online.browse({ limit: 80 }), this.refreshMine(true)]);
      this.browseList = list.filter((l) => tradable(l.item) && l.seller.id !== this.myId).map(practicePrice);
      this.failed = false;
    } catch {
      this.failed = true;
    } finally {
      this.loading = false;
      this.changed();
    }
  }

  private async refreshMine(quiet = false): Promise<void> {
    try {
      await ensureOnline();
      if (this.practice) practiceNeighboursShop(game.now());
      const mine = await online.myListings();
      this.mine = mine;
      this.failed = false;
      const fresh = mine.filter((l) => l.status === 'sold' && !l.collected && !this.notified.has(l.id));
      for (const l of fresh) this.notified.add(l.id);
      if (fresh.length) this.onSold?.(fresh, this.firstLoad);
      this.firstLoad = false;
    } catch {
      if (!quiet) this.failed = true;
    }
    if (!quiet) this.changed();
  }

  // ------------------------------------------------------------------ actions (all do their own escrow)

  /** Lists items from the barn. Returns the listing, or an error message. */
  async list(item: string, qty: number, price: number): Promise<Listing | string> {
    if (!this.unlocked) return `The market opens at level ${MARKET.level}.`;
    if (!tradable(item)) return 'That cannot be sold at the market.';
    qty = Math.floor(qty);
    if (qty < 1 || qty > MARKET.maxQty) return `You can list 1 to ${MARKET.maxQty} at a time.`;
    const [min, max] = priceRange(item, qty);
    price = Math.round(price);
    if (price < min || price > max) return `Pick a price from ${min} to ${max} coins.`;
    if (this.openCount >= this.slots) return 'All your market slots are in use.';
    if (game.count(item) < qty) return 'You do not have that many.';
    const fee = MARKET.listingFee;
    if (fee && !game.canAfford(fee)) return `Listing costs ${fee} coins.`;
    try { await ensureOnline(); } catch (e) { return errorText(e); }
    // escrow: take the goods (and fee) first, give them back if the market says no
    if (!game.take({ [item]: qty })) return 'You do not have that many.';
    if (fee) game.addCoins(-fee);
    try {
      const l = await online.listItem(item, qty, price);
      game.incStat('market_listed');
      this.mine = [l, ...(this.mine ?? [])];
      this.changed();
      return l;
    } catch (e) {
      game.addItem(item, qty);
      if (fee) game.addCoins(fee);
      return errorText(e);
    }
  }

  /** Buys a listing: coins first, items after. Returns the listing or an error message. */
  async buy(l: Listing): Promise<Listing | string> {
    if (!this.unlocked) return `The market opens at level ${MARKET.level}.`;
    if (!tradable(l.item)) return 'This game version does not know that item yet.';
    if (!game.canAfford(l.price)) return `You need ${l.price - game.coins} more coins.`;
    try { await ensureOnline(); } catch (e) { return errorText(e); }
    if (!game.spend(l.price)) return 'Not enough coins.';
    try {
      const done = await online.buy(l.id);
      game.addItem(l.item, l.qty);
      game.incStat('market_buys');
      game.incStat('market_items_bought', l.qty);
      if (this.browseList) this.browseList = this.browseList.filter((x) => x.id !== l.id);
      this.changed();
      return done;
    } catch (e) {
      // refund: the listing sold to someone else (or the market is unreachable)
      game.addCoins(l.price);
      const gone = ['sold', 'not found'].includes((e as Error)?.message);
      if (gone && this.browseList) this.browseList = this.browseList.filter((x) => x.id !== l.id);
      this.changed();
      return errorText(e);
    }
  }

  /** Takes an open listing back; the goods return to the barn. */
  async cancel(l: Listing): Promise<true | string> {
    try {
      await ensureOnline();
      await online.cancel(l.id);
      game.addItem(l.item, l.qty);
      if (this.mine) this.mine = this.mine.filter((x) => x.id !== l.id);
      this.changed();
      return true;
    } catch (e) {
      // it may have just sold: show the sale instead
      await this.refreshMine();
      return (e as Error)?.message === 'sold' ? 'It just sold! Collect your coins.' : errorText(e);
    }
  }

  /** Collects the coins of a sold listing (exactly once). Returns the coins or an error message. */
  async collect(l: Listing): Promise<number | string> {
    try {
      await ensureOnline();
      await online.collect(l.id);
    } catch (e) {
      await this.refreshMine();
      return errorText(e);
    }
    if (this.mine) this.mine = this.mine.filter((x) => x.id !== l.id);
    game.addCoins(l.price);
    game.incStat('market_sales');
    game.incStat('market_items_sold', l.qty);
    this.changed();
    return l.price;
  }
}

export const market = new MarketService();

// ====================================================================== practice mode only
/**
 * Demo neighbour goods are restocked for free, so in practice mode they never sell below the barn
 * value (x practiceSellMinMult): otherwise they could be flipped at the barn for endless coins.
 * The price shown is the price charged; the practice backend does not check prices on buy.
 */
function practicePrice(l: Listing): Listing {
  if (online.kind !== 'local' || !l.seller.id.startsWith('bot_')) return l;
  const min = Math.ceil(gameValue(l.item, l.qty) * MARKET.practiceSellMinMult);
  return l.price >= min ? l : { ...l, price: min };
}

/**
 * In practice mode there are no other real players, so demo neighbours buy your fairly priced goods
 * after a few minutes (cheaper sells sooner). This writes straight into the practice backend's own
 * browser storage and never runs for the real online backend.
 */
const PRACTICE_DB = 'cozy-acres-online-local';
interface PracticeDb { profiles: { id: string; name: string; bot?: boolean }[]; listings: Listing[] }

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

/** When a demo neighbour will buy this listing (ms timestamp), or 0 if they think it is too pricey. */
export function practiceBuyAt(l: Listing): number {
  const p = MARKET.practiceBuy;
  const value = (ITEMS[l.item]?.sell ?? 0) * l.qty;
  if (value <= 0) return 0;
  const ratio = l.price / value;
  if (ratio > p.maxPriceMult + 1e-6) return 0;
  const t = Math.max(0, (ratio - MARKET.minPriceMult) / Math.max(0.01, p.maxPriceMult - MARKET.minPriceMult));
  const sec = (p.minSec + (p.maxSec - p.minSec) * t) * (0.8 + hash01(l.id) * 0.4);
  return l.listedAt + sec * 1000;
}

/** Highest total price demo neighbours will pay for a stack. */
export function practiceMaxPrice(item: string, qty: number): number {
  return Math.floor((ITEMS[item]?.sell ?? 0) * qty * MARKET.practiceBuy.maxPriceMult + 1e-6);
}

function practiceNeighboursShop(now: number): void {
  if (online.kind !== 'local') return;
  const me = online.me()?.id;
  if (!me) return;
  let db: PracticeDb;
  try {
    const raw = localStorage.getItem(PRACTICE_DB);
    if (!raw) return;
    db = JSON.parse(raw) as PracticeDb;
  } catch { return; }
  if (!Array.isArray(db.listings) || !Array.isArray(db.profiles)) return;
  const bots = db.profiles.filter((p) => p.bot);
  if (!bots.length) return;
  let dirty = false;
  for (const l of db.listings) {
    if (l.seller.id !== me || l.status !== 'open') continue;
    const at = practiceBuyAt(l);
    if (!at || now < at) continue;
    const b = bots[Math.floor(hash01(`${l.id}b`) * bots.length)];
    l.status = 'sold';
    l.buyer = { id: b.id, name: b.name };
    l.soldAt = Math.min(now, Date.now());
    dirty = true;
  }
  if (dirty) try { localStorage.setItem(PRACTICE_DB, JSON.stringify(db)); } catch { /* full or blocked */ }
}
