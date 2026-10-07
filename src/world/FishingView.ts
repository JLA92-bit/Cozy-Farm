import * as THREE from 'three';
import gsap from 'gsap';
import { assets, assetUrl, iconPath } from '../core/Assets';
import { geo, PAL } from './Procedural';
import { SPOTS, type FishSpot } from './FishSpots';
import type { Character } from './Character';

export type BobberPhase = 'hidden' | 'cast' | 'wait' | 'nibble' | 'bite' | 'reel' | 'land';

const LINE_POINTS = 14;

/**
 * The dock fishing scene: a procedural rod in the farmer's hands, a line that sags and tightens, a bobber that
 * bobs, dips and drifts while you reel, a ripple ring on the water and the catch leaping out of the sea.
 * Five small draw calls, only while fishing. Nothing is allocated per frame.
 */
export class FishingView {
  readonly group = new THREE.Group();
  /** Where the farmer sits (dock end) and the default spot the bobber lands. */
  readonly seat = SPOTS.dock.seat.clone();
  /** the fishing spot in use: where the line is cast, which way the farmer faces and the sea level */
  private place: FishSpot = SPOTS.dock;
  readonly spot = new THREE.Vector3();
  private rod: THREE.Mesh;
  private tip = new THREE.Object3D();
  private line: THREE.Line;
  private linePos: Float32Array;
  private bobber: THREE.Mesh;
  private ripple: THREE.Mesh;
  private rippleMat: THREE.MeshBasicMaterial;
  private rippleT = 1;
  private sprite: THREE.Sprite;
  private spriteMat: THREE.SpriteMaterial;
  /** Catch pictures, drawn once onto a canvas (null while loading or if the picture failed). */
  private textures = new Map<string, Promise<THREE.Texture | null>>();
  private tipPos = new THREE.Vector3();
  private bob = new THREE.Vector3();
  private castFrom = new THREE.Vector3();
  private castK = 1;
  private phase: BobberPhase = 'hidden';
  private phaseT = 0;
  /** -1..1 sideways pull while reeling (follows the fish), 0..1 how far it has been reeled in */
  pull = 0;
  reelIn = 0;
  private char: Character | null = null;

  constructor(scene: THREE.Scene) {
    // rod: cork grip, reel, a tapering two-tone blank; tip marker at the end (local +Z is forward)
    const len = 2.1;
    this.rod = new THREE.Mesh(geo()
      .cyl(0.035, 0.04, 0.32, '#c98f5a', [0, 0, 0], 6, [Math.PI / 2, 0, 0])
      .cyl(0.06, 0.06, 0.05, PAL.metal, [0.05, 0, 0.12], 8, [0, 0, Math.PI / 2])
      .cyl(0.012, 0.026, len * 0.55, PAL.woodDark, [0, 0, 0.16 + len * 0.275], 5, [Math.PI / 2, 0, 0])
      .cyl(0.006, 0.012, len * 0.45, '#3f86d8', [0, 0, 0.16 + len * 0.775], 5, [Math.PI / 2, 0, 0])
      .build(), assets.vertexMaterial);
    this.tip.position.set(0, 0, 0.16 + len);
    this.rod.add(this.tip);
    this.rod.castShadow = false;

    const lg = new THREE.BufferGeometry();
    this.linePos = new Float32Array(LINE_POINTS * 3);
    lg.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3));
    this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: '#f4f1e8', transparent: true, opacity: 0.85 }));
    this.line.frustumCulled = false;

    this.bobber = new THREE.Mesh(geo()
      .sphere(0.11, PAL.white, [0, 0, 0], 1, [1, 0.85, 1])
      .sphere(0.112, PAL.red, [0, 0.03, 0], 1, [1, 0.6, 1])
      .cyl(0.012, 0.012, 0.12, PAL.woodDark, [0, 0.07, 0], 4)
      .build(), assets.vertexMaterial);
    this.bobber.castShadow = false;

    const rg = new THREE.RingGeometry(0.7, 1, 28);
    rg.rotateX(-Math.PI / 2);
    this.rippleMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
    this.ripple = new THREE.Mesh(rg, this.rippleMat);
    this.ripple.renderOrder = 3;

    this.spriteMat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false });
    this.sprite = new THREE.Sprite(this.spriteMat);
    this.sprite.visible = false;
    this.sprite.renderOrder = 6;

    this.group.add(this.line, this.bobber, this.ripple, this.sprite);
    this.group.visible = false;
    this.group.name = 'fishing';
    scene.add(this.group);
  }

  /** Seat the farmer on the dock end with the rod and show the scene. */
  enter(char: Character, place: FishSpot = SPOTS.dock): void {
    this.char = char;
    this.place = place;
    this.seat.copy(place.seat);
    const r = char.root;
    r.position.copy(this.seat);
    r.rotation.set(0, place.yaw, 0); // facing the open sea
    if (char.pet) char.pet.visible = false;
    char.play('sit', 0.25);
    // held in the right hand, angled up and out over the water
    this.rod.position.set(-0.32, 0.62, 0.2);
    this.rod.rotation.set(-0.72, 0.12, 0);
    r.add(this.rod);
    this.castPoint(this.spot, 0, 3.4);
    this.group.visible = true;
    this.setPhase('hidden');
  }

  /** Put the rod away and hide the scene. */
  exit(): void {
    this.rod.parent?.remove(this.rod);
    if (this.char?.pet) this.char.pet.visible = true;
    this.char = null;
    this.group.visible = false;
    this.sprite.visible = false;
    this.sprite.userData.leaping = false;
    gsap.killTweensOf(this.sprite.position);
    gsap.killTweensOf(this.sprite.scale);
  }

  get active(): boolean { return this.group.visible; }

  /** Bobber state; 'cast' flies it from the rod tip to a spot in front of the dock. */
  setPhase(p: BobberPhase): void {
    if (p === 'cast') {
      this.tipWorld(this.castFrom);
      this.castPoint(this.spot, (Math.random() - 0.5) * 1.4, 3.1 + Math.random() * 0.9);
      this.castK = 0;
      this.reelIn = 0;
      this.pull = 0;
    }
    if (p === 'bite' || (p === 'wait' && this.phase === 'cast')) this.splashRing(p === 'bite' ? 1.1 : 0.7);
    this.phase = p;
    this.phaseT = 0;
  }

  /** A point on the water: `ahead` in front of the seat and `side` to the left of the line (the dock casts along -z). */
  private castPoint(out: THREE.Vector3, side: number, ahead: number): THREE.Vector3 {
    const p = this.place;
    // sideways is the line turned a quarter: for the dock (casting along -z) it is the x axis
    return out.set(this.seat.x + p.dx * ahead + (-p.dz) * (side - 0.4), p.waterY, this.seat.z + p.dz * ahead + p.dx * (side - 0.4));
  }

  /** World position of the bobber (for splashes and effects). */
  bobberPos(out: THREE.Vector3): THREE.Vector3 { return out.copy(this.bob); }

  private tipWorld(out: THREE.Vector3): THREE.Vector3 {
    if (this.rod.parent) { this.rod.parent.updateMatrixWorld(); this.tip.getWorldPosition(out); }
    else out.copy(this.seat);
    return out;
  }

  private splashRing(size: number): void {
    this.rippleT = 0;
    this.ripple.userData.size = size;
  }

  /** The catch leaps out of the water towards the farmer. */
  leap(iconKey: string, done?: () => void): void {
    const s = this.sprite;
    // shown only once its picture is ready: an empty sprite would draw as a white square
    s.visible = false;
    this.spriteMat.map = null;
    let tex: Promise<THREE.Texture | null> | undefined = this.textures.get(iconKey);
    if (!tex) { tex = iconTexture(iconKey); this.textures.set(iconKey, tex); }
    void tex.then((t) => {
      if (!t || !s.userData.leaping) return;
      this.spriteMat.map = t;
      this.spriteMat.needsUpdate = true;
      s.visible = true;
    });
    s.userData.leaping = true;
    s.position.copy(this.bob);
    s.scale.setScalar(0.05);
    const to = this.seat;
    gsap.killTweensOf(s.position);
    gsap.timeline({ onComplete: () => { s.visible = false; s.userData.leaping = false; done?.(); } })
      .to(s.scale, { x: 0.9, y: 0.9, z: 0.9, duration: 0.25, ease: 'back.out(3)' }, 0)
      .to(s.position, { x: (this.bob.x + to.x) / 2, z: (this.bob.z + to.z) / 2, duration: 0.45, ease: 'none' }, 0)
      .to(s.position, { y: to.y + 2.2, duration: 0.45, ease: 'power2.out' }, 0)
      .to(s.position, { x: to.x, z: to.z + 0.1, duration: 0.4, ease: 'none' }, 0.45)
      .to(s.position, { y: to.y + 1.1, duration: 0.4, ease: 'power2.in' }, 0.45)
      .to(s.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.2, ease: 'back.in(2)' }, 0.8);
  }

  update(dt: number, t: number): void {
    if (!this.group.visible) return;
    this.phaseT += dt;
    const tip = this.tipWorld(this.tipPos);
    const p = this.phase;
    const b = this.bob;
    let sag = 0.45;
    if (p === 'hidden') {
      // bobber dangles just under the rod tip
      b.set(tip.x, tip.y - 0.55, tip.z);
      sag = 0;
    } else if (p === 'cast') {
      this.castK = Math.min(1, this.castK + dt / 0.7);
      const k = this.castK;
      b.lerpVectors(this.castFrom, this.spot, k);
      b.y += Math.sin(k * Math.PI) * 1.6;
      sag = 0.1;
    } else {
      const bobY = Math.sin(t * 2.3) * 0.025 + Math.sin(t * 1.1 + 1) * 0.015;
      let dip = 0, side = 0;
      if (p === 'nibble') dip = this.phaseT < 0.45 ? -Math.sin((this.phaseT / 0.45) * Math.PI) * 0.06 : 0;
      else if (p === 'bite') { dip = -0.16 - Math.abs(Math.sin(t * 18)) * 0.05; side = Math.sin(t * 11) * 0.08; }
      else if (p === 'reel') { dip = -0.08 - Math.abs(Math.sin(t * 9)) * 0.04; side = this.pull * 0.9; sag = 0.05; }
      else if (p === 'land') { dip = 0; sag = 0.25; }
      // reeling draws the bobber towards the dock
      const k = p === 'reel' ? this.reelIn * 0.55 : 0;
      b.set(this.spot.x + (-this.place.dz) * side + (this.seat.x - this.spot.x) * k, this.place.waterY + 0.03 + bobY + dip, this.spot.z + this.place.dx * side + (this.seat.z - this.spot.z) * k);
      if (p === 'wait' || p === 'nibble') sag = 0.4;
    }
    this.bobber.position.copy(b);
    this.bobber.rotation.z = p === 'bite' || p === 'reel' ? Math.sin(t * 13) * 0.35 : Math.sin(t * 1.7) * 0.08;
    this.bobber.visible = p !== 'land' || this.phaseT < 0.15;
    // line: a gentle catenary-ish sag from the tip to the bobber
    const arr = this.linePos;
    for (let i = 0; i < LINE_POINTS; i++) {
      const u = i / (LINE_POINTS - 1);
      arr[i * 3] = tip.x + (b.x - tip.x) * u;
      arr[i * 3 + 1] = tip.y + (b.y + 0.08 - tip.y) * u - sag * 4 * u * (1 - u);
      arr[i * 3 + 2] = tip.z + (b.z - tip.z) * u;
    }
    (this.line.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    // rod bends a little under load
    this.rod.rotation.x = -0.72 + (p === 'reel' ? 0.28 + Math.sin(t * 9) * 0.05 : p === 'bite' ? 0.18 : 0) + (p === 'cast' && this.castK < 0.35 ? -0.5 * (1 - this.castK / 0.35) : 0);
    this.rod.rotation.y = 0.12 + (p === 'reel' ? this.pull * 0.25 : 0);
    // ripple ring spreading from the bobber (also a soft idle ripple now and then)
    if (this.rippleT < 1) {
      this.rippleT = Math.min(1, this.rippleT + dt / 0.9);
      const size = (this.ripple.userData.size as number) ?? 1;
      const s = 0.15 + this.rippleT * size;
      this.ripple.scale.set(s, 1, s);
      this.ripple.position.set(b.x, this.place.waterY + 0.02, b.z);
      this.rippleMat.opacity = 0.7 * (1 - this.rippleT);
    } else if ((p === 'wait' || p === 'reel') && Math.random() < dt * (p === 'reel' ? 2.5 : 0.35)) this.splashRing(p === 'reel' ? 0.6 : 0.45);
    this.ripple.visible = this.rippleT < 1;
  }
}

/**
 * An icon as a sprite texture. The SVG is drawn onto a canvas first: some phones (Safari in particular)
 * cannot upload an SVG image straight to WebGL and show a blank white square instead.
 */
function iconTexture(key: string, px = 128): Promise<THREE.Texture | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = px;
        c.getContext('2d')!.drawImage(img, 0, 0, px, px);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        resolve(t);
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = assetUrl(iconPath(key));
  });
}
