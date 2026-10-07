import { FISH, FISHING, ITEMS, type FishDef, type FishTime, type JunkDef } from '../data';
import { game } from './Game';
import { localDay } from './Progression';
import { RAIN_RARE_FISH, weatherToday } from './Weather';
import type { FishingState } from './State';
import { countStars, rollQuality, type Quality } from './Quality';

/**
 * Fishing at the dock: free casts per day, bait, what bites when, rolling a catch and recording it.
 * Pure game logic; the dock scene and the mini-game live in world/FishingView.ts and ui/panels/FishingPanel.ts.
 */

export type Catch =
  | { kind: 'fish'; id: string; def: FishDef; size: number }
  | { kind: 'junk'; id: string; def: JunkDef; size: number };

export interface CatchResult {
  id: string; kind: 'fish' | 'junk'; name: string; icon: string; size: number;
  firstCatch: boolean; record: boolean; prevRecord: number; xp: number;
  coins: number; gems: number; note?: string; line?: string; rarity?: string;
  /** 1.8: silver (1) or gold (2) catch */
  quality?: Quality;
}

export const TIME_ORDER: FishTime[] = ['morning', 'day', 'dusk', 'night'];
export const TIME_LABEL: Record<FishTime, string> = { morning: 'Morning', day: 'Day', dusk: 'Dusk', night: 'Night' };
export const TIME_ICON: Record<FishTime, string> = { morning: 'sunrise', day: 'sun', dusk: 'sunrise', night: 'moon' };
export const RARITY_LABEL: Record<string, string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', legendary: 'Legendary', mythic: 'Mythic' };
/** Rare, legendary and mythic: the reel marker glows and the Book card gets a coloured frame. */
export const isRareTier = (r?: string): boolean => r === 'rare' || r === 'legendary' || r === 'mythic';

export function emptyFishing(): FishingState {
  return { caught: {}, records: {}, freeDay: '', freeUsed: 0, casts: 0 };
}

/** Time of day for a day/night phase 0..1 (Environment.phase). */
export function timeOfDay(phase: number): FishTime {
  for (const t of TIME_ORDER) {
    const [a, b] = FISHING.times[t];
    if (a <= b ? phase >= a && phase < b : phase >= a || phase < b) return t;
  }
  return 'day';
}

/** Format a size in cm: "8.5 cm", "34 cm", "1.2 m". */
export function sizeText(cm: number): string {
  if (cm >= 100) return `${parseFloat((cm / 100).toFixed(cm >= 1000 ? 1 : 2))} m`;
  return cm < 10 ? `${cm.toFixed(1)} cm` : `${Math.round(cm)} cm`;
}

class FishingSystem {
  /** Day/night phase provider (set by the dock scene). */
  phase: () => number = () => 0.3;

  get st(): FishingState { return (game.state.fishing ??= emptyFishing()); }
  get unlocked(): boolean { return game.level >= FISHING.level; }
  get time(): FishTime { return timeOfDay(this.phase()); }

  private rollDay(): void {
    const today = localDay(game.now());
    if (this.st.freeDay !== today) { this.st.freeDay = today; this.st.freeUsed = 0; }
  }
  get freeLeft(): number { this.rollDay(); return Math.max(0, FISHING.freeCastsPerDay - this.st.freeUsed); }
  get bait(): number { return game.count(FISHING.baitItem); }
  get canCast(): boolean { return this.freeLeft > 0 || this.bait > 0; }

  /** Pay for one cast (a free cast first, then bait). Returns how it was paid, or null. */
  payCast(): 'free' | 'bait' | null {
    if (this.freeLeft > 0) { this.st.freeUsed++; this.st.casts++; return 'free'; }
    if (this.bait > 0) { game.addItem(FISHING.baitItem, -1); this.st.casts++; return 'bait'; }
    return null;
  }
  /** Give a cast back (the player reeled in before anything bit). */
  refund(paid: 'free' | 'bait'): void {
    if (paid === 'free') this.st.freeUsed = Math.max(0, this.st.freeUsed - 1);
    else game.addItem(FISHING.baitItem, 1);
    this.st.casts = Math.max(0, this.st.casts - 1);
  }

  buyBait(): boolean {
    const { qty, coins } = FISHING.baitShop;
    if (!game.spend(coins)) return false;
    game.addItem(FISHING.baitItem, qty);
    game.bus.emit('sfx', { name: 'purchase' });
    return true;
  }

  /** Rare fish landed so far, from the catch log, so ones caught before the Rare Finds award existed count too. */
  syncRare(): void {
    const n = FISHING.species.reduce((s, f) => s + (f.rarity === 'rare' ? this.st.caught[f.id] ?? 0 : 0), 0);
    if (n !== game.stat('fish_rare')) game.setGauge('fish_rare', n);
  }

  /** Mythic fish stay away until a legendary one has been landed. */
  get mythicAwake(): boolean {
    return !FISHING.mythicNeedsLegendary || FISHING.species.some((f) => f.rarity === 'legendary' && this.st.caught[f.id]);
  }

  /** Species that can bite right now (level and time of day; mythic ones once awake). */
  biting(time = this.time): FishDef[] {
    const awake = this.mythicAwake;
    return FISHING.species.filter((f) => f.level <= game.level && f.times.includes(time) && (awake || f.rarity !== 'mythic'));
  }

  /** What is on the hook this cast. */
  roll(rnd: () => number = Math.random): Catch {
    if (rnd() < FISHING.junkChance) {
      const total = FISHING.junk.reduce((s, j) => s + j.weight, 0);
      let x = rnd() * total;
      let pick = FISHING.junk[0];
      for (const j of FISHING.junk) { x -= j.weight; if (x <= 0) { pick = j; break; } }
      return { kind: 'junk', id: pick.id, def: pick, size: this.size(pick.size ?? [0, 0], rnd) };
    }
    const pool = this.biting();
    // pick a rarity tier first (only tiers with something biting), then a species in it
    const tiers = (Object.keys(FISHING.rarityChance) as FishDef['rarity'][]).filter((r) => pool.some((f) => f.rarity === r));
    // 1.8 weather: rare fish bite a little more often in the rain
    const rain = weatherToday() === 'rain';
    const chance = (r: FishDef['rarity']) => FISHING.rarityChance[r] * (rain && isRareTier(r) ? RAIN_RARE_FISH : 1);
    const total = tiers.reduce((s, r) => s + chance(r), 0);
    let x = rnd() * total;
    let tier = tiers[0];
    for (const r of tiers) { x -= chance(r); if (x <= 0) { tier = r; break; } }
    const list = pool.filter((f) => f.rarity === tier);
    const def = list[Math.floor(rnd() * list.length)] ?? FISH.sardine;
    return { kind: 'fish', id: def.id, def, size: this.size(def.size, rnd) };
  }

  /** Sizes lean small: big ones are a treat. */
  private size([lo, hi]: [number, number], rnd: () => number): number {
    const v = lo + (hi - lo) * Math.pow(rnd(), 1.6);
    return Math.round(v * (v < 10 ? 10 : 1)) / (v < 10 ? 10 : 1);
  }

  /** Land a catch: item, XP, records, stats, book. */
  land(c: Catch): CatchResult {
    const st = this.st;
    const it = ITEMS[c.id];
    const prev = st.records[c.id] ?? 0;
    const firstCatch = !st.caught[c.id];
    const record = !firstCatch && c.size > prev;
    st.caught[c.id] = (st.caught[c.id] ?? 0) + 1;
    if (c.size > prev) st.records[c.id] = c.size;
    const res: CatchResult = {
      id: c.id, kind: c.kind, name: it?.name ?? 'Message in a bottle', icon: it?.icon ?? 'bottle', size: c.size,
      firstCatch, record, prevRecord: prev, xp: 0, coins: 0, gems: 0,
    };
    if (c.kind === 'fish') {
      res.rarity = c.def.rarity;
      res.xp = Math.round(c.def.xp * (record ? 1 + FISHING.recordXpBonus : 1));
      // 1.8: a fish can be a silver or gold catch (the catch card shows it)
      res.quality = rollQuality('fish', c.id);
      game.addItem(c.id, 1, undefined, res.quality);
      countStars(res.quality === 1 ? 1 : 0, res.quality === 2 ? 1 : 0);
      game.incStat('fish_caught');
      game.incStat(`catch_${c.id}`);
      if (c.def.rarity === 'rare') this.syncRare();
      if (c.def.rarity === 'legendary') game.incStat('fish_legendary');
      if (c.def.rarity === 'mythic') game.incStat('fish_mythic');
      game.setGauge('fish_species', FISHING.species.filter((f) => st.caught[f.id]).length);
    } else {
      const j = c.def;
      res.xp = j.xp;
      game.incStat('junk_caught');
      if (ITEMS[c.id]) { game.addItem(c.id, 1); res.line = j.lines?.[Math.floor(Math.random() * j.lines.length)]; }
      else {
        // a message in a bottle: a sweet note and a little gift
        res.coins = (j.coinsBase ?? 0) + (j.coinsPerLevel ?? 0) * game.level;
        res.gems = Math.random() < (j.gemChance ?? 0) ? 1 : 0;
        res.note = FISHING.notes[Math.floor(Math.random() * FISHING.notes.length)];
        if (res.coins) game.addCoins(res.coins);
        if (res.gems) game.addGems(res.gems);
      }
    }
    if (res.xp) game.addXp(res.xp);
    return res;
  }

  /** Book / record line for a species: "Best 34 cm, caught 12". */
  recordOf(id: string): { best: number; count: number } { return { best: this.st.records[id] ?? 0, count: this.st.caught[id] ?? 0 }; }

  /** Common fish that bite at any time of day and were caught before: fair game for orders and the truck. */
  orderable(): string[] {
    if (!this.unlocked) return [];
    return FISHING.species.filter((f) => f.rarity === 'common' && f.level <= game.level && f.times.length === TIME_ORDER.length && this.st.caught[f.id]).map((f) => f.id);
  }

  /** Where and when a fish bites, for hints: "Night, level 12". */
  whenText(id: string): string {
    const f = FISH[id];
    if (!f) return 'Fished up at the dock';
    const when = f.times.length === TIME_ORDER.length ? 'Any time' : f.times.map((t) => TIME_LABEL[t]).join(', ');
    if (f.level > game.level) return `${when}, from level ${f.level}`;
    return f.rarity === 'mythic' && !this.mythicAwake ? `${when}, after a legendary catch` : when;
  }
}

export const fishing = new FishingSystem();

/** Book card extras for the Fish page: biggest catch and count, or where and when to look. */
export function fishBookLine(id: string, seen: boolean): string {
  if (!seen) return FISH[id] ? fishing.whenText(id) : 'Fished up at the dock';
  const r = fishing.recordOf(id);
  return r.best ? `Best ${sizeText(r.best)}, x${r.count.toLocaleString('en-US')}` : `x${r.count.toLocaleString('en-US')}`;
}
