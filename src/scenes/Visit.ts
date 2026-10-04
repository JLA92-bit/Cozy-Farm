import * as THREE from 'three';
import type { DragKind, Pointer } from '../core/Input';
import { ANIMAL, BUILDING, CROP, LAND, TREE } from '../data';
import { FrozenGame, sanitizeSnapshot, snapshotState, type FarmSnapshot } from '../online/FarmSnapshot';
import { online } from '../online/Online';
import { playerCardHooks } from '../online/Leaderboard';
import { game } from '../systems/Game';
import { hints } from '../systems/Hints';
import { saves } from '../systems/Save';
import type { PlacedBuilding } from '../systems/State';
import { animalState, cropStage, isBuilt, productionState, treeReady } from '../systems/Timers';
import { visiting } from '../systems/Visiting';
import { Character } from '../world/Character';
import { FarmView } from '../world/FarmView';
import { HALF, MAP, chunkOf, footprintCenter, inMap, tileToWorld } from '../world/Grid';
import { Panel } from '../ui/Panel';
import { tutorial } from '../ui/Tutorial';
import { ui } from '../ui/UI';
import { button, fmt, h, icon } from '../ui/dom';
import type { FarmScene, WorldHandler } from './FarmScene';
import type { Interaction } from './Interaction';

/**
 * "Visit a neighbour's farm" (view only).
 *
 * Safety design: the visited farm is drawn by a SEPARATE FarmView that reads a separate, throw-away
 * game object (FrozenGame) built from the neighbour's public snapshot. The player's own `game.state`
 * is never swapped, replaced or handed to any system. While visiting:
 *  - the player's farm view, farmer, villagers and effects are only hidden (not touched), and the
 *    scene's tick and frame hooks are paused, so no system ticks, timers, quests or events run;
 *  - saving is held (`visiting.active`): the farm is saved once right before the visit, and autosave,
 *    the save on tab hide/close, cloud saves and farm publishing all do nothing until back home;
 *  - taps only show a small read-only info bubble.
 * Back home (button, browser back or Android back) disposes the visited view and shows the player's
 * own farm exactly as it was. Nothing about a visit is stored, so a reload during one simply starts
 * at home.
 */

interface Active {
  snap: FarmSnapshot;
  g: FrozenGame;
  view: FarmView;
  group: THREE.Group;
  char: Character | null;
  cam: { target: THREE.Vector3; distance: number; max: number };
  /** the sun's shadow setting before the visit (restored on the way home) */
  sunShadow: boolean;
  banner: HTMLElement;
  layer: HTMLElement;
  bubble: { el: HTMLElement; at: THREE.Vector3; until: number } | null;
}

let ctx: { scene: FarmScene; interaction: Interaction } | null = null;
let cur: Active | null = null;
let busy = false;
let ignorePop = false;
const SPHERE = new THREE.Sphere();
const VISIT_MAX_DISTANCE = 44;
const tmp2 = new THREE.Vector2();

/** "Visit farm" on leaderboard player cards (not on your own card). */
playerCardHooks.buttons.push((p, close) => {
  if (p.id === '__me' || p.id === online.me()?.id) return null;
  return button([icon('house'), 'Visit farm'], () => { close(); void visitFarm({ id: p.id, name: p.name }); }, 'blue', { 'aria-label': `Visit ${possessive(p.name || 'Farmer')} farm` });
});

/** Called once at boot. */
export function initVisit(scene: FarmScene, interaction: Interaction): void {
  ctx = { scene, interaction };
  window.addEventListener('popstate', () => {
    if (ignorePop) { ignorePop = false; return; }
    if (cur) void goHome(true);
  });
  // development only: lets the headless tests pretend the server is unreachable
  if (import.meta.env.DEV) Object.assign(window as unknown as Record<string, unknown>, { __online: () => online });
  Object.assign(window as unknown as Record<string, unknown>, { __visit: { visit: visitFarm, home: () => goHome(), get active() { return !!cur; }, get busy() { return busy; }, get view() { return cur?.view ?? null; }, get snapshot() { return cur?.snap ?? null; } } });
}

export function isVisiting(): boolean { return !!cur; }

/** "Granny Mae's", "Old Toms'". */
export function possessive(name: string): string { return /s$/i.test(name) ? `${name}'` : `${name}'s`; }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_r, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

// ------------------------------------------------------------------------------------ transitions

/** Soft cloud wipe over the whole screen with a friendly line (also the loading state). */
function showWipe(text: string): HTMLElement {
  document.querySelector('.visit-wipe')?.remove();
  const el = h('div', { class: 'visit-wipe', role: 'status', 'aria-live': 'polite' },
    h('div', { class: 'visit-cloud c1' }), h('div', { class: 'visit-cloud c2' }), h('div', { class: 'visit-cloud c3' }),
    h('div', { class: 'visit-wipe-text outlined' }, text, h('span', { class: 'visit-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'))));
  document.body.append(el);
  void el.offsetWidth;
  el.classList.add('on');
  return el;
}
async function hideWipe(el: HTMLElement): Promise<void> {
  el.classList.remove('on');
  await sleep(380);
  el.remove();
}

// ------------------------------------------------------------------------------------ going there

/** Fly to a player's farm (from a leaderboard card or a friend). Safe to call any time. */
export async function visitFarm(who: { id: string; name: string }): Promise<void> {
  if (!ctx || cur || busy) return;
  if (!game.state.player.created || !game.state.tutorial.done || tutorial.running) {
    ui.feedback.toast('Not just yet', 'Finish settling in on your own farm first.', 'farmer');
    return;
  }
  if (who.id === '__me' || who.id === online.me()?.id) { Panel.closeAll(); return; }
  busy = true;
  const { scene, interaction } = ctx;
  Panel.closeAll();
  ui.world.hidePopup();
  interaction.cancelPlacement();
  if (interaction.mode.kind === 'edit') interaction.exitEdit();
  interaction.exitPlant();
  const name = who.name || 'Farmer';
  const wipe = showWipe(`Walking over to ${possessive(name)} farm`);
  const started = performance.now();
  let snap: FarmSnapshot | null = null;
  let offline = false;
  let serverError = '';
  try {
    snap = sanitizeSnapshot(await withTimeout(online.getFarm(who.id), 15000));
  } catch (e) {
    const err = e as Error;
    // a real connection problem vs the server refusing (missing table, permissions...): say which
    if (err?.name === 'OfflineError' || !navigator.onLine || /fetch|network|timeout|abort|load failed/i.test(err?.message ?? '')) offline = true;
    else serverError = String(err?.message ?? e).slice(0, 120) || 'unknown error';
    console.warn('[visit] could not load the farm', e);
  }
  // let the clouds cover the screen before swapping farms
  await sleep(Math.max(0, 420 - (performance.now() - started)));
  if (!snap) {
    await hideWipe(wipe);
    busy = false;
    if (offline) ui.feedback.toast("Couldn't reach the village", 'Check your connection and try again in a moment.', 'cloud', 'warn');
    else if (serverError) ui.feedback.toast("Couldn't open this farm right now", `The village server said: ${serverError}`, 'cloud', 'warn');
    else ui.feedback.toast("This farm hasn't been shared yet", `${name} needs to play a little first. Try again later!`, 'farmer');
    return;
  }
  // one-time intro (remembered in the save, which is written right below, before the visit starts)
  const intro = hints.firstTime('intro:visit');
  // the player's farm is saved now and not again until back home
  saves.save();
  visiting.active = true;
  try {
    await enter(scene, snap);
  } catch (e) {
    console.error('[visit] could not show the farm', e);
    leave(scene, interaction);
    await hideWipe(wipe);
    busy = false;
    ui.feedback.toast("Couldn't show this farm", 'Something in it could not be drawn. Try again later.', 'cloud', 'warn');
    return;
  }
  await hideWipe(wipe);
  busy = false;
  if (intro) ui.feedback.toast(`Welcome to ${possessive(snap.name)} farm!`, 'Look around and tap things to see what they are. Tap Back home whenever you like.', 'house');
}

async function enter(scene: FarmScene, snap: FarmSnapshot): Promise<void> {
  const g = new FrozenGame(snap.at);
  g.load(snapshotState(snap));
  scene.hideOwnFarm();
  const view = new FarmView(scene.scene, g);
  const group = new THREE.Group();
  scene.scene.add(group);
  const layer = h('div', { class: 'visit-layer' });
  const a: Active = {
    snap, g, view, group, char: null, layer, bubble: null,
    cam: { target: scene.rig.target.clone(), distance: scene.rig.distance, max: scene.rig.maxDistance },
    sunShadow: scene.env.sun.castShadow,
    banner: banner(snap),
  };
  cur = a;
  // from here on the scene draws the visited farm and pauses all of the player's hooks
  scene.visit = { view, frame: (dt) => frame(a, dt) };
  scene.handler = visitHandler;
  // a visited farm is drawn with soft blob shadows instead of the sun's shadow map: it keeps a big
  // neighbour's farm well inside the draw-call and triangle budget (the shadow pass doubles both)
  scene.env.sun.castShadow = false;
  ui.root.classList.add('visiting');
  ui.root.append(a.banner, layer);
  try { history.pushState({ cozyVisit: true }, ''); } catch { /* sandboxed */ }

  await view.build();
  // their farmer (and pet) stands by the farmhouse
  const fh = g.state.buildings.find((b) => b.type === 'farmhouse');
  const spot = freeTileNear(g, fh ? fh.x + 1 : 24, fh ? fh.z + 4 : 21);
  try {
    const char = await Character.create(snap.look, 1.55);
    if (cur !== a) { char.dispose(); return; }
    char.root.position.set(tileToWorld(spot[0]), 0, tileToWorld(spot[1]));
    char.petPos.copy(char.root.position).add(new THREE.Vector3(0.5, 0, 0.5));
    group.add(char.root);
    char.attachPetTo(group);
    char.play('idle');
    const off = scene.rig.camera.position.clone().sub(scene.rig.target);
    char.root.rotation.y = Math.atan2(off.x, off.z);
    a.char = char;
  } catch (e) { console.warn('[visit] farmer could not be drawn', e); }
  // look at the farmyard
  const cx = fh ? footprintCenter(fh.x, 3) : 0, cz = fh ? footprintCenter(fh.z, 3) + 2 : 0;
  scene.rig.stop();
  scene.rig.target.set(cx, 0, cz);
  scene.rig.distance = 26;
  // a little less zoom-out than at home keeps big farms inside the triangle budget
  scene.rig.maxDistance = Math.min(a.cam.max, VISIT_MAX_DISTANCE);
  scene.loop.wake(1);
}

/** Nearest tile around (x, z) with nothing on it in the visited farm. */
function freeTileNear(g: FrozenGame, x: number, z: number): [number, number] {
  for (let r = 0; r <= 5; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const tx = x + dx, tz = z + dz;
      if (inMap(tx, tz) && !g.buildingAt(tx, tz) && !g.obstacleAt(tx, tz)) return [tx, tz];
    }
  }
  return [Math.min(MAP - 1, Math.max(0, x)), Math.min(MAP - 1, Math.max(0, z))];
}

function frame(a: Active, dt: number): void {
  if (a.char) {
    a.char.update(dt);
    ctx?.scene.loop.wake(0.1);
  }
  const b = a.bubble;
  if (b) {
    if (performance.now() > b.until) { hideBubble(a); return; }
    const p = ctx!.scene.project(b.at, tmp2);
    b.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
  }
}

// ------------------------------------------------------------------------------------ coming home

/** Back to the player's own farm, exactly as it was. */
export async function goHome(fromBrowserBack = false): Promise<void> {
  if (!ctx || !cur || busy) return;
  busy = true;
  const { scene, interaction } = ctx;
  if (!fromBrowserBack && (history.state as { cozyVisit?: boolean } | null)?.cozyVisit) {
    ignorePop = true;
    try { history.back(); } catch { ignorePop = false; }
  }
  const wipe = showWipe('Heading home');
  await sleep(380);
  leave(scene, interaction);
  await hideWipe(wipe);
  busy = false;
}

/** Remove the visited farm and show the player's own one again (also used when a visit fails). */
function leave(scene: FarmScene, interaction: Interaction): void {
  const a = cur;
  cur = null;
  scene.visit = null;
  scene.handler = interaction;
  if (a) {
    a.view.dispose();
    a.char?.dispose();
    scene.scene.remove(a.group);
    a.banner.remove();
    a.layer.remove();
    scene.rig.stop();
    scene.rig.target.copy(a.cam.target);
    scene.rig.distance = a.cam.distance;
    scene.rig.maxDistance = a.cam.max;
    scene.env.sun.castShadow = a.sunShadow;
  }
  scene.showOwnFarm();
  ui.root.classList.remove('visiting');
  visiting.active = false;
}

// ------------------------------------------------------------------------------------ UI

function banner(snap: FarmSnapshot): HTMLElement {
  const home = button([icon('house'), h('span', null, 'Back home')], () => void goHome(), 'green visit-home', { 'aria-label': 'Back home to your farm' });
  return h('div', { class: 'visit-banner visit-keep' },
    h('div', { class: 'visit-title' },
      h('div', { class: 'visit-name outlined' }, `Visiting ${possessive(snap.name)} farm - Level ${snap.level}`),
      h('div', { class: 'visit-sub' }, h('span', { class: 'visit-charm' }, icon('sparkle_heart'), `Charm ${fmt(snap.charm)}`), h('span', { class: 'visit-when' }, sharedAgo(snap.at)))),
    home);
}

function sharedAgo(at: number): string {
  const m = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (m < 2) return 'Shared just now';
  if (m < 60) return `Shared ${m} min ago`;
  const hr = Math.round(m / 60);
  if (hr < 48) return `Shared ${hr} h ago`;
  return `Shared ${Math.round(hr / 24)} days ago`;
}

function hideBubble(a: Active): void {
  a.bubble?.el.remove();
  a.bubble = null;
}

function showBubble(a: Active, at: THREE.Vector3, title: string, sub?: string): void {
  hideBubble(a);
  const el = h('div', { class: 'visit-bubble' }, h('div', { class: 'card' }, h('div', { class: 'card-title' }, title), sub ? h('div', { class: 'card-sub' }, sub) : null));
  a.layer.append(el);
  a.bubble = { el, at: at.clone(), until: performance.now() + 3500 };
  frame(a, 0);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Read-only description of something on a visited farm. */
export function describe(b: PlacedBuilding, now: number): { title: string; sub?: string } {
  const def = BUILDING[b.type];
  if (!isBuilt(b, now)) return { title: def.name, sub: 'Under construction' };
  if (def.id === 'plot') {
    if (!b.plot) return { title: 'Field - empty', sub: 'Waiting for seeds' };
    const st = cropStage(b.plot, now);
    return { title: `${CROP[b.plot.crop]?.name ?? 'Crop'} - ${st >= 3 ? 'ready' : 'growing'}`, sub: st >= 3 ? 'Ripe and ready to pick' : ['Just sprouted', 'Growing nicely', 'Almost ready'][st] };
  }
  if (def.tree) return { title: `${TREE[def.tree]?.name ?? def.name} - ${treeReady(b, now) ? 'ready' : 'growing'}`, sub: treeReady(b, now) ? 'Full of fruit' : 'Fruit on the way' };
  if (def.animal) {
    const n = b.animals?.length ?? 0;
    const a = ANIMAL[def.animal];
    if (!n) return { title: def.name, sub: 'No animals yet' };
    const ready = b.animals!.filter((_x, i) => animalState(b, i, now) === 'ready').length;
    return { title: def.name, sub: `${plural(n, a?.name ?? 'animal')}${ready ? `, ${ready} ready` : ''}` };
  }
  if (def.id === 'farmhouse') return { title: def.name, sub: `Level ${b.level}` };
  if (def.cat === 'production') return { title: def.name, sub: productionState(b, now).running ? 'Busy making goods' : 'Taking a break' };
  return { title: def.name, sub: def.charm ? `+${def.charm} Charm` : undefined };
}

/** Taps on a visited farm only show what things are. Drags pan, pinches zoom; nothing else. */
const visitHandler: WorldHandler = {
  pointerDown(): void {},
  tap(p: Pointer): void { inspect(p); },
  longPress(p: Pointer): void { inspect(p); },
  dragStart(): DragKind { if (cur) hideBubble(cur); return 'pan'; },
  toolDrag(): void {},
  toolDragEnd(): void {},
};

function inspect(p: Pointer): void {
  const a = cur;
  if (!a || !ctx) return;
  const scene = ctx.scene;
  const ray = scene.ray(p);
  const now = a.g.now();
  // their farmer
  if (a.char) {
    const pos = a.char.root.position;
    SPHERE.center.set(pos.x, 0.75, pos.z);
    SPHERE.radius = 0.6;
    if (ray.intersectsSphere(SPHERE)) {
      void a.char.gesture('emote-yes');
      showBubble(a, pos.clone().setY(1.9), a.snap.name, `Level ${a.snap.level} farmer`);
      return;
    }
  }
  const v = a.view.pickBuilding(ray);
  const t = scene.tileAt(p);
  const b = v?.b ?? (t ? a.g.buildingAt(t[0], t[1]) : undefined);
  if (b) {
    const d = describe(b, now);
    const bv = a.view.views.get(b.uid);
    if (bv) a.view.bounce(bv);
    showBubble(a, a.view.anchor(b.uid), d.title, d.sub);
    return;
  }
  if (!t || !inMap(t[0], t[1])) { hideBubble(a); return; }
  const o = a.g.obstacleAt(t[0], t[1]);
  const at = new THREE.Vector3(t[0] - HALF + 0.5, 1.2, t[1] - HALF + 0.5);
  if (o) {
    const def = (LAND.obstacles.types as Record<string, { name: string }>)[o.type];
    showBubble(a, at.setY(a.view.obstacleHeight(o) + 0.3), def?.name ?? 'Wild plant');
    return;
  }
  if (!a.g.isUnlocked(chunkOf(t[0], t[1]))) { showBubble(a, at, 'Wild land', 'Not part of the farm yet'); return; }
  hideBubble(a);
}

