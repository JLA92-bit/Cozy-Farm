/**
 * Online (multiplayer) contract shared by every backend and by the game-side features
 * (friends, gifts, shared market, leaderboard).
 *
 * Trust model: this is a cozy co-op game, not a competitive one. Coins and items live in the
 * player's local save, so the game itself does the "escrow": it removes items before listing
 * them, takes coins before buying, and refunds when a call fails. The backend only guarantees the
 * shared parts are atomic (a listing can be bought once, a gift claimed once, earnings collected once).
 */

import type { FarmSnapshot } from './FarmSnapshot';

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

/** Ways to help a neighbour's farm ('like' = a like, with an optional guestbook note). */
export type FarmHelpKind = 'water' | 'feed' | 'tend';
/** Which building on the owner's farm was helped: its type and corner tile (checked again by the owner). */
export interface FarmHelpTarget { type: string; x: number; z: number }
export interface FarmHelp {
  id: string;
  owner: string;
  helper: PlayerRef;
  kind: FarmHelpKind | 'like';
  target: FarmHelpTarget | null;
  /** preset guestbook note id (likes only) */
  note: string | null;
  at: number;
  claimed: boolean;
}
export interface FarmHelpStatus { likes: number; helped: boolean; liked: boolean }

/** Preset guestbook notes (no free text). Ids are stored; the server accepts only these ids. */
export const HELP_NOTES: Record<string, string> = {
  lovely: 'Lovely farm!',
  flowers: 'Love your flowers!',
  thanks: 'Thanks for the gift!',
  market: 'See you at the market!',
  animals: 'Your animals look so happy!',
  cozy: 'So cozy here!',
};

/** Ask a friend (1.8): what a request is for (shown to friends), and where it stands. */
export type HelpReason = 'order' | 'recipe' | 'truck' | 'visit' | 'bundle' | 'other';
export type HelpStatus = 'open' | 'filled' | 'expired' | 'cancelled';
/** A player asking their friends for 1-10 of an item (open for 24 hours). */
export interface HelpRequest {
  id: string;
  requester: PlayerRef;
  item: string;
  qty: number;
  /** how many have arrived so far (never more than qty) */
  filled: number;
  reason: HelpReason;
  createdAt: number;
  expiresAt: number;
  status: HelpStatus;
}
/** Items a friend sent to a request. The asker's game adds them once claimHelpFills hands them over. */
export interface HelpFill { id: string; request: string; item: string; helper: PlayerRef; qty: number; auto: boolean; at: number }

export type LeaderboardKind = 'level' | 'farmValue' | 'charm' | 'weeklyXp';

export type OnlineEvent =
  | { type: 'gift'; gift: Gift }
  | { type: 'sold'; listing: Listing }
  | { type: 'listings' }
  | { type: 'profiles' };

/** A gift from the developer (admin dashboard): arrives by itself, no code to type. */
export interface AdminGift { id: string; coins: number; gems: number; items: Record<string, number>; land: number; message: string | null; created_at: string }

/** Where the game is running, for play statistics. */
export type Platform = 'android' | 'pwa' | 'web' | 'ios';

/** What a reward code gives. */
export interface RewardCode { coins: number; gems: number; items: Record<string, number>; message: string | null }

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

  /**
   * Publish this player's public farm snapshot (what neighbours see when they visit). Replaces the
   * previous one. Rejects when offline or refused (too big); callers retry later.
   */
  publishFarm(snapshot: FarmSnapshot): Promise<void>;
  /**
   * A player's last published farm snapshot, already checked with sanitizeSnapshot, or null when they
   * have not shared one yet. Rejects when the server cannot be reached.
   */
  getFarm(playerId: string): Promise<FarmSnapshot | null>;
  /**
   * Exchange a farm code (from the developer, for restoring a farm) for its farm link data ("z.<data>").
   * Rejects with 'not found' (wrong, expired or used up), 'too many tries', or when offline.
   */
  claimFarmTransfer(code: string): Promise<string>;
  /**
   * Claim a reward code from the developer (once per player). Rejects with 'not found' (wrong, expired or
   * used up), 'already claimed', 'too many tries', or when offline.
   */
  claimRewardCode(code: string): Promise<RewardCode>;
  /** Play statistics for the developer: a session start, or minutes played since the last call. Never throws. */
  logActivity(session: boolean, minutes: number, platform: Platform, version: string): Promise<void>;
  /** This player's unclaimed gifts from the developer. */
  adminGifts(): Promise<AdminGift[]>;
  /** Mark a developer gift received (exactly once); rejects with 'not found' if it was already claimed. */
  claimAdminGift(id: string): Promise<AdminGift>;
  /** Settings > Send feedback. Rejects with 'too many' (10 a day) or when offline. */
  submitFeedback(category: 'bug' | 'idea' | 'praise' | 'other', message: string, info: { version: string; platform: Platform; device: string; level: number }): Promise<void>;

  /**
   * Helping neighbours (Update 5). Help a neighbour's farm once per UTC day (water a field, feed an
   * animal home or tend a fruit tree). Rejects with Error('self' | 'unknown player' | 'already' |
   * 'busy' | 'bad') when refused, or an offline error.
   */
  helpFarm(ownerId: string, kind: FarmHelpKind, target: FarmHelpTarget): Promise<FarmHelp>;
  /** Like a neighbour's farm once per UTC day, with an optional preset guestbook note id (see HELP_NOTES). */
  likeFarm(ownerId: string, note?: string | null): Promise<FarmHelp>;
  /** A farm's like count and what the caller already did for it today (UTC). */
  farmHelpStatus(ownerId: string): Promise<FarmHelpStatus>;
  /** Recent help and likes left on the caller's own farm, newest first (claimed and unclaimed). */
  myFarmHelp(): Promise<FarmHelp[]>;
  /** Marks the caller's own help rows claimed exactly once; returns the ids claimed by this call. */
  claimFarmHelp(ids: string[]): Promise<string[]>;

  /**
   * Ask a friend (1.8). Ask the friends `friends` (ids, at most 30; only they see it) for 1-10 of an item.
   * Rejects with Error('too many open' | 'asked recently' | 'too many today' | 'bad ...') when refused.
   */
  askHelp(item: string, qty: number, reason: HelpReason, friends: string[]): Promise<HelpRequest>;
  /** The caller's friends changed: update who sees their open requests. */
  setHelpFriends(friends: string[]): Promise<void>;
  /** Cancel the caller's own open request (hazel: because Hazel brought the rest). Rejects 'not open'. */
  cancelHelp(id: string, hazel?: boolean): Promise<HelpRequest>;
  /** The caller's own requests: open ones and those that closed in the last two days, newest first. */
  myHelpRequests(): Promise<HelpRequest[]>;
  /** Open requests of these friends (ids, at most 30) that the caller may help with. */
  friendHelpRequests(ids: string[]): Promise<HelpRequest[]>;
  /**
   * Send up to `qty` of the requested item. Never more than is still needed: the returned fill says how many
   * were used. Rejects with Error('closed' | 'not found' | 'yourself' | 'too many today').
   */
  fillHelp(id: string, qty: number, auto: boolean): Promise<HelpFill>;
  /** Fills of the caller's requests that have not arrived yet. */
  myHelpFills(): Promise<HelpFill[]>;
  /** Mark fills arrived, each exactly once; returns only those claimed by this call (add exactly these). */
  claimHelpFills(ids: string[]): Promise<HelpFill[]>;

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

// ---------------------------------------------------------------------------- phone notifications

/** This device's Web Push subscription plus the notification choices the server needs (quiet hours, gifts). */
export interface PushDevice {
  endpoint: string;
  p256dh: string;
  auth: string;
  /** IANA time zone, e.g. "Europe/London", so the server can respect quiet hours for gifts and sales */
  tz: string;
  quietStart: number;
  quietEnd: number;
  /** send gifts and Shared Market sales to this device */
  social: boolean;
}

/** One planned notification (wall clock ms). */
export interface PushRow { fireAt: number; kind: string; title: string; body: string }

/**
 * Optional phone notification features of a backend (Supabase only). Every call may reject when
 * offline; callers retry calmly.
 */
export interface PushBackend {
  savePushDevice(d: PushDevice): Promise<void>;
  deletePushDevice(endpoint: string): Promise<void>;
  /** Replace this player's whole future schedule with these rows (at most 30, within 48 hours). */
  replacePushSchedule(rows: PushRow[]): Promise<number>;
  /** Ask the server to send a test notification to this player's devices in the next few minutes. */
  sendTestPush(): Promise<void>;
}
