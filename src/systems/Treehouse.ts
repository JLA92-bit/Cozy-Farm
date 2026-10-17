/**
 * 1.27 The Treehouse in Whispering Pines (woods.json `treehouse`): three build stages, then six furnishings. All are
 * restoration rooms (ids treehouse_<name>) so Restoration.ts does the giving and saving; this file decides what is
 * open and what the finished treehouse gives. Kept free of UI and save imports (like Grove.ts).
 */
import { ROOM, TREEHOUSE } from '../data';
import { game } from './Game';
import { roomDone } from './RestorationEffects';
import { woods } from './Woods';

export const isTreehouse = (id: string): boolean => id.startsWith('treehouse_') && !!ROOM[id];
export const isFurnishing = (id: string): boolean => TREEHOUSE.furnishings.some((f) => f.id === id);
export const treehouseStage = (): number => TREEHOUSE.stages.filter((s) => roomDone(s.id)).length;
export const treehouseBuilt = (): boolean => treehouseStage() === TREEHOUSE.stages.length;
export const furnished = (): number => TREEHOUSE.furnishings.filter((f) => roomDone(f.id)).length;
export const hasFurnishing = (name: string): boolean => roomDone(`treehouse_${name}`);

/** Why a treehouse room cannot be worked on yet, or null when it is open (or already done). */
export function treehouseLock(id: string): string | null {
  if (!isTreehouse(id) || roomDone(id)) return null;
  if (!woods.regionOpen(TREEHOUSE.region)) return `Restore ${ROOM.trail_pines?.name ?? 'the trail'} to Whispering Pines first.`;
  if (isFurnishing(id)) return treehouseBuilt() ? null : 'Finish building the treehouse first.';
  const i = TREEHOUSE.stages.findIndex((s) => s.id === id);
  if (i > 0 && !roomDone(TREEHOUSE.stages[i - 1].id)) return `Finish ${TREEHOUSE.stages[i - 1].name} first.`;
  if (game.level < TREEHOUSE.stages[i].opensAt) return `Opens at level ${TREEHOUSE.stages[i].opensAt}.`;
  return null;
}
export const treehouseOpen = (id: string): boolean => !roomDone(id) && treehouseLock(id) === null;

/** The finished treehouse: more finds on every camp morning. */
export const treehouseCampFinds = (): number => (treehouseBuilt() ? TREEHOUSE.campFinds : 0);
/** The telescope: the Wildlife Album shows who is out today. */
export const hasTelescope = (): boolean => hasFurnishing('telescope');
