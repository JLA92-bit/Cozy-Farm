/**
 * 1.23 The Ancient Grove: the Elder Oak at the heart of the Wild Woods grows in stages (woods.json `grove`). Each stage
 * is a restoration room (ids grove_<stage>) so Restoration.ts does the giving and saving; this file decides which stage
 * is open (in order, after the Root Path, a level and `growDays` since the stage before) and what finished stages give.
 * Kept free of UI and save imports (like Manor.ts) so the woods, critters and quality rolls can ask cheaply.
 */
import { GROVE, GROVE_STAGES, ROOM } from '../data';
import { game } from './Game';
import { roomDone } from './RestorationEffects';
import { qualityBoosts } from './Quality';

const E = GROVE.effects;
const DAY = 86400000;

export const isStage = (id: string): boolean => id.startsWith('grove_') && !!ROOM[id];
export const stagesDone = (): number => GROVE_STAGES.filter((s) => roomDone(s.id)).length;
export const groveFinished = (): boolean => stagesDone() === GROVE_STAGES.length;
/** The stage being grown now (or the next one waiting), undefined when the oak is whole. */
export const currentStage = () => GROVE_STAGES.find((s) => !roomDone(s.id));
/** When a stage was finished (ms), if it was. Old saves without a time count as long ago. */
export const stageDoneAt = (id: string): number | undefined => (roomDone(id) ? game.state.restoration?.grove?.[id] ?? 0 : undefined);

/** When a stage can start growing (ms): `growDays` after the stage before it was finished. 0 for the first. */
export function stageReadyAt(id: string): number {
  const i = GROVE_STAGES.findIndex((s) => s.id === id);
  if (i <= 0) return 0;
  const before = stageDoneAt(GROVE_STAGES[i - 1].id);
  return before === undefined ? Infinity : before + (GROVE_STAGES[i].growDays ?? 0) * DAY;
}

/** Why a stage cannot be worked on yet, or null when it is open (or already finished). */
export function stageLock(id: string): string | null {
  const i = GROVE_STAGES.findIndex((s) => s.id === id);
  if (i < 0 || roomDone(id)) return null;
  if (!roomDone('trail_grove')) return `Restore ${ROOM.trail_grove?.name ?? 'the Root Path'} first.`;
  if (i > 0 && !roomDone(GROVE_STAGES[i - 1].id)) return `Finish ${GROVE_STAGES[i - 1].name} first.`;
  if (game.level < GROVE_STAGES[i].opensAt) return `Opens at level ${GROVE_STAGES[i].opensAt}.`;
  const wait = stageReadyAt(id) - game.now();
  if (wait > 0) { const d = Math.ceil(wait / DAY); return `The oak is still growing: ready in ${d} day${d === 1 ? '' : 's'}.`; }
  return null;
}
export const stageOpen = (id: string): boolean => !roomDone(id) && stageLock(id) === null;

// ------------------------------------------------------------------------------------------- effects
const on = (stage: string): boolean => roomDone(`grove_${stage}`);
/** Waking Roots: woods forage is likelier to carry silver and gold stars. */
export const groveForageBoost = (): { silver: number; gold: number } | null => (on('roots') ? { silver: E.forageSilver, gold: E.forageGold } : null);
/** The Green Shoot: more pans a day at Crystal Creek. */
export const grovePans = (): number => (on('shoot') ? E.extraPans : 0);
/** Spreading Boughs: how many times a day each critter family visits its stump. */
export const critterVisitsPerDay = (): number => (on('boughs') ? E.critterVisits : 1);
/** The Glowing Canopy: the oak glows at night. */
export const canopyGlows = (): boolean => on('canopy');
/** The Glowing Canopy: more digs a day in the woods. */
export const groveDigs = (): number => (on('canopy') ? E.extraDigs : 0);

qualityBoosts.push((source) => (source === 'forage' ? groveForageBoost() : null));
