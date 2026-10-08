import * as THREE from 'three';
import { assets } from '../core/Assets';
import { woods } from '../systems/Woods';
import { HALF } from './Grid';
import { SEA_CLIFF, boatGeometry, jettyGeometry, signpostGeometry } from './models/square';
import type { FarmScene } from '../scenes/FarmScene';

/**
 * The way to the Wild Woods (1.9), on the farm's south beach: a signpost, a little jetty and a rowing boat, like the
 * way to the village square on the east beach. Render-only (it takes no farm tile) and shown from level 14. Tap the
 * signpost or the boat to row over (world/WoodsView.ts is the other side).
 */
export class WoodsGate {
  readonly group = new THREE.Group();
  private boat: THREE.Mesh;
  private sign: THREE.Mesh;
  private sphere = new THREE.Sphere();
  private t = 0;
  onTap: (() => void) | null = null;

  constructor(private scene: FarmScene) {
    const mat = assets.vertexMaterial;
    const x = -4;
    // planks are built along -z: turn them to run south (+z)
    const jetty = new THREE.Mesh(jettyGeometry(), mat);
    jetty.position.set(x, 0, HALF + 1.2);
    jetty.rotation.y = Math.PI;
    jetty.receiveShadow = true;
    this.boat = new THREE.Mesh(boatGeometry(), mat);
    this.boat.position.set(x + 1.3, -SEA_CLIFF + 0.4, HALF + 1.2 + 8.6);
    this.boat.rotation.y = 0.2;
    this.boat.castShadow = true;
    this.sign = new THREE.Mesh(signpostGeometry(), mat);
    this.sign.position.set(x - 1.6, -SEA_CLIFF + 0.62, HALF + 0.9);
    this.sign.rotation.y = Math.PI / 2 + 0.3;
    this.sign.scale.setScalar(0.85);
    this.sign.castShadow = true;
    this.group.add(jetty, this.boat, this.sign);
    scene.scene.add(this.group);
    scene.onFrame((dt) => this.frame(dt));
    this.group.visible = false;
    scene.onTick(() => { this.group.visible = !this.scene.visit && woods.unlocked; });
  }

  private frame(dt: number): void {
    if (!this.group.visible) return;
    this.t += dt;
    this.boat.position.y = -SEA_CLIFF + 0.4 + Math.sin(this.t * 1.3 + 1) * 0.04;
    this.boat.rotation.z = Math.sin(this.t * 1.05) * 0.03;
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
