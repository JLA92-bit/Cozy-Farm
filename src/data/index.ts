/** Typed access to the JSON game data. All balance numbers live in the JSON files next to this one. */
import cropsJson from './crops.json';
import villagersJson from './villagers.json';
import skillsJson from './skills.json';
import restorationJson from './restoration.json';
import craftingJson from './crafting.json';
import masteryJson from './mastery.json';
import fishstallJson from './fishstall.json';
import festivalsJson from './festivals.json';
import seasonsJson from './seasons.json';
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
import fishJson from './fish.json';

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
  /** 1.8: only offered once this villager perk is on (src/systems/Perks.ts) */
  perk?: string;
}
export interface BuildingDef {
  id: string; name: string; cat: 'special' | 'farm' | 'animal' | 'production' | 'decor';
  size: [number, number]; level: number; cost: number; costStep?: number; freeCount?: number; eventCost?: number; event?: string;
  buildSec?: number; model: string; parts?: string[]; fit: number; charm: number; cap?: string; max?: number;
  tree?: string; animal?: string; upgradeMult?: number; icon?: string; desc?: string; path?: boolean; glow?: number;
  /** decor: shop filter group (paths, fences, garden, water, lights, ...); paint: model colour players can repaint; sign: shows custom text */
  group?: string; paint?: string; sign?: boolean;
  /** 1.8.5: only for sale once this room of the village square is rebuilt (restoration.json) */
  room?: string;
  /** 1.8.6: may stand on a field tile (scarecrows and other small things that make a field look lived in) */
  onField?: boolean;
  /** 1.8.5: made at Bram's forge (crafting.json), never bought: it arrives in storage and is placed from there */
  craft?: boolean;
  /** fences: joins up with neighbours sharing the same link family; gates are walkable and swing open */
  link?: string; gate?: boolean;
}
export interface LevelDef { level: number; xpToNext: number; coins: number; gems: number }
export interface Unlock { level?: number; achievement?: string; event?: string; cost?: number; crate?: string; default?: boolean }
export interface AvatarDef { id: string; name: string; gender: 'female' | 'male'; body: string; skin: string; hair: string; top: string; bottom: string; hat: string }
export interface CosmeticDef { id: string; name: string; unlock: Unlock; model?: string; body?: string }
export interface AchievementDef {
  id: string; name: string; category: string; stat: string; tiers: number[]; desc: string; icon: string; hidden?: boolean; gauge?: boolean;
}
export interface QuestTemplate { id: string; text: string; stat: string; n: number[]; level: number; icon: string }
export interface EventDef {
  id: string; name: string; start: string; end: string; token: string; icon: string; color: string; blurb: string;
  quests: { text: string; stat: string; n: number; reward: { tokens?: number; coins?: number; gems?: number; crate?: string } }[];
}
export interface TutorialStep { id: string; text: string; target: string; wait: string; skip?: string; button?: string }

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
  avatars: AvatarDef[]; bodies: CosmeticDef[]; skinTones: string[]; hairColors: string[];
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

export type FishTime = 'morning' | 'day' | 'dusk' | 'night';
export type FishRarity = 'common' | 'uncommon' | 'rare' | 'legendary' | 'mythic';
export interface FishDef { id: string; rarity: FishRarity; level: number; times: FishTime[]; difficulty: number; size: [number, number]; xp: number; /** where it bites: the dock (default) or Old Tom's Pier (1.8.5) */ spot?: 'dock' | 'pier'; /** 1.9: only bites in this season */ season?: SeasonId }
export interface JunkDef { id: string; weight: number; xp: number; size?: [number, number]; lines?: string[]; coinsBase?: number; coinsPerLevel?: number; gemChance?: number }
/** Fishing at the dock (fish.json). */
export const FISHING = fishJson as unknown as {
  level: number; freeCastsPerDay: number; baitItem: string; baitShop: { qty: number; coins: number }; junkChance: number;
  rarityChance: Record<FishRarity, number>; times: Record<FishTime, [number, number]>;
  /** Mythic fish only bite once the player has caught a legendary one. */
  mythicNeedsLegendary?: boolean;
  bite: { waitSec: [number, number]; windowSec: number[]; triesPerCast: number };
  reel: { zone: number[]; fishSpeed: number[]; fillPerSec: number; drainPerSec: number; start: number; assistZone: number };
  recordXpBonus: number; species: FishDef[]; junk: JunkDef[]; notes: string[];
};
export const FISH = Object.fromEntries(FISHING.species.map((f) => [f.id, f])) as Record<string, FishDef>;

/** 1.8 Village Friends (villagers.json). */
export interface VillagerDef {
  id: string; name: string; role: string; about: string;
  loves: string[]; likes: string[]; dislikes: string[];
  /** [month 1-12, day] */
  birthday: [number, number];
  perk6: { id: string; text: string };
  /** where they live (villager page) */
  home: string;
  /** card accent colour and theme icon */
  colour: string; icon: string;
  /** how they look on the farm and in portraits (COSMETICS ids and colours); scale = size on the farm */
  look: { body: string; skin: string; hair: string; top: string; bottom: string; hat: string; accessory: string; pet: string };
  scale: number;
  /** decor ids given with the 4-heart and 8-heart story moments (buildings.json group "keepsakes") */
  keepsake: string; portrait: string;
  /** tap lines on the farm, and the one for their birthday */
  chat: string[]; birthdayChat: string;
  /** gift reactions by taste, plus birthday thanks */
  react: Record<'love' | 'like' | 'neutral' | 'dislike' | 'birthday', string[]>;
  /** {farmer} = the player's name */
  letters: Record<'hearts2' | 'perk' | 'best' | 'weekly' | 'birthday', VillagerLetter>;
  /** Pip's weekly treasure letters */
  treasure?: VillagerLetter[];
  /** story moments by heart milestone ("4", "8") */
  stories: Record<string, { title: string; cards: { icon: string; text: string }[] }>;
  /** the best-friend weekly gift */
  weekly: { items: Record<string, number>; coins: number };
}
export interface VillagerLetter { title: string; body: string }
export const VILLAGERS: VillagerDef[] = villagersJson.villagers as unknown as VillagerDef[];
/** What Pip may send each week (letter attachments). */
export const PIP_TREASURES = villagersJson.pipTreasures as { items?: Record<string, number>; gems?: number; coins?: number }[];
export const VILLAGER = Object.fromEntries(VILLAGERS.map((v) => [v.id, v])) as Record<string, VillagerDef>;
export const FRIENDSHIP = villagersJson.friendship;

/** 1.8.5 Skills (skills.json). */
export type SkillId = 'farming' | 'animals' | 'fishing' | 'cooking' | 'crafting';
export interface SkillPerkDef { id: string; name: string; icon: string; text: string }
export interface SkillDef {
  id: SkillId; name: string; icon: string; color: string; about: string; grows: string;
  /** stat name -> XP per count */
  xp: Record<string, number>;
  perLevel: string;
  /** perk level ("5", "10") -> the two choices */
  perks: Record<string, SkillPerkDef[]>;
}
export const SKILLS = skillsJson.skills as unknown as SkillDef[];
export const SKILL = Object.fromEntries(SKILLS.map((s) => [s.id, s])) as Record<SkillId, SkillDef>;
export const SKILL_XP_LEVELS = skillsJson.xpLevels as number[];
export const SKILL_PERK_LEVELS = skillsJson.perkLevels as number[];
export const SKILL_HEADSTART_MAX = skillsJson.headStartMaxLevel as number;
export const SKILL_VALUES = skillsJson.values;

/** 1.8.5 Crafting at Bram's forge (crafting.json). */
export interface CraftRecipe { id: string; name: string; icon: string; kind: 'building' | 'item'; out: string; qty: number; coins: number; in: Record<string, number>; about: string }
export const CRAFT_RECIPES = craftingJson.recipes as unknown as CraftRecipe[];
export const HELPERS = craftingJson.helpers;

/** 1.9 Seasons (seasons.json). */
export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter';
export interface SeasonDef { name: string; icon: string; color: string; blurb: string; /** how the farm looks: grass and sky tints (vertex colours and lights only) and the colour of the drifting motes */ look: { grass: string; grassMix: number; pollen: string; sky: string; skyMix: number } }
export const SEASONS = seasonsJson as unknown as {
  epoch: string; daysPerSeason: number; order: SeasonId[]; seasons: Record<SeasonId, SeasonDef>;
  bonus: { growMult: number; silver: number; gold: number }; yearRound: string[]; crops: Record<string, SeasonId[]>;
};

/** 1.8.7 Marlow Pike's fish stall (fishstall.json). */
export const FISHSTALL = fishstallJson;

/** 1.8.6 Mastery plaques (mastery.json). */
export const MASTERY = masteryJson;

/** 1.8.5 Village Restoration (restoration.json). */
export interface BundleDef { id: string; name: string; icon: string; wants: Record<string, number>; minStar?: 1 | 2 }
export interface RoomDef {
  id: string; name: string; icon: string; color: string; villager: string; opensAt: number; soon?: boolean;
  about: string; rebuilds: string; reward: { id: string; text: string };
  letter: { title: string; body: string };
  bundles: BundleDef[];
}
export const ROOMS = restorationJson.rooms as unknown as RoomDef[];
export const ROOM = Object.fromEntries(ROOMS.map((r) => [r.id, r])) as Record<string, RoomDef>;
export const RESTORATION = { market: restorationJson.market, rewards: restorationJson.rewards, festival: restorationJson.festival };

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
  for (const f of FISHING.species) out[f.id] = f.level;
  for (const j of FISHING.junk) out[j.id] = FISHING.level;
  for (const r of RECIPES) out[r.item] = Math.min(out[r.item] ?? 99, Math.max(r.level, BUILDING[r.building]?.level ?? 1));
  return out;
})();

/** Which building produces an item (for "where do I get this?" hints). */
export function itemSource(item: string): { kind: 'crop' | 'tree' | 'animal' | 'recipe' | 'event' | 'fish'; id: string } | null {
  if (CROP[item]) return { kind: 'crop', id: item };
  const t = TREES.find((x) => x.item === item);
  if (t) return { kind: 'tree', id: t.id };
  const a = ANIMALS.find((x) => x.product === item);
  if (a) return { kind: 'animal', id: a.id };
  const r = RECIPES.find((x) => x.item === item);
  if (r) return { kind: 'recipe', id: r.id };
  if (ITEMS[item]?.cat === 'event') return { kind: 'event', id: item };
  if (ITEMS[item]?.cat === 'fish') return { kind: 'fish', id: item };
  return null;
}

/** XP an item is worth when delivered in an order. */
export function itemXp(item: string): number {
  return Math.max(1, Math.round((ITEMS[item]?.sell ?? 1) / ECONOMY.orders.xpDivisor));
}

/** 1.9 Festival Days (festivals.json): one per season, on its last day. */
export interface FestivalDef {
  id: string; name: string; icon: string; game: 'eggs' | 'derby' | 'fair' | 'feast'; ribbon: string; blurb: string; rules: string;
  stars: [number, number, number]; seconds?: number; eggs?: number; bushes?: number; casts?: number; dishes?: number;
  prize: { decor: string; item?: { id: string; n: number }; gems?: number };
}
export const FESTIVALS = festivalsJson as unknown as {
  festivals: Record<SeasonId, FestivalDef>; prizes: { coins: number; gems?: number }[]; feastPoints: { love: number; like: number; other: number };
};
