import * as THREE from 'three';
import { PIECE, VILLAGERS } from '../data';
import { game } from '../systems/Game';
import { village } from '../systems/Village';
import { localDay } from '../systems/Progression';
import { HomeChar, HomeNav, type Seat } from '../world/home/HomePeople';
import { villagerLook } from '../world/VillagerLooks18';
import { speech } from '../ui/Speech';
import type { HomeView } from '../world/home/HomeView';
import type { CharacterLook } from '../systems/State';

/**
 * 1.30 life in the home: your farmer walks where you tap and sits where you point, villagers drop in for a while,
 * wander, sit down and chat, then head off. Everyone walks round the furniture (HomeNav), steps aside when a piece
 * is put down on them, and gets up when their chair is moved away.
 */

const HOME_LINES = ['What a cosy room!', 'I love what you have done in here.', 'Is that new? It suits the room.', 'Mind if I sit down for a bit?', 'It smells of fresh bread in here.', 'You could fit a whole party in here!'];
const SIT_LINES = ['Ahh, comfy.', 'I could stay here all day.', 'Perfect for a cup of tea.', 'This is my favourite spot.'];

export class HomeLife {
  readonly nav: HomeNav;
  player: HomeChar | null = null;
  guests: HomeChar[] = [];
  private villagerPlan: { id: string; at: number; stay: number }[] = [];
  private time = 0;
  private loading = false;
  /** extra people the caller manages (a friend's farmer over for coffee) */
  extras: HomeChar[] = [];

  constructor(private view: HomeView, private wake: () => void) {
    this.nav = new HomeNav(view);
  }

  get everyone(): HomeChar[] { return [...(this.player ? [this.player] : []), ...this.guests, ...this.extras]; }

  /** Start in a room: the farmer comes in by the front, and maybe a villager or two will drop by. */
  async start(look: CharacterLook | null, villagers = true): Promise<void> {
    this.stop();
    this.nav.rebuild();
    this.time = 0;
    if (look) {
      this.loading = true;
      try {
        this.player = await HomeChar.create(look, this.view.group, 'player');
        const spot = this.entrance();
        this.player.placeAt(spot[0], spot[1]);
        this.player.char.root.rotation.y = Math.PI;
      } finally { this.loading = false; }
    }
    if (villagers) this.planVillagers();
  }

  stop(): void {
    for (const p of this.everyone) p.dispose();
    this.player = null;
    this.guests = [];
    this.extras = [];
    this.villagerPlan = [];
  }

  /** The free spot by the front of the room (where people come in and go out). */
  entrance(): [number, number] {
    return this.nav.nearestFree(0, this.view.dims.d / 2 - 0.3) ?? [0, 0];
  }

  /** Up to two villagers drop in during the day, the closest friends most often; the same ones all day. */
  private planVillagers(): void {
    if (this.view.night > 0.6) return;
    const day = localDay(game.now());
    let h = 2166136261;
    for (const ch of `${day}|${this.view.roomId}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    const rnd = () => { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; return (h % 10000) / 10000; };
    const ranked = [...VILLAGERS].sort((a, b) => village.hearts(b.id) - village.hearts(a.id) || (rnd() - 0.5));
    const n = rnd() < 0.35 ? 2 : rnd() < 0.8 ? 1 : 0;
    this.villagerPlan = ranked.slice(0, 3).sort(() => rnd() - 0.5).slice(0, n).map((v, i) => ({ id: v.id, at: 4 + i * 9 + rnd() * 6, stay: 70 + rnd() * 80 }));
  }

  /** Furniture changed: rebuild the floor plan and move anyone in the way. */
  furnitureChanged(): void {
    this.nav.rebuild();
    const items = this.view.room?.items ?? [];
    for (const p of this.everyone) p.settle(this.nav, items);
  }

  /** Seats nobody is sitting on (or heading to). */
  freeSeats(except?: HomeChar): Seat[] {
    const taken = new Set(this.everyone.filter((p) => p !== except && p.seat).map((p) => `${p.seat!.uid}:${p.seat!.slot}`));
    return this.nav.seats().filter((s) => !taken.has(`${s.uid}:${s.slot}`));
  }

  /** The farmer sits on a piece (the free slot nearest the farmer). */
  sitOnPiece(uid: number, who = this.player): boolean {
    if (!who) return false;
    const seats = this.freeSeats(who).filter((s) => s.uid === uid);
    if (!seats.length) return false;
    seats.sort((a, b) => Math.hypot(a.x - who.pos.x, a.z - who.pos.z) - Math.hypot(b.x - who.pos.x, b.z - who.pos.z));
    return who.sitOn(this.nav, seats[0]);
  }

  walkPlayer(x: number, z: number): boolean { return !!this.player && this.player.walkTo(this.nav, x, z); }

  /** Who is under a ray (people are about a body wide), nearest first. */
  personAt(ray: THREE.Ray): HomeChar | null {
    let best: HomeChar | null = null, bestD = Infinity;
    const tmp = new THREE.Vector3();
    for (const p of this.everyone) {
      const w = p.char.root.getWorldPosition(tmp).add(new THREE.Vector3(0, 0.35, 0));
      const d = ray.distanceToPoint(w);
      if (d < 0.22 && d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  update(dt: number): void {
    this.time += dt;
    for (const plan of [...this.villagerPlan]) if (this.time >= plan.at && !this.loading) { this.villagerPlan.splice(this.villagerPlan.indexOf(plan), 1); void this.arrive(plan.id, plan.stay); }
    for (const p of this.everyone) p.update(dt);
    for (const g of this.guests) this.potter(g, dt);
    if (this.everyone.some((p) => p.walking)) this.wake();
  }

  private async arrive(id: string, stay: number): Promise<void> {
    const g = await HomeChar.create(villagerLook(id), this.view.group, id);
    g.userStay = stay;
    const spot = this.entrance();
    g.placeAt(spot[0], spot[1]);
    g.char.root.rotation.y = Math.PI;
    this.guests.push(g);
    const v = VILLAGERS.find((x) => x.id === id);
    speech.say(g.char.root, { text: `Knock knock! ${v?.name ?? 'A friend'} here.`, dur: 3 });
    this.wake();
  }

  /** A visiting villager: looks round, sits a while, says something now and then, then goes home. */
  private potter(g: HomeChar, dt: number): void {
    g.stayed = (g.stayed ?? 0) + dt;
    if (g.leaving) {
      if (!g.walking) { this.guests.splice(this.guests.indexOf(g), 1); g.dispose(); }
      return;
    }
    if (g.stayed > (g.userStay ?? 90)) {
      g.leaving = true;
      speech.say(g.char.root, { text: 'I must be off. Thanks for having me!', dur: 3 });
      const out = this.entrance();
      if (!g.walkTo(this.nav, out[0], out[1])) { this.guests.splice(this.guests.indexOf(g), 1); g.dispose(); }
      return;
    }
    if (g.walking || g.idle < (g.seat ? 18 : 5)) return;
    g.idle = 0;
    const seats = this.freeSeats(g);
    if (!g.seat && seats.length && Math.random() < 0.55) {
      const s = seats[Math.floor(Math.random() * seats.length)];
      g.sitOn(this.nav, s, () => speech.say(g.char.root, { text: SIT_LINES[Math.floor(Math.random() * SIT_LINES.length)], dur: 3 }));
      return;
    }
    // look at something in the room
    const items = (this.view.room?.items ?? []).filter((i) => PIECE[i.f]?.kind !== 'ceiling');
    const it = items[Math.floor(Math.random() * Math.max(1, items.length))];
    const to = it ? [it.x, it.z] : this.nav.nearestFree(0, 0) ?? [0, 0];
    g.walkTo(this.nav, to[0], to[1], () => {
      if (it) g.face(it.x, it.z);
      if (Math.random() < 0.5) {
        const v = VILLAGERS.find((x) => x.id === g.id);
        const lines = Math.random() < 0.6 ? HOME_LINES : (v?.chat ?? HOME_LINES);
        speech.say(g.char.root, { text: lines[Math.floor(Math.random() * lines.length)], dur: 3.5 });
      }
    });
  }

  /** The farmer, standing still for a while, sits down somewhere (or wanders). */
  idlePlayer(): void {
    const p = this.player;
    if (!p || p.walking || p.seat || p.idle < 30) return;
    p.idle = 0;
    const seats = this.freeSeats(p);
    if (seats.length) p.sitOn(this.nav, seats[Math.floor(Math.random() * seats.length)]);
  }

  /** Has the player moved home? (used by tests) */
  playerAt(): [number, number] | null { return this.player ? [this.player.pos.x, this.player.pos.z] : null; }
}

declare module '../world/home/HomePeople' {
  interface HomeChar { userStay?: number; stayed?: number; leaving?: boolean }
}

