/**
 * 1.8.5 crafted helpers (made at Bram's forge): what a sprinkler and an auto-feeder do, and how the Crafting
 * skill changes them. Small and free of UI imports, like SkillEffects.ts.
 */
import { BUILDING, HELPERS } from '../data';
import { game } from './Game';
import type { PlacedBuilding } from './State';
import { isBuilt } from './Timers';
import { hasSkillPerk } from './SkillEffects';

/** Tiles of extra reach (Sturdy Tools). */
const reachBonus = (): number => (hasSkillPerk('sturdy_tools') ? 1 : 0);
/** Quality fertiliser strength (Golden Touch makes it twice as strong). */
export const craftFertMult = (): number => (hasSkillPerk('golden_touch') ? 2 : 1);

const centre = (b: PlacedBuilding): [number, number] => {
  const [w, d] = BUILDING[b.type].size;
  return [b.x + w / 2, b.z + d / 2];
};

/** Grow-time multiplier for a field being sown now: 0.88 when a built sprinkler is near (they do not stack). */
export function sprinklerGrowMult(plot: PlacedBuilding): number {
  const now = game.now(), range = HELPERS.sprinklerRange + reachBonus();
  const [px, pz] = centre(plot);
  for (const s of game.state.buildings) {
    if (s.type !== 'sprinkler' || !isBuilt(s, now)) continue;
    const [sx, sz] = centre(s);
    if (Math.hypot(px - sx, pz - sz) <= range) return HELPERS.sprinklerGrowMult;
  }
  return 1;
}

/** A built glass frame stands on this field (1.9): the field ignores the seasons. */
export function underGlass(plot: PlacedBuilding): boolean {
  const now = game.now();
  return game.state.buildings.some((g) => g.type === 'glass_frame' && isBuilt(g, now) && g.x === plot.x && g.z === plot.z);
}
/** Does the farm own any glass frame? (the seed tray then lets off-season crops be picked) */
export const hasGlass = (): boolean => game.state.buildings.some((g) => g.type === 'glass_frame');

/** Animal homes in reach of an auto-feeder. */
export function homesInReach(feeder: PlacedBuilding): PlacedBuilding[] {
  const range = HELPERS.autoFeederRange + reachBonus();
  const [fx, fz] = centre(feeder);
  return game.state.buildings.filter((b) => {
    if (!BUILDING[b.type].animal) return false;
    const [bx, bz] = centre(b);
    return Math.hypot(bx - fx, bz - fz) <= range;
  });
}

/** Animals fed per round by one auto-feeder (Tinkerer doubles it). */
export const feederPerTick = (): number => HELPERS.autoFeederPerTick * (hasSkillPerk('tinkerer') ? 2 : 1);

/** Horses in a built stable bring the delivery truck back sooner: 10% less waiting per horse, up to three horses. */
export function truckCooldownMult(): number {
  const now = game.now();
  let horses = 0;
  for (const b of game.state.buildings) if (b.type === 'stable' && isBuilt(b, now)) horses += b.animals?.length ?? 0;
  return 1 - Math.min(3, horses) * 0.1;
}
