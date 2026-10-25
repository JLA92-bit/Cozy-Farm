/**
 * 1.29 Home Sweet Home: inside the Farmhouse. Rooms open with the Farmhouse level (home.json), furniture is bought
 * from the catalogue (or crafted, or given by villagers) into home storage and placed in a room. Everything here is
 * looks only: the home never gives XP, charm or anything else, and nothing in it is scored.
 * Kept free of three.js and UI: positions are checked by the room view (src/world/home/HomeView.ts), this file only
 * keeps them inside the room.
 */
import { FURNITURE, HOME, HOME_ROOM, PIECE, VILLAGER, type HomeRoomDef, type PieceDef } from '../data';
import { mail } from './Mail';
import { upkeep } from './Upkeep';
import { village } from './Village';
import { game } from './Game';
import { localDay } from './Progression';
import type { HomeItem, HomeLook, HomePhoto, HomeRoom, HomeState, WallStyle } from './State';
import { isFriendlyText } from './WordFilter';

const UNDO_MAX = 30;
/** positions are kept to the millimetre: small saves */
const mm = (v: number): number => Math.round(v * 1000) / 1000;
const HEX = /^#[0-9a-f]{6}$/;

export const homeUnlocked = (): boolean => game.level >= HOME.level;

/** The Farmhouse's level (1 when there is none yet). */
export function farmhouseLevel(): number {
  const fh = game.state.buildings.find((b) => b.type === 'farmhouse');
  return Math.max(1, fh?.level ?? 1);
}

export const roomOpen = (id: string): boolean => !!HOME_ROOM[id] && farmhouseLevel() >= HOME_ROOM[id].fh;
export const openRooms = (): HomeRoomDef[] => HOME.rooms.filter((r) => farmhouseLevel() >= r.fh);
/** The next room to open and the Farmhouse level it needs. */
export const nextRoom = (): HomeRoomDef | undefined => HOME.rooms.find((r) => farmhouseLevel() < r.fh);

/** A room as it starts: its look from home.json, nothing in it. */
export function freshRoom(def: HomeRoomDef): HomeRoom {
  const wall = [...def.look.wall] as WallStyle;
  return {
    size: 0, walls: [[...wall], [...wall], [...wall], [...wall]] as HomeRoom['walls'], floor: [...def.look.floor] as WallStyle,
    trim: def.look.trim, ceiling: def.look.ceiling, ...(def.look.beams ? { beams: true } : {}), items: [],
  };
}

interface Snapshot { room: string; data: HomeRoom; storage: Record<string, number> }

class Home {
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];

  /** The home state, made the first time (with the starter pieces in storage). */
  get state(): HomeState {
    const s = game.state;
    if (!s.home) s.home = { rooms: {}, storage: { ...HOME.starter }, known: Object.keys(HOME.starter), uid: 1 };
    return s.home;
  }

  /** A room's state, made on first use. Null for a room that is not open yet. */
  room(id: string): HomeRoom | null {
    const def = HOME_ROOM[id];
    if (!def || !roomOpen(id)) return null;
    const st = this.state;
    st.rooms[id] ??= freshRoom(def);
    return st.rooms[id];
  }

  /** The room to show when going inside. */
  current(): string {
    const last = this.state.last;
    return last && roomOpen(last) ? last : 'living';
  }
  setCurrent(id: string): void { if (roomOpen(id)) this.state.last = id; }

  size(id: string): { w: number; d: number } {
    const r = this.state.rooms[id];
    const s = HOME.sizes[Math.min(HOME.sizes.length - 1, r?.size ?? 0)];
    return { w: s.w, d: s.d };
  }

  roomName(id: string): string { return this.state.rooms[id]?.name || HOME_ROOM[id]?.name || 'Room'; }

  item(roomId: string, uid: number): HomeItem | undefined { return this.state.rooms[roomId]?.items.find((i) => i.u === uid); }

  stored(piece: string): number { return this.state.storage[piece] ?? 0; }
  storedTotal(): number { return Object.values(this.state.storage).reduce((a, b) => a + b, 0); }

  // ------------------------------------------------------------------------------------------- undo

  /** Remember a room (and storage) before a change, so it can be undone. */
  private remember(roomId: string): void {
    const r = this.state.rooms[roomId];
    if (!r) return;
    this.undoStack.push({ room: roomId, data: structuredClone(r), storage: { ...this.state.storage } });
    if (this.undoStack.length > UNDO_MAX) this.undoStack.shift();
    this.redoStack = [];
  }
  canUndo(roomId: string): boolean { return this.undoStack.some((s) => s.room === roomId); }
  canRedo(roomId: string): boolean { return this.redoStack.some((s) => s.room === roomId); }
  undo(roomId: string): boolean { return this.swap(roomId, this.undoStack, this.redoStack); }
  redo(roomId: string): boolean { return this.swap(roomId, this.redoStack, this.undoStack); }
  private swap(roomId: string, from: Snapshot[], to: Snapshot[]): boolean {
    const i = from.map((s) => s.room).lastIndexOf(roomId);
    if (i < 0) return false;
    const [snap] = from.splice(i, 1);
    const st = this.state;
    to.push({ room: roomId, data: structuredClone(st.rooms[roomId]), storage: { ...st.storage } });
    st.rooms[roomId] = snap.data;
    st.storage = snap.storage;
    this.changed(roomId);
    return true;
  }
  /** Forget the undo history (leaving the home). */
  clearHistory(): void { this.undoStack = []; this.redoStack = []; }

  private changed(room: string): void { game.bus.emit('home:changed', { room }); }

  // ------------------------------------------------------------------------------------------- placing

  /** Take a piece out of storage and put it in a room. Returns the new item. */
  place(roomId: string, piece: string, at: { x: number; z: number; y?: number; r?: number; w?: number; on?: number }, colours?: Record<string, string>): HomeItem | null {
    const r = this.room(roomId);
    const def = PIECE[piece];
    if (!r || !def || this.stored(piece) <= 0 || r.items.length >= HOME.maxItems) return null;
    this.remember(roomId);
    const st = this.state;
    st.storage[piece] -= 1;
    if (st.storage[piece] <= 0) delete st.storage[piece];
    const it: HomeItem = { u: st.uid++, f: piece, x: mm(at.x), z: mm(at.z), r: ((at.r ?? 0) % 4 + 4) % 4 };
    if (at.y) it.y = mm(at.y);
    if (at.w !== undefined) it.w = at.w;
    if (at.on !== undefined) it.on = at.on;
    if (colours && Object.keys(colours).length) it.c = { ...colours };
    // rugs go under everything: first in the list is drawn lowest
    if (def.kind === 'rug') r.items.unshift(it); else r.items.push(it);
    this.changed(roomId);
    return it;
  }

  /** Every piece standing on this one (and on those, and so on). */
  riders(roomId: string, uid: number): HomeItem[] {
    const items = this.state.rooms[roomId]?.items ?? [];
    const out: HomeItem[] = [];
    const walk = (u: number) => { for (const i of items) if (i.on === u) { out.push(i); walk(i.u); } };
    walk(uid);
    return out;
  }

  /**
   * Move a piece (and whatever stands on it, which keeps its place on top). `remember` false while dragging, so a
   * whole drag is one undo step (the drag start remembers).
   */
  move(roomId: string, uid: number, to: { x: number; z: number; y?: number; r?: number; w?: number; on?: number | null; s?: number }, remember = true, carry = true): boolean {
    const r = this.state.rooms[roomId];
    const it = r?.items.find((i) => i.u === uid);
    if (!r || !it) return false;
    if (remember) this.remember(roomId);
    const dx = to.x - it.x, dz = to.z - it.z, dy = (to.y ?? 0) - (it.y ?? 0);
    const turn = to.r === undefined ? 0 : ((to.r - it.r) % 4 + 4) % 4;
    // the room view carries riders itself when it knows the shapes (wall shelves): carry = false
    for (const rider of carry ? this.riders(roomId, uid) : []) {
      // riders turn with their base, round its centre
      let ox = rider.x - it.x, oz = rider.z - it.z;
      for (let k = 0; k < turn; k++) [ox, oz] = [oz, -ox];
      rider.x = mm(it.x + dx + ox); rider.z = mm(it.z + dz + oz);
      rider.y = mm(Math.max(0, (rider.y ?? 0) + dy)) || undefined;
      rider.r = (rider.r + turn) % 4;
      if (to.w !== undefined && rider.w !== undefined) rider.w = to.w;
    }
    it.x = mm(to.x); it.z = mm(to.z);
    it.y = to.y ? mm(to.y) : undefined;
    if (to.r !== undefined) it.r = ((to.r % 4) + 4) % 4;
    if (to.w !== undefined) it.w = to.w;
    if (to.on === null) delete it.on; else if (to.on !== undefined) it.on = to.on;
    if (to.s !== undefined) { const k = clampScale(to.s); if (k === 1) delete it.s; else it.s = k; }
    this.changed(roomId);
    return true;
  }

  /** Start of a drag: one undo step for the whole drag. */
  beginDrag(roomId: string): void { this.remember(roomId); }

  /** Put a piece (and everything on it) back in storage. */
  store(roomId: string, uid: number): number {
    const r = this.state.rooms[roomId];
    const it = r?.items.find((i) => i.u === uid);
    if (!r || !it) return 0;
    this.remember(roomId);
    const gone = [it, ...this.riders(roomId, uid)];
    const ids = new Set(gone.map((g) => g.u));
    r.items = r.items.filter((i) => !ids.has(i.u));
    for (const g of gone) this.state.storage[g.f] = (this.state.storage[g.f] ?? 0) + 1;
    this.changed(roomId);
    return gone.length;
  }

  /** Everything in a room back to storage. */
  clearRoom(roomId: string): number {
    const r = this.state.rooms[roomId];
    if (!r?.items.length) return 0;
    this.remember(roomId);
    for (const i of r.items) this.state.storage[i.f] = (this.state.storage[i.f] ?? 0) + 1;
    const n = r.items.length;
    r.items = [];
    this.changed(roomId);
    return n;
  }

  /** Another of the same piece with the same colours, from storage (bought if there is none and coins allow). */
  duplicate(roomId: string, uid: number, at: { x: number; z: number; y?: number; r?: number; w?: number; on?: number }): HomeItem | null {
    const it = this.item(roomId, uid);
    if (!it) return null;
    if (this.stored(it.f) <= 0 && !this.buy(it.f)) return null;
    const copy = this.place(roomId, it.f, { ...at, r: at.r ?? it.r, w: at.w ?? it.w }, it.c);
    if (copy && it.off) copy.off = true;
    if (copy && it.s) copy.s = it.s;
    return copy;
  }

  /** Move every piece by a step (rugs and all), keeping each inside the room. */
  shiftAll(roomId: string, dx: number, dz: number): void {
    const r = this.state.rooms[roomId];
    if (!r?.items.length) return;
    this.remember(roomId);
    // pieces on the walls stay put, and so does whatever stands on their shelves
    const onWall = (i: HomeItem): boolean => { const b = i.on === undefined ? undefined : r.items.find((x) => x.u === i.on); return !!b && (b.w !== undefined || onWall(b)); };
    for (const i of r.items) if (i.w === undefined && !onWall(i)) { i.x = mm(i.x + dx); i.z = mm(i.z + dz); }
    this.changed(roomId);
  }

  // ------------------------------------------------------------------------------------------- looks

  /** Change one piece's colours (null clears them back to the piece's own). */
  setColours(roomId: string, uid: number, colours: Record<string, string> | null, remember = true): void {
    const it = this.item(roomId, uid);
    if (!it) return;
    if (remember) this.remember(roomId);
    const clean = colours ? Object.fromEntries(Object.entries(colours).filter(([, v]) => HEX.test(v))) : {};
    if (Object.keys(clean).length) it.c = clean; else delete it.c;
    this.changed(roomId);
  }

  toggleLamp(roomId: string, uid: number): boolean {
    const it = this.item(roomId, uid);
    if (!it || !PIECE[it.f]?.lamp) return false;
    if (it.off) delete it.off; else it.off = true;
    this.changed(roomId);
    return !it.off;
  }

  /** 1.30 a patterned rug's pattern and its two colours (the border stays in the colours as "border"). */
  setRugPattern(roomId: string, uid: number, pat: string, a: string, b: string, remember = true): void {
    const it = this.item(roomId, uid);
    if (!it || !PIECE[it.f]?.patterned || !validPattern(pat) || !HEX.test(a) || !HEX.test(b)) return;
    if (remember) this.remember(roomId);
    it.pat = pat;
    it.c = { ...(it.c ?? {}), a, b };
    this.changed(roomId);
  }

  // ------------------------------------------------------------------------------------------- 1.30.4 photos

  /** Keep a photo for the home (a small JPEG data URL). Null when the album is full or the picture is unusable. */
  addPhoto(d: string): HomePhoto | null {
    const st = this.state;
    if (!validPhoto(d) || (st.photos?.length ?? 0) >= PHOTO_MAX) return null;
    const p = { id: st.uid++, d };
    (st.photos ??= []).push(p);
    this.changed('');
    return p;
  }
  photo(id: number): HomePhoto | undefined { return this.state.photos?.find((p) => p.id === id); }
  /** Let a photo go: every frame showing it (in rooms and saved looks) goes back to the painting. */
  removePhoto(id: number): void {
    const st = this.state;
    if (!st.photos?.some((p) => p.id === id)) return;
    st.photos = st.photos.filter((p) => p.id !== id);
    const key = `photo:${id}`;
    for (const r of Object.values(st.rooms)) for (const list of [r.items, ...(r.looks ?? []).map((l) => l?.items ?? [])]) for (const it of list) if (it.show === key) delete it.show;
    this.changed('');
  }

  setShow(roomId: string, uid: number, show: string | null): void {
    const it = this.item(roomId, uid);
    if (!it) return;
    this.remember(roomId);
    if (show) it.show = show; else delete it.show;
    this.changed(roomId);
  }

  /** A wall's style; wall 'all' sets all four. */
  setWall(roomId: string, wall: number | 'all', style: WallStyle, remember = true): void {
    const r = this.room(roomId);
    if (!r) return;
    if (remember) this.remember(roomId);
    for (let i = 0; i < 4; i++) if (wall === 'all' || wall === i) r.walls[i] = [...style] as WallStyle;
    this.changed(roomId);
  }
  setFloor(roomId: string, style: WallStyle, remember = true): void {
    const r = this.room(roomId);
    if (!r) return;
    if (remember) this.remember(roomId);
    r.floor = [...style] as WallStyle;
    this.changed(roomId);
  }
  setWainscot(roomId: string, w: HomeRoom['wainscot'] | null, remember = true): void {
    const r = this.room(roomId);
    if (!r) return;
    if (remember) this.remember(roomId);
    if (w) r.wainscot = { ...w, h: Math.min(0.7, Math.max(0.2, w.h)) }; else delete r.wainscot;
    this.changed(roomId);
  }
  setTrim(roomId: string, colour: string, remember = true): void { this.setRoomField(roomId, (r) => { r.trim = colour; }, remember); }
  setCeiling(roomId: string, colour: string, remember = true): void { this.setRoomField(roomId, (r) => { r.ceiling = colour; }, remember); }
  setBeams(roomId: string, on: boolean): void { this.setRoomField(roomId, (r) => { if (on) r.beams = true; else delete r.beams; }, true); }
  /** False when the name was refused (friends see room names, so the word filter applies). */
  rename(roomId: string, name: string): boolean {
    const clean = name.replace(/\s+/g, ' ').trim().slice(0, 24);
    if (!isFriendlyText(clean)) return false;
    this.setRoomField(roomId, (r) => { if (clean && clean !== HOME_ROOM[roomId]?.name) r.name = clean; else delete r.name; }, false);
    return true;
  }
  private setRoomField(roomId: string, fn: (r: HomeRoom) => void, remember: boolean): void {
    const r = this.room(roomId);
    if (!r) return;
    if (remember) this.remember(roomId);
    fn(r);
    this.changed(roomId);
  }

  /** The room's look as it was when its def started (walls, floor, trim, ceiling; furniture stays). */
  resetLook(roomId: string): void {
    const def = HOME_ROOM[roomId];
    const r = this.room(roomId);
    if (!def || !r) return;
    this.remember(roomId);
    const fresh = freshRoom(def);
    r.walls = fresh.walls; r.floor = fresh.floor; r.trim = fresh.trim; r.ceiling = fresh.ceiling;
    if (fresh.beams) r.beams = true; else delete r.beams;
    delete r.wainscot;
    this.changed(roomId);
  }

  // ------------------------------------------------------------------------------------------- saved looks

  /** Pieces kept in saved looks across the whole home (they share a budget, home.json lookItems). */
  lookItems(except?: { room: string; slot: number }): number {
    let n = 0;
    for (const [id, r] of Object.entries(this.state.rooms)) r.looks?.forEach((l, i) => { if (l && !(except && except.room === id && except.slot === i)) n += l.items.length; });
    return n;
  }

  /** Keep the room as a look. False when the looks would hold more pieces than the budget allows. */
  saveLook(roomId: string, slot: number, name: string): boolean {
    const r = this.room(roomId);
    if (!r || slot < 0 || slot > 2) return false;
    if (this.lookItems({ room: roomId, slot }) + r.items.length > HOME.lookItems) return false;
    r.looks ??= [null, null, null];
    r.looks[slot] = {
      name: name.trim().slice(0, 24) || `Look ${slot + 1}`, walls: structuredClone(r.walls), floor: [...r.floor] as WallStyle, trim: r.trim, ceiling: r.ceiling,
      ...(r.beams ? { beams: true } : {}), ...(r.wainscot ? { wainscot: { ...r.wainscot } } : {}), items: structuredClone(r.items),
    };
    this.changed(roomId);
    return true;
  }

  deleteLook(roomId: string, slot: number): void {
    const r = this.room(roomId);
    if (!r?.looks?.[slot]) return;
    r.looks[slot] = null;
    this.changed(roomId);
  }

  /**
   * Put a saved look back: walls and floor as saved, the furniture now in the room back to storage, then the saved
   * pieces out of storage again. Pieces no longer in storage are left out. Returns how many were left out.
   */
  applyLook(roomId: string, slot: number): number {
    const r = this.room(roomId);
    const look: HomeLook | null | undefined = r?.looks?.[slot];
    if (!r || !look) return 0;
    this.remember(roomId);
    const st = this.state;
    for (const i of r.items) st.storage[i.f] = (st.storage[i.f] ?? 0) + 1;
    r.walls = structuredClone(look.walls); r.floor = [...look.floor] as WallStyle; r.trim = look.trim; r.ceiling = look.ceiling;
    if (look.beams) r.beams = true; else delete r.beams;
    if (look.wainscot) r.wainscot = { ...look.wainscot }; else delete r.wainscot;
    const items: HomeItem[] = [];
    const placed = new Set<number>();
    let missing = 0;
    for (const i of look.items) {
      if ((st.storage[i.f] ?? 0) <= 0 || (i.on !== undefined && !placed.has(i.on))) { missing++; continue; }
      st.storage[i.f] -= 1;
      if (st.storage[i.f] <= 0) delete st.storage[i.f];
      const copy = structuredClone(i);
      copy.u = st.uid++;
      // pieces on top point at their base's new uid
      if (i.on !== undefined) copy.on = items.find((x) => (x as HomeItem & { _old?: number })._old === i.on)?.u;
      (copy as HomeItem & { _old?: number })._old = i.u;
      placed.add(i.u);
      items.push(copy);
    }
    for (const i of items) delete (i as HomeItem & { _old?: number })._old;
    r.items = items;
    this.changed(roomId);
    return missing;
  }

  // ------------------------------------------------------------------------------------------- rooms

  /** Coins to make a room the next size up (null when it is as big as it gets). */
  enlargeCost(roomId: string): number | null {
    const r = this.room(roomId);
    if (!r || r.size >= HOME.sizes.length - 1) return null;
    return HOME.sizes[r.size + 1].coins;
  }
  enlarge(roomId: string): boolean {
    const r = this.room(roomId);
    const cost = this.enlargeCost(roomId);
    if (!r || cost === null || !game.spend(cost)) return false;
    // the room grows round its middle: pieces against the old walls move out with them
    const old = HOME.sizes[r.size], next = HOME.sizes[r.size + 1];
    const gx = (next.w - old.w) / 2, gz = (next.d - old.d) / 2;
    for (const i of r.items) {
      if (i.w !== undefined) continue;
      if (Math.abs(i.x) > old.w / 2 - 0.6) i.x += Math.sign(i.x) * gx;
      if (Math.abs(i.z) > old.d / 2 - 0.6) i.z += Math.sign(i.z) * gz;
    }
    r.size += 1;
    this.undoStack = this.undoStack.filter((s) => s.room !== roomId);
    this.redoStack = this.redoStack.filter((s) => s.room !== roomId);
    this.changed(roomId);
    return true;
  }

  // ------------------------------------------------------------------------------------------- catalogue

  /** Today's six pieces at a discount (the same for everyone on a day; every piece is always on sale anyway). */
  picks(now = game.now()): string[] {
    const day = localDay(now);
    let h = 2166136261;
    for (const ch of day) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    const pool = FURNITURE.filter((p) => !p.gift && !p.craft).map((p) => p.id);
    const out: string[] = [];
    while (out.length < Math.min(HOME.picks, pool.length)) {
      h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
      const id = pool[h % pool.length];
      if (!out.includes(id)) out.push(id);
    }
    return out;
  }

  /** What a piece costs today. Gift-only pieces can be bought again once known. */
  price(piece: string): number {
    const def = PIECE[piece];
    if (!def) return 0;
    return this.picks().includes(piece) ? Math.round(def.price * (1 - HOME.discount)) : def.price;
  }

  /** Can this piece be bought right now (crafted pieces are made, gift pieces once given). */
  buyable(def: PieceDef): boolean { return !def.craft && (!def.gift || this.state.known.includes(def.id)); }

  buy(piece: string, n = 1): boolean {
    const def = PIECE[piece];
    if (!def || n < 1 || !this.buyable(def)) return false;
    if (!game.spend(this.price(piece) * n)) return false;
    this.give(piece, n);
    return true;
  }

  /** Into storage and the catalogue (bought, crafted or a gift). */
  give(piece: string, n = 1): void {
    if (!PIECE[piece]) return;
    const st = this.state;
    st.storage[piece] = (st.storage[piece] ?? 0) + n;
    if (!st.known.includes(piece)) st.known.push(piece);
    this.changed('');
  }

  // ------------------------------------------------------------------------------------------- crafting

  /** Crafted pieces are made at the Carpenter's Workshop. */
  canCraftHere(): boolean { return upkeep.hasCarpenter(); }

  /** What is still missing to make a crafted piece (item -> how many more), empty when it can be made. */
  craftShort(piece: string): Record<string, number> {
    const def = PIECE[piece];
    const out: Record<string, number> = {};
    for (const [it, n] of Object.entries(def?.craft ?? {})) { const have = game.state.inventory[it] ?? 0; if (have < n) out[it] = n - have; }
    return out;
  }

  craft(piece: string): boolean {
    const def = PIECE[piece];
    if (!def?.craft || !this.canCraftHere() || Object.keys(this.craftShort(piece)).length || !game.canAfford(def.price)) return false;
    for (const [it, n] of Object.entries(def.craft)) game.addItem(it, -n);
    game.spend(def.price);
    this.give(piece);
    return true;
  }

  // ------------------------------------------------------------------------------------------- villagers' sets

  /** Gift pieces whose hearts have been reached, sent once each, with one letter per villager. Returns the pieces sent now. */
  sendGifts(): string[] {
    if (!homeUnlocked()) return [];
    const st = this.state;
    st.gifts ??= [];
    const sent: string[] = [];
    const byWho = new Map<string, string[]>();
    for (const def of FURNITURE) {
      if (!def.gift || st.gifts.includes(def.id) || village.hearts(def.gift) < (def.hearts ?? 99)) continue;
      st.gifts.push(def.id);
      this.give(def.id);
      sent.push(def.id);
      byWho.set(def.gift, [...(byWho.get(def.gift) ?? []), def.name.replace(/^.*'s /, '').toLowerCase()]);
    }
    const farmer = game.state.player.name || 'friend';
    for (const [who, names] of byWho) {
      const v = VILLAGER[who];
      if (!v) continue;
      const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
      mail.send(who, 'Something for your home', `Dear ${farmer},\n\nI made ${names.length > 1 ? 'a few things' : 'a little something'} for the Farmhouse: my ${list}. ${names.length > 1 ? "They're" : "It's"} waiting in your home storage. I hope ${names.length > 1 ? 'they find' : 'it finds'} a cosy spot!\n\n${v.name}`);
    }
    return sent;
  }

  /** Sell a stored piece back for half. */
  sellBack(piece: string): boolean {
    const def = PIECE[piece];
    if (!def || this.stored(piece) <= 0) return false;
    this.state.storage[piece] -= 1;
    if (this.state.storage[piece] <= 0) delete this.state.storage[piece];
    game.addCoins(Math.floor(def.price / 2));
    this.changed('');
    return true;
  }
}

export const home = new Home();

/** Save repair (src/systems/Save.ts): known rooms and pieces only, numbers finite, colours as #rrggbb. */
export function repairHome(v: unknown): HomeState | undefined {
  if (!isObj(v)) return undefined;
  const num = (x: unknown, d = 0) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
  const colour = (x: unknown, d: string) => (typeof x === 'string' && HEX.test(x) ? x : d);
  const pat = (x: unknown, list: { id: string }[], d: string) => (typeof x === 'string' && list.some((p) => p.id === x) ? x : d);
  const style = (x: unknown, list: { id: string }[], d: WallStyle): WallStyle => (Array.isArray(x) ? [pat(x[0], list, d[0]), colour(x[1], d[1]), colour(x[2], d[2])] : [...d] as WallStyle);
  const storage: Record<string, number> = {};
  if (isObj(v.storage)) for (const [k, n] of Object.entries(v.storage)) if (PIECE[k] && num(n) >= 1) storage[k] = Math.floor(num(n));
  let uid = Math.max(1, Math.floor(num(v.uid, 1)));
  const rooms: Record<string, HomeRoom> = {};
  const items = (list: unknown, max: { w: number; d: number }): HomeItem[] => {
    const out: HomeItem[] = [];
    const seen = new Set<number>();
    for (const x of Array.isArray(list) ? list : []) {
      if (!isObj(x) || typeof x.f !== 'string' || !PIECE[x.f] || out.length >= HOME.maxItems) continue;
      let u = Math.floor(num(x.u, 0));
      if (u < 1 || seen.has(u)) u = uid++;
      uid = Math.max(uid, u + 1);
      seen.add(u);
      const it: HomeItem = { u, f: x.f, x: Math.max(-max.w / 2, Math.min(max.w / 2, num(x.x))), z: Math.max(-max.d / 2, Math.min(max.d / 2, num(x.z))), r: ((Math.floor(num(x.r)) % 4) + 4) % 4 };
      const y = num(x.y);
      if (y > 0) it.y = Math.min(HOME.wallHeight, y);
      if (Number.isInteger(x.w) && (x.w as number) >= 0 && (x.w as number) <= 3) it.w = x.w as number;
      if (Number.isInteger(x.on)) it.on = x.on as number;
      if (isObj(x.c)) { const c = Object.fromEntries(Object.entries(x.c).filter(([, h]) => typeof h === 'string' && HEX.test(h))); if (Object.keys(c).length) it.c = c as Record<string, string>; }
      if (x.off === true) it.off = true;
      if (typeof x.show === 'string' && x.show.length <= 40) it.show = x.show;
      if (typeof x.pat === 'string' && validPattern(x.pat)) it.pat = x.pat;
      const k = clampScale(num(x.s, 1));
      if (k !== 1) it.s = k;
      out.push(it);
    }
    // a piece standing on one that is gone drops to the floor
    const ids = new Set(out.map((i) => i.u));
    for (const i of out) if (i.on !== undefined && (!ids.has(i.on) || i.on === i.u)) { delete i.on; if (i.w === undefined) delete i.y; }
    return out;
  };
  if (isObj(v.rooms)) for (const [id, raw] of Object.entries(v.rooms)) {
    const def = HOME_ROOM[id];
    if (!def || !isObj(raw)) continue;
    const fresh = freshRoom(def);
    const size = Math.max(0, Math.min(HOME.sizes.length - 1, Math.floor(num(raw.size))));
    const dims = HOME.sizes[size];
    const walls = [0, 1, 2, 3].map((i) => style(Array.isArray(raw.walls) ? raw.walls[i] : null, HOME.wallPatterns, fresh.walls[i])) as HomeRoom['walls'];
    const room: HomeRoom = { size, walls, floor: style(raw.floor, HOME.floorPatterns, fresh.floor), trim: colour(raw.trim, fresh.trim), ceiling: colour(raw.ceiling, fresh.ceiling), items: items(raw.items, dims) };
    if (typeof raw.name === 'string' && raw.name.trim()) room.name = raw.name.trim().slice(0, 24);
    if (raw.beams === true) room.beams = true;
    if (isObj(raw.wainscot)) room.wainscot = { p: pat(raw.wainscot.p, HOME.wallPatterns, 'panelling'), a: colour(raw.wainscot.a, '#f7f1e3'), b: colour(raw.wainscot.b, '#e7d3b3'), h: Math.min(0.7, Math.max(0.2, num(raw.wainscot.h, 0.4))) };
    if (Array.isArray(raw.looks)) room.looks = [0, 1, 2].map((i) => {
      const l = (raw.looks as unknown[])[i];
      if (!isObj(l)) return null;
      return {
        name: typeof l.name === 'string' ? l.name.slice(0, 24) : `Look ${i + 1}`,
        walls: [0, 1, 2, 3].map((k) => style(Array.isArray(l.walls) ? l.walls[k] : null, HOME.wallPatterns, fresh.walls[k])) as HomeRoom['walls'],
        floor: style(l.floor, HOME.floorPatterns, fresh.floor), trim: colour(l.trim, fresh.trim), ceiling: colour(l.ceiling, fresh.ceiling),
        ...(l.beams === true ? { beams: true } : {}), items: items(l.items, dims),
      };
    });
    rooms[id] = room;
  }
  const known = [...new Set(Array.isArray(v.known) ? v.known.filter((k): k is string => typeof k === 'string' && !!PIECE[k]) : [])];
  const out: HomeState = { rooms, storage, known, uid };
  if (Array.isArray(v.photos)) {
    const seen = new Set<number>();
    const photos = v.photos.filter((p): p is HomePhoto => isObj(p) && Number.isInteger(p.id) && (p.id as number) > 0 && validPhoto(p.d) && !seen.has(p.id as number) && !!seen.add(p.id as number)).slice(0, PHOTO_MAX).map((p) => ({ id: p.id, d: p.d }));
    if (photos.length) { out.photos = photos; out.uid = Math.max(out.uid, ...photos.map((p) => p.id + 1)); }
  }
  if (Array.isArray(v.gifts)) out.gifts = [...new Set(v.gifts.filter((k): k is string => typeof k === 'string' && !!PIECE[k]?.gift))];
  if (typeof v.last === 'string' && HOME_ROOM[v.last]) out.last = v.last;
  return out;
}

/** 1.30.2 how far a piece can be made smaller or bigger, and the step the buttons take. */
export const SCALE_MIN = 0.5;
export const SCALE_MAX = 1.5;
export const SCALE_STEP = 0.1;
export function clampScale(k: number): number {
  if (!Number.isFinite(k)) return 1;
  return Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, k)) * 20) / 20;
}

/** 1.30.4 photos kept for the home: how many, and how big each may be (keeps cloud saves and shared homes small). */
export const PHOTO_MAX = 6;
export const PHOTO_CHARS = 20000;
export function validPhoto(d: unknown): d is string {
  return typeof d === 'string' && d.length <= PHOTO_CHARS && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(d);
}

/** A rug pattern id: "floor:<id>" or "wall:<id>" from home.json. */
export function validPattern(p: string): boolean {
  const [kind, id] = p.split(':');
  return (kind === 'floor' && HOME.floorPatterns.some((x) => x.id === id)) || (kind === 'wall' && HOME.wallPatterns.some((x) => x.id === id));
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
