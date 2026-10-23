import * as THREE from 'three';
import { PIECE } from '../../data';
import { Character } from '../Character';
import type { CharacterLook } from '../../systems/State';
import { pieceGeoNow } from './FurnitureGeo';
import type { HomeView } from './HomeView';
import type { HomeItem } from '../../systems/State';

/**
 * 1.30 people in the home: the player's farmer, villagers who drop in and friends over for coffee. They walk on a
 * fine grid of the room that leaves out every piece standing on the floor (rugs are walkable), find their way round
 * furniture with A*, and sit on chairs, sofas, benches and beds. Nobody ever stands inside or floats over a piece:
 * when furniture is put down on someone, they step to the nearest free spot.
 */

const CELL = 0.2;
/** how far people keep from furniture and walls (about a body's half width) */
const CLEAR = 0.14;
/** people are a bit smaller than on the farm, to suit the furniture */
export const HOME_SCALE = 0.66;
/** the sit pose puts the hips this far above the character's feet */
const SIT_HIPS = 0.17;

export interface Seat { uid: number; slot: number; x: number; z: number; y: number; yaw: number; fx: number; fz: number }

/** The walkable grid of a room. */
export class HomeNav {
  w = 0; d = 0; cols = 0; rows = 0;
  private blocked = new Uint8Array(0);

  constructor(private view: HomeView) {}

  /** Rebuild from the room's furniture (call after anything moves). */
  rebuild(): void {
    const { w, d } = this.view.dims;
    this.w = w; this.d = d;
    this.cols = Math.max(1, Math.floor(w / CELL));
    this.rows = Math.max(1, Math.floor(d / CELL));
    this.blocked = new Uint8Array(this.cols * this.rows);
    // the walls
    for (let c = 0; c < this.cols; c++) for (let r = 0; r < this.rows; r++) {
      const [x, z] = this.centre(c, r);
      if (Math.abs(x) > w / 2 - CLEAR || Math.abs(z) > d / 2 - CLEAR) this.blocked[r * this.cols + c] = 1;
    }
    for (const it of this.view.room?.items ?? []) {
      const def = PIECE[it.f];
      if (!def || def.kind === 'rug' || def.kind === 'ceiling' || it.on !== undefined) continue;
      const box = this.view.worldBox(it);
      if (!box) continue;
      // wall pieces only block when they come down near the floor (a low basin, a door frame)
      if (it.w !== undefined && box.min.y > 0.6) continue;
      this.blockBox(box.min.x - CLEAR, box.min.z - CLEAR, box.max.x + CLEAR, box.max.z + CLEAR);
    }
  }

  private blockBox(x0: number, z0: number, x1: number, z1: number): void {
    const c0 = Math.max(0, Math.floor((x0 + this.w / 2) / CELL)), c1 = Math.min(this.cols - 1, Math.floor((x1 + this.w / 2) / CELL));
    const r0 = Math.max(0, Math.floor((z0 + this.d / 2) / CELL)), r1 = Math.min(this.rows - 1, Math.floor((z1 + this.d / 2) / CELL));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.blocked[r * this.cols + c] = 1;
  }

  centre(c: number, r: number): [number, number] { return [-this.w / 2 + (c + 0.5) * CELL, -this.d / 2 + (r + 0.5) * CELL]; }
  cellOf(x: number, z: number): [number, number] {
    return [THREE.MathUtils.clamp(Math.floor((x + this.w / 2) / CELL), 0, this.cols - 1), THREE.MathUtils.clamp(Math.floor((z + this.d / 2) / CELL), 0, this.rows - 1)];
  }
  free(c: number, r: number): boolean { return c >= 0 && r >= 0 && c < this.cols && r < this.rows && !this.blocked[r * this.cols + c]; }
  freeAt(x: number, z: number): boolean { const [c, r] = this.cellOf(x, z); return this.free(c, r); }

  /** The free spot nearest a point (spiralling out), or null in a room with no floor left. */
  nearestFree(x: number, z: number): [number, number] | null {
    const [c0, r0] = this.cellOf(x, z);
    for (let rad = 0; rad < Math.max(this.cols, this.rows); rad++) {
      let best: [number, number] | null = null, bestD = Infinity;
      for (let dc = -rad; dc <= rad; dc++) for (let dr = -rad; dr <= rad; dr++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad || !this.free(c0 + dc, r0 + dr)) continue;
        const [cx, cz] = this.centre(c0 + dc, r0 + dr);
        const dd = (cx - x) ** 2 + (cz - z) ** 2;
        if (dd < bestD) { bestD = dd; best = [cx, cz]; }
      }
      if (best) return best;
    }
    return null;
  }

  /** A path of points from one spot to another round the furniture (8 directions, no corner cutting). */
  path(fx: number, fz: number, tx: number, tz: number): [number, number][] | null {
    const start = this.nearestFree(fx, fz), goal = this.nearestFree(tx, tz);
    if (!start || !goal) return null;
    const [sc, sr] = this.cellOf(start[0], start[1]), [gc, gr] = this.cellOf(goal[0], goal[1]);
    const N = this.cols * this.rows, idx = (c: number, r: number) => r * this.cols + c;
    const g = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const open: number[] = [idx(sc, sr)];
    g[idx(sc, sr)] = 0;
    const h = (i: number) => { const c = i % this.cols, r = (i / this.cols) | 0; const dx = Math.abs(c - gc), dz = Math.abs(r - gr); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    let guard = 0;
    while (open.length && guard++ < 20000) {
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (g[open[k]] + h(open[k]) < g[open[bi]] + h(open[bi])) bi = k;
      const cur = open.splice(bi, 1)[0];
      if (cur === idx(gc, gr)) break;
      closed[cur] = 1;
      const cc = cur % this.cols, cr = (cur / this.cols) | 0;
      for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
        if (!dc && !dr) continue;
        const nc = cc + dc, nr = cr + dr;
        if (!this.free(nc, nr) || (dc && dr && (!this.free(cc + dc, cr) || !this.free(cc, cr + dr)))) continue;
        const ni = idx(nc, nr);
        if (closed[ni]) continue;
        const ng = g[cur] + (dc && dr ? 1.414 : 1);
        if (ng < g[ni]) { g[ni] = ng; came[ni] = cur; if (!open.includes(ni)) open.push(ni); }
      }
    }
    const end = idx(gc, gr);
    if (end !== idx(sc, sr) && came[end] < 0) return null;
    const cells: number[] = [];
    for (let i = end; i !== -1 && cells.length < N; i = i === idx(sc, sr) ? -1 : came[i]) cells.push(i);
    cells.reverse();
    // keep only the turns (straight runs become one step)
    const pts = cells.map((i) => this.centre(i % this.cols, (i / this.cols) | 0));
    const out: [number, number][] = [];
    for (let k = 0; k < pts.length; k++) {
      if (k > 0 && k < pts.length - 1) {
        const [ax, az] = pts[k - 1], [bx, bz] = pts[k], [cx, cz] = pts[k + 1];
        if (Math.abs((bx - ax) * (cz - bz) - (bz - az) * (cx - bx)) < 1e-6) continue;
      }
      out.push(pts[k]);
    }
    return out;
  }

  /** Every place to sit in the room: chairs have one, sofas, benches and beds one per half metre of width. */
  seats(): Seat[] {
    const out: Seat[] = [];
    for (const it of this.view.room?.items ?? []) {
      const def = PIECE[it.f];
      const geo = pieceGeoNow(it.f);
      if (!def?.seat || !geo || it.on !== undefined) continue;
      const yaw = (it.r * Math.PI) / 2;
      const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const sc = it.s ?? 1, size = geo.size.clone().multiplyScalar(sc);
      const seatY = (geo.levels.find((l) => l >= 0.12 && l <= 0.6) ?? geo.size.y * 0.5) * sc;
      const n = Math.max(1, Math.min(4, Math.floor(size.x / 0.42)));
      for (let k = 0; k < n; k++) {
        const along = (k - (n - 1) / 2) * (size.x / n);
        const x = it.x + rx * along + fx * size.z * 0.08, z = it.z + rz * along + fz * size.z * 0.08;
        out.push({ uid: it.u, slot: k, x, z, y: seatY, yaw, fx: x + fx * (size.z / 2 + 0.22), fz: z + fz * (size.z / 2 + 0.22) });
      }
    }
    return out;
  }
}

/** Someone in the home: walks a path, sits and stands, says things. */
export class HomeChar {
  path: [number, number][] = [];
  speed = 0.9;
  seat: Seat | null = null;
  private onArrive: (() => void) | null = null;
  idle = 0;
  readonly id: string;

  private constructor(readonly char: Character, readonly parent: THREE.Object3D, id: string) {
    this.id = id;
    parent.add(char.root);
  }

  static async create(look: CharacterLook, parent: THREE.Object3D, id: string): Promise<HomeChar> {
    const c = await Character.create({ ...look, pet: 'none' }, HOME_SCALE);
    return new HomeChar(c, parent, id);
  }

  get pos(): THREE.Vector3 { return this.char.root.position; }
  get walking(): boolean { return this.path.length > 0; }

  placeAt(x: number, z: number): void { this.pos.set(x, 0, z); }

  /** Walk to a point round the furniture. False when there is no way there. */
  walkTo(nav: HomeNav, x: number, z: number, onArrive?: () => void): boolean {
    this.standUp(nav);
    const p = nav.path(this.pos.x, this.pos.z, x, z);
    if (!p) return false;
    this.path = p.slice(1);
    this.onArrive = onArrive ?? null;
    if (!this.path.length) { const cb = this.onArrive; this.onArrive = null; cb?.(); }
    return true;
  }

  /** Walk to a seat and sit on it. */
  sitOn(nav: HomeNav, seat: Seat, then?: () => void): boolean {
    return this.walkTo(nav, seat.fx, seat.fz, () => {
      this.seat = seat;
      this.pos.set(seat.x, Math.max(0, seat.y - SIT_HIPS), seat.z);
      this.char.root.rotation.y = seat.yaw;
      this.char.play('sit', 0.25);
      then?.();
    });
  }

  /** Get up off a seat onto the free floor in front of it. */
  standUp(nav: HomeNav): void {
    if (!this.seat) return;
    const s = this.seat;
    this.seat = null;
    const spot = nav.nearestFree(s.fx, s.fz) ?? [s.fx, s.fz];
    this.pos.set(spot[0], 0, spot[1]);
    this.char.play('idle', 0.2);
  }

  halt(): void { this.path = []; this.onArrive = null; if (!this.seat) this.char.play('idle'); }

  /** After furniture moved: off a seat that is gone, and out of anything put down on them. */
  settle(nav: HomeNav, items: HomeItem[]): void {
    if (this.seat && !items.some((i) => i.u === this.seat!.uid)) { this.seat = null; this.pos.y = 0; this.char.play('idle'); }
    if (this.seat) return;
    if (!nav.freeAt(this.pos.x, this.pos.z)) {
      const spot = nav.nearestFree(this.pos.x, this.pos.z);
      if (spot) this.pos.set(spot[0], 0, spot[1]);
    }
    // a path through somewhere now blocked is worked out again
    if (this.path.some(([x, z]) => !nav.freeAt(x, z))) {
      const last = this.path[this.path.length - 1];
      const cb = this.onArrive;
      this.path = [];
      if (last) this.walkTo(nav, last[0], last[1], cb ?? undefined);
    }
  }

  update(dt: number): void {
    if (this.path.length) {
      const [tx, tz] = this.path[0];
      const dx = tx - this.pos.x, dz = tz - this.pos.z;
      const dist = Math.hypot(dx, dz);
      const step = this.speed * dt;
      if (dist <= step) {
        this.pos.x = tx; this.pos.z = tz;
        this.path.shift();
        if (!this.path.length) { this.char.play('idle'); const cb = this.onArrive; this.onArrive = null; cb?.(); }
      } else {
        this.pos.x += (dx / dist) * step; this.pos.z += (dz / dist) * step;
        let diff = Math.atan2(dx, dz) - this.char.root.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.char.root.rotation.y += diff * Math.min(1, dt * 12);
        this.char.play('walk', 0.15);
      }
      this.idle = 0;
    } else this.idle += dt;
    this.char.update(dt);
  }

  face(x: number, z: number): void { if (!this.seat) this.char.root.rotation.y = Math.atan2(x - this.pos.x, z - this.pos.z); }

  dispose(): void {
    this.parent.remove(this.char.root);
    this.char.dispose();
  }
}
