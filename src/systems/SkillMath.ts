/**
 * 1.8.5 Skills: pure helpers on a skills record (no game or UI imports), so places that only hold a save, like
 * the phone-notification planner, can work out the same numbers as the game.
 */
import { RESTORATION, SKILL_VALUES as V, SKILL_XP_LEVELS, type SkillId } from '../data';
import type { SkillsState } from './State';

/** Level 1..20 for an amount of XP (11-20 are the 1.35 expert ranks). */
export function levelForXp(xp: number): number {
  let l = 1;
  for (let i = 1; i < SKILL_XP_LEVELS.length; i++) if (xp >= SKILL_XP_LEVELS[i]) l = i + 1;
  return l;
}
export function levelOf(st: SkillsState | undefined, id: SkillId): number { return levelForXp(st?.xp[id] ?? 0); }
/** Levels above the first that count for the per-level bonus: full up to 10, then half a step per expert rank (1.35). */
export function bonusSteps(level: number): number { return Math.min(level, 10) - 1 + Math.max(0, level - 10) * (V.expertStep ?? 0.5); }
export function stepsOf(st: SkillsState | undefined, id: SkillId): number { return bonusSteps(levelOf(st, id)); }
export function hasPerkIn(st: SkillsState | undefined, perk: string): boolean {
  return !!st && Object.values(st.perks).some((list) => list.includes(perk));
}
/** Animals take this much of their time to make a product (1% sooner per Animals level above the first, and the rebuilt Barn Room). */
export function animalTimeMultOf(st: SkillsState | undefined, barnRoom = false): number {
  const quick = hasPerkIn(st, 'quick_herd') ? V.quickHerdTime : 1;
  return (1 - stepsOf(st, 'animals') * V.animalSpeedPerLevel) * quick * (barnRoom ? RESTORATION.rewards.animalTimeMult : 1);
}
