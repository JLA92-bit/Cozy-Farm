import * as THREE from 'three';
import gsap from 'gsap';
import { COSMETICS, BUILDING } from '../data';
import { game } from '../systems/Game';
import { buildings } from '../systems/Buildings';
import { audio } from '../systems/Audio';
import type { PlacedBuilding } from '../systems/State';
import { Character } from './Character';
import { Walker, besideBuilding, buildingCenter, walkable } from './People';
import { VILLAGER_NAMES, arrivalLine, greeting, isNight, leavingLine, pick, reactionTo, tapLine } from './Chatter';
import { speech } from '../ui/Speech';
import { ui } from '../ui/UI';
import type { FarmScene } from '../scenes/FarmScene';

const BODIES = COSMETICS.bodies.map((b) => b.id);

interface Stop { b: PlacedBuilding | null; x: number; z: number }
interface Villager {
  w: Walker; name: string; plan: Stop[]; leaving: boolean; wait: number; greeted: boolean;
  /** building we are standing next to (to react once we arrive) */
  at: Stop | null; chatCooldown: number; gone: boolean;
  /** standing tile to hop back to after sitting on a bench */
  seat: THREE.Vector3 | null;
}

const SEATS = new Set(['bench']);

/** Someone the villagers can say hi to (the player's farmer). */
export interface Greeter { position: THREE.Vector3; greetBack(from: THREE.Vector3): void }

const SPHERE = new THREE.Sphere();
const TMP = new THREE.Vector3();

/**
 * Small NPCs visiting the farm: shop at the stall, read the order board, admire decorations and crops,
 * greet the farmer and chat with each other. More Charm = more visitors (fewer at night). Tap one to hear their news.
 */
export class Villagers {
  private list: Villager[] = [];
  private spawnIn = 4;
  private loading = false;
  private chatIn = 8;
  private salesIn = 1;
  private salesSeen = 0;
  greeter: Greeter | null = null;

  constructor(private scene: FarmScene) {
    scene.onFrame((dt) => this.update(dt));
    game.bus.on('building:placed', ({ b, isNew }) => { if (isNew) this.noticeNew(b); });
  }

  /** Entry/exit tile: the east end of the farm path, else any walkable tile near the centre. */
  private gate(): [number, number] {
    const paths = game.state.buildings.filter((b) => BUILDING[b.type].path);
    if (paths.length) { const p = paths.reduce((a, b) => (b.x > a.x ? b : a)); return [p.x, p.z]; }
    return [24, 24];
  }

  private destinations(): Stop[] {
    const out: { s: Stop; w: number }[] = [];
    const from = this.gate();
    let plots = 0;
    for (const b of game.state.buildings) {
      const def = BUILDING[b.type];
      let weight = 0;
      if (b.type === 'order_board' || b.type === 'roadside_stall') weight = 3;
      else if (def.cat === 'decor' && def.charm >= 3) weight = 1 + Math.min(4, def.charm / 8);
      else if (def.cat === 'animal' && b.animals?.length) weight = 2;
      else if (b.type === 'plot' && b.plot && plots < 4) { weight = 0.8; plots++; }
      if (!weight) continue;
      const s = besideBuilding(b, from);
      if (s) out.push({ s: { b, x: s[0], z: s[1] }, w: weight * (0.5 + Math.random()) });
    }
    out.sort((a, b) => b.w - a.w);
    const stops = out.map((o) => o.s);
    if (!stops.length) stops.push({ b: null, x: from[0], z: from[1] });
    return stops;
  }

  private night(): number { return this.scene.env.night; }

  private async spawn(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    try {
      const look = {
        body: pick(BODIES), skin: pick(COSMETICS.skinTones), hair: pick(COSMETICS.hairColors),
        top: pick(COSMETICS.outfitColors).color, bottom: pick(COSMETICS.outfitColors).color,
        hat: pick(['none', 'none', 'straw', 'cap', 'beanie', 'bucket', 'flower_crown']), accessory: Math.random() < 0.25 ? pick(['backpack', 'scarf', 'glasses', 'flower']) : 'none', pet: Math.random() < 0.18 ? pick(['dog', 'cat', 'dog', 'bunny']) : 'none',
      };
      const c = await Character.create(look, 1.4);
      const w = new Walker(c, this.scene.scene);
      w.speed = 1.6 + Math.random() * 0.5;
      const [gx, gz] = this.gate();
      w.placeAt(gx, gz);
      const used = new Set(this.list.map((v) => v.name));
      const name = pick(VILLAGER_NAMES.filter((n) => !used.has(n)));
      const v: Villager = { w, name, plan: [], leaving: false, wait: 0.5, greeted: false, at: null, chatCooldown: 6, gone: false, seat: null };
      const charmBonus = buildings.charm() >= 200 ? 1 : 0;
      const pool = this.destinations();
      // mostly the favourites, with a little randomness so walks differ
      const n = Math.min(pool.length, 1 + Math.floor(Math.random() * 3) + charmBonus);
      const chosen = pool.slice(0, n + 2).sort(() => Math.random() - 0.5).slice(0, n);
      v.plan.push(...chosen);
      this.list.push(v);
      // pop in with a little hop
      c.root.scale.setScalar(0.01);
      gsap.to(c.root.scale, { x: 1, y: 1, z: 1, duration: 0.45, ease: 'back.out(2.2)' });
      if (c.pet) { c.pet.scale.multiplyScalar(0.01); gsap.to(c.pet.scale, { x: c.pet.scale.x * 100, y: c.pet.scale.y * 100, z: c.pet.scale.z * 100, duration: 0.45, ease: 'back.out(2)' }); }
      this.scene.loop.wake(0.6);
      const hello = arrivalLine(this.night());
      if (hello) setTimeout(() => { if (!v.gone) speech.say(c.root, hello); }, 500);
    } finally {
      this.loading = false;
    }
  }

  /** Shrink away at the gate, then free the character. */
  private remove(v: Villager): void {
    if (v.gone) return;
    v.gone = true;
    this.list = this.list.filter((x) => x !== v);
    const c = v.w.char;
    const done = () => { this.scene.scene.remove(c.root); c.dispose(); };
    gsap.to(c.root.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.3, ease: 'back.in(2)', onComplete: done });
    if (c.pet) gsap.to(c.pet.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.3 });
    this.scene.loop.wake(0.4);
  }

  private next(v: Villager): void {
    const stop = v.plan.shift();
    if (stop) {
      // skip stops that vanished (sold/moved buildings)
      if (stop.b && !game.byUid(stop.b.uid)) { v.wait = 0.1; return; }
      v.at = stop;
      if (!v.w.walkTo(stop.x, stop.z, () => this.arrive(v))) { v.at = null; v.wait = 0.1; }
      return;
    }
    if (!v.leaving) {
      v.leaving = true;
      const bye = leavingLine(this.night());
      if (bye) speech.say(v.w.char.root, bye);
      v.wait = bye ? 0.9 : 0.1;
      return;
    }
    // walk out through the gate
    const [gx, gz] = this.gate();
    if (!v.w.walkTo(gx, gz, () => this.remove(v))) this.remove(v);
  }

  /** Arrived next to something: look at it and react. */
  private arrive(v: Villager): void {
    const stop = v.at;
    v.at = null;
    if (!stop?.b || !game.byUid(stop.b.uid)) { v.wait = 1 + Math.random() * 2; return; }
    const b = stop.b;
    const def = BUILDING[b.type];
    const [cx, cz] = buildingCenter(b);
    v.w.face(cx, cz);
    const c = v.w.char;
    if (SEATS.has(b.type) && !this.seatTaken(b)) { this.sitOn(v, b); return; }
    const shop = b.type === 'order_board' || b.type === 'roadside_stall';
    v.wait = 2.5 + Math.random() * 2.5 + (def.cat === 'decor' ? Math.min(4, def.charm / 10) : 0);
    setTimeout(() => {
      if (v.gone) return;
      void c.gesture(shop ? 'interact-right' : Math.random() < 0.6 ? 'emote-yes' : 'pick-up');
      if (Math.random() < 0.75) speech.say(c.root, reactionTo(b));
      if (def.cat === 'decor' && def.charm >= 10) ui.effects.hearts(TMP.set(c.root.position.x, 1.6, c.root.position.z));
      this.scene.loop.wake(1);
    }, 250);
  }

  private seatTaken(b: PlacedBuilding): boolean {
    const [cx, cz] = buildingCenter(b);
    return this.list.some((o) => o.seat && Math.abs(o.w.char.root.position.x - cx) < 0.3 && Math.abs(o.w.char.root.position.z - cz) < 0.3);
  }

  /** Hop onto a bench and rest a while, enjoying the view. */
  private sitOn(v: Villager, b: PlacedBuilding): void {
    const [cx, cz] = buildingCenter(b);
    const root = v.w.char.root;
    v.seat = root.position.clone();
    // sit across the plank, on the side that faces the camera
    const cam = this.scene.rig.camera.position;
    let yaw = -b.rot * Math.PI / 2 + Math.PI / 2;
    if (Math.sin(yaw) * (cam.x - cx) + Math.cos(yaw) * (cam.z - cz) < 0) yaw += Math.PI;
    v.wait = 7 + Math.random() * 6;
    gsap.timeline({ onUpdate: () => this.scene.loop.wake(0.2) })
      .to(root.position, { x: cx, z: cz, duration: 0.4, ease: 'power1.inOut' })
      .to(root.position, { y: 0.35, duration: 0.2, ease: 'power2.out', yoyo: true, repeat: 1 }, 0)
      .add(() => { root.rotation.y = yaw; v.w.char.play('sit', 0.2); }, 0.25)
      .add(() => { if (!v.gone && Math.random() < 0.6) speech.say(root, { icon: pick(['sun', 'music', 'heart', 'smile']), text: Math.random() < 0.5 ? pick(['Ahh, so nice.', 'What a view!', 'Just resting...']) : undefined }); }, 1.2);
  }

  /** Back on your feet after a sit. */
  private standUp(v: Villager): void {
    const seat = v.seat!;
    v.seat = null;
    v.w.char.play('idle', 0.2);
    v.wait = 0.5;
    gsap.to(v.w.char.root.position, { x: seat.x, z: seat.z, duration: 0.35, ease: 'power1.inOut', onUpdate: () => this.scene.loop.wake(0.2) });
  }

  /** A shiny new decoration: the nearest villager notices and goes to have a look. */
  private noticeNew(b: PlacedBuilding): void {
    const def = BUILDING[b.type];
    if (def.cat !== 'decor' || def.path || def.charm < 2) return;
    const [cx, cz] = buildingCenter(b);
    let best: Villager | null = null, bestD = 14 * 14;
    for (const v of this.list) {
      if (v.leaving || v.seat) continue;
      const p = v.w.char.root.position;
      const d = (p.x - cx) ** 2 + (p.z - cz) ** 2;
      if (d < bestD) { bestD = d; best = v; }
    }
    if (!best) return;
    const v = best;
    v.w.halt();
    v.w.face(cx, cz);
    speech.say(v.w.char.root, { icon: 'sparkle_heart', text: `Ooh, a new ${def.name.toLowerCase()}!`, prio: 1 });
    void v.w.char.gesture('emote-yes');
    const spot = besideBuilding(b, v.w.tile);
    if (v.at) v.plan.unshift(v.at);
    if (spot) v.plan.unshift({ b, x: spot[0], z: spot[1] });
    v.at = null;
    v.wait = 1.4;
  }

  /** Tap test for the HUD: returns an action when a villager is under the ray. */
  pick(ray: THREE.Ray): (() => void) | null {
    if (!game.state.tutorial.done) return null; // never steal tutorial taps
    let best: Villager | null = null, bestD = Infinity;
    for (const v of this.list) {
      const p = v.w.char.root.position;
      SPHERE.center.set(p.x, 0.7, p.z);
      SPHERE.radius = 0.6;
      if (!ray.intersectsSphere(SPHERE)) continue;
      const d = ray.origin.distanceToSquared(SPHERE.center);
      if (d < bestD) { bestD = d; best = v; }
    }
    if (!best) return null;
    const v = best;
    return () => {
      const cam = this.scene.rig.camera.position;
      if (!v.w.walking && !v.seat) { v.w.face(cam.x, cam.z); void v.w.char.gesture('emote-yes'); }
      speech.say(v.w.char.root, { ...tapLine(v.name, this.night()), prio: 2 });
      audio.play('pop', { volume: 0.5, rate: 1.1 + Math.random() * 0.2 });
      if (!v.w.walking) v.wait = Math.max(v.wait, 2.5);
      this.scene.loop.wake(1);
    };
  }

  private update(dt: number): void {
    let target = game.state.player.created ? buildings.bonuses().villagers : 0;
    if (isNight(this.night())) target = Math.min(target, Math.ceil(target / 2));
    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.list.length < target && walkable(...this.gate())) {
      this.spawnIn = 6 + Math.random() * 10;
      void this.spawn();
    }
    const g = this.greeter;
    this.watchSales(dt);
    for (const v of this.list) {
      if (v.gone) continue;
      v.w.update(dt);
      v.chatCooldown -= dt;
      // say hi when passing the farmer
      if (g && !v.greeted && !v.leaving) {
        const p = v.w.char.root.position;
        if ((p.x - g.position.x) ** 2 + (p.z - g.position.z) ** 2 < 2.2 * 2.2) {
          v.greeted = true;
          if (speech.say(v.w.char.root, { ...greeting(this.night()), prio: 1 })) {
            if (!v.w.walking && !v.seat) v.w.face(g.position.x, g.position.z);
            g.greetBack(p);
          }
        }
      }
      if (v.w.walking) { this.scene.loop.wake(0.2); continue; }
      if (v.wait > 0) { v.wait -= dt; continue; }
      if (v.seat) { this.standUp(v); continue; }
      this.next(v);
    }
    this.chatter(dt);
  }

  /** When something sells at the roadside stall, a villager strolls over to buy it. */
  private watchSales(dt: number): void {
    if ((this.salesIn -= dt) > 0) return;
    this.salesIn = 1;
    const now = game.now();
    const from = this.salesSeen || now;
    this.salesSeen = now;
    const sale = game.state.stall.slots.find((s) => s.item && s.soldAt && s.soldAt > from && s.soldAt <= now);
    const stall = sale && game.buildingsOf('roadside_stall')[0];
    if (!sale?.item || !stall) return;
    const v = this.list.find((x) => !x.leaving && !x.seat && !x.gone);
    if (!v) return;
    const spot = besideBuilding(stall, v.w.tile);
    if (!spot) return;
    const item = sale.item;
    v.w.halt();
    if (v.at) v.plan.unshift(v.at);
    v.at = null;
    v.wait = 0;
    if (!v.w.walkTo(spot[0], spot[1], () => {
      const [cx, cz] = buildingCenter(stall);
      v.w.face(cx, cz);
      void v.w.char.gesture('interact-right');
      speech.say(v.w.char.root, { icon: item, text: pick(["I'll take it!", 'Just what I needed!', 'Yes, please!']), prio: 1 });
      v.wait = 2.5;
      this.scene.loop.wake(1);
    })) v.wait = 0.1;
  }

  /** Two villagers standing close by have a little chat. */
  private chatter(dt: number): void {
    this.chatIn -= dt;
    if (this.chatIn > 0 || this.list.length < 2) return;
    this.chatIn = 3;
    for (const a of this.list) for (const b of this.list) {
      if (a === b || a.w.walking || b.w.walking || a.leaving || b.leaving || a.seat || b.seat || a.chatCooldown > 0 || b.chatCooldown > 0) continue;
      const pa = a.w.char.root.position, pb = b.w.char.root.position;
      if ((pa.x - pb.x) ** 2 + (pa.z - pb.z) ** 2 > 3 * 3) continue;
      a.chatCooldown = b.chatCooldown = 25;
      a.w.face(pb.x, pb.z); b.w.face(pa.x, pa.z);
      a.wait = Math.max(a.wait, 3.5); b.wait = Math.max(b.wait, 3.5);
      const [q, r] = pick(CHATS);
      if (!speech.say(a.w.char.root, { ...q, dur: 2.2 })) return;
      setTimeout(() => { if (!b.gone) { speech.hush(a.w.char.root); speech.say(b.w.char.root, r); void b.w.char.gesture('emote-yes'); } }, 1700);
      this.chatIn = 12;
      return;
    }
  }

  get count(): number { return this.list.length; }
}

const CHATS: [{ icon: string; text: string }, { icon: string; text: string }][] = [
  [{ icon: 'sun', text: 'Nice day, huh?' }, { icon: 'smile', text: 'The best!' }],
  [{ icon: 'bread', text: 'Tried the bread here?' }, { icon: 'heart', text: 'So good!' }],
  [{ icon: 'cow', text: 'The cows look happy.' }, { icon: 'music', text: 'Moo!' }],
  [{ icon: 'blossom', text: 'Love the flowers!' }, { icon: 'sparkles', text: 'Me too!' }],
  [{ icon: 'truck', text: 'Big delivery soon?' }, { icon: 'package', text: 'I hope so!' }],
  [{ icon: 'pie', text: 'Pie later?' }, { icon: 'heart', text: 'Yes please!' }],
];
