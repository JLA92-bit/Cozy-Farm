/**
 * 1.43 Titles, farm records and milestone gifts.
 * - Titles: small names earned from the late-game tracks, one chosen to show on the Me screen. Looks only.
 * - Farm records: the farm's own totals, read from the stat counters it already keeps.
 * - Milestones: from level 80 every 10th level brings a gift to choose (gems, a decoration or a home piece).
 */
import { BUILDINGS, CRITTERS, FURNITURE, VILLAGERS } from '../data';
import { game } from './Game';
import { saves } from './Save';
import { village } from './Village';
import { skillLevel } from './SkillEffects';
import { critters } from './Critters';
import { projectDone } from './Estate';
import { home } from './Home';
import type { SkillId } from '../data';

export interface TitleDef { id: string; name: string; how: string; earned: () => boolean }

const SKILL_IDS: SkillId[] = ['farming', 'animals', 'fishing', 'cooking', 'crafting', 'foraging', 'mining'];

export const TITLES: TitleDef[] = [
  { id: 'centurion', name: 'Centurion', how: 'Reach level 100', earned: () => game.level >= 100 },
  { id: 'expert', name: 'Expert Hand', how: 'Any skill at level 20', earned: () => SKILL_IDS.some((s) => skillLevel(s) >= 20) },
  { id: 'angler', name: 'Master Angler', how: 'Fishing level 20', earned: () => skillLevel('fishing') >= 20 },
  { id: 'delver', name: 'Deep Delver', how: 'Reach floor 100 of the Old Mine', earned: () => (game.state.mine?.deepest ?? 0) >= 100 },
  { id: 'valley', name: 'Friend of the Valley', how: 'Best friends with all six villagers', earned: () => VILLAGERS.every((v) => village.hearts(v.id) >= 10) },
  { id: 'woods', name: 'Trusted by the Woods', how: 'Every critter family at 10 hearts', earned: () => CRITTERS.families.every((c) => critters.hearts(c.id) >= CRITTERS.maxHearts) },
  { id: 'grand', name: 'Grand Master', how: '10 Grand Masteries', earned: () => (game.state.mastery?.grand?.length ?? 0) >= 10 },
  { id: 'gold', name: 'Gold Collector', how: 'Fill 5 Collection Book pages in gold', earned: () => (game.state.goldPages?.length ?? 0) >= 5 },
  { id: 'stargazer', name: 'Stargazer', how: 'Build the Observatory', earned: () => projectDone('observatory') },
  { id: 'miller', name: "Miller's Friend", how: 'Build the Windmill Mill', earned: () => projectDone('windmill') },
  { id: 'keeper', name: 'Keeper of Willowmere', how: 'Restore Willowmere Manor', earned: () => !!game.state.restoration?.manor },
  { id: 'boss', name: 'Old Hand', how: 'A farmhand at level 5', earned: () => Object.values(game.state.farmhands?.days ?? {}).some((d) => d >= 40) },
];

class TitlesSystem {
  earned(): TitleDef[] { return TITLES.filter((t) => t.earned()); }
  current(): TitleDef | null { const id = game.state.title; return TITLES.find((t) => t.id === id && t.earned()) ?? null; }
  choose(id: string | null): boolean {
    if (id === null) { delete game.state.title; saves.save(); return true; }
    const t = TITLES.find((x) => x.id === id);
    if (!t || !t.earned()) return false;
    game.state.title = id;
    saves.save();
    return true;
  }

  /** The farm's own totals (name, value), from its stat counters. */
  records(): [string, number][] {
    const s = (k: string) => game.stat(k);
    return ([
      ['Crops harvested', s('crops_harvested') + s('fruit_harvested')],
      ['Goods made', s('items_produced')],
      ['Animal goods collected', s('animal_products')],
      ['Fish caught', s('fish_caught')],
      ['Rocks broken in the mine', s('rocks_broken')],
      ['Deepest mine floor', game.state.mine?.deepest ?? 0],
      ['Orders delivered', s('orders_completed')],
      ['Boats served', s('boat_deliveries')],
      ['Expeditions', s('expeditions_done')],
      ['Masteries', game.state.mastery?.done.length ?? 0],
      ['Favours done', s('favours_done')],
      ['Gold-star items', s('gold_items')],
    ] as [string, number][]).filter(([, v]) => v > 0);
  }

  // ---- milestones: level 80, 90, 100...
  /** The oldest milestone level reached with its gift not chosen yet, or null. */
  pendingMilestone(): number | null {
    const got = game.state.milestones ?? [];
    for (let l = 80; l <= game.level; l += 10) if (!got.includes(l)) return l;
    return null;
  }
  /** The three gifts on offer for a milestone (the same every time it is looked at). */
  offers(level: number): { gems: number; decor: string | null; piece: string | null } {
    const seed = (game.state.seed + level * 7919) >>> 0;
    const decor = BUILDINGS.filter((b) => b.cat === 'decor' && !b.event && b.cost > 0 && b.level <= game.level && b.level >= 40);
    const pieces = FURNITURE.filter((p) => !p.gift && (p as { price?: number }).price !== undefined);
    return { gems: 25, decor: decor.length ? decor[seed % decor.length].id : null, piece: pieces.length ? pieces[(seed >>> 3) % pieces.length].id : null };
  }
  claim(level: number, pick: 'gems' | 'decor' | 'piece'): boolean {
    if (this.pendingMilestone() !== level) return false;
    const o = this.offers(level);
    if (pick === 'gems') game.addGems(o.gems);
    else if (pick === 'decor' && o.decor) { game.state.storage[o.decor] = (game.state.storage[o.decor] ?? 0) + 1; game.discover(o.decor, 'building'); }
    else if (pick === 'piece' && o.piece) home.give(o.piece);
    else return false;
    (game.state.milestones ??= []).push(level);
    game.incStat('milestones');
    saves.save();
    return true;
  }
}

export const titles = new TitlesSystem();
Object.assign(window as unknown as Record<string, unknown>, { __titles: titles });
