import * as THREE from 'three';
import gsap from 'gsap';
import type { Pointer, DragKind } from '../core/Input';
import { BUILDING, CROP } from '../data';
import { buildings, isStorable } from '../systems/Buildings';
import { farming } from '../systems/Farming';
import { game } from '../systems/Game';
import type { PlacedBuilding } from '../systems/State';
import { isBuilt, plotReady, treeReady } from '../systems/Timers';
import { audio, haptics } from '../systems/Audio';
import { HALF, MAP, chunkOf, footprintCenter, inMap, rotatedSize, worldToTile } from '../world/Grid';
import { ghostMaterial, objectFor, visualFor, footprintMesh } from '../world/Visuals';
import type { FarmScene, WorldHandler } from './FarmScene';
import { ui } from '../ui/UI';

type PlaceMode = {
  kind: 'place'; type: string; fromStorage: boolean; uid?: number; x: number; z: number; rot: number;
  ghost: THREE.Group; foot: THREE.Group; valid: boolean; returnToEdit: boolean; grab: [number, number]; origin?: { x: number; z: number; rot: number };
};
type Mode = { kind: 'idle' } | { kind: 'edit' } | PlaceMode | { kind: 'plant'; crop: string | null };

type Swipe = { kind: 'harvest' | 'plant'; crop?: string; count: number; visited: Set<number> };

export class Interaction implements WorldHandler {
  mode: Mode = { kind: 'idle' };
  private swipe: Swipe | null = null;
  private dragGhost = false;
  private edgePan = new THREE.Vector2();
  private lastPointer: Pointer = { x: 0, y: 0 };

  constructor(private scene: FarmScene) {
    scene.onFrame((dt) => this.frame(dt));
  }

  get placing(): PlaceMode | null { return this.mode.kind === 'place' ? this.mode : null; }

  // ------------------------------------------------------------------ picking
  private pickBuilding(p: Pointer): PlacedBuilding | null {
    const v = this.scene.farm.pickBuilding(this.scene.ray(p));
    if (v) return v.b;
    const t = this.scene.tileAt(p);
    return t ? game.buildingAt(t[0], t[1]) ?? null : null;
  }
  /** Plot/tree under the pointer using the ground tile only (precise for swipes). */
  private plotAt(p: Pointer): PlacedBuilding | null {
    const t = this.scene.tileAt(p);
    if (!t) return null;
    const b = game.buildingAt(t[0], t[1]);
    return b && (b.type === 'plot' || BUILDING[b.type].tree) ? b : null;
  }
  private anchorOf(b: PlacedBuilding): THREE.Vector3 { return this.scene.farm.anchor(b.uid); }

  // ------------------------------------------------------------------ WorldHandler
  pointerDown(): void {}

  tap(p: Pointer): void {
    const m = this.mode;
    if (m.kind === 'place') {
      // tapping elsewhere moves the ghost there
      const t = this.scene.tileAt(p);
      if (t) this.moveGhost(t[0] - Math.floor(rotatedSize(BUILDING[m.type].size, m.rot)[0] / 2), t[1] - Math.floor(rotatedSize(BUILDING[m.type].size, m.rot)[1] / 2));
      return;
    }
    if (ui.world.hidePopup()) return;
    const b = this.pickBuilding(p);
    if (m.kind === 'edit') {
      if (b && !BUILDING[b.type].path) this.startMove(b.uid, true);
      else if (b) this.startMove(b.uid, true);
      return;
    }
    if (m.kind === 'plant') {
      if (b?.type === 'plot' && !b.plot && m.crop) { this.plantOne(b, m.crop, 0); return; }
      if (b?.type === 'plot' && !b.plot) return;
      this.exitPlant();
      if (!b) return;
    }
    if (b) { this.tapBuilding(b, p); return; }
    const t = this.scene.tileAt(p);
    if (!t || !inMap(t[0], t[1])) return;
    const o = game.obstacleAt(t[0], t[1]);
    if (o) { ui.obstaclePopup(o, this.tileWorld(t[0], t[1], this.scene.farm.obstacleHeight(o) + 0.2)); return; }
    const chunk = chunkOf(t[0], t[1]);
    if (!game.isUnlocked(chunk)) ui.expansionPopup(chunk);
  }

  private tileWorld(tx: number, tz: number, y = 0): THREE.Vector3 {
    return new THREE.Vector3(tx - HALF + 0.5, y, tz - HALF + 0.5);
  }

  private tapBuilding(b: PlacedBuilding, p: Pointer): void {
    const def = BUILDING[b.type];
    const view = this.scene.farm.views.get(b.uid);
    const now = game.now();
    if (view) this.scene.farm.bounce(view);
    audio.play('tap', { volume: 0.6 });
    if (!isBuilt(b, now)) { ui.buildingPopup(b); return; }
    if (b.type === 'plot') {
      if (!b.plot) { this.enterPlant(null); return; }
      if (plotReady(b, now)) { this.harvestOne(b, 0); return; }
      ui.buildingPopup(b);
      return;
    }
    if (def.tree) {
      if (treeReady(b, now)) this.harvestOne(b, 0);
      else ui.buildingPopup(b);
      return;
    }
    ui.tapBuilding(b, p);
  }

  longPress(p: Pointer): void {
    if (this.mode.kind === 'place') return;
    const b = this.pickBuilding(p);
    if (!b) return;
    haptics.buzz(15);
    this.startMove(b.uid, false);
    // continue as a ghost drag if the finger keeps moving
    this.dragGhost = true;
    const t = this.scene.tileAt(p);
    if (t && this.placing) this.placing.grab = [t[0] - this.placing.x, t[1] - this.placing.z];
  }

  dragStart(p: Pointer): DragKind {
    const m = this.mode;
    this.lastPointer = p;
    if (m.kind === 'place') {
      const t = this.scene.tileAt(p);
      if (t) {
        const [w, d] = rotatedSize(BUILDING[m.type].size, m.rot);
        const inside = t[0] >= m.x - 1 && t[0] < m.x + w + 1 && t[1] >= m.z - 1 && t[1] < m.z + d + 1;
        if (inside) { this.dragGhost = true; m.grab = [t[0] - m.x, t[1] - m.z]; return 'tool'; }
      }
      return 'pan';
    }
    if (m.kind === 'edit') return 'pan';
    const b = this.plotAt(p);
    const now = game.now();
    if (b && ((b.plot && plotReady(b, now)) || (BUILDING[b.type].tree && treeReady(b, now)))) {
      this.swipe = { kind: 'harvest', count: 0, visited: new Set() };
      this.toolDrag(p);
      return 'tool';
    }
    if (m.kind === 'plant' && m.crop && b && b.type === 'plot' && !b.plot) {
      this.swipe = { kind: 'plant', crop: m.crop, count: 0, visited: new Set() };
      this.toolDrag(p);
      return 'tool';
    }
    return 'pan';
  }

  /** A drag that starts on a seed in the tray plants across fields. */
  beginSeedDrag(crop: string): void {
    if (this.mode.kind !== 'plant') this.enterPlant(crop);
    else this.mode.crop = crop;
    this.swipe = { kind: 'plant', crop, count: 0, visited: new Set() };
  }
  seedDragMove(p: Pointer): void { if (this.swipe?.kind === 'plant') this.toolDrag(p); }
  seedDragEnd(): void { this.swipe = null; }

  toolDrag(p: Pointer): void {
    this.lastPointer = p;
    const m = this.mode;
    if (m.kind === 'place' && this.dragGhost) {
      const t = this.scene.tileAt(p);
      if (t) this.moveGhost(t[0] - m.grab[0], t[1] - m.grab[1]);
      // pan the camera when dragging near the screen edge
      const W = window.innerWidth, H = window.innerHeight, e = 60;
      this.edgePan.set(p.x < e ? -1 : p.x > W - e ? 1 : 0, p.y < e + 40 ? -1 : p.y > H - e - 40 ? 1 : 0);
      return;
    }
    if (!this.swipe) return;
    const b = this.plotAt(p);
    if (!b || this.swipe.visited.has(b.uid)) return;
    if (this.swipe.kind === 'harvest') {
      const now = game.now();
      if ((b.plot && plotReady(b, now)) || (BUILDING[b.type].tree && treeReady(b, now))) {
        this.swipe.visited.add(b.uid);
        this.harvestOne(b, this.swipe.count++);
      }
    } else if (this.swipe.kind === 'plant' && b.type === 'plot' && !b.plot && this.swipe.crop) {
      this.swipe.visited.add(b.uid);
      if (this.plantOne(b, this.swipe.crop, this.swipe.count)) this.swipe.count++;
      else this.swipe.visited.add(-1);
    }
  }

  toolDragEnd(): void {
    this.edgePan.set(0, 0);
    this.dragGhost = false;
    if (this.swipe?.kind === 'harvest' && this.swipe.count > 0) {
      game.setGauge('swipe_best', this.swipe.count);
      if (this.swipe.count >= 6) this.scene.rig.shake(0.12, 0.25);
    }
    this.swipe = null;
  }

  // ------------------------------------------------------------------ farming actions
  private harvestOne(b: PlacedBuilding, combo: number): void {
    const at = this.anchorOf(b);
    const crop = b.plot?.crop;
    const n = b.plot ? farming.harvest(b, at) : farming.harvestTree(b, at);
    if (!n) return;
    if (this.scene.env.night > 0.6) game.incStat('night_harvests');
    audio.playCombo(combo % 2 ? 'harvest2' : 'harvest', combo);
    haptics.buzz(10);
    const fx = ui.effects;
    const ground = at.clone().setY(0.4);
    if (crop) {
      const c = CROP[crop];
      void fx.pop(ground, c.ready.produce ?? c.ready.model, 0.45);
      fx.leaves(ground, crop === 'wheat' ? '#ffd25a' : '#8fdc5f', 6);
    } else fx.leaves(ground, '#8fdc5f', 8);
    fx.sparkle(ground, '#fff6a0', 4);
    game.bus.emit('tutorial', { signal: 'harvested' });
  }

  private plantOne(b: PlacedBuilding, crop: string, combo: number): boolean {
    const check = farming.canPlant(b, crop);
    if (!check.ok) {
      if (check.reason) { ui.feedback.toast(check.reason, undefined, 'cross'); audio.play('error'); }
      return false;
    }
    farming.plant(b, crop);
    audio.playCombo(combo % 2 ? 'plant2' : 'plant', combo);
    haptics.buzz(6);
    ui.effects.dust(this.anchorOf(b).setY(0.2), 3, 1.2);
    return true;
  }

  enterPlant(crop: string | null): void {
    this.cancelPlacement();
    this.mode = { kind: 'plant', crop: crop ?? (CROP.wheat ? 'wheat' : null) };
    ui.openSeedTray(this.mode.crop, (c) => { if (this.mode.kind === 'plant') this.mode.crop = c; }, () => this.exitPlant());
    game.bus.emit('tutorial', { signal: 'tray_open' });
  }
  exitPlant(): void {
    if (this.mode.kind !== 'plant') return;
    this.mode = { kind: 'idle' };
    ui.closeSeedTray();
  }

  // ------------------------------------------------------------------ build mode
  enterEdit(): void {
    this.exitPlant();
    this.cancelPlacement();
    this.mode = { kind: 'edit' };
    this.scene.farm.terrain.gridLines.visible = true;
    ui.setModeBanner('Build mode: tap a building to move it', () => this.exitEdit());
  }
  exitEdit(): void {
    if (this.mode.kind === 'place') this.cancelPlacement();
    this.mode = { kind: 'idle' };
    this.scene.farm.terrain.gridLines.visible = false;
    ui.setModeBanner(null);
  }

  /** Begin placing a new (or stored) building at the screen centre. */
  async startPlacement(type: string, fromStorage = false): Promise<void> {
    const returnToEdit = this.mode.kind === 'edit';
    this.exitPlant();
    this.cancelPlacement();
    const def = BUILDING[type];
    const c = this.scene.rig.target;
    const [w, d] = def.size;
    const spot = this.findSpot(type, worldToTile(c.x) - Math.floor(w / 2), worldToTile(c.z) - Math.floor(d / 2), 0);
    const ghost = await this.makeGhost(type);
    const foot = this.makeFoot(w, d);
    this.scene.scene.add(ghost, foot);
    this.mode = { kind: 'place', type, fromStorage, x: spot[0], z: spot[1], rot: 0, ghost, foot, valid: false, returnToEdit, grab: [0, 0] };
    this.scene.farm.terrain.gridLines.visible = true;
    this.moveGhost(spot[0], spot[1], true);
    this.scene.rig.focus(footprintCenter(spot[0], w), footprintCenter(spot[1], d));
    ui.showPlacementBar(this.placementActions());
    gsap.fromTo(ghost.scale, { x: 0.3, y: 0.3, z: 0.3 }, { x: 1, y: 1, z: 1, duration: 0.35, ease: 'back.out(2)' });
  }

  /** Pick up an existing building to move it. */
  async startMove(uid: number, returnToEdit: boolean): Promise<void> {
    const b = game.byUid(uid);
    if (!b) return;
    const def = BUILDING[b.type];
    this.exitPlant();
    this.cancelPlacement();
    ui.world.hidePopup();
    const ghost = await this.makeGhost(b.type);
    const [w, d] = def.size;
    const foot = this.makeFoot(w, d);
    this.scene.scene.add(ghost, foot);
    this.scene.farm.setHidden(uid, true);
    this.mode = { kind: 'place', type: b.type, fromStorage: false, uid, x: b.x, z: b.z, rot: b.rot, ghost, foot, valid: true, returnToEdit: returnToEdit || this.mode.kind === 'edit', grab: [0, 0], origin: { x: b.x, z: b.z, rot: b.rot } };
    this.scene.farm.terrain.gridLines.visible = true;
    this.moveGhost(b.x, b.z, true);
    ui.showPlacementBar(this.placementActions());
    audio.play('select');
  }

  private placementActions() {
    const m = this.placing!;
    const def = BUILDING[m.type];
    return {
      confirm: () => this.confirmPlacement(),
      rotate: () => this.rotate(),
      cancel: () => this.cancelPlacement(true),
      store: m.uid && isStorable(def) ? () => this.storeSelected() : undefined,
      name: def.name,
    };
  }

  private async makeGhost(type: string): Promise<THREE.Group> {
    const v = await visualFor(type);
    const g = new THREE.Group();
    if (v) {
      const o = objectFor(v);
      o.traverse((c: THREE.Object3D) => { const mesh = c as THREE.Mesh; if (mesh.isMesh) { mesh.material = ghostMaterial(mesh.material as THREE.Material); mesh.castShadow = false; } });
      g.add(o);
    } else {
      const def = BUILDING[type];
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 1), new THREE.MeshBasicMaterial({ color: def.model.slice(6) }));
      g.add(m);
    }
    return g;
  }

  private makeFoot(w: number, d: number): THREE.Group {
    const g = new THREE.Group();
    for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
      const m = footprintMesh();
      m.scale.setScalar(0.92);
      m.position.set(x + 0.5, 0.03, z + 0.5);
      g.add(m);
    }
    return g;
  }

  private findSpot(type: string, x: number, z: number, rot: number): [number, number] {
    for (let r = 0; r < 14; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (game.canPlace(type, x + dx, z + dz, rot)) return [x + dx, z + dz];
      }
    }
    return [x, z];
  }

  private moveGhost(x: number, z: number, force = false): void {
    const m = this.placing;
    if (!m) return;
    const [w, d] = rotatedSize(BUILDING[m.type].size, m.rot);
    x = THREE.MathUtils.clamp(x, 0, MAP - w);
    z = THREE.MathUtils.clamp(z, 0, MAP - d);
    if (!force && x === m.x && z === m.z) return;
    const moved = x !== m.x || z !== m.z;
    m.x = x; m.z = z;
    const valid = game.canPlace(m.type, x, z, m.rot, m.uid ?? 0);
    m.valid = valid;
    const cx = footprintCenter(x, w), cz = footprintCenter(z, d);
    if (moved && !force) {
      gsap.to(m.ghost.position, { x: cx, z: cz, duration: 0.08, ease: 'power1.out' });
      gsap.fromTo(m.ghost.position, { y: 0.35 }, { y: 0.15, duration: 0.15 });
      audio.play('snap', { volume: 0.35, throttleMs: 60 });
    } else m.ghost.position.set(cx, 0.15, cz);
    m.ghost.rotation.y = -m.rot * Math.PI / 2;
    m.foot.position.set(x - HALF, 0, z - HALF);
    // per-tile colouring: red tiles show exactly what blocks placement
    let i = 0;
    for (let tz = 0; tz < d; tz++) for (let tx = 0; tx < w; tx++) {
      const tile = m.foot.children[i++] as THREE.Mesh;
      if (!tile) continue;
      tile.position.set(tx + 0.5, 0.03, tz + 0.5);
      const ok = game.tileFree(x + tx, z + tz, m.uid ?? 0);
      (tile.material as THREE.MeshBasicMaterial).color.set(ok ? '#4cff6a' : '#ff4c4c');
    }
    ui.setPlacementValid(valid);
  }

  rotate(): void {
    const m = this.placing;
    if (!m) return;
    const def = BUILDING[m.type];
    m.rot = (m.rot + 1) % 4;
    if (def.size[0] !== def.size[1]) {
      // rebuild the footprint for the swapped dimensions
      this.scene.scene.remove(m.foot);
      const [w, d] = rotatedSize(def.size, m.rot);
      m.foot = this.makeFoot(w, d);
      this.scene.scene.add(m.foot);
    }
    gsap.fromTo(m.ghost.rotation, { y: m.ghost.rotation.y }, { y: -m.rot * Math.PI / 2, duration: 0.2, ease: 'back.out(2)' });
    this.moveGhost(m.x, m.z, true);
    audio.play('swipe', { volume: 0.5 });
  }

  confirmPlacement(): void {
    const m = this.placing;
    if (!m) return;
    if (!m.valid) { audio.play('error'); haptics.buzz([20, 40, 20]); ui.feedback.toast("Can't place here", 'Find a free green spot', 'cross'); return; }
    if (m.uid) {
      if (!buildings.move(m.uid, m.x, m.z, m.rot)) { audio.play('error'); return; }
      this.endPlacement();
      this.scene.farm.setHidden(m.uid, false);
      const v = this.scene.farm.views.get(m.uid);
      if (v) this.scene.farm.squash(v);
      audio.play('build');
      this.scene.rig.shake(0.08, 0.15);
    } else {
      const check = buildings.canBuy(m.type);
      if (!m.fromStorage && !check.ok) { ui.feedback.toast(check.reason, undefined, 'cross'); audio.play('error'); return; }
      const b = buildings.place(m.type, m.x, m.z, m.rot, m.fromStorage);
      if (!b) { audio.play('error'); return; }
      const def = BUILDING[m.type];
      const keep = def.cat === 'decor' || def.id === 'plot';
      const type = m.type, fromStorage = m.fromStorage;
      this.endPlacement();
      ui.effects.dust(new THREE.Vector3(footprintCenter(b.x, def.size[0]), 0.1, footprintCenter(b.z, def.size[1])), 12, def.size[0] * 0.8);
      this.scene.rig.shake(0.1, 0.18);
      haptics.buzz(20);
      game.bus.emit('tutorial', { signal: `placed:${type}` });
      // keep placing more of the same small things (fences, paths, fields) for convenience
      const more = fromStorage ? (game.state.storage[type] ?? 0) > 0 : keep && buildings.canBuy(type).ok;
      if (more) { void this.startPlacement(type, fromStorage); return; }
    }
    if (m.returnToEdit) this.enterEdit();
  }

  storeSelected(): void {
    const m = this.placing;
    if (!m?.uid) return;
    const uid = m.uid;
    this.endPlacement();
    if (!buildings.store(uid)) { this.scene.farm.setHidden(uid, false); ui.feedback.toast("Can't store this right now", 'Harvest crops first', 'cross'); return; }
    ui.feedback.toast('Stored in inventory', BUILDING[m.type].name, 'package');
    audio.play('collect');
    if (m.returnToEdit) this.enterEdit();
  }

  cancelPlacement(userAction = false): void {
    const m = this.placing;
    if (!m) return;
    this.endPlacement();
    if (m.uid) this.scene.farm.setHidden(m.uid, false);
    if (userAction && m.returnToEdit) this.enterEdit();
  }

  private endPlacement(): void {
    const m = this.placing;
    if (!m) return;
    this.scene.scene.remove(m.ghost, m.foot);
    this.mode = { kind: 'idle' };
    this.scene.farm.terrain.gridLines.visible = false;
    ui.hidePlacementBar();
    this.edgePan.set(0, 0);
  }

  private frame(dt: number): void {
    const m = this.placing;
    if (m && this.edgePan.lengthSq() > 0) {
      this.scene.rig.panPixels(-this.edgePan.x * 320 * dt, -this.edgePan.y * 320 * dt, window.innerHeight);
      this.toolDrag(this.lastPointer);
      this.scene.loop.wake(0.2);
    }
    if (m) {
      // gentle hover bob on the ghost
      m.ghost.position.y = 0.12 + Math.sin(performance.now() / 260) * 0.04;
      this.scene.loop.wake(0.2);
    }
  }
}
