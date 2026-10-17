/**
 * Game data for the dashboard's player inspector: names for ids found in a save (items, buildings, villagers,
 * rooms...) and the game's own item icons. Read straight from the game's JSON in src/data, so new content shows
 * with its real name without touching the dashboard.
 */
import itemsJson from '../../src/data/items.json';
import buildingsJson from '../../src/data/buildings.json';
import cropsJson from '../../src/data/crops.json';
import animalsJson from '../../src/data/animals.json';
import villagersJson from '../../src/data/villagers.json';
import skillsJson from '../../src/data/skills.json';
import achievementsJson from '../../src/data/achievements.json';
import restorationJson from '../../src/data/restoration.json';
import manorJson from '../../src/data/manor.json';
import estateJson from '../../src/data/estate.json';
import woodsJson from '../../src/data/woods.json';
import wildlifeJson from '../../src/data/wildlife.json';
import museumJson from '../../src/data/museum.json';
import farmhandsJson from '../../src/data/farmhands.json';
import recipesJson from '../../src/data/recipes.json';
import levelsJson from '../../src/data/levels.json';
import changelogJson from '../../src/data/changelog.json';

type Named = { id: string; name: string };
interface Room extends Named { icon?: string; villager?: string; opensAt?: number; bundles?: { id: string; name: string; wants: Record<string, number> }[] }

export const ITEMS = (itemsJson as unknown as { items: Record<string, { name: string; cat?: string; sell?: number; icon?: string }> }).items;
export const BUILDINGS = (buildingsJson as unknown as { buildings: (Named & { cat: string; level: number; cost: number; size: number[]; icon?: string; animal?: string; tree?: string; path?: boolean })[] }).buildings;
export const BUILDING = new Map(BUILDINGS.map((b) => [b.id, b]));
export const CROPS = (cropsJson as unknown as { crops: (Named & { level: number })[]; trees: (Named & { item: string })[] });
export const ANIMALS = (animalsJson as unknown as { animals: (Named & { house: string; product: string })[] }).animals;
export const VILLAGERS = (villagersJson as unknown as { villagers: (Named & { role: string; icon: string; birthday?: number[]; loves?: string[] })[]; friendship: { pointsPerHeart: number; maxHearts: number } });
export const SKILLS = (skillsJson as unknown as { skills: (Named & { icon: string })[]; xpLevels: number[] });
export const ACHIEVEMENTS = (achievementsJson as unknown as { achievements: (Named & { category: string; stat: string; tiers: number[]; desc: string; icon: string })[] }).achievements;
export const WILDLIFE = (wildlifeJson as unknown as { species: (Named & { set: string })[]; sets: (Named & { icon: string })[] });
export const MUSEUM = (museumJson as unknown as { shelves: (Named & { icon: string; items?: string[] })[] }).shelves;
export const FARMHANDS = (farmhandsJson as unknown as { hands: (Named & { level: number; icon: string })[] }).hands;
export const RECIPES = (recipesJson as unknown as { recipes: { id: string; building: string; item: string; level: number }[] }).recipes;
export const LEVELS = (levelsJson as unknown as { levels: { level: number; xpToNext: number }[] }).levels;
export const LATEST_VERSION: string = (changelogJson as unknown as { releases: { version: string }[] }).releases[0]?.version ?? '';

const woods = woodsJson as unknown as { trails: Room[]; grove: { stages: Room[] }; treehouse: { stages: Room[]; furnishings: Room[] }; regions?: Named[]; critters?: { families?: Named[] } | Named[] };

/** Every bundle-built project in the game, grouped the way the game shows them. */
export const PROJECT_GROUPS: { id: string; name: string; rooms: Room[] }[] = [
  { id: 'square', name: 'Village square', rooms: (restorationJson as unknown as { rooms: Room[] }).rooms },
  { id: 'manor', name: (manorJson as unknown as { name?: string }).name ?? 'Willowmere Manor', rooms: (manorJson as unknown as { wings: Room[] }).wings },
  ...(estateJson as unknown as { projects: (Room & { stages: Room[] })[] }).projects.map((p) => ({ id: p.id, name: p.name, rooms: p.stages })),
  { id: 'trails', name: 'Wild Woods trails', rooms: woods.trails },
  { id: 'grove', name: 'The Elder Oak', rooms: woods.grove.stages },
  { id: 'treehouse', name: 'The Treehouse', rooms: [...woods.treehouse.stages, ...woods.treehouse.furnishings] },
];

const NAMES = new Map<string, string>();
const add = (id: string | undefined, name: string | undefined) => { if (id && name && !NAMES.has(id)) NAMES.set(id, name); };
for (const [id, it] of Object.entries(ITEMS)) add(id, it.name);
for (const b of BUILDINGS) add(b.id, b.name);
for (const c of [...CROPS.crops, ...CROPS.trees]) add(c.id, c.name);
for (const a of ANIMALS) add(a.id, a.name);
for (const v of VILLAGERS.villagers) add(v.id, v.name);
for (const s of SKILLS.skills) add(s.id, s.name);
for (const a of ACHIEVEMENTS) add(a.id, a.name);
for (const s of [...WILDLIFE.species, ...WILDLIFE.sets]) add(s.id, s.name);
for (const s of MUSEUM) add(s.id, s.name);
for (const f of FARMHANDS) add(f.id, f.name);
for (const g of PROJECT_GROUPS) for (const r of g.rooms) add(r.id, r.name);
for (const r of RECIPES) add(r.id, ITEMS[r.item]?.name);

/** A readable name for any game id ("sweet_potato" -> "Sweet Potato"); unknown ids are tidied up. */
export function nameOf(id: string | null | undefined): string {
  if (!id) return '-';
  return NAMES.get(id) ?? id.replace(/^proc:/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The game's icon for an item or building (served by the game next to the dashboard). */
export function iconUrl(id: string): string {
  const key = ITEMS[id]?.icon ?? BUILDING.get(id)?.icon ?? id;
  return `../play/assets/icons/${key}.svg`;
}

/** Skill level (1-10) from skill XP. */
export function skillLevel(xp: number): number {
  let lvl = 1;
  SKILLS.xpLevels.forEach((need, i) => { if (xp >= need) lvl = i + 1; });
  return Math.min(10, lvl);
}

/** XP needed from this level to the next (levels past the table are flat, like the game). */
export function xpToNext(level: number): number {
  const row = LEVELS.find((l) => l.level === level) ?? LEVELS[LEVELS.length - 1];
  return row?.xpToNext ?? 0;
}
