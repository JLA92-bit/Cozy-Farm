import { ui } from '../UI';
import { sideEntries } from '../SideBar';
import { ANIMAL, BUILDING } from '../../data';
import { game } from '../../systems/Game';
import { production } from '../../systems/Production';
import { animals } from '../../systems/Animals';
import { haptics } from '../../systems/Audio';
import { isBuilt, settleProduction } from '../../systems/Timers';
import type { PlacedBuilding } from '../../systems/State';

/** 1.34.3: one shortcut collects every workshop and animal home on the farm (and re-feeds animals). */

/** Buildings below this count are quicker tapped one by one, so the shortcut stays away. */
const MIN_READY = 2;
let cache = { at: 0, n: 0 };

function animalReady(b: PlacedBuilding): boolean {
  return BUILDING[b.type].cat === 'animal' && (b.animals?.length ?? 0) > 0 && animals.counts(b).ready > 0;
}

function readyCount(now: number): number {
  // the side bar runs every frame; a big farm has hundreds of buildings, so count once a second
  if (now - cache.at < 1000) return cache.n;
  const ms = game.now();
  let n = 0;
  for (const b of game.state.buildings) {
    const cat = BUILDING[b.type]?.cat;
    if (cat !== 'production' && cat !== 'animal') continue;
    if (!isBuilt(b, ms)) continue;
    if (cat === 'production' ? (b.ready?.length ?? 0) > 0 || (b.queue ?? []).some((q) => q.end <= ms) : animalReady(b)) n++;
  }
  cache = { at: now, n };
  return n;
}

/** Collect everything ready. Returns goods collected and buildings visited. */
export function collectEverything(): { goods: number; homes: number; fed: number } {
  const now = game.now();
  const night = ui.scene.env.night > 0.6;
  let goods = 0, homes = 0, fed = 0, sparkles = 0;
  for (const b of [...game.state.buildings]) {
    const def = BUILDING[b.type];
    if (!def || !isBuilt(b, now)) continue;
    const at = ui.scene.farm.anchor(b.uid);
    const pos = { x: at.x, y: at.y, z: at.z };
    let got = 0;
    if (def.cat === 'production') {
      settleProduction(b, now);
      if (b.ready?.length) got = production.collect(b, pos, night).length;
    } else if (def.cat === 'animal' && b.animals?.length) {
      got = animals.collectAll(b, pos);
      if (got && night) game.incStat('night_collects', got);
      if (animals.counts(b).hungry && game.count(ANIMAL[def.animal!].feed) > 0) fed += animals.feedAll(b);
    }
    if (!got) continue;
    goods += got;
    homes++;
    // a few sparkles, not one per building on a farm of a hundred
    if (sparkles++ < 12) ui.effects.sparkle(at, '#fff6a0', 6);
  }
  cache.at = 0;
  return { goods, homes, fed };
}

ui.register('collect_all', () => {
  const r = collectEverything();
  if (!r.goods) { ui.feedback.toast('Nothing ready yet', undefined, 'basket'); return; }
  haptics.buzz([10, 30, 10]);
  ui.feedback.toast(`Collected ${r.goods} goods`, `From ${r.homes} buildings${r.fed ? `, fed ${r.fed} animals` : ''}`, 'basket');
});

sideEntries.push((now) => {
  if (!game.state.tutorial.done) return null;
  const n = readyCount(now);
  return n >= MIN_READY ? { id: 'collect_all', icon: 'basket', label: 'Collect', color: 'yellow' } : null;
});


// debug and regression checks: window.__qol
void Promise.all([import('./ProductionPanel'), import('./InventoryPanel'), import('../../systems/ItemUses')]).then(([pp, inv, uses]) => {
  Object.assign(window as unknown as Record<string, unknown>, { __qol: { collectEverything, fillCount: pp.fillCount, againJobs: pp.againJobs, queueAgain: pp.queueAgain, sellExtrasPlan: inv.sellExtrasPlan, itemUses: uses.itemUses, itemNeeded: uses.itemNeeded } });
});
