/**
 * Online (multiplayer) contract shared by every backend and by the game-side features
 * (friends, gifts, shared market, leaderboard).
 *
 * Trust model: this is a cozy co-op game, not a competitive one. Coins and items live in the
 * player's local save, so the game itself does the "escrow": it removes items before listing
 * them, takes coins before buying, and refunds when a call fails. The backend only guarantees the
 * shared parts are atomic (a listing can be bought once, a gift claimed once, earnings collected once).
 */

/** Small public look so other players can draw your farmer (matches CharacterLook fields). */
export interface PublicLook { body: string; skin: string; hair: string; top: string; bottom: string; hat: string }

export interface PlayerProfile {
  id: string;
  /** short shareable friend code, e.g. "KX4-92P" */
  code: string;
  name: string;
  farmName?: string;
  level: number;
  /** lifetime XP (sum of all levels), for tie-breaks and progress tracking */
  totalXp: number;
  /** coins + item value + building value: a simple "how big is the farm" score */
  farmValue: number;
  charm: number;
  /** XP earned since Monday 00:00 UTC (resets weekly) */
  weeklyXp: number;
  look: PublicLook;
  /** true for built-in demo neighbours of the local backend */
  bot?: boolean;
  updatedAt: number;
}

export type ProfileStats = Omit<PlayerProfile, 'id' | 'code' | 'updatedAt' | 'bot'>;

export interface PlayerRef { id: string; name: string }

export interface Gift {
  id: string;
  from: PlayerRef;
  to: string;
  items: Record<string, number>;
  coins: number;
  message?: string;
  sentAt: number;
  claimed: boolean;
}

export type ListingStatus = 'open' | 'sold' | 'cancelled';

export interface Listing {
  id: string;
  seller: PlayerRef;
  item: string;
  qty: number;
  /** total price in coins for the whole stack */
  price: number;
  listedAt: number;
  status: ListingStatus;
  buyer?: PlayerRef;
  soldAt?: number;
  /** seller has collected the coins of a sold listing */
  collected?: boolean;
}

export type LeaderboardKind = 'level' | 'farmValue' | 'charm' | 'weeklyXp';

export type OnlineEvent =
  | { type: 'gift'; gift: Gift }
  | { type: 'sold'; listing: Listing }
  | { type: 'listings' }
  | { type: 'profiles' };

export interface OnlineBackend {
  /** 'local' = practice mode in this browser only (with demo neighbours); 'supabase' = real online play */
  readonly kind: 'local' | 'supabase';
  /** Connect / sign in (anonymous). Must be safe to call more than once. */
  init(): Promise<void>;
  /** The signed-in player's profile (null before the first upsertProfile). */
  me(): PlayerProfile | null;
  upsertProfile(stats: ProfileStats): Promise<PlayerProfile>;
  findByCode(code: string): Promise<PlayerProfile | null>;
  getProfiles(ids: string[]): Promise<PlayerProfile[]>;
  leaderboard(kind: LeaderboardKind, limit: number): Promise<PlayerProfile[]>;

  sendGift(to: string, items: Record<string, number>, coins: number, message?: string): Promise<Gift>;
  inbox(): Promise<Gift[]>;
  /** Marks a gift claimed exactly once; throws if it was already claimed or is not yours. */
  claimGift(id: string): Promise<Gift>;

  listItem(item: string, qty: number, price: number): Promise<Listing>;
  /** Open listings from other players, newest first, optionally for one item. */
  browse(opts?: { item?: string; limit?: number }): Promise<Listing[]>;
  myListings(): Promise<Listing[]>;
  /** Atomically buys an open listing; throws Error('sold') if someone was faster. */
  buy(id: string): Promise<Listing>;
  /** Cancels your own open listing; throws if it already sold. */
  cancel(id: string): Promise<Listing>;
  /** Marks a sold listing's coins as collected exactly once; throws if already collected. */
  collect(id: string): Promise<Listing>;

  subscribe(cb: (e: OnlineEvent) => void): () => void;
}

// ---------------------------------------------------------------------------- accounts and cloud saves

/** Who is signed in to the online server. Anonymous = the automatic background account (no Google). */
export interface AccountInfo {
  id: string;
  anonymous: boolean;
  email: string;
  name: string;
}

/** One cloud save row (the player's whole farm, as exported). `updatedAt` is the server's exact timestamp text. */
export interface CloudRow {
  data: unknown;
  saveVersion: number;
  level: number;
  coins: number;
  updatedAt: string;
  device: string;
}

export interface CloudMeta { saveVersion: number; level: number; coins: number; device: string }

/** What happened when the page came back from a Google sign-in redirect. */
export type AuthResult =
  | { kind: 'linked' | 'signedIn'; switched: boolean }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

/**
 * Optional account features of a backend (Supabase only; practice mode has none).
 * Every call may reject when offline; callers catch.
 */
export interface AccountBackend {
  /** The signed-in account, or null before connecting. */
  account(): AccountInfo | null;
  /** Start "Sign in with Google" (leaves the page; the result is reported by takeAuthResult after the return). */
  signInWithGoogle(): Promise<void>;
  /** Sign out on this device. The next connect makes a fresh anonymous account. */
  signOut(): Promise<void>;
  /** Permanently delete the online account (profile, friend code, cloud save, listings, gifts), then sign out. */
  deleteAccount(): Promise<void>;
  /** The cloud save of the signed-in (Google) account, or null when there is none. */
  loadCloud(): Promise<CloudRow | null>;
  /**
   * Upload the farm. `base` is the cloud `updatedAt` this device last saw (null = none); unless `force`,
   * the server refuses with Error('conflict') when the cloud copy changed since. Returns the new `updatedAt`.
   */
  saveCloud(data: object, meta: CloudMeta, base: string | null, force: boolean): Promise<string>;
  /** The result of a Google sign-in redirect that brought the page back (once), or null. */
  takeAuthResult(): AuthResult | null;
  /** Listen for sign in / sign out; returns an unsubscribe function. */
  onAccount(cb: (a: AccountInfo | null) => void): () => void;
}
