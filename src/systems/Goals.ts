import { ANIMAL, BUILDING, BUILDINGS, CROPS, ITEMS, MAX_LEVEL } from '../data';
import { game } from './Game';
import { buildings } from './Buildings';
import { orders } from './Economy';
import { production } from './Production';
import { quests, unlocksAt } from './Progression';
import { animals } from './Animals';
import { isBuilt, plotReady, treeReady } from './Timers';

export interface Goal { title: string; text: string; icon: string; progress?: number; action?: { panel?: string; arg?: unknown; focusUid?: number } }

/** Always surface one clear next thing to do, from most to least urgent. */
export function nextGoal(): Goal {
  const now = game.now();
  const s = game.state;
  const ready = s.buildings.filter((b) => (b.plot && plotReady(b, now)) || (BUILDING[b.type].tree && treeReady(b, now)));
  if (ready.length) return { title: 'Harvest time', text: `${ready.length} ready to harvest. Swipe across them!`, icon: 'wheat', action: { focusUid: ready[0].uid } };
  const done = orders.anyCompletable();
  if (done) return { title: 'Deliver an order', text: 'You have everything for an order!', icon: 'clipboard', action: { panel: 'orders' } };
  const goods = production.readyBuildings();
  if (goods.length) return { title: 'Collect goods', text: `${BUILDING[goods[0].type].name} has finished goods`, icon: 'bread', action: { focusUid: goods[0].uid } };
  const animalReady = s.buildings.find((b) => b.animals?.length && animals.counts(b).ready);
  if (animalReady) return { title: 'Collect products', text: `Your ${ANIMAL[BUILDING[animalReady.type].animal!].name.toLowerCase()}s are ready`, icon: ITEMS[ANIMAL[BUILDING[animalReady.type].animal!].product].icon, action: { focusUid: animalReady.uid } };
  const empty = s.buildings.filter((b) => b.type === 'plot' && !b.plot && isBuilt(b, now));
  if (empty.length) {
    const best = [...CROPS].reverse().find((c) => c.level <= game.level && c.seedCost <= game.coins);
    return { title: 'Plant crops', text: `${empty.length} empty field${empty.length > 1 ? 's' : ''}. Try ${best?.name ?? 'Wheat'}!`, icon: best ? ITEMS[best.id].icon : 'seedling', action: { focusUid: empty[0].uid } };
  }
  const claim = quests.claimable();
  if (claim) return { title: 'Quest complete', text: 'Claim your quest reward!', icon: 'scroll', action: { panel: 'quests' } };
  if (s.crates.length) return { title: 'Mystery crate', text: `You have ${s.crates.length} crate${s.crates.length > 1 ? 's' : ''} to open`, icon: 'gift', action: { panel: 'crates' } };
  // hungry animals with feed
  const hungry = s.buildings.find((b) => b.animals?.length && animals.counts(b).hungry && game.count(ANIMAL[BUILDING[b.type].animal!].feed) > 0);
  if (hungry) return { title: 'Feed animals', text: 'Your animals are hungry', icon: ITEMS[ANIMAL[BUILDING[hungry.type].animal!].feed].icon, action: { focusUid: hungry.uid } };
  // something new to build
  const build = BUILDINGS.find((b) => (b.cat === 'production' || b.cat === 'animal' || (b.cat === 'special' && b.max)) && !b.event && b.level <= game.level && game.ownedCount(b.id) === 0);
  if (build) {
    const ok = buildings.canBuy(build.id).ok;
    return { title: ok ? 'Build something new' : 'Save up', text: ok ? `Build a ${build.name}` : `${game.priceOf(build)} coins for a ${build.name}`, icon: build.icon ?? 'construction', progress: ok ? undefined : Math.min(1, game.coins / Math.max(1, game.priceOf(build))), action: { panel: 'shop', arg: build.cat === 'special' ? 'special' : build.cat } };
  }
  const homeless = s.buildings.find((b) => BUILDING[b.type].animal && (b.animals?.length ?? 0) < buildings.capacity(b));
  if (homeless) {
    const a = ANIMAL[BUILDING[homeless.type].animal!];
    return { title: 'More animals', text: `Buy a ${a.name.toLowerCase()} (${animals.price(a.id)} coins)`, icon: `model:${a.model}`, action: { panel: 'shop', arg: 'animal' } };
  }
  // otherwise: progress to the next level unlock
  if (game.level < MAX_LEVEL) {
    let lv = game.level + 1;
    let un = unlocksAt(lv);
    while (!un.length && lv < MAX_LEVEL) un = unlocksAt(++lv);
    const need = game.xpToNext();
    return { title: `Level ${game.level + 1}`, text: un.length ? `Unlocks ${un[0].name}${un.length > 1 ? ` and ${un.length - 1} more` : ''}` : 'Keep growing!', icon: un[0]?.icon ?? 'glowing_star', progress: game.state.player.xp / Math.max(1, need), action: { panel: '__levelbadge' } };
  }
  return { title: 'Master farmer', text: 'Decorate and fill trucks for fun!', icon: 'crown' };
}
