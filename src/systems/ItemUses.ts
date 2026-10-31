import { ANIMALS, BOATVISITS, BUILDING, CRAFT_RECIPES, CRITTERS, ITEMS, MINE, MUSEUM, RECIPES, ROOM, VILLAGERS } from '../data';
import { game } from './Game';
import { restoration } from './Restoration';
import { museum } from './Museum';
import { mine } from './Mine';
import { requestedCount } from './Economy';

/**
 * 1.34.3 "Used for": what in the game wants an item, so players don't sell what they need later.
 * The same sources validate-data counts as an item's use; finished bundles, donated Museum pieces
 * and pickaxes already made are left out, since nothing wants those any more; projects not open yet are too.
 */
export interface ItemUse { kind: 'wanted' | 'recipe' | 'project' | 'museum' | 'feed' | 'gift' | 'boat' | 'craft' | 'treat' | 'pickaxe'; text: string; icon: string; need?: number }

const list = (names: string[], max = 3): string => (names.length > max ? `${names.slice(0, max).join(', ')} and ${names.length - max} more` : names.join(', '));

export function itemUses(item: string): ItemUse[] {
  const out: ItemUse[] = [];
  const asked = requestedCount(item);
  if (asked) out.push({ kind: 'wanted', text: `Orders and the truck want ${asked}`, icon: 'clipboard', need: asked });
  // recipes, grouped by workshop
  const by = new Map<string, string[]>();
  for (const r of RECIPES) if (r.in[item] && game.level >= r.level) by.set(r.building, [...(by.get(r.building) ?? []), ITEMS[r.item]?.name ?? r.item]);
  for (const [b, names] of by) out.push({ kind: 'recipe', text: `${BUILDING[b]?.name ?? b}: ${list(names)}`, icon: BUILDING[b]?.icon ?? 'hammer' });
  for (const c of CRAFT_RECIPES) if (c.in?.[item]) out.push({ kind: 'craft', text: `Bram's forge: ${c.name}`, icon: c.icon });
  // unfinished bundles of every project (restoration rooms, manor wings, trails, grove, treehouse, estate, the mine)
  for (const room of Object.values(ROOM)) {
    if (!restoration.isOpen(room.id) || restoration.isDone(room.id)) continue;
    for (const b of room.bundles) {
      if (!b.wants[item] || restoration.bundleDone(room.id, b.id)) continue;
      const left = restoration.lines(room.id, b.id).find((l) => l.item === item)?.left ?? b.wants[item];
      if (left > 0) out.push({ kind: 'project', text: `${room.name}: ${b.name}`, icon: b.icon, need: left });
    }
  }
  for (const s of MUSEUM.shelves) if (s.items?.includes(item) && !museum.donated(s.id).includes(item)) out.push({ kind: 'museum', text: `Museum: ${s.name}`, icon: s.icon, need: 1 });
  for (const p of MINE.pickaxes) {
    const idx = MINE.pickaxes.indexOf(p);
    if (p.needs[item] && idx > mine.pickaxe()) out.push({ kind: 'pickaxe', text: `Bram's ${p.name}`, icon: p.icon, need: p.needs[item] });
  }
  for (const a of ANIMALS) if (a.feed === item) out.push({ kind: 'feed', text: `Feed for ${a.name}s`, icon: 'heart' });
  for (const c of CRITTERS.families) if (c.treats.includes(item)) out.push({ kind: 'treat', text: `A treat for the ${c.name}`, icon: c.icon });
  const loves = VILLAGERS.filter((v) => v.loves.includes(item) || ITEMS[item]?.bouquet).map((v) => v.name);
  const likes = VILLAGERS.filter((v) => !loves.includes(v.name) && v.likes.includes(item)).map((v) => v.name);
  if (loves.length) out.push({ kind: 'gift', text: `${list(loves, 6)} ${loves.length === 1 ? 'loves' : 'love'} it`, icon: 'heart' });
  if (likes.length) out.push({ kind: 'gift', text: `${list(likes, 6)} ${likes.length === 1 ? 'likes' : 'like'} it`, icon: 'hug' });
  const boats = BOATVISITS.themes.filter((t) => t.items.includes(item)).map((t) => t.name);
  if (boats.length) out.push({ kind: 'boat', text: `Boat visitors: ${list(boats)}`, icon: BOATVISITS.themes.find((t) => t.items.includes(item))?.icon ?? 'package' });
  return out;
}

/** How many of an item something still asks for (orders, truck, unfinished bundles, Museum, pickaxes). */
export function itemNeeded(item: string): number {
  return itemUses(item).reduce((s, u) => s + (u.need ?? 0), 0);
}
