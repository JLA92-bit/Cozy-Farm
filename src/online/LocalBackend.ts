import { HELP_NOTES, type FarmHelp, type FarmHelpKind, type FarmHelpStatus, type FarmHelpTarget, type Gift, type LeaderboardKind, type Listing, type OnlineBackend, type OnlineEvent, type PlayerProfile, type ProfileStats, type RewardCode, type AdminGift, type HelpFill, type HelpReason, type HelpRequest } from './types';
import { ASK, HELP_REASONS, cleanFill, cleanRequest } from './AskHelp';
import { botFarm } from './BotFarms';
import { helpKindFor } from './FarmHelp';
import { sanitizeSnapshot, type FarmSnapshot } from './FarmSnapshot';

/**
 * Practice backend: a tiny "server" kept in this browser's localStorage, shared by all tabs of the
 * game (BroadcastChannel tells the other tabs when something changes). It comes with a few demo
 * neighbours (marked bot) so the market and leaderboard are never empty. Used when no real
 * online backend is configured, and by the headless tests.
 */
const DB_KEY = 'cozy-acres-online-local';
const ID_KEY = 'cozy-acres-online-id';
/** Published farm snapshots of the players in this browser (practice mode), by player id. */
const FARMS_KEY = 'cozy-acres-online-farms';
/** Neighbour help and likes (practice mode): rows plus the UTC day demo neighbours last helped this player. */
const HELP_KEY = 'cozy-acres-online-help';
/** Same limits as the server (supabase/schema.sql help_farm / like_farm). */
export const HELP_LIMITS = { perOwnerPerDay: 50, keep: 400 };

interface HelpDb { rows: FarmHelp[]; seq: number; botDay: string }
/** Ask a friend (practice mode): requests with who may see them, fills, and when demo neighbours last asked. */
const ASK_KEY = 'cozy-acres-online-askhelp';
interface AskReq extends HelpRequest { audience: string[]; closedAt: number; hazel: boolean; bots: { bot: string; at: number; qty: number }[] }
interface AskFill extends HelpFill { requester: string; claimed: boolean }
interface AskDb { reqs: AskReq[]; fills: AskFill[]; seq: number; botAsked: Record<string, string> }
const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10);

interface Db { profiles: PlayerProfile[]; gifts: Gift[]; listings: Listing[]; seq: number; botsAt: number }

const BOTS: { name: string; level: number; charm: number; look: PlayerProfile['look'] }[] = [
  { name: 'Granny Mae', level: 14, charm: 420, look: { body: 'female-b', skin: '#ffe0c2', hair: '#f2e2b0', top: '#ff8fb4', bottom: '#3b3b45', hat: 'straw' } },
  { name: 'Farmer Joe', level: 9, charm: 160, look: { body: 'male-a', skin: '#f6c9a0', hair: '#5a3a22', top: '#e2533c', bottom: '#3fa9f5', hat: 'straw' } },
  { name: 'Priya', level: 21, charm: 880, look: { body: 'female-c', skin: '#a26a43', hair: '#2b2622', top: '#6cc644', bottom: '#f7f1e3', hat: 'none' } },
  { name: 'Old Tom', level: 5, charm: 60, look: { body: 'male-b', skin: '#c98a5e', hair: '#9aa5b1', top: '#8a5528', bottom: '#3b3b45', hat: 'none' } },
  { name: 'Luna', level: 31, charm: 1500, look: { body: 'female-f', skin: '#e8b38a', hair: '#a77bf3', top: '#3b3b45', bottom: '#ff8fb4', hat: 'none' } },
];
/** Goods the demo neighbours put up for sale: [item, qty, price per unit]. */
const BOT_GOODS: [string, number, number][] = [
  ['wheat', 10, 2], ['corn', 8, 4], ['carrot', 6, 6], ['egg', 5, 9], ['milk', 4, 16], ['bread', 3, 30], ['chicken_feed', 6, 8], ['sugar', 3, 22],
];

const code = (n: number) => {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) { s += A[n % A.length]; n = Math.floor(n / A.length) + (i + 1) * 7919; }
  return `${s.slice(0, 3)}-${s.slice(3)}`;
};

export class LocalBackend implements OnlineBackend {
  readonly kind = 'local' as const;
  private id = '';
  private chan: BroadcastChannel | null = null;
  private subs = new Set<(e: OnlineEvent) => void>();
  /** items known to the game; bots only list these (set by the game before init) */
  knownItems: (item: string) => boolean = () => true;

  constructor(private now: () => number = () => Date.now()) {}

  async init(): Promise<void> {
    if (this.id) return;
    try { this.id = localStorage.getItem(ID_KEY) ?? ''; } catch { /* blocked */ }
    if (!this.id) {
      this.id = `p_${Math.floor(Math.random() * 1e9).toString(36)}${Date.now().toString(36)}`;
      try { localStorage.setItem(ID_KEY, this.id); } catch { /* blocked */ }
    }
    try {
      this.chan = new BroadcastChannel('cozy-acres-online');
      this.chan.onmessage = (m) => this.emit(m.data as OnlineEvent, false);
    } catch { /* old browsers */ }
    this.write((db) => this.seedBots(db));
  }

  private read(): Db {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) return JSON.parse(raw) as Db;
    } catch { /* corrupt or blocked: start over */ }
    return { profiles: [], gifts: [], listings: [], seq: 1, botsAt: 0 };
  }
  private write<T>(fn: (db: Db) => T): T {
    const db = this.read();
    const r = fn(db);
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch { /* full or blocked */ }
    return r;
  }
  private nextId(db: Db, p: string): string { return `${p}${db.seq++}`; }
  private emit(e: OnlineEvent, broadcast = true): void {
    if (broadcast) try { this.chan?.postMessage(e); } catch { /* closed */ }
    for (const s of this.subs) s(e);
  }

  /** Demo neighbours keep a few goods on the market, restocked every 20 minutes. */
  private seedBots(db: Db): void {
    const now = this.now();
    BOTS.forEach((b, i) => {
      const id = `bot_${i}`;
      if (!db.profiles.some((p) => p.id === id)) {
        db.profiles.push({ id, code: code(1000 + i * 37), name: b.name, level: b.level, totalXp: b.level * b.level * 40, farmValue: b.level * 900 + b.charm * 3, charm: b.charm, weeklyXp: 120 + i * 85, look: b.look, bot: true, updatedAt: now });
      }
    });
    if (now - db.botsAt < 20 * 60000) return;
    db.botsAt = now;
    db.listings = db.listings.filter((l) => !(l.seller.id.startsWith('bot_') && l.status === 'open'));
    BOT_GOODS.filter(([it]) => this.knownItems(it)).forEach(([item, qty, unit], i) => {
      const b = BOTS[i % BOTS.length];
      db.listings.push({ id: this.nextId(db, 'l'), seller: { id: `bot_${i % BOTS.length}`, name: b.name }, item, qty, price: Math.round(qty * unit * (0.9 + (i % 3) * 0.1)), listedAt: now - i * 60000, status: 'open' });
    });
  }

  me(): PlayerProfile | null { return this.read().profiles.find((p) => p.id === this.id) ?? null; }

  async upsertProfile(stats: ProfileStats): Promise<PlayerProfile> {
    const p = this.write((db) => {
      let p = db.profiles.find((x) => x.id === this.id);
      if (!p) { p = { ...stats, id: this.id, code: code(db.seq * 104729 + 17), updatedAt: this.now() }; db.seq++; db.profiles.push(p); }
      else Object.assign(p, stats, { updatedAt: this.now() });
      return { ...p };
    });
    this.emit({ type: 'profiles' });
    return p;
  }

  async findByCode(c: string): Promise<PlayerProfile | null> {
    const want = c.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return this.read().profiles.find((p) => p.code.replace('-', '') === want) ?? null;
  }
  async getProfiles(ids: string[]): Promise<PlayerProfile[]> { return this.read().profiles.filter((p) => ids.includes(p.id)); }
  async leaderboard(kind: LeaderboardKind, limit: number): Promise<PlayerProfile[]> {
    return this.read().profiles.sort((a, b) => b[kind] - a[kind] || b.totalXp - a.totalXp).slice(0, limit);
  }

  async sendGift(to: string, items: Record<string, number>, coins: number, message?: string): Promise<Gift> {
    const me = this.me();
    if (!me) throw new Error('no profile');
    const g = this.write((db) => {
      if (!db.profiles.some((p) => p.id === to)) throw new Error('unknown player');
      const g: Gift = { id: this.nextId(db, 'g'), from: { id: me.id, name: me.name }, to, items, coins, message, sentAt: this.now(), claimed: false };
      db.gifts.push(g);
      return g;
    });
    this.emit({ type: 'gift', gift: g });
    return g;
  }
  async inbox(): Promise<Gift[]> { return this.read().gifts.filter((g) => g.to === this.id && !g.claimed).sort((a, b) => b.sentAt - a.sentAt); }
  async claimGift(id: string): Promise<Gift> {
    return this.write((db) => {
      const g = db.gifts.find((x) => x.id === id);
      if (!g || g.to !== this.id) throw new Error('not found');
      if (g.claimed) throw new Error('claimed');
      g.claimed = true;
      return { ...g };
    });
  }

  async listItem(item: string, qty: number, price: number): Promise<Listing> {
    const me = this.me();
    if (!me) throw new Error('no profile');
    const l = this.write((db) => {
      const l: Listing = { id: this.nextId(db, 'l'), seller: { id: me.id, name: me.name }, item, qty, price, listedAt: this.now(), status: 'open' };
      db.listings.push(l);
      return l;
    });
    this.emit({ type: 'listings' });
    return l;
  }
  async browse(opts: { item?: string; limit?: number } = {}): Promise<Listing[]> {
    return this.read().listings
      .filter((l) => l.status === 'open' && l.seller.id !== this.id && (!opts.item || l.item === opts.item))
      .sort((a, b) => b.listedAt - a.listedAt).slice(0, opts.limit ?? 60);
  }
  async myListings(): Promise<Listing[]> {
    return this.read().listings.filter((l) => l.seller.id === this.id && (l.status === 'open' || (l.status === 'sold' && !l.collected))).sort((a, b) => b.listedAt - a.listedAt);
  }
  async buy(id: string): Promise<Listing> {
    const me = this.me();
    if (!me) throw new Error('no profile');
    const l = this.write((db) => {
      const l = db.listings.find((x) => x.id === id);
      if (!l) throw new Error('not found');
      if (l.status !== 'open') throw new Error('sold');
      if (l.seller.id === me.id) throw new Error('own listing');
      l.status = 'sold'; l.buyer = { id: me.id, name: me.name }; l.soldAt = this.now();
      if (l.seller.id.startsWith('bot_')) l.collected = true;
      return { ...l };
    });
    this.emit({ type: 'sold', listing: l });
    return l;
  }
  async cancel(id: string): Promise<Listing> {
    const l = this.write((db) => {
      const l = db.listings.find((x) => x.id === id);
      if (!l || l.seller.id !== this.id) throw new Error('not found');
      if (l.status !== 'open') throw new Error('sold');
      l.status = 'cancelled';
      return { ...l };
    });
    this.emit({ type: 'listings' });
    return l;
  }
  async collect(id: string): Promise<Listing> {
    return this.write((db) => {
      const l = db.listings.find((x) => x.id === id);
      if (!l || l.seller.id !== this.id || l.status !== 'sold') throw new Error('not found');
      if (l.collected) throw new Error('collected');
      l.collected = true;
      return { ...l };
    });
  }

  /** Practice mode only: a demo neighbour sends this player a gift (so the mailbox can be tried). */
  async botGift(botId: string, items: Record<string, number>, coins: number, message?: string): Promise<Gift> {
    const g = this.write((db) => {
      const bot = db.profiles.find((p) => p.id === botId && p.bot);
      if (!bot || !this.id) throw new Error('unknown player');
      const g: Gift = { id: this.nextId(db, 'g'), from: { id: bot.id, name: bot.name }, to: this.id, items, coins, message, sentAt: this.now(), claimed: false };
      db.gifts.push(g);
      return g;
    });
    this.emit({ type: 'gift', gift: g });
    return g;
  }

  async claimFarmTransfer(): Promise<string> {
    throw new Error('Farm codes need online play.');
  }

  async claimRewardCode(): Promise<RewardCode> {
    throw new Error('Reward codes need online play.');
  }

  async logActivity(): Promise<void> { /* practice mode: no statistics */ }
  async adminGifts(): Promise<AdminGift[]> { return []; }
  async claimAdminGift(): Promise<AdminGift> { throw new Error('not found'); }
  async submitFeedback(): Promise<void> {
    throw new Error('Feedback needs online play.');
  }

  async publishFarm(snapshot: FarmSnapshot): Promise<void> {
    await this.init();
    const txt = JSON.stringify(snapshot);
    if (txt.length > 65536) throw new Error('farm too big');
    let farms: Record<string, unknown> = {};
    try { farms = JSON.parse(localStorage.getItem(FARMS_KEY) ?? '{}') as Record<string, unknown> ?? {}; } catch { /* corrupt: start over */ }
    farms[this.id] = snapshot;
    try { localStorage.setItem(FARMS_KEY, JSON.stringify(farms)); } catch { throw new Error('storage full'); }
  }

  async getFarm(playerId: string): Promise<FarmSnapshot | null> {
    await this.init();
    const bot = this.read().profiles.find((p) => p.id === playerId && p.bot);
    if (bot) return sanitizeSnapshot(botFarm(bot, this.now()), this.now());
    try {
      const farms = JSON.parse(localStorage.getItem(FARMS_KEY) ?? '{}') as Record<string, unknown>;
      return farms && typeof farms === 'object' && farms[playerId] ? sanitizeSnapshot(farms[playerId], this.now()) : null;
    } catch { return null; }
  }

  // ------------------------------------------------------------------ helping neighbours
  private readHelp(): HelpDb {
    try {
      const raw = JSON.parse(localStorage.getItem(HELP_KEY) ?? 'null') as HelpDb | null;
      if (raw && Array.isArray(raw.rows)) return { rows: raw.rows, seq: Number(raw.seq) || 1, botDay: typeof raw.botDay === 'string' ? raw.botDay : '' };
    } catch { /* corrupt: start over */ }
    return { rows: [], seq: 1, botDay: '' };
  }
  private writeHelp<T>(fn: (db: HelpDb) => T): T {
    const db = this.readHelp();
    const r = fn(db);
    if (db.rows.length > HELP_LIMITS.keep) {
      // forget the oldest claimed rows first
      db.rows.sort((a, b) => b.at - a.at);
      const keep: FarmHelp[] = [];
      for (const row of db.rows) if (keep.length < HELP_LIMITS.keep || !row.claimed) keep.push(row);
      db.rows = keep;
    }
    try { localStorage.setItem(HELP_KEY, JSON.stringify(db)); } catch { /* full or blocked */ }
    return r;
  }
  /** Adds one row with the server's rules: not yourself, a known owner, once a day per helper and owner. */
  private addHelp(db: HelpDb, owner: string, helper: { id: string; name: string }, kind: FarmHelp['kind'], target: FarmHelpTarget | null, note: string | null): FarmHelp {
    if (owner === helper.id) throw new Error('self');
    if (!this.read().profiles.some((p) => p.id === owner)) throw new Error('unknown player');
    const now = this.now(), day = utcDay(now);
    const today = db.rows.filter((r) => r.owner === owner && utcDay(r.at) === day);
    if (today.some((r) => r.helper.id === helper.id && (r.kind === 'like') === (kind === 'like'))) throw new Error('already');
    if (today.length >= HELP_LIMITS.perOwnerPerDay) throw new Error('busy');
    const row: FarmHelp = { id: `h${db.seq++}`, owner, helper: { id: helper.id, name: helper.name }, kind, target, note, at: now, claimed: false };
    db.rows.push(row);
    return row;
  }

  async helpFarm(ownerId: string, kind: FarmHelpKind, target: FarmHelpTarget): Promise<FarmHelp> {
    await this.init();
    const me = this.me();
    if (!me) throw new Error('no profile');
    if (!['water', 'feed', 'tend'].includes(kind) || !target || typeof target.type !== 'string') throw new Error('bad');
    const t: FarmHelpTarget = { type: target.type.slice(0, 40), x: Math.floor(target.x) || 0, z: Math.floor(target.z) || 0 };
    return this.writeHelp((db) => ({ ...this.addHelp(db, ownerId, me, kind, t, null) }));
  }

  async likeFarm(ownerId: string, note?: string | null): Promise<FarmHelp> {
    await this.init();
    const me = this.me();
    if (!me) throw new Error('no profile');
    if (note && !HELP_NOTES[note]) throw new Error('bad');
    return this.writeHelp((db) => ({ ...this.addHelp(db, ownerId, me, 'like', null, note || null) }));
  }

  async farmHelpStatus(ownerId: string): Promise<FarmHelpStatus> {
    await this.init();
    const day = utcDay(this.now());
    const rows = this.readHelp().rows.filter((r) => r.owner === ownerId);
    const mine = rows.filter((r) => r.helper.id === this.id && utcDay(r.at) === day);
    // demo neighbours' farms start with a few likes so the heart is never lonely
    const bot = this.read().profiles.find((p) => p.id === ownerId && p.bot);
    const base = bot ? 3 + (bot.level % 7) * 2 : 0;
    return { likes: base + rows.filter((r) => r.kind === 'like').length, helped: mine.some((r) => r.kind !== 'like'), liked: mine.some((r) => r.kind === 'like') };
  }

  async myFarmHelp(): Promise<FarmHelp[]> {
    await this.init();
    this.maybeBotHelp();
    return this.readHelp().rows.filter((r) => r.owner === this.id).sort((a, b) => b.at - a.at).slice(0, 60).map((r) => ({ ...r }));
  }

  async claimFarmHelp(ids: string[]): Promise<string[]> {
    await this.init();
    const want = new Set(ids.slice(0, 100));
    return this.writeHelp((db) => {
      const out: string[] = [];
      for (const r of db.rows) if (want.has(r.id) && r.owner === this.id && !r.claimed) { r.claimed = true; out.push(r.id); }
      return out;
    });
  }

  /**
   * Practice mode only: once a (UTC) day, on the first check after the game opens (and only once this
   * player has shared their farm), a demo neighbour
   * drops by to help (a growing field, hungry animals or a fruit tree from the shared snapshot) and
   * another one leaves a like with a note, so the owner side can be tried without a server.
   * `force` (headless tests, via window.__neighbours.botVisit) ignores the once-a-day rule.
   */
  botHelp(force = false): boolean {
    const day = utcDay(this.now());
    const help = this.readHelp();
    if (!force && help.botDay === day) return false;
    let snap: FarmSnapshot | null = null;
    try {
      const farms = JSON.parse(localStorage.getItem(FARMS_KEY) ?? '{}') as Record<string, unknown>;
      snap = farms && typeof farms === 'object' && farms[this.id] ? sanitizeSnapshot(farms[this.id], this.now()) : null;
    } catch { /* none */ }
    if (!snap) return false;
    const bots = this.read().profiles.filter((p) => p.bot);
    if (bots.length < 2) return false;
    const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
    const options: { kind: FarmHelpKind; target: FarmHelpTarget }[] = [];
    for (const e of snap.b) {
      const kind = helpKindFor(e);
      if (kind) options.push({ kind, target: { type: e[0], x: e[1], z: e[2] } });
    }
    const a = pick(bots);
    const b = pick(bots.filter((x) => x.id !== a.id));
    this.writeHelp((db) => {
      db.botDay = day;
      // watering is the easiest help to notice, so demo neighbours like it best
      const water = options.filter((o) => o.kind === 'water');
      const opt = water.length && Math.random() < 0.7 ? pick(water) : options.length ? pick(options) : null;
      try { if (opt) this.addHelp(db, this.id, a, opt.kind, opt.target, null); } catch { /* already today */ }
      try { this.addHelp(db, this.id, b, 'like', null, pick(Object.keys(HELP_NOTES))); } catch { /* already today */ }
    });
    return true;
  }
  /** Demo neighbours only drop by "while you were away": checked once per page load, never mid-session. */
  private botHelpTried = false;
  private maybeBotHelp(): void {
    if (this.botHelpTried) return;
    this.botHelpTried = true;
    try { this.botHelp(false); } catch { /* demo only */ }
  }

  // ------------------------------------------------------------------ ask a friend (1.8)
  private readAsk(): AskDb {
    try {
      const raw = JSON.parse(localStorage.getItem(ASK_KEY) ?? 'null') as AskDb | null;
      if (raw && Array.isArray(raw.reqs) && Array.isArray(raw.fills)) return { reqs: raw.reqs, fills: raw.fills, seq: Number(raw.seq) || 1, botAsked: raw.botAsked && typeof raw.botAsked === 'object' ? raw.botAsked : {} };
    } catch { /* corrupt: start over */ }
    return { reqs: [], fills: [], seq: 1, botAsked: {} };
  }
  private writeAsk<T>(fn: (db: AskDb) => T): T {
    const db = this.readAsk();
    const now = this.now();
    // same housekeeping as the server: expire, then forget finished rows after 30 days
    for (const r of db.reqs) if (r.status === 'open' && r.expiresAt <= now) { r.status = 'expired'; r.closedAt = r.expiresAt; }
    const r = fn(db);
    const old = now - 30 * 864e5;
    db.reqs = db.reqs.filter((x) => x.status === 'open' || x.createdAt > old || db.fills.some((f) => f.request === x.id && !f.claimed));
    db.fills = db.fills.filter((f) => db.reqs.some((x) => x.id === f.request));
    try { localStorage.setItem(ASK_KEY, JSON.stringify(db)); } catch { /* full or blocked */ }
    return r;
  }
  private pub(r: AskReq): HelpRequest {
    return cleanRequest({ id: r.id, requester: r.requester, item: r.item, qty: r.qty, filled: r.filled, reason: r.reason, createdAt: r.createdAt, expiresAt: r.expiresAt, status: r.status })!;
  }
  private pubFill(f: AskFill): HelpFill { return cleanFill({ ...f })!; }
  private friendList(ids: string[]): string[] {
    const known = new Set(this.read().profiles.map((p) => p.id));
    return [...new Set(ids)].filter((id) => id !== this.id && known.has(id)).slice(0, 30);
  }
  /** Adds one fill with the server's rules; returns it (qty never past what is still needed). */
  private addFill(db: AskDb, r: AskReq, helper: { id: string; name: string }, qty: number, auto: boolean): AskFill {
    const now = this.now();
    if (r.requester.id === helper.id) throw new Error('yourself');
    if (!r.audience.includes(helper.id)) throw new Error('not found');
    if (r.status !== 'open' || r.expiresAt <= now || r.filled >= r.qty) throw new Error('closed');
    if (db.fills.filter((f) => f.helper.id === helper.id && f.at > now - 864e5).length >= ASK.fillsPerDay) throw new Error('too many today');
    const take = Math.min(qty, r.qty - r.filled);
    const f: AskFill = { id: `hf${db.seq++}`, request: r.id, requester: r.requester.id, item: r.item, helper: { id: helper.id, name: helper.name }, qty: take, auto, at: now, claimed: false };
    db.fills.push(f);
    r.filled += take;
    if (r.filled >= r.qty) { r.status = 'filled'; r.closedAt = now; }
    return f;
  }

  async askHelp(item: string, qty: number, reason: HelpReason, friends: string[]): Promise<HelpRequest> {
    await this.init();
    const me = this.me();
    if (!me) throw new Error('no profile');
    if (!/^[a-z0-9_]{1,40}$/.test(item) || !this.knownItems(item)) throw new Error('bad item');
    if (!Number.isInteger(qty) || qty < 1 || qty > ASK.maxQty) throw new Error('bad qty');
    if (!HELP_REASONS.includes(reason)) throw new Error('bad reason');
    const audience = this.friendList(friends);
    return this.writeAsk((db) => {
      const now = this.now();
      const mine = db.reqs.filter((r) => r.requester.id === me.id);
      if (mine.filter((r) => r.status === 'open' && r.expiresAt > now).length >= ASK.maxOpen) throw new Error('too many open');
      if (mine.some((r) => r.item === item && r.createdAt > now - ASK.sameItemHours * 3600e3)) throw new Error('asked recently');
      if (mine.filter((r) => r.createdAt > now - 864e5).length >= ASK.asksPerDay) throw new Error('too many today');
      // demo neighbours among the friends drop some off after a minute or two, and another one the rest a bit later
      const bots = audience.filter((id) => id.startsWith('bot_'));
      const plan: AskReq['bots'] = [];
      if (bots.length) {
        const [lo, hi] = ASK.practice.fillAfterSec;
        const at = now + (lo + Math.random() * (hi - lo)) * 1000;
        const first = bots[Math.floor(Math.random() * bots.length)];
        const part = qty <= 2 ? qty : Math.ceil(qty / 2);
        plan.push({ bot: first, at, qty: part });
        if (part < qty) {
          const second = bots.length > 1 ? bots.filter((b) => b !== first)[Math.floor(Math.random() * (bots.length - 1))] : first;
          plan.push({ bot: second, at: at + (40 + Math.random() * 80) * 1000, qty: qty - part });
        }
      }
      const r: AskReq = {
        id: `hr${db.seq++}`, requester: { id: me.id, name: me.name }, item, qty, filled: 0, reason, createdAt: now,
        expiresAt: now + ASK.expireHours * 3600e3, status: 'open', audience, closedAt: 0, hazel: false, bots: plan,
      };
      db.reqs.push(r);
      return this.pub(r);
    });
  }

  async setHelpFriends(friends: string[]): Promise<void> {
    await this.init();
    const audience = this.friendList(friends);
    this.writeAsk((db) => { for (const r of db.reqs) if (r.requester.id === this.id && r.status === 'open') r.audience = audience; });
  }

  async cancelHelp(id: string, hazel = false): Promise<HelpRequest> {
    await this.init();
    return this.writeAsk((db) => {
      const r = db.reqs.find((x) => x.id === id && x.requester.id === this.id);
      if (!r) throw new Error('not found');
      if (r.status !== 'open') throw new Error('not open');
      r.status = 'cancelled';
      r.closedAt = this.now();
      r.hazel = hazel;
      return this.pub(r);
    });
  }

  async myHelpRequests(): Promise<HelpRequest[]> {
    await this.init();
    this.botFills();
    const since = this.now() - 3 * 864e5;
    return this.readAsk().reqs.filter((r) => r.requester.id === this.id && r.createdAt > since)
      .sort((a, b) => b.createdAt - a.createdAt).slice(0, 30).map((r) => this.pub(r));
  }

  async friendHelpRequests(ids: string[]): Promise<HelpRequest[]> {
    await this.init();
    const friends = this.friendList(ids);
    this.botAsks(friends.filter((id) => id.startsWith('bot_')));
    const now = this.now();
    return this.readAsk().reqs.filter((r) => friends.includes(r.requester.id) && r.audience.includes(this.id) && r.status === 'open' && r.expiresAt > now && r.filled < r.qty)
      .sort((a, b) => a.createdAt - b.createdAt).map((r) => this.pub(r));
  }

  async fillHelp(id: string, qty: number, auto: boolean): Promise<HelpFill> {
    await this.init();
    const me = this.me();
    if (!me) throw new Error('no profile');
    if (!Number.isInteger(qty) || qty < 1 || qty > ASK.maxQty) throw new Error('bad qty');
    return this.writeAsk((db) => {
      const r = db.reqs.find((x) => x.id === id);
      if (!r) throw new Error('not found');
      return this.pubFill(this.addFill(db, r, me, qty, auto));
    });
  }

  async myHelpFills(): Promise<HelpFill[]> {
    await this.init();
    this.botFills();
    return this.readAsk().fills.filter((f) => f.requester === this.id && !f.claimed).sort((a, b) => a.at - b.at).slice(0, 100).map((f) => this.pubFill(f));
  }

  async claimHelpFills(ids: string[]): Promise<HelpFill[]> {
    await this.init();
    const want = new Set(ids.slice(0, 100));
    return this.writeAsk((db) => {
      const out: HelpFill[] = [];
      for (const f of db.fills) if (want.has(f.id) && f.requester === this.id && !f.claimed) { f.claimed = true; out.push(this.pubFill(f)); }
      return out;
    });
  }

  /** Practice mode: demo neighbours drop off what they planned for this player's open requests once it is time. */
  private botFills(): void {
    const now = this.now();
    const db = this.readAsk();
    if (!db.reqs.some((r) => r.requester.id === this.id && r.status === 'open' && r.bots?.some((b) => b.at <= now))) return;
    const bots = new Map(this.read().profiles.filter((p) => p.bot).map((p) => [p.id, p]));
    this.writeAsk((d) => {
      for (const r of d.reqs) {
        if (r.requester.id !== this.id || r.status !== 'open' || !r.bots?.length) continue;
        const due = r.bots.filter((b) => b.at <= now);
        r.bots = r.bots.filter((b) => b.at > now);
        for (const b of due) {
          const bot = bots.get(b.bot);
          // a demo neighbour the player removed in the meantime does not help any more
          if (!bot || !r.audience.includes(b.bot)) continue;
          try { this.addFill(d, r, { id: bot.id, name: bot.name }, b.qty, false); } catch { /* filled or closed meanwhile */ }
        }
      }
    });
  }

  /** Practice mode: each demo neighbour on the friends list asks for one thing a (UTC) day. */
  private botAsks(botIds: string[]): void {
    if (!botIds.length || !this.id) return;
    const day = utcDay(this.now());
    const db = this.readAsk();
    const todo = botIds.filter((b) => db.botAsked[b] !== day);
    if (!todo.length) return;
    const bots = new Map(this.read().profiles.filter((p) => p.bot).map((p) => [p.id, p]));
    const pool = ASK.practice.items.filter((i) => this.knownItems(i));
    if (!pool.length) return;
    this.writeAsk((d) => {
      const now = this.now();
      todo.forEach((b, i) => {
        const bot = bots.get(b);
        d.botAsked[b] = day;
        if (!bot) return;
        const [lo, hi] = ASK.practice.qty;
        const item = pool[(Math.floor(Math.random() * pool.length) + i) % pool.length];
        d.reqs.push({
          id: `hr${d.seq++}`, requester: { id: bot.id, name: bot.name }, item, qty: lo + Math.floor(Math.random() * (hi - lo + 1)), filled: 0,
          reason: (['order', 'recipe', 'truck'] as HelpReason[])[i % 3], createdAt: now - i * 60000, expiresAt: now + ASK.expireHours * 3600e3,
          status: 'open', audience: [this.id], closedAt: 0, hazel: false, bots: [],
        });
      });
    });
  }

  subscribe(cb: (e: OnlineEvent) => void): () => void { this.subs.add(cb); return () => this.subs.delete(cb); }
}
