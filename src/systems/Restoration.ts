/**
 * 1.8.5 Village Restoration: the old village square has six lots. Each room has bundles (short shopping lists of
 * items or coins). Players give items whenever they like and partly filled bundles keep what was given. When every
 * bundle of a room is full the room is rebuilt for good and its reward turns on (see RestorationEffects.ts).
 * Rooms marked `soon` in restoration.json open in a later update.
 */
import { RESTORATION, ROOMS, ROOM, type BundleDef, type RoomDef } from '../data';
import { game } from './Game';
import { saves } from './Save';
import { mail } from './Mail';
import { village } from './Village';
import { roomDone } from './RestorationEffects';
import { logEvent } from '../online/Events';
import type { RestorationState } from './State';

export interface BundleLine { item: string; need: number; given: number; left: number }

const dayKey = (now: number): string => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Friendship with the room's villager for each bundle that is filled. */
const BUNDLE_POINTS = 30;

class RestorationSystem {
  get st(): RestorationState { return (game.state.restoration ??= { given: {}, done: [], seen: [] }); }

  rooms(): RoomDef[] { return ROOMS; }
  room(id: string): RoomDef | undefined { return ROOM[id]; }

  /** A room can be worked on once it is built in this version and the player has reached its level. */
  isOpen(id: string): boolean { const r = ROOM[id]; return !!r && !r.soon && game.level >= r.opensAt; }
  isSoon(id: string): boolean { return !!ROOM[id]?.soon; }
  isDone(id: string): boolean { return roomDone(id); }

  given(room: string, bundle: string, item: string): number { return this.st.given[room]?.[bundle]?.[item] ?? 0; }

  lines(room: string, bundle: string): BundleLine[] {
    const b = ROOM[room]?.bundles.find((x) => x.id === bundle);
    if (!b) return [];
    return Object.entries(b.wants).map(([item, need]) => {
      const given = Math.min(need, this.given(room, bundle, item));
      return { item, need, given, left: need - given };
    });
  }
  bundleDone(room: string, bundle: string): boolean { const l = this.lines(room, bundle); return l.length > 0 && l.every((x) => x.left <= 0); }
  /** 0..1 how full a bundle is (each line counts by its share). */
  bundleFraction(room: string, bundle: string): number {
    const l = this.lines(room, bundle);
    const need = l.reduce((s, x) => s + x.need, 0);
    return need ? l.reduce((s, x) => s + x.given, 0) / need : 0;
  }
  bundlesDone(room: string): number { return (ROOM[room]?.bundles ?? []).filter((b) => this.bundleDone(room, b.id)).length; }
  /** 0..1 how rebuilt a room is: the average of its bundles (every item given shows). */
  roomFraction(room: string): number {
    if (this.isDone(room)) return 1;
    const bs = ROOM[room]?.bundles ?? [];
    return bs.length ? bs.reduce((s, b) => s + this.bundleFraction(room, b.id), 0) / bs.length : 0;
  }
  /** Look of a room: 0 ruin, 1-3 being rebuilt, 4 finished. */
  stage(room: string): 0 | 1 | 2 | 3 | 4 {
    if (this.isDone(room)) return 4;
    const f = this.roomFraction(room);
    return f <= 0 ? 0 : f < 1 / 3 ? 1 : f < 2 / 3 ? 2 : 3;
  }
  roomsDone(): number { return ROOMS.filter((r) => this.isDone(r.id)).length; }
  bundlesDoneTotal(): number { return ROOMS.reduce((s, r) => s + this.bundlesDone(r.id), 0); }
  /** Bundles waiting for something the player has right now (the dot on the Village screen). */
  givable(): number {
    let n = 0;
    for (const r of ROOMS) {
      if (!this.isOpen(r.id) || this.isDone(r.id)) continue;
      for (const b of r.bundles) if (!this.bundleDone(r.id, b.id) && this.lines(r.id, b.id).some((l) => l.left > 0 && this.canGive(r.id, b.id, l.item) > 0)) n++;
    }
    return n;
  }

  private minStar(room: string, bundle: string): number { return ROOM[room]?.bundles.find((x) => x.id === bundle)?.minStar ?? 0; }

  /** How many of an item the player holds that this bundle accepts (coins: the coins held). */
  held(room: string, bundle: string, item: string): number {
    if (item === 'coins') return game.coins;
    const star = this.minStar(room, bundle);
    const [n, s, g] = game.qualityCounts(item);
    return star === 2 ? g : star === 1 ? s + g : n + s + g;
  }
  /** How many the player can give now: what is held, capped by what the bundle still needs. */
  canGive(room: string, bundle: string, item: string): number {
    if (!this.isOpen(room) || this.isDone(room)) return 0;
    const l = this.lines(room, bundle).find((x) => x.item === item);
    return l ? Math.max(0, Math.min(l.left, this.held(room, bundle, item))) : 0;
  }

  /** Give up to `n` (default all it can take) of an item. Normal items go first; coins are spent. Returns how many. */
  give(room: string, bundle: string, item: string, n?: number): number {
    const can = this.canGive(room, bundle, item);
    const k = Math.min(can, n === undefined ? can : Math.floor(n));
    if (k <= 0) return 0;
    if (item === 'coins') { if (!game.spend(k)) return 0; }
    else {
      const star = this.minStar(room, bundle);
      if (star === 0) game.addItem(item, -k);
      else {
        // star bundles take silver first (for a silver ask), then gold
        const counts = game.qualityCounts(item);
        let left = k;
        for (const q of (star === 2 ? [2] : [1, 2]) as (1 | 2)[]) { const t = Math.min(left, counts[q]); if (t > 0) { game.removeQuality(item, q, t); left -= t; } }
      }
    }
    const g = ((this.st.given[room] ??= {})[bundle] ??= {});
    g[item] = (g[item] ?? 0) + k;
    game.incStat('bundle_items_given', item === 'coins' ? 0 : k);
    game.bus.emit('restoration:changed', { room, bundle });
    game.bus.emit('sfx', { name: 'select' });
    if (this.bundleDone(room, bundle)) this.bundleFinished(room, bundle);
    saves.save();
    return k;
  }

  private bundleFinished(room: string, bundle: string): void {
    const r = ROOM[room], b = r.bundles.find((x) => x.id === bundle) as BundleDef;
    game.incStat('bundles_filled');
    game.setGauge('bundles_done', this.bundlesDoneTotal());
    village.addPoints(r.villager, BUNDLE_POINTS, 'bundle');
    game.bus.emit('toast', { title: `${b.name} is full!`, sub: `${r.name}: ${this.bundlesDone(room)} of ${r.bundles.length}`, icon: b.icon });
    game.bus.emit('sfx', { name: 'reward' });
    logEvent('bundle_done', { room, bundle, level: game.level });
    if (r.bundles.every((x) => this.bundleDone(room, x.id))) this.roomFinished(room);
  }

  private roomFinished(room: string): void {
    const r = ROOM[room];
    const st = this.st;
    if (st.done.includes(room)) return;
    st.done.push(room);
    game.setGauge('rooms_rebuilt', this.roomsDone());
    const farmer = game.state.player.name;
    if (r.letter.title) mail.send(r.villager, r.letter.title, r.letter.body.split('{farmer}').join(farmer));
    game.bus.emit('restoration:room', { room });
    game.bus.emit('toast', { title: `${r.name} is rebuilt!`, sub: r.reward.text, icon: r.icon });
    game.bus.emit('sfx', { name: 'levelup' });
    logEvent('room_done', { room, level: game.level, rooms: this.roomsDone() });
  }

  /** Rosa's rare seeds (Pantry): how many can still be bought today. */
  seedsLeftToday(): number {
    if (!roomDone('pantry')) return 0;
    const st = this.st, today = dayKey(game.now());
    const bought = st.seeds?.day === today ? st.seeds.bought : 0;
    return Math.max(0, RESTORATION.rewards.rareSeedsPerDay - bought);
  }
  buyRareSeed(): boolean {
    if (this.seedsLeftToday() <= 0) return false;
    if (!game.spend(RESTORATION.rewards.rareSeedPrice)) return false;
    const st = this.st, today = dayKey(game.now());
    st.seeds = { day: today, bought: (st.seeds?.day === today ? st.seeds.bought : 0) + 1 };
    game.addItem('rare_seed', 1);
    game.incStat('rare_seeds_bought');
    game.bus.emit('sfx', { name: 'purchase' });
    saves.save();
    return true;
  }

  /** Hazel's letter about the old village square, once, when the farm is settled (level 5). */
  private introLetter(): void {
    const st = this.st;
    if (st.intro !== undefined || game.level < 5 || !game.state.tutorial.done || !game.state.player.created) return;
    const l = mail.send('hazel', 'The old village square',
      `Dear ${game.state.player.name},\n\nHave you seen the old village square, across the water? It used to be the heart of the valley, and now it is just ruins and weeds.\n\nThe six rooms could be rebuilt, if we all pitch in. Look for the signpost and the little boat on your east beach, or open Village and tap Go. Each room asks for a few of the things you grow and make, and when a room is finished, everyone in the valley is better off.\n\nNo rush at all. It will be there whenever you are ready.\n\nWith love,\nHazel`);
    st.intro = l.id;
    saves.save();
    logEvent('square_intro', { level: game.level });
  }

  /** Start listening (once, after the farm is loaded). */
  init(): void {
    this.introLetter();
    game.bus.on('levelup', () => this.introLetter());
  }

  /** The room's finished celebration has been shown (so it plays once). */
  markSeen(room: string): void { const st = this.st; if (!(st.seen ??= []).includes(room)) { st.seen.push(room); saves.save(); } }
  wasSeen(room: string): boolean { return !!this.st.seen?.includes(room); }
}

export const restoration = new RestorationSystem();
