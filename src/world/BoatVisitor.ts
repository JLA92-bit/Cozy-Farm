import * as THREE from 'three';
import { assets } from '../core/Assets';
import { game } from '../systems/Game';
import { hints } from '../systems/Hints';
import { boatvisit } from '../systems/BoatVisit';
import { BOATVISITS } from '../data';
import { Character } from './Character';
import type { CharacterLook } from '../systems/State';
import { Boat, BOAT } from './Boats';
import { DOCK } from './Terrain';
import { speech } from '../ui/Speech';
import { pick } from './Chatter';
import { audio } from '../systems/Audio';
import type { FarmScene } from '../scenes/FarmScene';

type Phase = 'away' | 'arriving' | 'present' | 'leaving';

/**
 * 1.10 Boat Visitors: on boat days a themed boat sails to the east berth of the dock (Marlow Pike uses it only at
 * night), the visitor waves from the deck and stays aboard until the afternoon. Tap the boat to hand over the wish
 * list (src/systems/BoatVisit.ts). Hidden while visiting a neighbour.
 */
export class BoatVisitor {
  readonly box = new THREE.Box3();
  private char: Character | null = null;
  private boat: Boat | null = null;
  private phase: Phase = 'away';
  private loading = false;
  private nudgeIn = 15;
  private themeId = '';

  constructor(private scene: FarmScene) {
    scene.onFrame((dt) => this.frame(dt));
    scene.onTick(() => { void this.sync(); });
    void this.sync();
  }

  private get want(): boolean { return boatvisit.here() && !this.scene.visit; }

  private async sync(): Promise<void> {
    if (this.loading) return;
    const want = this.want;
    if (want && this.phase === 'away') await this.arrive();
    else if (!want && this.phase === 'present') await this.leave();
  }

  private async arrive(): Promise<void> {
    this.loading = true;
    try {
      const theme = boatvisit.theme();
      const c = await Character.create(theme.look as unknown as CharacterLook, 1.2);
      this.char = c;
      this.themeId = theme.id;
      // a boat of their own: the theme's model (scaled to about 3 tiles long), or the little wooden boat if it will not load
      let hull: THREE.Object3D | undefined;
      let seat: [number, number] = [0, 0.1], seatY = 0.3;
      if (theme.boat) {
        try {
          const m = await assets.mesh(theme.boat.model);
          m.scale.setScalar(theme.boat.scale);
          m.castShadow = true;
          hull = m;
          seat = [theme.boat.seat[0], theme.boat.seat[2]];
          seatY = theme.boat.seat[1];
        } catch { hull = undefined; }
      }
      const boat = new Boat(this.scene, 1, hull);
      this.boat = boat;
      boat.board(c, seat, seatY);
      this.phase = 'arriving';
      // opening the game mid-visit: the boat is already tied up
      const quick = !this.started;
      this.started = true;
      await boat.sailIn(quick ? 0.1 : undefined);
      if (!this.want) { await this.leave(); return; }
      this.phase = 'present';
      this.box.setFromCenterAndSize(new THREE.Vector3(DOCK.x + 1.25, BOAT.y + 1, BOAT.z), new THREE.Vector3(3.4, 3, 5.2));
      speech.say(c.root, { icon: 'wave', text: theme.greeting, prio: 2, dur: 4 });
      audio.play('jingle', { volume: 0.3 });
      void c.gesture('emote-yes');
      if (hints.firstTime('intro:boatvisit')) setTimeout(() => game.bus.emit('toast', { title: `${theme.name} is here!`, sub: `A visitor's boat is at the dock until ${boatvisit.hoursText.split(' to ')[1]}. Tap it to see what they want. They pay well, plus gems. Boats call two days a week.`, icon: theme.icon }), 2500);
    } finally { this.loading = false; }
  }
  private started = false;

  private async leave(): Promise<void> {
    const c = this.char, boat = this.boat;
    this.phase = 'leaving';
    this.box.makeEmpty();
    if (c) speech.say(c.root, { icon: 'wave', text: 'Time to sail. Thank you!', prio: 2, dur: 3 });
    if (boat) await boat.sailAway();
    if (c) c.root.removeFromParent();
    boat?.dispose();
    this.char = null; this.boat = null;
    this.phase = 'away';
  }

  private frame(dt: number): void {
    const c = this.char;
    if (!c || this.phase === 'away') return;
    c.update(dt);
    if (this.phase !== 'present') return;
    this.nudgeIn -= dt;
    if (this.nudgeIn > 0) return;
    this.nudgeIn = 40 + Math.random() * 30;
    const text = boatvisit.done ? pick(['Lovely goods, thank you!', 'Best farm on the coast!']) : pick(['Ahoy! Got anything for me?', 'Over here by the dock!', 'I will pay well!']);
    if (speech.say(c.root, { icon: pick(['wave', 'sparkles']), text })) void c.gesture('interact-right');
  }

  /** The tap handler for a ray. */
  pick(ray: THREE.Ray): (() => void) | null {
    if (this.phase !== 'present' || this.box.isEmpty() || !ray.intersectsBox(this.box)) return null;
    return () => this.greet();
  }

  greet(): void {
    const c = this.char;
    if (c) { speech.say(c.root, { icon: 'smile', text: pick(['Ahoy, friend!', 'Come aboard... well, nearly!']), prio: 2 }); void c.gesture('emote-yes'); }
    audio.play('tap', { volume: 0.5 });
    this.scene.loop.wake(1);
    import('../ui/UI').then(({ ui }) => ui.open('boatvisit'));
  }

  get theme(): string { return this.themeId; }
  get level(): number { return BOATVISITS.level; }
}
