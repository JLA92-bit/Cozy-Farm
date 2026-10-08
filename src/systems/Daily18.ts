/**
 * 1.8 daily rhythm: every local day one villager visits the farm with a small request, a few little finds
 * turn up on the farm (shells, petals, acorns, now and then something a villager lost), and the visitor sends
 * a short morning note. Everything for the day is made once on the first tick of that day and kept in
 * game.state.village.today, so reloading never rerolls it. Pure game logic: the farm view and the cards live in
 * world/Daily18View.ts and ui/panels/MailPanel.ts.
 */
import { BUILDING, ITEMS, VILLAGER, VILLAGERS, itemXp, ECONOMY } from '../data';
import { game } from './Game';
import { mail } from './Mail';
import { village } from './Village';
import { obtainableItems } from './Economy';
import { localDay } from './Progression';
import { dayNumber, weatherToday } from './Weather';
import { MAP, chunkOf, inMap, rotatedSize } from '../world/Grid';
import { hashString, rng } from '../world/Procedural';
import type { VisitRequest } from './State';

/** Friendship for helping the day's visitor, and for returning something a villager lost. */
export const VISIT_POINTS = 30;
export const LOST_POINTS = 20;

/** Little things that turn up on the farm. `item` goes to the barn (seashells and petals make lovely gifts). */
export const FIND_KINDS: Record<string, { item: string; qty: number; name: string; icon: string }> = {
  shell: { item: 'seashell', qty: 1, name: 'Seashell', icon: 'shell' },
  petal: { item: 'petal', qty: 2, name: 'Wild petals', icon: 'blossom' },
  acorn: { item: 'acorn', qty: 2, name: 'Acorns', icon: 'acorn' },
};

/** Something a villager lost on the farm: tapping it gives it back. */
export const LOST: Record<string, { thing: string; icon: string; thanks: string }> = {
  rosa: { thing: 'recipe card', icon: 'memo', thanks: 'her favourite recipe card' },
  tom: { thing: 'fishing lure', icon: 'fishing_pole', thanks: 'his lucky fishing lure' },
  juniper: { thing: 'paintbrush', icon: 'paint', thanks: 'her best paintbrush' },
  pip: { thing: 'marble', icon: 'crystal', thanks: 'his shiny marble' },
  hazel: { thing: 'shop key', icon: 'key', thanks: 'her shop key' },
  bram: { thing: 'little hammer', icon: 'hammer', thanks: 'his little hammer' },
};

type SaveFind = typeof game.state.village.today.finds[number];

/** What a find is: a barn item, or something a villager lost (`lost` = villager id). */
export function findInfo(f: { id: string; item: string }): { kind: string; lost: string | null; name: string; icon: string } {
  const [, kind, who] = f.id.split(':');
  if (kind === 'lost' && LOST[who]) return { kind, lost: who, name: `${VILLAGER[who]?.name ?? 'A villager'}'s ${LOST[who].thing}`, icon: LOST[who].icon };
  const k = FIND_KINDS[kind];
  return { kind: k ? kind : 'item', lost: null, name: k?.name ?? ITEMS[f.item]?.name ?? 'Something', icon: k?.icon ?? ITEMS[f.item]?.icon ?? 'sparkles' };
}

const VISIT_NOTES: Record<string, string[]> = {
  rosa: ['Good morning! I am popping over to your farm today. Come and find me by the farmhouse, I will be the one smelling of berries.', 'Morning, dear! I have a little favour to ask, so I am walking over to your farmhouse today. See you soon!'],
  tom: ['Ahoy there. I fancy a stroll out to your farm today. I will be waiting by the farmhouse, if you have a minute for an old sailor.', 'Morning. The fish can wait today, I am coming to see you instead. Look for me by your farmhouse.'],
  juniper: ['Hello! The light on your farm is so pretty in the morning. I will come by the farmhouse today, I hope that is all right.', 'Good morning. I would love to visit today, I have a small thing to ask. I will be by your farmhouse.'],
  pip: ['HI!! I am coming to your farm today!! I will wait by the farmhouse. Do not forget!!', 'Guess who is visiting today? ME! I will be by your farmhouse. Maybe there are shells on your farm?'],
  hazel: ['Morning! I am closing the shop for an hour and walking over to your farm. Find me by the farmhouse, I have news AND a favour.', 'Hello, dear. I will be at your farmhouse today. Do put the kettle on.'],
  bram: ['Morning. Coming by your farm today. Farmhouse. Need a hand with something.', 'Heading to your farm today. I will be by the farmhouse. Bring a smile, I will bring mine. Probably.'],
};
const WEATHER_PS: Record<string, string> = {
  sunny: '',
  rain: 'P.S. It is raining today! Anything you plant grows a little faster, and the rare fish are biting.',
  mist: 'P.S. What a misty morning. Perfect weather for a cup of tea.',
};

class DailySystem {
  get today(): typeof game.state.village.today { return game.state.village.today; }

  /** Who visits on day number `n`: a fresh shuffle of all villagers every cycle, so everyone comes equally often. */
  visitorOn(n: number, seed = game.state.seed): string {
    const len = VILLAGERS.length;
    const cycle = Math.floor(n / len);
    const order = (c: number) => {
      const r = rng(hashString(`${seed}:visitors:${c}`));
      const ids = VILLAGERS.map((v) => v.id);
      for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
      return ids;
    };
    const cur = order(cycle);
    // never the same villager two days running across the cycle boundary
    if (cur[0] === order(cycle - 1)[len - 1]) [cur[0], cur[1]] = [cur[1], cur[0]];
    return cur[((n % len) + len) % len];
  }

  /**
   * Start a new day when the local date changed: the visitor (a birthday villager comes on their birthday),
   * their request, the finds and the morning note. Waits until the first-session tutorial is done.
   */
  ensureToday(now = game.now()): boolean {
    const st = game.state;
    if (!st.player.created || !st.tutorial.done) return false;
    const day = localDay(now);
    const t = st.village.today;
    if (t.day === day) {
      // repair: a request lost to a bad save gets remade
      if (t.visitor && !t.visitorDone && !t.request) t.request = this.makeRequest(t.visitor, day);
      return false;
    }
    const n = dayNumber(day);
    const birthday = VILLAGERS.find((v) => village.isBirthday(v.id, now));
    const visitor = birthday?.id ?? this.visitorOn(n);
    st.village.today = { day, visitor, visitorDone: false, finds: [], request: this.makeRequest(visitor, day) };
    st.village.today.finds = this.makeFinds(day, visitor);
    this.sendNote(visitor, !!birthday, now);
    game.bus.emit('state:changed', {});
    return true;
  }

  /** What the visitor asks for: something the farm can make now (often a thing they like), 2-6 of it. */
  makeRequest(id: string, day: string): VisitRequest {
    const r = rng(hashString(`${game.state.seed}:request:${day}:${id}`));
    const pool = obtainableItems();
    if (!pool.length) pool.push('wheat');
    const v = VILLAGER[id];
    const liked = v ? pool.filter((i) => v.loves.includes(i) || v.likes.includes(i)) : [];
    const list = liked.length && r() < 0.5 ? liked : pool;
    const item = list[Math.floor(r() * list.length)];
    const value = ITEMS[item].sell;
    // more as the farm grows, fewer of the pricey things
    const base = 2 + Math.floor(game.level / 8) + Math.floor(r() * 2);
    const scaled = Math.round(base * (value > 150 ? 0.45 : value > 60 ? 0.7 : 1));
    const qty = Math.max(2, Math.min(6, scaled));
    // paid like an order on the board (BALANCE.md: 1.8 x value), plus the friendship
    const coins = Math.max(10, Math.round(value * qty * ECONOMY.orders.coinMult));
    const xp = Math.max(ECONOMY.orders.minXp, itemXp(item) * qty);
    return { item, qty, coins, xp };
  }

  /** The current request (made on demand if missing). */
  request(): VisitRequest | null {
    const t = this.today;
    if (!t.visitor || t.visitorDone || t.day !== localDay(game.now())) return null;
    if (!t.request || !ITEMS[t.request.item]) t.request = this.makeRequest(t.visitor, t.day);
    return t.request;
  }

  /** Is today's visitor still waiting on the farm? */
  get visitorWaiting(): boolean { return !!this.request(); }

  canGive(): boolean { const q = this.request(); return !!q && game.count(q.item) >= q.qty; }

  /** Hand over the request: items out, coins, XP and friendship in. Null if it cannot be done. */
  give(): (VisitRequest & { id: string; hearts: number; heartUp: boolean }) | null {
    const q = this.request();
    const id = this.today.visitor;
    if (!q || !game.take({ [q.item]: q.qty })) return null;
    const before = village.hearts(id);
    this.today.visitorDone = true;
    game.addCoins(q.coins);
    game.addXp(q.xp);
    village.addPoints(id, VISIT_POINTS, 'visit');
    game.incStat('visitor_requests');
    game.bus.emit('state:changed', {});
    const hearts = village.hearts(id);
    return { ...q, id, hearts, heartUp: hearts > before };
  }

  // ------------------------------------------------------------------ finds
  /** Can a find lie on this tile? Owned, empty ground (no building, path or wild spot). */
  private groundFree(x: number, z: number): boolean {
    return inMap(x, z) && game.isUnlocked(chunkOf(x, z)) && !game.occO[z * MAP + x] && !game.occB[z * MAP + x] && !game.occP[z * MAP + x];
  }
  /** Can people walk over this tile (to reach a find)? */
  private passable(x: number, z: number): boolean {
    if (!inMap(x, z) || !game.isUnlocked(chunkOf(x, z)) || game.occO[z * MAP + x]) return false;
    const uid = game.occB[z * MAP + x];
    if (!uid) return true;
    const b = game.byUid(uid);
    const def = b && BUILDING[b.type];
    return !b || !!def?.path || !!def?.gate || b.type === 'plot';
  }

  /** The farmhouse footprint [x, z, w, d], if there is one. */
  farmhouse(): [number, number, number, number] | null {
    const fh = game.buildingsOf('farmhouse')[0];
    if (!fh) return null;
    const [w, d] = rotatedSize(BUILDING.farmhouse.size, fh.rot);
    return [fh.x, fh.z, w, d];
  }

  /**
   * Empty tiles you can walk to from the farmhouse, nearest first. The ring right around the farmhouse is left
   * for the mailbox and the visitor.
   */
  freeTiles(): [number, number][] {
    const fh = this.farmhouse();
    const [fx, fz, fw, fd] = fh ?? [MAP / 2 - 1, MAP / 2 - 1, 2, 2];
    const seen = new Uint8Array(MAP * MAP);
    const queue: [number, number][] = [];
    const out: [number, number][] = [];
    for (let z = fz - 1; z <= fz + fd; z++) for (let x = fx - 1; x <= fx + fw; x++) {
      if (x >= fx && x < fx + fw && z >= fz && z < fz + fd) continue;
      if (inMap(x, z) && this.passable(x, z)) { seen[z * MAP + x] = 1; queue.push([x, z]); }
    }
    for (let i = 0; i < queue.length; i++) {
      const [x, z] = queue[i];
      const ring = x >= fx - 1 && x <= fx + fw && z >= fz - 1 && z <= fz + fd;
      if (!ring && this.groundFree(x, z)) out.push([x, z]);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (!inMap(nx, nz) || seen[nz * MAP + nx] || !this.passable(nx, nz)) continue;
        seen[nz * MAP + nx] = 1;
        queue.push([nx, nz]);
      }
    }
    return out;
  }

  private makeFinds(day: string, visitor: string): SaveFind[] {
    const r = rng(hashString(`${game.state.seed}:finds:${day}`));
    const kinds = ['shell', 'petal', 'acorn'];
    // now and then one of them is something a villager lost (never the visitor: they are here already)
    if (r() < 0.4) {
      const who = VILLAGERS.map((v) => v.id).filter((id) => id !== visitor);
      kinds[Math.floor(r() * 3)] = `lost:${who[Math.floor(r() * who.length)]}`;
    }
    const used: [number, number][] = [];
    const out: SaveFind[] = [];
    kinds.forEach((k, i) => {
      const spot = this.pickSpot(r, used, k === 'shell');
      if (!spot) return;
      used.push(spot);
      const lost = k.startsWith('lost:');
      // a lost thing has no barn item; `item` only has to be a real id for the save checks
      out.push({ id: `${i}:${k}`, item: lost ? 'acorn' : FIND_KINDS[k].item, x: spot[0], z: spot[1], taken: false });
    });
    return out;
  }

  /** A free tile not too far from the farmhouse and away from the other finds (a seashell likes a pond). */
  private pickSpot(r: () => number, used: [number, number][], wet: boolean): [number, number] | null {
    const tiles = this.freeTiles();
    if (!tiles.length) return null;
    const apart = (t: [number, number], d: number) => used.every(([x, z]) => Math.abs(x - t[0]) + Math.abs(z - t[1]) >= d);
    if (wet) {
      const ponds = game.state.buildings.filter((b) => BUILDING[b.type].group === 'water');
      const near = tiles.filter((t) => ponds.some((b) => { const [w, d] = rotatedSize(BUILDING[b.type].size, b.rot); return t[0] >= b.x - 1 && t[0] <= b.x + w && t[1] >= b.z - 1 && t[1] <= b.z + d; }) && apart(t, 3));
      if (near.length) return near[Math.floor(r() * near.length)];
    }
    // the nearest 60 tiles keep finds where people look; spread out when there is room
    const close = tiles.slice(0, 60);
    for (const d of [5, 3, 1]) {
      const ok = close.filter((t) => apart(t, d));
      if (ok.length) return ok[Math.floor(r() * ok.length)];
    }
    return null;
  }

  /** Finds still waiting to be picked up today. */
  waitingFinds(): SaveFind[] {
    const t = this.today;
    return t.day === localDay(game.now()) ? t.finds.filter((f) => !f.taken) : [];
  }

  /** Something was built on top of a find: it rolls over to a free tile nearby. */
  relocateBlocked(): boolean {
    let moved = false;
    const used: [number, number][] = this.waitingFinds().map((f) => [f.x, f.z]);
    for (const f of this.waitingFinds()) {
      if (this.groundFree(f.x, f.z)) continue;
      const r = rng(hashString(`${f.id}:${f.x}:${f.z}`));
      const spot = this.pickSpot(r, used, false);
      if (spot) { f.x = spot[0]; f.z = spot[1]; used.push(spot); } else f.taken = true; // no room left: it is gone for today
      moved = true;
    }
    return moved;
  }

  /** Pick up a find. Returns what happened, or null. */
  collect(id: string): { name: string; icon: string; item?: string; qty?: number; lost?: string; points?: number } | null {
    const f = this.waitingFinds().find((x) => x.id === id);
    if (!f) return null;
    f.taken = true;
    const info = findInfo(f);
    game.incStat('daily_finds');
    if (info.lost) {
      village.addPoints(info.lost, LOST_POINTS, 'lost_item');
      game.incStat('lost_items_returned');
      return { name: info.name, icon: info.icon, lost: info.lost, points: LOST_POINTS };
    }
    const k = FIND_KINDS[info.kind];
    game.addItem(k.item, k.qty);
    return { name: k.name, icon: k.icon, item: k.item, qty: k.qty };
  }

  // ------------------------------------------------------------------ morning note
  private sendNote(id: string, birthday: boolean, now: number): void {
    const v = VILLAGER[id];
    if (!v) return;
    // tidy: read notes older than a week go, and never more than two weeks of notes
    const week = now - 7 * 86400000;
    const m = game.state.mail;
    m.letters = m.letters.filter((l) => l.kind !== 'note' || !l.read || l.at > week);
    const notes = m.letters.filter((l) => l.kind === 'note');
    if (notes.length > 13) { const drop = new Set(notes.slice(0, notes.length - 13)); m.letters = m.letters.filter((l) => !drop.has(l)); }
    const lines = VISIT_NOTES[id] ?? [`I will visit your farm today. Find me by the farmhouse!`];
    const text = birthday ? 'It is my birthday today! I am spending it on a walk out to your farm. Come and find me by the farmhouse.' : lines[dayNumber(localDay(now)) % lines.length];
    const ps = WEATHER_PS[weatherToday(now)];
    const l = mail.send(id, birthday ? 'Birthday visit!' : 'Visiting today', `${text}${ps ? `\n\n${ps}` : ''}\n\n${v.name}`);
    l.kind = 'note';
  }
}

export const daily18 = new DailySystem();
