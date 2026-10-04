/** The complete persistent game state. Everything time-based stores absolute timestamps, so timers keep running offline. */
export interface CharacterLook {
  body: string; // mini character variant id, e.g. 'female-b'
  skin: string;
  hair: string;
  top: string;
  bottom: string;
  hat: string;
  accessory: string;
  pet: string;
}

export interface QueueEntry { recipe: string; start: number; end: number }

export interface PlacedBuilding {
  uid: number;
  type: string;
  x: number;
  z: number;
  rot: number;
  level: number;
  buildEnd?: number;
  upgradeEnd?: number;
  plot?: { crop: string; plantedAt: number; growSec: number } | null;
  tree?: { readyAt: number };
  animals?: { fedAt: number | null }[];
  queue?: QueueEntry[];
  ready?: string[];
}

export interface Obstacle { id: number; type: string; x: number; z: number; model: number }

export interface OrderLine { item: string; qty: number }
export interface Order { id: number; lines: OrderLine[]; coins: number; xp: number; gems: number; readyAt: number; npc: number }

export interface TruckState {
  crates: { item: string; qty: number; coins: number; xp: number; filled: boolean }[];
  arrivesAt: number;
  leavesAt: number;
  bonusCoins: number;
}

export interface StallSlot { item: string | null; qty: number; price: number; listedAt: number; soldAt: number | null; buyDelay: number }

export interface QuestState { tpl: string; text: string; stat: string; start: number; target: number; claimed: boolean; icon: string }

export interface SaveData {
  version: number;
  createdAt: number;
  lastSeen: number;
  seed: number;
  nextUid: number;
  player: {
    name: string;
    level: number;
    xp: number;
    coins: number;
    gems: number;
    look: CharacterLook;
    created: boolean;
  };
  inventory: Record<string, number>;
  storage: Record<string, number>;
  buildings: PlacedBuilding[];
  obstacles: Obstacle[];
  land: { unlocked: string[]; bought: number };
  orders: { list: Order[]; nextId: number };
  truck: TruckState | null;
  truckNextAt: number;
  stall: { slots: StallSlot[]; adUntil: number };
  merchant: { bought: Record<string, number> };
  stats: Record<string, number>;
  achievements: Record<string, number>;
  quests: { daily: QuestState[]; dailyKey: string; weekly: QuestState[]; weeklyKey: string; weeklyBonusClaimed: boolean };
  daily: { lastDay: string; streak: number; claimedDay: string; best: number; protectionUsedWeek: string };
  collection: Record<string, number>;
  cosmetics: string[];
  crates: string[];
  event: { id: string; tokens: number; questsClaimed: number[]; bought: Record<string, number> } | null;
  tutorial: { step: number; done: boolean };
  seen: { levelUnlocks: number; loginDays: string[]; /** Game time the collection book was last opened (newer discoveries show as New). */ collectionSeenAt: number; /** Collection Book pages whose completion reward was claimed. */ bookPages: string[] };
  debugTimeOffset: number;
  /** XP earned in the current online week (week = Monday 00:00 UTC, as YYYY-MM-DD), for the weekly leaderboard. */
  weeklyXp: { week: string; xp: number };
  /** Newest app version whose "What's new" page the player has seen (older saves count as 1.0.0). */
  lastSeenVersion: string;
  /** Helpful hints: the player's chosen mode ('' = automatic) and one-time intros already shown. */
  hints: { mode: '' | 'all' | 'new' | 'off'; intros: string[] };
  /** Friends and gifts (Update 2). */
  social: SocialState;
  /** Fishing at the dock: catches per species, biggest catch (cm) per species, free casts used today. */
  fishing: FishingState;
}

export interface FishingState { caught: Record<string, number>; records: Record<string, number>; freeDay: string; freeUsed: number; casts: number }

export interface FriendEntry { id: string; name: string; code: string; addedAt: number }
export interface SocialState {
  friends: FriendEntry[];
  /** gifts sent today (gifts and gift codes both count) */
  sent: { day: string; gifts: number; coins: number };
  /** nonces of gift codes this farm already claimed (each code works once per farm) */
  claimedCodes: string[];
  /** nonces of gift codes this farm made (you cannot claim your own) */
  madeCodes: string[];
  /** practice mode: day a demo neighbour last sent a thank-you gift */
  botGiftDay: string;
}

export const SAVE_VERSION = 1;
