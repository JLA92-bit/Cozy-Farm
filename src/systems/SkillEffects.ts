/**
 * 1.8.5 Skills: what each skill level and chosen perk does. Kept small and free of UI and save imports (like
 * Perks.ts) so farming, animals, fishing, workshops, buildings and the barn can ask "what is the bonus?" without
 * pulling in the skills screen. The XP, levelling and perk choice live in Skills.ts.
 */
import { game } from './Game';
import { qualityBoosts } from './Quality';
import { ITEMS, SKILL_VALUES as V, SKILL_XP_LEVELS, type SkillId } from '../data';
import type { SkillsState } from './State';
import { animalTimeMultOf, hasPerkIn, levelForXp, levelOf } from './SkillMath';

export const MAX_SKILL_LEVEL = SKILL_XP_LEVELS.length;

/** The skills record, made on first use (an untouched farm has none). */
export function skillState(): SkillsState { return (game.state.skills ??= { xp: {}, perks: {}, headStart: false }); }

export { levelForXp };
export function skillXp(id: SkillId): number { return game.state?.skills?.xp[id] ?? 0; }
export function skillLevel(id: SkillId): number { return levelOf(game.state?.skills, id); }
/** True when this perk id was chosen (a perk only exists once its level was reached and picked). */
export function hasSkillPerk(perk: string): boolean { return hasPerkIn(game.state?.skills, perk); }

// ---------------------------------------------------------------- farming
/** Crops planted take this much of their grow time (Quick Grower). */
export const cropGrowMult = (): number => (hasSkillPerk('quick_grower') ? V.quickGrowerTime : 1);
/** Chance that a harvest gives a double crop (Big Harvest). */
export const bigHarvestChance = (): number => (hasSkillPerk('big_harvest') ? V.bigHarvestChance : 0);
/** Chance that a harvest gives the seed money back (Seed Saver). */
export const seedSaverChance = (): number => (hasSkillPerk('seed_saver') ? V.seedSaverChance : 0);

// ---------------------------------------------------------------- animals
/** Animals take this much of their time to make a product (1% sooner per Animals level above the first). */
export const animalTimeMult = (): number => animalTimeMultOf(game.state?.skills);
/** Chance that a collected animal stays fed for another round (Happy Herd). */
export const happyHerdChance = (): number => (hasSkillPerk('happy_herd') ? V.happyHerdChance : 0);
/** Extra animal places in every home (Breeder). */
export const breederSpaces = (): number => (hasSkillPerk('breeder') ? V.breederSpaces : 0);

const dayKey = (now: number): string => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** Shepherd: true once a day, the first time it is asked (the caller then adds one bonus product). */
export function claimShepherdBonus(): boolean {
  if (!hasSkillPerk('shepherd')) return false;
  const st = skillState(), today = dayKey(game.now());
  if (st.shepherdDay === today) return false;
  st.shepherdDay = today;
  return true;
}

// ---------------------------------------------------------------- fishing
/** Extra width of the green zone when reeling in (0..1 of the bar), from the Fishing level above the first. */
export const reelZoneBonus = (): number => (skillLevel('fishing') - 1) * V.reelZonePerLevel;
/** Waiting time for a bite is multiplied by this (Quick Cast). */
export const biteWaitMult = (): number => (hasSkillPerk('quick_cast') ? V.quickCastWait : 1);
/** How much more often a rarity tier bites (Patient Angler: rare. Legend Hunter: legendary and mythic). */
export function rarityBoost(rarity: string): number {
  if (rarity === 'rare' && hasSkillPerk('patient_angler')) return V.patientAnglerRare;
  if ((rarity === 'legendary' || rarity === 'mythic') && hasSkillPerk('legend_hunter')) return V.legendHunterTop;
  return 1;
}

// ---------------------------------------------------------------- cooking
/** Workshop jobs take this much of their time (1% sooner per Cooking level above the first). */
export const cookTimeMult = (): number => 1 - (skillLevel('cooking') - 1) * V.cookSpeedPerLevel;
/** Chance that a queued batch makes double (Batch Cook). */
export const batchCookChance = (): number => (hasSkillPerk('batch_cook') ? V.batchCookChance : 0);
/** Extra queue places in every workshop (Head Chef). */
export const headChefSlots = (): number => (hasSkillPerk('head_chef') ? 1 : 0);

// ---------------------------------------------------------------- the barn and quality
/** Barn price multiplier for an item: Fishmonger for fish, Chef for goods. */
export function skillSellMult(item: string): number {
  const cat = ITEMS[item]?.cat;
  if (cat === 'fish' && hasSkillPerk('fishmonger')) return V.fishmongerSell;
  if (cat === 'goods' && hasSkillPerk('chef')) return V.chefSell;
  return 1;
}
game.sellBonus = skillSellMult;

// gold chances: Farming level (and Master Farmer) on crops and fruit, Prize Animals, Gourmet
qualityBoosts.push((source) => {
  if (source === 'crop' || source === 'tree') return { gold: (skillLevel('farming') - 1) * V.goldPerLevel + (hasSkillPerk('master_farmer') ? V.masterFarmerGold : 0) };
  if (source === 'animal' && hasSkillPerk('prize_animals')) return { silver: V.prizeSilver, gold: V.prizeGold };
  if (source === 'production' && hasSkillPerk('gourmet')) return { gold: V.gourmetGold };
  return null;
});
