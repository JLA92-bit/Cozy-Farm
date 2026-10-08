import * as THREE from 'three';
import gsap from 'gsap';
import { assets } from '../core/Assets';
import { game } from '../systems/Game';
import { merchant } from '../systems/Economy';
import { Character } from './Character';
import { Walker, walkable, walkableOpen, walkers } from './People';
import { tileToWorld, footprintCenter } from './Grid';
import { Boat, LANDING_TILE, STEPS_UP, dockWalk, walkAlong } from './Boats';

/** The merchant's boat ties up on the west side of the dock (Marlow Pike's is on the east side). */
const WEST = dockWalk(-1);
import { audio } from '../systems/Audio';
import { speech } from '../ui/Speech';
import { ui } from '../ui/UI';
import { pick } from './Chatter';
import type { FarmScene } from '../scenes/FarmScene';

type MPhase = 'away' | 'arriving' | 'here' | 'leaving';

/** The travelling merchant's look. */
const MERCHANT_LOOK = { body: 'male-e', skin: '#c98a5e', hair: '#5a3a22', top: '#a77bf3', bottom: '#3b3b45', hat: 'top', accessory: 'scarf', pet: 'none' } as const;

/**
 * The travelling merchant and the delivery truck parked at the depot. The merchant sails in to the dock when a
 * visit begins, climbs the steps onto the farm, sets up his cart and then roams the farm until his visit ends;
 * then he walks back to the dock and sails away (1.8.7).
 */
export class Visitors {
  private cart: THREE.Object3D | null = null;
  private walker: Walker | null = null;
  private mPhase: MPhase = 'away';
  private mStarted = false;
  private mBusy = false;
  private roamIn = 4;
  private roamN = 0;
  private cartSpotAt: [number, number] = [0, 0];
  private truckObj: THREE.Object3D | null = null;
  private truckState = '';
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
  private nudgeIn = 30;
  /** where the merchant stands now (tap target) and his parked cart */
  merchantBox = new THREE.Box3();
  private cartBox = new THREE.Box3();
  /** called with the merchant's parking spot so whoever stands there can step aside */
  onMerchantArrive: ((pos: THREE.Vector3) => void) | null = null;

  constructor(private scene: FarmScene, private spot: () => [number, number]) {
    scene.onTick(() => { void this.sync(); });
    scene.onFrame((dt) => this.frame(dt));
  }

  private frame(dt: number): void {
    const w = this.walker;
    if (!w) return;
    w.update(dt);
    if (this.mPhase === 'here') {
      const p = w.char.root.position;
      this.merchantBox.setFromCenterAndSize(this.tmpP.set(p.x, 0.8, p.z), this.tmpS.set(1.8, 1.8, 1.8));
      this.nudge(dt);
      this.roam(dt);
    }
  }

  /** Tap test for the merchant or his cart. */
  merchantHit(ray: THREE.Ray): boolean {
    return this.mPhase === 'here' && (ray.intersectsBox(this.merchantBox) || ray.intersectsBox(this.cartBox));
  }

  /** Every so often the merchant calls out, so players notice the visit. */
  private nudge(dt: number): void {
    const c = this.walker?.char;
    if (!c) return;
    this.nudgeIn -= dt;
    if (this.nudgeIn > 0) return;
    this.nudgeIn = 35 + Math.random() * 25;
    if (speech.say(c.root, { icon: pick(['gift', 'bags', 'sparkles']), text: pick(['Psst! Rare goods!', 'Come take a look!', 'Special prices today!', 'Fresh from far away!']) })) void c.gesture('interact-right');
  }

  /** While he is here the merchant wanders the farm, pausing now and then, and goes back to his cart often. */
  private roam(dt: number): void {
    const w = this.walker;
    if (!w || w.walking) return;
    this.roamIn -= dt;
    if (this.roamIn > 0) return;
    this.roamN++;
    const [cx, cz] = this.cartSpotAt;
    const home = this.roamN % 3 === 0;
    let target: [number, number] | null = home ? [cx, cz + 1] : null;
    for (let i = 0; i < 24 && !target; i++) {
      const tx = cx + Math.round((Math.random() - 0.5) * 22), tz = cz + Math.round((Math.random() - 0.5) * 22);
      if (walkable(tx, tz, true)) target = [tx, tz];
    }
    if (!target) { this.roamIn = 5; return; }
    this.roamIn = 99;
    const ok = w.walkTo(target[0], target[1], () => {
      this.roamIn = 6 + Math.random() * 8;
      void w.char.gesture(Math.random() < 0.5 ? 'emote-yes' : 'interact-right');
    });
    if (!ok) this.roamIn = 4;
  }

  /** The merchant greets you when tapped (the shop panel opens right after). */
  greetMerchant(): void {
    const c = this.walker?.char;
    if (!c) return;
    this.walker?.halt();
    this.roamIn = Math.max(this.roamIn, 12);
    speech.say(c.root, { icon: 'smile', text: pick(['Welcome, friend!', 'Have a look!', 'Hello again!']), prio: 2 });
    void c.gesture('emote-yes');
    this.nudgeIn = Math.max(this.nudgeIn, 40);
  }

  async sync(): Promise<void> {
    const present = merchant.visit().present;
    if (!this.mStarted) {
      // the game was opened during a visit: he is already on the farm by his cart, no boat
      this.mStarted = true;
      if (present) await this.setUpHere(false);
    } else if (present && this.mPhase === 'away' && !this.mBusy) void this.arrive();
    else if (!present && this.mPhase === 'here' && !this.mBusy) void this.leave();
    await this.syncTruck();
    await this.syncCrates();
  }

  private async makeMerchant(): Promise<Character> {
    const c = await Character.create({ ...MERCHANT_LOOK }, 1.55);
    this.walker = new Walker(c, this.scene.scene);
    return c;
  }

  private async makeCart(pop: boolean): Promise<void> {
    const [x, z] = this.spot();
    this.cartSpotAt = [x, z];
    const cart = await assets.mesh('prop/cart_high');
    cart.scale.setScalar(pop ? 0.01 : 1.2);
    cart.position.set(tileToWorld(x) - 0.6, 0, tileToWorld(z) - 0.9);
    cart.rotation.y = Math.PI / 2;
    this.scene.scene.add(cart);
    this.cart = cart;
    this.cartBox.setFromCenterAndSize(new THREE.Vector3(tileToWorld(x) - 0.4, 0.7, tileToWorld(z) - 0.9), new THREE.Vector3(2.2, 1.6, 2.2));
    if (pop) gsap.to(cart.scale, { x: 1.2, y: 1.2, z: 1.2, duration: 0.55, ease: 'back.out(2.2)', onUpdate: () => this.scene.loop.wake(0.2) });
  }

  /** Set the merchant and his cart up on the farm without a boat (opening the game during a visit). */
  private async setUpHere(withBoat: boolean): Promise<void> {
    this.mBusy = true;
    const [x, z] = this.spot();
    await this.makeCart(withBoat);
    const c = this.walker?.char ?? await this.makeMerchant();
    if (!withBoat) {
      this.walker!.placeAt(x, z);
      c.root.rotation.y = Math.PI / 4;
    }
    this.onMerchantArrive?.(c.root.position.clone());
    this.mPhase = 'here';
    this.roamIn = 3 + Math.random() * 4;
    this.nudgeIn = 30;
    this.mBusy = false;
    this.scene.loop.wake(1);
  }

  /** A visit begins: a boat brings him to the dock, he climbs onto the farm, walks to his cart and starts to roam. */
  private async arrive(): Promise<void> {
    this.mBusy = true;
    this.mPhase = 'arriving';
    const boat = new Boat(this.scene, -1);
    const c = await this.makeMerchant();
    boat.board(c, [0, 0.1]);
    await boat.sailIn();
    speech.say(c.root, { icon: 'bags', text: 'Fresh wares today!', prio: 2, dur: 3.5 });
    audio.play('jingle', { volume: 0.35 });
    boat.unboard(c);
    void (async () => { await new Promise((r) => setTimeout(r, 1800)); await boat.sailAway(); boat.dispose(); })();
    await walkAlong(c, [...WEST, ...STEPS_UP], 1.9, this.scene);
    // on to the cart across the open land
    const [x, z] = this.spot();
    const w = this.walker!;
    await new Promise<void>((resolve) => {
      if (!w.walkTo(x, z, () => resolve(), walkableOpen)) { w.placeAt(x, z); resolve(); }
    });
    await this.setUpHere(true);
    void c.gesture('emote-yes');
  }

  /** The visit ends: he walks back to the dock, boards a boat and sails away (his cart goes with him). */
  private async leave(): Promise<void> {
    this.mBusy = true;
    this.mPhase = 'leaving';
    const w = this.walker;
    this.merchantBox.makeEmpty();
    if (!w) { this.mPhase = 'away'; this.mBusy = false; return; }
    const c = w.char;
    w.halt();
    speech.say(c.root, { icon: 'wave', text: 'See you soon!', prio: 2, dur: 3 });
    const boat = new Boat(this.scene, -1);
    const sail = boat.sailIn(3.6);
    await new Promise<void>((resolve) => {
      if (!w.walkTo(LANDING_TILE[0], LANDING_TILE[1], () => resolve(), walkableOpen)) { w.placeAt(LANDING_TILE[0], LANDING_TILE[1]); resolve(); }
    });
    const back: [number, number, number][] = [...STEPS_UP].slice(0, 4).reverse().concat([WEST[1], WEST[0]]);
    await walkAlong(c, back, 1.9, this.scene);
    await sail;
    boat.board(c, [0, 0.1]);
    if (this.cart) { const cart = this.cart; this.cart = null; this.cartBox.makeEmpty(); gsap.to(cart.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.5, ease: 'back.in(2)', onComplete: () => { this.scene.scene.remove(cart); } }); }
    await boat.sailAway();
    boat.dispose();
    walkers.delete(w);
    c.dispose();
    this.walker = null;
    this.mPhase = 'away';
    this.mBusy = false;
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
      audio.play('truck', { volume: 0.6 });
      ui.effects.dust(t.position.clone().setY(0.2), 8, 1.2);
      this.scene.loop.wake(2.6);
      gsap.timeline({ onComplete: () => { this.scene.scene.remove(t); } })
        .to(t.scale, { y: t.scale.y * 0.85, duration: 0.12, yoyo: true, repeat: 1 })
        .to(t.position, { z: t.position.z + 14, duration: 2.2, ease: 'power2.in', onUpdate: () => this.scene.loop.wake(0.2) });
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
    if (prev) {
      // roll in, settle on the springs with a puff of dust and a friendly honk
      const sy = truck.scale.y;
      audio.play('truck', { volume: 0.6 });
      gsap.timeline()
        .from(truck.position, { z: cz + 12, duration: 2, ease: 'power2.out', onUpdate: () => this.scene.loop.wake(0.2) })
        .add(() => ui.effects.dust(truck.position.clone().setY(0.2), 8, 1.2), '-=0.25')
        .to(truck.scale, { y: sy * 0.88, duration: 0.12, ease: 'power1.out' })
        .to(truck.scale, { y: sy, duration: 0.5, ease: 'elastic.out(1.2, 0.4)' });
    }
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
