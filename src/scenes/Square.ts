import * as THREE from 'three';
import { ROOMS } from '../data';
import { game } from '../systems/Game';
import { restoration } from '../systems/Restoration';
import { saves } from '../systems/Save';
import { visiting } from '../systems/Visiting';
import { SQUARE, SquareView } from '../world/SquareView';
import { SquareGate } from '../world/SquareGate';
import { Panel } from '../ui/Panel';
import { tutorial } from '../ui/Tutorial';
import { ui } from '../ui/UI';
import { button, h, icon } from '../ui/dom';
import { assets } from '../core/Assets';
import { audio } from '../systems/Audio';
import { hideWipe, isVisiting, showWipe } from './Visit';
import type { DragKind, Pointer } from '../core/Input';
import type { FarmScene, WorldHandler } from './FarmScene';
import type { Interaction } from './Interaction';
import '../ui/panels/square.css';

/**
 * Going to the village square (1.8.5 Village Restoration). The square is a little island of its own in the same
 * sea as the farm (src/world/SquareView.ts). Going there is a cloud wipe, a camera cut and a different tap
 * handler; the farm and the player's own systems keep running as normal, just out of sight. Back (button, browser
 * back or Android back) cuts the camera home again.
 */

let ctx: { scene: FarmScene; interaction: Interaction } | null = null;
let view: SquareView | null = null;
let loading: Promise<SquareView> | null = null;
let inSquare = false;
let busy = false;
let ignorePop = false;
let saved: { target: THREE.Vector3; distance: number; min: number; max: number; bounds: THREE.Box2; handler: WorldHandler | null } | null = null;
let layer: HTMLElement | null = null;
let banner: HTMLElement | null = null;
const labels = new Map<string, { el: HTMLElement; sub: HTMLElement; bar: HTMLElement; name: HTMLElement }>();
const tmp2 = new THREE.Vector2();

/** Models the square needs, loaded on the first visit (not at boot). */
const MODELS = [
  'bld/ruin', 'bld/dirt', 'bld/stage_a', 'bld/stage_b', 'bld/stage_c', 'bld/scaffolding', 'bld/market', 'bld/tower', 'bld/home_b', 'bld/grain',
  'prop/fountain', 'prop/lantern', 'prop/bench', 'prop/barrel', 'prop/crate_big', 'prop/crate_small', 'prop/sack', 'prop/wheelbarrow', 'prop/lumber', 'prop/stones',
  'prop/fence_wood', 'prop/banner_red', 'prop/banner_green', 'nat/rock_small', 'nat/tree_default', 'nat/tree_oak', 'nat/tree_a', 'nat/tree_b', 'nat/tree_fat',
  'nat/tree_simple', 'nat/flower_red', 'nat/flower_yellow', 'nat/flower_purple', 'nat/bush', 'nat/grass_large', 'pet/cow', 'pet/pig', 'pet/chick',
];

export function isInSquare(): boolean { return inSquare; }
export function squareView(): SquareView | null { return view; }

/** Called once at boot (after the farm scene exists). */
export function initSquare(scene: FarmScene, interaction: Interaction): void {
  ctx = { scene, interaction };
  window.addEventListener('popstate', () => {
    if (ignorePop) { ignorePop = false; return; }
    if (inSquare) void leaveSquare(true);
  });
  scene.onFrame((dt) => frame(dt));
  // the signpost and boat on the farm's east beach: the way over
  const gate = new SquareGate(scene);
  gate.onTap = () => { audio.play('pop', { volume: 0.6 }); void enterSquare(); };
  const prevPick = ui.extraPick;
  ui.extraPick = (ray) => gate.pick(ray) ?? prevPick?.(ray) ?? null;
  // a little "!" over the signpost while there is something to give to a bundle
  let givable = 0;
  scene.onTick(() => { givable = game.level >= 10 ? restoration.givable() : 0; });
  game.bus.on('item', () => { givable = game.level >= 10 ? restoration.givable() : 0; });
  scene.onFrame(() => {
    const show = !inSquare && !scene.visit && gate.group.visible && givable > 0;
    ui.world.setBubble('square-gate', show ? gate.bubbleAt : null, () =>
      h('div', { class: 'visit-bubble', role: 'button', 'aria-label': 'Village square: something to give', onclick: (e: MouseEvent) => { e.stopPropagation(); void enterSquare(); } }, h('span', { class: 'bang' }, '!'), icon('house')),
      `gate:${givable}`);
  });
  // a room that finishes while you are looking at it: bounce, sparkle
  game.bus.on('restoration:room', ({ room }) => {
    view?.refresh();
    updateLabels();
    if (!inSquare || !view) return;
    view.bounce(room);
    const at = view.groundOf(room);
    if (at) { ui.effects.levelUp(at.clone().setY(1.5)); ui.effects.ring(at, 6); scene.rig.shake(0.2, 0.4); }
    restoration.markSeen(room);
  });
  game.bus.on('restoration:changed', () => { view?.refresh(); updateLabels(); });
  Object.assign(window as unknown as Record<string, unknown>, { __square: { enter: enterSquare, leave: () => leaveSquare(), get active() { return inSquare; }, get view() { return view; }, gate } });
}

async function loadView(): Promise<SquareView> {
  if (view) return view;
  loading ??= (async () => {
    await assets.preload(MODELS);
    const v = new SquareView();
    await v.build();
    ctx!.scene.scene.add(v.group);
    v.group.visible = false;
    view = v;
    return v;
  })();
  try { return await loading; } catch (e) { loading = null; throw e; }
}

/** Fly to the village square. `room` opens straight on that room afterwards. */
export async function enterSquare(room?: string): Promise<void> {
  if (!ctx || inSquare || busy) return;
  if (visiting.active || isVisiting()) return;
  if (!game.state.player.created || !game.state.tutorial.done || tutorial.running) {
    ui.feedback.toast('Not just yet', 'Finish settling in on your own farm first.', 'farmer');
    return;
  }
  busy = true;
  const { scene, interaction } = ctx;
  Panel.closeAll();
  ui.world.hidePopup();
  interaction.cancelPlacement();
  if (interaction.mode.kind === 'edit') interaction.exitEdit();
  interaction.exitPlant();
  const wipe = showWipe('Walking over to the village square');
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
    const aspect0 = window.innerWidth / Math.max(1, window.innerHeight);
    v.layout(aspect0 < 0.85 ? 'street' : 'arc');
    v.refresh();
    inSquare = true;
    scene.handler = squareHandler;
    const c = v.centre, f = v.focus;
    scene.rig.stop();
    scene.rig.bounds.set(new THREE.Vector2(c.x - 14, c.z - 14), new THREE.Vector2(c.x + 14, c.z + 14));
    scene.rig.target.set(f.x, 0, f.z);
    scene.rig.minDistance = 14;
    scene.rig.maxDistance = 66;
    // wide enough to take in the whole row of six lots on a narrow phone screen too
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    scene.rig.distance = v.mode === 'arc' ? THREE.MathUtils.clamp(38 * Math.max(1, 1.5 / aspect), 32, 54) : 60;
    ui.root.classList.add('squaring');
    layer = h('div', { class: 'sq-layer sq-keep' });
    banner = makeBanner();
    ui.root.append(banner, layer);
    buildLabels(v);
    updateLabels();
    try { history.pushState({ cozySquare: true }, ''); } catch { /* sandboxed */ }
    scene.loop.wake(1);
    await hideWipe(wipe);
    busy = false;
    if (room) { ui.open('square-room', { room }); }
    else if (game.state.restoration && restoration.roomsDone() === 0 && restoration.bundlesDoneTotal() === 0) {
      ui.feedback.toast('The village square', 'Tap a lot to see what it needs. Fill its bundles and the room is rebuilt for good.', 'house');
    }
  } catch (e) {
    console.error('[square] could not open', e);
    cleanup();
    await hideWipe(wipe);
    busy = false;
    ui.feedback.toast("Couldn't open the square", 'Something in it could not be drawn. Try again later.', 'cloud', 'warn');
  }
}

/** Back to the farm. */
export async function leaveSquare(fromBrowserBack = false): Promise<void> {
  if (!ctx || !inSquare || busy) return;
  busy = true;
  if (!fromBrowserBack && (history.state as { cozySquare?: boolean } | null)?.cozySquare) {
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
  inSquare = false;
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
  layer?.remove(); banner?.remove();
  layer = null; banner = null;
  labels.clear();
  ui.root.classList.remove('squaring');
  scene.loop.wake(1);
}

// ------------------------------------------------------------------------------------ taps

const squareHandler: WorldHandler = {
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
  if (!hit) return;
  if (hit.room) { ui.open('square-room', { room: hit.room }); return; }
  if (hit.villager) ui.open('village', { villager: hit.villager });
}

// ------------------------------------------------------------------------------------ banner and labels

function makeBanner(): HTMLElement {
  const home = button([icon('house'), h('span', null, 'Back to the farm')], () => void leaveSquare(), 'green visit-home', { 'aria-label': 'Back to your farm' });
  const done = restoration.roomsDone();
  return h('div', { class: 'visit-banner visit-keep sq-keep sq-banner' },
    h('div', { class: 'visit-title' },
      h('div', { class: 'visit-name outlined' }, 'The Village Square'),
      h('div', { class: 'visit-sub' }, h('span', { class: 'sq-progress' }, icon('sparkle_heart'), `${done} of ${ROOMS.length} rooms rebuilt`))),
    home);
}

function buildLabels(v: SquareView): void {
  if (!layer) return;
  for (const room of ROOMS) {
    const name = h('span', { class: 'sq-name outlined' });
    const sub = h('span', { class: 'sq-sub' });
    const bar = h('span', { class: 'sq-bar-fill' });
    const el = h('div', { class: 'sq-label', 'data-room': room.id }, h('div', { class: 'sq-label-top' }, icon(room.icon, 'sq-label-icon'), name), sub, h('div', { class: 'sq-bar' }, bar));
    layer.append(el);
    labels.set(room.id, { el, sub, bar, name });
  }
  void v;
}

function updateLabels(): void {
  if (!inSquare) return;
  const done = restoration.roomsDone();
  const prog = banner?.querySelector('.sq-progress');
  if (prog) prog.lastChild!.textContent = `${done} of ${ROOMS.length} rooms rebuilt`;
  for (const room of ROOMS) {
    const l = labels.get(room.id);
    if (!l) continue;
    l.name.textContent = room.name;
    const open = restoration.isOpen(room.id), fin = restoration.isDone(room.id);
    let text: string;
    if (fin) text = 'Rebuilt';
    else if (room.soon) text = 'Opens in a later update';
    else if (!open) text = `Opens at level ${room.opensAt}`;
    else text = `${restoration.bundlesDone(room.id)} of ${room.bundles.length} bundles`;
    l.sub.textContent = text;
    const f = fin ? 1 : room.soon || !open ? 0 : restoration.roomFraction(room.id);
    l.bar.style.width = `${Math.round(f * 100)}%`;
    l.el.classList.toggle('done', fin);
    l.el.classList.toggle('locked', !fin && (room.soon || !open));
    l.el.classList.toggle('ready', !fin && open && !room.soon && restoration.givable() > 0 && restoration.lines(room.id, room.bundles[0]?.id ?? '').length > 0 && room.bundles.some((b) => !restoration.bundleDone(room.id, b.id) && restoration.lines(room.id, b.id).some((ln) => restoration.canGive(room.id, b.id, ln.item) > 0)));
  }
}

function frame(dt: number): void {
  if (!inSquare || !view || !ctx) return;
  view.update(dt);
  const scene = ctx.scene;
  scene.loop.wake(0.1);
  scene.env.fogFloor = scene.rig.distance + 22;
  for (const [id, l] of labels) {
    const at = view.anchorOf(id);
    if (!at) continue;
    const p = scene.project(at, tmp2);
    l.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
  }
}

/** Call after the square's numbers may have changed (a give, a level up). */
export function refreshSquare(): void { view?.refresh(); updateLabels(); }

export const SQUARE_AT = SQUARE;
