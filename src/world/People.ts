import * as THREE from 'three';
import { BUILDING } from '../data';
import { game } from '../systems/Game';
import type { PlacedBuilding } from '../systems/State';
import { Character } from './Character';
import { HALF, MAP, chunkOf, footprintCenter, inMap, rotatedSize, tileToWorld } from './Grid';
import { findPath } from './Path';

/** Every walker in the scene (gates swing open for them). */
export const walkers = new Set<Walker>();

/**
 * Tiles people can walk on: unlocked, no obstacle, and either empty or a path/field/gate. With `stand`, only tiles
 * fit to stop on (people walk through gates but never loiter in them).
 */
export function walkable(x: number, z: number, stand = false): boolean {
  if (!inMap(x, z) || !game.isUnlocked(chunkOf(x, z))) return false;
  if (game.occO[z * MAP + x]) return false;
  const uid = game.occB[z * MAP + x];
  if (!uid) return true;
  const b = game.byUid(uid);
  if (!b) return true;
  const def = BUILDING[b.type];
  return !!def.path || (!!def.gate && !stand) || b.type === 'plot';
}

/** A free tile next to a building's footprint, closest to `from`. */
export function besideBuilding(b: PlacedBuilding, from: [number, number]): [number, number] | null {
  const [w, d] = rotatedSize(BUILDING[b.type].size, b.rot);
  let best: [number, number] | null = null, bestD = Infinity;
  for (let z = b.z - 1; z <= b.z + d; z++) for (let x = b.x - 1; x <= b.x + w; x++) {
    const edge = x === b.x - 1 || x === b.x + w || z === b.z - 1 || z === b.z + d;
    if (!edge || !walkable(x, z, true)) continue;
    const dd = (x - from[0]) ** 2 + (z - from[1]) ** 2;
    if (dd < bestD) { bestD = dd; best = [x, z]; }
  }
  return best;
}

/** World-space centre of a building's footprint (x, z). */
export function buildingCenter(b: PlacedBuilding): [number, number] {
  const [w, d] = rotatedSize(BUILDING[b.type].size, b.rot);
  return [footprintCenter(b.x, w), footprintCenter(b.z, d)];
}

const TMP = new THREE.Vector3();

/** A character that follows tile paths. */
export class Walker {
  readonly char: Character;
  path: THREE.Vector3[] = [];
  speed = 2.4;
  onArrive: (() => void) | null = null;
  idleTime = 0;
  /** yaw to turn towards smoothly while standing */
  private yawTarget: number | null = null;

  constructor(char: Character, public scene: THREE.Object3D) {
    this.char = char;
    walkers.add(this);
    scene.add(char.root);
    char.attachPetTo(scene);
  }

  get tile(): [number, number] {
    return [Math.floor(this.char.root.position.x + HALF), Math.floor(this.char.root.position.z + HALF)];
  }

  placeAt(tx: number, tz: number): void {
    this.char.root.position.set(tileToWorld(tx), 0, tileToWorld(tz));
    this.char.petPos.copy(this.char.root.position).add(new THREE.Vector3(0.5, 0, 0.5));
  }

  /** Walk to a tile; returns false if unreachable. */
  walkTo(tx: number, tz: number, onArrive?: () => void): boolean {
    const [sx, sz] = this.tile;
    const p = findPath(THREE.MathUtils.clamp(sx, 0, MAP - 1), THREE.MathUtils.clamp(sz, 0, MAP - 1), tx, tz, walkable);
    if (!p) return false;
    this.path = p.slice(1).map(([x, z]) => new THREE.Vector3(tileToWorld(x) + (Math.random() - 0.5) * 0.2, 0, tileToWorld(z) + (Math.random() - 0.5) * 0.2));
    this.onArrive = onArrive ?? null;
    if (!this.path.length) { this.onArrive?.(); this.onArrive = null; }
    return true;
  }

  get walking(): boolean { return this.path.length > 0; }

  update(dt: number): void {
    const root = this.char.root;
    if (this.path.length) {
      const target = this.path[0];
      const d = TMP.copy(target).sub(root.position);
      d.y = 0;
      const dist = d.length();
      const run = this.path.length > 6;
      const step = this.speed * (run ? 1.6 : 1) * dt;
      if (dist <= step) {
        root.position.copy(target);
        this.path.shift();
        if (!this.path.length) {
          this.char.play('idle');
          const cb = this.onArrive;
          this.onArrive = null;
          cb?.();
        }
      } else {
        root.position.addScaledVector(d.normalize(), step);
        const yaw = Math.atan2(d.x, d.z);
        let diff = yaw - root.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        root.rotation.y += diff * Math.min(1, dt * 12);
        this.char.play(run ? 'sprint' : 'walk', 0.15);
      }
      this.idleTime = 0;
      this.yawTarget = null;
    } else {
      this.idleTime += dt;
      if (this.yawTarget !== null) {
        let diff = this.yawTarget - root.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) < 0.01) { root.rotation.y = this.yawTarget; this.yawTarget = null; }
        else root.rotation.y += diff * Math.min(1, dt * 10);
      }
    }
    this.char.update(dt);
  }

  /** Turn (smoothly) to look at a world position. */
  face(x: number, z: number): void {
    const p = this.char.root.position;
    if (Math.abs(x - p.x) + Math.abs(z - p.z) < 1e-3) return;
    this.yawTarget = Math.atan2(x - p.x, z - p.z);
  }

  /** Stop where you are (drops the current path without firing its arrival callback). */
  halt(): void {
    if (!this.path.length) return;
    this.path.length = 0;
    this.onArrive = null;
    this.char.play('idle');
  }
}
