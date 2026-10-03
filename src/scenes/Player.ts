import * as THREE from 'three';
import { BUILDING } from '../data';
import { Character } from '../world/Character';
import { Walker, besideBuilding, buildingCenter, walkable } from '../world/People';
import { tileToWorld } from '../world/Grid';
import { farmerLine, isNight, pick } from '../world/Chatter';
import { game } from '../systems/Game';
import { audio } from '../systems/Audio';
import type { PlacedBuilding } from '../systems/State';
import { speech, type SayOpts } from '../ui/Speech';
import type { FarmScene } from './FarmScene';

const SPHERE = new THREE.Sphere();

/** The player's farmer: walks to whatever building you interact with, idles, potters about and chats. */
export class Player {
  walker!: Walker;
  private scene!: FarmScene;
  private lastTarget = -1;
  private wanderIn = 8;
  private greetCooldown = 0;
  private dozeIn = 20;
  private home: [number, number] = [24, 21];

  async init(scene: FarmScene): Promise<void> {
    this.scene = scene;
    const char = await Character.create(game.state.player.look, 1.55);
    this.walker = new Walker(char, scene.scene);
    const fh = game.buildingsOf('farmhouse')[0];
    const spot = fh ? besideBuilding(fh, [fh.x + 1, fh.z + 4]) : null;
    if (spot) this.home = spot;
    this.walker.placeAt(this.home[0], this.home[1]);
    scene.onFrame((dt) => {
      this.walker.update(dt);
      this.wander(dt);
      this.greetCooldown -= dt;
      if (this.walker.walking) scene.loop.wake(0.2);
      speech.update(dt);
    });
    const go = ({ b }: { b: PlacedBuilding }) => this.goTo(b);
    game.bus.on('crop:planted', go);
    game.bus.on('crop:harvested', go);
    game.bus.on('tree:harvested', go);
    game.bus.on('animal:fed', go);
    game.bus.on('animal:collected', go);
    game.bus.on('production:collected', go);
    game.bus.on('production:queued', go);
    game.bus.on('building:placed', go);
    game.bus.on('look:changed', () => { void this.walker.char.setLook(game.state.player.look); });
    // little celebrations for the big moments
    game.bus.on('levelup', () => this.cheer({ icon: 'star', text: 'Level up!', prio: 3 }, 'jump'));
    game.bus.on('order:completed', () => this.cheer({ icon: 'coin', text: pick(['Delivered!', 'Order done!', 'Happy customer!']), prio: 2 }));
    game.bus.on('achievement', () => this.cheer({ icon: 'trophy', text: 'Woohoo!', prio: 2 }, 'jump'));
    game.bus.on('quest:completed', () => this.cheer({ icon: 'check', text: 'Quest done!', prio: 2 }));
    game.bus.on('animal:bought', ({ animal }) => this.cheer({ icon: animal, text: 'Welcome, little one!', prio: 2 }));
    game.bus.on('building:complete', ({ b }) => { if (BUILDING[b.type].cat !== 'decor') this.cheer({ icon: 'hammer', text: 'All built!', prio: 1 }); });
  }

  /** Say something and do a happy gesture (if not busy walking). */
  cheer(line: SayOpts, gesture = 'emote-yes'): void {
    speech.say(this.walker.char.root, line);
    if (!this.walker.walking) void this.walker.char.gesture(gesture);
    this.scene.loop.wake(1);
  }

  /** Walk next to a building, then do a little interact animation. */
  goTo(b: PlacedBuilding): void {
    if (this.lastTarget === b.uid && this.walker.walking) return;
    this.lastTarget = b.uid;
    const spot = besideBuilding(b, this.walker.tile);
    if (!spot) return;
    const def = BUILDING[b.type];
    const [cx, cz] = buildingCenter(b);
    this.walker.walkTo(spot[0], spot[1], () => {
      this.walker.face(cx, cz);
      const g = b.type === 'plot' || def.tree ? 'pick-up' : def.cat === 'decor' ? 'emote-yes' : 'interact-right';
      void this.walker.char.gesture(g);
      this.wanderIn = 10 + Math.random() * 10;
      this.dozeIn = 25;
    });
  }

  /** A villager said hi: wave back when free. */
  greetBack(from: THREE.Vector3): void {
    if (this.greetCooldown > 0 || this.walker.walking) return;
    this.greetCooldown = 14;
    const night = isNight(this.scene.env.night);
    setTimeout(() => {
      if (this.walker.walking) return;
      this.walker.face(from.x, from.z);
      void this.walker.char.gesture('emote-yes');
      speech.say(this.walker.char.root, { icon: 'wave', text: pick(night ? ['Evening!', 'Hi there!'] : ['Hi there!', 'Welcome!', 'Hello!', 'Howdy!']) });
      this.scene.loop.wake(1);
    }, 700);
  }

  /** Step out of the way if standing on/near `pos` (e.g. where the merchant parks). */
  makeRoom(pos: THREE.Vector3): void {
    const p = this.position;
    if ((p.x - pos.x) ** 2 + (p.z - pos.z) ** 2 > 2.2 * 2.2) return;
    const [x, z] = this.walker.tile;
    let best: [number, number] | null = null, bestD = Infinity;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const tx = x + dx, tz = z + dz;
      if (!walkable(tx, tz) || (tileToWorld(tx) - pos.x) ** 2 + (tileToWorld(tz) - pos.z) ** 2 < 2.6 * 2.6) continue;
      // the nearest tile that is clear of the cart
      const d = dx * dx + dz * dz + Math.random() * 0.5;
      if (d < bestD) { bestD = d; best = [tx, tz]; }
    }
    if (best) this.walker.walkTo(best[0], best[1], () => { this.walker.face(pos.x, pos.z); });
    this.wanderIn = Math.max(this.wanderIn, 12);
  }

  /** Tap test: the farmer (or their pet) under the ray. */
  pick(ray: THREE.Ray): (() => void) | null {
    // busy farmers (walking to a field) don't steal taps meant for the field behind them
    if (this.walker.walking) return null;
    const p = this.position;
    SPHERE.center.set(p.x, 0.75, p.z);
    SPHERE.radius = 0.6;
    let hit = ray.intersectsSphere(SPHERE);
    const pet = this.walker.char.pet;
    if (!hit && pet) { SPHERE.center.set(pet.position.x, 0.3, pet.position.z); SPHERE.radius = 0.45; hit = ray.intersectsSphere(SPHERE); }
    if (!hit) return null;
    return () => {
      const cam = this.scene.rig.camera.position;
      if (!this.walker.walking) this.walker.face(cam.x, cam.z);
      void this.walker.char.gesture(Math.random() < 0.5 ? 'jump' : 'emote-yes');
      this.walker.char.petCheer();
      speech.say(this.walker.char.root, { ...farmerLine(), prio: 2 });
      audio.play('pop', { volume: 0.55 });
      this.wanderIn = Math.max(this.wanderIn, 6);
      this.dozeIn = 25;
      this.scene.loop.wake(1.2);
    };
  }

  private wander(dt: number): void {
    if (this.walker.walking) return;
    // a sleepy "zzz" now and then when left alone at night
    if (isNight(this.scene.env.night) && (this.dozeIn -= dt) <= 0) {
      this.dozeIn = 18 + Math.random() * 14;
      speech.say(this.walker.char.root, { icon: 'zzz', dur: 2.2 });
    }
    this.wanderIn -= dt;
    if (this.wanderIn > 0) return;
    this.wanderIn = 9 + Math.random() * 14;
    const [x, z] = this.walker.tile;
    // drift back towards home when far away, so the farmer stays near the farmhouse
    const far = (x - this.home[0]) ** 2 + (z - this.home[1]) ** 2 > 12 * 12;
    for (let i = 0; i < 10; i++) {
      const bx = far ? x + Math.sign(this.home[0] - x) * 4 : x, bz = far ? z + Math.sign(this.home[1] - z) * 4 : z;
      const tx = bx + Math.round((Math.random() - 0.5) * 8), tz = bz + Math.round((Math.random() - 0.5) * 8);
      if (walkable(tx, tz)) {
        this.walker.walkTo(tx, tz, () => {
          const r = Math.random();
          if (r < 0.25) void this.walker.char.gesture('emote-yes');
          else if (r < 0.33 && !isNight(this.scene.env.night)) speech.say(this.walker.char.root, { icon: pick(['music', 'sun', 'blossom']), dur: 1.8 });
        });
        return;
      }
    }
  }

  get position(): THREE.Vector3 { return this.walker.char.root.position; }
}

export const player = new Player();
