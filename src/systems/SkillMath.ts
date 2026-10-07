/**
 * 1.8.5 Skills: pure helpers on a skills record (no game or UI imports), so places that only hold a save, like
 * the phone-notification planner, can work out the same numbers as the game.
 */
import { SKILL_VALUES as V, SKILL_XP_LEVELS, type SkillId } from '../data';
import type { SkillsState } from './State';

/** Level 1..10 for an amount of XP. */
export function levelForXp(xp: number): number {
  let l = 1;
  for (let i = 1; i < SKILL_XP_LEVELS.length; i++) if (xp >= SKILL_XP_LEVELS[i]) l = i + 1;
  return l;
}
export function levelOf(st: SkillsState | undefined, id: SkillId): number { return levelForXp(st?.xp[id] ?? 0); }
export function hasPerkIn(st: SkillsState | undefined, perk: string): boolean {
  return !!st && Object.values(st.perks).some((list) => list.includes(perk));
}
/** Animals take this much of their time to make a product (1% sooner per Animals level above the first). */
export function animalTimeMultOf(st: SkillsState | undefined): number { return 1 - (levelOf(st, 'animals') - 1) * V.animalSpeedPerLevel; }
