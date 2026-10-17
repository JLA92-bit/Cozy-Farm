/**
 * 1.26 Estate Projects: long projects in the village square after the Village Festival (estate.json): the Clock Tower
 * and the Lighthouse. Each stage is a restoration room (ids estate_<project>_<stage>) so Restoration.ts does the
 * giving and saving; this file decides which stage is open (in order, after the festival and the project's level)
 * and what finished projects give. Kept free of UI and save imports (like Manor.ts and Grove.ts).
 */
import { ESTATE, ROOM, type EstateProject } from '../data';
import { game } from './Game';
import { roomDone } from './RestorationEffects';

export const isEstateStage = (id: string): boolean => id.startsWith('estate_') && !!ROOM[id];
export const projectOf = (id: string): EstateProject | undefined => ESTATE.find((p) => p.stages.some((s) => s.id === id));
export const project = (id: string): EstateProject | undefined => ESTATE.find((p) => p.id === id);
export const stagesDoneOf = (p: EstateProject): number => p.stages.filter((s) => roomDone(s.id)).length;
export const projectDone = (id: string): boolean => { const p = project(id); return !!p && stagesDoneOf(p) === p.stages.length; };
/** The stage being worked on (or the next one waiting), undefined when the project is finished. */
export const currentStageOf = (p: EstateProject) => p.stages.find((s) => !roomDone(s.id));
/** Projects start once the village is fully rebuilt (the Village Festival). */
export const estateStarted = (): boolean => !!game.state?.restoration?.festival;

/** Why an estate stage cannot be worked on yet, or null when it is open (or already finished). */
export function estateLock(id: string): string | null {
  const p = projectOf(id);
  if (!p || roomDone(id)) return null;
  const i = p.stages.findIndex((s) => s.id === id);
  if (!estateStarted()) return 'Rebuild all six rooms of the village square first.';
  if (game.level < p.opensAt) return `Opens at level ${p.opensAt}.`;
  if (i > 0 && !roomDone(p.stages[i - 1].id)) return `Finish ${p.stages[i - 1].name} first.`;
  return null;
}
export const estateOpen = (id: string): boolean => !roomDone(id) && estateLock(id) === null;

// ------------------------------------------------------------------------------------------- effects
/** The Clock Tower: the square's clock keeps the real time and chimes on the hour. */
export const clockTowerBuilt = (): boolean => projectDone('clock');
/** The Lighthouse: Boat Visitors call one more day a week. */
export const lighthouseBoatDays = (): number => (projectDone('lighthouse') ? 1 : 0);
