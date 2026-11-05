import { ANIMAL, BUILDING, FISHING, ITEMS, MUSEUM, PARCELS, ROOM, VILLAGERS } from '../data';
import { game, QUALITY_MULT } from './Game';
import { restoration } from './Restoration';
import { buildings } from './Buildings';
import { mine } from './Mine';
import { skillLevel } from './SkillEffects';
import { isBuilt } from './Timers';
import { village } from './Village';

/**
 * 1.45 What a farm is short of right now, best first. Parcels and crate item rolls choose from this list. Only things
 * the farm has already had are listed, so a gift never ticks the Collection Book, and Museum pieces are left out.
 */
export type NeedGroup = 'orders' | 'project' | 'upgrade' | 'low';
export const NEED_GROUPS: NeedGroup[] = ['orders', 'project', 'upgrade', 'low'];
export interface Need {
  id: string; group: NeedGroup;
  /** an item id, or 'coins' */
  item: string;
  star: 0 | 1 | 2; missing: number; why: string; from: string;
  /** limited to PARCELS.lineShare of what is missing (projects and upgrades) */
  capped: boolean;
}

const MUSEUM_ITEMS = new Set(MUSEUM.shelves.flatMap((s) => s.items ?? []));

export function senderFor(item: string): string {
  const senders = PARCELS.senders as Record<string, string>;
  return senders[item === 'coins' ? 'coins' : ITEMS[item]?.cat ?? ''] ?? 'pip';
}
const canGift = (item: string): boolean => {
  if (item === 'coins') return true;
  const def = ITEMS[item];
  return !!def && def.cat !== 'event' && def.sell > 0 && !MUSEUM_ITEMS.has(item) && !!game.state.collection[`item:${item}`];
};
/** Holding a gold item ticks the Book's gold column, so gold only comes once the farm has had that item in gold. */
const hadGold = (item: string): boolean => game.stat(`gold_${item}`) > 0 || game.qualityCounts(item)[2] > 0;
/** What one of an item counts for against a parcel's worth. */
export const unitValue = (item: string, star: 0 | 1 | 2): number => (item === 'coins' ? 1 : (ITEMS[item]?.sell ?? 1) * (star === 2 ? QUALITY_MULT[2] : star === 1 ? QUALITY_MULT[1] : 1));

export function needsNow(now = game.now()): Need[] {
  const out: Need[] = [];
  const add = (n: Need) => { if (n.missing > 0 && canGift(n.item) && (n.star < 2 || hadGold(n.item))) out.push(n); };
  // orders and the truck: only what is short
  const asked = new Map<string, number>();
  for (const o of game.state.orders.list) if (o.readyAt <= now) for (const l of o.lines) asked.set(l.item, (asked.get(l.item) ?? 0) + l.qty);
  for (const c of game.state.truck?.crates ?? []) if (!c.filled) asked.set(c.item, (asked.get(c.item) ?? 0) + c.qty);
  for (const [item, n] of asked) add({ id: `order:${item}`, group: 'orders', item, star: 0, missing: n - game.count(item), why: 'for your orders', from: senderFor(item), capped: false });
  // open project bundles
  for (const room of Object.values(ROOM)) {
    if (!restoration.isOpen(room.id) || restoration.isDone(room.id)) continue;
    for (const b of room.bundles) {
      if (restoration.bundleDone(room.id, b.id)) continue;
      for (const l of restoration.lines(room.id, b.id)) {
        if (l.left <= 0) continue;
        const star = (b.minStar ?? 0) as 0 | 1 | 2;
        add({ id: `line:${room.id}:${b.id}:${l.item}`, group: 'project', item: l.item, star: l.item === 'coins' ? 0 : star, missing: l.left - restoration.held(room.id, b.id, l.item), why: `for ${room.name}: ${b.name}`, from: room.villager ?? senderFor(l.item), capped: true });
      }
    }
  }
  // the next upgrades (one entry for each kind and level of building)
  const seen = new Set<string>();
  for (const b of game.state.buildings) {
    const key = `${b.type}:${b.level}`;
    if (seen.has(key) || !isBuilt(b, now)) continue;
    seen.add(key);
    const info = buildings.upgradeInfo(b);
    if (!info || info.needLevel > game.level) continue;
    const name = BUILDING[b.type].name;
    for (const [item, n] of Object.entries(info.goods ?? {})) add({ id: `up:${key}:${item}`, group: 'upgrade', item, star: 0, missing: n - game.count(item), why: `for ${name} level ${info.next}`, from: 'bram', capped: true });
    if (b.type === 'farmhouse') add({ id: 'up:farmhouse', group: 'upgrade', item: 'coins', star: 0, missing: info.cost - game.coins, why: `towards Farmhouse level ${info.next}`, from: 'hazel', capped: false });
  }
  const pick = mine.nextPickaxe();
  if (pick && skillLevel('mining') >= (pick.skill ?? 0)) for (const [item, n] of Object.entries(pick.needs)) add({ id: `pick:${pick.id}:${item}`, group: 'upgrade', item, star: 0, missing: n - game.count(item), why: `for Bram's ${pick.name}`, from: 'bram', capped: true });
  // running low
  const low = PARCELS.low;
  const herd = new Map<string, number>();
  for (const b of game.state.buildings) {
    const animal = BUILDING[b.type]?.animal;
    if (animal && b.animals?.length) herd.set(ANIMAL[animal].feed, (herd.get(ANIMAL[animal].feed) ?? 0) + b.animals.length);
  }
  for (const [feed, n] of herd) if (game.count(feed) < n * low.feedLowPerAnimal) add({ id: `low:${feed}`, group: 'low', item: feed, star: 0, missing: n * low.feedTopPerAnimal - game.count(feed), why: 'you are running low', from: 'hazel', capped: false });
  if (game.level >= FISHING.level && game.count(FISHING.baitItem) < low.baitLow) add({ id: 'low:bait', group: 'low', item: FISHING.baitItem, star: 0, missing: low.baitTop - game.count(FISHING.baitItem), why: 'you are running low', from: 'tom', capped: false });
  return out;
}

/** The fallback gift: something a villager loves that the farm has already had, for whoever is least close so far. */
export function lovedGift(): { item: string; who: string } | null {
  for (const v of [...VILLAGERS].sort((a, b) => village.points(a.id) - village.points(b.id))) {
    const item = v.loves.find((k) => canGift(k));
    if (item) return { item, who: v.id };
  }
  return null;
}
