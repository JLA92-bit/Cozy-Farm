import * as THREE from 'three';
import { ITEMS, MINE } from '../data';
import { game } from '../systems/Game';
import { mine, layerOf, type MineFloor } from '../systems/Mine';
import { saves } from '../systems/Save';
import { visiting } from '../systems/Visiting';
import { audio, haptics } from '../systems/Audio';
import { hints } from '../systems/Hints';
import { extraUnlocks } from '../systems/Progression';
import { MineView, MODELS } from '../world/MineView';
import { MineGate } from '../world/MineGate';
import { assets } from '../core/Assets';
import { Panel } from '../ui/Panel';
import { tutorial } from '../ui/Tutorial';
import { ui } from '../ui/UI';
import { button, h, icon } from '../ui/dom';
import { takePhoto } from '../ui/Photo';
import { closePhotoMode, photoOwnsBack } from '../ui/PhotoMode';
import { openBram, openLift } from '../ui/panels/MinePanel';
import { hideWipe, isVisiting, showWipe } from './Visit';
import { isInSquare } from './Square';
import { isInWoods } from './Woods';
import { isInHome } from './Home';
import type { DragKind, Pointer } from '../core/Input';
import type { FarmScene, WorldHandler } from './FarmScene';
import type { Interaction } from './Interaction';
import '../ui/panels/mine.css';

/**
 * 1.31 Going to the Old Mine. Like the woods: a cloud wipe and a camera cut to the island (the farm runs on out of
 * sight). From the island's mine mouth the lift takes you down to a floor; each floor is a dark room of rocks to break
 * (src/systems/Mine.ts has the rules, world/MineView.ts draws it). Back (button, browser or Android) climbs up to the
 * island from a floor, and rows home from the island.
 */

let ctx: { scene: FarmScene; interaction: Interaction } | null = null;
let view: MineView | null = null;
let loading: Promise<MineView> | null = null;
let inMine = false;
/** the floor you are on (0: on the island) */
let floorNo = 0;
let floor: MineFloor | null = null;
let busy = false;
let ignorePop = 0;
let saved: { target: THREE.Vector3; distance: number; min: number; max: number; bounds: THREE.Box2; handler: WorldHandler | null; elevation: number } | null = null;
let banner: HTMLElement | null = null;

export function isInMine(): boolean { return inMine; }
export function mineView(): MineView | null { return view; }

/** Called once at boot (after the farm scene exists). */
export function initMine(scene: FarmScene, interaction: Interaction): void {
  ctx = { scene, interaction };
  window.addEventListener('popstate', () => {
    if (photoOwnsBack()) return;
    if (ignorePop > 0) { ignorePop--; return; }
    if (!inMine) return;
    if (floorNo > 0) void goUp(true); else void leaveMine(true);
  });
  scene.onFrame((dt) => frame(dt));
  const gate = new MineGate(scene);
  gate.onTap = () => { audio.play('pop', { volume: 0.6 }); void enterMine(); };
  const prevPick = ui.extraPick;
  ui.extraPick = (ray) => gate.pick(ray) ?? prevPick?.(ray) ?? null;
  game.bus.on('mine:changed', () => { view?.refreshFloor(); view?.refreshSurface(); updateBanner(); });
  game.bus.on('restoration:room', ({ room }) => { if (room === MINE.entrance.id) { view?.refreshSurface(); updateBanner(); } });
  extraUnlocks.push((level) => (level === MINE.level ? [{ kind: 'Place', id: 'old_mine', name: 'The Old Mine', icon: 'pick', level }] : []));
  ui.register('mine', () => void enterMine());
  Object.assign(window as unknown as Record<string, unknown>, {
    __mine: { enter: enterMine, leave: () => leaveMine(), down: (n: number) => goDown(n), up: () => goUp(), get active() { return inMine; }, get floor() { return floor; }, get floorNo() { return floorNo; }, get view() { return view; }, sys: mine, gate },
  });
}

async function loadView(): Promise<MineView> {
  if (view) return view;
  loading ??= (async () => {
    await assets.preload(MODELS);
    const v = new MineView();
    await v.build();
    ctx!.scene.scene.add(v.group);
    v.group.visible = false;
    view = v;
    return v;
  })();
  try { return await loading; } catch (e) { loading = null; throw e; }
}

/** Row over to the mine island. */
export async function enterMine(): Promise<void> {
  if (!ctx || inMine || busy || isInSquare() || isInWoods() || isInHome()) return;
  if (visiting.active || isVisiting()) return;
  if (!mine.unlocked) { ui.feedback.toast('The Old Mine', `Opens at level ${MINE.level}.`, 'pick'); return; }
  if (tutorial.running) return;
  busy = true;
  const { scene, interaction } = ctx;
  Panel.closeAll();
  ui.world.hidePopup();
  interaction.cancelPlacement();
  if (interaction.mode.kind === 'edit') interaction.exitEdit();
  interaction.exitPlant();
  const wipe = showWipe('Rowing over to the Old Mine');
  const started = performance.now();
  try {
    const v = await loadView();
    await new Promise((r) => setTimeout(r, Math.max(0, 420 - (performance.now() - started))));
    saves.save();
    saved = { target: scene.rig.target.clone(), distance: scene.rig.distance, min: scene.rig.minDistance, max: scene.rig.maxDistance, bounds: scene.rig.bounds.clone(), handler: scene.handler, elevation: scene.rig.elevation };
    v.group.visible = true;
    inMine = true;
    floorNo = 0;
    scene.handler = mineHandler;
    showSurface();
    ui.root.classList.add('squaring');
    banner = makeBanner();
    ui.root.append(banner);
    try { history.pushState({ cozyMine: true }, ''); } catch { /* sandboxed */ }
    scene.loop.wake(1);
    await hideWipe(wipe);
    busy = false;
    if (hints.firstTime('intro:mine')) ui.feedback.toast('The Old Mine', mine.open ? 'Tap the mine mouth to take the lift down. Bram makes pickaxes and cracks geodes.' : "Bram's crew needs a hand to open the mine. Tap the boarded mouth to see what they need.", 'pick');
  } catch (e) {
    console.error('[mine] could not open', e);
    cleanup();
    await hideWipe(wipe);
    busy = false;
    ui.feedback.toast("Couldn't reach the mine", 'Something in it could not be drawn. Try again later.', 'cloud', 'warn');
  }
}

/** The camera on the island. */
function showSurface(): void {
  if (!ctx || !view) return;
  const scene = ctx.scene, rig = scene.rig, c = view.islandCentre;
  view.surface.visible = true;
  view.under.visible = false;
  scene.env.cave = null;
  scene.env.indoors = false;
  rig.stop();
  rig.elevation = saved?.elevation ?? THREE.MathUtils.degToRad(48);
  rig.bounds.set(new THREE.Vector2(c.x - 14, c.z - 14), new THREE.Vector2(c.x + 14, c.z + 14));
  rig.target.set(c.x - 1, 0, c.z - 1);
  rig.minDistance = 14;
  rig.maxDistance = 46;
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  rig.distance = THREE.MathUtils.clamp(30 * Math.max(1, 1.4 / aspect), 26, 46);
  // the hill and its mine mouth in the middle of the view
  const back = aspect > 1 ? 5.2 : 3.6;
  rig.target.set(c.x - back, 0, c.z - back);
  view.refreshSurface();
}

/** The camera underground, fitted to the room. */
function showUnder(): void {
  if (!ctx || !view) return;
  const scene = ctx.scene, rig = scene.rig, c = view.roomCentre;
  view.surface.visible = false;
  view.under.visible = true;
  scene.env.indoors = true;
  rig.stop();
  rig.elevation = THREE.MathUtils.degToRad(54);
  // fit about 14 m of the room across the screen (a phone held upright pans to see the rest)
  const cam = rig.camera, aspect = window.innerWidth / Math.max(1, window.innerHeight);
  const vfov = THREE.MathUtils.degToRad(aspect < 1 ? 40 : 32);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  void cam;
  // wide enough for most of the room's width, tall enough for the back walls and the front edge
  rig.distance = THREE.MathUtils.clamp(Math.max(7 / Math.tan(hfov / 2), 9 / Math.tan(vfov / 2)), 24, 40);
  rig.minDistance = 16;
  rig.maxDistance = 44;
  const pan = THREE.MathUtils.clamp(rig.distance / 9, 2.5, 4.6);
  rig.bounds.set(new THREE.Vector2(c.x - pan, c.z - pan), new THREE.Vector2(c.x + pan, c.z + pan));
  rig.target.set(c.x - 0.6, 0, c.z - 0.6);
  scene.env.cave = view.caveLook(floorNo, rig.distance);
}

/** Down to a floor (from the island's lift, a lift floor, or the ladder hole). */
export async function goDown(n: number, how: 'lift' | 'ladder' = 'lift'): Promise<void> {
  if (!ctx || !inMine || busy || !mine.open) return;
  const target = Math.max(1, Math.min(MINE.floors, Math.floor(n)));
  if (target > Math.max(1, mine.deepest) && how === 'lift') return;
  const tier = mine.needsPickaxe(target);
  if (tier !== null) { ui.feedback.toast('Too hard to dig', `The ${layerOf(target).name} needs the ${MINE.pickaxes[tier].name.toLowerCase()}. Bram can make one.`, 'pick', 'warn'); audio.play('error'); return; }
  busy = true;
  Panel.closeAll();
  const wipe = showWipe(how === 'ladder' ? `Down to floor ${target}` : floorNo === 0 ? 'Down in the lift' : `The lift to floor ${target}`);
  try {
    const v = await loadView();
    if (target === 1) mine.reach(1);
    const f = mine.layout(target);
    await v.showFloor(f);
    const wasUnder = floorNo > 0;
    floor = f;
    floorNo = target;
    showUnder();
    banner?.remove();
    banner = makeBanner();
    ui.root.append(banner);
    if (!wasUnder) { try { history.pushState({ cozyMineUnder: true }, ''); } catch { /* sandboxed */ } }
    ctx.scene.loop.wake(1);
    audio.play(how === 'ladder' ? 'swipe' : 'whoosh', { volume: 0.5 });
  } catch (e) {
    console.error('[mine] could not draw the floor', e);
    ui.feedback.toast("Couldn't go down", 'Something on that floor could not be drawn. Try again.', 'cloud', 'warn');
  }
  await hideWipe(wipe);
  busy = false;
  const first = layerOf(target).from === target && target > 1;
  if (first && hints.firstTime(`intro:mine:${layerOf(target).id}`)) ui.feedback.toast(layerOf(target).name, layerOf(target).about, layerOf(target).icon);
  else if (target === 1 && hints.firstTime('intro:mine:floor')) ui.feedback.toast('Floor 1', 'Tap a rock to swing at it. One rock on every floor hides the ladder down. Your lantern lasts for 60 swings a day.', 'pick');
}

/** Back up to the island. */
export async function goUp(fromBack = false): Promise<void> {
  if (!ctx || !inMine || busy || floorNo <= 0) return;
  busy = true;
  closePhotoMode();
  if (!fromBack && (history.state as { cozyMineUnder?: boolean } | null)?.cozyMineUnder) { ignorePop++; try { history.back(); } catch { ignorePop--; } }
  Panel.closeAll();
  const wipe = showWipe('Up into the daylight');
  await new Promise((r) => setTimeout(r, 380));
  floorNo = 0;
  floor = null;
  showSurface();
  banner?.remove();
  banner = makeBanner();
  ui.root.append(banner);
  ctx.scene.loop.wake(1);
  await hideWipe(wipe);
  busy = false;
}

/** Row home. */
export async function leaveMine(fromBack = false): Promise<void> {
  if (!ctx || !inMine || busy) return;
  if (floorNo > 0) { await goUp(fromBack); return; }
  busy = true;
  closePhotoMode();
  if (!fromBack && (history.state as { cozyMine?: boolean } | null)?.cozyMine) { ignorePop++; try { history.back(); } catch { ignorePop--; } }
  Panel.closeAll();
  const wipe = showWipe('Rowing home');
  await new Promise((r) => setTimeout(r, 380));
  cleanup();
  await hideWipe(wipe);
  busy = false;
}

function cleanup(): void {
  const scene = ctx!.scene;
  inMine = false;
  floorNo = 0;
  floor = null;
  scene.env.cave = null;
  scene.env.indoors = false;
  scene.env.fogFloor = 0;
  if (view) { view.group.visible = false; view.under.visible = false; }
  scene.handler = ctx!.interaction;
  if (saved) {
    const rig = scene.rig;
    rig.stop();
    rig.bounds.copy(saved.bounds);
    rig.target.copy(saved.target);
    rig.distance = saved.distance;
    rig.minDistance = saved.min;
    rig.maxDistance = saved.max;
    rig.elevation = saved.elevation;
    saved = null;
  }
  banner?.remove();
  banner = null;
  ui.root.classList.remove('squaring');
  scene.loop.wake(1);
}

// ------------------------------------------------------------------------------------ taps

const mineHandler: WorldHandler = {
  pointerDown(): void {},
  tap(p: Pointer): void { tapAt(p); },
  longPress(p: Pointer): void { tapAt(p); },
  dragStart(): DragKind { return 'pan'; },
  toolDrag(): void {},
  toolDragEnd(): void {},
};

function tapAt(p: Pointer): void {
  if (!ctx || !view || busy) return;
  // past midnight underground: the rocks are new today, so draw the floor again before anything is swung at
  if (floor && floorNo > 0 && mine.layout(floorNo).seed !== floor.seed) {
    ui.feedback.toast('A new day in the mine', 'The rocks have settled overnight and your lantern is full again.', 'candle');
    void goDown(floorNo);
    return;
  }
  const hit = view.pick(ctx.scene.ray(p));
  if (!hit) return;
  const at = view.spotAt(hit) ?? undefined;
  const fx = ui.effects;
  switch (hit.kind) {
    case 'boat': void leaveMine(); return;
    case 'bram': openBram(); return;
    case 'entrance':
      if (!mine.open) { ui.open('square-room', { room: MINE.entrance.id }); return; }
      if (mine.deepest >= MINE.liftEvery) openLift((n) => void goDown(n)); else void goDown(1);
      return;
    case 'up': void goUp(); return;
    case 'lift': openLift((n) => { if (n !== floorNo) void goDown(n); }); return;
    case 'down': {
      if (!floor) return;
      if (floorNo >= MINE.floors) return;
      const r = mine.descend(floor);
      if (!r.ok) { if (r.reason) { ui.feedback.toast('Too hard to dig', r.reason, 'pick', 'warn'); audio.play('error'); } return; }
      void goDown(r.floor, 'ladder');
      return;
    }
    case 'cart': {
      if (!floor) return;
      if (mine.cartUsed(floorNo)) { ui.feedback.toast('Empty for today', 'The cart fills up again overnight.', 'mine_cart'); return; }
      const got = mine.emptyCart(floor, at);
      if (!got) return;
      audio.play('rock', { volume: 0.7 });
      if (at) fx.dust(at.clone().setY(at.y - 0.4), 8, 1.2);
      ui.feedback.toast('A cart of ore!', got.map((g) => `${g.n} ${ITEMS[g.item].name.toLowerCase()}`).join(', '), 'mine_cart');
      return;
    }
    case 'pool': {
      if (!floor) return;
      if (mine.poolUsed(floorNo)) { ui.feedback.toast('Still water', 'Nothing more in the pool today.', 'water_wave'); return; }
      const got = mine.dipPool(floor, at);
      if (!got) return;
      audio.play('sparkle', { volume: 0.7 });
      if (at) fx.sparkle(at, '#8ff8ff', 14);
      ui.feedback.toast(`${got.n > 1 ? `${got.n} ` : ''}${ITEMS[got.item].name}!`, got.first ? 'A new find for your collection' : 'From the cave pool', ITEMS[got.item].icon);
      return;
    }
    case 'chest': {
      if (mine.chestOpened(floorNo)) { ui.feedback.toast('Already opened', 'The old chest is empty now.', 'coin'); return; }
      const c = mine.openChest(floorNo, at);
      if (!c) return;
      audio.play('reward');
      if (at) { fx.sparkle(at, '#ffd84a', 24); fx.ring(at.clone().setY(at.y - 0.6), 3, '#ffd84a'); }
      ctx.scene.rig.shake(0.15, 0.3);
      ui.feedback.toast('Treasure!', `${c.coins.toLocaleString('en-US')} coins, ${c.gems} gems and ${Object.entries(c.items).map(([k, n]) => `${n} ${ITEMS[k].name.toLowerCase()}`).join(', ')}.`, 'coin');
      return;
    }
    case 'wild': if (hit.id && at) takePhoto(hit.id, at); return;
    case 'rock': swingAt(hit.i); return;
  }
}

function swingAt(i: number): void {
  if (!ctx || !view || !floor) return;
  const rock = floor.rocks[i];
  if (!rock) return;
  if (mine.swingsLeft() <= 0) {
    ui.feedback.toast('Your lantern is low', `It refills every morning: ${mine.maxSwings()} swings a day. Come back tomorrow!`, 'candle', 'warn');
    audio.play('error');
    return;
  }
  const at = view.spotAt({ kind: 'rock', i }) ?? undefined;
  const r = mine.swing(floor, i, at);
  if (!r) return;
  view.strike(i, r.broken, rock.kind, ui.effects);
  haptics.play(r.broken ? 'success' : 'tap');
  audio.play(r.broken ? 'rock' : 'chop', { volume: r.broken ? 0.85 : 0.5, rate: r.broken ? 0.95 : 1.15 + Math.random() * 0.15 });
  if (r.broken) {
    ctx.scene.rig.shake(0.06, 0.18);
    if (r.ladder) {
      audio.play('unlock', { volume: 0.7 });
      ui.feedback.toast('The ladder down!', 'Tap the hole to climb down to the next floor.', 'ladder');
    }
    const gem = r.drops.find((d) => ['mineral', 'fossil', 'artifact'].includes(ITEMS[d.item]?.cat) && ITEMS[d.item].sell >= 100);
    if (r.first.length) ui.feedback.toast(`${ITEMS[r.first[0]].name}!`, 'A new find for your collection', ITEMS[r.first[0]].icon);
    else if (gem) { audio.play('gem', { volume: 0.6 }); ui.feedback.toast(`${ITEMS[gem.item].name}!`, rock.kind === 'fossil' ? 'A fossil' : 'A lovely find', ITEMS[gem.item].icon); }
  }
  updateBanner();
}

// ------------------------------------------------------------------------------------ banner

function makeBanner(): HTMLElement {
  if (floorNo <= 0) {
    const home = button([icon('house'), h('span', null, 'Back to the farm')], () => void leaveMine(), 'green visit-home', { 'aria-label': 'Back to your farm' });
    return h('div', { class: 'visit-banner visit-keep sq-keep sq-banner mn-banner rows' },
      h('div', { class: 'visit-title' },
        h('div', { class: 'visit-name outlined' }, 'The Old Mine'),
        h('div', { class: 'visit-sub' }, h('span', { class: 'mn-desc' }, icon('pick'), mine.open ? mine.describe(0) : 'Boarded up. Help Bram open it again.')),
        h('div', { class: 'mn-actions row-extra' },
          mine.open ? button([icon('ladder'), 'Go down'], () => (mine.deepest >= MINE.liftEvery ? openLift((n) => void goDown(n)) : void goDown(1)), 'small yellow') : button([icon('pick'), 'Open the mine'], () => ui.open('square-room', { room: MINE.entrance.id }), 'small yellow'),
          button([icon('hammer'), "Bram's forge"], () => openBram(), 'small blue'))),
      home);
  }
  const l = layerOf(floorNo);
  const left = mine.swingsLeft(), max = mine.maxSwings();
  const pct = Math.round((left / max) * 100);
  return h('div', { class: `visit-banner visit-keep sq-keep sq-banner mn-banner mn-under mn-${l.id}` },
    h('div', { class: 'visit-title' },
      h('div', { class: 'visit-name outlined' }, `Floor ${floorNo}`),
      h('div', { class: 'visit-sub' }, h('span', null, icon(l.icon), l.name)),
      h('div', { class: 'mn-lantern', role: 'meter', 'aria-label': `${left} of ${max} swings left today`, 'aria-valuenow': String(left), 'aria-valuemax': String(max) },
        icon('candle'), h('div', { class: 'mn-oil' }, h('div', { class: 'mn-oil-fill', style: `width:${pct}%` })), h('span', { class: 'mn-oil-n' }, `${left}`)),
      h('div', { class: 'mn-hint' }, floorNo >= MINE.floors ? 'The very bottom of the mine.' : floor && mine.ladderFound(floor) ? 'The ladder is uncovered: tap the hole to go down.' : 'One rock hides the ladder down.')),
    h('div', { class: 'mn-side' },
      button([icon('ladder'), h('span', null, 'Up')], () => void goUp(), 'green visit-home', { 'aria-label': 'Climb up to the island' }),
      floor?.lift ? button([icon('pick'), h('span', null, 'Lift')], () => openLift((n) => { if (n !== floorNo) void goDown(n); }), 'small blue') : null));
}

function updateBanner(): void {
  if (!inMine || !banner) return;
  const fresh = makeBanner();
  banner.replaceWith(fresh);
  banner = fresh;
}

function frame(dt: number): void {
  if (!inMine || !view || !ctx) return;
  view.update(dt);
  if (floorNo > 0) view.setLantern(ctx.scene.rig.target);
  ctx.scene.loop.wake(0.1);
  ctx.scene.env.fogFloor = floorNo > 0 ? 0 : ctx.scene.rig.distance + 22;
}
