import * as THREE from 'three';
import { assets } from '../core/Assets';
import { WILD_PROC } from './models/woods';
import { modelObject } from './SquareView';
import { HALF } from './Grid';
import { wildlife } from '../systems/Wildlife';
import { game } from '../systems/Game';
import { localDay } from '../systems/Progression';
import type { WildSpecies } from '../data';

/**
 * 1.27 Wildlife Album: drawing the wild visitors. `wildObject` makes one animal (a modelled pet or a small procedural
 * one); `FarmWildlife` puts the farm-edge visitors just off the fields, where they come and go with their hours.
 * The woods' visitors are drawn by WoodsView with the same helper.
 */
export async function wildObject(s: WildSpecies): Promise<THREE.Object3D> {
  const proc = WILD_PROC[s.model];
  if (proc) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(proc(), assets.vertexMaterial);
    m.castShadow = true;
    m.scale.setScalar(s.size);
    g.add(m);
    return g;
  }
  return modelObject(s.model, s.size);
}

/** A point just off the farm's fields for a number 0..1 (round the four sides), facing in towards the farm. */
export function farmEdgeSpot(t: number): { x: number; z: number; yaw: number } {
  const edge = HALF + 2.6, side = Math.floor(t * 4) % 4, u = -edge + 3 + (2 * edge - 6) * ((t * 4) % 1);
  const x = side === 0 ? u : side === 1 ? edge : side === 2 ? -u : -edge;
  const z = side === 0 ? -edge : side === 1 ? u : side === 2 ? edge : -u;
  return { x, z, yaw: Math.atan2(-x, -z) };
}

interface Node { s: WildSpecies; obj: THREE.Object3D; pick: THREE.Mesh; base: THREE.Vector3 }

export class FarmWildlife {
  readonly group = new THREE.Group();
  private nodes: Node[] = [];
  private t = 0;
  private day = '';

  async build(): Promise<void> {
    for (const s of wildlife.species().filter((x) => x.place === 'farm')) {
      try {
        const obj = await wildObject(s);
        obj.visible = false;
        const pick = new THREE.Mesh(new THREE.SphereGeometry(1.3, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
        pick.userData.wild = s.id;
        this.group.add(obj, pick);
        this.nodes.push({ s, obj, pick, base: new THREE.Vector3() });
      } catch (e) { console.warn('[wildlife] could not draw', s.id, e); }
    }
    this.refresh();
  }

  /** Who is here now, and where they stand today. */
  refresh(): void {
    const day = localDay(game.now());
    for (const n of this.nodes) {
      if (this.day !== day || !n.base.lengthSq()) {
        const p = farmEdgeSpot(wildlife.spot(n.s));
        n.base.set(p.x, 0.02, p.z);
        n.obj.position.copy(n.base);
        n.obj.rotation.y = p.yaw;
        n.pick.position.set(p.x, 0.7, p.z);
      }
      n.obj.visible = wildlife.present(n.s.id);
    }
    this.day = day;
  }

  /** The species under the ray, if a visible visitor is hit. */
  pick(ray: THREE.Ray): string | null {
    const rc = new THREE.Raycaster();
    rc.ray.copy(ray);
    this.group.updateMatrixWorld(true);
    const hits = rc.intersectObjects(this.nodes.filter((n) => n.obj.visible).map((n) => n.pick), false);
    return hits.length ? (hits[0].object.userData.wild as string) : null;
  }
  at(id: string): THREE.Vector3 | null { const n = this.nodes.find((x) => x.s.id === id); return n ? n.base.clone().setY(0.8) : null; }

  /** Small signs of life: a bob, a flutter for the butterfly, a hop for the hare. */
  update(dt: number): void {
    this.t += dt;
    for (const n of this.nodes) {
      if (!n.obj.visible) continue;
      const k = n.s.id.length;
      n.obj.position.y = n.base.y + (n.s.id === 'butterfly' ? 0.2 + Math.abs(Math.sin(this.t * 3 + k)) * 0.15 : n.s.id === 'brown_hare' ? Math.max(0, Math.sin(this.t * 2.2 + k)) * 0.25 : 0);
      n.obj.rotation.y += Math.sin(this.t * 0.4 + k) * 0.002;
    }
  }
}
