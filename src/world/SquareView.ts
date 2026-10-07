import * as THREE from 'three';
import gsap from 'gsap';
import { assets } from '../core/Assets';
import { ROOMS, VILLAGER, type RoomDef } from '../data';
import { restoration } from '../systems/Restoration';
import { Character } from './Character';
import { PAL, geo, rng } from './Procedural';
import { objectFor, visualFor } from './Visuals';

/**
 * The village square (1.8.5 Village Restoration): a little island of its own in the same sea, a day's walk across
 * the water from the farm. A stone plaza with a fountain, and a curved row of six lots behind it. Each lot shows
 * how far its room is rebuilt: a ruin, then three stages of building, then the finished room. Drawn from the same
 * KayKit and Kenney models as the farm (CC0, see CREDITS.md) plus a little procedural geometry in the farm's palette.
 */

/** Where the island sits in the world: well clear of the farm and its distant islands. */
export const SQUARE = { x: 130, z: 0 };
/** Island radius, plaza radius and the arc the lots stand on. */
const R_ISLAND = 25;
const R_PLAZA = 5.2;
const LOT_R = 13.6;
const LOT_W = 4.6;
const CLIFF_H = 1.6;

// The camera looks from (+x, +z) towards (-x, -z). A point is given in screen terms: sx to the right, sy away
// from the viewer (up the screen), and turned into world x, z.
const U = new THREE.Vector2(Math.SQRT1_2, -Math.SQRT1_2);
const V = new THREE.Vector2(-Math.SQRT1_2, -Math.SQRT1_2);
const at = (sx: number, sy: number): [number, number] => [U.x * sx + V.x * sy, U.y * sx + V.y * sy];
/** Island centre in screen terms (a little behind the plaza, so the lots sit well inside the shore). */
const IC_SY = 5;

/** 'arc': a curved row behind the plaza (wide screens). 'street': two columns along a main street (narrow phones). */
export type SquareLayout = 'arc' | 'street';
interface Spot { x: number; z: number; yaw: number }

/** Where each room stands in a layout, and which way it faces (towards the plaza or the street). */
function spotsFor(mode: SquareLayout): Record<string, Spot> {
  const out: Record<string, Spot> = {};
  const n = ROOMS.length;
  ROOMS.forEach((room, k) => {
    if (mode === 'arc') {
      // the first room (the Pantry) stands on the left of the screen, the last on the right
      const phi = THREE.MathUtils.degToRad(24 + ((n - 1 - k) / (n - 1)) * 132);
      const [x, z] = at(LOT_R * Math.cos(phi), LOT_R * Math.sin(phi) * 0.8 + 2.2);
      out[room.id] = { x, z, yaw: Math.atan2(-x, -z) };
    } else {
      const col = k % 2, row = Math.floor(k / 2);
      const sx = col === 0 ? -5.6 : 5.6, sy = [9.5, 16.2, 22.9][row];
      const [x, z] = at(sx, sy);
      // each lot faces the street between the two columns
      const to = col === 0 ? U : U.clone().negate();
      out[room.id] = { x, z, yaw: Math.atan2(to.x, to.y) };
    }
  });
  return out;
}

export interface LotInfo { id: string; room: RoomDef; x: number; z: number; yaw: number }

interface Lot {
  info: LotInfo;
  board: THREE.Mesh;
  boardPick: THREE.Mesh;
  villager?: { char: Character; id: string; pick: THREE.Mesh; base: THREE.Vector3 };
  group: THREE.Group;
  holder: THREE.Group;
  variants: Partial<Record<'ruin' | 'a' | 'b' | 'c' | 'done', THREE.Object3D>>;
  pick: THREE.Mesh;
  stage: number;
  anchor: THREE.Vector3;
}

/** A model scaled so its widest side (x or z) is `width`, standing on y=0 with its centre at the origin. */
async function modelObject(id: string, width: number): Promise<THREE.Object3D> {
  const m = await assets.static(id);
  const mesh = assets.meshFrom(m);
  const s = width / Math.max(m.size.x, m.size.z);
  const g = new THREE.Group();
  mesh.scale.setScalar(s);
  g.add(mesh);
  return g;
}

/** A tall thin model (lantern, banner) scaled to a height instead of a width. */
async function tallObject(id: string, height: number): Promise<THREE.Object3D> {
  const m = await assets.static(id);
  const mesh = assets.meshFrom(m);
  mesh.scale.setScalar(height / m.size.y);
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}

/** A building of the farm (a def in buildings.json, procedural or modelled) scaled to a width. */
async function buildingObject(type: string, width: number): Promise<THREE.Object3D> {
  const v = await visualFor(type);
  if (!v) throw new Error(`no visual for ${type}`);
  const o = objectFor(v);
  const box = new THREE.Box3().setFromObject(o);
  const size = box.getSize(new THREE.Vector3());
  o.scale.setScalar(width / Math.max(size.x, size.z));
  return o;
}

function noise(seed: number, cells = 24): (x: number, z: number) => number {
  const r = rng(seed);
  const lat = new Float32Array(cells * cells);
  for (let i = 0; i < lat.length; i++) lat[i] = r();
  const g = (x: number, z: number) => lat[(((z % cells) + cells) % cells) * cells + (((x % cells) + cells) % cells)];
  return (x, z) => {
    const x0 = Math.floor(x), z0 = Math.floor(z), fx = x - x0, fz = z - z0;
    const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
    const a = g(x0, z0) + (g(x0 + 1, z0) - g(x0, z0)) * sx;
    const b = g(x0, z0 + 1) + (g(x0 + 1, z0 + 1) - g(x0, z0 + 1)) * sx;
    return a + (b - a) * sz;
  };
}

/** Round grass top with the same meadow-patch colouring as the farm. Centre (cx, cz) in island space. */
function grassTop(cx: number, cz: number, radius: number): THREE.Mesh {
  const rings = 22, segs = 88;
  const pos: number[] = [], col: number[] = [];
  const base = new THREE.Color(PAL.grass), meadow = new THREE.Color('#9be06a'), lush = new THREE.Color('#5fbf45'), warm = new THREE.Color('#a9d65c');
  const big = noise(11), small = noise(23), c = new THREE.Color();
  const r = rng(77);
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const r0 = (i / rings) * radius, r1 = ((i + 1) / rings) * radius;
      const a0 = (j / segs) * Math.PI * 2, a1 = ((j + 1) / segs) * Math.PI * 2;
      const p = (rr: number, a: number): [number, number, number] => [cx + Math.cos(a) * rr, 0, cz + Math.sin(a) * rr];
      const A = p(r0, a0), B = p(r0, a1), C = p(r1, a0), D = p(r1, a1);
      if (i === 0) pos.push(...A, ...C, ...D); else pos.push(...A, ...C, ...B, ...B, ...C, ...D);
      const mx = cx + Math.cos((a0 + a1) / 2) * ((r0 + r1) / 2), mz = cz + Math.sin((a0 + a1) / 2) * ((r0 + r1) / 2);
      const patch = big(mx / 5 + 8, mz / 5 + 8) * 0.7 + small(mx / 2.4 + 3, mz / 2.4 + 3) * 0.3;
      c.copy(base);
      if (patch > 0.55) c.lerp(meadow, Math.min(1, (patch - 0.55) * 2.2) * 0.55);
      else if (patch < 0.4) c.lerp(lush, Math.min(1, (0.4 - patch) * 2.5) * 0.5);
      if (r1 > radius - 3) c.lerp(warm, ((r1 - (radius - 3)) / 3) * 0.3);
      const n = (r() - 0.5) * 0.045;
      c.offsetHSL(n * 0.15, n * 0.5, ((i + j) % 2 === 0 ? 0.03 : 0) + n);
      const verts = i === 0 ? 3 : 6;
      for (let k = 0; k < verts; k++) col.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.receiveShadow = true;
  return m;
}

/** Cliffs, beach and rocks round the island (same look as the farm island). */
function islandBase(cx: number, cz: number): THREE.Mesh {
  const R = R_ISLAND, b = geo();
  b.cyl(R, R, CLIFF_H, PAL.dirt, [cx, -CLIFF_H - 0.06, cz], 72)
    .cyl(R + 0.15, R + 0.15, 0.25, PAL.grassDark, [cx, -0.285, cz], 72)
    .cyl(R + 0.25, R + 0.25, 0.35, PAL.dirtDark, [cx, -CLIFF_H + 0.35, cz], 72)
    .cyl(R + 3.2, R + 3.2, 0.6, PAL.sand, [cx, -CLIFF_H - 0.3, cz], 72)
    .cyl(R + 1.8, R + 1.8, 0.6, '#e8c878', [cx, -CLIFF_H - 0.05, cz], 72);
  const r = rng(321);
  for (let i = 0; i < 40; i++) {
    const a = r() * Math.PI * 2, d = R + 0.8 + r() * 1.6;
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    if (i % 6 === 5) b.sphere(0.12, i % 4 ? '#ffd9c8' : '#fff1de', [x, -CLIFF_H + 0.66, z], 0, [1, 0.4, 0.8]);
    else b.sphere(0.2 + r() * 0.35, r() > 0.5 ? PAL.stone : PAL.stoneDark, [x, -CLIFF_H + 0.55, z], 0, [1, 0.6, 1]);
  }
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, d = R + 0.3 + r() * 0.4;
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    for (let k = 0; k < 3; k++) b.geometry(new THREE.ConeGeometry(0.05, 0.45 + r() * 0.2, 4, 1, true), k === 1 ? '#9cc95a' : '#c6c86a', [x + (k - 1) * 0.1, -CLIFF_H + 0.85, z + (r() - 0.5) * 0.1], [(r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5]);
  }
  const m = new THREE.Mesh(b.build(), assets.vertexMaterial);
  m.receiveShadow = true;
  return m;
}

/** The stone plaza: a worn disc with a pattern of paving. */
function plazaGeometry(): THREE.BufferGeometry {
  const b = geo();
  b.cyl(R_PLAZA + 0.35, R_PLAZA + 0.45, 0.1, '#b3a78d', [0, 0, 0], 48)
    .cyl(R_PLAZA, R_PLAZA, 0.14, '#e9dcbf', [0, 0, 0], 48)
    .cyl(R_PLAZA - 1.4, R_PLAZA - 1.4, 0.16, '#dccdad', [0, 0, 0], 40)
    .cyl(2.55, 2.55, 0.18, '#cfbf9d', [0, 0, 0], 32);
  // paving stones round the rim
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    b.box(0.9, 0.05, 0.5, i % 2 ? '#d6c7a6' : '#efe3c8', [Math.cos(a) * (R_PLAZA - 0.55), 0.15, Math.sin(a) * (R_PLAZA - 0.55)], [0, -a, 0]);
  }
  return b.build();
}

/** A path from the plaza to a lot (flat strips of stone, a little wider than a person). */
function pathGeometry(from: THREE.Vector2, to: THREE.Vector2): THREE.BufferGeometry {
  const b = geo();
  const d = to.clone().sub(from), len = d.length(), yaw = Math.atan2(d.x, d.y);
  const mid = from.clone().add(to).multiplyScalar(0.5);
  b.box(1.9, 0.07, len, '#d8c8a6', [mid.x, 0.04, mid.y], [0, yaw, 0]);
  b.box(1.6, 0.09, len - 0.2, '#e8dcc0', [mid.x, 0.05, mid.y], [0, yaw, 0]);
  const n = Math.floor(len / 0.9);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, p = from.clone().lerp(to, t);
    b.box(0.5, 0.1, 0.34, i % 2 ? '#cdbc98' : '#d6c6a4', [p.x + (i % 3 - 1) * 0.28, 0.07, p.y], [0, yaw + (i % 2 ? 0.15 : -0.15), 0]);
  }
  return b.build();
}

/** The hex plinth a room stands on. */
function plinthGeometry(color: string): THREE.BufferGeometry {
  return geo()
    .cyl(LOT_W * 0.78, LOT_W * 0.84, 0.16, '#b3a78d', [0, 0, 0], 6, [0, Math.PI / 6, 0])
    .cyl(LOT_W * 0.72, LOT_W * 0.72, 0.2, color, [0, 0, 0], 6, [0, Math.PI / 6, 0])
    .build();
}

/** The bundle board in front of a lot: two posts, a slanted board, a little roof and a coloured pennant. */
function boardGeometry(color: string): THREE.BufferGeometry {
  const b = geo();
  b.block(0.14, 1.5, 0.14, PAL.woodDark, [-0.62, 0, 0]);
  b.block(0.14, 1.5, 0.14, PAL.woodDark, [0.62, 0, 0]);
  b.block(1.5, 0.78, 0.1, PAL.woodLight, [0, 0.62, 0.02]);
  b.box(1.56, 0.08, 0.16, PAL.woodDark, [0, 0.62, 0.02]);
  b.box(1.56, 0.08, 0.16, PAL.woodDark, [0, 1.42, 0.02]);
  b.prism(1.8, 0.36, 0.7, color, [0, 1.52, 0]);
  b.block(0.08, 0.6, 0.08, PAL.woodDark, [0.82, 1.5, 0]);
  b.box(0.04, 0.26, 0.4, color, [0.82, 2.02, 0.2]);
  // little feet so it sits in the stone
  b.block(0.34, 0.08, 0.34, PAL.stoneDark, [-0.62, 0, 0]);
  b.block(0.34, 0.08, 0.34, PAL.stoneDark, [0.62, 0, 0]);
  return b.build();
}

/** A rowing boat for the jetty. */
function boatGeometry(): THREE.BufferGeometry {
  return geo()
    .box(0.9, 0.24, 1.9, PAL.woodDark, [0, 0.05, 0])
    .box(0.74, 0.06, 1.7, PAL.wood, [0, 0.19, 0])
    .box(0.94, 0.08, 1.94, PAL.white, [0, 0.22, 0])
    .box(0.8, 0.05, 0.22, PAL.woodLight, [0, 0.3, -0.2])
    .build();
}

/** The little wooden jetty: planks over the water, posts every other plank. */
function jettyGeometry(): THREE.BufferGeometry {
  const b = geo();
  const planks = 8, step = 0.9;
  for (let k = 0; k < planks; k++) {
    const z = -k * step;
    b.block(1.5, 0.1, 0.8, k % 2 ? PAL.wood : PAL.woodLight, [0, -CLIFF_H + 0.7, z]);
    if (k % 2 === 0) for (const sx of [-0.7, 0.7]) b.block(0.16, 1.0, 0.16, PAL.woodDark, [sx, -CLIFF_H - 0.1, z]);
  }
  b.block(0.14, 0.55, 0.14, PAL.woodDark, [0.7, -CLIFF_H + 0.75, -planks * step + 0.5]);
  b.cyl(0.1, 0.1, 0.06, '#e2d3b0', [0.7, -CLIFF_H + 1.3, -planks * step + 0.5], 6);
  return b.build();
}

export class SquareView {
  readonly group = new THREE.Group();
  readonly lots = new Map<string, Lot>();
  private pickers: THREE.Object3D[] = [];
  private characters: { char: Character; id: string; base: THREE.Vector3; pick: THREE.Mesh }[] = [];
  private animals: { root: THREE.Group; mixer: THREE.AnimationMixer; idle: THREE.AnimationAction | null; walk: THREE.AnimationAction | null; home: THREE.Vector3; target: THREE.Vector3; wait: number; speed: number; lot: string; moving: boolean }[] = [];
  private hands: { hour: THREE.Object3D; minute: THREE.Object3D }[] = [];
  private boat: THREE.Mesh | null = null;
  private raycaster = new THREE.Raycaster();
  private t = 0;
  private built = false;
  private disposed = false;

  /** World position of a point on the island (island space -> world). */
  world(x: number, y: number, z: number): THREE.Vector3 { return new THREE.Vector3(SQUARE.x + x, y, SQUARE.z + z); }
  get centre(): THREE.Vector3 { const [x, z] = at(0, IC_SY); return this.world(x, 0, z); }
  /** Where the camera looks: between the plaza and the row of lots. */
  get focus(): THREE.Vector3 { const [x, z] = at(0, this.mode === 'arc' ? 11 : 14.5); return this.world(x, 0, z); }
  mode: SquareLayout = 'arc';
  private paths: THREE.Mesh[] = [];

  async build(): Promise<void> {
    if (this.built) return;
    this.built = true;
    const g = this.group;
    g.position.set(SQUARE.x, 0, SQUARE.z);
    const [icx, icz] = at(0, IC_SY);
    g.add(grassTop(icx, icz, R_ISLAND), islandBase(icx, icz));

    // plaza, fountain and paths
    const plaza = new THREE.Mesh(plazaGeometry(), assets.vertexMaterial);
    plaza.receiveShadow = true;
    g.add(plaza);
    const fountain = await modelObject('prop/fountain', 3.6);
    fountain.position.y = 0.16;
    g.add(fountain);

    // the six lots (their places are set by layout())
    for (const room of ROOMS) await this.buildLot({ id: room.id, room, x: 0, z: 0, yaw: 0 });
    this.layout('arc', true);

    await this.scatter();
    await this.buildVillagers();
    this.refresh();
  }

  // ---------------------------------------------------------------------------------------- lots

  private async buildLot(info: LotInfo): Promise<void> {
    const { room } = info;
    const group = new THREE.Group();
    group.position.set(info.x, 0, info.z);
    group.rotation.y = info.yaw;
    const holder = new THREE.Group();
    group.add(holder);
    const colour = ({ pink: '#ff8fb4', yellow: '#ffc93c', blue: '#3fa9f5', grey: '#9aa5b1', green: '#6cc644' } as Record<string, string>)[room.color] ?? '#ffc93c';

    const plinth = new THREE.Mesh(plinthGeometry('#d8cba9'), assets.vertexMaterial);
    plinth.receiveShadow = true;
    group.add(plinth);

    const variants: Lot['variants'] = {};
    const put = (key: keyof Lot['variants'], o: THREE.Object3D) => { o.visible = false; holder.add(o); variants[key] = o; return o; };

    // ruin: a broken building on bare earth, fenced off
    const ruin = put('ruin', new THREE.Group());
    const dirt = await modelObject('bld/dirt', LOT_W * 0.95);
    dirt.position.y = 0.17;
    const ruinModel = await modelObject('bld/ruin', LOT_W * 0.78);
    ruinModel.position.y = 0.17;
    ruin.add(dirt, ruinModel);
    // a fence round the back and sides, open at the front
    for (let i = 0; i < 8; i++) {
      const th = THREE.MathUtils.degToRad(-8 + i * 28);
      const f = await modelObject('prop/fence_wood', 1.5);
      f.position.set(Math.cos(th) * LOT_W * 0.68, 0.16, -Math.sin(th) * LOT_W * 0.68);
      f.rotation.y = Math.atan2(-Math.sin(th), -Math.cos(th));
      ruin.add(f);
    }
    for (const [x, z, id, w] of [[-1.6, 1.4, 'prop/lumber', 0.9], [1.7, 1.2, 'prop/stones', 0.7], [1.2, -1.7, 'nat/rock_small', 0.5]] as const) {
      const p = await modelObject(id, w);
      p.position.set(x, 0.17, z);
      p.rotation.y = x * 2;
      ruin.add(p);
    }

    // stages: A planks and stone, B a frame, C nearly done (scaffolding)
    for (const [key, id, w] of [['a', 'bld/stage_a', 0.7], ['b', 'bld/stage_b', 0.78], ['c', 'bld/stage_c', 0.82]] as const) {
      const st = put(key, new THREE.Group());
      const d = await modelObject('bld/dirt', LOT_W * 0.95);
      d.position.y = 0.17;
      const m = await modelObject(id, LOT_W * w);
      m.position.y = 0.17;
      st.add(d, m);
      if (key === 'c') {
        const sc = await modelObject('bld/scaffolding', LOT_W * 0.9);
        sc.position.set(0.5, 0.17, -0.2);
        st.add(sc);
      }
      const crate = await modelObject('prop/crate_big', 0.7);
      crate.position.set(-1.7, 0.17, 1.5);
      const wb = await modelObject('prop/wheelbarrow', 0.9);
      wb.position.set(1.8, 0.17, 1.4);
      wb.rotation.y = -0.6;
      st.add(crate, wb);
    }

    // finished rooms
    if (!room.soon) variants.done = put('done', await this.finishedRoom(room.id));

    group.updateMatrixWorld(true);
    this.group.add(group);

    // a see-through block to tap, and the bundle board in front of the lot (placed by placeLot)
    const pick = new THREE.Mesh(new THREE.CylinderGeometry(LOT_W * 0.62, LOT_W * 0.62, 4.4, 10), new THREE.MeshBasicMaterial({ visible: false }));
    pick.userData.room = room.id;
    this.group.add(pick);
    this.pickers.push(pick);
    const board = new THREE.Mesh(boardGeometry(colour), assets.vertexMaterial);
    board.castShadow = true;
    board.rotation.y = Math.PI / 4;
    this.group.add(board);
    const boardPick = new THREE.Mesh(new THREE.BoxGeometry(2, 2.6, 1), new THREE.MeshBasicMaterial({ visible: false }));
    boardPick.userData.room = room.id;
    this.group.add(boardPick);
    this.pickers.push(boardPick);

    this.lots.set(room.id, { info, group, holder, variants, pick, board, boardPick, stage: -1, anchor: new THREE.Vector3(0, 3.6, 0) });
  }

  /** Put a lot, its board and its villager at the lot's place. */
  private placeLot(lot: Lot): void {
    const { x, z, yaw } = lot.info;
    lot.group.position.set(x, 0, z);
    lot.group.rotation.y = yaw;
    lot.pick.position.set(x, 2.2, z);
    lot.anchor.set(x, 3.6, z);
    // the front of the lot (local +z) and its sideways
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    lot.board.position.set(x + fx * LOT_W * 0.72 + fz * 1.9, 0.12, z + fz * LOT_W * 0.72 - fx * 1.9);
    lot.boardPick.position.copy(lot.board.position).setY(1.3);
    if (lot.villager) {
      const base = new THREE.Vector3(x + fx * LOT_W * 0.78 - fz * 1.5, 0.12, z + fz * LOT_W * 0.78 + fx * 1.5);
      lot.villager.base.copy(base);
      lot.villager.char.root.position.copy(base);
      lot.villager.pick.position.copy(base).setY(1.0);
    }
  }

  /** Arrange the lots for the screen shape: a curved row on wide screens, a main street on narrow ones. */
  layout(mode: SquareLayout, force = false): void {
    if (!force && mode === this.mode) return;
    this.mode = mode;
    const spots = spotsFor(mode);
    for (const lot of this.lots.values()) { Object.assign(lot.info, spots[lot.info.id]); this.placeLot(lot); }
    for (const p of this.paths) { this.group.remove(p); p.geometry.dispose(); }
    this.paths = [];
    const add = (from: THREE.Vector2, to: THREE.Vector2) => {
      const m = new THREE.Mesh(pathGeometry(from, to), assets.vertexMaterial);
      m.receiveShadow = true;
      this.group.add(m);
      this.paths.push(m);
    };
    if (mode === 'street') {
      const [ax, az] = at(0, R_PLAZA - 0.4), [bx, bz] = at(0, 25);
      add(new THREE.Vector2(ax, az), new THREE.Vector2(bx, bz));
    }
    for (const lot of this.lots.values()) {
      const { x, z, yaw } = lot.info;
      const front = new THREE.Vector2(Math.sin(yaw), Math.cos(yaw));
      const end = new THREE.Vector2(x, z).add(front.clone().multiplyScalar(LOT_W * 0.55));
      if (mode === 'arc') add(new THREE.Vector2(x, z).normalize().multiplyScalar(R_PLAZA - 0.3), end);
      else add(end.clone().add(front.clone().multiplyScalar(2.2)), end);
    }
  }

  /** What each room looks like once rebuilt. */
  private async finishedRoom(id: string): Promise<THREE.Object3D> {
    const g = new THREE.Group();
    const lift = 0.17;
    if (id === 'pantry') {
      const shop = await modelObject('bld/market', LOT_W * 0.98);
      shop.position.y = lift;
      g.add(shop);
      for (const [mid, w, x, z, r] of [['prop/barrel', 0.62, -1.9, 1.5, 0.3], ['prop/crate_big', 0.62, 1.9, 1.5, 0.5], ['prop/sack', 0.7, -1.3, 1.9, 0.6], ['prop/crate_small', 0.5, 1.2, 1.9, -0.4], ['prop/barrel', 0.55, 2.0, -0.6, 1.2]] as const) {
        const p = await modelObject(mid, w);
        p.position.set(x, lift, z);
        p.rotation.y = r;
        g.add(p);
      }
      for (const [fid, x, z] of [['nat/flower_red', -2.2, 0.4], ['nat/flower_yellow', -2.4, -0.4], ['nat/flower_purple', 2.4, 0.5]] as const) {
        for (let i = 0; i < 3; i++) {
          const f = await modelObject(fid, 0.55);
          f.position.set(x + (i - 1) * 0.28, lift, z + (i % 2) * 0.25);
          g.add(f);
        }
      }
    } else if (id === 'barn') {
      const barn = await buildingObject('barn', LOT_W * 0.9);
      barn.position.set(-0.4, lift, -0.5);
      g.add(barn);
      const hay = await modelObject('bld/grain', LOT_W * 0.55);
      hay.position.set(1.7, lift, 1.5);
      g.add(hay);
      for (let i = 0; i < 4; i++) {
        const f = await modelObject('prop/fence_wood', 1.5);
        f.position.set(3.1, lift, 0.1 + i * 1.4);
        g.add(f);
      }
      const f2 = await modelObject('prop/fence_wood', 1.5);
      f2.position.set(2.4, lift, 3.3);
      f2.rotation.y = Math.PI / 2;
      g.add(f2);
      await this.animalsFor('barn', g);
    } else if (id === 'treasury') {
      const hall = await modelObject('bld/home_b', LOT_W * 0.78);
      hall.position.set(-1.0, lift, 0.1);
      g.add(hall);
      const tower = await modelObject('bld/tower', LOT_W * 0.5);
      tower.position.set(1.7, lift, -0.8);
      g.add(tower);
      // the clock the village waited for: a face on the two sides the camera sees, with turning hands
      const towerBox = new THREE.Box3().setFromObject(tower);
      const th = towerBox.max.y;
      const faceY = th * 0.62;
      for (const dir of [new THREE.Vector2(1, 0), new THREE.Vector2(0, 1)]) {
        const clock = new THREE.Group();
        clock.position.set(tower.position.x + dir.x * 0.5, faceY, tower.position.z + dir.y * 0.5);
        clock.rotation.y = Math.atan2(dir.x, dir.y);
        const face = new THREE.Mesh(geo().cyl(0.4, 0.4, 0.07, '#fff6e8', [0, 0, 0], 20, [Math.PI / 2, 0, 0]).cyl(0.44, 0.44, 0.05, PAL.gold, [0, 0, -0.012], 20, [Math.PI / 2, 0, 0]).build(), assets.vertexMaterial);
        const hour = new THREE.Group(), minute = new THREE.Group();
        hour.add(new THREE.Mesh(geo().box(0.05, 0.22, 0.03, PAL.black, [0, 0.11, 0.05]).build(), assets.vertexMaterial));
        minute.add(new THREE.Mesh(geo().box(0.035, 0.32, 0.03, PAL.black, [0, 0.16, 0.07]).build(), assets.vertexMaterial));
        clock.add(face, hour, minute);
        g.add(clock);
        this.hands.push({ hour, minute });
      }
      const flag = await tallObject('prop/banner_red', 2.0);
      flag.position.set(-2.4, lift, 1.5);
      const flag2 = await tallObject('prop/banner_green', 2.0);
      flag2.position.set(0.4, lift, 1.6);
      g.add(flag, flag2);
      for (const x of [-2.6, 2.4]) {
        const l = await tallObject('prop/lantern', 2.3);
        l.position.set(x, lift, 1.7);
        g.add(l);
      }
    } else {
      const m = await modelObject('bld/home_b', LOT_W * 0.8);
      m.position.y = lift;
      g.add(m);
    }
    return g;
  }

  /** The animals that come to live at the rebuilt shelter. */
  private async animalsFor(lot: string, parent: THREE.Object3D): Promise<void> {
    for (const [id, scale, x, z] of [['pet/cow', 0.55, 2.2, 1.2], ['pet/pig', 0.42, 2.4, 2.6], ['pet/chick', 0.3, 1.3, 2.4], ['pet/chick', 0.26, 1.9, 3.0]] as const) {
      try {
        const { root, clips } = await assets.animated(id);
        const holder = new THREE.Group();
        holder.add(root);
        root.scale.setScalar(scale);
        const mixer = new THREE.AnimationMixer(root);
        const find = (n: string) => { const c = clips.find((cl) => cl.name === n) ?? clips[0]; return c ? mixer.clipAction(c) : null; };
        const idle = find('idle'), walk = find('walk');
        idle?.play();
        holder.position.set(x, 0.17, z);
        parent.add(holder);
        this.animals.push({ root: holder, mixer, idle, walk, home: new THREE.Vector3(x, 0.17, z), target: new THREE.Vector3(x, 0.17, z), wait: Math.random() * 3, speed: 0.5 + Math.random() * 0.3, lot, moving: false });
      } catch (e) { console.warn('[square] animal could not be drawn', id, e); }
    }
  }

  // ---------------------------------------------------------------------------------------- scenery

  /** True when a point is clear of every lot in both layouts (and of the main street). */
  private clearOfLots(x: number, z: number, d: number): boolean {
    for (const mode of ['arc', 'street'] as const) for (const sp of Object.values(spotsFor(mode))) if (Math.hypot(x - sp.x, z - sp.z) < d) return false;
    // the main street of the narrow layout
    const [sx, sy] = [(x * U.x + z * U.y), (x * V.x + z * V.y)];
    return !(Math.abs(sx) < 3.6 && sy > 3 && sy < 26);
  }

  private async scatter(): Promise<void> {
    const g = this.group, r = rng(5150);
    const [icx, icz] = at(0, IC_SY);
    // lanterns between the lots and round the plaza
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.5;
      const l = await tallObject('prop/lantern', 2.3);
      l.position.set(Math.cos(a) * (R_PLAZA + 0.1), 0.14, Math.sin(a) * (R_PLAZA + 0.1));
      g.add(l);
    }
    // benches facing the fountain
    for (const a of [Math.PI * 0.25, Math.PI * 1.25, Math.PI * 0.75]) {
      const bench = await modelObject('prop/bench', 1.5);
      bench.position.set(Math.cos(a) * (R_PLAZA - 0.9), 0.15, Math.sin(a) * (R_PLAZA - 0.9));
      bench.rotation.y = -a - Math.PI / 2;
      g.add(bench);
    }
    // trees and bushes round the rim, with a gap for the jetty
    const jetty = Math.atan2(at(-9, -8)[1] - icz, at(-9, -8)[0] - icx);
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * Math.PI * 2 + r() * 0.1;
      if (Math.abs(Math.atan2(Math.sin(a - jetty), Math.cos(a - jetty))) < 0.32) continue;
      const d = R_ISLAND - 1.4 - r() * 2.4;
      const x = icx + Math.cos(a) * d, z = icz + Math.sin(a) * d;
      // keep clear of the lots and the plaza
      if (!this.clearOfLots(x, z, LOT_W * 0.95) || Math.hypot(x, z) < R_PLAZA + 1) continue;
      const id = (['nat/tree_default', 'nat/tree_oak', 'nat/tree_a', 'nat/tree_b', 'nat/tree_fat', 'nat/tree_simple'] as const)[Math.floor(r() * 6)];
      const t = await modelObject(id, 1.2 + r() * 0.9);
      t.position.set(x, 0, z);
      t.rotation.y = r() * Math.PI * 2;
      g.add(t);
    }
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, d = 6 + r() * (R_ISLAND - 8);
      const x = icx + Math.cos(a) * d, z = icz + Math.sin(a) * d;
      if (Math.hypot(x, z) < R_PLAZA + 1.2 || !this.clearOfLots(x, z, LOT_W * 0.9)) continue;
      const ids = ['nat/flower_red', 'nat/flower_yellow', 'nat/flower_purple', 'nat/bush', 'nat/grass_large'];
      const f = await modelObject(ids[Math.floor(r() * ids.length)], 0.5 + r() * 0.5);
      f.position.set(x, 0, z);
      g.add(f);
    }

    // the jetty and a boat: the way home
    const jx = icx + Math.cos(jetty) * (R_ISLAND - 0.2), jz = icz + Math.sin(jetty) * (R_ISLAND - 0.2);
    const jet = new THREE.Mesh(jettyGeometry(), assets.vertexMaterial);
    jet.position.set(jx, 0, jz);
    jet.rotation.y = Math.atan2(-Math.cos(jetty), -Math.sin(jetty)) + Math.PI;
    jet.receiveShadow = true;
    g.add(jet);
    const boat = new THREE.Mesh(boatGeometry(), assets.vertexMaterial);
    const out = new THREE.Vector2(Math.cos(jetty), Math.sin(jetty));
    boat.position.set(jx + out.x * 8.4 - out.y * 1.3, -CLIFF_H + 0.4, jz + out.y * 8.4 + out.x * 1.3);
    boat.rotation.y = -jetty + Math.PI / 2;
    boat.castShadow = true;
    g.add(boat);
    this.boat = boat;
  }

  private async buildVillagers(): Promise<void> {
    for (const lot of this.lots.values()) {
      const v = VILLAGER[lot.info.room.villager];
      if (!v) continue;
      try {
        const char = await Character.create(v.look, v.scale);
        const base = new THREE.Vector3();
        char.root.rotation.y = Math.PI / 4 + (Math.random() - 0.5) * 0.4;
        char.root.userData.speechHeight = 2.1;
        char.play('idle');
        this.group.add(char.root);
        const pick = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
        pick.position.copy(base).setY(1.0);
        pick.userData.villager = v.id;
        this.group.add(pick);
        this.pickers.push(pick);
        this.characters.push({ char, id: v.id, base, pick });
        lot.villager = { char, id: v.id, pick, base };
        this.placeLot(lot);
      } catch (e) { console.warn('[square] villager could not be drawn', v.id, e); }
    }
  }

  // ---------------------------------------------------------------------------------------- state

  /** Show each lot in the stage its room has reached. */
  refresh(): void {
    for (const lot of this.lots.values()) {
      const stage = restoration.stage(lot.info.id);
      if (stage === lot.stage) continue;
      lot.stage = stage;
      const key = (['ruin', 'a', 'b', 'c', 'done'] as const)[stage];
      for (const [k, v] of Object.entries(lot.variants)) if (v) v.visible = k === key;
      // a room that has no finished look yet (opens later) stays a ruin
      if (!lot.variants[key]) lot.variants.ruin!.visible = true;
    }
    for (const a of this.animals) a.root.visible = restoration.isDone(a.lot);
  }

  /** The room just finished: bounce it. */
  bounce(id: string): void {
    const lot = this.lots.get(id);
    if (!lot) return;
    gsap.timeline()
      .to(lot.holder.scale, { x: 1.12, y: 0.86, z: 1.12, duration: 0.1 })
      .to(lot.holder.scale, { x: 1, y: 1, z: 1, duration: 0.6, ease: 'elastic.out(1.4, 0.35)' });
  }

  /** World position above a lot (for labels and effects). */
  anchorOf(id: string): THREE.Vector3 | null {
    const lot = this.lots.get(id);
    return lot ? this.world(lot.anchor.x, lot.anchor.y, lot.anchor.z) : null;
  }
  groundOf(id: string): THREE.Vector3 | null {
    const lot = this.lots.get(id);
    return lot ? this.world(lot.info.x, 0.2, lot.info.z) : null;
  }

  /** What a tap hits: a room (its lot or board) or a villager, or nothing. */
  pick(ray: THREE.Ray): { room?: string; villager?: string } | null {
    this.raycaster.ray.copy(ray);
    this.group.updateMatrixWorld(true);
    // villagers first (they stand in front of the lots)
    const hits = this.raycaster.intersectObjects(this.pickers, false);
    if (!hits.length) return null;
    const ud = hits[0].object.userData as { room?: string; villager?: string };
    return ud.villager ? { villager: ud.villager } : ud.room ? { room: ud.room } : null;
  }

  villagerObject(id: string): THREE.Object3D | null { return this.characters.find((c) => c.id === id)?.char.root ?? null; }

  update(dt: number): void {
    if (this.disposed) return;
    this.t += dt;
    for (const c of this.characters) c.char.update(dt);
    // the animals amble about their yard
    for (const a of this.animals) {
      if (!a.root.visible) continue;
      a.mixer.update(dt);
      const pos = a.root.position;
      if (a.wait > 0) {
        a.wait -= dt;
        if (a.wait <= 0) { a.target.set(a.home.x + (Math.random() - 0.5) * 1.6, 0.17, a.home.z + (Math.random() - 0.5) * 1.0); this.setMoving(a, true); }
        continue;
      }
      const d = a.target.clone().sub(pos);
      const len = d.length();
      if (len < 0.08) { a.wait = 2 + Math.random() * 4; this.setMoving(a, false); continue; }
      d.divideScalar(len);
      pos.addScaledVector(d, Math.min(len, a.speed * dt));
      a.root.rotation.y = Math.atan2(d.x, d.z);
    }
    // the clock follows the real time
    if (this.hands.length) {
      const now = new Date();
      const m = now.getMinutes() + now.getSeconds() / 60, h = (now.getHours() % 12) + m / 60;
      for (const hd of this.hands) { hd.minute.rotation.z = -(m / 60) * Math.PI * 2; hd.hour.rotation.z = -(h / 12) * Math.PI * 2; }
    }
    if (this.boat) { this.boat.position.y = -CLIFF_H + 0.4 + Math.sin(this.t * 1.4) * 0.04; this.boat.rotation.z = Math.sin(this.t * 1.1) * 0.03; }
  }

  private setMoving(a: SquareView['animals'][number], moving: boolean): void {
    if (a.moving === moving) return;
    a.moving = moving;
    const from = moving ? a.idle : a.walk, to = moving ? a.walk : a.idle;
    from?.fadeOut(0.2);
    to?.reset().fadeIn(0.2).play();
  }

  dispose(): void {
    this.disposed = true;
    for (const c of this.characters) c.char.dispose();
  }
}
