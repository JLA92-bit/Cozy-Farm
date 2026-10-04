import { ANIMAL, BUILDING, CROP, ITEMS, RECIPE, TREE } from '../data';
import type { SaveData } from '../systems/State';
import { localDay } from '../systems/Progression';
import { nextLocalTime, type ReadyEvent } from './Plan';

/** The daily reward reminder: tomorrow at 10:00 local time (moved later if quiet hours run past it). */
export const DAILY_REMINDER_MINUTE = 10 * 60;

const itemName = (id: string | undefined): string => (id ? ITEMS[id]?.name ?? '' : '');

/**
 * Everything on the farm that will be ready later, as wall clock times. `gameNow` is game time
 * (game.now(), which includes the debug time offset); the result is converted back to real time.
 */
export function readyEvents(s: SaveData, gameNow: number): ReadyEvent[] {
  const off = s.debugTimeOffset || 0;
  const out: ReadyEvent[] = [];
  const add = (kind: ReadyEvent['kind'], gameAt: number, what?: string) => {
    if (Number.isFinite(gameAt) && gameAt > gameNow) out.push({ kind, at: gameAt - off, what });
  };
  let depotBuilt = 0;
  for (const b of s.buildings) {
    const def = BUILDING[b.type];
    if (!def) continue;
    // a building still under construction does not grow or produce yet
    const builtAt = b.buildEnd ?? 0;
    if (b.type === 'truck_depot') depotBuilt = Math.max(depotBuilt, builtAt || 1);
    if (b.plot) add('crops', b.plot.plantedAt + b.plot.growSec * 1000, CROP[b.plot.crop]?.name);
    if (def.tree && b.tree) add('crops', Math.max(b.tree.readyAt, builtAt), itemName(TREE[def.tree]?.item) || TREE[def.tree]?.name);
    if (def.animal && b.animals) {
      const a = ANIMAL[def.animal];
      for (const x of b.animals) if (a && x.fedAt !== null) add('animals', x.fedAt + a.produceSec * 1000, itemName(a.product));
    }
    for (const q of b.queue ?? []) add('goods', q.end, itemName(RECIPE[q.recipe]?.item));
  }
  // the delivery truck comes back when its cooldown is over (only once there is a depot)
  if (depotBuilt && !s.truck) add('truck', Math.max(s.truckNextAt, depotBuilt));
  for (const slot of s.stall.slots) if (slot.item && slot.soldAt) add('sales', slot.soldAt, itemName(slot.item));
  // daily reward: a gentle reminder tomorrow morning (once the farmer is made and the first day is done)
  if (s.player.created && s.tutorial.done) {
    let at = nextLocalTime(gameNow, DAILY_REMINDER_MINUTE);
    // later today only while today's reward is still waiting
    if (localDay(at) === localDay(gameNow) && s.daily.claimedDay === localDay(gameNow)) at = nextLocalTime(at, DAILY_REMINDER_MINUTE);
    add('daily', at);
  }
  return out;
}
