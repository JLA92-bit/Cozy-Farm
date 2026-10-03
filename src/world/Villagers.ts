import { COSMETICS, BUILDING } from '../data';
import { game } from '../systems/Game';
import { buildings } from '../systems/Buildings';
import { Character } from './Character';
import { Walker, besideBuilding, walkable } from './People';
import type { FarmScene } from '../scenes/FarmScene';

const BODIES = COSMETICS.bodies.map((b) => b.id);
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

interface Villager { w: Walker; plan: (() => void)[]; leaving: boolean; wait: number }

/** Small NPCs visiting the farm: shop at the stall, read the order board, admire decorations. More Charm = more visitors. */
export class Villagers {
  private list: Villager[] = [];
  private spawnIn = 4;
  private loading = false;

  constructor(private scene: FarmScene) {
    scene.onFrame((dt) => this.update(dt));
  }

  /** Entry/exit tile: the east end of the farm path, else any walkable tile near the centre. */
  private gate(): [number, number] {
    const paths = game.state.buildings.filter((b) => BUILDING[b.type].path);
    if (paths.length) { const p = paths.reduce((a, b) => (b.x > a.x ? b : a)); return [p.x, p.z]; }
    return [24, 24];
  }

  private destinations(): [number, number][] {
    const out: [number, number][] = [];
    const from = this.gate();
    for (const b of game.state.buildings) {
      const def = BUILDING[b.type];
      const interesting = b.type === 'order_board' || b.type === 'roadside_stall' || (def.cat === 'decor' && def.charm >= 4) || def.cat === 'animal';
      if (!interesting) continue;
      const s = besideBuilding(b, from);
      if (s) out.push(s);
    }
    if (!out.length) out.push(from);
    return out;
  }

  private async spawn(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    try {
      const look = {
        body: pick(BODIES), skin: pick(COSMETICS.skinTones), hair: pick(COSMETICS.hairColors),
        top: pick(COSMETICS.outfitColors).color, bottom: pick(COSMETICS.outfitColors).color,
        hat: pick(['none', 'none', 'straw', 'cap', 'beanie', 'bucket', 'flower_crown']), accessory: 'none', pet: Math.random() < 0.15 ? pick(['dog', 'cat']) : 'none',
      };
      const c = await Character.create(look, 1.4);
      const w = new Walker(c, this.scene.scene);
      w.speed = 1.6 + Math.random() * 0.5;
      const [gx, gz] = this.gate();
      w.placeAt(gx, gz);
      const v: Villager = { w, plan: [], leaving: false, wait: 0 };
      const stops = this.destinations().sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 3));
      for (const [x, z] of stops) v.plan.push(() => { if (!w.walkTo(x, z, () => { v.wait = 2 + Math.random() * 4; if (Math.random() < 0.4) void c.gesture('emote-yes'); })) v.wait = 0.1; });
      v.plan.push(() => { v.leaving = true; w.walkTo(gx, gz, () => this.remove(v)); });
      this.list.push(v);
    } finally {
      this.loading = false;
    }
  }

  private remove(v: Villager): void {
    this.scene.scene.remove(v.w.char.root);
    if (v.w.char.pet) this.scene.scene.remove(v.w.char.pet);
    this.list = this.list.filter((x) => x !== v);
  }

  private update(dt: number): void {
    const target = game.state.player.created ? buildings.bonuses().villagers : 0;
    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.list.length < target && walkable(...this.gate())) {
      this.spawnIn = 6 + Math.random() * 10;
      void this.spawn();
    }
    for (const v of this.list) {
      v.w.update(dt);
      if (v.w.walking) { this.scene.loop.wake(0.2); continue; }
      if (v.wait > 0) { v.wait -= dt; continue; }
      const next = v.plan.shift();
      if (next) next();
      else this.remove(v);
    }
  }

  get count(): number { return this.list.length; }
}
