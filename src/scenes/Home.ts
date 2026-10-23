import * as THREE from 'three';
import gsap from 'gsap';
import { HOME, PIECE, VILLAGER } from '../data';
import { game } from '../systems/Game';
import { home, homeUnlocked, roomOpen } from '../systems/Home';
import { saves } from '../systems/Save';
import { visiting } from '../systems/Visiting';
import { audio } from '../systems/Audio';
import { hints } from '../systems/Hints';
import { HomeView, HOME_ORIGIN } from '../world/home/HomeView';
import { pieceGeo, pieceGeoNow } from '../world/home/FurnitureGeo';
import { Panel } from '../ui/Panel';
import { tutorial } from '../ui/Tutorial';
import { ui } from '../ui/UI';
import { h, icon } from '../ui/dom';
import { speech } from '../ui/Speech';
import { hideWipe, isVisiting, showWipe } from './Visit';
import { isInSquare } from './Square';
import { isInWoods } from './Woods';
import { HomeUI } from '../ui/home/HomeUI';
import { HomeLife } from './HomeLife';
import type { DragKind, Pointer } from '../core/Input';
import type { FarmScene, WorldHandler } from './FarmScene';
import type { Interaction } from './Interaction';
import type { HomeItem } from '../systems/State';
import '../ui/home/home.css';

/**
 * 1.29 Home Sweet Home: going inside the Farmhouse. Same pattern as the woods and the square (a cloud wipe, a camera
 * cut to a place of its own and a different tap handler; the farm keeps running out of sight). Tap a piece to pick it
 * up, drag it to move it, and use the bars at the bottom to turn it, colour it, store it and so on.
 */

let ctx: { scene: FarmScene; interaction: Interaction } | null = null;
let view: HomeView | null = null;
let homeUi: HomeUI | null = null;
let inHome = false;
let busy = false;
let ignorePop = false;
let saved: { target: THREE.Vector3; distance: number; min: number; max: number; bounds: THREE.Box2; handler: WorldHandler | null; azimuth: number; elevation: number } | null = null;
let selected: number | null = null;
let life: HomeLife | null = null;
/** 1.30 relax: taps move your farmer and sit them down; decorate: taps pick up pieces */
let mode: 'relax' | 'decorate' = 'decorate';
let dragging = false;
let grab = new THREE.Vector3();
let rebuildQueued = false;
/** snapping step for moves (metres); the toolbar switches between a grid and fine moves */
let snap = 0.125;
try { const s = Number(localStorage.getItem('cozy-acres-home-snap')); if (s > 0 && s <= 0.5) snap = s; } catch { /* storage blocked */ }

export function isInHome(): boolean { return inHome; }
export function homeView(): HomeView | null { return view; }

/** Called once at boot (after the farm scene exists). */
export function initHome(scene: FarmScene, interaction: Interaction): void {
  ctx = { scene, interaction };
  window.addEventListener('popstate', () => {
    if (ignorePop) { ignorePop = false; return; }
    if (inHome) void leaveHome(true);
  });
  scene.onFrame((dt) => frame(dt));
  ui.register('home', () => void enterHome());
  // 1.29 villagers' furniture sets: sent as friendship grows (and to farms that already have the hearts)
  const gifts = () => {
    for (const id of home.sendGifts()) ui.feedback.toast('A gift for your home', `${PIECE[id].name} is in your home storage. There's a letter too.`, 'gift');
  };
  game.bus.on('village:points', gifts);
  game.bus.on('levelup', gifts);
  setTimeout(gifts, 4000);
  game.bus.on('home:changed', ({ room }) => {
    if (!inHome || !view || dragging) return;
    if (room && room !== view.roomId) return;
    queueRebuild();
  });
  // the door on the Farmhouse: a little bubble once the home is open
  scene.onFrame(() => {
    const fh = game.state.buildings.find((b) => b.type === 'farmhouse');
    const show = !!fh && !inHome && !isInWoods() && !isInSquare() && !scene.visit && homeUnlocked() && !tutorial.running;
    const at = show ? scene.farm.anchor(fh!.uid).clone().setY(3.2) : null;
    ui.world.setBubble('home-door', at, () =>
      h('div', { class: 'visit-bubble home-door', role: 'button', 'aria-label': 'Go inside your Farmhouse', onclick: (e: MouseEvent) => { e.stopPropagation(); void enterHome(); } }, icon('door')),
    'door');
  });
  Object.assign(window as unknown as Record<string, unknown>, { __home: { enter: enterHome, leave: () => leaveHome(), get active() { return inHome; }, get view() { return view; }, sys: home, select, placeFromStorage, controls, get life() { return life; }, get selected() { return selected; } } });
}

function queueRebuild(): void {
  if (rebuildQueued) return;
  rebuildQueued = true;
  requestAnimationFrame(() => {
    rebuildQueued = false;
    if (!view || !inHome) return;
    void view.preload(view.roomId).then(() => {
      view?.rebuild();
      life?.furnitureChanged();
      if (selected !== null && !home.item(view!.roomId, selected)) select(null);
      else view?.select(selected);
      homeUi?.refresh();
      ctx?.scene.loop.wake(0.5);
    });
  });
}

/** Go inside. */
export async function enterHome(roomId?: string): Promise<void> {
  if (!ctx || inHome || busy || isInSquare() || isInWoods()) return;
  if (visiting.active || isVisiting()) return;
  if (!homeUnlocked()) { ui.feedback.toast('Inside your Farmhouse', `Opens at level ${HOME.level}.`, 'door'); return; }
  if (tutorial.running) return;
  busy = true;
  const { scene, interaction } = ctx;
  Panel.closeAll();
  ui.world.hidePopup();
  interaction.cancelPlacement();
  if (interaction.mode.kind === 'edit') interaction.exitEdit();
  interaction.exitPlant();
  const wipe = showWipe('Going inside');
  const started = performance.now();
  try {
    const room = roomId && roomOpen(roomId) ? roomId : home.current();
    if (!view) { view = new HomeView(); scene.scene.add(view.group); }
    await view.show(room);
    home.setCurrent(room);
    await new Promise((r) => setTimeout(r, Math.max(0, 420 - (performance.now() - started))));
    saves.save();
    const rig = scene.rig;
    saved = { target: rig.target.clone(), distance: rig.distance, min: rig.minDistance, max: rig.maxDistance, bounds: rig.bounds.clone(), handler: scene.handler, azimuth: rig.azimuth, elevation: rig.elevation };
    view.group.visible = true;
    inHome = true;
    life = new HomeLife(view, () => scene.loop.wake(0.3));
    await life.start(game.state.player.look);
    scene.handler = homeHandler;
    scene.env.indoors = true;
    rig.stop();
    rig.elevation = THREE.MathUtils.degToRad(50);
    frameRoom(true);
    view.setAzimuth(rig.azimuth);
    ui.root.classList.add('squaring', 'homing');
    homeUi = new HomeUI(controls);
    ui.root.append(...homeUi.elements());
    try { history.pushState({ cozyHome: true }, ''); } catch { /* sandboxed */ }
    scene.loop.wake(1);
    await hideWipe(wipe);
    busy = false;
    if (hints.firstTime('intro:home')) ui.feedback.toast('Home sweet home', 'Tap a piece to pick it up, then drag it. Storage, the catalogue and the paint pots are at the bottom.', 'house');
  } catch (e) {
    console.error('[home] could not open', e);
    cleanup();
    await hideWipe(wipe);
    busy = false;
    ui.feedback.toast("Couldn't go inside", 'Something in the house could not be drawn. Try again later.', 'cloud', 'warn');
  }
}

/** Fit the camera to the room (on entering, changing room or enlarging it). */
function frameRoom(snapNow = false): void {
  if (!ctx || !view) return;
  const rig = ctx.scene.rig;
  const { w, d } = view.dims;
  const c = HOME_ORIGIN;
  rig.bounds.set(new THREE.Vector2(c.x - w / 2, c.z - d / 2), new THREE.Vector2(c.x + w / 2, c.z + d / 2));
  // far enough back to see the whole room (its diagonal, as the camera looks across a corner) on this screen
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  const vHalf = THREE.MathUtils.degToRad(rig.camera.fov / 2);
  const hHalf = Math.atan(Math.tan(vHalf) * aspect);
  const span = Math.hypot(w, d) / 2 + 0.2;
  // the banner and the tool bars cover the top and bottom of the screen: leave room for them
  const fit = Math.max(span / Math.tan(hHalf), (span * 1.3) / Math.tan(vHalf)) * 1.05;
  rig.minDistance = 3;
  rig.maxDistance = Math.max(12, fit * 1.6);
  if (snapNow) { rig.target.set(c.x, 0, c.z); rig.distance = THREE.MathUtils.clamp(fit, 5, 22); }
  else rig.focus(c.x, c.z, THREE.MathUtils.clamp(fit, 5, 22));
}

/** Back to the farm. */
export async function leaveHome(fromBrowserBack = false): Promise<void> {
  if (!ctx || !inHome || busy) return;
  busy = true;
  if (!fromBrowserBack && (history.state as { cozyHome?: boolean } | null)?.cozyHome) {
    ignorePop = true;
    try { history.back(); } catch { ignorePop = false; }
  }
  Panel.closeAll();
  const wipe = showWipe('Out to the farm');
  await new Promise((r) => setTimeout(r, 380));
  cleanup();
  saves.save();
  await hideWipe(wipe);
  busy = false;
}

function cleanup(): void {
  const scene = ctx!.scene;
  inHome = false;
  select(null);
  life?.stop();
  life = null;
  home.clearHistory();
  scene.env.indoors = false;
  scene.env.fogFloor = 0;
  if (view) view.group.visible = false;
  scene.handler = ctx!.interaction;
  if (saved) {
    const rig = scene.rig;
    rig.stop();
    gsap.killTweensOf(rig, 'azimuth');
    rig.bounds.copy(saved.bounds);
    rig.target.copy(saved.target);
    rig.distance = saved.distance;
    rig.minDistance = saved.min;
    rig.maxDistance = saved.max;
    rig.azimuth = saved.azimuth;
    rig.elevation = saved.elevation;
    saved = null;
  }
  scene.rig.camera.clearViewOffset();
  homeUi?.destroy();
  homeUi = null;
  ui.root.classList.remove('squaring', 'homing');
  scene.loop.wake(1);
}

// ------------------------------------------------------------------------------------ the controls the bars use

export const controls = {
  get roomId(): string { return view?.roomId ?? home.current(); },
  get selected(): number | null { return selected; },
  get snap(): number { return snap; },
  get mode(): 'relax' | 'decorate' { return mode; },
  setMode(m: 'relax' | 'decorate'): void {
    mode = m;
    if (m === 'relax') select(null);
    homeUi?.refresh();
    if (m === 'relax' && hints.firstTime('intro:home-relax')) ui.feedback.toast('Make yourself at home', 'Tap the floor to walk there, a chair or sofa to sit down, and a visitor to say hello.', 'couch');
  },
  item(): HomeItem | undefined { return selected === null ? undefined : home.item(controls.roomId, selected); },
  select: (uid: number | null) => select(uid),
  async goRoom(id: string): Promise<void> {
    if (!view || !roomOpen(id) || id === view.roomId) return;
    select(null);
    await view.show(id);
    home.setCurrent(id);
    await life?.start(game.state.player.look);
    frameRoom();
    view.setAzimuth(ctx!.scene.rig.azimuth);
    homeUi?.refresh();
    ctx?.scene.loop.wake(1);
  },
  placeFromStorage: (piece: string) => placeFromStorage(piece),
  rotate(dir = 1): void {
    const it = controls.item();
    if (!it || !view) return;
    const def = PIECE[it.f];
    if (def.kind === 'wall') { // a wall piece moves to the next standing wall
      const front = view.frontWalls();
      let w = it.w ?? 0;
      for (let k = 0; k < 4; k++) { w = (w + (dir > 0 ? 1 : 3)) % 4; if (!front[w]) break; }
      const c = view.clampWall(it.f, w, 0, it.y ?? def.wallY ?? 0.8);
      moveCarrying(controls.roomId, it.u, { x: c.x, z: 0, y: c.y, w }, true);
    } else {
      const r = (it.r + (dir > 0 ? 1 : 3)) % 4;
      const c = it.on !== undefined ? { x: it.x, z: it.z } : view.clampFloor(it.f, r, it.x, it.z);
      moveCarrying(controls.roomId, it.u, { x: c.x, z: c.z, y: it.y, r }, true);
    }
    audio.play('tap', { volume: 0.6 });
  },
  store(): void {
    const it = controls.item();
    if (!it) return;
    const n = home.store(controls.roomId, it.u);
    select(null);
    audio.play('pop', { volume: 0.6 });
    if (n > 1) ui.feedback.toast('Put away', `${n} pieces went back to storage.`, 'package');
  },
  duplicate(): void {
    const it = controls.item();
    if (!it || !view) return;
    const def = PIECE[it.f];
    const off = def.kind === 'wall' ? { x: it.x + 0.3, z: 0, y: it.y, w: it.w } : { x: it.x + 0.3, z: it.z + 0.3, y: it.y, on: it.on };
    if (def.kind !== 'wall' && it.on === undefined) { const c = view.clampFloor(it.f, it.r, off.x, off.z); off.x = c.x; off.z = c.z; }
    const copy = home.duplicate(controls.roomId, it.u, off);
    if (!copy) { ui.feedback.toast('No more of those', game.coins < home.price(it.f) ? 'Not enough coins for another.' : 'This room is full.', 'package', 'warn'); audio.play('error'); return; }
    select(copy.u);
    audio.play('pop', { volume: 0.6 });
  },
  toggleLamp(): void {
    const it = controls.item();
    if (!it) return;
    const on = home.toggleLamp(controls.roomId, it.u);
    audio.play(on ? 'tap' : 'close', { volume: 0.6 });
  },
  turnCamera(dir: number): void {
    if (!ctx || !view) return;
    const rig = ctx.scene.rig;
    const to = Math.round((rig.azimuth - Math.PI / 4) / (Math.PI / 2)) * (Math.PI / 2) + Math.PI / 4 + dir * Math.PI / 2;
    gsap.to(rig, { azimuth: to, duration: 0.45, ease: 'power2.inOut', onUpdate: () => { view?.setAzimuth(rig.azimuth); ctx?.scene.loop.wake(0.2); if (selected !== null) view?.select(selected); } });
  },
  setSnap(step: number): void {
    snap = step;
    try { localStorage.setItem('cozy-acres-home-snap', String(step)); } catch { /* storage blocked */ }
  },
  reframe: () => frameRoom(),
  leave: () => void leaveHome(),
  frontWalls: (): boolean[] => view?.frontWalls() ?? [false, false, true, true],
  /** Slide the picture so the room shows in the part of the screen a sheet leaves free (fractions of the screen). */
  setViewShift(x: number, y: number): void {
    if (!ctx) return;
    const cam = ctx.scene.rig.camera;
    const W = window.innerWidth, H = window.innerHeight;
    if (!x && !y) cam.clearViewOffset();
    else cam.setViewOffset(W, H, x * W, y * H, W, H);
    ctx.scene.loop.wake(0.3);
  },
  get azimuth(): number { return ctx?.scene.rig.azimuth ?? Math.PI / 4; },
};

function select(uid: number | null): void {
  selected = uid;
  view?.select(uid);
  homeUi?.onSelect();
  ctx?.scene.loop.wake(0.3);
}

/** Take a piece from storage and put it in the middle of the room (a wall piece on the first standing wall). */
async function placeFromStorage(piece: string): Promise<HomeItem | null> {
  if (!view) return null;
  const def = PIECE[piece];
  if (!def) return null;
  await pieceGeo(piece).catch(() => null);
  if (!pieceGeoNow(piece)) { ui.feedback.toast("Couldn't load that piece", 'Try again in a moment.', 'cloud', 'warn'); return null; }
  const roomId = view.roomId;
  if ((home.room(roomId)?.items.length ?? 0) >= HOME.maxItems) { ui.feedback.toast('This room is full', `A room holds up to ${HOME.maxItems} pieces.`, 'package', 'warn'); return null; }
  let it: HomeItem | null;
  // near where the camera looks
  const t = ctx!.scene.rig.target.clone().sub(HOME_ORIGIN);
  if (def.kind === 'wall') {
    const w = view.frontWalls().findIndex((f) => !f);
    const c = view.clampWall(piece, w, 0, def.wallY ?? 0.8);
    it = home.place(roomId, piece, { x: c.x, z: 0, y: c.y, w });
  } else {
    const c = view.clampFloor(piece, 0, t.x, t.z);
    it = home.place(roomId, piece, { x: snapTo(c.x), z: snapTo(c.z) });
  }
  if (!it) return null;
  view.sync();
  life?.furnitureChanged();
  if (mode === 'relax') { mode = 'decorate'; homeUi?.refresh(); }
  select(it.u);
  audio.play('pop', { volume: 0.7 });
  return it;
}

const snapTo = (v: number) => Math.round(v / snap) * snap;

/**
 * Move a piece and carry everything standing on it (books on a shelf, a lamp on a table) exactly as it sits,
 * including when a shelf moves along a wall or onto another wall.
 */
function moveCarrying(roomId: string, uid: number, to: Parameters<typeof home.move>[2], remember: boolean): void {
  const base = home.item(roomId, uid);
  const riders = home.riders(roomId, uid);
  if (!view || !base || !riders.length) { home.move(roomId, uid, to, remember); return; }
  const inv = view.matrixFor(base).clone().invert();
  const yaw0 = view.yawOf(base, PIECE[base.f]);
  const keep = riders.map((r) => ({ r, p: new THREE.Vector3(r.x, r.y ?? 0, r.z).applyMatrix4(inv) }));
  home.move(roomId, uid, to, remember, false);
  const moved = home.item(roomId, uid)!;
  const m = view.matrixFor(moved);
  const turn = ((Math.round((view.yawOf(moved, PIECE[moved.f]) - yaw0) / (Math.PI / 2)) % 4) + 4) % 4;
  for (const { r, p } of keep) {
    const w = p.clone().applyMatrix4(m);
    home.move(roomId, r.u, { x: w.x, z: w.z, y: w.y, r: (r.r + turn) % 4 }, false, false);
  }
}

// ------------------------------------------------------------------------------------ taps and drags

const homeHandler: WorldHandler = {
  pointerDown(): void {},
  tap(p: Pointer): void {
    if (!ctx || !view) return;
    const ray = ctx.scene.ray(p);
    if (mode === 'relax') { relaxTap(ray); return; }
    const hit = view.pick(ray);
    if (!hit) { if (selected !== null) select(null); return; }
    if (hit.uid === selected) {
      // a second tap on a lamp switches it
      const it = controls.item();
      if (it && PIECE[it.f]?.lamp) controls.toggleLamp();
      return;
    }
    select(hit.uid);
    audio.play('tap', { volume: 0.5 });
  },
  longPress(p: Pointer): void { homeHandler.tap(p); },
  dragStart(p: Pointer): DragKind {
    if (!ctx || !view || selected === null || mode === 'relax') return 'pan';
    const hit = view.pick(ctx.scene.ray(p));
    // drag the picked-up piece (or anything when it is the only thing under the finger); else move the camera
    if (!hit || hit.uid !== selected) return 'pan';
    const it = controls.item();
    if (!it) return 'pan';
    const def = PIECE[it.f];
    home.beginDrag(view.roomId);
    dragging = true;
    if (def.kind === 'wall') {
      const wp = view.wallPoint(ctx.scene.ray(p));
      grab.set(wp ? wp.x - it.x : 0, wp ? wp.y - (it.y ?? 0) : 0, 0);
    } else {
      const fp = view.floorPoint(ctx.scene.ray(p), it.y ?? 0);
      grab.set(fp ? fp.x - it.x : 0, 0, fp ? fp.z - it.z : 0);
    }
    return 'tool';
  },
  toolDrag(p: Pointer): void {
    if (!ctx || !view || selected === null) return;
    const it = controls.item();
    if (!it) return;
    const def = PIECE[it.f];
    const ray = ctx.scene.ray(p);
    const roomId = view.roomId;
    if (def.kind === 'wall') {
      const wp = view.wallPoint(ray);
      if (!wp) return;
      const x = snapTo(wp.x - (wp.w === it.w ? grab.x : 0)), y = snapTo(wp.y - (wp.w === it.w ? grab.y : 0));
      const c = view.clampWall(it.f, wp.w, x, y);
      moveCarrying(roomId, it.u, { x: c.x, z: 0, y: c.y, w: wp.w }, false);
    } else {
      const fp = view.floorPoint(ray, it.on !== undefined ? it.y ?? 0 : 0);
      if (!fp) return;
      let x = snapTo(fp.x - grab.x), z = snapTo(fp.z - grab.z);
      let y = 0;
      let on: number | null = null;
      if (def.kind === 'surface') {
        // small things go on the table top or shelf the finger points at (inside bookcases and on wall shelves too)
        const skip = new Set([it.u, ...home.riders(roomId, it.u).map((r) => r.u)]);
        const s = view.surfaceHit(ray, skip);
        if (s) {
          const fine = (v: number) => Math.round(v / 0.025) * 0.025;
          const c = view.clampOnto(it.f, it.r, fine(s.x), fine(s.z), s.box);
          moveCarrying(roomId, it.u, { x: c.x, z: c.z, y: s.y, on: s.uid }, false);
          view.refreshItem(it.u);
          view.select(it.u);
          return;
        }
        const flat = view.floorPoint(ray, 0)!;
        x = snapTo(flat.x - grab.x); z = snapTo(flat.z - grab.z);
      }
      const c = view.clampFloor(it.f, it.r, x, z);
      moveCarrying(roomId, it.u, { x: c.x, z: c.z, y, on }, false);
    }
    view.refreshItem(it.u);
    view.select(it.u);
  },
  toolDragEnd(): void {
    dragging = false;
    life?.furnitureChanged();
    if (selected !== null) { view?.refreshItem(selected); view?.select(selected); }
    audio.play('build', { volume: 0.35 });
    homeUi?.refresh();
  },
};

/** 1.30 relax: tap a visitor to say hello, a seat to sit, a lamp to switch it, anywhere else to walk there. */
function relaxTap(ray: THREE.Ray): void {
  if (!view || !life) return;
  const who = life.personAt(ray);
  if (who && who !== life.player) {
    if (VILLAGER[who.id]) { ui.open('village', { villager: who.id }); return; }
    speech.say(who.char.root, { text: 'Hello!', dur: 2 });
    return;
  }
  if (who === life.player) { void life.player!.char.gesture('emote-yes'); return; }
  const hit = view.pick(ray);
  const def = hit ? PIECE[home.item(view.roomId, hit.uid)?.f ?? ''] : undefined;
  if (hit && def?.seat) {
    if (life.sitOnPiece(hit.uid)) { audio.play('tap', { volume: 0.4 }); return; }
    if (!life.freeSeats(life.player ?? undefined).some((s) => s.uid === hit.uid)) { ui.feedback.toast('Someone is sitting there', 'Try another seat.', 'couch'); return; }
  }
  if (hit && def?.lamp && def.kind !== 'floor') { home.toggleLamp(view.roomId, hit.uid); return; }
  const fp = view.floorPoint(ray, 0);
  if (fp && life.walkPlayer(fp.x, fp.z)) audio.play('tap', { volume: 0.3 });
}

function frame(dt: number): void {
  if (!inHome || !view || !ctx) return;
  life?.update(dt);
  if (mode === 'decorate') life?.idlePlayer();
  view.setNight(ctx.scene.env.night);
  ctx.scene.env.fogFloor = 40;
}
