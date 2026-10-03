import * as THREE from 'three';
import { Character } from '../world/Character';
import { Walker, besideBuilding, walkable } from '../world/People';
import { game } from '../systems/Game';
import type { PlacedBuilding } from '../systems/State';
import type { FarmScene } from './FarmScene';

/** The player's farmer: walks to whatever building you interact with, idles and potters about. */
export class Player {
  walker!: Walker;
  private lastTarget = -1;
  private wanderIn = 8;

  async init(scene: FarmScene): Promise<void> {
    const char = await Character.create(game.state.player.look, 1.55);
    this.walker = new Walker(char, scene.scene);
    const fh = game.buildingsOf('farmhouse')[0];
    const spot = fh ? besideBuilding(fh, [fh.x + 1, fh.z + 4]) : null;
    if (spot) this.walker.placeAt(spot[0], spot[1]); else this.walker.placeAt(24, 21);
    scene.onFrame((dt) => {
      this.walker.update(dt);
      this.wander(dt);
      if (this.walker.walking) scene.loop.wake(0.2);
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
    game.bus.on('levelup', () => { void this.walker.char.gesture('emote-yes'); });
  }

  /** Walk next to a building, then do a little interact animation. */
  goTo(b: PlacedBuilding): void {
    if (this.lastTarget === b.uid && this.walker.walking) return;
    this.lastTarget = b.uid;
    const spot = besideBuilding(b, this.walker.tile);
    if (!spot) return;
    const center = { x: b.x - 24 + 0.5, z: b.z - 24 + 0.5 };
    this.walker.walkTo(spot[0], spot[1], () => {
      this.walker.face(center.x + 0.5, center.z + 0.5);
      void this.walker.char.gesture(b.type === 'plot' ? 'pick-up' : 'interact-right');
      this.wanderIn = 10 + Math.random() * 10;
    });
  }

  private wander(dt: number): void {
    if (this.walker.walking) return;
    this.wanderIn -= dt;
    if (this.wanderIn > 0) return;
    this.wanderIn = 9 + Math.random() * 14;
    const [x, z] = this.walker.tile;
    for (let i = 0; i < 10; i++) {
      const tx = x + Math.round((Math.random() - 0.5) * 8), tz = z + Math.round((Math.random() - 0.5) * 8);
      if (walkable(tx, tz)) { this.walker.walkTo(tx, tz, () => { if (Math.random() < 0.3) void this.walker.char.gesture('emote-yes'); }); return; }
    }
  }

  get position(): THREE.Vector3 { return this.walker.char.root.position; }
}

export const player = new Player();
