/** Typed access to the JSON game data. All balance numbers live in the JSON files next to this one. */
import cropsJson from './crops.json';
import animalsJson from './animals.json';
import itemsJson from './items.json';
import recipesJson from './recipes.json';
import buildingsJson from './buildings.json';
import levelsJson from './levels.json';
import cosmeticsJson from './cosmetics.json';
import economyJson from './economy.json';
import achievementsJson from './achievements.json';
import questsJson from './quests.json';
import rewardsJson from './rewards.json';
import eventsJson from './events.json';
import tutorialJson from './tutorial.json';
import landJson from './land.json';

export interface CropDef {
  id: string; name: string; level: number; seedCost: number; growSec: number; yield: number; xp: number;
  stages: string[]; ready: { model: string; tint?: string; produce?: string };
}
export interface TreeDef {
  id: string; name: string; item: string; level: number; cost: number; growSec: number; yield: number; xp: number;
  model: string; fruit: string; leafTint?: string;
}
export interface AnimalDef {
  id: string; name: string; level: number; house: string; cost: number; feed: string; product: string;
  produceSec: number; xp: number; model: string; scale: number; sound: string; variant?: string;
}
export interface ItemDef { id: string; name: string; cat: string; sell: number; icon: string }
export interface RecipeDef {
  id: string; building: string; level: number; in: Record<string, number>; item: string; out: number; sec: number; xp: number;
}
export interface BuildingDef {
  id: string; name: string; cat: 'special' | 'farm' | 'animal' | 'production' | 'decor';
  size: [number, number]; level: number; cost: number; costStep?: number; eventCost?: number; event?: string;
  buildSec?: number; model: string; parts?: string[]; fit: number; charm: number; cap?: string; max?: number;
  tree?: string; animal?: string; upgradeMult?: number; icon?: string; desc?: string; path?: boolean; glow?: number;
}
export interface LevelDef { level: number; xpToNext: number; coins: number; gems: number }
export interface Unlock { level?: number; achievement?: string; event?: string; cost?: number; crate?: string; default?: boolean }
export interface CosmeticDef { id: string; name: string; unlock: Unlock; model?: string; body?: string }
export interface AchievementDef {
  id: string; name: string; category: string; stat: string; tiers: number[]; desc: string; icon: string; hidden?: boolean; gauge?: boolean;
}
export interface QuestTemplate { id: string; text: string; stat: string; n: number[]; level: number; icon: string }
export interface EventDef {
  id: string; name: string; start: string; end: string; token: string; icon: string; color: string; blurb: string;
  quests: { text: string; stat: string; n: number; reward: { tokens?: number; coins?: number; gems?: number; crate?: string } }[];
}
export interface TutorialStep { id: string; text: string; target: string; wait: string }

export const CROPS: CropDef[] = cropsJson.crops as CropDef[];
export const TREES: TreeDef[] = cropsJson.trees as TreeDef[];
export const ANIMALS: AnimalDef[] = animalsJson.animals as AnimalDef[];
export const ANIMAL_COST_GROWTH = animalsJson.costGrowth;
export const ITEMS: Record<string, ItemDef> = Object.fromEntries(
  Object.entries(itemsJson.items).map(([id, v]) => [id, { id, ...(v as Omit<ItemDef, 'id'>) }]),
);
export const RECIPES: RecipeDef[] = recipesJson.recipes as unknown as RecipeDef[];
export const BUILDINGS: BuildingDef[] = buildingsJson.buildings as BuildingDef[];
export const FARMHOUSE = buildingsJson.farmhouse;
export const UPGRADES = buildingsJson.upgrades;
export const LEVELS: LevelDef[] = levelsJson.levels;
export const LEVEL_DATA = levelsJson;
export const MAX_LEVEL = levelsJson.maxLevel;
export const COSMETICS = cosmeticsJson as unknown as {
  bodies: CosmeticDef[]; skinTones: string[]; hairColors: string[];
  outfitColors: { color: string; name?: string; unlock: Unlock }[];
  hats: CosmeticDef[]; accessories: CosmeticDef[]; pets: CosmeticDef[];
};
export const ECONOMY = economyJson;
export const ACHIEVEMENTS: AchievementDef[] = achievementsJson.achievements as AchievementDef[];
export const ACHIEVEMENT_REWARDS = achievementsJson.rewards;
export const QUESTS = questsJson as unknown as {
  nPerLevel: number;
  daily: { count: number; reward: { coinsBase: number; coinsPerLevel: number; xpBase: number; xpPerLevel: number }; bonusCrate: string; templates: QuestTemplate[] };
  weekly: { count: number; reward: { coinsBase: number; coinsPerLevel: number; xpBase: number; xpPerLevel: number; gems: number }; bonusCrate: string; completeAllCrate: string; templates: QuestTemplate[] };
};
export const REWARDS = rewardsJson;
export const EVENTS: EventDef[] = eventsJson.events as EventDef[];
export const TUTORIAL: TutorialStep[] = tutorialJson.steps;
export const LAND = landJson;

export const CROP = Object.fromEntries(CROPS.map((c) => [c.id, c])) as Record<string, CropDef>;
export const TREE = Object.fromEntries(TREES.map((t) => [t.id, t])) as Record<string, TreeDef>;
export const ANIMAL = Object.fromEntries(ANIMALS.map((a) => [a.id, a])) as Record<string, AnimalDef>;
export const RECIPE = Object.fromEntries(RECIPES.map((r) => [r.id, r])) as Record<string, RecipeDef>;
export const BUILDING = Object.fromEntries(BUILDINGS.map((b) => [b.id, b])) as Record<string, BuildingDef>;
export const ACHIEVEMENT = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a])) as Record<string, AchievementDef>;

/** Level at which an item first becomes obtainable (crop/fruit/animal product/recipe). */
export const ITEM_LEVEL: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  for (const c of CROPS) out[c.id] = c.level;
  for (const t of TREES) out[t.item] = t.level;
  for (const a of ANIMALS) out[a.product] = a.level;
  for (const r of RECIPES) out[r.item] = Math.min(out[r.item] ?? 99, Math.max(r.level, BUILDING[r.building]?.level ?? 1));
  return out;
})();

/** Which building produces an item (for "where do I get this?" hints). */
export function itemSource(item: string): { kind: 'crop' | 'tree' | 'animal' | 'recipe' | 'event'; id: string } | null {
  if (CROP[item]) return { kind: 'crop', id: item };
  const t = TREES.find((x) => x.item === item);
  if (t) return { kind: 'tree', id: t.id };
  const a = ANIMALS.find((x) => x.product === item);
  if (a) return { kind: 'animal', id: a.id };
  const r = RECIPES.find((x) => x.item === item);
  if (r) return { kind: 'recipe', id: r.id };
  if (ITEMS[item]?.cat === 'event') return { kind: 'event', id: item };
  return null;
}

/** XP an item is worth when delivered in an order. */
export function itemXp(item: string): number {
  return Math.max(1, Math.round((ITEMS[item]?.sell ?? 1) / ECONOMY.orders.xpDivisor));
}
