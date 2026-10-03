import * as THREE from 'three';
import gsap from 'gsap';
import { assets } from '../core/Assets';
import { game } from '../systems/Game';
import { merchant } from '../systems/Economy';
import { Character } from './Character';
import { tileToWorld, footprintCenter } from './Grid';
import { audio } from '../systems/Audio';
import { speech } from '../ui/Speech';
import { ui } from '../ui/UI';
import { pick } from './Chatter';
import type { FarmScene } from '../scenes/FarmScene';

/** The travelling merchant's cart and the delivery truck parked at the depot. */
export class Visitors {
  private merchantGroup: THREE.Group | null = null;
  private merchantChar: Character | null = null;
  private truckObj: THREE.Object3D | null = null;
  private truckState = '';
  /** characters still animating (the merchant, also while walking off) */
  private animated = new Set<Character>();
  private nudgeIn = 30;
  private spawning = false;
  merchantBox = new THREE.Box3();
  /** called with the merchant's parking spot so whoever stands there can step aside */
  onMerchantArrive: ((pos: THREE.Vector3) => void) | null = null;

  constructor(private scene: FarmScene, private spot: () => [number, number]) {
    scene.onTick(() => { void this.sync(); });
    scene.onFrame((dt) => {
      for (const c of this.animated) c.update(dt);
      this.nudge(dt);
    });
  }

  /** Every so often the merchant calls out, so players notice the visit. */
  private nudge(dt: number): void {
    const c = this.merchantChar;
    if (!c || this.spawning) return;
    this.nudgeIn -= dt;
    if (this.nudgeIn > 0) return;
    this.nudgeIn = 35 + Math.random() * 25;
    if (speech.say(c.root, { icon: pick(['gift', 'bags', 'sparkles']), text: pick(['Psst! Rare goods!', 'Come take a look!', 'Special prices today!', 'Fresh from far away!']) })) void c.gesture('interact-right');
  }

  /** The merchant greets you when tapped (the shop panel opens right after). */
  greetMerchant(): void {
    const c = this.merchantChar;
    if (!c) return;
    speech.say(c.root, { icon: 'smile', text: pick(['Welcome, friend!', 'Have a look!', 'Hello again!']), prio: 2 });
    void c.gesture('emote-yes');
    this.nudgeIn = Math.max(this.nudgeIn, 40);
  }

  async sync(): Promise<void> {
    const present = merchant.visit().present;
    if (present && !this.merchantGroup) await this.spawnMerchant();
    else if (!present && this.merchantGroup) this.despawnMerchant();
    await this.syncTruck();
  }

  private async spawnMerchant(): Promise<void> {
    this.spawning = true;
    const group = new THREE.Group();
    this.merchantGroup = group;
    const [x, z] = this.spot();
    const cart = await assets.mesh('prop/cart_high');
    cart.scale.setScalar(1.2);
    cart.position.set(-0.6, 0, -0.9);
    cart.rotation.y = Math.PI / 2;
    group.add(cart);
    const c = await Character.create({ body: 'male-e', skin: '#c98a5e', hair: '#5a3a22', top: '#a77bf3', bottom: '#3b3b45', hat: 'top', accessory: 'scarf', pet: 'none' }, 1.55);
    if (this.merchantGroup !== group) { c.dispose(); this.spawning = false; return; } // left again while loading
    c.root.rotation.y = Math.PI / 2; // facing the way he walks in (+x)
    group.add(c.root);
    this.merchantChar = c;
    this.animated.add(c);
    group.position.set(tileToWorld(x), 0, tileToWorld(z));
    this.scene.scene.add(group);
    this.merchantBox.setFromCenterAndSize(group.position.clone().setY(0.8), new THREE.Vector3(2.2, 1.8, 2.2));
    c.play('walk');
    this.onMerchantArrive?.(group.position);
    const endX = group.position.x;
    group.position.x -= 8;
    gsap.to(group.position, {
      x: endX, duration: 2.6, ease: 'power1.out',
      onUpdate: () => { cart.rotation.z = Math.sin(group.position.x * 6) * 0.03; this.scene.loop.wake(0.3); },
      onComplete: () => {
        cart.rotation.z = 0;
        c.play('idle');
        gsap.to(c.root.rotation, { y: Math.PI / 4, duration: 0.4, ease: 'power2.out' });
        void c.gesture('emote-yes');
        speech.say(c.root, { icon: 'bags', text: 'Fresh wares today!', prio: 2, dur: 3.5 });
        audio.play('jingle', { volume: 0.35 });
        this.spawning = false;
        this.nudgeIn = 30;
        this.scene.loop.wake(1);
      },
    });
  }

  private despawnMerchant(): void {
    const g = this.merchantGroup!;
    const c = this.merchantChar;
    this.merchantGroup = null;
    this.merchantChar = null;
    this.merchantBox.makeEmpty();
    this.spawning = false;
    if (!c) { this.scene.scene.remove(g); return; } // still loading
    gsap.killTweensOf(g.position);
    speech.say(c.root, { icon: 'wave', text: 'See you soon!', prio: 2 });
    void c.gesture('emote-yes', 'walk');
    gsap.to(c.root.rotation, { y: -Math.PI / 2, duration: 0.4, delay: 0.9 });
    gsap.to(g.position, {
      x: g.position.x - 10, duration: 2.6, delay: 1.1, ease: 'power1.in',
      onStart: () => c.play('walk'),
      onUpdate: () => this.scene.loop.wake(0.3),
      onComplete: () => { this.scene.scene.remove(g); this.animated.delete(c); c.dispose(); },
    });
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
}
