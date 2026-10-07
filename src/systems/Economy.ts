import {
  ANIMALS, BUILDINGS, COSMETICS, CROPS, ECONOMY, FRIENDSHIP, ITEMS, ITEM_LEVEL, LEVEL_DATA, RECIPES, TREES, VILLAGERS, itemXp,
} from '../data';
import { buildings } from './Buildings';
import { game, type Vec } from './Game';
import { hints } from './Hints';
import type { Order, OrderLine, StallSlot } from './State';
import { rng, hashString } from '../world/Procedural';
import { isBuilt } from './Timers';
import { HAZEL_PRICE_MULT, hasPerk } from './Perks';
import { recipeAvailable } from './Production';
import { village } from './Village';

// ======================================================================== obtainable items
/** Extra sources of obtainable items from features outside this file (e.g. fish from the dock). */
export const extraObtainable: (() => string[])[] = [];

/** Items the player can currently produce (used to generate fair orders). */
export function obtainableItems(): string[] {
  const lv = game.level;
  const out = new Set<string>();
  for (const c of CROPS) if (c.level <= lv) out.add(c.id);
  for (const fn of extraObtainable) for (const i of fn()) out.add(i);
  for (const t of TREES) if (game.buildingsOf(t.id).length) out.add(t.item);
  for (const a of ANIMALS) if (game.buildingsOf(a.house).some((b) => (b.animals?.length ?? 0) > 0)) out.add(a.product);
  // recipes need a finished building and ingredients the player can really get; repeat until stable so
  // chains (wheat -> feed -> eggs -> corn bread) resolve whatever order the recipe list is in
  const makeable = RECIPES.filter((r) => r.level <= lv && recipeAvailable(r) && game.buildingsOf(r.building).some((b) => isBuilt(b, game.now())));
  for (let changed = true; changed;) {
    changed = false;
    for (const r of makeable) {
      if (out.has(r.item)) continue;
      if (Object.keys(r.in).every((i) => out.has(i))) { out.add(r.item); changed = true; }
    }
  }
  return [...out].filter((i) => ITEMS[i] && ITEMS[i].cat !== 'feed' && ITEMS[i].cat !== 'event');
}

/**
 * Items the player still needs for ready orders and unfilled truck crates (needed minus owned).
 * Used to flag recipes, warn before selling, and point at what to make next.
 */
export function wantedItems(now = game.now()): Map<string, number> {
  const need = new Map<string, number>();
  for (const o of game.state.orders.list) if (o.readyAt <= now) for (const l of o.lines) need.set(l.item, (need.get(l.item) ?? 0) + l.qty);
  for (const c of game.state.truck?.crates ?? []) if (!c.filled) need.set(c.item, (need.get(c.item) ?? 0) + c.qty);
  for (const [item, n] of need) {
    const short = n - game.count(item);
    if (short > 0) need.set(item, short); else need.delete(item);
  }
  return need;
}

/** How many of an item ready orders and the truck ask for in total (owned or not). */
export function requestedCount(item: string, now = game.now()): number {
  let n = 0;
  for (const o of game.state.orders.list) if (o.readyAt <= now) for (const l of o.lines) if (l.item === item) n += l.qty;
  for (const c of game.state.truck?.crates ?? []) if (!c.filled && c.item === item) n += c.qty;
  return n;
}

function maxQty(): number {
  let q = 3;
  for (const [lv, n] of ECONOMY.orders.maxQtyByLevel) if (game.level >= lv) q = n;
  return q;
}

// ======================================================================== order board
/** 1.8: the villager who signed an order. Orders keep their old `npc` number (0-11), so old saves map too. */
export function orderVillager(o: Order): string {
  return VILLAGERS[(Math.abs(Math.floor(o.npc)) || 0) % VILLAGERS.length].id;
}

export class OrderSystem {
  slots(): number {
    let n = 3;
    for (const [lv, s] of Object.entries(LEVEL_DATA.orderSlots)) if (game.level >= Number(lv)) n = s as number;
    return n;
  }

  /** Keep the board filled; replacements appear after their `readyAt`. */
  refresh(): void {
    const o = game.state.orders;
    // the very first order is always wheat, so the tutorial can walk through it
    if (o.nextId === 1 && !o.list.length) o.list.push(this.generate(game.now(), [{ item: 'wheat', qty: 2 }]));
    while (o.list.length < this.slots()) o.list.push(this.generate(game.now()));
    game.bus.emit('orders:changed', {});
  }

  generate(readyAt: number, forced?: OrderLine[]): Order {
    const o = game.state.orders;
    const id = o.nextId++;
    const r = rng(hashString(`${game.state.seed}:order:${id}`));
    let lines: OrderLine[];
    if (forced) lines = forced;
    else {
      const pool = obtainableItems();
      // favour newer, more valuable items a little, but keep cheap staples common
      const weights = pool.map((i) => 1 + Math.min(3, (ITEM_LEVEL[i] ?? 1) / Math.max(1, game.level) * 2) + (ITEMS[i].cat === 'crop' ? 1 : 0));
      const pick = () => {
        let x = r() * weights.reduce((a, b) => a + b, 0);
        for (let k = 0; k < pool.length; k++) { x -= weights[k]; if (x <= 0) return pool[k]; }
        return pool[0];
      };
      const nLines = Math.min(ECONOMY.orders.maxLines, game.level < 3 ? 1 : game.level < 8 ? 1 + Math.floor(r() * 2) : 1 + Math.floor(r() * 3));
      const used = new Set<string>();
      // prefer goods the other orders on the board do not already ask for, so the board feels varied
      const others = new Set(o.list.flatMap((x) => x.lines.map((l) => l.item)));
      lines = [];
      for (let k = 0; k < nLines; k++) {
        let item = pick();
        for (let t = 0; t < 8 && (used.has(item) || (t < 5 && others.has(item))); t++) item = pick();
        if (used.has(item)) continue;
        used.add(item);
        const value = ITEMS[item].sell;
        const cap = Math.max(1, Math.round(maxQty() * (value > 150 ? 0.4 : value > 60 ? 0.7 : 1)));
        lines.push({ item, qty: 1 + Math.floor(r() * cap) });
      }
    }
    const value = lines.reduce((s, l) => s + ITEMS[l.item].sell * l.qty, 0);
    const coins = Math.round(value * ECONOMY.orders.coinMult * (1 + buildings.bonuses().orderCoins));
    const xp = Math.max(ECONOMY.orders.minXp, lines.reduce((s, l) => s + itemXp(l.item) * l.qty, 0));
    const gems = r() < ECONOMY.orders.gemChance ? 1 : 0;
    return { id, lines, coins, xp, gems, readyAt, npc: Math.floor(r() * 12) };
  }

  canComplete(o: Order): boolean { return o.readyAt <= game.now() && o.lines.every((l) => game.count(l.item) >= l.qty); }

  complete(orderId: number, at?: Vec): boolean {
    const list = game.state.orders.list;
    const idx = list.findIndex((o) => o.id === orderId);
    if (idx < 0 || !this.canComplete(list[idx])) return false;
    const o = list[idx];
    for (const l of o.lines) game.addItem(l.item, -l.qty);
    game.addCoins(o.coins, at);
    game.addXp(o.xp, at);
    if (o.gems) game.addGems(o.gems, at);
    game.incStat('orders_completed');
    // 1.8: the villager who signed the order is pleased
    village.addPoints(orderVillager(o), FRIENDSHIP.order, 'order');
    list[idx] = this.generate(game.now() + ECONOMY.orders.refillSec * 1000);
    game.bus.emit('order:completed', { orderId, coins: o.coins, xp: o.xp });
    game.bus.emit('orders:changed', {});
    game.bus.emit('tutorial', { signal: 'order_completed' });
    game.bus.emit('sfx', { name: 'coins2' });
    return true;
  }

  discard(orderId: number): void {
    const list = game.state.orders.list;
    const idx = list.findIndex((o) => o.id === orderId);
    if (idx < 0) return;
    list[idx] = this.generate(game.now() + ECONOMY.orders.discardSec * 1000);
    game.bus.emit('orders:changed', {});
  }

  anyCompletable(): boolean { return game.state.orders.list.some((o) => this.canComplete(o)); }
}

// ======================================================================== truck
export class TruckSystem {
  get depot() { return game.buildingsOf('truck_depot').find((b) => isBuilt(b, game.now())); }

  tick(now: number): void {
    const s = game.state;
    if (!this.depot) return;
    if (s.truck && now >= s.truck.leavesAt) {
      // ran out of time: the truck leaves with whatever was filled (no penalty).
      // The cooldown counts from when it actually left, so a long absence does not add a wait.
      const leftAt = s.truck.leavesAt;
      s.truck = null;
      s.truckNextAt = leftAt + ECONOMY.truck.cooldownSec * 1000;
      game.bus.emit('truck:changed', {});
      if (now - leftAt < 60000) game.bus.emit('toast', { title: 'The truck had to leave', sub: 'It will be back soon', icon: 'truck' });
    }
    if (!s.truck && now >= s.truckNextAt) this.arrive(now);
  }

  private arrive(now: number): void {
    const pool = obtainableItems();
    if (pool.length < 3) return;
    const r = rng(hashString(`${game.state.seed}:truck:${now}`));
    const [lo, hi] = ECONOMY.truck.crates;
    const n = Math.min(hi, lo + Math.floor(game.level / 8));
    const crates = [];
    // different goods in every crate while the pool allows it
    const left = [...pool];
    for (let i = 0; i < n; i++) {
      const item = left.length ? left.splice(Math.floor(r() * left.length), 1)[0] : pool[Math.floor(r() * pool.length)];
      const value = ITEMS[item].sell;
      // fish are caught one cast at a time, so their crates are half size
      const qty = Math.max(2, Math.round((value > 150 ? 2 : value > 60 ? 4 : 7) * ECONOMY.truck.qtyMult * (0.7 + r() * 0.6) * (ITEMS[item].cat === 'fish' ? 0.5 : 1)));
      crates.push({ item, qty, coins: Math.round(value * qty * ECONOMY.truck.coinMult), xp: itemXp(item) * qty, filled: false });
    }
    const bonus = Math.round(crates.reduce((s, c) => s + c.coins, 0) * ECONOMY.truck.bonusMult);
    game.state.truck = { crates, arrivesAt: now, leavesAt: now + ECONOMY.truck.durationSec * 1000, bonusCoins: bonus };
    game.bus.emit('truck:changed', {});
    game.bus.emit('toast', { title: 'The delivery truck is here!', sub: hints.explain('truck_arrival', 'truck') ? 'Fill its crates for big rewards' : undefined, icon: 'truck' });
  }

  fill(i: number, at?: Vec): boolean {
    const t = game.state.truck;
    const c = t?.crates[i];
    if (!t || !c || c.filled || game.count(c.item) < c.qty) return false;
    game.addItem(c.item, -c.qty);
    c.filled = true;
    game.addCoins(c.coins, at);
    game.addXp(c.xp, at);
    game.incStat('truck_crates');
    game.bus.emit('truck:changed', {});
    game.bus.emit('sfx', { name: 'collect' });
    return true;
  }

  get complete(): boolean { return !!game.state.truck?.crates.every((c) => c.filled); }

  /** Send a fully loaded truck: bonus coins + a mystery crate. */
  send(at?: Vec): boolean {
    const t = game.state.truck;
    if (!t || !this.complete) return false;
    game.addCoins(t.bonusCoins, at);
    game.state.crates.push(ECONOMY.truck.rewardCrate);
    game.bus.emit('crate:granted', { rarity: ECONOMY.truck.rewardCrate });
    game.incStat('trucks_completed');
    game.state.truck = null;
    game.state.truckNextAt = game.now() + ECONOMY.truck.cooldownSec * 1000;
    game.bus.emit('truck:changed', {});
    game.bus.emit('sfx', { name: 'truck' });
    return true;
  }
}

// ======================================================================== roadside stall
export class StallSystem {
  get building() { return game.buildingsOf('roadside_stall').find((b) => isBuilt(b, game.now())); }

  ensureSlots(): StallSlot[] {
    const s = game.state.stall;
    while (s.slots.length < ECONOMY.stall.slots) s.slots.push({ item: null, qty: 0, price: 0, listedAt: 0, soldAt: null, buyDelay: 0 });
    return s.slots;
  }

  priceRange(item: string, qty: number): [number, number, number] {
    const v = ITEMS[item].sell * qty;
    return [Math.max(1, Math.round(v * ECONOMY.stall.minPriceMult)), Math.round(v * ECONOMY.stall.maxPriceMult), Math.round(v * ECONOMY.stall.defaultPriceMult)];
  }

  list(i: number, item: string, qty: number, price: number): boolean {
    const slot = this.ensureSlots()[i];
    if (!slot || slot.item || game.count(item) < qty || qty <= 0) return false;
    const [min, max] = this.priceRange(item, qty);
    price = Math.max(min, Math.min(max, Math.round(price)));
    game.addItem(item, -qty);
    // cheaper listings sell faster
    const [lo, hi] = ECONOMY.stall.buyDelaySec;
    const t = (price - min) / Math.max(1, max - min);
    const delay = (lo + (hi - lo) * (0.2 + t * 0.8) * (0.6 + Math.random() * 0.8)) * 1000;
    Object.assign(slot, { item, qty, price, listedAt: game.now(), soldAt: game.now() + delay, buyDelay: delay });
    game.bus.emit('stall:changed', {});
    return true;
  }

  sold(slot: StallSlot): boolean { return !!slot.item && !!slot.soldAt && slot.soldAt <= game.now(); }

  collect(i: number, at?: Vec): number {
    const slot = this.ensureSlots()[i];
    if (!slot || !this.sold(slot)) return 0;
    const coins = slot.price;
    game.addCoins(coins, at);
    game.incStat('stall_sales', slot.qty);
    Object.assign(slot, { item: null, qty: 0, price: 0, listedAt: 0, soldAt: null, buyDelay: 0 });
    game.bus.emit('stall:changed', {});
    return coins;
  }

  /** Take an unsold listing back. */
  cancel(i: number): void {
    const slot = this.ensureSlots()[i];
    if (!slot?.item || this.sold(slot)) return;
    game.addItem(slot.item, slot.qty);
    Object.assign(slot, { item: null, qty: 0, price: 0, listedAt: 0, soldAt: null, buyDelay: 0 });
    game.bus.emit('stall:changed', {});
  }

  buySlot(): boolean {
    const s = this.ensureSlots();
    if (s.length >= ECONOMY.stall.maxSlots || !game.spend(0, ECONOMY.stall.slotCostGems)) return false;
    s.push({ item: null, qty: 0, price: 0, listedAt: 0, soldAt: null, buyDelay: 0 });
    game.bus.emit('stall:changed', {});
    return true;
  }

  soldCount(): number { return this.ensureSlots().filter((s) => this.sold(s)).length; }
}

// ======================================================================== travelling merchant
export type MerchantOffer =
  | { key: string; kind: 'decor'; id: string; price: number; was: number }
  | { key: string; kind: 'cosmetic'; id: string; name: string; price: number }
  | { key: string; kind: 'items'; id: string; qty: number; price: number; was: number }
  | { key: string; kind: 'gems'; qty: number; price: number };

export class MerchantSystem {
  visit(now = game.now()): { index: number; present: boolean; leavesAt: number; nextAt: number } {
    const c = ECONOMY.merchant.cycleSec * 1000, v = ECONOMY.merchant.visitSec * 1000;
    const index = Math.floor(now / c);
    const into = now - index * c;
    const present = game.level >= ECONOMY.merchant.level && into < v;
    return { index, present, leavesAt: index * c + v, nextAt: (index + 1) * c };
  }

  stock(index = this.visit().index): MerchantOffer[] {
    const r = rng(hashString(`${game.state.seed}:merchant:${index}`));
    const offers: MerchantOffer[] = [];
    // a decoration from a few levels ahead, at a discount
    const decor = BUILDINGS.filter((b) => b.cat === 'decor' && !b.event && !b.path && b.level <= game.level + 8 && b.level > 2);
    if (decor.length) {
      const d = decor[Math.floor(r() * decor.length)];
      offers.push({ key: `d:${d.id}`, kind: 'decor', id: d.id, price: Math.round(d.cost * ECONOMY.merchant.discount), was: d.cost });
    }
    // a crate-only cosmetic
    const cos = [...COSMETICS.hats, ...COSMETICS.accessories].filter((c) => c.unlock.crate && !game.state.cosmetics.includes(c.id));
    if (cos.length) {
      const c = cos[Math.floor(r() * cos.length)];
      offers.push({ key: `c:${c.id}`, kind: 'cosmetic', id: c.id, name: c.name, price: 1500 + game.level * 60 });
    }
    // bulk goods, ready right now
    const pool = obtainableItems();
    for (let k = 0; k < 1 && pool.length; k++) {
      const item = pool[Math.floor(r() * pool.length)];
      const qty = 5 + Math.floor(r() * 6);
      // priced a little over barn value so they cannot be flipped for profit; they save time on orders
      offers.push({ key: `i:${item}`, kind: 'items', id: item, qty, price: Math.round(ITEMS[item].sell * qty * ECONOMY.merchant.bulkPriceMult), was: 0 });
    }
    offers.push({ key: 'g', kind: 'gems', qty: 3, price: ECONOMY.merchant.gemPriceCoins * 3 });
    // 1.8: Hazel's 6-heart friend discount (bulk goods never drop below barn value, so they cannot be flipped)
    if (hasPerk('hazel_discount')) {
      for (const o of offers) {
        const floor = o.kind === 'items' ? ITEMS[o.id].sell * o.qty : 1;
        o.price = Math.max(floor, Math.round(o.price * HAZEL_PRICE_MULT));
      }
    }
    return offers.slice(0, ECONOMY.merchant.stockSize);
  }

  bought(offer: MerchantOffer): boolean { return !!game.state.merchant.bought[`${this.visit().index}:${offer.key}`]; }

  buy(offer: MerchantOffer, at?: Vec): boolean {
    if (!this.visit().present || this.bought(offer) || !game.spend(offer.price)) return false;
    game.state.merchant.bought[`${this.visit().index}:${offer.key}`] = 1;
    // forget old visits
    for (const k of Object.keys(game.state.merchant.bought)) if (Number(k.split(':')[0]) < this.visit().index - 2) delete game.state.merchant.bought[k];
    if (offer.kind === 'decor') game.state.storage[offer.id] = (game.state.storage[offer.id] ?? 0) + 1;
    else if (offer.kind === 'cosmetic') { game.state.cosmetics.push(offer.id); game.discover(offer.id, 'cosmetic'); }
    else if (offer.kind === 'items') game.addItem(offer.id, offer.qty, at);
    else game.addGems(offer.qty, at);
    game.incStat('merchant_buys');
    game.bus.emit('sfx', { name: 'purchase' });
    return true;
  }
}

export const orders = new OrderSystem();
export const truck = new TruckSystem();
export const stall = new StallSystem();
export const merchant = new MerchantSystem();
