import type { NotifyPrefs } from '../notify/Plan';

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
  /** decor paint colour (a key of PAINTS in systems/Decor) */
  tint?: string;
  /** Farm Sign text */
  text?: string;
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
  /** Helping neighbours while visiting (Update 5). */
  neighbours: NeighbourState;
  /** Phone notifications: what to send and the quiet hours (see src/notify). */
  notify: NotifyPrefs;
  /** Fishing at the dock: catches per species, biggest catch (cm) per species, free casts used today. */
  fishing: FishingState;
  /** 1.8 Village Friends: friendship with the named villagers (src/systems/Village.ts). */
  village: VillageState;
  /** 1.8 star quality: how many of each inventory item are silver / gold. Always <= the item's inventory count; the rest are normal (src/systems/Quality.ts). */
  quality: Record<string, [number, number]>;
  /** 1.8 mailbox: letters from villagers, the team and the game (src/systems/Mail.ts). */
  mail: MailState;
  /** 1.8 Ask a friend: Auto-help settings and when each item was last asked for (src/systems/Help.ts). */
  help: HelpState;
  /** 1.8 welcome for players who played before 1.8, and the one-time head start (src/systems/Welcome18.ts). */
  welcome18: Welcome18State;
}

/** Friendship with one villager. 100 points = 1 heart, 0..1000 (10 hearts). Points never drop from not playing. */
export interface FriendshipState {
  points: number;
  /** local day (YYYY-MM-DD) of the last gift and the last chat, one of each per day */
  giftDay: string;
  chatDay: string;
  gifts: number;
  /** heart milestones whose reward was given (2, 4, 6, 8, 10) */
  rewards: number[];
  /** item ids this villager's reaction has revealed (loves / likes / dislikes shown on their card) */
  known: string[];
  /** 1.8 villagers (optional): story moments already shown (4, 8); each gave its keepsake */
  stories?: number[];
  /** local day of a birthday gift whose thank-you letter is still to come (the next day) */
  bdayThanks?: string;
  /** local day of the last best-friend weekly gift letter */
  weeklyDay?: string;
  /** Pip only: local day (a Monday) of the week whose treasure letter was sent */
  treasureWeek?: string;
}
export interface VillageState {
  friends: Record<string, FriendshipState>;
  /** the daily rhythm (src/systems/Daily18.ts): today's villager visit and farm finds */
  today: { day: string; visitor: string; visitorDone: boolean; finds: { id: string; item: string; x: number; z: number; taken: boolean }[] };
  /** 1.8 villagers (optional): local day the Village screen was last opened (quiets the HUD dot for the day) */
  openedDay?: string;
}
export type LetterFrom = string; // a villager id, 'team' (the developer), or 'game'
export interface Letter {
  id: number;
  at: number;
  from: LetterFrom;
  title: string;
  body: string;
  /** optional things to collect from the letter */
  attach?: { coins?: number; gems?: number; items?: Record<string, number> };
  read: boolean;
  claimed: boolean;
}
export interface MailState { letters: Letter[]; nextId: number }
export interface HelpState { auto: boolean; reserve: number; asked: Record<string, number> }
export interface Welcome18State { step: number; done: boolean; headStart: boolean }

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

/** Helping neighbours: daily reward counters and which rewards were already added (Update 5). */
export interface NeighbourState {
  /** local day the counters below belong to */
  day: string;
  /** helps that paid coins and XP today (a few a day) */
  rewarded: number;
  /** small "thanks anyway" rewards for help that could not be used today */
  consoled: number;
  /** ids of helper rewards already added to this farm, so one is never added twice */
  paid: string[];
}

export const SAVE_VERSION = 1;
