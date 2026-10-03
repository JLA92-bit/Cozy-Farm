import * as THREE from 'three';
import gsap from 'gsap';
import { assets } from '../core/Assets';
import { game } from '../systems/Game';
import { merchant } from '../systems/Economy';
import { Character } from './Character';
import { tileToWorld, footprintCenter } from './Grid';
import type { FarmScene } from '../scenes/FarmScene';

/** The travelling merchant's cart and the delivery truck parked at the depot. */
export class Visitors {
  private merchantGroup: THREE.Group | null = null;
  private merchantChar: Character | null = null;
  private truckObj: THREE.Object3D | null = null;
  private truckState = '';
  /** Characters still animating while they walk off (updated until removed). */
  private leaving: Character[] = [];
  /** Loaded crates stacked beside the truck: one instanced draw call. */
  private crates: THREE.InstancedMesh | null = null;
  private crateShown = 0;
  private crateScale = 1;
  private crateLoading = false;
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpP = new THREE.Vector3();
  private readonly tmpS = new THREE.Vector3();
  private readonly crateAnim = { k: 1 };
  merchantBox = new THREE.Box3();

  constructor(private scene: FarmScene, private spot: () => [number, number]) {
    scene.onTick(() => { void this.sync(); });
    scene.onFrame((dt) => {
      this.merchantChar?.update(dt);
      for (const c of this.leaving) c.update(dt);
    });
  }

  async sync(): Promise<void> {
    const present = merchant.visit().present;
    if (present && !this.merchantGroup) await this.spawnMerchant();
    else if (!present && this.merchantGroup) this.despawnMerchant();
    await this.syncTruck();
    await this.syncCrates();
  }

  private async spawnMerchant(): Promise<void> {
    this.merchantGroup = new THREE.Group();
    const [x, z] = this.spot();
    const cart = await assets.mesh('prop/cart_high');
    cart.scale.setScalar(1.2);
    cart.position.set(-0.6, 0, -0.9);
    cart.rotation.y = Math.PI / 2;
    this.merchantGroup.add(cart);
    const c = await Character.create({ body: 'male-e', skin: '#c98a5e', hair: '#5a3a22', top: '#a77bf3', bottom: '#3b3b45', hat: 'top', accessory: 'scarf', pet: 'none' }, 1.55);
    c.root.rotation.y = Math.PI / 4;
    this.merchantGroup.add(c.root);
    this.merchantChar = c;
    this.merchantGroup.position.set(tileToWorld(x), 0, tileToWorld(z));
    this.scene.scene.add(this.merchantGroup);
    this.merchantBox.setFromCenterAndSize(this.merchantGroup.position.clone().setY(0.8), new THREE.Vector3(2.2, 1.8, 2.2));
    gsap.from(this.merchantGroup.position, { x: this.merchantGroup.position.x - 8, duration: 2.2, ease: 'power2.out', onUpdate: () => c.play('walk'), onComplete: () => { c.play('idle'); void c.gesture('emote-yes'); } });
  }

  private despawnMerchant(): void {
    const g = this.merchantGroup!;
    const c = this.merchantChar;
    this.merchantGroup = null;
    this.merchantBox.makeEmpty();
    // wave goodbye, then walk off with the cart (keep animating while leaving)
    if (c) { this.leaving.push(c); c.play('walk'); }
    gsap.to(g.position, {
      x: g.position.x - 10, duration: 2, ease: 'power2.in',
      onComplete: () => { this.scene.scene.remove(g); if (c) this.leaving = this.leaving.filter((x) => x !== c); },
    });
    this.merchantChar = null;
  }

  private async syncTruck(): Promise<void> {
    const depot = game.buildingsOf('truck_depot')[0];
    const state = depot && game.state.truck ? `here:${depot.uid}:${depot.x}:${depot.z}` : 'gone';
    if (state === this.truckState) return;
    const prev = this.truckState;
    this.truckState = state;
    if (this.truckObj && state === 'gone') {
      const t = this.truckObj;
      this.truckObj = null;
      // drive away with a little bounce
      gsap.timeline({ onComplete: () => { this.scene.scene.remove(t); } })
        .to(t.scale, { y: t.scale.y * 0.85, duration: 0.12, yoyo: true, repeat: 1 })
        .to(t.position, { z: t.position.z + 14, duration: 2.2, ease: 'power2.in' });
      return;
    }
    if (!depot || state === 'gone') return;
    if (this.truckObj) this.scene.scene.remove(this.truckObj);
    const truck = await assets.mesh('veh/delivery');
    truck.scale.setScalar(0.62);
    const cx = footprintCenter(depot.x, 3), cz = footprintCenter(depot.z, 3);
    truck.position.set(cx, 0, cz + 0.4);
    this.scene.scene.add(truck);
    this.truckObj = truck;
    if (this.crates && this.crateShown) this.placeCrates(this.crateShown); // depot moved: crates follow
    if (prev) gsap.from(truck.position, { z: cz + 12, duration: 2, ease: 'power2.out' });
  }

  /** Show one crate per loaded truck crate, stacked by the truck, popping in as they are loaded. */
  private async syncCrates(): Promise<void> {
    const t = game.state.truck;
    const want = t && this.truckObj ? t.crates.filter((c) => c.filled).length : 0;
    if (want === this.crateShown || this.crateLoading) return;
    if (!this.crates) {
      if (!want) return;
      this.crateLoading = true;
      const m = await assets.static('prop/crate_small');
      this.crateLoading = false;
      this.crates = new THREE.InstancedMesh(m.geometry, m.material, 6);
      this.crates.castShadow = true;
      this.crates.frustumCulled = false;
      this.crateScale = 0.42 / Math.max(0.01, m.size.y, m.size.x);
      this.scene.scene.add(this.crates);
    }
    const prev = this.crateShown;
    this.crateShown = Math.min(want, 6);
    if (this.crateShown > prev) {
      // pop the newest crates in
      this.crateAnim.k = 0;
      gsap.to(this.crateAnim, { k: 1, duration: 0.45, ease: 'back.out(2.5)', onUpdate: () => this.placeCrates(prev) });
    } else this.placeCrates(this.crateShown);
  }

  private placeCrates(popFrom: number): void {
    const mesh = this.crates;
    const depot = game.buildingsOf('truck_depot')[0];
    if (!mesh || !depot) return;
    const cx = footprintCenter(depot.x, 3), cz = footprintCenter(depot.z, 3);
    for (let i = 0; i < this.crateShown; i++) {
      const layer = i >= 3 ? 1 : 0, j = i % 3;
      const k = i >= popFrom ? this.crateAnim.k : 1;
      this.tmpP.set(cx - 1.15 + j * 0.46 + layer * 0.23, layer * 0.42, cz + 1.25);
      this.tmpQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, (i * 0.37) % 0.3 - 0.15);
      this.tmpS.setScalar(this.crateScale * Math.max(0.001, k));
      mesh.setMatrixAt(i, this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS));
    }
    mesh.count = this.crateShown;
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.loop.wake(0.5);
  }
}
