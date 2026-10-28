import * as THREE from 'three';
import { h, itemIcon } from '../ui/dom';
import { fishNet } from '../systems/FishNet';
import { game } from '../systems/Game';
import { hints } from '../systems/Hints';
import { FISHING } from '../data';
import { DOCK } from './Terrain';
import type { FarmScene } from '../scenes/FarmScene';

/** In the water west of the dock, clear of the boats that tie up beside it (Boats.ts berths at DOCK.x +-1.25). */
const AT = { x: DOCK.x - 4.2, z0: DOCK.z0 - 1.6, z1: DOCK.z0 - 5.2 };
const WATER = DOCK.waterY;

/**
 * 1.34 The fishing net at the dock (systems/FishNet.ts): two posts in the water with a rope between them. When the net is
 * set, floats bob on the rope and the net hangs below, sitting lower as fish swim in; a bubble shows when it is full.
 * Tap it to open the net screen. Hidden until the net unlocks and while visiting.
 */
export class DockNet {
  readonly group = new THREE.Group();
  readonly box = new THREE.Box3();
  private setGroup = new THREE.Group();
  private floats: THREE.Mesh[] = [];
  private mesh: THREE.Mesh;
  private t = 0;
  private intro = false;

  constructor(private scene: FarmScene) {
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.9 });
    const len = AT.z0 - AT.z1, midZ = (AT.z0 + AT.z1) / 2;
    for (const z of [AT.z0, AT.z1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.6, 7), wood);
      post.position.set(AT.x, WATER + 0.3, z);
      post.castShadow = true;
      this.group.add(post);
    }
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 5), new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 1 }));
    rope.rotation.x = Math.PI / 2;
    rope.position.set(AT.x, WATER + 0.95, midZ);
    this.group.add(rope);
    // the net: a mesh pattern hanging from the rope into the water
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.3), new THREE.MeshStandardMaterial({ map: netTexture(len), transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1 }));
    this.mesh.rotation.y = Math.PI / 2;
    this.mesh.position.set(AT.x, WATER + 0.3, midZ);
    this.setGroup.add(this.mesh);
    const red = new THREE.MeshStandardMaterial({ color: 0xff5c5c, roughness: 0.6 }), white = new THREE.MeshStandardMaterial({ color: 0xfff6e8, roughness: 0.6 });
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), i % 2 ? white : red);
      f.position.set(AT.x, WATER + 0.05, AT.z0 - 0.35 - (i * (len - 0.7)) / 4);
      this.floats.push(f);
      this.setGroup.add(f);
    }
    this.group.add(this.setGroup);
    this.group.visible = false;
    this.box.setFromCenterAndSize(new THREE.Vector3(AT.x, WATER + 0.6, midZ), new THREE.Vector3(2.4, 2.4, len + 1.2));
    scene.scene.add(this.group);
    scene.onFrame((dt) => this.frame(dt));
    scene.onTick(() => this.sync());
    this.sync();
  }

  private get shown(): boolean { return fishNet.unlocked && !this.scene.visit; }

  /** Show or hide, the net's depth, and the "full" bubble. */
  sync(): void {
    this.group.visible = this.shown;
    // a one-time hello when the net unlocks (Fishing skill 3)
    if (this.shown && !this.intro && hints.firstTime('intro:net')) {
      this.intro = true;
      setTimeout(() => game.bus.emit('toast', { title: 'A fishing net!', sub: `Your Fishing skill is good enough for a net. It hangs by the dock: set it with ${FISHING.net.bait} bait and fish swim in while you do other things.`, icon: 'fish_net' }), 2500);
    }
    const s = fishNet.set;
    this.setGroup.visible = !!s;
    const full = this.shown && fishNet.full();
    // dynamic import: the UI module loads after the world
    void import('../ui/UI').then(({ ui }) => {
      const fish = fishNet.inNet();
      ui.world.setBubble('net', full ? this.anchor : null, () =>
        h('div', { class: 'bubble', onclick: (e: MouseEvent) => { e.stopPropagation(); ui.open('net'); } }, itemIcon(fish[fish.length - 1] ?? 'sardine')), 'full');
    });
    this.scene.loop.wake(0.2);
  }

  private frame(dt: number): void {
    if (!this.group.visible || !this.setGroup.visible) return;
    this.t += dt;
    const s = fishNet.set;
    const fill = s ? fishNet.count() / s.fish.length : 0;
    // floats sit a little lower and bob a little more as the net fills
    this.floats.forEach((f, i) => { f.position.y = WATER + 0.05 - fill * 0.06 + Math.sin(this.t * (1.4 + fill) + i * 1.3) * (0.025 + fill * 0.03); });
    this.mesh.position.y = WATER + 0.3 - fill * 0.15;
  }

  /** The tap handler for a ray: open the net screen. */
  pick(ray: THREE.Ray): (() => void) | null {
    if (!this.group.visible || !ray.intersectsBox(this.box)) return null;
    return () => { void import('../ui/UI').then(({ ui }) => ui.open('net')); };
  }

  get anchor(): THREE.Vector3 { return new THREE.Vector3(AT.x, WATER + 1.9, (AT.z0 + AT.z1) / 2); }
}

/** A diamond mesh pattern, drawn once. */
function netTexture(len: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(232, 222, 196, 0.85)';
  g.lineWidth = 3;
  for (let x = -128; x < 384; x += 24) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 128, 128); g.stroke();
    g.beginPath(); g.moveTo(x + 128, 0); g.lineTo(x, 128); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(Math.max(1, len / 2), 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
