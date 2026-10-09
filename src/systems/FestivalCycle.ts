/**
 * 1.9 Festival rhythm: a shared 28-day cycle counted from a fixed Monday (cycle.json), with a festival on every 7th day.
 * It comes from the calendar date alone, so every player sees the same day, and nothing is saved. There are no seasons.
 */
import { CYCLE, type FestivalSlot } from '../data';
import { game } from './Game';
import { localDay } from './Progression';
import { dayNumber } from './Weather';

const EPOCH = dayNumber(CYCLE.epoch);
const LENGTH = CYCLE.slots.length * CYCLE.festivalEvery;

export interface CycleNow { slot: FestivalSlot; index: number; day: number; daysLeft: number; cycle: number; festival: boolean }

/** Where a calendar day falls in the cycle (week 0-3, day 1-7 of that week). */
export function cycleOnDay(n: number): CycleNow {
  const rel = n - EPOCH;
  const inCycle = ((rel % LENGTH) + LENGTH) % LENGTH;
  const index = Math.floor(inCycle / CYCLE.festivalEvery);
  const day = (inCycle % CYCLE.festivalEvery) + 1;
  return { slot: CYCLE.slots[index], index, day, daysLeft: CYCLE.festivalEvery - day, cycle: Math.floor(rel / LENGTH), festival: day === CYCLE.festivalEvery };
}

/** The cycle today (local date). */
export const cycleNow = (t = game.now()): CycleNow => cycleOnDay(dayNumber(localDay(t)));
