import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { Gift, LeaderboardKind, Listing, OnlineBackend, OnlineEvent, PlayerProfile, ProfileStats, PublicLook } from './types';
import { setOnlineStatus } from './Status';
import { weekKey } from './Weekly';

/**
 * Real online play on Supabase (see supabase/schema.sql and ONLINE.md).
 *
 * - Players sign in anonymously; the session is kept in localStorage so the same browser keeps the
 *   same farmer id and friend code.
 * - Reads go straight to the tables (row level security limits what each player can see).
 * - Every write is a Postgres function (RPC) that checks the caller and is atomic, so a listing sells
 *   once, a gift is claimed once and sale coins are collected once.
 * - New gifts and sales arrive through realtime when available, and through a light poll every
 *   30 seconds (only while someone is subscribed and the tab is visible) as a fallback.
 * - supabase-js is only downloaded when this backend is used (dynamic import), so practice mode
 *   keeps a small bundle.
 * - Network problems never throw into the game loop: calls reject, the caller catches, and the
 *   status switches to "Offline" until a call succeeds again.
 */

interface ProfileRow {
  id: string; code: string; name: string; farm_name: string | null; level: number; total_xp: number; farm_value: number;
  charm: number; weekly_xp: number; week_start: string; look: Partial<PublicLook> | null; updated_at: string;
}
interface GiftRow {
  id: string; from_id: string; from_name: string; to_id: string; items: Record<string, number> | null; coins: number;
  message: string | null; sent_at: string; claimed: boolean;
}
interface ListingRow {
  id: string; seller_id: string; seller_name: string; item: string; qty: number; price: number; listed_at: string;
  status: Listing['status']; buyer_id: string | null; buyer_name: string | null; sold_at: string | null; collected: boolean;
}
interface Result<T> { data: T | null; error: { message: string; code?: string } | null; status?: number }

const REQUEST_TIMEOUT = 15000;
const POLL_MS = 30000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ms = (t: string | null | undefined): number => (t ? Date.parse(t) || 0 : 0);
const int = (n: number, max: number): number => Math.max(0, Math.min(max, Math.floor(Number.isFinite(n) ? n : 0)));

/** Network-level failure (no answer from the server) as opposed to a refusal like 'sold'. */
class OfflineError extends Error {
  constructor(msg = 'offline') { super(msg); this.name = 'OfflineError'; }
}

/** fetch with a timeout, so a dead connection fails calmly instead of hanging forever. */
const timedFetch: typeof fetch = (input, init) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT);
  const outer = init?.signal;
  if (outer) {
    if (outer.aborted) ctrl.abort();
    else outer.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
};

export class SupabaseBackend implements OnlineBackend {
  readonly kind = 'supabase' as const;
  private client: SupabaseClient | null = null;
  private initP: Promise<void> | null = null;
  private uid = '';
  private mine: PlayerProfile | null = null;
  private subs = new Set<(e: OnlineEvent) => void>();
  private channel: RealtimeChannel | null = null;
  private realtimeOk = false;
  private pollTimer = 0;
  private polling = false;
  /** ids already announced, so realtime and polling never report the same gift or sale twice */
  private seenGifts = new Set<string>();
  private seenSales = new Set<string>();
  private seeded = false;
  private listingsTimer = 0;

  constructor(private url: string, private anonKey: string) {}

  // ------------------------------------------------------------------ connection
  init(): Promise<void> {
    this.initP ??= this.connect().catch((e) => { this.initP = null; throw this.fail(e); });
    return this.initP;
  }

  private async connect(): Promise<void> {
    if (!this.client) {
      const { createClient } = await import('@supabase/supabase-js');
      this.client = createClient(this.url, this.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'cozy-acres-online-auth' },
        global: { fetch: timedFetch },
        realtime: { params: { eventsPerSecond: 2 } },
      });
    }
    const sb = this.client;
    const { data: got, error: sessErr } = await sb.auth.getSession();
    let uid = got.session?.user.id ?? '';
    if (!uid) {
      if (sessErr) console.warn('[online] session', sessErr.message);
      const { data, error } = await sb.auth.signInAnonymously();
      if (error || !data.user) throw error ?? new Error('sign in failed');
      uid = data.user.id;
    }
    this.uid = uid;
    const row = this.check(await sb.from('profiles').select('*').eq('id', uid).maybeSingle() as Result<ProfileRow>);
    this.mine = row ? this.mapProfile(row) : null;
    this.ok();
    if (this.subs.size) this.startLive();
  }

  private db(): SupabaseClient {
    if (!this.client || !this.uid) throw new Error('not connected');
    return this.client;
  }

  /** Turn a supabase-js result into data or a thrown Error with a short message ('sold', 'claimed', ...). */
  private check<T>(r: Result<T>): T | null {
    if (r.error) {
      // status 0 = the request never reached the server (offline, timeout, blocked)
      if (!r.status || r.status >= 500) throw this.fail(new OfflineError(r.error.message));
      throw new Error(r.error.message);
    }
    this.ok();
    return r.data;
  }
  private must<T>(r: Result<T>): T {
    const d = this.check(r);
    if (d === null || d === undefined) throw new Error('not found');
    return d;
  }
  private ok(): void { setOnlineStatus('online'); }
  private fail(e: unknown): Error {
    const err = e instanceof Error ? e : new Error(String((e as { message?: string })?.message ?? e));
    const msg = err.message.toLowerCase();
    if (err instanceof OfflineError || err.name === 'AuthRetryableFetchError' || /fetch|network|abort|load failed|timeout/.test(msg)) setOnlineStatus('offline');
    return err;
  }
  private async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    await this.init();
    try {
      return this.must(await this.db().rpc(fn, args) as Result<T>);
    } catch (e) { throw this.fail(e); }
  }
  private async query<T>(run: (sb: SupabaseClient) => PromiseLike<Result<T>>): Promise<T | null> {
    await this.init();
    try {
      return this.check(await run(this.db()));
    } catch (e) { throw this.fail(e); }
  }

  // ------------------------------------------------------------------ mapping
  private mapProfile(r: ProfileRow): PlayerProfile {
    const l = r.look ?? {};
    return {
      id: r.id, code: r.code, name: r.name, farmName: r.farm_name ?? undefined, level: r.level, totalXp: Number(r.total_xp) || 0,
      farmValue: Number(r.farm_value) || 0, charm: r.charm,
      // a profile last published in an earlier week has no XP this week
      weeklyXp: r.week_start === weekKey() ? r.weekly_xp : 0,
      look: { body: l.body ?? 'female-b', skin: l.skin ?? '#f6c9a0', hair: l.hair ?? '#8a5a33', top: l.top ?? '#3fa9f5', bottom: l.bottom ?? '#8a5528', hat: l.hat ?? 'none' },
      updatedAt: ms(r.updated_at),
    };
  }
  private mapGift(r: GiftRow): Gift {
    return { id: r.id, from: { id: r.from_id, name: r.from_name }, to: r.to_id, items: r.items ?? {}, coins: r.coins, message: r.message ?? undefined, sentAt: ms(r.sent_at), claimed: r.claimed };
  }
  private mapListing(r: ListingRow): Listing {
    return {
      id: r.id, seller: { id: r.seller_id, name: r.seller_name }, item: r.item, qty: r.qty, price: r.price, listedAt: ms(r.listed_at), status: r.status,
      buyer: r.buyer_id ? { id: r.buyer_id, name: r.buyer_name ?? 'Farmer' } : undefined, soldAt: r.sold_at ? ms(r.sold_at) : undefined, collected: r.collected,
    };
  }

  // ------------------------------------------------------------------ profiles
  me(): PlayerProfile | null { return this.mine; }

  async upsertProfile(s: ProfileStats): Promise<PlayerProfile> {
    const row = await this.rpc<ProfileRow>('upsert_profile', {
      p_name: s.name, p_farm_name: s.farmName ?? null, p_level: int(s.level, 999), p_total_xp: int(s.totalXp, 1e12),
      p_farm_value: int(s.farmValue, 1e12), p_charm: int(s.charm, 1e7), p_weekly_xp: int(s.weeklyXp, 1e9), p_look: s.look,
    });
    this.mine = this.mapProfile(row);
    this.emit({ type: 'profiles' });
    return this.mine;
  }

  async findByCode(code: string): Promise<PlayerProfile | null> {
    const want = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (want.length !== 6) return null;
    const row = await this.query((sb) => sb.from('profiles').select('*').eq('code', `${want.slice(0, 3)}-${want.slice(3)}`).maybeSingle() as PromiseLike<Result<ProfileRow>>);
    return row ? this.mapProfile(row) : null;
  }

  async getProfiles(ids: string[]): Promise<PlayerProfile[]> {
    const valid = [...new Set(ids.filter((id) => UUID.test(id)))].slice(0, 100);
    if (!valid.length) return [];
    const rows = await this.query((sb) => sb.from('profiles').select('*').in('id', valid) as PromiseLike<Result<ProfileRow[]>>);
    return (rows ?? []).map((r) => this.mapProfile(r));
  }

  async leaderboard(kind: LeaderboardKind, limit: number): Promise<PlayerProfile[]> {
    const n = Math.max(1, Math.min(100, Math.floor(limit) || 20));
    const rows = await this.query((sb) => {
      let q = sb.from('profiles').select('*');
      if (kind === 'level') q = q.order('level', { ascending: false }).order('total_xp', { ascending: false });
      else if (kind === 'farmValue') q = q.order('farm_value', { ascending: false });
      else if (kind === 'charm') q = q.order('charm', { ascending: false }).order('total_xp', { ascending: false });
      else q = q.eq('week_start', weekKey()).order('weekly_xp', { ascending: false });
      return q.limit(n) as PromiseLike<Result<ProfileRow[]>>;
    });
    return (rows ?? []).map((r) => this.mapProfile(r));
  }

  // ------------------------------------------------------------------ gifts
  async sendGift(to: string, items: Record<string, number>, coins: number, message?: string): Promise<Gift> {
    const g = this.mapGift(await this.rpc<GiftRow>('send_gift', { p_to: to, p_items: items, p_coins: int(coins, 100000), p_message: message?.slice(0, 140) ?? null }));
    return g;
  }

  async inbox(): Promise<Gift[]> {
    const rows = await this.query((sb) => sb.from('gifts').select('*').eq('to_id', this.uid).eq('claimed', false).order('sent_at', { ascending: false }).limit(100) as PromiseLike<Result<GiftRow[]>>);
    return (rows ?? []).map((r) => this.mapGift(r));
  }

  async claimGift(id: string): Promise<Gift> { return this.mapGift(await this.rpc<GiftRow>('claim_gift', { p_id: id })); }

  // ------------------------------------------------------------------ market
  async listItem(item: string, qty: number, price: number): Promise<Listing> {
    const l = this.mapListing(await this.rpc<ListingRow>('list_item', { p_item: item, p_qty: Math.floor(qty), p_price: Math.floor(price) }));
    this.emit({ type: 'listings' });
    return l;
  }

  async browse(opts: { item?: string; limit?: number } = {}): Promise<Listing[]> {
    const n = Math.max(1, Math.min(100, opts.limit ?? 60));
    const rows = await this.query((sb) => {
      let q = sb.from('listings').select('*').eq('status', 'open').neq('seller_id', this.uid);
      if (opts.item) q = q.eq('item', opts.item);
      return q.order('listed_at', { ascending: false }).limit(n) as PromiseLike<Result<ListingRow[]>>;
    });
    return (rows ?? []).map((r) => this.mapListing(r));
  }

  async myListings(): Promise<Listing[]> {
    const rows = await this.query((sb) => sb.from('listings').select('*').eq('seller_id', this.uid)
      .or('status.eq.open,and(status.eq.sold,collected.eq.false)').order('listed_at', { ascending: false }).limit(50) as PromiseLike<Result<ListingRow[]>>);
    return (rows ?? []).map((r) => this.mapListing(r));
  }

  async buy(id: string): Promise<Listing> {
    const l = this.mapListing(await this.rpc<ListingRow>('buy_listing', { p_id: id }));
    this.emit({ type: 'listings' });
    return l;
  }
  async cancel(id: string): Promise<Listing> {
    const l = this.mapListing(await this.rpc<ListingRow>('cancel_listing', { p_id: id }));
    this.emit({ type: 'listings' });
    return l;
  }
  async collect(id: string): Promise<Listing> { return this.mapListing(await this.rpc<ListingRow>('collect_listing', { p_id: id })); }

  // ------------------------------------------------------------------ live updates
  subscribe(cb: (e: OnlineEvent) => void): () => void {
    this.subs.add(cb);
    if (this.uid) this.startLive();
    return () => {
      this.subs.delete(cb);
      if (!this.subs.size) this.stopLive();
    };
  }

  private emit(e: OnlineEvent): void {
    for (const s of [...this.subs]) { try { s(e); } catch (err) { console.error('[online event]', err); } }
  }
  private emitListingsSoon(): void {
    if (this.listingsTimer) return;
    this.listingsTimer = window.setTimeout(() => { this.listingsTimer = 0; this.emit({ type: 'listings' }); }, 2000);
  }
  private announceGift(g: Gift): void {
    if (g.claimed || this.seenGifts.has(g.id)) return;
    this.seenGifts.add(g.id);
    this.emit({ type: 'gift', gift: g });
  }
  private announceSale(l: Listing): void {
    if (l.status !== 'sold' || l.collected || this.seenSales.has(l.id)) return;
    this.seenSales.add(l.id);
    this.emit({ type: 'sold', listing: l });
  }

  private startLive(): void {
    if (!this.client || !this.uid) return;
    if (!this.channel) {
      try {
        this.channel = this.client.channel(`cozy-${this.uid}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gifts', filter: `to_id=eq.${this.uid}` }, (p) => {
            if (this.seeded) this.announceGift(this.mapGift(p.new as GiftRow));
          })
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'listings', filter: `seller_id=eq.${this.uid}` }, (p) => {
            if (this.seeded) this.announceSale(this.mapListing(p.new as ListingRow));
          })
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'listings' }, () => this.emitListingsSoon())
          .subscribe((status) => { this.realtimeOk = status === 'SUBSCRIBED'; });
      } catch (e) {
        console.warn('[online] realtime unavailable, polling instead', e);
        this.channel = null;
      }
    }
    if (!this.pollTimer) {
      this.pollTimer = window.setInterval(() => void this.poll(), POLL_MS);
      document.addEventListener('visibilitychange', this.onVisible);
      void this.poll();
    }
  }

  private stopLive(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = 0; }
    document.removeEventListener('visibilitychange', this.onVisible);
    if (this.channel && this.client) void this.client.removeChannel(this.channel);
    this.channel = null;
    this.realtimeOk = false;
  }

  private onVisible = (): void => { if (!document.hidden) void this.poll(); };

  /**
   * Catch up on gifts and sales (also covers anything realtime missed). The first poll only
   * remembers what is already there: the game shows existing gifts when its panels open.
   */
  private async poll(): Promise<void> {
    if (this.polling || document.hidden || !this.subs.size) return;
    this.polling = true;
    try {
      const [gifts, mine] = await Promise.all([this.inbox(), this.myListings()]);
      if (!this.seeded) {
        gifts.forEach((g) => this.seenGifts.add(g.id));
        mine.filter((l) => l.status === 'sold').forEach((l) => this.seenSales.add(l.id));
        this.seeded = true;
      } else {
        gifts.forEach((g) => this.announceGift(g));
        mine.forEach((l) => this.announceSale(l));
      }
      if (!this.realtimeOk) this.emit({ type: 'listings' });
    } catch {
      // offline: status already shows it; try again next round
    } finally {
      this.polling = false;
    }
  }
}
