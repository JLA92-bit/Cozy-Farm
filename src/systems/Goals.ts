import { ANIMAL, BUILDING, BUILDINGS, CROPS, ITEMS, MAX_LEVEL } from '../data';
import { game } from './Game';
import { buildings } from './Buildings';
import { orders } from './Economy';
import { production } from './Production';
import { book, BOOK_PAGES, daily, events, quests, unlocksAt, type UnlockEntry } from './Progression';
import { land } from './Land';
import { animals } from './Animals';
import { isBuilt, isUpgrading, plotReady, treeReady } from './Timers';
import { farmhouseBuilding, fieldStatus, nextCapRaise } from './Caps';

export interface GoalAction {
  panel?: string; arg?: unknown; focusUid?: number;
  /** Focus a land chunk and show its "for sale" popup. */
  chunk?: string;
  /** Focus an obstacle (by id) and show its clear popup. */
  obstacle?: number;
}
export interface Goal { title: string; text: string; icon: string; progress?: number; action?: GoalAction }

const firstBuilt = (pred: (type: string) => boolean) => {
  const now = game.now();
  return game.state.buildings.find((b) => pred(b.type) && isBuilt(b, now));
};

/** Where to send the player to make progress on a stat (quest "Go" buttons, goal card). */
export function actionForStat(stat: string): GoalAction | undefined {
  const now = game.now();
  const plots = () => {
    const s = game.state.buildings;
    const p = s.find((b) => b.plot && plotReady(b, now)) ?? s.find((b) => b.type === 'plot' && !b.plot && isBuilt(b, now)) ?? s.find((b) => b.type === 'plot');
    return p ? { focusUid: p.uid } : { panel: 'shop', arg: 'farm' };
  };
  if (stat === 'crops_harvested' || stat === 'plants_planted' || stat === 'event_tokens' || stat.startsWith('harvest_')) return plots();
  if (stat === 'orders_completed' || stat === 'coins_earned') return { panel: 'orders' };
  if (stat === 'obstacles_cleared' || stat.startsWith('clear_')) { const o = land.easiestObstacle(); return o ? { obstacle: o.id } : undefined; }
  if (stat === 'animals_fed' || stat === 'animal_pets' || stat === 'animal_products') {
    const b = game.state.buildings.find((x) => x.animals?.length && animals.counts(x).hungry) ?? game.state.buildings.find((x) => x.animals?.length);
    return b ? { focusUid: b.uid } : { panel: 'shop', arg: 'animal' };
  }
  if (stat === 'items_produced') {
    const b = production.readyBuildings()[0] ?? firstBuilt((t) => BUILDING[t].cat === 'production');
    return b ? { focusUid: b.uid } : { panel: 'shop', arg: 'production' };
  }
  if (stat === 'fruit_harvested') {
    const b = game.state.buildings.find((x) => BUILDING[x.type].tree && treeReady(x, now)) ?? firstBuilt((t) => !!BUILDING[t].tree);
    return b ? { focusUid: b.uid } : { panel: 'shop', arg: 'farm' };
  }
  if (stat === 'stall_sales') return firstBuilt((t) => t === 'roadside_stall') ? { panel: 'stall' } : { panel: 'shop', arg: 'special' };
  if (stat === 'decorations_placed') return { panel: 'shop', arg: 'decor' };
  if (stat === 'truck_crates') return game.state.truck ? { panel: 'truck' } : undefined;
  if (stat === 'daily_quests_completed') return { panel: 'quests', arg: 'daily' };
  if (stat === 'crates_opened') return game.state.crates.length ? { panel: 'crates' } : { panel: 'quests', arg: 'daily' };
  return undefined;
}

/** Where to go to try out something that was just unlocked. */
export function actionForUnlock(u: UnlockEntry): GoalAction | undefined {
  switch (u.kind) {
    case 'Crop': return actionForStat('plants_planted');
    case 'Tree': return { panel: 'shop', arg: 'farm' };
    case 'Animal': return { panel: 'shop', arg: 'animal' };
    case 'Decor': return { panel: 'shop', arg: 'decor' };
    case 'Building': { const d = BUILDING[u.id]; return { panel: 'shop', arg: d?.cat === 'special' ? 'special' : d?.cat ?? 'production' }; }
    case 'Recipe': return actionForStat('items_produced');
    case 'Style': return { panel: 'character' };
    case 'Upgrade': return { panel: 'farmhouse' };
    case 'Orders': return { panel: 'orders' };
    case 'Land': { const c = land.purchasableChunks()[0]; return c ? { chunk: c } : undefined; }
  }
  return undefined;
}

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
  if (game.state.tutorial.done && daily.check(now)) return { title: 'Daily gift', text: `Day ${daily.dayIndex + 1} reward is waiting!`, icon: 'calendar', action: { panel: 'daily' } };
  const page = BOOK_PAGES.find((g) => book.claimable(g));
  if (page) return { title: 'Book page complete', text: `Claim your ${page} page reward!`, icon: 'books', action: { panel: 'collection', arg: page } };
  const eventClaim = events.claimable();
  if (eventClaim) return { title: 'Festival reward', text: 'Claim your festival quest reward!', icon: events.current?.icon ?? 'party', action: { panel: 'event' } };
  // hungry animals with feed
  const hungry = s.buildings.find((b) => b.animals?.length && animals.counts(b).hungry && game.count(ANIMAL[BUILDING[b.type].animal!].feed) > 0);
  if (hungry) return { title: 'Feed animals', text: 'Your animals are hungry', icon: ITEMS[ANIMAL[BUILDING[hungry.type].animal!].feed].icon, action: { focusUid: hungry.uid } };
  // something new to build
  const build = BUILDINGS.find((b) => (b.cat === 'production' || b.cat === 'animal' || (b.cat === 'special' && b.max)) && !b.event && b.level <= game.level && game.ownedCount(b.id) === 0);
  const buildOk = !!build && buildings.canBuy(build.id).ok;
  if (build && buildOk) return { title: 'Build something new', text: `Build a ${build.name}`, icon: build.icon ?? 'construction', action: { panel: 'shop', arg: build.cat === 'special' ? 'special' : build.cat } };
  // land for sale
  if (land.canExpand().ok) {
    const chunk = land.purchasableChunks()[0];
    if (chunk) return { title: 'New land for sale', text: `Grow your farm for ${land.nextExpansion().cost} coins`, icon: 'map', action: { chunk } };
  }
  // more fields (or a bigger farmhouse once the fields are full)
  const fieldGoal = fieldsGoal(false);
  if (fieldGoal) return fieldGoal;
  const homeless = s.buildings.find((b) => BUILDING[b.type].animal && (b.animals?.length ?? 0) < buildings.capacity(b));
  if (homeless) {
    const a = ANIMAL[BUILDING[homeless.type].animal!];
    return { title: 'More animals', text: `Buy a ${a.name.toLowerCase()} (${animals.price(a.id)} coins)`, icon: `model:${a.model}`, action: { panel: 'shop', arg: 'animal' } };
  }
  // a quest in progress is always a good next step
  const q = [...s.quests.daily, ...s.quests.weekly].filter((x) => !x.claimed && !quests.done(x))
    .map((x) => ({ x, f: quests.progress(x) / Math.max(1, x.target) })).sort((a, b) => b.f - a.f)[0];
  if (q) {
    const act = actionForStat(q.x.stat);
    if (act) return { title: s.quests.daily.includes(q.x) ? 'Daily quest' : 'Weekly quest', text: `${q.x.text} (${quests.progress(q.x)}/${q.x.target})`, icon: q.x.icon, progress: q.f, action: act };
  }
  // tidy up wild spots on land you own (cheap XP and a little treasure)
  const wild = land.easiestObstacle();
  if (wild && game.coins >= land.obstacleDef(wild).clearCost * 3) {
    const t = land.obstacleDef(wild);
    return { title: 'Tidy the farm', text: `Clear a ${t.name.toLowerCase()} for +${t.xp} XP`, icon: t.icon, action: { obstacle: wild.id } };
  }
  const fieldSave = fieldsGoal(true);
  if (fieldSave) return fieldSave;
  // saving up for more land
  const next = land.nextExpansion();
  if (!build && game.level >= next.level && land.purchasableChunks().length) {
    return { title: 'Save for land', text: `${next.cost} coins buys new land`, icon: 'map', progress: Math.min(1, game.coins / Math.max(1, next.cost)), action: { chunk: land.purchasableChunks()[0] } };
  }
  if (build) return { title: 'Save up', text: `${game.priceOf(build)} coins for a ${build.name}`, icon: build.icon ?? 'construction', progress: Math.min(1, game.coins / Math.max(1, game.priceOf(build))), action: { panel: 'shop', arg: build.cat === 'special' ? 'special' : build.cat } };
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

/**
 * Fields are the heart of the farm: suggest buying one while there is room and it is comfortably affordable,
 * and the Farmhouse upgrade once every allowed field is built. `saving` = the lower-priority "save up" version.
 */
export function fieldsGoal(saving: boolean): Goal | null {
  if (!game.state.tutorial.done) return null;
  const f = fieldStatus();
  if (f.free) {
    if (saving || game.coins < f.price * 1.5) return null;
    return { title: 'More fields', text: `${f.owned} / ${f.cap} fields. Add one for ${f.price} coins`, icon: 'seedling', progress: f.owned / Math.max(1, f.cap), action: { panel: 'shop', arg: 'farm' } };
  }
  const fh = farmhouseBuilding();
  const up = fh ? buildings.upgradeInfo(fh) : null;
  const raise = nextCapRaise('plot');
  if (!fh || !up || !raise || game.level < up.needLevel || isUpgrading(fh, game.now()) || !isBuilt(fh, game.now())) return null;
  if (game.coins >= up.cost) {
    if (saving) return null;
    return { title: 'Bigger farmhouse', text: `Fields are full. Upgrade for +${raise.add} fields!`, icon: 'house', action: { panel: 'farmhouse' } };
  }
  if (!saving) return null;
  return { title: 'Save for the farmhouse', text: `${up.cost} coins for +${raise.add} fields`, icon: 'house', progress: Math.min(1, game.coins / Math.max(1, up.cost)), action: { panel: 'farmhouse' } };
}
