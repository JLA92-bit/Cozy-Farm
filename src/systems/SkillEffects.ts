/**
 * 1.8.5 Skills: what each skill level and chosen perk does. Kept small and free of UI and save imports (like
 * Perks.ts) so farming, animals, fishing, workshops, buildings and the barn can ask "what is the bonus?" without
 * pulling in the skills screen. The XP, levelling and perk choice live in Skills.ts.
 */
import { manorAnimalTimeMult, manorWorkshopTimeMult } from './Manor';
import { game } from './Game';
import { qualityBoosts } from './Quality';
import { ITEMS, SKILLS, SKILL_VALUES as V, SKILL_XP_LEVELS, type SkillId } from '../data';
import type { SkillsState } from './State';
import { roomDone } from './RestorationEffects';
import { animalTimeMultOf, hasPerkIn, levelForXp, levelOf, stepsOf } from './SkillMath';

export const MAX_SKILL_LEVEL = SKILL_XP_LEVELS.length;

/** The skills record, made on first use (an untouched farm has none). */
export function skillState(): SkillsState { return (game.state.skills ??= { xp: {}, perks: {}, headStart: false }); }

export { levelForXp };
export function skillXp(id: SkillId): number { return game.state?.skills?.xp[id] ?? 0; }
export function skillLevel(id: SkillId): number { return levelOf(game.state?.skills, id); }
/** Levels that count for a skill's per-level bonus (the expert ranks 11-20 count half). */
export function skillSteps(id: SkillId): number { return stepsOf(game.state?.skills, id); }
/** 1.35: a value when an expert perk or bonus is owned, otherwise the neutral one. */
const ex = (perk: string, v: number, off: number): number => (hasSkillPerk(perk) || hasSkillBonus(perk) ? v : off);
/** True when this perk id was chosen (a perk only exists once its level was reached and picked). */
export function hasSkillPerk(perk: string): boolean { return hasPerkIn(game.state?.skills, perk); }
/** 1.21 a free bonus perk (skills.json `bonus`) is owned once its skill reaches its level. */
export function hasSkillBonus(perk: string): boolean {
  for (const s of SKILLS) for (const b of s.bonus ?? []) if (b.id === perk) return skillLevel(s.id) >= b.level;
  return false;
}
/** Sickness chance is multiplied by this (Hardy Stock, Animals level 7). */
export const hardyStockMult = (): number => (hasSkillBonus('hardy_stock') ? V.hardyStockSick : 1) * ex('old_friends', V.oldFriendsSick, 1);
/** Wear is multiplied by this (Sturdy Joints, Crafting level 7). */
export const sturdyJointsMult = (): number => (hasSkillBonus('sturdy_joints') ? V.sturdyJointsWear : 1) * ex('mending', V.mendingWear, 1) * ex('woodcare', V.woodcareWear, 1);

// ---------------------------------------------------------------- farming
/** Crops planted take this much of their grow time (Quick Grower). */
export const cropGrowMult = (): number => (hasSkillPerk('quick_grower') ? V.quickGrowerTime : 1) * ex('fast_fields', V.fastFieldsTime, 1) * ex('sunny_fields', V.sunnyFieldsTime, 1);
/** Chance that a harvest gives a double crop (Big Harvest). */
export const bigHarvestChance = (): number => (hasSkillPerk('big_harvest') ? V.bigHarvestChance : 0) + ex('bumper_crop', V.bumperCropChance, 0);
/** 1.35 Free Seeds: chance a planting costs no seed money. */
export const freeSeedsChance = (): number => ex('free_seeds', V.freeSeedsChance, 0);
/** Chance that a harvest gives the seed money back (Seed Saver). */
export const seedSaverChance = (): number => (hasSkillPerk('seed_saver') ? V.seedSaverChance : 0);

// ---------------------------------------------------------------- animals
/** Animals take this much of their time to make a product (1% sooner per Animals level above the first). */
export const animalTimeMult = (): number => animalTimeMultOf(game.state?.skills, roomDone('barn')) * manorAnimalTimeMult();
/** Chance that a collected animal stays fed for another round (Happy Herd). */
export const happyHerdChance = (): number => (hasSkillPerk('happy_herd') ? V.happyHerdChance : 0) + ex('good_company', V.goodCompanyChance, 0);
/** Extra animal places in every home (Breeder). */
export const breederSpaces = (): number => (hasSkillPerk('breeder') ? V.breederSpaces : 0) + ex('full_barn', V.fullBarnSpaces, 0);

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
export const reelZoneBonus = (): number => skillSteps('fishing') * V.reelZonePerLevel + ex('steady_reel', V.steadyReelZone, 0) + ex('patient_reel', V.patientReelZone, 0);
/** Waiting time for a bite is multiplied by this (Quick Cast). */
export const biteWaitMult = (): number => (hasSkillPerk('quick_cast') ? V.quickCastWait : 1) * ex('early_bite', V.earlyBiteWait, 1);
/** How much more often a rarity tier bites (Patient Angler: rare. Legend Hunter: legendary and mythic). */
export function rarityBoost(rarity: string): number {
  if (rarity === 'rare') return (hasSkillPerk('patient_angler') ? V.patientAnglerRare : 1) * ex('deep_water', V.deepWaterRare, 1);
  if (rarity === 'legendary' || rarity === 'mythic') return (hasSkillPerk('legend_hunter') ? V.legendHunterTop : 1) * ex('big_fish', V.bigFishTop, 1);
  return 1;
}

// ---------------------------------------------------------------- cooking
/** Workshop jobs take this much of their time (1% sooner per Cooking level above the first). */
export const cookTimeMult = (): number => (1 - skillSteps('cooking') * V.cookSpeedPerLevel) * ex('quick_kitchen', V.quickKitchenTime, 1) * ex('busy_kitchen', V.busyKitchenTime, 1) * manorWorkshopTimeMult();
/** Chance that a queued batch makes double (Batch Cook). */
export const batchCookChance = (): number => (hasSkillPerk('batch_cook') ? V.batchCookChance : 0) + ex('double_batch', V.doubleBatchChance, 0);
/** Extra queue places in every workshop (Head Chef). */
export const headChefSlots = (): number => (hasSkillPerk('head_chef') ? 1 : 0) + ex('extra_hob', V.extraHobSlots, 0);

// ---------------------------------------------------------------- the barn and quality
/** Barn price multiplier for an item: Fishmonger for fish, Chef for goods. */
export function skillSellMult(item: string): number {
  const cat = ITEMS[item]?.cat;
  if (cat === 'fish') return (hasSkillPerk('fishmonger') ? V.fishmongerSell : 1) * ex('fish_market', V.fishMarketSell, 1);
  if (cat === 'goods') return (hasSkillPerk('chef') ? V.chefSell : 1) * ex('master_chef', V.masterChefSell, 1);
  return 1;
}
game.sellBonus = skillSellMult;

// ---------------------------------------------------------------- foraging (1.9)
/** Chance that a forage pick gives a double (Keen Eyes). */
export const keenEyesChance = (): number => (hasSkillPerk('keen_eyes') ? V.keenEyesChance : 0) + ex('sharp_eyes', V.sharpEyesChance, 0);
/** More dig spots can be dug each day (Deep Digger). */
export const extraDigs = (): number => (hasSkillPerk('extra_digs') ? V.extraDigs : 0) + ex('deep_digs', V.deepDigsDigs, 0) + ex('more_digs', V.moreDigs, 0);
/** 1.35 Big Basket: chance a woods find gives one extra. */
export const bigBasketChance = (): number => ex('big_basket', V.bigBasketChance, 0);
/** Fossils, artifacts and gems come up this much more often (Lucky Finds). */
export const luckyFinds = (): boolean => hasSkillPerk('lucky_finds');

// gold chances: Farming level (and Master Farmer) on crops and fruit, Prize Animals, Gourmet
qualityBoosts.push((source) => {
  if (source === 'crop' || source === 'tree') return { gold: skillSteps('farming') * V.goldPerLevel + (hasSkillPerk('master_farmer') ? V.masterFarmerGold : 0) + ex('golden_fields', V.goldenFieldsGold, 0) + ex('good_soil', V.goodSoilGold, 0) };
  if (source === 'animal') {
    const silver = (hasSkillPerk('prize_animals') ? V.prizeSilver : 0) + ex('prize_herd', V.prizeHerdSilver, 0) + ex('gentle_hands', V.gentleHandsSilver, 0);
    const gold = (hasSkillPerk('prize_animals') ? V.prizeGold : 0) + ex('prize_herd', V.prizeHerdGold, 0);
    return silver || gold ? { silver, gold } : null;
  }
  if (source === 'production') { const gold = (hasSkillPerk('gourmet') ? V.gourmetGold : 0) + ex('fine_food', V.fineFoodGold, 0); return gold ? { gold } : null; }
  if (source === 'forage') return { gold: skillSteps('foraging') * V.forageGoldPerLevel + (hasSkillPerk('forager_gold') ? V.wildGold : 0) + ex('wild_gold', V.wildGoldGold, 0) + ex('woods_wise', V.woodsWiseGold, 0) };
  return null;
});
