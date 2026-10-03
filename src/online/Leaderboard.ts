import { COSMETICS } from '../data';
import { game } from '../systems/Game';
import { online } from './Online';
import { ensureOnline, profileStats } from './Profile';
import { weekKey } from './Weekly';
import type { LeaderboardKind, PlayerProfile, PublicLook } from './types';

/**
 * Leaderboard data for the Leaders panel: fetches a board, merges in this player's live stats (so your
 * own row is never stale), works out your rank and who to pass next, and caches the last results per
 * board so the panel still shows something when offline. No DOM here.
 */

/** How many players a board shows. */
export const BOARD_LIMIT = 50;
const CACHE_KEY = 'cozy-acres-leaderboard-v1';
const WEEK_MS = 7 * 24 * 3600000;

export interface Board {
  kind: LeaderboardKind;
  /** best first, at most BOARD_LIMIT, including you when you made the cut */
  rows: PlayerProfile[];
  /** you (live stats), or null before your profile exists */
  me: PlayerProfile | null;
  /** your 1-based rank, or 0 when you are outside the visible top */
  rank: number;
  /** when the board was fetched */
  at: number;
  /** true when the fetch failed and these are the cached results */
  stale: boolean;
}

/** Sort order of a board: best first, lifetime XP breaks ties. */
export function compareFor(kind: LeaderboardKind): (a: PlayerProfile, b: PlayerProfile) => number {
  return kind === 'level'
    ? (a, b) => b.level - a.level || b.totalXp - a.totalXp
    : (a, b) => b[kind] - a[kind] || b.totalXp - a.totalXp;
}

/** The number you climb on a board (the level board climbs with lifetime XP). */
export function score(p: PlayerProfile, kind: LeaderboardKind): number {
  const v = kind === 'level' ? p.totalXp : p[kind];
  return Number.isFinite(v) ? v : 0;
}

/** Ids of the player's friends, read defensively (the friends list is added by another feature). */
export function friendIds(): Set<string> {
  const out = new Set<string>();
  const f = (game.state as unknown as { friends?: unknown } | undefined)?.friends;
  const add = (v: unknown) => {
    if (typeof v === 'string') out.add(v);
    else if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') out.add((v as { id: string }).id);
  };
  if (Array.isArray(f)) f.forEach(add);
  else if (f && typeof f === 'object') {
    const list = (f as { list?: unknown; ids?: unknown }).list ?? (f as { ids?: unknown }).ids;
    if (Array.isArray(list)) list.forEach(add);
    else for (const [k, v] of Object.entries(f)) { if (v && typeof v === 'object') add({ id: k, ...(v as object) }); else if (v) out.add(k); }
  }
  return out;
}

/**
 * Hooks other features (friends, gifts) can fill in to add actions to the player card.
 * `addFriend` returns true when the player was added.
 */
export const playerCardHooks: {
  addFriend: ((p: PlayerProfile) => Promise<boolean> | boolean) | null;
  isFriend: ((id: string) => boolean) | null;
  buttons: ((p: PlayerProfile, close: () => void) => HTMLElement | null)[];
} = { addFriend: null, isFriend: null, buttons: [] };

export function isFriend(id: string): boolean {
  try { return playerCardHooks.isFriend ? playerCardHooks.isFriend(id) : friendIds().has(id); } catch { return false; }
}

const HEX = /^#[0-9a-f]{6}$/i;
/** A safe copy of a public look (or null when it cannot be drawn), so bad data never reaches the 3D side. */
export function safeLook(l: PublicLook | undefined | null): PublicLook | null {
  if (!l || typeof l !== 'object') return null;
  if (!COSMETICS.bodies.some((b) => b.id === l.body)) return null;
  if (![l.skin, l.hair, l.top, l.bottom].every((c) => typeof c === 'string' && HEX.test(c))) return null;
  const hat = COSMETICS.hats.some((x) => x.id === l.hat) ? l.hat : 'none';
  return { body: l.body, skin: l.skin, hair: l.hair, top: l.top, bottom: l.bottom, hat };
}

/** Milliseconds until the weekly board resets (Monday 00:00 UTC). */
export function weekLeftMs(now = Date.now()): number {
  return Date.parse(`${weekKey(now)}T00:00:00Z`) + WEEK_MS - now;
}

type Cache = Partial<Record<LeaderboardKind, { at: number; rows: PlayerProfile[]; week?: string }>>;
function readCache(): Cache {
  try { return (JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Cache) ?? {}; } catch { return {}; }
}
function writeCache(kind: LeaderboardKind, at: number, rows: PlayerProfile[]): void {
  try {
    const c = readCache();
    c[kind] = { at, rows, week: weekKey(at) };
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch { /* full or blocked */ }
}

/** Your profile with fresh stats from the save (falls back to a placeholder id before the first sync). */
function liveMe(): PlayerProfile | null {
  if (!game.state?.player.created) return null;
  const base = online.me();
  return { id: base?.id ?? '__me', code: base?.code ?? '', updatedAt: Date.now(), ...profileStats() };
}

/** Put your live row into a board and work out your rank. */
function assemble(kind: LeaderboardKind, rows: PlayerProfile[], at: number, stale: boolean): Board {
  const me = liveMe();
  const cmp = compareFor(kind);
  const list = rows.filter((p) => p && typeof p.id === 'string' && p.id !== me?.id).slice();
  let rank = 0;
  if (me) {
    list.push(me);
    list.sort(cmp);
    const i = list.indexOf(me);
    // with a full board, beating the last row is what gets you in
    if (i < BOARD_LIMIT) rank = i + 1;
  } else list.sort(cmp);
  return { kind, rows: list.slice(0, BOARD_LIMIT), me, rank, at, stale };
}

/** The last cached board (for instant display while a fresh one loads), or null. */
export function cachedBoard(kind: LeaderboardKind): Board | null {
  const c = readCache()[kind];
  if (!c || !Array.isArray(c.rows)) return null;
  // last week's weekly board is meaningless after the reset
  if (kind === 'weeklyXp' && c.week !== weekKey()) return null;
  return assemble(kind, c.rows, c.at, true);
}

let lastPublish = 0;
/** Fetch a fresh board; on failure returns the cached one (stale) or throws when there is none. */
export async function fetchBoard(kind: LeaderboardKind): Promise<Board> {
  try {
    await ensureOnline();
    // refresh our own row first so other players see the same numbers we do
    if (Date.now() - lastPublish > 60000) {
      lastPublish = Date.now();
      await online.upsertProfile(profileStats()).catch(() => undefined);
    }
    const rows = await online.leaderboard(kind, BOARD_LIMIT + 1);
    const at = Date.now();
    writeCache(kind, at, rows);
    return assemble(kind, rows, at, false);
  } catch (e) {
    const c = cachedBoard(kind);
    if (c) return c;
    throw e;
  }
}

/** "You are #N - X more to pass <name>" for the tracker. */
export interface Chase {
  rank: number;
  /** the player just above you (or the last row when you are outside the top), null when you are #1 */
  target: PlayerProfile | null;
  /** how much more you need to pass them */
  gap: number;
  /** 0..1 progress towards them */
  progress: number;
}

export function chase(b: Board): Chase | null {
  if (!b.me) return null;
  const mine = score(b.me, b.kind);
  const i = b.rank ? b.rank - 1 : b.rows.length;
  if (i === 0) return { rank: 1, target: null, gap: 0, progress: 1 };
  const target = b.rows[i - 1];
  if (!target) return null;
  const theirs = score(target, b.kind);
  const gap = Math.max(1, theirs - mine + 1);
  return { rank: b.rank, target, gap, progress: theirs > 0 ? Math.max(0, Math.min(1, mine / theirs)) : 1 };
}
