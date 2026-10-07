/**
 * 1.8.5 Village Restoration: what each rebuilt room gives. Kept small and free of UI and save imports (like
 * Perks.ts) so animals, trucks, orders, the stall and the seed tray can ask "is this room rebuilt?" without
 * pulling in the restoration screens. The bundles, giving and celebrations live in Restoration.ts.
 */
import { game } from './Game';
import { RESTORATION } from '../data';

const R = RESTORATION;

/** True once every bundle of the room was filled. */
export function roomDone(id: string): boolean { return game.state?.restoration?.done.includes(id) ?? false; }
export function roomsDoneIn(state: { restoration?: { done: string[] } } | undefined): string[] { return state?.restoration?.done ?? []; }

/** Barn Room: animals make their products sooner. */
export const barnSpeedMult = (): number => (roomDone('barn') ? R.rewards.animalTimeMult : 1);
/** Treasury: the delivery truck pays more. */
export const truckPayMult = (): number => (roomDone('treasury') ? R.rewards.truckMult : 1);
/** Treasury: every Saturday (the local day) is village market day. */
export function isMarketDay(now = game.now()): boolean { return roomDone('treasury') && new Date(now).getDay() === R.market.dayOfWeek; }
/** Market day: orders pay a little more (coins). */
export const marketOrderMult = (): number => (isMarketDay() ? R.market.ordersCoinMult : 1);
/** Market day: the roadside stall pays a little more. */
export const marketStallMult = (): number => (isMarketDay() ? R.market.stallMult : 1);
/** Pantry: Rosa sells rare seeds. */
export const pantryOpen = (): boolean => roomDone('pantry');
