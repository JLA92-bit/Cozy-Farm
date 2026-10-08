import * as THREE from 'three';
import { assets } from '../core/Assets';
import { game } from '../systems/Game';
import { hints } from '../systems/Hints';
import { fishstall } from '../systems/FishStall';
import { FISHSTALL } from '../data';
import { Character } from './Character';
import type { CharacterLook } from '../systems/State';
import { procGeometry } from './ProcModels';
import { DOCK } from './Terrain';
import { speech } from '../ui/Speech';
import { pick } from './Chatter';
import { audio } from '../systems/Audio';
import type { FarmScene } from '../scenes/FarmScene';

/** Sand level of the north beach (see Terrain.ts), where the stall stands beside the dock. */
const BEACH_Y = -0.95;
const SPOT = { x: DOCK.x + 3.9, z: DOCK.z0 + 0.35 };

/**
 * Marlow Pike and his fish stall on the north beach by the dock (1.8.7). Always there once the player can fish;
 * tap him to buy fish. Hidden while visiting a neighbour. The stock lives in src/systems/FishStall.ts.
 */
export class PikeStall {
  readonly group = new THREE.Group();
  readonly box = new THREE.Box3();
  private char: Character | null = null;
  private nudgeIn = 20;
  private loading = false;

  constructor(private scene: FarmScene) {
    this.group.visible = false;
    scene.scene.add(this.group);
    scene.onFrame((dt) => this.frame(dt));
    scene.onTick(() => { void this.sync(); });
    void this.sync();
  }

  private get shown(): boolean { return fishstall.open && !this.scene.visit; }

  private async sync(): Promise<void> {
    if (this.shown && !this.char && !this.loading) await this.build();
    this.group.visible = this.shown && !!this.char;
    // Marlow stands at his stall only in his trading hours; out of hours the stall is shut and he has gone home
    if (this.char) this.char.root.visible = fishstall.isOpen();
    if (!this.group.visible) this.box.makeEmpty();
  }

  private async build(): Promise<void> {
    this.loading = true;
    try {
      const stall = new THREE.Mesh(procGeometry('fish_stall'), assets.vertexMaterial);
      stall.castShadow = true;
      stall.position.set(SPOT.x, BEACH_Y, SPOT.z);
      stall.scale.setScalar(0.95);
      this.group.add(stall);
      const c = await Character.create(FISHSTALL.look as CharacterLook, FISHSTALL.scale);
      c.root.position.set(SPOT.x - 1.3, BEACH_Y, SPOT.z + 0.1);
      c.root.rotation.y = Math.PI / 5;
      this.group.add(c.root);
      c.play('idle');
      this.char = c;
      this.box.setFromCenterAndSize(new THREE.Vector3(SPOT.x - 0.3, BEACH_Y + 0.9, SPOT.z), new THREE.Vector3(3.6, 2.2, 1.8));
      this.scene.loop.wake(1);
      // a one-time hello the first time he is open: where to find him
      if (hints.firstTime('intro:fishstall')) setTimeout(() => game.bus.emit('toast', { title: 'Marlow Pike is here!', sub: `His fish stall is by the dock on the north beach. He trades ${fishstall.hoursText}. Tap him to buy fish: ridiculously dear, fresh stock every day.`, icon: 'fish' }), 3000);
    } finally { this.loading = false; }
  }

  private frame(dt: number): void {
    const c = this.char;
    if (!c || !this.group.visible || !fishstall.isOpen()) return;
    c.update(dt);
    this.nudgeIn -= dt;
    if (this.nudgeIn > 0) return;
    this.nudgeIn = 40 + Math.random() * 30;
    if (speech.say(c.root, { icon: pick(['fish', 'sparkles']), text: pick(['Fresh catch!', 'Finest fish on the island!', 'Steep? Worth every coin!', 'Caught this morning!']) })) void c.gesture('interact-right');
  }

  /** The tap handler for a ray: returns what to do when Marlow or his stall is tapped. */
  pick(ray: THREE.Ray): (() => void) | null {
    if (!this.group.visible || this.box.isEmpty() || !ray.intersectsBox(this.box)) return null;
    return () => this.greet();
  }

  greet(): void {
    const c = this.char;
    if (c && fishstall.isOpen()) {
      speech.say(c.root, { icon: 'smile', text: pick(['Ahoy, friend!', 'Take a look!', 'Hello again!']), prio: 2 });
      void c.gesture('emote-yes');
    }
    audio.play('tap', { volume: 0.5 });
    this.scene.loop.wake(1);
    import('../ui/UI').then(({ ui }) => ui.open('fishstall'));
  }

  /** Where floating UI can point at the stall. */
  get anchor(): THREE.Vector3 { return new THREE.Vector3(SPOT.x, BEACH_Y + 2.2, SPOT.z); }
}

