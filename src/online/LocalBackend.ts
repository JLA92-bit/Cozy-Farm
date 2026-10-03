import type { Gift, LeaderboardKind, Listing, OnlineBackend, OnlineEvent, PlayerProfile, ProfileStats } from './types';

/**
 * Practice backend: a tiny "server" kept in this browser's localStorage, shared by all tabs of the
 * game (BroadcastChannel tells the other tabs when something changes). It comes with a few demo
 * neighbours (marked bot) so the market and leaderboard are never empty. Used when no real
 * online backend is configured, and by the headless tests.
 */
const DB_KEY = 'cozy-acres-online-local';
const ID_KEY = 'cozy-acres-online-id';

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

  subscribe(cb: (e: OnlineEvent) => void): () => void { this.subs.add(cb); return () => this.subs.delete(cb); }
}
