import * as THREE from 'three';
import { assets } from '../core/Assets';
import { game } from '../systems/Game';
import { HALF } from './Grid';
import { SEA_CLIFF, boatGeometry, jettyGeometry, signpostGeometry } from './models/square';
import type { FarmScene } from '../scenes/FarmScene';

/**
 * The way to the village square, on the farm's east beach: a signpost, a little jetty and a rowing boat. It is
 * render-only (it takes no farm tile) and shows once the farm is settled (level 5). Tap the signpost or the boat to
 * row over (world/SquareView.ts is the other side).
 */
export class SquareGate {
  readonly group = new THREE.Group();
  private boat: THREE.Mesh;
  private sign: THREE.Mesh;
  private sphere = new THREE.Sphere();
  /** where the "something to give" bubble should float (set every frame) */
  readonly bubbleAt = new THREE.Vector3();
  private t = 0;
  onTap: (() => void) | null = null;

  constructor(private scene: FarmScene) {
    const mat = assets.vertexMaterial;
    const z = 7;
    // the jetty runs east from the beach: planks are built along -z, so turn it a quarter
    const jetty = new THREE.Mesh(jettyGeometry(), mat);
    jetty.position.set(HALF + 1.2, 0, z);
    jetty.rotation.y = -Math.PI / 2;
    jetty.receiveShadow = true;
    this.boat = new THREE.Mesh(boatGeometry(), mat);
    this.boat.position.set(HALF + 1.2 + 8.6, -SEA_CLIFF + 0.4, z + 1.3);
    this.boat.rotation.y = Math.PI / 2 + 0.2;
    this.boat.castShadow = true;
    this.sign = new THREE.Mesh(signpostGeometry(), mat);
    this.sign.position.set(HALF + 0.9, -SEA_CLIFF + 0.62, z - 1.5);
    this.sign.rotation.y = Math.PI / 4 - 0.35;
    this.sign.scale.setScalar(0.85);
    this.sign.castShadow = true;
    this.group.add(jetty, this.boat, this.sign);
    this.bubbleAt.set(this.sign.position.x, this.sign.position.y + 3.3, this.sign.position.z);
    scene.scene.add(this.group);
    scene.onFrame((dt) => this.frame(dt));
    // only once the farm is settled
    this.group.visible = false;
    scene.onTick(() => { this.group.visible = !this.scene.visit && game.state.tutorial.done && game.level >= 5; });
  }

  private frame(dt: number): void {
    if (!this.group.visible) return;
    this.t += dt;
    this.boat.position.y = -SEA_CLIFF + 0.4 + Math.sin(this.t * 1.4) * 0.04;
    this.boat.rotation.z = Math.sin(this.t * 1.1) * 0.03;
  }

  /** A tap on the signpost or the boat. */
  pick(ray: THREE.Ray): (() => void) | null {
    if (!this.group.visible || this.scene.visit) return null;
    const spots: [THREE.Vector3, number, number][] = [[this.sign.position, 1.4, 1.2], [this.boat.position, 0.4, 1.3]];
    for (const [p, up, r] of spots) {
      this.sphere.center.set(p.x, p.y + up, p.z);
      this.sphere.radius = r;
      if (ray.intersectsSphere(this.sphere)) return () => this.onTap?.();
    }
    return null;
  }
}
