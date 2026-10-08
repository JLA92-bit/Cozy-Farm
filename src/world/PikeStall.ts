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
import { Boat, DOCK_WALK, walkAlong, type Pt3 } from './Boats';
import { speech } from '../ui/Speech';
import { pick } from './Chatter';
import { audio } from '../systems/Audio';
import type { FarmScene } from '../scenes/FarmScene';

/** Sand level of the north beach (see Terrain.ts), where the stall stands beside the dock. */
const BEACH_Y = -0.95;
const SPOT = { x: DOCK.x + 6.6, z: DOCK.z0 + 0.35 };
/** Where Marlow stands at his stall. */
const POST: Pt3 = [SPOT.x - 1.3, BEACH_Y, SPOT.z + 0.1];
/** The beach path between the dock and his stall. */
const TO_STALL: Pt3[] = [...DOCK_WALK, [DOCK.x + 1.3, BEACH_Y, DOCK.z0 + 0.3], POST];
const TO_BOAT: Pt3[] = [[DOCK.x + 1.3, BEACH_Y, DOCK.z0 + 0.3], DOCK_WALK[1], DOCK_WALK[0]];

type Phase = 'away' | 'arriving' | 'present' | 'leaving';

/**
 * Marlow Pike and his fish stall on the north beach by the dock (1.8.7). He is a night trader: he sails in to the
 * dock when his hours begin, walks to his stall, and walks back to a boat and sails away when they end. By day the
 * stall stands shut. Tap him to buy fish. Hidden while visiting a neighbour. The stock lives in src/systems/FishStall.ts.
 */
export class PikeStall {
  readonly group = new THREE.Group();
  readonly box = new THREE.Box3();
  private char: Character | null = null;
  private phase: Phase = 'away';
  private started = false;
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
  private get here(): boolean { return this.phase === 'present'; }

  private async sync(): Promise<void> {
    if (this.shown && !this.char && !this.loading) await this.build();
    this.group.visible = this.shown && !!this.char;
    const c = this.char;
    if (!c || !this.shown) { if (!this.shown) this.box.makeEmpty(); return; }
    const want = fishstall.isOpen();
    if (!this.started) {
      // the game was opened during his hours: he is already at his stall, no boat
      this.started = true;
      if (want) this.settle(c); else { this.phase = 'away'; c.root.visible = false; }
      return;
    }
    if (want && this.phase === 'away') void this.arrive(c);
    else if (!want && this.phase === 'present') void this.leave(c);
  }

  private settle(c: Character): void {
    this.phase = 'present';
    c.root.visible = true;
    c.root.position.set(POST[0], POST[1], POST[2]);
    c.root.rotation.y = Math.PI / 5;
    c.play('idle');
  }

  private async build(): Promise<void> {
    this.loading = true;
    try {
      const stall = new THREE.Mesh(procGeometry('fish_stall'), assets.vertexMaterial);
      stall.castShadow = true;
      stall.position.set(SPOT.x, BEACH_Y, SPOT.z);
      stall.scale.setScalar(0.95);
      this.group.add(stall);
      // a lantern to see by: he trades at night
      const lamp = await assets.mesh('prop/lantern');
      lamp.scale.setScalar(0.9);
      lamp.position.set(SPOT.x + 1.35, BEACH_Y, SPOT.z + 0.1);
      this.group.add(lamp);
      const c = await Character.create(FISHSTALL.look as CharacterLook, FISHSTALL.scale);
      c.root.visible = false;
      this.scene.scene.add(c.root);
      this.char = c;
      // the stall can be tapped any time (by day the closed shop shows his hours)
      this.box.setFromCenterAndSize(new THREE.Vector3(SPOT.x - 0.5, BEACH_Y + 1.2, SPOT.z + 0.3), new THREE.Vector3(5.2, 3.2, 3.4));
      this.scene.loop.wake(1);
      // a one-time hello the first time he is open: where to find him
      if (hints.firstTime('intro:fishstall')) setTimeout(() => game.bus.emit('toast', { title: 'Marlow Pike is here!', sub: `His fish stall is by the dock on the north beach. He is a night trader: ${fishstall.hoursText}. He arrives and leaves by boat. Ridiculously dear, fresh stock every night.`, icon: 'fish' }), 3000);
    } finally { this.loading = false; }
  }

  /** His hours begin: a boat brings him to the dock, he walks to his stall, the boat sails away. */
  private async arrive(c: Character): Promise<void> {
    this.phase = 'arriving';
    const boat = new Boat(this.scene);
    c.root.visible = true;
    boat.board(c, [0, 0.1]);
    await boat.sailIn();
    if (!this.shown) { boat.unboard(c); boat.dispose(); this.phase = 'away'; c.root.visible = false; return; }
    speech.say(c.root, { icon: 'wave', text: 'Ahoy! Fresh catch tonight!', prio: 2, dur: 3 });
    audio.play('jingle', { volume: 0.3 });
    boat.unboard(c);
    void (async () => { await new Promise((r) => setTimeout(r, 1800)); await boat.sailAway(); boat.dispose(); })();
    await walkAlong(c, TO_STALL, 1.9, this.scene);
    this.settle(c);
    void c.gesture('emote-yes');
  }

  /** His hours end: he walks to the dock, boards a boat and sails away. */
  private async leave(c: Character): Promise<void> {
    this.phase = 'leaving';
    speech.say(c.root, { icon: 'wave', text: 'That is me done. Goodnight!', prio: 2, dur: 3 });
    const boat = new Boat(this.scene);
    const sail = boat.sailIn(3.4);
    await walkAlong(c, TO_BOAT, 1.9, this.scene);
    await sail;
    boat.board(c, [0, 0.1]);
    await boat.sailAway();
    c.root.visible = false;
    this.scene.scene.add(c.root);
    boat.dispose();
    this.phase = 'away';
  }

  private frame(dt: number): void {
    const c = this.char;
    if (!c) return;
    if (this.phase !== 'away') c.update(dt);
    if (!this.here || !this.group.visible) return;
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
    if (c && this.here) {
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

