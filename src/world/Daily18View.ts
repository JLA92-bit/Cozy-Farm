import * as THREE from 'three';
import gsap from 'gsap';
import { assets } from '../core/Assets';
import { BUILDING } from '../data';
import { game } from '../systems/Game';
import { mail } from '../systems/Mail';
import { daily18, findInfo } from '../systems/Daily18';
import { Character } from './Character';
import { HALF, MAP, chunkOf, inMap, rotatedSize, tileToWorld } from './Grid';
import { findGeometry, mailboxFlagGeometry, mailboxGeometry } from './models/mailbox18';
import { villagerLook } from './VillagerLooks18';
import type { FarmScene } from '../scenes/FarmScene';

/** The flag's angle: up when a letter is waiting, lowered along the box when not. */
const FLAG_UP = 0;
const FLAG_DOWN = -Math.PI / 2;
const MAILBOX_SCALE = 1.25;
const FIND_SCALE = 1.7;

interface FindView { id: string; obj: THREE.Group; glint: THREE.Sprite; phase: number; x: number; z: number }

/**
 * 1.8 daily rhythm on the farm: the mailbox beside the farmhouse (its red flag up while a letter waits), the
 * villager of the day standing at the front door, and the day's little finds bobbing in the grass. All of it is
 * render-only: nothing here takes a tile, so it never gets in the way of building or walking.
 */
export class Daily18View {
  readonly group = new THREE.Group();
  private mailbox: THREE.Group;
  private flag: THREE.Mesh;
  private flagAngle = FLAG_DOWN;
  private flagTarget = FLAG_DOWN;
  private mailboxKey = '';
  readonly mailboxBox = new THREE.Box3();
  private visitor: { id: string; char: Character; leaving: boolean } | null = null;
  private visitorLoading = '';
  private visitorKey = '';
  readonly visitorPos = new THREE.Vector3();
  private finds = new Map<string, FindView>();
  private glintTex: THREE.Texture;
  private sphere = new THREE.Sphere();
  private tmp = new THREE.Vector3();
  /** taps: set by the UI layer */
  onMailbox: (() => void) | null = null;
  onVisitor: (() => void) | null = null;
  onFind: ((id: string, at: THREE.Vector3) => void) | null = null;
  /** the visitor's "!" bubble (world UI), placed every frame by the UI layer */
  onVisitorMoved: ((pos: THREE.Vector3 | null) => void) | null = null;

  constructor(private scene: FarmScene) {
    scene.scene.add(this.group);
    const mat = assets.vertexMaterial;
    this.mailbox = new THREE.Group();
    const box = new THREE.Mesh(mailboxGeometry(), mat);
    box.castShadow = true;
    this.flag = new THREE.Mesh(mailboxFlagGeometry(), mat);
    this.flag.castShadow = true;
    // pivot on the side of the box, a little behind the middle
    this.flag.position.set(0.17, 0.74, -0.06);
    this.mailbox.add(box, this.flag);
    this.mailbox.scale.setScalar(MAILBOX_SCALE);
    this.group.add(this.mailbox);
    this.glintTex = glint();
    scene.onTick(() => this.sync());
    scene.onFrame((dt, t) => this.frame(dt, t));
    for (const ev of ['building:placed', 'building:moved', 'building:removed'] as const) game.bus.on(ev, () => { this.mailboxKey = ''; this.visitorKey = ''; });
    this.sync();
  }

  // ------------------------------------------------------------------ layout around the farmhouse
  /** Farmhouse centre, the way its front faces and its half sizes, in world units. */
  private house(): { cx: number; cz: number; fx: number; fz: number; rx: number; rz: number; hw: number; hd: number; b: { x: number; z: number; w: number; d: number } } | null {
    const fh = game.buildingsOf('farmhouse')[0];
    if (!fh) return null;
    const [w, d] = rotatedSize(BUILDING.farmhouse.size, fh.rot);
    const yaw = -fh.rot * Math.PI / 2;
    // the model's front (+z) after its quarter turns, and its right-hand side
    const fx = Math.round(Math.sin(yaw)), fz = Math.round(Math.cos(yaw));
    const [sw, sd] = BUILDING.farmhouse.size;
    return { cx: fh.x - HALF + w / 2, cz: fh.z - HALF + d / 2, fx, fz, rx: fz, rz: -fx, hw: sw / 2, hd: sd / 2, b: { x: fh.x, z: fh.z, w, d } };
  }

  private free(tx: number, tz: number): boolean {
    if (!inMap(tx, tz) || !game.isUnlocked(chunkOf(tx, tz)) || game.occO[tz * MAP + tx]) return false;
    const uid = game.occB[tz * MAP + tx];
    if (!uid) return true;
    const b = game.byUid(uid);
    return !b || !!BUILDING[b.type].path;
  }

  private placeMailbox(): void {
    const h = this.house();
    const key = h ? `${h.b.x},${h.b.z},${h.fx},${h.fz}` : 'none';
    if (key === this.mailboxKey) return;
    this.mailboxKey = key;
    this.mailbox.visible = !!h;
    if (!h) { this.mailboxBox.makeEmpty(); return; }
    // at the front corner of the farmhouse plot, just inside it: beside the door, never on a tile you use
    const side = h.hw - 0.32, out = h.hd - 0.2;
    this.mailbox.position.set(h.cx + h.rx * side + h.fx * out, 0, h.cz + h.rz * side + h.fz * out);
    // the door of the box faces out the same way as the house
    this.mailbox.rotation.y = Math.atan2(h.fx, h.fz);
    this.mailboxBox.setFromCenterAndSize(this.tmp.copy(this.mailbox.position).setY(0.7), new THREE.Vector3(0.95, 1.5, 0.95));
  }

  /** Where the visitor waits: a free tile in front of the house, off to the side away from the mailbox. */
  private visitorSpot(): THREE.Vector3 | null {
    const h = this.house();
    if (!h) return null;
    const { x, z, w, d } = h.b;
    const front: [number, number][] = [];
    // tiles in the ring around the footprint, front row first, then the sides, then the back
    for (let tz = z - 1; tz <= z + d; tz++) for (let tx = x - 1; tx <= x + w; tx++) {
      if (tx >= x && tx < x + w && tz >= z && tz < z + d) continue;
      front.push([tx, tz]);
    }
    const score = ([tx, tz]: [number, number]) => {
      const wx = tileToWorld(tx) - h.cx, wz = tileToWorld(tz) - h.cz;
      // in front is best; the left side (away from the mailbox) breaks ties
      return (wx * h.fx + wz * h.fz) * 2 - (wx * h.rx + wz * h.rz) * 0.6;
    };
    front.sort((a, b) => score(b) - score(a));
    const spot = front.find(([tx, tz]) => this.free(tx, tz));
    if (!spot) return null;
    return new THREE.Vector3(tileToWorld(spot[0]), 0, tileToWorld(spot[1]));
  }

  // ------------------------------------------------------------------ sync with the day
  sync(): void {
    if (this.scene.visit) return;
    daily18.ensureToday();
    this.placeMailbox();
    this.flagTarget = mail.unread() > 0 ? FLAG_UP : FLAG_DOWN;
    if (daily18.relocateBlocked()) this.clearFinds();
    this.syncVisitor();
    this.syncFinds();
  }

  private syncVisitor(): void {
    const want = daily18.visitorWaiting ? daily18.today.visitor : '';
    const v = this.visitor;
    if (v && !v.leaving && v.id !== want) { this.sendHome(); return; }
    if (!want) { if (!v) this.onVisitorMoved?.(null); return; }
    if (v && !v.leaving) {
      // the farmhouse moved or something was built where they stand
      const h = this.house();
      const key = h ? `${h.b.x},${h.b.z},${h.fx}` : '';
      if (key !== this.visitorKey) {
        this.visitorKey = key;
        const spot = this.visitorSpot();
        if (spot) { v.char.root.position.copy(spot); this.visitorPos.copy(spot); }
      }
      return;
    }
    if (v || this.visitorLoading === want) return;
    void this.spawnVisitor(want);
  }

  private async spawnVisitor(id: string): Promise<void> {
    const spot = this.visitorSpot();
    if (!spot) return;
    this.visitorLoading = id;
    let c: Character;
    try { c = await Character.create(villagerLook(id), 1.4); } finally { this.visitorLoading = ''; }
    if (this.visitor || daily18.today.visitor !== id || !daily18.visitorWaiting) { c.dispose(); return; }
    const h = this.house();
    this.visitorKey = h ? `${h.b.x},${h.b.z},${h.fx}` : '';
    c.root.position.copy(spot);
    this.visitorPos.copy(spot);
    // face out of the farm, towards the camera side
    c.root.rotation.y = h ? Math.atan2(h.fx, h.fz) * 0.6 + 0.4 : 0.4;
    this.group.add(c.root);
    c.attachPetTo(this.group);
    this.visitor = { id, char: c, leaving: false };
    c.root.scale.setScalar(0.01);
    gsap.to(c.root.scale, { x: 1, y: 1, z: 1, duration: 0.45, ease: 'back.out(2.2)' });
    this.scene.loop.wake(0.6);
  }

  /** Happy wave, then shrink away (the request was done, or the day ended). */
  sendHome(happy = false): void {
    const v = this.visitor;
    if (!v || v.leaving) return;
    v.leaving = true;
    this.onVisitorMoved?.(null);
    const go = () => gsap.to(v.char.root.scale, {
      x: 0.01, y: 0.01, z: 0.01, duration: 0.35, ease: 'back.in(2)',
      onComplete: () => { this.group.remove(v.char.root); v.char.dispose(); if (this.visitor === v) this.visitor = null; },
    });
    if (happy) { void v.char.gesture('emote-yes'); setTimeout(go, 2600); } else go();
    this.scene.loop.wake(3);
  }

  /** The visitor's character root (for speech bubbles), while they are here. */
  get visitorRoot(): THREE.Object3D | null { return this.visitor && !this.visitor.leaving ? this.visitor.char.root : null; }

  private clearFinds(): void {
    for (const f of this.finds.values()) this.group.remove(f.obj);
    this.finds.clear();
  }

  private syncFinds(): void {
    const want = daily18.waitingFinds();
    const ids = new Set(want.map((f) => f.id + daily18.today.day));
    for (const [k, f] of this.finds) if (!ids.has(k)) { this.group.remove(f.obj); this.finds.delete(k); }
    for (const f of want) {
      const key = f.id + daily18.today.day;
      if (this.finds.has(key)) continue;
      const info = findInfo(f);
      const obj = new THREE.Group();
      const mesh = new THREE.Mesh(findGeom(info.lost ? `lost:${info.lost}` : info.kind), assets.vertexMaterial);
      mesh.castShadow = true;
      mesh.scale.setScalar(FIND_SCALE);
      const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glintTex, color: info.lost ? '#ffe680' : '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
      glint.scale.setScalar(0.55);
      glint.position.y = 0.5;
      obj.add(mesh, glint);
      obj.position.set(tileToWorld(f.x), 0, tileToWorld(f.z));
      obj.rotation.y = (f.x * 7 + f.z * 3) % 6;
      this.group.add(obj);
      this.finds.set(key, { id: f.id, obj, glint, phase: (f.x + f.z) * 0.7, x: f.x, z: f.z });
    }
  }

  /** A find was picked up: pop it away with a little spin. */
  takeFind(id: string): void {
    const key = id + daily18.today.day;
    const f = this.finds.get(key);
    if (!f) return;
    this.finds.delete(key);
    gsap.timeline({ onComplete: () => { this.group.remove(f.obj); }, onUpdate: () => this.scene.loop.wake(0.2) })
      .to(f.obj.position, { y: 0.9, duration: 0.25, ease: 'power2.out' })
      .to(f.obj.rotation, { y: f.obj.rotation.y + Math.PI * 2, duration: 0.4 }, 0)
      .to(f.obj.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.2, ease: 'back.in(2)' }, 0.22);
  }

  // ------------------------------------------------------------------ per frame
  private frame(dt: number, t: number): void {
    if (this.scene.visit) return;
    // flag swings with a little overshoot
    const d = this.flagTarget - this.flagAngle;
    if (Math.abs(d) > 0.002) {
      this.flagAngle += d * Math.min(1, dt * 6);
      this.flag.rotation.x = this.flagAngle;
      this.scene.loop.wake(0.2);
    } else if (this.flagTarget === FLAG_UP) {
      // a gentle wobble while a letter waits
      this.flag.rotation.x = FLAG_UP + Math.sin(t * 3) * 0.06;
    }
    for (const f of this.finds.values()) {
      const k = t * 2 + f.phase;
      f.obj.children[0].position.y = 0.04 + Math.abs(Math.sin(k)) * 0.06;
      f.glint.material.opacity = 0.35 + 0.45 * Math.max(0, Math.sin(k * 0.8));
      f.glint.material.rotation = t * 0.6 + f.phase;
    }
    const v = this.visitor;
    if (v) {
      v.char.update(dt);
      if (!v.leaving) this.onVisitorMoved?.(this.tmp.copy(v.char.root.position).setY((v.char.root.userData.speechHeight as number | undefined) ?? 1.9));
    }
  }

  // ------------------------------------------------------------------ taps
  pick(ray: THREE.Ray): (() => void) | null {
    if (this.scene.visit || !game.state.tutorial.done) return null;
    let best: (() => void) | null = null, bestD = Infinity;
    const consider = (center: THREE.Vector3, r: number, fn: () => void) => {
      this.sphere.center.copy(center); this.sphere.radius = r;
      if (!ray.intersectsSphere(this.sphere)) return;
      const dd = ray.origin.distanceToSquared(center);
      if (dd < bestD) { bestD = dd; best = fn; }
    };
    const v = this.visitor;
    if (v && !v.leaving) consider(this.tmp.copy(v.char.root.position).setY(0.8), 0.75, () => this.onVisitor?.());
    for (const f of this.finds.values()) {
      const at = f.obj.position.clone().setY(0.2);
      consider(at, 0.6, () => this.onFind?.(f.id, at));
    }
    if (this.mailbox.visible && ray.intersectsBox(this.mailboxBox)) {
      const c = this.mailboxBox.getCenter(new THREE.Vector3());
      const dd = ray.origin.distanceToSquared(c);
      if (dd < bestD) { bestD = dd; best = () => this.onMailbox?.(); }
    }
    return best;
  }

  /** World position of the mailbox (for effects). */
  mailboxPos(out = new THREE.Vector3()): THREE.Vector3 { return out.copy(this.mailbox.position).setY(1.2); }
}

const geoms = new Map<string, THREE.BufferGeometry>();
function findGeom(kind: string): THREE.BufferGeometry {
  let g = geoms.get(kind);
  if (!g) { g = findGeometry(kind); geoms.set(kind, g); }
  return g;
}

/** Soft four-point twinkle above each find, so they catch the eye. */
function glint(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,250,220,0.55)');
  grd.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.moveTo(32, 2); g.lineTo(35, 29); g.lineTo(62, 32); g.lineTo(35, 35); g.lineTo(32, 62); g.lineTo(29, 35); g.lineTo(2, 32); g.lineTo(29, 29);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
