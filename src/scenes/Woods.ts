import * as THREE from 'three';
import { ITEMS, ROOM, WOODS, WOODS_REGIONS } from '../data';
import { game } from '../systems/Game';
import { woods } from '../systems/Woods';
import { saves } from '../systems/Save';
import { visiting } from '../systems/Visiting';
import { MODELS, WoodsView, type WoodsHit } from '../world/WoodsView';
import { WoodsGate } from '../world/WoodsGate';
import { Panel } from '../ui/Panel';
import { tutorial } from '../ui/Tutorial';
import { ui } from '../ui/UI';
import { button, h, icon } from '../ui/dom';
import { assets } from '../core/Assets';
import { audio } from '../systems/Audio';
import { hints } from '../systems/Hints';
import { critters } from '../systems/Critters';
import { sayHello } from '../ui/panels/CritterPanel';
import { hideWipe, isVisiting, showWipe } from './Visit';
import { isInSquare } from './Square';
import type { DragKind, Pointer } from '../core/Input';
import type { FarmScene, WorldHandler } from './FarmScene';
import type { Interaction } from './Interaction';
import '../ui/panels/woods.css';

/**
 * Going to the Wild Woods (1.9). Same idea as the village square (scenes/Square.ts): a cloud wipe, a camera cut to a
 * little island of its own and a different tap handler, while the farm keeps running out of sight. Tap a plant to
 * pick it, tap a mound to dig. Back (button, browser back or Android back) cuts the camera home again.
 */

let ctx: { scene: FarmScene; interaction: Interaction } | null = null;
let view: WoodsView | null = null;
let loading: Promise<WoodsView> | null = null;
let inWoods = false;
let busy = false;
let ignorePop = false;
let saved: { target: THREE.Vector3; distance: number; min: number; max: number; bounds: THREE.Box2; handler: WorldHandler | null } | null = null;
let banner: HTMLElement | null = null;

export function isInWoods(): boolean { return inWoods; }
export function woodsView(): WoodsView | null { return view; }

/** Called once at boot (after the farm scene exists). */
export function initWoods(scene: FarmScene, interaction: Interaction): void {
  ctx = { scene, interaction };
  window.addEventListener('popstate', () => {
    if (ignorePop) { ignorePop = false; return; }
    if (inWoods) void leaveWoods(true);
  });
  scene.onFrame((dt) => frame(dt));
  const gate = new WoodsGate(scene);
  gate.onTap = () => { audio.play('pop', { volume: 0.6 }); void enterWoods(); };
  const prevPick = ui.extraPick;
  ui.extraPick = (ray) => gate.pick(ray) ?? prevPick?.(ray) ?? null;
  game.bus.on('woods:changed', () => { view?.refresh(); updateBanner(); });
  // 1.19 a trail restored: its bridge is whole and the region opens
  game.bus.on('restoration:room', ({ room }) => { if (room.startsWith('trail_')) { view?.refresh(); updateBanner(); } });
  game.bus.on('state:changed', () => { if (inWoods) view?.refresh(); });
  Object.assign(window as unknown as Record<string, unknown>, { __woods: { enter: enterWoods, leave: () => leaveWoods(), get active() { return inWoods; }, get view() { return view; }, gate, sys: woods, critters } });
}

async function loadView(): Promise<WoodsView> {
  if (view) return view;
  loading ??= (async () => {
    await assets.preload(MODELS);
    const v = new WoodsView();
    await v.build();
    ctx!.scene.scene.add(v.group);
    v.group.visible = false;
    view = v;
    return v;
  })();
  try { return await loading; } catch (e) { loading = null; throw e; }
}

/** Row over to the woods. */
export async function enterWoods(): Promise<void> {
  if (!ctx || inWoods || busy || isInSquare()) return;
  if (visiting.active || isVisiting()) return;
  if (!woods.unlocked) {
    ui.feedback.toast('The Wild Woods', `Opens at level ${WOODS.level}.`, 'mushroom');
    return;
  }
  if (tutorial.running) return;
  busy = true;
  const { scene, interaction } = ctx;
  Panel.closeAll();
  ui.world.hidePopup();
  interaction.cancelPlacement();
  if (interaction.mode.kind === 'edit') interaction.exitEdit();
  interaction.exitPlant();
  const wipe = showWipe('Rowing over to the Wild Woods');
  const started = performance.now();
  try {
    const v = await loadView();
    await new Promise((r) => setTimeout(r, Math.max(0, 420 - (performance.now() - started))));
    saves.save();
    saved = {
      target: scene.rig.target.clone(), distance: scene.rig.distance, min: scene.rig.minDistance, max: scene.rig.maxDistance,
      bounds: scene.rig.bounds.clone(), handler: scene.handler,
    };
    v.group.visible = true;
    v.refresh();
    inWoods = true;
    scene.handler = woodsHandler;
    const c = v.centre, f = v.focus;
    scene.rig.stop();
    // 1.19 wide enough to reach the regions round the glade
    scene.rig.bounds.set(new THREE.Vector2(c.x - 52, c.z - 52), new THREE.Vector2(c.x + 52, c.z + 52));
    scene.rig.target.set(f.x, 0, f.z);
    scene.rig.minDistance = 14;
    scene.rig.maxDistance = 60;
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    scene.rig.distance = THREE.MathUtils.clamp(36 * Math.max(1, 1.4 / aspect), 30, 52);
    ui.root.classList.add('squaring');
    banner = makeBanner();
    ui.root.append(banner);
    try { history.pushState({ cozyWoods: true }, ''); } catch { /* sandboxed */ }
    scene.loop.wake(1);
    await hideWipe(wipe);
    busy = false;
    woods.markVisited();
    if (hints.firstTime('intro:woods')) ui.feedback.toast('The Wild Woods', 'Tap the glinting plants to pick them and the mounds to dig. Everything comes back tomorrow.', 'mushroom');
    // 1.20 the feeding stumps
    else if (hints.firstTime('intro:critters')) ui.feedback.toast('Woodland Friends', 'Leave a treat on a feeding stump and a critter family will visit. Tap a stump to see what they like.', 'paw_prints');
  } catch (e) {
    console.error('[woods] could not open', e);
    cleanup();
    await hideWipe(wipe);
    busy = false;
    ui.feedback.toast("Couldn't open the woods", 'Something in it could not be drawn. Try again later.', 'cloud', 'warn');
  }
}


/** Back to the farm. */
export async function leaveWoods(fromBrowserBack = false): Promise<void> {
  if (!ctx || !inWoods || busy) return;
  busy = true;
  if (!fromBrowserBack && (history.state as { cozyWoods?: boolean } | null)?.cozyWoods) {
    ignorePop = true;
    try { history.back(); } catch { ignorePop = false; }
  }
  Panel.closeAll();
  const wipe = showWipe('Rowing home');
  await new Promise((r) => setTimeout(r, 380));
  cleanup();
  await hideWipe(wipe);
  busy = false;
}

function cleanup(): void {
  const scene = ctx!.scene;
  inWoods = false;
  scene.env.fogFloor = 0;
  if (view) view.group.visible = false;
  scene.handler = ctx!.interaction;
  if (saved) {
    scene.rig.stop();
    scene.rig.bounds.copy(saved.bounds);
    scene.rig.target.copy(saved.target);
    scene.rig.distance = saved.distance;
    scene.rig.minDistance = saved.min;
    scene.rig.maxDistance = saved.max;
    saved = null;
  }
  banner?.remove();
  banner = null;
  ui.root.classList.remove('squaring');
  scene.loop.wake(1);
}

// ------------------------------------------------------------------------------------ taps

const woodsHandler: WorldHandler = {
  pointerDown(): void {},
  tap(p: Pointer): void { tapAt(p); },
  longPress(p: Pointer): void { tapAt(p); },
  dragStart(): DragKind { return 'pan'; },
  toolDrag(): void {},
  toolDragEnd(): void {},
};

function tapAt(p: Pointer): void {
  if (!ctx || !view) return;
  const hit = view.pick(ctx.scene.ray(p));
  if (hit) act(hit);
}

function act(hit: WoodsHit): void {
  if (!ctx || !view) return;
  const at = view.spotAt(hit);
  if (!at) return;
  const fx = ui.effects;
  if (hit.kind === 'villager' && hit.id) { ui.open('village', { villager: hit.id }); return; }
  if (hit.kind === 'museum') { ui.open('museum'); return; }
  if (hit.kind === 'board') { ui.open('expeditions'); return; }
  // 1.20 Woodland Friends
  if (hit.kind === 'stump' && hit.id) { ui.open('critter', { id: hit.id }); return; }
  if (hit.kind === 'critter' && hit.id) { sayHello(hit.id); fx.hearts(at); return; }
  if (hit.kind === 'wren') { ui.open('wren'); return; }
  // 1.19 the Deep Woods
  if (hit.kind === 'trail') { const reg = WOODS_REGIONS.find((r) => r.id === hit.id); if (reg) ui.open('square-room', { room: reg.trail }); return; }
  if (hit.kind === 'pan' || hit.kind === 'tap') {
    const reg = WOODS_REGIONS.find((r) => r.id === (hit.kind === 'tap' ? hit.id?.split(':')[0] : hit.id));
    if (!reg) return;
    if (!woods.regionOpen(reg.id)) { ui.feedback.toast(`${reg.name} is closed`, `Restore ${ROOM[reg.trail]?.name ?? 'the trail'} at the sign to get there.`, 'lock'); return; }
    if (hit.kind === 'pan') {
      if (woods.pansLeft(reg.id) <= 0) { ui.feedback.toast('Tired arms', 'No more panning today. The creek will have more tomorrow.', 'water_wave'); return; }
      const r = woods.pan(reg.id, at);
      if (!r) return;
      audio.play('pop', { volume: 0.8 });
      fx.sparkle(at.clone().setY(0.8), '#ffe27a', 12);
      ui.feedback.toast(`${ITEMS[r.item].name}!`, r.first ? 'A new find for your collection' : `${woods.pansLeft(reg.id)} pans left today`, ITEMS[r.item].icon);
    } else {
      const t = woods.taps(reg.id).find((x) => x.id === hit.id);
      if (t && !t.ready) { const mins = Math.max(1, Math.round((t.readyAt - game.now()) / 60000)); ui.feedback.toast('Still filling', `This bucket is full in ${mins >= 60 ? `${Math.ceil(mins / 60)} h` : `${mins} min`}.`, 'hourglass'); return; }
      const r = woods.collectTap(hit.id ?? '', at);
      if (!r) return;
      audio.play('pop', { volume: 0.8 });
      fx.sparkle(at.clone().setY(1), '#ffd27a', 10);
      ui.feedback.toast(`+${r.n} ${ITEMS[r.item].name}`, 'The bucket starts filling again.', ITEMS[r.item].icon);
    }
    return;
  }
  if (hit.kind === 'firefly') {
    const item = woods.catchFirefly(hit.i, at);
    if (!item) return;
    audio.play('pop', { volume: 0.6 });
    fx.sparkle(at, '#fff27a', 14);
    ui.feedback.toast('Caught a firefly!', 'Into the jar it goes. They glow over Mossy Hollow every night.', ITEMS[item].icon);
    return;
  }
  if (hit.kind === 'forage') {
    const r = woods.pick(hit.i, at);
    if (!r) return;
    audio.play('pop', { volume: 0.7 });
    fx.sparkle(at.clone().setY(1), '#fffbe0', 10);
    ui.feedback.toast(`${r.n > 1 ? 'Two ' : ''}${ITEMS[r.item].name}!`, r.quality ? (r.quality === 2 ? 'A gold star find' : 'A silver star find') : undefined, ITEMS[r.item].icon);
  } else {
    if (woods.dug(hit.i)) return;
    if (woods.digsLeft() <= 0) { ui.feedback.toast('Tired arms', 'No more digging today. The mounds will be fresh tomorrow.', 'pick'); return; }
    const r = woods.dig(hit.i, at);
    if (!r) return;
    audio.play('pop', { volume: 0.8 });
    fx.dust(at.clone().setY(0.3), 12, 2);
    const rare = r.kind === 'artifact' || r.kind === 'fossil';
    if (rare) fx.ring(at, 3);
    ui.feedback.toast(`${ITEMS[r.item].name}!`, r.first ? 'A new find for your collection' : r.kind === 'artifact' ? 'An old artifact' : r.kind === 'fossil' ? 'A fossil' : undefined, ITEMS[r.item].icon);
  }
}

// ------------------------------------------------------------------------------------ banner

function bannerText(): string {
  const here = critters.waiting();
  return here.length ? `${woods.describe()} ${here.length === 1 ? `The ${here[0].name.toLowerCase()} are at their stump!` : `${here.length} critter families are visiting!`}` : woods.describe();
}

function makeBanner(): HTMLElement {
  const home = button([icon('house'), h('span', null, 'Back to the farm')], () => void leaveWoods(), 'green visit-home', { 'aria-label': 'Back to your farm' });
  return h('div', { class: 'visit-banner visit-keep sq-keep sq-banner wd-banner' },
    h('div', { class: 'visit-title' },
      h('div', { class: 'visit-name outlined' }, 'The Wild Woods'),
      h('div', { class: 'visit-sub' }, h('span', { class: 'wd-progress' }, icon('mushroom'), bannerText())),
      regionBar()),
    home);
}

/** 1.19 a row of places to fly the camera to: the glade and each region (a lock while its trail is not restored). */
function regionBar(): HTMLElement {
  const go = (id: string) => { const c = view?.regionCentre(id); if (c && ctx) ctx.scene.rig.focus(c.x, c.z); };
  const chips = [h('button', { class: 'wd-region', type: 'button', onclick: () => go('glade') }, icon('mushroom'), 'Glade')];
  for (const r of WOODS_REGIONS) {
    const open = woods.regionOpen(r.id);
    chips.push(h('button', { class: `wd-region${open ? '' : ' locked'}`, type: 'button', 'data-region': r.id, 'aria-label': open ? `Go to ${r.name}` : `${r.name}: restore the trail to open it`, onclick: () => go(r.id) }, icon(open ? r.icon : 'lock'), r.name));
  }
  return h('div', { class: 'wd-regions' }, ...chips);
}

function updateBanner(): void {
  if (!inWoods || !banner) return;
  const p = banner.querySelector('.wd-progress');
  if (p) p.lastChild!.textContent = bannerText();
  const bar = banner.querySelector('.wd-regions');
  if (bar) bar.replaceWith(regionBar());
}

let since = 0;
function frame(dt: number): void {
  if (!inWoods || !view || !ctx) return;
  view.update(dt);
  // fireflies come out at dusk and taps fill while you watch: look again now and then
  if ((since += dt) > 10) { since = 0; view.refresh(); }
  ctx.scene.loop.wake(0.1);
  ctx.scene.env.fogFloor = ctx.scene.rig.distance + 22;
}

