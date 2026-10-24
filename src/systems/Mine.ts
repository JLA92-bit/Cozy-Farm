/**
 * 1.31 The Old Mine (mine.json). Sixty floors under the north island, in three layers. Each floor's rocks are laid out
 * from a seed of the local day and the floor (the same all day, new tomorrow); one rock hides the ladder down. Swings
 * come from the lantern (`MINE.swings` a day). A lift every `liftEvery` floors remembers how deep you got. Chests on
 * lift floors open once ever; carts and pools give something once a day. Bram makes the pickaxes and cracks geodes.
 * Drops are rolled from a seed too (day, floor, rock), so a floor cannot be re-rolled by leaving and coming back.
 * This file has the rules and the state; world/MineView.ts draws it and scenes/Mine.ts answers taps.
 */
import { ITEMS, MINE, SKILL_VALUES, type MineDrop, type MineLayer, type MineRockKind } from '../data';
import { game } from './Game';
import { saves } from './Save';
import { mail } from './Mail';
import { home } from './Home';
import { localDay } from './Progression';
import { roomDone } from './RestorationEffects';
import { hasSkillBonus, hasSkillPerk, skillLevel } from './SkillEffects';
import { hashString, rng } from '../world/Procedural';
import { logEvent } from '../online/Events';
import type { MineState } from './State';

type Vec = { x: number; y: number; z: number };
/** the Mining skill's numbers (skills.json values) */
const V = SKILL_VALUES as unknown as { mineBonusPerLevel: number; strongArmChance: number; prospectorChance: number; gemSenseMult: number; secondWindSwings: number; cartLuckMult: number };

/** The room a floor is drawn in: rocks stand on a grid of cells, half a room either side of the middle. */
export const MINE_ROOM = { half: 6.4, cells: 9 };
/** Where you come down (the ladder up) and where the lift stands, in room metres. */
export const MINE_ENTRY = { x: -4.6, z: -4.6 };
export const MINE_LIFT = { x: 4.6, z: -4.6 };

export interface MineRock { i: number; kind: MineRockKind; x: number; z: number; hard: number; size: number; rot: number; variant: number }
export interface MineFloor {
  floor: number; layer: MineLayer; rocks: MineRock[]; ladder: number;
  cart: { x: number; z: number; rot: number } | null; pool: { x: number; z: number; r: number } | null;
  lift: boolean; chest: boolean; seed: number;
}
export interface Strike { hit: number; need: number; broken: boolean; drops: { item: string; n: number }[]; ladder: boolean; first: string[] }

const pickWeighted = <T>(list: [T, number][] | { v: T; w: number }[], r: () => number): T => {
  const entries = (list as unknown[]).map((e) => (Array.isArray(e) ? { v: e[0] as T, w: e[1] as number } : (e as { v: T; w: number })));
  const total = entries.reduce((s, e) => s + e.w, 0);
  let x = r() * total;
  for (const e of entries) { x -= e.w; if (x <= 0) return e.v; }
  return entries[entries.length - 1].v;
};

export const layerOf = (floor: number): MineLayer => MINE.layers.find((l) => floor >= l.from && floor <= l.to) ?? MINE.layers[MINE.layers.length - 1];
export const isLiftFloor = (floor: number): boolean => floor > 0 && floor % MINE.liftEvery === 0;

class MineSystem {
  get st(): MineState {
    const s = (game.state.mine ??= { deepest: 0, pickaxe: 0, day: '', swings: 0, hits: {}, carts: [], pools: [], chests: [], letters: [], found: {} });
    const day = localDay(game.now());
    if (s.day !== day) { s.day = day; s.swings = 0; s.hits = {}; s.carts = []; s.pools = []; }
    return s;
  }

  /** The level is reached (Bram's letter comes): the entrance can be restored. */
  get unlocked(): boolean { return !!game.state?.tutorial.done && game.level >= MINE.level; }
  /** The entrance is restored: the floors can be visited. */
  get open(): boolean { return this.unlocked && roomDone(MINE.entrance.id); }

  maxSwings(): number { return MINE.swings + (hasSkillPerk('second_wind') ? V.secondWindSwings : 0); }
  swingsLeft(): number { return Math.max(0, this.maxSwings() - this.st.swings); }
  get deepest(): number { return game.state.mine?.deepest ?? 0; }
  pickaxe(): number { return game.state.mine?.pickaxe ?? 0; }
  power(): number { return MINE.pickaxes[this.pickaxe()]?.power ?? 1; }
  /** The pickaxe a floor's layer asks for, or null when yours will do. */
  needsPickaxe(floor: number): number | null { const l = layerOf(floor); return this.pickaxe() >= l.pickaxe ? null : l.pickaxe; }

  /** Floors the lift goes to: the top, and every lift floor reached. */
  lifts(): number[] {
    const out = [1];
    for (let f = MINE.liftEvery; f <= this.deepest && f <= MINE.floors; f += MINE.liftEvery) out.push(f);
    return out;
  }

  // ---------------------------------------------------------------------------------------- floors

  /** A floor as it is today (pure: the same for everyone on the same farm on the same day). */
  layout(floor: number, now = game.now()): MineFloor {
    const seed = hashString(`${game.state.seed}:mine:${localDay(now)}:${floor}`);
    const r = rng(seed);
    const layer = layerOf(floor);
    const { half, cells } = MINE_ROOM;
    const step = (half * 2) / cells;
    const lift = isLiftFloor(floor);
    const free = (x: number, z: number, gap: number) => Math.hypot(x - MINE_ENTRY.x, z - MINE_ENTRY.z) > gap && (!lift || Math.hypot(x - MINE_LIFT.x, z - MINE_LIFT.z) > gap);
    // a cart along a wall on some floors, a pool on some deeper floors
    const cart = r() < MINE.cart.chance ? { x: -half + 1.2, z: -1 + r() * 4, rot: Math.PI / 2 } : null;
    const pool = layer.id !== 'workings' && r() < MINE.pool.chance ? { x: 2.4 + r() * 1.6, z: 1.6 + r() * 2.2, r: 1.25 + r() * 0.35 } : null;
    const cellsFree: [number, number][] = [];
    for (let cx = 0; cx < cells; cx++) for (let cz = 0; cz < cells; cz++) {
      const x = -half + step * (cx + 0.5), z = -half + step * (cz + 0.5);
      if (!free(x, z, 2.0)) continue;
      if (cart && Math.abs(x - cart.x) < 1.4 && Math.abs(z - cart.z) < 1.8) continue;
      if (pool && Math.hypot(x - pool.x, z - pool.z) < pool.r + 0.7) continue;
      // keep the edge cells clear: the walls stand there
      if (cx === 0 || cz === 0 || cx === cells - 1 || cz === cells - 1) continue;
      cellsFree.push([x, z]);
    }
    // shuffle and take a handful
    for (let i = cellsFree.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cellsFree[i], cellsFree[j]] = [cellsFree[j], cellsFree[i]]; }
    const [lo, hi] = MINE.rocksPerFloor;
    const n = Math.min(cellsFree.length, lo + Math.floor(r() * (hi - lo + 1)));
    const gemMult = hasSkillPerk('gem_sense') ? V.gemSenseMult : 1;
    const kinds = Object.entries(layer.kinds).map(([k, w]) => ({ v: k as MineRockKind, w: (w ?? 0) * (k === 'gem' ? gemMult : 1) }));
    const rocks: MineRock[] = [];
    for (let i = 0; i < n; i++) {
      const [cx, cz] = cellsFree[i];
      const kind = pickWeighted(kinds, r);
      const deep = kind === 'stone' || layer.id === 'workings' ? 0 : MINE.rocks.deep;
      rocks.push({
        i, kind, x: cx + (r() - 0.5) * step * 0.45, z: cz + (r() - 0.5) * step * 0.45, hard: MINE.rocks[kind].hard + deep,
        size: kind === 'boulder' ? 1.15 + r() * 0.25 : kind === 'stone' ? 0.7 + r() * 0.25 : 0.85 + r() * 0.25, rot: r() * Math.PI * 2, variant: Math.floor(r() * 1000),
      });
    }
    // the ladder hides under a rock away from where you came down (the bottom floor has none)
    const far = rocks.filter((k) => Math.hypot(k.x - MINE_ENTRY.x, k.z - MINE_ENTRY.z) > 4);
    const pickFrom = far.length ? far : rocks;
    const ladder = floor >= MINE.floors || !pickFrom.length ? -1 : pickFrom[Math.floor(r() * pickFrom.length)].i;
    return { floor, layer, rocks, ladder, cart, pool, lift, chest: lift && !!MINE.chests[String(floor)], seed };
  }

  /** Swings a rock needs with your pickaxe. */
  need(rock: MineRock): number { return Math.max(1, Math.ceil(rock.hard / this.power())); }
  /** Swings already put into a rock today. */
  hitsOn(floor: number, i: number): number { return this.st.hits[floor]?.[i] ?? 0; }
  broken(floor: number, rock: MineRock): boolean { return this.hitsOn(floor, rock.i) >= this.need(rock); }
  /** The ladder down on this floor has been uncovered today. */
  ladderFound(f: MineFloor): boolean { const k = f.rocks[f.ladder]; return !!k && this.broken(f.floor, k); }

  /** One swing at a rock. Null when it cannot be swung at (no oil left, broken already, the mine closed). */
  swing(f: MineFloor, i: number, at?: Vec): Strike | null {
    const rock = f.rocks[i];
    if (!this.open || !rock || this.broken(f.floor, rock) || this.swingsLeft() <= 0) return null;
    const st = this.st;
    st.swings++;
    const hits = (st.hits[f.floor] ??= []);
    while (hits.length <= i) hits.push(0);
    const need = this.need(rock);
    // Strong Arm: now and then a rock breaks in one swing (seeded, so it is the same rock all day)
    const rr = rng(f.seed + i * 7919);
    const strong = hasSkillPerk('strong_arm') && rr() < V.strongArmChance;
    hits[i] = strong ? need : hits[i] + 1;
    game.incStat('mine_swings');
    const out: Strike = { hit: hits[i], need, broken: hits[i] >= need, drops: [], ladder: false, first: [] };
    if (out.broken) {
      out.drops = this.rollDrops(f, rock, rr);
      for (const d of out.drops) {
        game.addItem(d.item, d.n, at);
        if (this.noteFound(d.item)) out.first.push(d.item);
      }
      out.ladder = rock.i === f.ladder;
      game.incStat('rocks_broken');
      if (rock.kind === 'gem') game.incStat('mine_gems');
      if (rock.kind === 'fossil') game.incStat('mine_fossils');
      logEvent('mine_rock', { floor: f.floor, kind: rock.kind });
    }
    game.bus.emit('mine:changed', {});
    saves.saveSoon();
    return out;
  }

  private rollDrops(f: MineFloor, rock: MineRock, r: () => number): { item: string; n: number }[] {
    const list = f.layer.drops[rock.kind] as MineDrop[] | undefined;
    if (!list?.length) return [];
    const [item, , lo, hi] = list[Math.max(0, list.findIndex((d) => d[0] === pickWeighted(list.map((d) => [d[0], d[1]] as [string, number]), r)))];
    let n = lo + Math.floor(r() * (hi - lo + 1));
    // Prospector: ore rocks give one more ore now and then
    if (rock.kind === 'ore' && hasSkillPerk('prospector') && r() < V.prospectorChance) n++;
    const out = [{ item, n }];
    // every Mining level adds a little chance of a bonus find from the same rock
    if (r() < (skillLevel('mining') - 1) * V.mineBonusPerLevel) {
      const [extra] = list[Math.floor(r() * list.length)];
      if (extra === item) out[0].n++; else out.push({ item: extra, n: 1 });
    }
    return out;
  }

  /** Go down the ladder from `floor`. Null when the ladder is not found yet; a reason when the pickaxe is too weak. */
  descend(f: MineFloor): { ok: boolean; reason?: string; floor: number } {
    const next = f.floor + 1;
    if (!this.ladderFound(f) || next > MINE.floors) return { ok: false, floor: f.floor };
    const tier = this.needsPickaxe(next);
    if (tier !== null) return { ok: false, floor: f.floor, reason: `The rock below needs the ${MINE.pickaxes[tier].name.toLowerCase()}. Bram can make one.` };
    this.reach(next);
    return { ok: true, floor: next };
  }

  /** A floor reached for the first time: the lift remembers it, Bram writes at the bottom of each layer. */
  reach(floor: number): void {
    const st = this.st;
    if (floor <= st.deepest) return;
    st.deepest = floor;
    game.incStat('mine_floors');
    game.setGauge('mine_deepest', floor);
    if (floor >= 20) this.letter('caverns');
    if (floor >= 40) this.letter('deeps');
    if (floor >= MINE.floors) this.letter('bottom');
    logEvent('mine_floor', { floor });
    game.bus.emit('mine:changed', {});
    saves.save();
  }

  // ---------------------------------------------------------------------------------------- extras

  cartUsed(floor: number): boolean { return this.st.carts.includes(floor); }
  /** Empty a floor's mine cart (once a day). */
  emptyCart(f: MineFloor, at?: Vec): { item: string; n: number }[] | null {
    if (!this.open || !f.cart || this.cartUsed(f.floor)) return null;
    this.st.carts.push(f.floor);
    const mult = hasSkillBonus('cart_luck') ? V.cartLuckMult : 1;
    const got = (MINE.cart.drops[f.layer.id] ?? []).map(([item, n]) => ({ item, n: n * mult }));
    for (const g of got) { game.addItem(g.item, g.n, at); this.noteFound(g.item); }
    game.incStat('mine_carts');
    game.bus.emit('mine:changed', {});
    saves.save();
    return got;
  }

  poolUsed(floor: number): boolean { return this.st.pools.includes(floor); }
  /** Dip a net in a cave pool (once a day). */
  dipPool(f: MineFloor, at?: Vec): { item: string; n: number; first: boolean } | null {
    if (!this.open || !f.pool || this.poolUsed(f.floor)) return null;
    this.st.pools.push(f.floor);
    const r = rng(f.seed + 104729);
    const item = pickWeighted(MINE.pool.drops.map((d) => [d[0], d[1]] as [string, number]), r);
    const d = MINE.pool.drops.find((x) => x[0] === item)!;
    const n = (d[2] + Math.floor(r() * (d[3] - d[2] + 1))) * (hasSkillBonus('cart_luck') ? V.cartLuckMult : 1);
    game.addItem(item, n, at);
    const first = this.noteFound(item);
    game.incStat('mine_pools');
    game.bus.emit('mine:changed', {});
    saves.save();
    return { item, n, first };
  }

  chestOpened(floor: number): boolean { return this.st.chests.includes(floor); }
  /** The chest on a lift floor (once ever). */
  openChest(floor: number, at?: Vec): { coins: number; gems: number; items: Record<string, number> } | null {
    const c = MINE.chests[String(floor)];
    if (!this.open || !c || this.chestOpened(floor) || floor > this.deepest) return null;
    this.st.chests.push(floor);
    game.addCoins(c.coins, at);
    game.addGems(c.gems);
    for (const [k, n] of Object.entries(c.items)) { game.addItem(k, n, at); this.noteFound(k); }
    game.incStat('mine_chests');
    logEvent('mine_chest', { floor });
    game.bus.emit('mine:changed', {});
    saves.save();
    return c;
  }

  /** Bram cracks a geode open for a few coins: one find from mine.json `geode`. */
  crackGeode(at?: Vec): { item: string; first: boolean } | null {
    if (!this.open || game.count('geode') <= 0 || game.coins < MINE.geodeCost) return null;
    if (!game.spend(MINE.geodeCost)) return null;
    game.addItem('geode', -1);
    const n = game.stat('geodes_cracked');
    const item = pickWeighted(MINE.geode, rng(hashString(`${game.state.seed}:geode:${n}`)));
    game.addItem(item, 1, at);
    const first = this.noteFound(item);
    game.incStat('geodes_cracked');
    game.bus.emit('mine:changed', {});
    saves.save();
    return { item, first };
  }

  /** The next pickaxe Bram can make, or null when you have the best. */
  nextPickaxe(): (typeof MINE.pickaxes)[number] | null { return MINE.pickaxes[this.pickaxe() + 1] ?? null; }
  canBuyPickaxe(): boolean {
    const p = this.nextPickaxe();
    return !!p && game.coins >= p.coins && Object.entries(p.needs).every(([k, n]) => game.count(k) >= n);
  }
  buyPickaxe(): boolean {
    const p = this.nextPickaxe();
    if (!this.open || !p || !this.canBuyPickaxe()) return false;
    if (!game.spend(p.coins)) return false;
    for (const [k, n] of Object.entries(p.needs)) game.addItem(k, -n);
    this.st.pickaxe++;
    game.incStat('pickaxes_made');
    logEvent('mine_pickaxe', { tier: this.st.pickaxe });
    game.bus.emit('mine:changed', {});
    saves.save();
    return true;
  }

  /** Remember a find (counts kept per item; true the first time, for the "new find" toast). */
  noteFound(item: string): boolean {
    if (!ITEMS[item]) return false;
    const st = this.st;
    const first = !st.found[item];
    st.found[item] = (st.found[item] ?? 0) + 1;
    return first;
  }
  foundIds(): string[] { return Object.keys(game.state.mine?.found ?? {}).filter((k) => ITEMS[k]); }

  /** One line for the banner. */
  describe(floor: number): string {
    if (floor <= 0) return this.deepest ? `Deepest: floor ${this.deepest}. ${this.swingsLeft()} swings left today.` : 'The lamps are lit. Down the ladder to floor 1!';
    const l = layerOf(floor);
    return `${l.name}. ${this.swingsLeft()} of ${this.maxSwings()} swings left today.`;
  }

  // ---------------------------------------------------------------------------------------- letters

  private letter(id: 'intro' | 'caverns' | 'deeps' | 'bottom'): void {
    const st = this.st;
    if (st.letters.includes(id)) return;
    st.letters.push(id);
    const l = MINE.letters[id];
    mail.send('bram', l.title, l.body.replace('{farmer}', game.state.player.name), l.attach);
    if (l.piece) home.give(l.piece);
    saves.save();
  }

  /** Start listening (once, after the farm is loaded): Bram's letter when the mine can be opened. */
  init(): void {
    const check = () => { if (this.unlocked && game.state.player.created) this.letter('intro'); };
    check();
    game.bus.on('levelup', check);
  }
}

export const mine = new MineSystem();
