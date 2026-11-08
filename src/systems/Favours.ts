/**
 * 1.40 Favours and Trust: a villager at 10 hearts asks one favour a week, three of the things they love or like,
 * open for a few days. Doing it pays Friendship Tokens and coins; tokens buy the villager's golden keepsake (once) or
 * another of their gift pieces for the home. Friends only, as always. Numbers in villagers.json `favours`.
 */
import { ITEMS, ITEM_LEVEL, PIECE, VILLAGER, VILLAGERS, FURNITURE } from '../data';
import villagersJson from '../data/villagers.json';
import { game } from './Game';
import { village } from './Village';
import { saves } from './Save';
import { home } from './Home';
import { logEvent } from '../online/Events';

const F = (villagersJson as unknown as { favours: { hearts: number; days: number; items: number; tokens: number; coins: number; keepsakeGold: number; piece: number } }).favours;
const DAY = 86400000;

export interface Favour { week: string; items: Record<string, number>; until: number; done?: boolean }

/** The local Monday of this week, as YYYY-MM-DD. */
export function weekKey(now = game.now()): string {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A small seeded random number source (the same favour on every device, for this farm, week and villager). */
function rand(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}

class FavoursSystem {
  get tokens(): number { return game.state.village.tokens ?? 0; }
  private get map(): Record<string, Favour> { return (game.state.village.favours ??= {}); }

  open(id: string): boolean { return village.hearts(id) >= F.hearts; }

  /** This week's favour for a villager (made the first time it is asked for), or null below 10 hearts. */
  current(id: string, now = game.now()): Favour | null {
    if (!this.open(id) || !VILLAGER[id]) return null;
    const week = weekKey(now);
    const cur = this.map[id];
    if (cur?.week === week) return cur;
    const v = VILLAGER[id];
    // things the villager loves or likes that this farm can make or grow at its level (one of a kind each)
    const pool = [...new Set([...v.loves, ...v.likes])].filter((i) => ITEMS[i] && ITEMS[i].cat !== 'event' && (ITEM_LEVEL[i] ?? 999) <= game.level);
    if (pool.length < F.items) return null;
    const r = rand(`${game.state.seed}:${week}:${id}`);
    const pick: string[] = [];
    while (pick.length < F.items) { const i = pool[Math.floor(r() * pool.length)]; if (!pick.includes(i)) pick.push(i); }
    const items = Object.fromEntries(pick.map((i) => { const s = ITEMS[i].sell; return [i, s < 60 ? 6 : s < 300 ? 3 : s < 1500 ? 2 : 1]; }));
    const f: Favour = { week, items, until: now + F.days * DAY };
    this.map[id] = f;
    saves.saveSoon();
    return f;
  }

  /** Waiting favours across the village (for the badge). */
  waiting(now = game.now()): string[] { return VILLAGERS.map((v) => v.id).filter((id) => { const f = this.current(id, now); return !!f && !f.done && f.until > now; }); }

  canDo(id: string, now = game.now()): boolean {
    const f = this.current(id, now);
    return !!f && !f.done && f.until > now && Object.entries(f.items).every(([i, n]) => game.count(i) >= n);
  }

  /** Hand over the favour's things. Returns the tokens paid, or 0 when it cannot be done. */
  doFavour(id: string): number {
    const now = game.now();
    if (!this.canDo(id, now)) return 0;
    const f = this.current(id, now)!;
    for (const [i, n] of Object.entries(f.items)) game.as('favour').addItem(i, -n);
    f.done = true;
    game.state.village.tokens = this.tokens + F.tokens;
    game.addCoins(F.coins);
    game.incStat('favours_done');
    logEvent('favour', { villager: id });
    game.bus.emit('state:changed', {});
    saves.save();
    return F.tokens;
  }

  // ---- the token shop
  goldKeepsake(id: string): string | null { const k = VILLAGER[id]?.keepsake; return k ? `${k}_gold` : null; }
  hasGoldKeepsake(id: string): boolean {
    const g = this.goldKeepsake(id);
    return !!g && ((game.state.storage[g] ?? 0) > 0 || game.ownedCount(g) > 0);
  }
  buyGoldKeepsake(id: string): boolean {
    const g = this.goldKeepsake(id);
    if (!g || !this.open(id) || this.hasGoldKeepsake(id) || this.tokens < F.keepsakeGold) return false;
    game.state.village.tokens = this.tokens - F.keepsakeGold;
    game.state.storage[g] = (game.state.storage[g] ?? 0) + 1;
    game.discover(g, 'building');
    logEvent('favour_shop', { villager: id, item: g });
    saves.save();
    return true;
  }
  /** The villager's own gift pieces for the home (furniture.json `gift`). */
  pieces(id: string): string[] { return FURNITURE.filter((p) => p.gift === id).map((p) => p.id); }
  buyPiece(id: string, piece: string): boolean {
    if (!this.open(id) || !PIECE[piece] || PIECE[piece].gift !== id || this.tokens < F.piece) return false;
    game.state.village.tokens = this.tokens - F.piece;
    home.give(piece);
    logEvent('favour_shop', { villager: id, item: piece });
    saves.save();
    return true;
  }
  get prices(): { keepsakeGold: number; piece: number; tokens: number; coins: number; days: number } { return F; }
}

export const favours = new FavoursSystem();
Object.assign(window as unknown as Record<string, unknown>, { __favours: favours });
