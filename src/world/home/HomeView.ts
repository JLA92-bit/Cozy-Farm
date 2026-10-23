import * as THREE from 'three';
import { HOME, PIECE, type PieceDef } from '../../data';
import { home } from '../../systems/Home';
import type { HomeItem, HomeRoom } from '../../systems/State';
import { BatchSet, type PoolLike } from '../BatchPool';
import { colouredGeo, materialFor, pieceGeo, pieceGeoNow } from './FurnitureGeo';
import { patternTexture, shade, TILE_M } from './HomeStyle';
import { pictureTexture } from './Pictures';

/**
 * 1.29 the inside of the Farmhouse: one room at a time, drawn like a doll's house. The two walls facing the camera
 * are cut down to a low ledge (The Sims style) and swap over when the camera turns. Furniture is batched by material
 * (BatchPool), each piece in its own colours. A few point lights follow the lamps that are on.
 *
 * Room coordinates: metres from the middle of the room, x east, z south, y up. Walls: 0 north (back at z = -d/2),
 * 1 east, 2 south, 3 west.
 */

/** Where the home is drawn: far off the farm's map, alone in its own corner of the scene. */
export const HOME_ORIGIN = new THREE.Vector3(0, 0, -1400);
const WALL_T = 0.1;
const CUT = 0.14;
const LIGHTS = 3;
const WALL_NORMALS: [number, number][] = [[0, 1], [-1, 0], [0, -1], [1, 0]];

export interface ItemHit { uid: number; point: THREE.Vector3 }
interface Placed { pool: PoolLike; handle: number; geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }

export class HomeView {
  readonly group = new THREE.Group();
  private shell = new THREE.Group();
  private itemsGroup = new THREE.Group();
  private batches: BatchSet;
  private placed = new Map<number, Placed>();
  /** pictures in frames and on plaques: one small mesh each (each shows its own photo) */
  private pictures = new Map<number, THREE.Mesh>();
  private pictureMats = new Map<string, THREE.MeshLambertMaterial>();
  private picGeo = new THREE.PlaneGeometry(1, 1);
  private walls: THREE.Group[] = [];
  private wallItems = new Map<number, number>();
  private lights: THREE.PointLight[] = [];
  /** a warm fill so rooms stay cosy and readable at night */
  private fill = new THREE.AmbientLight('#ffe2b8', 0);
  private outline: THREE.LineSegments;
  private ground: THREE.Mesh;
  roomId = 'living';
  /** camera azimuth: decides which walls are cut */
  private azimuth = Math.PI / 4;
  night = 0;

  constructor() {
    this.group.position.copy(HOME_ORIGIN);
    this.group.add(this.shell, this.itemsGroup);
    this.batches = new BatchSet(this.itemsGroup);
    const g = new THREE.CircleGeometry(40, 48);
    g.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#8cbf62' }));
    this.ground.position.y = -0.03;
    this.ground.receiveShadow = true;
    this.group.add(this.ground);
    this.outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true }));
    this.outline.renderOrder = 10;
    this.outline.visible = false;
    this.group.add(this.outline);
    this.group.add(this.fill);
    // the lamp lights always exist (intensity 0 when unused): adding or hiding lights would rebuild every shader
    for (let i = 0; i < LIGHTS; i++) {
      const l = new THREE.PointLight('#ffd89a', 0, 3.2, 1.6);
      l.castShadow = false;
      this.lights.push(l);
      this.group.add(l);
    }
  }

  get room(): HomeRoom | null { return home.room(this.roomId); }
  get dims(): { w: number; d: number } { return home.size(this.roomId); }

  /** Load every model the room's pieces need. */
  async preload(roomId: string): Promise<void> {
    const r = home.room(roomId);
    const ids = new Set<string>([...(r?.items.map((i) => i.f) ?? []), ...(r?.looks?.flatMap((l) => l?.items.map((i) => i.f) ?? []) ?? [])]);
    await Promise.all([...ids].map((id) => pieceGeo(id).catch((e) => console.warn('[home] piece failed', id, e))));
  }

  async show(roomId: string): Promise<void> {
    this.roomId = roomId;
    await this.preload(roomId);
    this.rebuild();
  }

  /** Redraw everything (room changed size, look applied, undo). */
  rebuild(): void {
    this.buildShell();
    this.rebuildItems();
  }

  // --------------------------------------------------------------------------------------------- the shell

  private buildShell(): void {
    for (const c of [...this.shell.children]) { this.shell.remove(c); disposeTree(c); }
    this.walls = [];
    const r = this.room;
    if (!r) return;
    const { w, d } = this.dims;
    const H = HOME.wallHeight;
    // the floor
    const floorTex = patternTexture('floor', r.floor[0], r.floor[1], r.floor[2]).clone();
    floorTex.needsUpdate = true;
    floorTex.repeat.set(w / TILE_M, d / TILE_M);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: floorTex }));
    floor.receiveShadow = true;
    this.shell.add(floor);
    // a plinth under the floor so the room sits on something
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + WALL_T * 2 + 0.2, 0.18, d + WALL_T * 2 + 0.2), new THREE.MeshLambertMaterial({ color: shade(r.trim, -0.35) }));
    plinth.position.y = -0.1;
    plinth.receiveShadow = true;
    this.shell.add(plinth);
    const trimMat = new THREE.MeshLambertMaterial({ color: r.trim });
    const outsideMat = new THREE.MeshLambertMaterial({ color: shade(r.trim, 0.55) });
    const corniceMat = new THREE.MeshLambertMaterial({ color: r.ceiling });
    for (let i = 0; i < 4; i++) {
      const along = i % 2 === 0 ? w : d;
      const style = r.walls[i];
      const wall = new THREE.Group();
      // inside face: pattern, the lower part its own pattern when there is a wainscot
      const wainH = r.wainscot ? r.wainscot.h * H : 0;
      const upperTex = patternTexture('wall', style[0], style[1], style[2]).clone();
      upperTex.needsUpdate = true;
      upperTex.repeat.set(along / TILE_M, (H - wainH) / TILE_M);
      const upper = new THREE.Mesh(new THREE.PlaneGeometry(along, H - wainH), new THREE.MeshLambertMaterial({ map: upperTex }));
      upper.position.y = wainH + (H - wainH) / 2;
      upper.receiveShadow = true;
      wall.add(upper);
      if (r.wainscot) {
        const lowTex = patternTexture('wall', r.wainscot.p, r.wainscot.a, r.wainscot.b).clone();
        lowTex.needsUpdate = true;
        lowTex.repeat.set(along / TILE_M, wainH / TILE_M);
        const low = new THREE.Mesh(new THREE.PlaneGeometry(along, wainH), new THREE.MeshLambertMaterial({ map: lowTex }));
        low.position.y = wainH / 2;
        low.receiveShadow = true;
        wall.add(low);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(along, 0.035, 0.03), trimMat);
        rail.position.set(0, wainH, 0.015);
        wall.add(rail);
      }
      // skirting board and a cornice along the top
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(along, 0.07, 0.025), trimMat);
      skirt.position.set(0, 0.035, 0.0125);
      wall.add(skirt);
      const cornice = new THREE.Mesh(new THREE.BoxGeometry(along, 0.05, 0.04), corniceMat);
      cornice.position.set(0, H - 0.025, 0.02);
      wall.add(cornice);
      // the wall's thickness: outside face and a cap along the top
      const body = new THREE.Mesh(new THREE.BoxGeometry(along + WALL_T * 2, H, WALL_T), outsideMat);
      body.position.set(0, H / 2, -WALL_T / 2 - 0.002);
      wall.add(body);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(along + WALL_T * 2, 0.02, WALL_T + 0.01), trimMat);
      cap.position.set(0, H + 0.01, -WALL_T / 2);
      wall.add(cap);
      if (r.beams) {
        // exposed timbers: posts at the ends and a beam along the top
        for (const s of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, H, 0.09), trimMat);
          post.position.set(s * (along / 2 - 0.045), H / 2, 0.045);
          wall.add(post);
        }
        const beam = new THREE.Mesh(new THREE.BoxGeometry(along, 0.1, 0.1), trimMat);
        beam.position.set(0, H - 0.08, 0.05);
        wall.add(beam);
      }
      for (const c of wall.children) { (c as THREE.Mesh).castShadow = false; }
      // place the wall: its inside face looks into the room
      const [nx, nz] = WALL_NORMALS[i];
      wall.position.set(-nx * w / 2, 0, -nz * d / 2);
      wall.rotation.y = Math.atan2(nx, nz);
      this.walls.push(wall);
      this.shell.add(wall);
    }
    this.applyCutaway();
  }

  /** Which walls face the camera (cut down) for a camera azimuth. */
  frontWalls(az = this.azimuth): boolean[] {
    const cx = Math.sin(az), cz = Math.cos(az);
    // the wall's outward direction is minus its inward normal
    return WALL_NORMALS.map(([nx, nz]) => -nx * cx + -nz * cz > 0.05);
  }

  setAzimuth(az: number): void {
    this.azimuth = az;
    this.applyCutaway();
  }

  private applyCutaway(): void {
    const front = this.frontWalls();
    this.walls.forEach((w, i) => { w.scale.y = front[i] ? CUT / HOME.wallHeight : 1; });
    // pieces on a cut wall are hidden with it
    for (const [uid, wall] of this.wallItems) this.setHidden(uid, front[wall]);
  }

  // --------------------------------------------------------------------------------------------- furniture

  private rebuildItems(): void {
    for (const c of [...this.itemsGroup.children]) { this.itemsGroup.remove(c); if ((c as THREE.BatchedMesh).isBatchedMesh) (c as THREE.BatchedMesh).dispose(); }
    this.batches = new BatchSet(this.itemsGroup);
    this.placed.clear();
    this.pictures.clear();
    this.wallItems.clear();
    // keep every floor piece inside the walls (after moving everything, or anything else that pushed one out)
    for (const it of this.room?.items ?? []) {
      const def = PIECE[it.f];
      if (!def || it.w !== undefined || it.on !== undefined || !pieceGeoNow(it.f)) continue;
      const c = this.clampFloor(it.f, it.r, it.x, it.z);
      // riders move with it (no undo step: this only tidies up)
      if (Math.abs(c.x - it.x) > 0.0005 || Math.abs(c.z - it.z) > 0.0005) home.move(this.roomId, it.u, { x: c.x, z: c.z, y: it.y }, false);
    }
    for (const it of this.room?.items ?? []) this.addItem(it);
    this.applyCutaway();
    this.updateLights();
  }

  /** Draw (or redraw) one piece where the save says it is. */
  addItem(it: HomeItem): void {
    const geo = pieceGeoNow(it.f);
    const def = PIECE[it.f];
    if (!geo || !def) { void pieceGeo(it.f).then(() => { if (this.room?.items.includes(it)) this.refreshItem(it.u); }); return; }
    const g = colouredGeo(it.f, it.c, def.lamp ? !it.off : undefined)!;
    const pool = this.batches.pool(g, materialFor(it.f, it.c) ?? geo.material, def.kind !== 'rug');
    const m = this.matrixFor(it);
    const handle = pool.add(m);
    this.placed.set(it.u, { pool, handle, geom: g, matrix: m });
    if (def.kind === 'wall' && it.w !== undefined) this.wallItems.set(it.u, it.w);
    if (def.picture) {
      const [pw, ph, py, tilt = 0] = def.picture;
      const key = it.show ?? '';
      let mat = this.pictureMats.get(key);
      if (!mat) { mat = new THREE.MeshLambertMaterial({ map: pictureTexture(it.show) }); this.pictureMats.set(key, mat); }
      const mesh = new THREE.Mesh(this.picGeo, mat);
      const local = new THREE.Matrix4().compose(new THREE.Vector3(0, py, geo.size.z / 2 + 0.004 - (tilt ? geo.size.z * 0.25 : 0)), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), tilt), new THREE.Vector3(pw, ph, 1));
      mesh.matrixAutoUpdate = false;
      mesh.matrix.multiplyMatrices(m, local);
      this.itemsGroup.add(mesh);
      this.pictures.set(it.u, mesh);
    }
  }

  removeItem(uid: number): void {
    const p = this.placed.get(uid);
    if (!p) return;
    p.pool.remove(p.handle);
    this.placed.delete(uid);
    this.wallItems.delete(uid);
    const pic = this.pictures.get(uid);
    if (pic) { this.itemsGroup.remove(pic); this.pictures.delete(uid); }
  }

  /** Redraw one piece (moved, recoloured, switched on or off) and what stands on it. */
  refreshItem(uid: number): void {
    const it = home.item(this.roomId, uid);
    this.removeItem(uid);
    if (!it) return;
    this.addItem(it);
    for (const r of home.riders(this.roomId, uid)) { this.removeItem(r.u); this.addItem(r); }
    this.applyCutaway();
    this.updateLights();
  }

  /** Sync the drawn pieces with the save (pieces added or taken away). */
  sync(): void {
    const items = this.room?.items ?? [];
    const ids = new Set(items.map((i) => i.u));
    for (const uid of [...this.placed.keys()]) if (!ids.has(uid)) this.removeItem(uid);
    // rugs are drawn in list order: any rug change redraws all rugs
    for (const it of items) { this.removeItem(it.u); this.addItem(it); }
    this.applyCutaway();
    this.updateLights();
  }

  private setHidden(uid: number, hidden: boolean): void {
    const p = this.placed.get(uid);
    if (!p) return;
    const m = hidden ? new THREE.Matrix4().makeScale(0, 0, 0) : p.matrix;
    p.pool.set(p.handle, m);
    const pic = this.pictures.get(uid);
    if (pic) pic.visible = !hidden;
  }

  /** Where a piece is drawn: position, quarter turns and the wall it hangs on. */
  matrixFor(it: HomeItem): THREE.Matrix4 {
    const def = PIECE[it.f];
    const geo = pieceGeoNow(it.f);
    const m = new THREE.Matrix4();
    if (!def || !geo) return m;
    const pos = this.positionOf(it, def, geo.size);
    const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yawOf(it, def));
    return m.compose(pos, rot, new THREE.Vector3(1, 1, 1));
  }

  yawOf(it: HomeItem, def: PieceDef): number {
    if (def.kind === 'wall' && it.w !== undefined) { const [nx, nz] = WALL_NORMALS[it.w]; return Math.atan2(nx, nz); }
    return (it.r * Math.PI) / 2;
  }

  positionOf(it: HomeItem, def: PieceDef, size: THREE.Vector3): THREE.Vector3 {
    const { w, d } = this.dims;
    if (def.kind === 'wall' && it.w !== undefined) {
      const [nx, nz] = WALL_NORMALS[it.w];
      // along the wall: x runs left to right as seen from inside the room
      const ax = -nz, az = nx;
      const base = new THREE.Vector3(-nx * w / 2, 0, -nz * d / 2);
      return base.add(new THREE.Vector3(ax * it.x + nx * (size.z / 2 + 0.005), it.y ?? def.wallY ?? 0.8, az * it.x + nz * (size.z / 2 + 0.005)));
    }
    if (def.kind === 'ceiling') return new THREE.Vector3(it.x, HOME.wallHeight - size.y, it.z);
    if (def.kind === 'rug') {
      const rugs = (this.room?.items ?? []).filter((i) => PIECE[i.f]?.kind === 'rug');
      return new THREE.Vector3(it.x, 0.002 + rugs.indexOf(it) * 0.003, it.z);
    }
    return new THREE.Vector3(it.x, it.y ?? 0, it.z);
  }

  /** Half size on the floor after quarter turns. */
  footprint(piece: string, r: number): { hx: number; hz: number } {
    const s = pieceGeoNow(piece)?.size;
    if (!s) return { hx: 0.25, hz: 0.25 };
    return r % 2 ? { hx: s.z / 2, hz: s.x / 2 } : { hx: s.x / 2, hz: s.z / 2 };
  }

  /** Keep a floor position inside the room for a piece. */
  clampFloor(piece: string, r: number, x: number, z: number): { x: number; z: number } {
    const { w, d } = this.dims;
    const { hx, hz } = this.footprint(piece, r);
    return { x: THREE.MathUtils.clamp(x, -w / 2 + hx, w / 2 - hx), z: THREE.MathUtils.clamp(z, -d / 2 + hz, d / 2 - hz) };
  }

  /**
   * The highest top a small piece could stand on at a floor point (tables, shelves, counters...), skipping `skip`
   * and anything standing on it. Null when it would stand on the floor.
   */
  surfaceAt(x: number, z: number, skip: Set<number>): { uid: number; y: number } | null {
    let best: { uid: number; y: number } | null = null;
    for (const it of this.room?.items ?? []) {
      const def = PIECE[it.f];
      if (!def?.top || skip.has(it.u)) continue;
      const geo = pieceGeoNow(it.f);
      if (!geo) continue;
      const box = this.worldBox(it);
      if (!box) continue;
      // test in room coords against the piece's box (room-local)
      if (x < box.min.x || x > box.max.x || z < box.min.z || z > box.max.z) continue;
      const top = box.max.y;
      if (!best || top > best.y) best = { uid: it.u, y: top };
    }
    return best;
  }

  /**
   * Where a ray first meets a flat place a small thing can stand on: the top of a table, or any shelf inside a
   * bookcase or on a wall. Nearest to the camera wins, so you put things where you are pointing.
   */
  surfaceHit(ray: THREE.Ray, skip: Set<number>): { uid: number; x: number; z: number; y: number; box: THREE.Box3 } | null {
    const local = ray.clone();
    local.origin.sub(HOME_ORIGIN);
    const front = this.frontWalls();
    let best: { uid: number; x: number; z: number; y: number; box: THREE.Box3 } | null = null, bestT = Infinity;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    for (const it of this.room?.items ?? []) {
      const def = PIECE[it.f];
      if (!def?.top || skip.has(it.u) || (it.w !== undefined && front[it.w])) continue;
      const geo = pieceGeoNow(it.f);
      const box = this.worldBox(it);
      if (!geo || !box) continue;
      for (const lv of geo.levels) {
        const y = box.min.y + lv;
        plane.constant = -y;
        if (!local.intersectPlane(plane, hit)) continue;
        if (hit.x < box.min.x + 0.01 || hit.x > box.max.x - 0.01 || hit.z < box.min.z + 0.01 || hit.z > box.max.z - 0.01) continue;
        const t = hit.distanceTo(local.origin);
        if (t < bestT) { bestT = t; best = { uid: it.u, x: hit.x, z: hit.z, y, box }; }
      }
    }
    return best;
  }

  /** The flat places of a piece (heights above its base), once its model is loaded. */
  levelsOf(piece: string): number[] | undefined { return pieceGeoNow(piece)?.levels; }

  /** Keep a small piece on the surface it stands on (inside that piece's outline). */
  clampOnto(piece: string, r: number, x: number, z: number, box: THREE.Box3): { x: number; z: number } {
    const { hx, hz } = this.footprint(piece, r);
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    const fx = Math.max(0, (box.max.x - box.min.x) / 2 - hx), fz = Math.max(0, (box.max.z - box.min.z) / 2 - hz);
    return { x: THREE.MathUtils.clamp(x, cx - fx, cx + fx), z: THREE.MathUtils.clamp(z, cz - fz, cz + fz) };
  }

  /** A piece's box in room coordinates. */
  worldBox(it: HomeItem): THREE.Box3 | null {
    const geo = pieceGeoNow(it.f);
    if (!geo?.base.boundingBox) return null;
    return geo.base.boundingBox.clone().applyMatrix4(this.matrixFor(it));
  }

  // --------------------------------------------------------------------------------------------- picking

  /** The piece under a ray (room pieces only, nearest first; hidden wall pieces are skipped). */
  pick(ray: THREE.Ray): ItemHit | null {
    const local = ray.clone().applyMatrix4(new THREE.Matrix4().copy(this.group.matrixWorld).invert());
    const front = this.frontWalls();
    let best: ItemHit | null = null, bestD = Infinity;
    const inv = new THREE.Matrix4();
    const pt = new THREE.Vector3();
    for (const it of this.room?.items ?? []) {
      const geo = pieceGeoNow(it.f);
      if (!geo?.base.boundingBox) continue;
      if (it.w !== undefined && front[it.w]) continue;
      const m = this.matrixFor(it);
      inv.copy(m).invert();
      const r = local.clone().applyMatrix4(inv);
      const box = geo.base.boundingBox.clone();
      // rugs are thin: give them a little height to tap
      if (PIECE[it.f]?.kind === 'rug') box.max.y = Math.max(box.max.y, 0.03);
      if (!r.intersectBox(box, pt)) continue;
      pt.applyMatrix4(m);
      const dist = pt.distanceTo(local.origin);
      // small things on top of others win over what they stand on
      const bias = PIECE[it.f]?.kind === 'rug' ? 0.5 : it.on !== undefined ? -0.3 : 0;
      if (dist + bias < bestD) { bestD = dist + bias; best = { uid: it.u, point: pt.clone() }; }
    }
    return best;
  }

  /** Where a ray meets the floor (room coords). */
  floorPoint(ray: THREE.Ray, y = 0): THREE.Vector3 | null {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(HOME_ORIGIN.y + y));
    const p = ray.intersectPlane(plane, new THREE.Vector3());
    return p ? p.sub(HOME_ORIGIN) : null;
  }

  /** Where a ray meets one of the standing (back) walls: which wall, the distance along it and the height. */
  wallPoint(ray: THREE.Ray): { w: number; x: number; y: number } | null {
    const { w, d } = this.dims;
    const front = this.frontWalls();
    let best: { w: number; x: number; y: number } | null = null, bestT = Infinity;
    for (let i = 0; i < 4; i++) {
      if (front[i]) continue;
      const [nx, nz] = WALL_NORMALS[i];
      const n = new THREE.Vector3(nx, 0, nz);
      const p0 = new THREE.Vector3(-nx * w / 2, 0, -nz * d / 2).add(HOME_ORIGIN);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, p0);
      const hit = ray.intersectPlane(plane, new THREE.Vector3());
      if (!hit) continue;
      const t = hit.distanceTo(ray.origin);
      const local = hit.sub(HOME_ORIGIN);
      const along = -nz * local.x + nx * local.z;
      const half = (i % 2 === 0 ? w : d) / 2;
      if (Math.abs(along) > half + 0.3 || local.y < -0.2 || local.y > HOME.wallHeight + 0.4) continue;
      if (t < bestT) { bestT = t; best = { w: i, x: along, y: local.y }; }
    }
    return best;
  }

  /** Keep a wall piece on its wall and below the top. */
  clampWall(piece: string, w: number, x: number, y: number): { x: number; y: number } {
    const s = pieceGeoNow(piece)?.size ?? new THREE.Vector3(0.4, 0.4, 0.1);
    const half = (w % 2 === 0 ? this.dims.w : this.dims.d) / 2;
    return { x: THREE.MathUtils.clamp(x, -half + s.x / 2, half - s.x / 2), y: THREE.MathUtils.clamp(y, 0, HOME.wallHeight - s.y) };
  }

  // --------------------------------------------------------------------------------------------- selection

  select(uid: number | null, ok = true): void {
    const it = uid === null ? undefined : home.item(this.roomId, uid);
    if (!it) { this.outline.visible = false; return; }
    const box = this.worldBox(it);
    if (!box) { this.outline.visible = false; return; }
    const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
    this.outline.scale.set(Math.max(0.05, size.x + 0.04), Math.max(0.02, size.y + 0.04), Math.max(0.05, size.z + 0.04));
    this.outline.position.copy(mid);
    (this.outline.material as THREE.LineBasicMaterial).color.set(ok ? '#ffffff' : '#ff6b5a');
    this.outline.visible = true;
  }

  // --------------------------------------------------------------------------------------------- lights

  /** Point the few lights at the lamps that are on (nearest the middle first); brighter at night. */
  updateLights(): void {
    const lamps = (this.room?.items ?? []).filter((i) => PIECE[i.f]?.lamp && !i.off && !(i.w !== undefined && this.frontWalls()[i.w]));
    lamps.sort((a, b) => (a.x * a.x + a.z * a.z) - (b.x * b.x + b.z * b.z));
    this.lights.forEach((l, i) => {
      const it = lamps[i];
      const box = it ? this.worldBox(it) : null;
      if (!it || !box) { l.intensity = 0; l.userData.on = false; return; }
      const c = box.getCenter(new THREE.Vector3());
      l.position.set(c.x, PIECE[it.f].kind === 'ceiling' ? box.min.y - 0.1 : box.max.y - 0.05, c.z);
      l.userData.on = true;
      l.intensity = 0.6 + this.night * 2.4;
    });
  }

  setNight(night: number): void {
    if (Math.abs(night - this.night) < 0.02) return;
    this.night = night;
    for (const l of this.lights) if (l.userData.on) l.intensity = 0.6 + night * 2.4;
    this.fill.intensity = night * 0.9;
  }

  /** The room's middle in world space (the camera looks here). */
  get centre(): THREE.Vector3 { return HOME_ORIGIN.clone(); }
}

function disposeTree(o: THREE.Object3D): void {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    // pattern textures are clones of the cached ones: free the clone's GPU copy
    for (const mat of mats) { (mat as THREE.MeshLambertMaterial).map?.dispose(); mat.dispose(); }
  });
}
