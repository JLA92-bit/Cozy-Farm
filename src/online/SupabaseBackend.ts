import type { RealtimeChannel, SupabaseClient, User } from '@supabase/supabase-js';
import type {
  AccountBackend, AccountInfo, AuthResult, CloudMeta, CloudRow, Gift, LeaderboardKind, Listing, OnlineBackend, OnlineEvent,
  PlayerProfile, ProfileStats, PublicLook,
} from './types';
import { setOnlineStatus } from './Status';
import { sanitizeSnapshot, type FarmSnapshot } from './FarmSnapshot';
import { weekKey } from './Weekly';

/**
 * Real online play on Supabase (see supabase/schema.sql and ONLINE.md).
 *
 * - Players sign in anonymously; the session is kept in localStorage so the same browser keeps the
 *   same farmer id and friend code.
 * - "Sign in with Google" links Google to that anonymous account (same id, so the profile, friend code,
 *   listings and gifts stay), or, when that Google account already has a farm, switches to it. Both
 *   use the PKCE redirect flow: the page leaves for Google and comes back with ?code=..., which
 *   connect() exchanges for a session before anything else. Google accounts can keep a cloud save.
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
interface CloudSaveRow {
  user_id: string; data: unknown; save_version: number | null; level: number | null; coins: number | null; updated_at: string; device: string | null;
}
interface FarmRow { data: unknown; updated_at: string }
interface Result<T> { data: T | null; error: { message: string; code?: string } | null; status?: number }

const REQUEST_TIMEOUT = 15000;
/** What the player was doing when the page left for Google (so the return knows how to finish). */
const INTENT_KEY = 'cozy-acres-auth-intent';
const INTENT_MAX_AGE = 30 * 60000;
/** URL parameters an OAuth return may carry; removed from the address bar once read. */
const AUTH_PARAMS = ['code', 'error', 'error_code', 'error_description', 'sb_flow_id', 'state'];
interface Intent { mode: 'link' | 'signin'; uid: string; at: number }
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

/** The page address to come back to after Google: this page without query or hash. */
const returnUrl = (): string => location.origin + location.pathname;

function readIntent(): Intent | null {
  try {
    const raw = localStorage.getItem(INTENT_KEY);
    const it = raw ? JSON.parse(raw) as Intent : null;
    return it && (it.mode === 'link' || it.mode === 'signin') && Date.now() - it.at < INTENT_MAX_AGE ? it : null;
  } catch { return null; }
}
function writeIntent(it: Intent | null): void {
  try { if (it) localStorage.setItem(INTENT_KEY, JSON.stringify(it)); else localStorage.removeItem(INTENT_KEY); } catch { /* blocked */ }
}

/** Public account details from a supabase user (email and name come from Google). */
function accountOf(u: User): AccountInfo {
  const google = u.identities?.find((i) => i.provider === 'google')?.identity_data ?? {};
  const meta = u.user_metadata ?? {};
  const str = (...v: unknown[]) => (v.find((x) => typeof x === 'string' && x) as string | undefined) ?? '';
  return {
    id: u.id,
    anonymous: !!u.is_anonymous,
    email: str(u.email, google.email, meta.email),
    name: str(meta.full_name, meta.name, google.full_name, google.name),
  };
}

export class SupabaseBackend implements OnlineBackend, AccountBackend {
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
  private user: AccountInfo | null = null;
  private accountSubs = new Set<(a: AccountInfo | null) => void>();
  private redirectChecked = false;
  private authResult: AuthResult | null = null;

  constructor(private url: string, private anonKey: string) {}

  // ------------------------------------------------------------------ connection
  init(): Promise<void> {
    this.initP ??= this.connect().catch((e) => { this.initP = null; throw this.fail(e); });
    return this.initP;
  }

  private async ensureClient(): Promise<SupabaseClient> {
    if (!this.client) {
      const { createClient } = await import('@supabase/supabase-js');
      this.client = createClient(this.url, this.anonKey, {
        // PKCE: Google sends the page back with ?code=..., exchanged in handleRedirect (not automatically)
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce', storageKey: 'cozy-acres-online-auth' },
        global: { fetch: timedFetch },
        realtime: { params: { eventsPerSecond: 2 } },
      });
      // keep the account details fresh (e.g. after a token refresh). Never call supabase from inside this callback.
      this.client.auth.onAuthStateChange((event, session) => {
        if (session?.user && session.user.id === this.uid && event !== 'SIGNED_OUT') this.setUser(session.user);
      });
    }
    return this.client;
  }

  private async connect(): Promise<void> {
    const sb = await this.ensureClient();
    if (!this.redirectChecked) {
      this.redirectChecked = true;
      await this.handleRedirect(sb);
    }
    const { data: got, error: sessErr } = await sb.auth.getSession();
    let user = got.session?.user ?? null;
    // a failed session read (offline, server trouble) must not replace the stored account with a new one
    if (sessErr) throw new OfflineError(sessErr.message);
    if (!user) {
      const { data, error } = await sb.auth.signInAnonymously();
      if (error || !data.user) throw error ?? new Error('sign in failed');
      user = data.user;
    }
    this.uid = user.id;
    this.setUser(user);
    const row = this.check(await sb.from('profiles').select('*').eq('id', this.uid).maybeSingle() as Result<ProfileRow>);
    this.mine = row ? this.mapProfile(row) : null;
    this.ok();
    if (this.subs.size) this.startLive();
  }

  /**
   * Finish a Google sign-in when the page comes back from it: exchange ?code= for a session, or read
   * the error. When Google is already linked to another farm account, linking is not possible, so
   * sign in to that account instead (one more trip to Google, usually instant). Cleans the address bar.
   */
  private async handleRedirect(sb: SupabaseClient): Promise<void> {
    const url = new URL(location.href);
    const p: Record<string, string> = {};
    try { new URLSearchParams(url.hash.slice(1)).forEach((v, k) => { p[k] = v; }); } catch { /* not params */ }
    url.searchParams.forEach((v, k) => { p[k] = v; });
    const code = url.searchParams.get('code');
    if (!code && !p.error && !p.error_code) return;
    const intent = readIntent();
    writeIntent(null);
    for (const k of AUTH_PARAMS) url.searchParams.delete(k);
    if (p.error || p.error_code || p.access_token) url.hash = '';
    try { history.replaceState(history.state, '', url.toString()); } catch { /* sandboxed */ }
    // a ?code= we did not ask for (no sign-in was started from this game) is left alone
    if (!intent) return;
    if (code) {
      const { data, error } = await sb.auth.exchangeCodeForSession(code);
      if (error || !data.user) {
        console.warn('[online] Google sign-in could not be finished', error);
        this.authResult = { kind: 'error', message: error?.message ?? 'sign in failed' };
        return;
      }
      this.authResult = { kind: intent.mode === 'link' ? 'linked' : 'signedIn', switched: !!intent.uid && data.user.id !== intent.uid };
      return;
    }
    const desc = p.error_description ?? '';
    if (intent.mode === 'link' && (p.error_code === 'identity_already_exists' || /already (linked|exists|registered)/i.test(desc))) {
      writeIntent({ mode: 'signin', uid: intent.uid, at: Date.now() });
      const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: returnUrl() } });
      if (!error) return; // leaving for Google again
      writeIntent(null);
      this.authResult = { kind: 'error', message: error.message };
      return;
    }
    this.authResult = p.error === 'access_denied' ? { kind: 'cancelled' } : { kind: 'error', message: desc || p.error || p.error_code || 'sign in failed' };
  }

  private setUser(u: User): void {
    const a = accountOf(u);
    const prev = this.user;
    this.user = a;
    if (!prev || prev.id !== a.id || prev.anonymous !== a.anonymous || prev.email !== a.email || prev.name !== a.name) this.emitAccount();
  }
  private emitAccount(): void {
    for (const fn of [...this.accountSubs]) { try { fn(this.user); } catch (e) { console.error('[online account]', e); } }
  }

  // ------------------------------------------------------------------ account (AccountBackend)
  account(): AccountInfo | null { return this.user; }
  onAccount(cb: (a: AccountInfo | null) => void): () => void { this.accountSubs.add(cb); return () => { this.accountSubs.delete(cb); }; }
  takeAuthResult(): AuthResult | null { const r = this.authResult; this.authResult = null; return r; }

  /** Is the server reachable? Checked before leaving for Google, so an offline tap shows a message instead of a browser error page. */
  private async reachable(): Promise<void> {
    if (!navigator.onLine) throw this.fail(new OfflineError());
    try {
      await timedFetch(`${this.url.replace(/\/+$/, '')}/auth/v1/health`, { headers: { apikey: this.anonKey } });
    } catch (e) { throw this.fail(new OfflineError((e as Error)?.message)); }
  }

  async signInWithGoogle(): Promise<void> {
    const sb = await this.ensureClient();
    await this.reachable();
    const redirectTo = returnUrl();
    let current: User | null = null;
    if (this.uid || (await sb.auth.getSession()).data.session) {
      await this.init(); // also finishes any pending redirect and loads the profile
      current = (await sb.auth.getSession()).data.session?.user ?? null;
    }
    if (current && !current.is_anonymous) return; // already signed in with Google
    // keep the online identity (friend code, listings, gifts): link Google to this account
    if (current && this.mine) {
      writeIntent({ mode: 'link', uid: current.id, at: Date.now() });
      const { error } = await sb.auth.linkIdentity({ provider: 'google', options: { redirectTo } });
      if (!error) return; // leaving for Google
      writeIntent(null);
      if (error.code !== 'identity_already_exists' && error.code !== 'manual_linking_disabled') throw this.fail(error);
      // "Manual linking" off in Supabase, or Google already used by another farm: sign in to that account instead
      console.warn('[online] could not link Google to this account, signing in instead:', error.message);
    }
    writeIntent({ mode: 'signin', uid: current?.id ?? '', at: Date.now() });
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) { writeIntent(null); throw this.fail(error); }
  }

  async signOut(): Promise<void> {
    if (this.client) {
      // 'local': only this device. The session is removed even when the server cannot be reached.
      const { error } = await this.client.auth.signOut({ scope: 'local' });
      if (error) console.warn('[online] sign out', error.message);
    }
    this.stopLive();
    this.uid = '';
    this.mine = null;
    this.initP = null;
    this.user = null;
    this.seenGifts.clear();
    this.seenSales.clear();
    this.seeded = false;
    this.emitAccount();
  }

  async deleteAccount(): Promise<void> {
    await this.init();
    try {
      this.check(await this.db().rpc('delete_my_account') as Result<unknown>);
    } catch (e) { throw this.fail(e); }
    await this.signOut();
  }

  async loadCloud(): Promise<CloudRow | null> {
    await this.init();
    if (!this.user || this.user.anonymous) return null;
    const row = await this.query((sb) => sb.from('cloud_saves').select('*').eq('user_id', this.uid).maybeSingle() as PromiseLike<Result<CloudSaveRow>>);
    if (!row) return null;
    return {
      data: row.data, saveVersion: Number(row.save_version) || 0, level: Number(row.level) || 1, coins: Number(row.coins) || 0,
      updatedAt: row.updated_at, device: row.device ?? '',
    };
  }

  async saveCloud(data: object, meta: CloudMeta, base: string | null, force: boolean): Promise<string> {
    if (!this.user || this.user.anonymous) throw new Error('not signed in');
    return this.rpc<string>('save_cloud', {
      p_data: data, p_save_version: int(meta.saveVersion, 1e6), p_level: int(meta.level, 999), p_coins: int(meta.coins, 1e15),
      p_device: meta.device.slice(0, 60), p_base: base, p_force: force,
    });
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
  async publishFarm(snapshot: FarmSnapshot): Promise<void> {
    // the server also checks the size (64 KB) and shape; this just avoids sending what it would refuse
    if (JSON.stringify(snapshot).length > 65536) throw new Error('farm too big');
    await this.rpc<string>('publish_farm', { p_data: snapshot });
  }

  async getFarm(playerId: string): Promise<FarmSnapshot | null> {
    if (!UUID.test(playerId)) return null;
    const row = await this.query((sb) => sb.from('farm_snapshots').select('data, updated_at').eq('user_id', playerId).maybeSingle() as PromiseLike<Result<FarmRow>>);
    return row ? sanitizeSnapshot(row.data) : null;
  }

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
