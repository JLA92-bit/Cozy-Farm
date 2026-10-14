/**
 * 1.18 Willowmere Manor: the great estate behind the village square, rebuilt wing by wing once the Village Festival
 * has happened (all six restoration rooms). Wings are restoration rooms (manor.json, ids manor_<wing>): Restoration.ts
 * does the giving and saving, this file decides which wing is open and what finished wings give. Kept free of UI and
 * save imports (like RestorationEffects.ts) so farming, workshops, animals, orders and the woods can ask cheaply.
 */
import { MANOR, MANOR_WINGS, ROOM } from '../data';
import { game } from './Game';
import { roomDone } from './RestorationEffects';

const E = MANOR.effects;

export const isWing = (id: string): boolean => id.startsWith('manor_') && !!ROOM[id];
/** The estate can be worked on once the village is fully rebuilt (the Village Festival). */
export const manorStarted = (): boolean => !!game.state?.restoration?.festival;
export const wingsDone = (): number => MANOR_WINGS.filter((w) => roomDone(w.id)).length;
export const manorFinished = (): boolean => wingsDone() === MANOR_WINGS.length;

/** Why a wing cannot be worked on yet, or null when it is open (or already finished). */
export function wingLock(id: string): string | null {
  const i = MANOR_WINGS.findIndex((w) => w.id === id);
  if (i < 0 || roomDone(id)) return null;
  if (!manorStarted()) return 'Rebuild all six rooms of the village square first.';
  if (i > 0 && !roomDone(MANOR_WINGS[i - 1].id)) return `Finish ${MANOR_WINGS[i - 1].name} first.`;
  if (game.level < MANOR_WINGS[i].opensAt) return `Opens at level ${MANOR_WINGS[i].opensAt}.`;
  return null;
}
export const wingOpen = (id: string): boolean => !roomDone(id) && wingLock(id) === null;
/** The wing being worked on now (or the next one waiting for a level), undefined when all are done. */
export const currentWing = () => MANOR_WINGS.find((w) => !roomDone(w.id));

// ------------------------------------------------------------------------------------------- effects
const on = (wing: string): boolean => roomDone(`manor_${wing}`);
/** Grounds: every forage spot in the Wild Woods holds something every day. */
export const manorForageFull = (): boolean => on('grounds') && E.forageFull;
/** Foundations: more digs a day in the Wild Woods. */
export const manorDigs = (): number => (on('foundations') ? E.digs : 0);
/** Great Hall: festival prizes pay more coins. */
export const manorFestivalCoinsMult = (): number => (on('hall') ? E.festivalCoinsMult : 1);
/** Kitchens: workshops work faster. */
export const manorWorkshopTimeMult = (): number => (on('kitchens') ? E.workshopTimeMult : 1);
/** Library: expeditions are shorter. */
export const manorExpeditionTimeMult = (): number => (on('library') ? E.expeditionTimeMult : 1);
/** Gardens: crops and fruit trees grow faster. */
export const manorGrowTimeMult = (): number => (on('gardens') ? E.growTimeMult : 1);
/** Stables: animals make their goods sooner. */
export const manorAnimalTimeMult = (): number => (on('stables') ? E.animalTimeMult : 1);
/** Ballroom: orders pay more coins. */
export const manorOrderCoinsMult = (): number => (on('ballroom') ? E.orderCoinsMult : 1);
