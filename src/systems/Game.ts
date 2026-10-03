import { EventBus } from '../core/EventBus';
import { MAP, chunkOf, inMap, rotatedSize } from '../world/Grid';
import {
  BUILDING, ECONOMY, FARMHOUSE, ITEMS, LEVELS, MAX_LEVEL, type BuildingDef,
} from '../data';
import type { Obstacle, PlacedBuilding, SaveData } from './State';

export interface Vec { x: number; y: number; z: number }

export interface GameEvents extends Record<string, unknown> {
  coins: { delta: number; total: number; at?: Vec };
  gems: { delta: number; total: number; at?: Vec };
  xp: { delta: number; total: number; at?: Vec };
  levelup: { level: number };
  item: { item: string; delta: number; total: number; at?: Vec };
  stat: { stat: string; value: number; delta: number };
  'building:placed': { b: PlacedBuilding; isNew: boolean };
  'building:moved': { b: PlacedBuilding };
  'building:removed': { b: PlacedBuilding; stored: boolean };
  'building:changed': { b: PlacedBuilding };
  'building:complete': { b: PlacedBuilding };
  'obstacle:cleared': { o: Obstacle };
  'land:expanded': { chunk: string };
  'crop:planted': { b: PlacedBuilding; crop: string };
  'crop:harvested': { b: PlacedBuilding; crop: string; qty: number };
  'tree:harvested': { b: PlacedBuilding; item: string; qty: number };
  'animal:fed': { b: PlacedBuilding; index: number };
  'animal:collected': { b: PlacedBuilding; index: number; item: string };
  'animal:bought': { b: PlacedBuilding; animal: string };
  'production:queued': { b: PlacedBuilding; recipe: string };
  'production:collected': { b: PlacedBuilding; items: string[] };
  'order:completed': { orderId: number; coins: number; xp: number };
  'orders:changed': Record<string, never>;
  'truck:changed': Record<string, never>;
  'stall:changed': Record<string, never>;
  'achievement': { id: string; tier: number };
  'quests:changed': Record<string, never>;
  'quest:completed': { kind: 'daily' | 'weekly' | 'event'; text: string };
  'crate:granted': { rarity: string };
  'collection:new': { id: string; kind: string };
  'charm': { value: number };
  'toast': { title: string; sub?: string; icon?: string; style?: string };
  'tutorial': { signal: string };
  'state:changed': Record<string, never>;
  'look:changed': Record<string, never>;
  'sfx': { name: string; at?: Vec };
}

export class Game {
  readonly bus = new EventBus<GameEvents>();
  state!: SaveData;
  /** uid of building occupying each tile (0 = free). */
  occB = new Int32Array(MAP * MAP);
  /** obstacle id + 1 occupying each tile. */
  occO = new Int32Array(MAP * MAP);
  private unlockedSet = new Set<string>();

  now(): number { return Date.now() + (this.state?.debugTimeOffset ?? 0); }

  load(state: SaveData): void {
    this.state = state;
    this.unlockedSet = new Set(state.land.unlocked);
    this.rebuildOccupancy();
  }

  // ------------------------------------------------------------ land & occupancy
  isUnlocked(chunk: string): boolean { return this.unlockedSet.has(chunk); }
  unlockChunk(chunk: string): void {
    if (this.unlockedSet.has(chunk)) return;
    this.unlockedSet.add(chunk);
    this.state.land.unlocked.push(chunk);
  }
  get unlockedChunks(): Set<string> { return this.unlockedSet; }

  rebuildOccupancy(): void {
    this.occB.fill(0);
    this.occO.fill(0);
    for (const b of this.state.buildings) this.markBuilding(b, b.uid);
    for (const o of this.state.obstacles) this.occO[o.z * MAP + o.x] = o.id + 1;
  }

  markBuilding(b: PlacedBuilding, value: number): void {
    const def = BUILDING[b.type];
    const [w, d] = rotatedSize(def.size, b.rot);
    for (let z = b.z; z < b.z + d; z++) for (let x = b.x; x < b.x + w; x++) if (inMap(x, z)) this.occB[z * MAP + x] = value;
  }

  buildingAt(tx: number, tz: number): PlacedBuilding | undefined {
    if (!inMap(tx, tz)) return undefined;
    const uid = this.occB[tz * MAP + tx];
    return uid ? this.byUid(uid) : undefined;
  }
  obstacleAt(tx: number, tz: number): Obstacle | undefined {
    if (!inMap(tx, tz)) return undefined;
    const id = this.occO[tz * MAP + tx] - 1;
    return id >= 0 ? this.state.obstacles.find((o) => o.id === id) : undefined;
  }
  byUid(uid: number): PlacedBuilding | undefined { return this.state.buildings.find((b) => b.uid === uid); }
  buildingsOf(type: string): PlacedBuilding[] { return this.state.buildings.filter((b) => b.type === type); }

  /** Can `type` with rotation be placed with its corner at (x, z)? `ignoreUid` = the building being moved. */
  canPlace(type: string, x: number, z: number, rot: number, ignoreUid = 0): boolean {
    const def = BUILDING[type];
    const [w, d] = rotatedSize(def.size, rot);
    for (let tz = z; tz < z + d; tz++) {
      for (let tx = x; tx < x + w; tx++) {
        if (!this.tileFree(tx, tz, ignoreUid)) return false;
      }
    }
    return true;
  }
  tileFree(tx: number, tz: number, ignoreUid = 0): boolean {
    if (!inMap(tx, tz)) return false;
    if (!this.unlockedSet.has(chunkOf(tx, tz))) return false;
    const b = this.occB[tz * MAP + tx];
    if (b && b !== ignoreUid) return false;
    if (this.occO[tz * MAP + tx]) return false;
    return true;
  }

  // ------------------------------------------------------------ currencies & items
  get coins(): number { return this.state.player.coins; }
  get gems(): number { return this.state.player.gems; }
  get level(): number { return this.state.player.level; }

  addCoins(n: number, at?: Vec): void {
    if (!n) return;
    this.state.player.coins = Math.max(0, this.state.player.coins + n);
    if (n > 0) this.incStat('coins_earned', n);
    else this.incStat('coins_spent', -n);
    this.bus.emit('coins', { delta: n, total: this.state.player.coins, at });
  }
  addGems(n: number, at?: Vec): void {
    if (!n) return;
    this.state.player.gems = Math.max(0, this.state.player.gems + n);
    if (n > 0) this.incStat('gems_earned', n);
    this.bus.emit('gems', { delta: n, total: this.state.player.gems, at });
  }
  canAfford(coins: number, gems = 0): boolean { return this.coins >= coins && this.gems >= gems; }
  /** Spend coins/gems if affordable. */
  spend(coins: number, gems = 0): boolean {
    if (!this.canAfford(coins, gems)) return false;
    if (coins) this.addCoins(-coins);
    if (gems) this.addGems(-gems);
    return true;
  }

  count(item: string): number { return this.state.inventory[item] ?? 0; }
  addItem(item: string, n: number, at?: Vec): void {
    if (!n) return;
    const inv = this.state.inventory;
    inv[item] = Math.max(0, (inv[item] ?? 0) + n);
    if (inv[item] === 0) delete inv[item];
    this.bus.emit('item', { item, delta: n, total: inv[item] ?? 0, at });
    if (n > 0) this.discover(item, 'item');
  }
  has(items: Record<string, number>): boolean {
    return Object.entries(items).every(([k, v]) => this.count(k) >= v);
  }
  take(items: Record<string, number>): boolean {
    if (!this.has(items)) return false;
    for (const [k, v] of Object.entries(items)) this.addItem(k, -v);
    return true;
  }
  sellItem(item: string, n: number, at?: Vec): number {
    n = Math.min(n, this.count(item));
    if (n <= 0) return 0;
    const value = Math.round(ITEMS[item].sell * n * ECONOMY.barn.sellMult);
    this.addItem(item, -n);
    this.addCoins(value, at);
    this.bus.emit('sfx', { name: 'coins' });
    return value;
  }

  // ------------------------------------------------------------ xp & levels
  xpToNext(level = this.level): number { return LEVELS[level - 1]?.xpToNext ?? 0; }
  addXp(n: number, at?: Vec): void {
    if (n <= 0) return;
    const p = this.state.player;
    if (p.level >= MAX_LEVEL) { this.bus.emit('xp', { delta: n, total: p.xp, at }); return; }
    p.xp += n;
    this.bus.emit('xp', { delta: n, total: p.xp, at });
    while (p.level < MAX_LEVEL && p.xp >= this.xpToNext(p.level)) {
      p.xp -= this.xpToNext(p.level);
      p.level++;
      const def = LEVELS[p.level - 1];
      if (def.coins) this.addCoins(def.coins);
      if (def.gems) this.addGems(def.gems);
      this.setGauge('level', p.level);
      this.bus.emit('levelup', { level: p.level });
    }
  }

  // ------------------------------------------------------------ stats
  stat(name: string): number { return this.state.stats[name] ?? 0; }
  incStat(name: string, n = 1): void {
    if (!n) return;
    const v = (this.state.stats[name] ?? 0) + n;
    this.state.stats[name] = v;
    this.bus.emit('stat', { stat: name, value: v, delta: n });
  }
  /** Record a current value; stats keep the maximum ever reached. */
  setGauge(name: string, value: number): void {
    const prev = this.state.stats[name] ?? 0;
    if (value > prev) {
      this.state.stats[name] = value;
      this.bus.emit('stat', { stat: name, value, delta: value - prev });
    }
  }

  // ------------------------------------------------------------ collection book
  discover(id: string, kind: string): void {
    const key = `${kind}:${id}`;
    if (this.state.collection[key]) return;
    this.state.collection[key] = this.now();
    this.setGauge('collection_entries', Object.keys(this.state.collection).length);
    this.bus.emit('collection:new', { id, kind });
  }

  // ------------------------------------------------------------ farmhouse & caps
  get farmhouseLevel(): number {
    const fh = this.buildingsOf('farmhouse')[0];
    return fh?.level ?? 1;
  }
  capFor(def: BuildingDef): number {
    if (def.max) return def.max;
    const caps = FARMHOUSE.caps as Record<string, number[]>;
    if (!def.cap || def.cap === 'none') return Infinity;
    const arr = caps[def.cap];
    return arr ? arr[Math.min(arr.length, this.farmhouseLevel) - 1] : Infinity;
  }
  /** Current count against the cap the building belongs to (placed + stored). */
  capUsage(def: BuildingDef): number {
    if (def.max) return this.buildingsOf(def.id).length + (this.state.storage[def.id] ?? 0);
    if (def.cap === 'production' || def.cap === 'animal') return this.buildingsOf(def.id).length + (this.state.storage[def.id] ?? 0);
    if (!def.cap || def.cap === 'none') return 0;
    let n = 0;
    for (const b of this.state.buildings) if (BUILDING[b.type].cap === def.cap) n++;
    for (const [t, c] of Object.entries(this.state.storage)) if (BUILDING[t]?.cap === def.cap) n += c;
    return n;
  }
  ownedCount(type: string): number { return this.buildingsOf(type).length + (this.state.storage[type] ?? 0); }

  /** Coin price of the next copy of a building. */
  priceOf(def: BuildingDef): number {
    if (def.costStep) return def.cost + def.costStep * Math.max(0, this.ownedCount(def.id) - (def.freeCount ?? 0));
    return def.cost;
  }

  newUid(): number { return this.state.nextUid++; }

  emitChanged(): void { this.bus.emit('state:changed', {}); }
}

export const game = new Game();
