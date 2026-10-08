import * as THREE from 'three';
import gsap from 'gsap';
import { assets } from '../core/Assets';
import { DOCK } from './Terrain';
import { boatGeometry } from './models/square';
import type { Character } from './Character';
import type { FarmScene } from '../scenes/FarmScene';

/**
 * 1.8.7 boats: visitors (the travelling merchant, Marlow Pike) arrive at the farm's dock by boat and leave the same
 * way. The dock runs north from the farm's north edge (Terrain.ts); a boat ties up alongside its far end, the
 * passenger steps onto the planks, walks to the shore and climbs the little steps onto the land.
 */
export type Pt3 = [number, number, number];

/** Where the boat ties up beside the dock, and where it comes from and goes to out at sea. */
export const BOAT = {
  z: DOCK.z0 - 3.0, y: DOCK.waterY + 0.1,
  seaZ: DOCK.z0 - 24,
};
/** A boat ties up on the east side (1, Marlow Pike) or the west side (-1, the travelling merchant) of the dock. */
export type Berth = 1 | -1;
const berthX = (side: Berth): number => DOCK.x + 1.25 * side;
/** The planks, from the boat to the shore (y is the deck height). */
const DECK = DOCK.deckY;
/** The planks from the boat on that side to the shore. */
export const dockWalk = (side: Berth): Pt3[] => [[DOCK.x + 0.15 * side, DECK, BOAT.z], [DOCK.x, DECK, DOCK.z0 + 0.1]];
export const DOCK_WALK = dockWalk(1);
/** The steps up from the shore onto the farm's land, ending on the grass. */
export const STEPS_UP: Pt3[] = [
  [DOCK.x, DECK + 0.25, DOCK.z0 + 0.4], [DOCK.x, DECK + 0.47, DOCK.z0 + 0.68], [DOCK.x, DECK + 0.69, DOCK.z0 + 0.96],
  [DOCK.x, 0, DOCK.z0 + 1.5], [DOCK.x, 0, DOCK.z0 + 2.4],
];
/** The grass tile just above the steps (where a visitor starts walking on the farm). */
export const LANDING_TILE: [number, number] = [Math.floor(DOCK.x + 24), 1];

/**
 * Walk a character along points (x, y, z), turning to face the way it goes. Resolves when it arrives, then it
 * stands idle. `speed` is in world units per second.
 */
export function walkAlong(char: Character, pts: Pt3[], speed = 2.1, scene?: FarmScene): Promise<void> {
  return new Promise((resolve) => {
    const root = char.root;
    const pos = new THREE.Vector3();
    const from = [root.position.x, root.position.y, root.position.z] as Pt3;
    const all: Pt3[] = [from, ...pts];
    let total = 0;
    const seg: number[] = [];
    for (let i = 1; i < all.length; i++) { const d = Math.hypot(all[i][0] - all[i - 1][0], all[i][2] - all[i - 1][2]) + Math.abs(all[i][1] - all[i - 1][1]); seg.push(d); total += d; }
    if (total < 0.01) { resolve(); return; }
    char.play('walk');
    const k = { t: 0 };
    gsap.to(k, {
      t: total, duration: total / speed, ease: 'none',
      onUpdate: () => {
        let d = k.t, i = 0;
        while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
        const f = seg[i] > 0 ? Math.min(1, d / seg[i]) : 1;
        const a = all[i], b = all[i + 1];
        pos.set(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
        const dx = b[0] - a[0], dz = b[2] - a[2];
        if (Math.abs(dx) + Math.abs(dz) > 1e-4) {
          const yaw = Math.atan2(dx, dz);
          let diff = yaw - root.rotation.y;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          root.rotation.y += diff * 0.25;
        }
        root.position.copy(pos);
        scene?.loop.wake(0.2);
      },
      onComplete: () => { root.position.set(all[all.length - 1][0], all[all.length - 1][1], all[all.length - 1][2]); char.play('idle'); resolve(); },
    });
  });
}

/** A rowing boat that sails in to the dock and away again. Add a passenger with `board`. */
export class Boat {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh;
  private t = Math.random() * 6;
  private gone = false;

  constructor(private scene: FarmScene, readonly side: Berth = 1) {
    this.mesh = new THREE.Mesh(boatGeometry(), assets.vertexMaterial);
    this.mesh.castShadow = true;
    this.mesh.scale.setScalar(1.25);
    this.group.add(this.mesh);
    this.group.position.set(berthX(side), BOAT.y, BOAT.seaZ);
    this.group.rotation.y = 0;
    scene.scene.add(this.group);
    const bob = (dt: number) => { if (this.gone) return; this.t += dt; this.mesh.position.y = Math.sin(this.t * 1.5) * 0.04; this.mesh.rotation.z = Math.sin(this.t * 1.1) * 0.03; };
    scene.onFrame(bob);
  }

  /** Put a character in the boat (it stays in the boat until `unboard`). */
  board(char: Character, local: [number, number] = [0, 0.1]): void {
    this.group.add(char.root);
    char.root.position.set(local[0], 0.3, local[1]);
    char.root.rotation.y = 0;
    char.play('idle');
  }
  /** Take a character out of the boat, keeping where it stands. */
  unboard(char: Character): void { this.scene.scene.attach(char.root); }

  sailIn(seconds = 4.2): Promise<void> {
    return this.move(BOAT.seaZ, BOAT.z, seconds, 0, 'power2.out');
  }
  sailAway(seconds = 4.2): Promise<void> {
    return this.move(this.group.position.z, BOAT.seaZ, seconds, Math.PI, 'power2.in');
  }
  private move(from: number, to: number, seconds: number, yaw: number, ease: string): Promise<void> {
    return new Promise((resolve) => {
      this.group.position.set(berthX(this.side), BOAT.y, from);
      gsap.to(this.group.rotation, { y: yaw, duration: 0.6, ease: 'power1.inOut' });
      gsap.to(this.group.position, { z: to, duration: seconds, ease, onUpdate: () => this.scene.loop.wake(0.3), onComplete: () => resolve() });
    });
  }

  dispose(): void {
    this.gone = true;
    gsap.killTweensOf(this.group.position);
    this.scene.scene.remove(this.group);
    this.mesh.geometry.dispose();
  }
}
