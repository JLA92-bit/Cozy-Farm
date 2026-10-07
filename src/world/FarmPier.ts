import * as THREE from 'three';
import { assets } from '../core/Assets';
import { game } from '../systems/Game';
import { roomDone } from '../systems/RestorationEffects';
import { PIER } from './FishSpots';
import { boatGeometry, jettyGeometry } from './models/square';
import type { FarmScene } from '../scenes/FarmScene';

/**
 * Old Tom's Pier (1.8.5): once the Pier is rebuilt in the village square, a second jetty appears on the farm's
 * west beach with a lantern, a barrel and crates, a bucket and Tom's little boat. It is the second fishing spot
 * (src/ui/panels/FishingPanel.ts taps it). Render-only: it takes no farm tile.
 */
export class FarmPier {
  readonly group = new THREE.Group();
  private boat: THREE.Mesh;
  private t = 0;

  constructor(private scene: FarmScene) {
    const mat = assets.vertexMaterial;
    // the planks are built along -z: turn them to run west
    const jetty = new THREE.Mesh(jettyGeometry(), mat);
    jetty.position.set(PIER.x0, 0, PIER.z);
    jetty.rotation.y = Math.PI / 2;
    jetty.receiveShadow = true;
    this.group.add(jetty);
    this.boat = new THREE.Mesh(boatGeometry(), mat);
    this.boat.position.set(PIER.x0 - PIER.planks * PIER.step - 1.4, PIER.waterY + 0.2, PIER.z + 1.6);
    this.boat.rotation.y = Math.PI / 2 - 0.25;
    this.boat.castShadow = true;
    this.group.add(this.boat);
    void this.props();
    this.group.visible = false;
    scene.scene.add(this.group);
    scene.onFrame((dt) => this.frame(dt));
    scene.onTick(() => { this.group.visible = !this.scene.visit && game.state.tutorial.done && roomDone('pier'); });
  }

  /** A lantern at the far end, a barrel, crates and a bucket where the pier meets the sand. */
  private async props(): Promise<void> {
    const put = async (id: string, size: number, x: number, z: number, rot = 0, tall = false): Promise<void> => {
      try {
        const m = await assets.static(id);
        const mesh = assets.meshFrom(m);
        mesh.scale.setScalar(size / (tall ? m.size.y : Math.max(m.size.x, m.size.z)));
        mesh.position.set(x, PIER.deckTop - 0.02, z);
        mesh.rotation.y = rot;
        this.group.add(mesh);
      } catch (e) { console.warn('[pier] prop could not be drawn', id, e); }
    };
    const end = PIER.x0 - (PIER.planks - 1) * PIER.step;
    await put('prop/lantern', 1.5, end - 0.2, PIER.z + 0.55, 0, true);
    await put('prop/barrel', 0.6, PIER.x0 - 0.2, PIER.z + 0.5, 0.4);
    await put('prop/crate_small', 0.5, PIER.x0 - 0.8, PIER.z - 0.55, 0.3);
    await put('prop/crate_big', 0.55, PIER.x0 - 1.4, PIER.z + 0.5, -0.2);
    await put('prop/bucket', 0.4, PIER.x0 - 2.6, PIER.z - 0.5, 0);
  }

  private frame(dt: number): void {
    if (!this.group.visible) return;
    this.t += dt;
    this.boat.position.y = PIER.waterY + 0.2 + Math.sin(this.t * 1.3) * 0.04;
    this.boat.rotation.z = Math.sin(this.t * 1.05) * 0.03;
  }
}
