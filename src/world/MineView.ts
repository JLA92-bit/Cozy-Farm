import * as THREE from 'three';
import gsap from 'gsap';
import { assets } from '../core/Assets';
import { VILLAGER, WILDLIFE } from '../data';
import { game } from '../systems/Game';
import { mine, layerOf, MINE_ENTRY, MINE_LIFT, type MineFloor, type MineRock } from '../systems/Mine';
import { wildlife } from '../systems/Wildlife';
import { geo, rng } from './Procedural';
import { Character } from './Character';
import { CLIFF_H, grassTop, islandBase, mergeStatic, modelObject, noise } from './SquareView';
import { boatGeometry, jettyGeometry } from './models/square';
import { crystal, holeGeometry, ladderGeometry, liftGeometry, lightShaftGeometry, mineCartGeometry, MINE_PROC } from './models/mine';
import { wildObject } from './Wild';

/**
 * 1.31 The Old Mine. Two places drawn here: the little island north of the farm with the mine entrance in its hill
 * (reached by boat), and the floor you are on underground, built again for each floor from the day's layout in
 * src/systems/Mine.ts. Underground there is no sky: the scene goes dark (Environment.cave) and torches, lanterns,
 * glowing crystals and drifting dust carry the light. Each layer has its own rock colours and mood.
 */
export const MINE_AT = { x: 0, z: -130 };
/** Where the floors are drawn (far from everything, so nothing else shows behind the cave). */
export const UNDER = new THREE.Vector3(1400, 0, 0);
const R_ISLE = 17;
/** Half the room: the walls stand just outside it. */
const WALL = 7.4;
const JETTY_ANGLE = Math.PI / 4;
/** The mine mouth on the island (island space): in the hill on the north side, looking at the camera. */
const MOUTH = { x: -3.2, z: -3.6 };

export const MODELS = [
  'mine/cliff-block-rock', 'mine/cliff-large-rock', 'mine/cliff-top-rock', 'mine/rock-largeb', 'mine/rock-larged', 'mine/rock-largef', 'mine/rock-smalld',
  'mine/rock-smalla', 'mine/rock-smallb', 'mine/rock-smalle', 'mine/rock-smallf', 'mine/rock-smallg', 'mine/rock-smallh', 'mine/rock-talla', 'mine/rock-tallb', 'mine/rock-tallc', 'mine/rock-talld',
  'mine/rock-talle', 'mine/stone-smalla', 'mine/stone-smallb', 'mine/stone-tallc', 'mine/detail_crystallarge', 'mine/detail_crystal', 'mine/mushroom-tangroup',
  'mine/torch_mounted', 'mine/barrel_large', 'mine/barrel_small', 'mine/barrel_small_stack', 'mine/box_large', 'mine/box_small', 'mine/box_stacked',
  'mine/crates_stacked', 'mine/wall_scaffold', 'mine/wall_open_scaffold', 'mine/keg', 'mine/lanternglass', 'mine/chest', 'mine/chest_gold', 'mine/pillar',
  'mine/column', 'mine/coin_stack_large', 'mine/coin_stack_small', 'mine/candle_triple', 'mine/campfire-stones', 'mine/ladderlong', 'mine/stairs_wood',
  'mine/rubble_half', 'nat/tree_default', 'nat/tree_a', 'nat/bush', 'nat/grass_large', 'nat/flower_yellow', 'prop/stones',
];

export interface MineHit { kind: 'rock' | 'down' | 'up' | 'lift' | 'cart' | 'pool' | 'chest' | 'wild' | 'entrance' | 'bram' | 'boat'; i: number; id?: string }

/** A layer's look: rock tones, the floor, the light. */
interface Pal {
  dark: THREE.Color; light: THREE.Color; top: THREE.Color; floor: THREE.Color; floorLight: THREE.Color;
  fog: THREE.Color; hemiSky: THREE.Color; hemiGround: THREE.Color; hemi: number; sun: number; sunColor: THREE.Color;
  torch: string; crystals: string[]; ores: string[]; motes: string; rise: number;
}
const C = (h: string) => new THREE.Color(h);
const PALS: Record<string, Pal> = {
  workings: {
    dark: C('#3a2a1f'), light: C('#b48a66'), top: C('#7e6850'), floor: C('#3a2b20'), floorLight: C('#56422f'), fog: C('#120b08'),
    hemiSky: C('#d8b08a'), hemiGround: C('#2e2016'), hemi: 0.95, sun: 0.7, sunColor: C('#ffe0b8'),
    torch: '#ffb055', crystals: ['#ffd27a', '#c7a6ff'], ores: ['#d9803f', '#9aa6b2', '#d9803f'], motes: '#ffd9a0', rise: 0.05,
  },
  caverns: {
    dark: C('#222842'), light: C('#8696cc'), top: C('#5a7c9a'), floor: C('#22263c'), floorLight: C('#343a5a'), fog: C('#070912'),
    hemiSky: C('#9aa8ff'), hemiGround: C('#1c2038'), hemi: 0.95, sun: 0.55, sunColor: C('#c4d0ff'),
    torch: '#ffc27a', crystals: ['#b48cff', '#6fd8ff', '#ff8fd0', '#7fffd4'], ores: ['#eef2f6', '#9aa6b2', '#d8e2ee'], motes: '#a8f0ff', rise: 0.04,
  },
  deeps: {
    dark: C('#2e1a14'), light: C('#a86a4c'), top: C('#6e4030'), floor: C('#2c1812'), floorLight: C('#46261a'), fog: C('#120604'),
    hemiSky: C('#e8b496'), hemiGround: C('#26120c'), hemi: 0.85, sun: 0.55, sunColor: C('#ffd0a8'),
    torch: '#ff9a48', crystals: ['#ffb347', '#ff7a3a', '#ffe08a'], ores: ['#ffcf3a', '#eef2f6', '#ffcf3a'], motes: '#ff9a50', rise: 0.35,
  },
};
export const palOf = (floor: number): Pal => PALS[layerOf(floor).id];

/**
 * A model's geometry re-tinted for the cave: every colour becomes a shade between the layer's dark and light rock
 * (grassy tops turn to dusty rock), darker towards the bottom like soot and shadow.
 */
function recolour(src: THREE.BufferGeometry, pal: Pal, seed: number, top = pal.top): THREE.BufferGeometry {
  const g = src.clone();
  const col = g.attributes.color as THREE.BufferAttribute;
  const pos = g.attributes.position as THREE.BufferAttribute;
  if (!g.boundingBox) g.computeBoundingBox();
  const y0 = g.boundingBox!.min.y, y1 = Math.max(y0 + 0.001, g.boundingBox!.max.y);
  const c = new THREE.Color(), r = rng(seed);
  const jitter = (r() - 0.5) * 0.12;
  for (let i = 0; i < col.count; i++) {
    const cr = col.getX(i), cg = col.getY(i), cb = col.getZ(i);
    const lum = cr * 0.3 + cg * 0.59 + cb * 0.11;
    const green = cg > cr * 1.12 && cg > cb * 1.05;
    if (green) c.copy(top);
    else c.copy(pal.dark).lerp(pal.light, THREE.MathUtils.clamp(lum * 1.15 + jitter, 0, 1));
    const yN = (pos.getY(i) - y0) / (y1 - y0);
    c.multiplyScalar(0.6 + 0.4 * yN);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
  return g;
}

let glowTex: THREE.Texture | null = null;
/** A soft round glow for sprites (torches, crystals, lamps). */
function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}
function glowSprite(colour: string, size: number, opacity = 0.8): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: colour, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size);
  s.renderOrder = 4;
  return s;
}

const emissiveMats = new Map<string, THREE.MeshLambertMaterial>();
/** A glowing material (crystals, lamp glass, embers). */
function glowMat(colour: string, k = 0.75): THREE.MeshLambertMaterial {
  const key = `${colour}|${k}`;
  let m = emissiveMats.get(key);
  if (!m) { m = new THREE.MeshLambertMaterial({ color: colour, emissive: colour, emissiveIntensity: k, vertexColors: true }); emissiveMats.set(key, m); }
  return m;
}

/** The invisible stand-in every tap target uses (one for all, never freed). */
const HIDDEN = new THREE.MeshBasicMaterial({ visible: false });
/** The hit dots over a rock: shared, since they are rebuilt on every swing. */
const PIP_GEO = new THREE.SphereGeometry(0.06, 8, 6);
const PIP_ON = new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true });
const PIP_OFF = new THREE.MeshBasicMaterial({ color: '#5a5a5a', depthTest: false, transparent: true });

/** Geometry that belongs to the asset cache (or is shared between floors): never freed when a floor is rebuilt. */
const SHARED = new WeakSet<THREE.BufferGeometry>();
SHARED.add(PIP_GEO);

/** A model's geometry (static, already loaded) placed into a builder with a transform. */
function placeGeo(id: string, pal: Pal | null, seed: number, pos: THREE.Vector3, rotY: number, scale: THREE.Vector3): THREE.Mesh | null {
  const m = assets.getStatic(id);
  if (!m) return null;
  const geom = pal && m.material === assets.vertexMaterial ? recolour(m.geometry, pal, seed) : m.geometry;
  if (geom === m.geometry) SHARED.add(geom);
  const mesh = new THREE.Mesh(geom, m.material);
  mesh.position.copy(pos);
  mesh.rotation.y = rotY;
  mesh.scale.copy(scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

interface RockNode { rock: MineRock; group: THREE.Group; body: THREE.Mesh; glow?: THREE.Object3D; pick: THREE.Mesh; pips: THREE.Mesh[]; h: number }
interface Light { light: THREE.PointLight; base: number; flicker: number; sprite?: THREE.Sprite; phase: number }

export class MineView {
  readonly group = new THREE.Group();
  /** the island above ground */
  readonly surface = new THREE.Group();
  /** the floor you are on */
  readonly under = new THREE.Group();
  floor: MineFloor | null = null;
  private floorStuff = new THREE.Group();
  private rocks: RockNode[] = [];
  private pickers: THREE.Object3D[] = [];
  private surfacePickers: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();
  private glintMat = new THREE.MeshBasicMaterial({ color: '#fff3c0', transparent: true, opacity: 0.95, depthWrite: false });
  private glintGeo = sharedGeo(new THREE.OctahedronGeometry(0.18, 0));
  private glints: { mesh: THREE.Mesh; y: number; show: () => boolean }[] = [];
  private lights: Light[] = [];
  private motes?: THREE.Points;
  private moteData: { x: number; y: number; z: number; v: number; p: number }[] = [];
  private shaft?: THREE.Mesh;
  private hole?: THREE.Group;
  private cart?: THREE.Mesh;
  private cartState = '';
  private chest?: THREE.Group;
  private chestState = '';
  private poolSparkles: THREE.Sprite[] = [];
  private poolDisc?: THREE.Mesh;
  private wild = new Map<string, { obj: THREE.Object3D; pick: THREE.Mesh; at: THREE.Vector3 }>();
  private boards?: THREE.Object3D;
  private mouthGlow?: THREE.Sprite;
  private bram?: { char: Character; pick: THREE.Mesh };
  private pickaxe?: THREE.Group;
  private chips: { mesh: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
  private chipGeo = new THREE.DodecahedronGeometry(0.07, 0);
  private t = 0;
  private built = false;

  constructor() {
    this.group.add(this.surface, this.under);
    this.under.add(this.floorStuff);
    this.surface.position.set(MINE_AT.x, 0, MINE_AT.z);
    this.under.position.copy(UNDER);
    this.under.visible = false;
    // four lights that the floors share (a steady count keeps the shaders from rebuilding between floors)
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight('#ffb055', 0, 9, 1.4);
      this.under.add(l);
      this.lights.push({ light: l, base: 0, flicker: 0, phase: i * 1.7 });
    }
  }

  /** World position of a point on the island. */
  islandPoint(x: number, y: number, z: number): THREE.Vector3 { return new THREE.Vector3(MINE_AT.x + x, y, MINE_AT.z + z); }
  /** World position of a point in the room underground. */
  roomPoint(x: number, y: number, z: number): THREE.Vector3 { return new THREE.Vector3(UNDER.x + x, UNDER.y + y, UNDER.z + z); }
  get islandCentre(): THREE.Vector3 { return this.islandPoint(0.5, 0, 0.5); }
  get roomCentre(): THREE.Vector3 { return this.roomPoint(0, 0, 0); }

  // ===================================================================================== the island

  async build(): Promise<void> {
    if (this.built) return;
    this.built = true;
    const g = this.surface;
    g.add(grassTop(0, 0, R_ISLE), islandBase(0, 0, R_ISLE));
    const scenery = new THREE.Group();
    g.add(scenery);
    const r = rng(3131);
    // the hill: craggy grey stone with grass on top, highest behind the mouth, the mouth set into its face
    const stone: Pal = { ...PALS.workings, dark: C('#6a635a'), light: C('#c2b8a8'), top: C('#7cbf4f') };
    const HC = { x: MOUTH.x - 2.6, z: MOUTH.z - 2.6 };
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2 + r() * 0.15;
      const d = 1.2 + r() * 5.2;
      const x = HC.x + Math.cos(a) * d, z = HC.z + Math.sin(a) * d;
      // leave the face in front of the mouth clear
      const toMouth = Math.atan2(MOUTH.z - HC.z, MOUTH.x - HC.x);
      if (Math.abs(Math.atan2(Math.sin(a - toMouth), Math.cos(a - toMouth))) < 0.5 && d > 1.5) continue;
      if (Math.hypot(x, z) > R_ISLE - 2) continue;
      const tall = 1 - d / 7;
      const id = i % 3 === 0 ? 'mine/rock-tallb' : 'mine/rock-talla';
      const m = assets.getStatic(id);
      if (!m) continue;
      const w = 2.6 + r() * 1.6, h = 1.6 + tall * 4.2 + r() * 1.2;
      const sx = w / Math.max(m.size.x, m.size.z);
      const mesh = placeGeo(id, stone, 4000 + i, new THREE.Vector3(x, -0.05, z), r() * Math.PI * 2, new THREE.Vector3(sx, h / m.size.y, sx));
      if (mesh) scenery.add(mesh);
    }
    // two shoulders either side of the mouth
    for (const s of [-1, 1]) {
      const m = assets.getStatic('mine/rock-talla');
      if (!m) continue;
      const mesh = placeGeo('mine/rock-talla', stone, 4100 + s, new THREE.Vector3(MOUTH.x - 0.6 + s * 2.0, -0.05, MOUTH.z - 0.6 - s * 2.0), r() * 6, new THREE.Vector3(2.6 / m.size.x, 3.4 / m.size.y, 2.6 / m.size.z));
      if (mesh) scenery.add(mesh);
    }
    // the mouth: a timber frame in the hill, darkness behind it
    const frame = await modelObject('mine/wall_open_scaffold', 3.2);
    frame.position.set(MOUTH.x, 0, MOUTH.z);
    frame.rotation.y = Math.PI / 4;
    scenery.add(frame);
    const dark = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.45, 2.6), new THREE.MeshBasicMaterial({ color: '#0a0706' }));
    dark.position.set(MOUTH.x - 1.15, 1.22, MOUTH.z - 1.15);
    dark.rotation.y = Math.PI / 4;
    g.add(dark);
    // rails out of the mouth, a cart full of ore, lanterns on posts, barrels and crates
    const rails = new THREE.Mesh(railsGeometry(7), assets.vertexMaterial);
    rails.position.set(MOUTH.x + 2.6, 0.02, MOUTH.z + 2.6);
    rails.rotation.y = Math.PI / 4 + Math.PI / 2;
    rails.receiveShadow = true;
    scenery.add(rails);
    const cart = new THREE.Mesh(mineCartGeometry('#c4743a', false), assets.vertexMaterial);
    cart.position.set(MOUTH.x + 4.4, 0.02, MOUTH.z + 4.4);
    cart.rotation.y = Math.PI / 4 + Math.PI / 2;
    cart.castShadow = true;
    scenery.add(cart);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(MINE_PROC.mine_lantern_post(), assets.vertexMaterial);
      post.position.set(MOUTH.x + 1.6 + s * 1.7, 0, MOUTH.z + 1.6 - s * 1.7);
      post.rotation.y = Math.PI / 4 - (s > 0 ? 0 : Math.PI);
      post.castShadow = true;
      scenery.add(post);
      const glow = glowSprite('#ffcf7a', 1.6, 0.55);
      glow.position.set(post.position.x + Math.cos(post.rotation.y) * 0.45, 1.33, post.position.z - Math.sin(post.rotation.y) * 0.45);
      g.add(glow);
    }
    for (const [id, x, z, w] of [['mine/barrel_small_stack', 1.2, -6.2, 1.4], ['mine/crates_stacked', -7.2, 0.2, 1.8], ['mine/box_small', 2.2, -4.8, 0.7], ['mine/keg', -6.2, 1.8, 0.8]] as const) {
      const o = await modelObject(id, w);
      o.position.set(x, 0, z);
      o.rotation.y = r() * Math.PI * 2;
      scenery.add(o);
    }
    // trees round the rim and bits of green
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + r() * 0.2, d = R_ISLE - 1.5 - r() * 2.2;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.abs(Math.atan2(Math.sin(a - JETTY_ANGLE), Math.cos(a - JETTY_ANGLE))) < 0.45) continue;
      if (x < 3 && z < 3 && Math.hypot(x + 2, z + 2) < 11) continue;
      const t = await modelObject(i % 2 ? 'nat/tree_default' : 'nat/tree_a', 1.6 + r() * 0.8);
      t.position.set(x, 0, z);
      t.rotation.y = r() * Math.PI * 2;
      scenery.add(t);
    }
    for (let i = 0; i < 24; i++) {
      const a = r() * Math.PI * 2, d = 3 + r() * (R_ISLE - 5);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.hypot(x + 2, z + 2) < 8 || Math.abs(Math.atan2(Math.sin(a - JETTY_ANGLE), Math.cos(a - JETTY_ANGLE))) < 0.3) continue;
      const ids = ['nat/bush', 'nat/grass_large', 'nat/flower_yellow', 'prop/stones', 'mine/rock-smallh'];
      const o = await modelObject(ids[i % ids.length], 0.5 + r() * 0.6);
      o.position.set(x, 0, z);
      o.rotation.y = r() * Math.PI * 2;
      scenery.add(o);
    }
    mergeStatic(scenery);
    // the boards across the mouth (until Bram's crew opens it) and a warm glow inside once open
    const boards = geo();
    for (let i = 0; i < 5; i++) boards.box(2.4, 0.22, 0.08, i % 2 ? '#8a5a33' : '#a8743a', [0, 0.5 + i * 0.5, 0], [0, 0, (i % 2 ? 0.12 : -0.1)]);
    boards.box(0.12, 2.8, 0.1, '#6a4428', [-0.9, 1.4, 0.05]).box(0.12, 2.8, 0.1, '#6a4428', [0.9, 1.4, 0.05]);
    this.boards = new THREE.Mesh(boards.build(), assets.vertexMaterial);
    this.boards.position.set(MOUTH.x + 0.35, 0, MOUTH.z + 0.35);
    this.boards.rotation.y = Math.PI / 4;
    g.add(this.boards);
    this.mouthGlow = glowSprite('#ffb055', 3.2, 0.5);
    this.mouthGlow.position.set(MOUTH.x - 0.6, 1.4, MOUTH.z - 0.6);
    g.add(this.mouthGlow);
    const mouthPick = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.4, 2.4), HIDDEN);
    mouthPick.position.set(MOUTH.x, 1.6, MOUTH.z);
    mouthPick.rotation.y = Math.PI / 4;
    mouthPick.userData = { kind: 'entrance', i: 0 } satisfies MineHit;
    g.add(mouthPick);
    this.surfacePickers.push(mouthPick);
    this.addGlint(this.surface, new THREE.Vector3(MOUTH.x + 0.4, 3.9, MOUTH.z + 0.4), () => this.surface.visible);
    // the jetty and the boat home
    const jx = Math.cos(JETTY_ANGLE) * (R_ISLE - 0.2), jz = Math.sin(JETTY_ANGLE) * (R_ISLE - 0.2);
    const jet = new THREE.Mesh(jettyGeometry(), assets.vertexMaterial);
    jet.position.set(jx, 0, jz);
    jet.rotation.y = Math.atan2(-Math.cos(JETTY_ANGLE), -Math.sin(JETTY_ANGLE)) + Math.PI;
    jet.receiveShadow = true;
    g.add(jet);
    const boat = new THREE.Mesh(boatGeometry(), assets.vertexMaterial);
    const out = new THREE.Vector2(Math.cos(JETTY_ANGLE), Math.sin(JETTY_ANGLE));
    boat.position.set(jx + out.x * 8.4 - out.y * 1.3, -CLIFF_H + 0.4, jz + out.y * 8.4 + out.x * 1.3);
    boat.rotation.y = -JETTY_ANGLE + Math.PI / 2;
    boat.castShadow = true;
    g.add(boat);
    const bp = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6), HIDDEN);
    bp.position.copy(boat.position);
    bp.userData = { kind: 'boat', i: 0 } satisfies MineHit;
    g.add(bp);
    this.surfacePickers.push(bp);
    // Bram, waiting by the mouth (he makes the pickaxes and cracks geodes)
    try {
      const v = VILLAGER.bram;
      const char = await Character.create(v.look, v.scale);
      char.root.position.set(MOUTH.x + 3.0, 0, MOUTH.z + 0.6);
      char.root.rotation.y = Math.PI / 4 + 0.4;
      g.add(char.root);
      const pick = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 2, 8), HIDDEN);
      pick.position.set(char.root.position.x, 1, char.root.position.z);
      pick.userData = { kind: 'bram', i: 0 } satisfies MineHit;
      g.add(pick);
      this.surfacePickers.push(pick);
      this.bram = { char, pick };
      this.addGlint(this.surface, new THREE.Vector3(char.root.position.x, 2.7, char.root.position.z), () => !!this.bram && mine.open && (mine.canBuyPickaxe() || (mine.open && this.hasGeodes())));
    } catch (e) { console.warn('[mine] Bram could not be drawn', e); }
    this.refreshSurface();
  }

  private hasGeodes(): boolean { return game.count('geode') > 0; }

  refreshSurface(): void {
    const open = mine.open;
    if (this.boards) this.boards.visible = !open;
    if (this.mouthGlow) this.mouthGlow.visible = open;
  }

  // ===================================================================================== a floor

  /** Build the room for a floor (behind the cloud wipe). */
  async showFloor(f: MineFloor): Promise<void> {
    this.floor = f;
    const pal = palOf(f.floor);
    const root = this.floorStuff;
    for (const c of [...root.children]) { root.remove(c); disposeTree(c); }
    this.rocks = [];
    this.pickers = [];
    this.glints = this.glints.filter((g) => isUnder(g.mesh, this.surface));
    this.wild.clear();
    this.poolSparkles = [];
    this.poolDisc = undefined;
    this.cart = undefined; this.cartState = '';
    this.chest = undefined; this.chestState = '';
    this.hole = undefined;
    const r = rng(f.seed);
    const layer = f.layer.id;

    // ---- the floor: a big bumpy plane, darker and rising towards the walls
    root.add(floorMesh(pal, f.seed));
    // ---- the walls: tall at the back (away from the camera), low rubble at the front so you can see in
    const walls = new THREE.Group();
    root.add(walls);
    // craggy spires of rock, overlapping, with blocks behind them to close the gaps
    for (const side of [0, 1]) {
      for (let k = 0; k < 11; k++) {
        const u = -WALL - 0.6 + k * 1.55 + r() * 0.5;
        const h = 3.4 + r() * 2.4 + (Math.abs(u) > 5 ? 0.6 : 0);
        const w = 2.5 + r() * 0.9;
        const inward = 0.7 + r() * 0.5;
        const pos = side === 0 ? new THREE.Vector3(-WALL - inward, -0.1, u) : new THREE.Vector3(u, -0.1, -WALL - inward);
        const id = k % 3 === 2 ? 'mine/rock-tallb' : 'mine/rock-talla';
        const m = assets.getStatic(id);
        if (!m) continue;
        const sx = w / Math.max(m.size.x, m.size.z);
        const spire = placeGeo(id, pal, f.seed + k * 13 + side * 101, pos, r() * Math.PI * 2, new THREE.Vector3(sx, h / m.size.y, sx));
        if (spire) walls.add(spire);
        const back = placeGeo('mine/cliff-block-rock', pal, f.seed + k * 17 + side * 7, side === 0 ? new THREE.Vector3(-WALL - 2.6, -0.1, u) : new THREE.Vector3(u, -0.1, -WALL - 2.6), r() * 0.4, new THREE.Vector3(2.6, h + 0.8 + r(), 2.4));
        if (back) walls.add(back);
        // rocky clutter at the foot of the wall
        const base = placeGeo(['mine/rock-talle', 'mine/rock-smallh', 'mine/rock-larged', 'mine/rock-smallg'][k % 4], pal, f.seed + k * 7 + side, pos.clone().add(side === 0 ? new THREE.Vector3(1.3 + r() * 0.4, 0, r() - 0.5) : new THREE.Vector3(r() - 0.5, 0, 1.3 + r() * 0.4)), r() * 6, new THREE.Vector3(1.1 + r() * 0.6, 0.7 + r() * 0.6, 1.1 + r() * 0.6));
        if (base) walls.add(base);
      }
    }
    // the back corner: a big pillar of rock
    const corner = placeGeo('mine/rock-talla', pal, f.seed + 5, new THREE.Vector3(-WALL - 1.0, -0.1, -WALL - 1.0), 0.3, new THREE.Vector3(3.6, 6.4, 3.6));
    if (corner) walls.add(corner);
    // the front: low rocks and rubble only
    for (const side of [0, 1]) {
      for (let k = 0; k < 8; k++) {
        const u = -WALL + 0.5 + k * 2.1 + r() * 0.5;
        const pos = side === 0 ? new THREE.Vector3(WALL + 0.6 + r() * 0.5, -0.05, u) : new THREE.Vector3(u, -0.05, WALL + 0.6 + r() * 0.5);
        const ids = ['mine/rock-larged', 'mine/rock-largef', 'mine/rock-largeb', 'mine/rock-talle', 'mine/rock-smallg'];
        const mesh = placeGeo(ids[(k + side) % ids.length], pal, f.seed + 300 + k + side * 50, pos, r() * 6, new THREE.Vector3(1.6 + r() * 0.8, 0.9 + r() * 0.9, 1.6 + r() * 0.8));
        if (mesh) walls.add(mesh);
      }
    }
    // pebbles and grit over the floor
    for (let i = 0; i < 18; i++) {
      const x = (r() - 0.5) * 13.5, z = (r() - 0.5) * 13.5;
      if (f.rocks.some((k) => Math.hypot(k.x - x, k.z - z) < 0.9) || Math.hypot(x - MINE_ENTRY.x, z - MINE_ENTRY.z) < 1.5) continue;
      const ids = ['mine/rock-smalla', 'mine/rock-smallb', 'mine/rock-smalld', 'mine/stone-smalla', 'mine/stone-smallb'];
      const id = ids[i % ids.length];
      const s = 0.35 + r() * 0.45;
      const mesh = placeGeo(id.startsWith('mine/stone') ? id.replace('stone', 'rock') : id, pal, f.seed + 500 + i, new THREE.Vector3(x, 0, z), r() * 6, new THREE.Vector3(s, s * 0.45, s));
      if (mesh) { mesh.castShadow = false; brighten(mesh.geometry, 0.7); walls.add(mesh); }
    }
    // ---- the layer's dressing (timber props and torches, crystals, braziers and pillars)
    const lightsAt: { pos: THREE.Vector3; colour: string; power: number; flicker: number; sprite: boolean }[] = [];
    if (layer === 'workings') await this.dressWorkings(walls, pal, r, lightsAt);
    else if (layer === 'caverns') this.dressCaverns(walls, pal, r, lightsAt, f);
    else await this.dressDeeps(walls, pal, r, lightsAt);
    mergeStatic(walls);

    // ---- the way up: a ladder against the back corner and the faint daylight down the shaft
    const up = new THREE.Mesh(ladderGeometry(6.5, 0.16), assets.vertexMaterial);
    up.position.set(MINE_ENTRY.x - 0.6, 0, MINE_ENTRY.z - 0.6);
    up.rotation.y = Math.PI / 4;
    up.castShadow = true;
    root.add(up);
    const shaftMat = ownMat(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: f.floor === 1 ? 0.32 : 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.shaft = new THREE.Mesh(lightShaftGeometry(), shaftMat);
    this.shaft.position.set(MINE_ENTRY.x - 0.4, 0, MINE_ENTRY.z - 0.4);
    this.shaft.renderOrder = 5;
    root.add(this.shaft);
    const upPick = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 3.2, 8), HIDDEN);
    upPick.position.set(MINE_ENTRY.x - 0.3, 1.6, MINE_ENTRY.z - 0.3);
    upPick.userData = { kind: 'up', i: 0 } satisfies MineHit;
    root.add(upPick);
    this.pickers.push(upPick);
    lightsAt.unshift({ pos: new THREE.Vector3(MINE_ENTRY.x, 2.6, MINE_ENTRY.z), colour: f.floor === 1 ? '#fff2d0' : pal.torch, power: f.floor === 1 ? 6 : 3, flicker: 0, sprite: false });

    // ---- the lift and its chest
    if (f.lift) {
      const lift = new THREE.Mesh(liftGeometry(), assets.vertexMaterial);
      lift.position.set(MINE_LIFT.x, 0, MINE_LIFT.z);
      lift.rotation.y = Math.PI / 4;
      lift.castShadow = true; lift.receiveShadow = true;
      root.add(lift);
      const lamp = glowSprite('#ffd27a', 1.4, 0.7);
      lamp.position.set(MINE_LIFT.x + 1.15, 1.9, MINE_LIFT.z);
      root.add(lamp);
      const lp = new THREE.Mesh(new THREE.BoxGeometry(2, 3.6, 2), HIDDEN);
      lp.position.set(MINE_LIFT.x, 1.8, MINE_LIFT.z);
      lp.userData = { kind: 'lift', i: 0 } satisfies MineHit;
      root.add(lp);
      this.pickers.push(lp);
      lightsAt.push({ pos: new THREE.Vector3(MINE_LIFT.x + 1.1, 2.1, MINE_LIFT.z + 0.4), colour: '#ffd27a', power: 3, flicker: 0.05, sprite: false });
      if (f.chest) {
        this.chest = new THREE.Group();
        this.chest.position.set(MINE_LIFT.x - 1.9, 0, MINE_LIFT.z + 0.9);
        this.chest.rotation.y = Math.PI / 4;
        root.add(this.chest);
        const cp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), HIDDEN);
        cp.position.set(this.chest.position.x, 0.6, this.chest.position.z);
        cp.userData = { kind: 'chest', i: 0 } satisfies MineHit;
        root.add(cp);
        this.pickers.push(cp);
        this.addGlint(root, new THREE.Vector3(this.chest.position.x, 1.6, this.chest.position.z), () => !!this.floor && !mine.chestOpened(this.floor.floor));
      }
    }
    // ---- the cart on its rails
    if (f.cart) {
      const rails = new THREE.Mesh(railsGeometry(9), assets.vertexMaterial);
      rails.position.set(f.cart.x, 0.01, 0);
      rails.rotation.y = f.cart.rot;
      rails.receiveShadow = true;
      root.add(rails);
      const cp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.8), HIDDEN);
      cp.position.set(f.cart.x, 0.7, f.cart.z);
      cp.userData = { kind: 'cart', i: 0 } satisfies MineHit;
      root.add(cp);
      this.pickers.push(cp);
      this.addGlint(root, new THREE.Vector3(f.cart.x, 1.6, f.cart.z), () => !!this.floor && !mine.cartUsed(this.floor.floor));
    }
    // ---- a still pool, lit from below
    if (f.pool) {
      const p = f.pool;
      const rim = geo();
      const rr = rng(f.seed + 9);
      // a cool crystal pool in the caverns, a warm amber spring in the deeps
      const warm = layer === 'deeps';
      const rimCols = warm ? ['#5a3424', '#74462e'] : ['#3a3c50', '#4a4c64'];
      for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; rim.sphere(0.22 + rr() * 0.12, rimCols[i % 2], [Math.cos(a) * (p.r + 0.1), 0.02, Math.sin(a) * (p.r + 0.1)], 0, [1, 0.5, 1]); }
      const rimMesh = new THREE.Mesh(rim.build(), assets.vertexMaterial);
      rimMesh.position.set(p.x, 0, p.z);
      rimMesh.receiveShadow = true;
      root.add(rimMesh);
      const water = new THREE.Mesh(new THREE.CircleGeometry(p.r, 28).rotateX(-Math.PI / 2), ownMat(new THREE.MeshLambertMaterial({ color: warm ? '#8a3c12' : '#0e3a52', emissive: warm ? '#ff7a24' : '#0f6a7a', emissiveIntensity: warm ? 0.6 : 0.55, transparent: true, opacity: 0.92 })));
      water.position.set(p.x, 0.04, p.z);
      root.add(water);
      this.poolDisc = water;
      // the pool lights its own corner whatever the light budget leaves it
      const halo = glowSprite(warm ? '#ff9a40' : '#5ff0ff', p.r * 3.2, warm ? 0.32 : 0.26);
      halo.position.set(p.x, 0.25, p.z);
      root.add(halo);
      for (let i = 0; i < 6; i++) {
        const s = glowSprite(warm ? '#ffd27a' : '#8ff8ff', 0.35, 0.8);
        const a = rr() * Math.PI * 2, d = rr() * p.r * 0.8;
        s.position.set(p.x + Math.cos(a) * d, 0.12, p.z + Math.sin(a) * d);
        s.userData.base = s.position.clone();
        root.add(s);
        this.poolSparkles.push(s);
      }
      // glow moss round the edge
      const moss = geo();
      for (let i = 0; i < 10; i++) { const a = rr() * Math.PI * 2; moss.sphere(0.08, warm ? '#ffc070' : '#7fffd4', [Math.cos(a) * (p.r + 0.35), 0.06, Math.sin(a) * (p.r + 0.35)], 0, [1.4, 0.5, 1.4]); }
      const mossMesh = new THREE.Mesh(moss.build(), glowMat(warm ? '#ffa64a' : '#4fe0b0', 0.9));
      mossMesh.position.set(p.x, 0, p.z);
      root.add(mossMesh);
      const pp = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, 0.6, 12), HIDDEN);
      pp.position.set(p.x, 0.3, p.z);
      pp.userData = { kind: 'pool', i: 0 } satisfies MineHit;
      root.add(pp);
      this.pickers.push(pp);
      this.addGlint(root, new THREE.Vector3(p.x, 1.3, p.z), () => !!this.floor && !mine.poolUsed(this.floor.floor));
      lightsAt.push({ pos: new THREE.Vector3(p.x, 0.6, p.z), colour: layer === 'deeps' ? '#ff9a50' : '#5ff0ff', power: 3.5, flicker: 0.03, sprite: false });
    }
    // ---- the rocks
    for (const rock of f.rocks) this.addRock(rock, pal, f);
    // ---- cave animals out today
    await this.addWild(f, pal);
    // ---- lights: the strongest few
    lightsAt.sort((a, b) => b.power - a.power);
    this.lights.forEach((l, k) => {
      // the first light is your own lantern (it follows the camera, see setLantern)
      if (k === 0) { l.light.color.set('#ffdcaa'); l.light.distance = 13; l.base = 4.2; l.flicker = 0.04; return; }
      const s = lightsAt[k - 1];
      if (l.sprite) { l.sprite.parent?.remove(l.sprite); l.sprite = undefined; }
      if (!s) { l.base = 0; l.light.intensity = 0; return; }
      l.light.position.copy(s.pos);
      l.light.color.set(s.colour);
      l.light.distance = 10;
      l.base = s.power;
      l.flicker = s.flicker;
    });
    // ---- drifting dust (embers rise in the Deeps)
    this.makeMotes(pal);
    this.refreshFloor();
  }

  private async dressWorkings(walls: THREE.Group, pal: Pal, r: () => number, lightsAt: { pos: THREE.Vector3; colour: string; power: number; flicker: number; sprite: boolean }[]): Promise<void> {
    // timber props against the back walls, each with a torch
    const spots: [number, number, number][] = [[-WALL + 0.35, -1.6, Math.PI / 2], [-WALL + 0.35, 3.4, Math.PI / 2], [1.4, -WALL + 0.35, 0], [-3.2, -WALL + 0.35, 0]];
    for (const [x, z, rot] of spots) {
      const frame = placeGeo('mine/wall_open_scaffold', null, 0, new THREE.Vector3(x, 0, z), rot, new THREE.Vector3(0.78, 0.78, 0.78));
      if (frame) walls.add(frame);
    }
    for (const [x, z, rot] of [spots[0], spots[2], spots[1]]) {
      const tx = x + (rot ? 0.45 : 0), tz = z + (rot ? 0 : 0.45);
      const torch = placeGeo('mine/torch_mounted', null, 0, new THREE.Vector3(tx, 1.55, tz), rot, new THREE.Vector3(0.75, 0.75, 0.75));
      if (torch) walls.add(torch);
      const flame = this.flame(pal.torch);
      flame.position.set(tx + (rot ? 0.32 : 0), 2.35, tz + (rot ? 0 : 0.32));
      this.floorStuff.add(flame);
      lightsAt.push({ pos: flame.position.clone().add(new THREE.Vector3(rot ? 0.5 : 0, 0, rot ? 0 : 0.5)), colour: pal.torch, power: 5, flicker: 0.22, sprite: true });
    }
    // crates, barrels and a lantern
    const props: [string, number, number, number][] = [['mine/barrel_small_stack', -WALL + 1.1, 5.4, 1.1], ['mine/crates_stacked', 4.6, -WALL + 1.2, 1.3], ['mine/barrel_small', 5.8, -WALL + 1.4, 0.65], ['mine/box_small', -WALL + 1.2, 0.8, 0.7], ['mine/keg', -WALL + 1.0, -4.0, 0.6]];
    for (const [id, x, z, w] of props) {
      const m = assets.getStatic(id);
      if (!m) continue;
      const s = w / Math.max(m.size.x, m.size.z);
      const mesh = placeGeo(id, null, 0, new THREE.Vector3(x, 0, z), r() * Math.PI * 2, new THREE.Vector3(s, s, s));
      if (mesh) walls.add(mesh);
    }
    const lantern = placeGeo('mine/lanternglass', null, 0, new THREE.Vector3(-WALL + 1.2, 0.7, 0.8), 0, new THREE.Vector3(1.6, 1.6, 1.6));
    if (lantern) { walls.add(lantern); const gl = glowSprite('#ffd27a', 1.1, 0.7); gl.position.set(-WALL + 1.2, 1.0, 0.8); this.floorStuff.add(gl); }
    // a stretch of old rail along the far wall and a leaning ladder
    const rails = new THREE.Mesh(railsGeometry(6), assets.vertexMaterial);
    rails.position.set(-1.5, 0.01, -WALL + 1.6);
    rails.receiveShadow = true;
    walls.add(rails);
    const lad = placeGeo('mine/ladderlong', null, 0, new THREE.Vector3(3.0, 0, -WALL + 0.7), 0.2, new THREE.Vector3(1.4, 1.4, 1.4));
    if (lad) { lad.rotation.x = -0.18; walls.add(lad); }
  }

  private dressCaverns(walls: THREE.Group, pal: Pal, r: () => number, lightsAt: { pos: THREE.Vector3; colour: string; power: number; flicker: number; sprite: boolean }[], f: MineFloor): void {
    // clusters of glowing crystals along the walls and in the corners
    const spots: [number, number, number][] = [[-WALL + 0.8, -5.4, 1.6], [-WALL + 0.6, 1.2, 1.2], [-WALL + 0.9, 5.2, 1.4], [-4.8, -WALL + 0.8, 1.3], [2.0, -WALL + 0.8, 1.7], [5.6, -WALL + 1.0, 1.1], [6.4, 3.0, 0.9], [2.4, 6.4, 0.8]];
    spots.forEach(([x, z, s], i) => {
      const colour = pal.crystals[i % pal.crystals.length];
      const cl = geo();
      const rr = rng(f.seed + i * 31);
      const n = 4 + Math.floor(rr() * 4);
      for (let k = 0; k < n; k++) crystal(cl, (0.1 + rr() * 0.12) * s, (0.6 + rr() * 1.3) * s, '#ffffff', [(rr() - 0.5) * 0.7 * s, 0, (rr() - 0.5) * 0.7 * s], [(rr() - 0.5) * 0.7, (rr() - 0.5) * 0.7]);
      const mesh = new THREE.Mesh(cl.build(), glowMat(colour, 0.85));
      mesh.position.set(x, 0, z);
      mesh.castShadow = true;
      mesh.userData.keep = true;
      this.floorStuff.add(mesh);
      const glow = glowSprite(colour, 2.6 * s, 0.45);
      glow.position.set(x, 0.9 * s, z);
      this.floorStuff.add(glow);
      if (i < 3) lightsAt.push({ pos: new THREE.Vector3(x + 0.8, 1.3, z + 0.8), colour, power: 4, flicker: 0.04, sprite: false });
    });
    // stalagmites
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2;
      const x = Math.cos(a) * (5.5 + r() * 1.2), z = Math.sin(a) * (5.5 + r() * 1.2);
      if (x > 3 && z > 3) continue;
      const mesh = placeGeo(i % 2 ? 'mine/rock-tallc' : 'mine/rock-talld', pal, f.seed + 900 + i, new THREE.Vector3(x, 0, z), r() * 6, new THREE.Vector3(1.5, 1.3 + r() * 1.3, 1.5));
      if (mesh) walls.add(mesh);
    }
    // glowing mushrooms
    for (let i = 0; i < 6; i++) {
      const m = assets.getStatic('mine/mushroom-tangroup');
      if (!m) break;
      const mesh = new THREE.Mesh(sharedGeo(m.geometry), glowMat('#9ff8e8', 0.6));
      const x = -WALL + 1 + r() * 2, z = -5 + r() * 10;
      mesh.position.set(i % 2 ? x : -5 + r() * 9, 0, i % 2 ? z : -WALL + 1 + r() * 2);
      mesh.scale.setScalar(2.2 + r());
      mesh.userData.keep = true;
      this.floorStuff.add(mesh);
    }
    // one old torch still burning
    const torch = placeGeo('mine/torch_mounted', null, 0, new THREE.Vector3(-WALL + 0.6, 1.5, -2.2), Math.PI / 2, new THREE.Vector3(0.75, 0.75, 0.75));
    if (torch) walls.add(torch);
    const flame = this.flame(pal.torch);
    flame.position.set(-WALL + 0.92, 2.3, -2.2);
    this.floorStuff.add(flame);
    lightsAt.push({ pos: new THREE.Vector3(-WALL + 1.4, 2.3, -2.2), colour: pal.torch, power: 3.5, flicker: 0.2, sprite: true });
  }

  private async dressDeeps(walls: THREE.Group, pal: Pal, r: () => number, lightsAt: { pos: THREE.Vector3; colour: string; power: number; flicker: number; sprite: boolean }[]): Promise<void> {
    // carved pillars along the back, amber crystals, braziers and old treasure
    for (const [x, z] of [[-WALL + 0.9, -3.2], [-WALL + 0.9, 2.6], [-2.4, -WALL + 0.9], [3.6, -WALL + 0.9]] as const) {
      const m = assets.getStatic('mine/pillar');
      if (!m) continue;
      const s = 0.62;
      const mesh = placeGeo('mine/pillar', null, 0, new THREE.Vector3(x, 0, z), 0, new THREE.Vector3(s, s, s));
      if (mesh) walls.add(mesh);
    }
    for (const [x, z] of [[-WALL + 1.6, 5.0], [5.4, -WALL + 1.6]] as const) {
      const bowl = placeGeo('mine/campfire-stones', pal, 3, new THREE.Vector3(x, 0, z), 0, new THREE.Vector3(2.2, 2.2, 2.2));
      if (bowl) walls.add(bowl);
      const flame = this.flame('#ff8a3a', 1.5);
      flame.position.set(x, 0.55, z);
      this.floorStuff.add(flame);
      const coals = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), glowMat('#ff5a1a', 1.0));
      coals.position.set(x, 0.05, z);
      coals.scale.y = 0.4;
      coals.userData.keep = true;
      this.floorStuff.add(coals);
      lightsAt.push({ pos: new THREE.Vector3(x + 0.6, 1.2, z + 0.6), colour: '#ff8a3a', power: 5.5, flicker: 0.25, sprite: true });
    }
    const spots: [number, number, number][] = [[-WALL + 0.8, -0.4, 1.2], [0.4, -WALL + 0.8, 1.4], [-5.6, -WALL + 1.0, 1.0], [6.2, -2.0, 0.8]];
    spots.forEach(([x, z, s], i) => {
      const colour = pal.crystals[i % pal.crystals.length];
      const cl = geo();
      const rr = rng(i * 97 + 5);
      for (let k = 0; k < 5; k++) crystal(cl, (0.1 + rr() * 0.1) * s, (0.5 + rr() * 1.1) * s, '#ffffff', [(rr() - 0.5) * 0.6 * s, 0, (rr() - 0.5) * 0.6 * s], [(rr() - 0.5) * 0.6, (rr() - 0.5) * 0.6]);
      const mesh = new THREE.Mesh(cl.build(), glowMat(colour, 0.8));
      mesh.position.set(x, 0, z);
      mesh.userData.keep = true;
      this.floorStuff.add(mesh);
      const glow = glowSprite(colour, 2.2 * s, 0.4);
      glow.position.set(x, 0.8 * s, z);
      this.floorStuff.add(glow);
    });
    for (const [id, x, z, w] of [['mine/coin_stack_large', -WALL + 1.4, -5.6, 0.6], ['mine/coin_stack_small', -WALL + 1.9, -5.0, 0.45], ['mine/candle_triple', 4.4, -WALL + 1.3, 0.45], ['mine/box_stacked', 6.0, -WALL + 1.5, 1.2]] as const) {
      const m = assets.getStatic(id);
      if (!m) continue;
      const s = w / Math.max(m.size.x, m.size.z);
      const mesh = placeGeo(id, null, 0, new THREE.Vector3(x, 0, z), r() * 6, new THREE.Vector3(s, s, s));
      if (mesh) walls.add(mesh);
    }
  }

  /** A little living flame: a bright core and a soft halo (sprites, so no shadow cost). */
  private flame(colour: string, size = 1): THREE.Group {
    const g = new THREE.Group();
    const halo = glowSprite(colour, 2.4 * size, 0.55);
    const core = glowSprite('#fff2c0', 0.55 * size, 0.95);
    core.position.y = 0.05;
    g.add(halo, core);
    g.userData.flame = true;
    return g;
  }

  private addRock(rock: MineRock, pal: Pal, f: MineFloor): void {
    const r = rng(rock.variant + 17);
    const ids: Record<string, string[]> = {
      stone: ['mine/rock-smallh', 'mine/rock-smalle', 'mine/rock-smallf', 'mine/rock-talle', 'mine/rock-smalld'],
      boulder: ['mine/rock-talla', 'mine/rock-tallb', 'mine/rock-larged', 'mine/rock-largef'],
      ore: ['mine/rock-tallb', 'mine/rock-talle', 'mine/rock-larged', 'mine/rock-smallh'],
      gem: ['mine/rock-talle', 'mine/rock-smallh', 'mine/rock-larged'],
      fossil: ['mine/rock-larged', 'mine/rock-largef', 'mine/rock-talle'],
      geode: ['mine/rock-smallh', 'mine/rock-smalle'],
    };
    const list = ids[rock.kind];
    const id = list[rock.variant % list.length];
    const m = assets.getStatic(id);
    const group = new THREE.Group();
    group.position.set(rock.x, 0, rock.z);
    group.rotation.y = rock.rot;
    const w = (rock.kind === 'boulder' ? 1.55 : rock.kind === 'stone' ? 0.95 : 1.25) * rock.size;
    const h = w * (rock.kind === 'stone' ? 0.6 : rock.kind === 'boulder' ? 0.8 : 0.72) * (0.85 + r() * 0.3);
    let body: THREE.Mesh;
    if (m) {
      // breakable rocks are a little lighter than the cave around them, so they read as the things to tap
      const geom = brighten(recolour(m.geometry, pal, rock.variant, pal.top.clone().lerp(pal.light, 0.4)), 1.22);
      body = new THREE.Mesh(geom, assets.vertexMaterial);
      body.scale.set(w / Math.max(m.size.x, m.size.z), h / m.size.y, w / Math.max(m.size.x, m.size.z));
    } else {
      body = new THREE.Mesh(new THREE.DodecahedronGeometry(w / 2, 0), assets.vertexMaterial);
    }
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    // what shows on the outside: ore nuggets, gem points, a fossil curl or a geode's crack
    let glow: THREE.Object3D | undefined;
    if (rock.kind === 'ore') {
      const b = geo();
      const col = pal.ores[rock.variant % pal.ores.length];
      for (let i = 0; i < 7; i++) {
        const a = r() * Math.PI * 2, rad = w * (0.22 + r() * 0.16);
        b.geometry(new THREE.DodecahedronGeometry(0.06 + r() * 0.05, 0), i % 3 === 2 ? pal.ores[(rock.variant + 1) % pal.ores.length] : col, [Math.cos(a) * rad, h * (0.35 + r() * 0.5), Math.sin(a) * rad]);
      }
      const nug = new THREE.Mesh(b.build(), glowMat('#ffffff', 0.15));
      group.add(nug);
    } else if (rock.kind === 'gem' || rock.kind === 'geode') {
      const b = geo();
      const colour = rock.kind === 'geode' ? '#b48cff' : pal.crystals[rock.variant % pal.crystals.length];
      const n = rock.kind === 'geode' ? 5 : 4;
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2, rad = rock.kind === 'geode' ? w * 0.12 : w * (0.1 + r() * 0.18);
        crystal(b, 0.05 + r() * 0.04, 0.22 + r() * 0.25, '#ffffff', [Math.cos(a) * rad, h * (rock.kind === 'geode' ? 0.55 : 0.7), Math.sin(a) * rad], [(r() - 0.5) * 0.9, (r() - 0.5) * 0.9]);
      }
      const gems = new THREE.Mesh(b.build(), glowMat(rock.kind === 'gem' && layerOf(f.floor).id === 'workings' ? ['#ffd27a', '#c7a6ff', '#e8f4ff'][rock.variant % 3] : colour, 0.9));
      group.add(gems);
      const s = glowSprite(colour, w * 1.4, 0.35);
      s.position.y = h * 0.85;
      group.add(s);
      glow = s;
    } else if (rock.kind === 'fossil') {
      const b = geo();
      const shell = new THREE.TorusGeometry(0.12, 0.035, 6, 14, Math.PI * 1.6);
      b.geometry(shell, '#efe2c4', [0, h * 0.55, w * 0.42], [0.3, 0, 0]);
      b.geometry(new THREE.TorusGeometry(0.06, 0.025, 5, 10, Math.PI * 1.5), '#e2d2b0', [0.02, h * 0.55, w * 0.44], [0.3, 0, 0.6]);
      group.add(new THREE.Mesh(b.build(), assets.vertexMaterial));
    }
    const pick = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(0.5, w * 0.6), Math.max(0.5, w * 0.6), Math.max(1.0, h + 0.4), 8), HIDDEN);
    pick.position.set(rock.x, Math.max(0.5, (h + 0.4) / 2), rock.z);
    pick.userData = { kind: 'rock', i: rock.i } satisfies MineHit;
    this.floorStuff.add(group, pick);
    this.pickers.push(pick);
    this.rocks[rock.i] = { rock, group, body, glow, pick, pips: [], h };
  }

  private async addWild(f: MineFloor, pal: Pal): Promise<void> {
    const want: { id: string; at: THREE.Vector3; yaw: number }[] = [];
    const layer = f.layer.id;
    if (f.floor % 3 === 1 || layer === 'workings') want.push({ id: 'cave_bat', at: new THREE.Vector3(-WALL + 0.5, 3.3, 3.4), yaw: Math.PI / 2 });
    if (layer === 'caverns') want.push({ id: 'glow_worm', at: new THREE.Vector3(1.0, 2.6, -WALL + 0.4), yaw: 0 });
    if (f.pool) want.push({ id: 'cave_salamander', at: new THREE.Vector3(f.pool.x - f.pool.r - 0.4, 0, f.pool.z + 0.3), yaw: Math.PI / 2 });
    for (const w of want) {
      const s = WILDLIFE.species.find((x) => x.id === w.id);
      if (!s || !wildlife.present(s.id)) continue;
      const obj = await wildObject(s);
      obj.position.copy(w.at);
      obj.rotation.y = w.yaw;
      if (w.id === 'glow_worm') obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.material = glowMat('#ffffff', 0.7); });
      this.floorStuff.add(obj);
      const pick = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), HIDDEN);
      pick.position.copy(w.at).add(new THREE.Vector3(0, 0.3, 0));
      pick.userData = { kind: 'wild', i: 0, id: s.id } satisfies MineHit;
      this.floorStuff.add(pick);
      this.pickers.push(pick);
      this.wild.set(s.id, { obj, pick, at: w.at.clone() });
      if (w.id === 'glow_worm') { const g = glowSprite('#7ff7ff', 1.6, 0.6); g.position.copy(w.at).add(new THREE.Vector3(0, 0.3, 0.2)); this.floorStuff.add(g); }
    }
    void pal;
  }

  private makeMotes(pal: Pal): void {
    if (this.motes) { this.under.remove(this.motes); this.motes.geometry.dispose(); (this.motes.material as THREE.Material).dispose(); }
    const n = 110;
    const pos = new Float32Array(n * 3);
    this.moteData = [];
    for (let i = 0; i < n; i++) this.moteData.push({ x: (Math.random() - 0.5) * 14, y: 0.2 + Math.random() * 4, z: (Math.random() - 0.5) * 14, v: 0.05 + Math.random() * 0.12, p: Math.random() * 6 });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: pal.motes, size: pal.rise > 0.1 ? 0.09 : 0.06, map: glowTexture(), transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
    this.motes = new THREE.Points(g, mat);
    this.motes.userData.rise = pal.rise;
    this.motes.frustumCulled = false;
    this.under.add(this.motes);
  }

  private addGlint(parent: THREE.Object3D, at: THREE.Vector3, show: () => boolean): void {
    const m = new THREE.Mesh(this.glintGeo, this.glintMat);
    m.position.copy(at);
    m.renderOrder = 6;
    parent.add(m);
    this.glints.push({ mesh: m, y: at.y, show });
  }

  /** Bring rocks, the hole, the cart, the chest and glints up to date with the day's state. */
  refreshFloor(): void {
    const f = this.floor;
    if (!f) return;
    for (const node of this.rocks) {
      if (!node) continue;
      const broken = mine.broken(f.floor, node.rock);
      node.group.visible = !broken;
      node.pick.visible = !broken;
      this.setPips(node);
    }
    // the hole down, once its rock is gone
    const found = mine.ladderFound(f);
    if (found && !this.hole) {
      const k = f.rocks[f.ladder];
      const hole = new THREE.Group();
      hole.add(new THREE.Mesh(holeGeometry(), assets.vertexMaterial));
      hole.position.set(k.x, 0.01, k.z);
      hole.rotation.y = Math.PI / 4;
      const glow = glowSprite('#ffe9a0', 1.4, 0.4);
      glow.position.y = 0.3;
      hole.add(glow);
      this.floorStuff.add(hole);
      const pick = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.2, 10), HIDDEN);
      pick.position.set(k.x, 0.6, k.z);
      pick.userData = { kind: 'down', i: 0 } satisfies MineHit;
      this.floorStuff.add(pick);
      this.pickers.push(pick);
      this.addGlint(this.floorStuff, new THREE.Vector3(k.x, 1.5, k.z), () => true);
      this.hole = hole;
    }
    if (f.cart) {
      const used = mine.cartUsed(f.floor);
      const key = used ? 'empty' : 'full';
      if (key !== this.cartState) {
        if (this.cart) { this.floorStuff.remove(this.cart); this.cart.geometry.dispose(); }
        const ore = f.layer.id === 'workings' ? '#c4743a' : f.layer.id === 'caverns' ? '#dfe4ea' : '#ffc83a';
        this.cart = new THREE.Mesh(mineCartGeometry(ore, used), assets.vertexMaterial);
        this.cart.position.set(f.cart.x, 0.02, f.cart.z);
        this.cart.rotation.y = f.cart.rot;
        this.cart.castShadow = true;
        this.floorStuff.add(this.cart);
        this.cartState = key;
      }
    }
    if (this.chest && f.chest) {
      const opened = mine.chestOpened(f.floor);
      const key = opened ? 'open' : 'shut';
      if (key !== this.chestState) {
        for (const c of [...this.chest.children]) this.chest.remove(c);
        const id = opened ? 'mine/chest' : 'mine/chest_gold';
        const m = assets.getStatic(id);
        if (m) {
          const s = 1.1 / Math.max(m.size.x, m.size.z);
          const mesh = new THREE.Mesh(sharedGeo(m.geometry), m.material);
          mesh.scale.setScalar(s);
          mesh.castShadow = true;
          this.chest.add(mesh);
          if (!opened) { const g = glowSprite('#ffd84a', 1.8, 0.45); g.position.y = 0.7; this.chest.add(g); }
        }
        this.chestState = key;
      }
    }
    for (const g of this.glints) g.mesh.visible = g.show();
  }

  /** Little dots over a rock that has been hit but not broken: how many swings are left. */
  private setPips(node: RockNode): void {
    const f = this.floor!;
    const need = mine.need(node.rock), hit = mine.hitsOn(f.floor, node.rock.i);
    const show = hit > 0 && hit < need;
    for (const p of node.pips) node.group.remove(p);
    node.pips = [];
    if (!show) return;
    for (let i = 0; i < need; i++) {
      const p = new THREE.Mesh(PIP_GEO, i < hit ? PIP_ON : PIP_OFF);
      p.position.set((i - (need - 1) / 2) * 0.18, node.h + 0.35, 0);
      p.renderOrder = 7;
      node.group.add(p);
      node.pips.push(p);
    }
    // keep the dots facing the camera: they sit on a line across the screen
    for (const p of node.pips) p.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4 - node.group.rotation.y);
  }

  // ===================================================================================== feedback

  /** The pickaxe swings at a rock; the rock shakes, chips fly; on a break it pops and bursts. */
  strike(i: number, broken: boolean, kind: string, effects: { dust(p: THREE.Vector3, n?: number, s?: number): void; sparkle(p: THREE.Vector3, c?: string, n?: number): void; ring(p: THREE.Vector3, s?: number, c?: string): void; burst(p: THREE.Vector3, c?: string, n?: number): void }): void {
    const node = this.rocks[i];
    const f = this.floor;
    if (!node || !f) return;
    const pal = palOf(f.floor);
    const at = this.roomPoint(node.rock.x, node.h * 0.6, node.rock.z);
    // the pickaxe comes down from the upper right
    const pk = this.pickaxeMesh();
    pk.position.set(node.rock.x + 0.7, node.h + 1.2, node.rock.z + 0.7);
    pk.rotation.set(0, Math.PI / 4, -1.1);
    pk.visible = true;
    gsap.killTweensOf(pk.rotation);
    gsap.to(pk.rotation, { z: 0.5, duration: 0.11, ease: 'power3.in', onComplete: () => { gsap.to(pk.rotation, { z: 0.2, duration: 0.18, ease: 'power1.out', onComplete: () => { pk.visible = false; } }); } });
    setTimeout(() => {
      this.chipsAt(node.rock.x, node.h * 0.7, node.rock.z, pal, broken ? 12 : 5);
      effects.dust(at.clone().setY(UNDER.y + 0.3), broken ? 10 : 4, broken ? 1.4 : 0.7);
      if (!broken) {
        gsap.fromTo(node.group.scale, { x: 1.08, y: 0.9, z: 1.08 }, { x: 1, y: 1, z: 1, duration: 0.35, ease: 'elastic.out(1.2, 0.4)' });
        gsap.fromTo(node.group.position, { x: node.rock.x + 0.05 }, { x: node.rock.x, duration: 0.2, ease: 'power1.out' });
        this.setPips(node);
        return;
      }
      gsap.to(node.group.scale, { x: 1.18, y: 1.18, z: 1.18, duration: 0.07, onComplete: () => { node.group.visible = false; node.group.scale.setScalar(1); } });
      if (kind === 'gem' || kind === 'geode') { effects.sparkle(at, pal.crystals[0], 16); effects.ring(at.clone().setY(UNDER.y), 2, pal.crystals[0]); }
      else if (kind === 'fossil') effects.ring(at.clone().setY(UNDER.y), 2.2, '#efe2c4');
      else if (kind === 'ore') effects.burst(at, pal.ores[0], 10);
      this.refreshFloor();
    }, 110);
  }

  private pickaxeMesh(): THREE.Group {
    const tier = mine.pickaxe();
    // a new pickaxe from Bram shows its own colour from the next swing
    if (this.pickaxe && this.pickaxe.userData.tier === tier) return this.pickaxe;
    if (this.pickaxe) { this.under.remove(this.pickaxe); disposeTree(this.pickaxe); }
    const head = ['#8a8f96', '#d9803f', '#b8c0c8', '#ffcf3a'][tier] ?? '#8a8f96';
    const b = geo();
    b.cyl(0.06, 0.07, 1.5, '#c48a50', [0, -0.75, 0], 6);
    b.cyl(0.075, 0.075, 0.25, '#7a4a2a', [0, -0.75, 0], 6);
    b.box(1.0, 0.14, 0.14, head, [0, 0.72, 0]);
    b.cone(0.09, 0.34, head, [0.64, 0.66, 0], 4, [0, 0, -Math.PI / 2 - 0.2]);
    b.cone(0.09, 0.34, head, [-0.64, 0.66, 0], 4, [0, 0, Math.PI / 2 + 0.2]);
    const g = new THREE.Group();
    // lit from inside a little so it reads against the dark rock
    const mesh = new THREE.Mesh(b.build(), glowMat('#ffffff', 0.35));
    mesh.position.y = 0.85;
    g.add(mesh);
    g.visible = false;
    g.userData.tier = tier;
    this.under.add(g);
    this.pickaxe = g;
    return g;
  }

  private chipsAt(x: number, y: number, z: number, pal: Pal, n: number): void {
    for (let k = 0; k < n; k++) {
      let mesh = this.chips.find((c) => c.life <= 0)?.mesh;
      if (!mesh) { mesh = new THREE.Mesh(this.chipGeo, new THREE.MeshLambertMaterial({ color: pal.light })); this.under.add(mesh); this.chips.push({ mesh, v: new THREE.Vector3(), life: 0 }); }
      const c = this.chips.find((q) => q.mesh === mesh)!;
      (mesh.material as THREE.MeshLambertMaterial).color.copy(k % 3 ? pal.light : pal.dark);
      mesh.position.set(x, y, z);
      mesh.scale.setScalar(0.6 + Math.random() * 0.9);
      mesh.visible = true;
      c.v.set((Math.random() - 0.5) * 3.2, 1.8 + Math.random() * 2.2, (Math.random() - 0.5) * 3.2);
      c.life = 0.8 + Math.random() * 0.3;
    }
  }

  // ===================================================================================== picking

  pick(ray: THREE.Ray): MineHit | null {
    this.raycaster.ray.copy(ray);
    this.group.updateMatrixWorld(true);
    const list = this.under.visible ? this.pickers.filter((p) => p.visible) : this.surfacePickers;
    const hits = this.raycaster.intersectObjects(list, false);
    return hits.length ? (hits[0].object.userData as MineHit) : null;
  }

  spotAt(hit: MineHit): THREE.Vector3 | null {
    const f = this.floor;
    if (hit.kind === 'entrance') return this.islandPoint(MOUTH.x, 1.5, MOUTH.z);
    if (hit.kind === 'bram' && this.bram) return this.islandPoint(this.bram.char.root.position.x, 1.6, this.bram.char.root.position.z);
    if (hit.kind === 'boat') return this.islandCentre;
    if (!f) return null;
    if (hit.kind === 'rock') { const k = f.rocks[hit.i]; return k ? this.roomPoint(k.x, 0.6, k.z) : null; }
    if (hit.kind === 'down') { const k = f.rocks[f.ladder]; return k ? this.roomPoint(k.x, 0.5, k.z) : null; }
    if (hit.kind === 'up') return this.roomPoint(MINE_ENTRY.x, 1.5, MINE_ENTRY.z);
    if (hit.kind === 'lift') return this.roomPoint(MINE_LIFT.x, 1.5, MINE_LIFT.z);
    if (hit.kind === 'cart' && f.cart) return this.roomPoint(f.cart.x, 0.9, f.cart.z);
    if (hit.kind === 'pool' && f.pool) return this.roomPoint(f.pool.x, 0.5, f.pool.z);
    if (hit.kind === 'chest' && this.chest) return this.roomPoint(this.chest.position.x, 0.8, this.chest.position.z);
    if (hit.kind === 'wild') { const w = this.wild.get(hit.id ?? ''); return w ? this.roomPoint(w.at.x, w.at.y + 0.3, w.at.z) : null; }
    return null;
  }

  /** Your lantern hangs a little above the middle of the view (world position of the camera target). */
  setLantern(target: THREE.Vector3): void {
    const l = this.lights[0]?.light;
    if (l) l.position.set(target.x - UNDER.x + 0.8, 3.4, target.z - UNDER.z + 0.8);
  }

  /** The layer's mood for Environment.cave. */
  caveLook(floor: number, distance: number): { sky: THREE.Color; near: number; far: number; hemiSky: THREE.Color; hemiGround: THREE.Color; hemi: number; sun: number; sunColor: THREE.Color } {
    const p = palOf(floor);
    return { sky: p.fog, near: distance + 4, far: distance + 26, hemiSky: p.hemiSky, hemiGround: p.hemiGround, hemi: p.hemi, sun: p.sun, sunColor: p.sunColor };
  }

  // ===================================================================================== animation

  update(dt: number): void {
    this.t += dt;
    const t = this.t;
    for (const g of this.glints) if (g.mesh.visible) { g.mesh.position.y = g.y + Math.sin(t * 2.4) * 0.08; g.mesh.rotation.y = t * 1.5; }
    if (this.bram && this.surface.visible) this.bram.char.update(dt);
    if (!this.under.visible) return;
    // torches flicker, crystals breathe
    for (const l of this.lights) {
      if (!l.base) continue;
      const k = 1 + Math.sin(t * 9 + l.phase) * l.flicker * 0.5 + Math.sin(t * 23 + l.phase * 3) * l.flicker * 0.3;
      l.light.intensity = l.base * k;
    }
    this.floorStuff.traverse((o) => {
      if (!o.userData.flame) return;
      const s = 1 + Math.sin(t * 11 + o.position.x) * 0.08 + Math.sin(t * 27 + o.position.z) * 0.05;
      o.scale.setScalar(s);
    });
    for (const s of this.poolSparkles) { const b = s.userData.base as THREE.Vector3; s.position.y = b.y + Math.sin(t * 1.5 + b.x) * 0.05; (s.material as THREE.SpriteMaterial).opacity = 0.4 + 0.4 * Math.sin(t * 2 + b.z * 3); }
    if (this.poolDisc) (this.poolDisc.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.5 + Math.sin(t * 0.8) * 0.08;
    if (this.shaft) (this.shaft.material as THREE.MeshBasicMaterial).opacity = ((this.floor?.floor ?? 2) === 1 ? 0.3 : 0.09) + Math.sin(t * 0.6) * 0.03;
    // dust drifts (embers rise)
    if (this.motes) {
      const rise = this.motes.userData.rise as number;
      const pos = this.motes.geometry.attributes.position as THREE.BufferAttribute;
      this.moteData.forEach((m, i) => {
        m.y += (rise + Math.sin(t * 0.7 + m.p) * 0.05) * dt * (rise > 0.1 ? 1.5 : 1);
        if (m.y > 4.6) m.y = 0.1;
        pos.setXYZ(i, m.x + Math.sin(t * 0.3 + m.p) * 0.4, m.y, m.z + Math.cos(t * 0.27 + m.p) * 0.4);
      });
      pos.needsUpdate = true;
    }
    // flying chips
    for (const c of this.chips) {
      if (c.life <= 0) continue;
      c.life -= dt;
      c.v.y -= 9.8 * dt;
      c.mesh.position.addScaledVector(c.v, dt);
      if (c.mesh.position.y < 0.05) { c.mesh.position.y = 0.05; c.v.multiplyScalar(0.4); c.v.y = Math.abs(c.v.y) * 0.3; }
      c.mesh.rotation.x += dt * 8; c.mesh.rotation.z += dt * 6;
      if (c.life <= 0) c.mesh.visible = false;
    }
  }
}

/** Rails on sleepers, `len` long along x. */
function railsGeometry(len: number): THREE.BufferGeometry {
  const b = geo();
  const n = Math.floor(len / 0.45);
  for (let i = 0; i <= n; i++) b.block(0.18, 0.05, 0.85, '#5e3a20', [-len / 2 + i * 0.45, 0, 0]);
  for (const z of [-0.28, 0.28]) b.block(len, 0.06, 0.06, '#8a8f96', [0, 0.05, z]);
  return b.build();
}

/** The cave floor: a bumpy plane that darkens and rises into the walls, with patches of grit. */
function floorMesh(pal: Pal, seed: number): THREE.Mesh {
  const S = 22, N = 44;
  const g = new THREE.PlaneGeometry(S, S, N, N).rotateX(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const n1 = noise(seed % 997 + 3), n2 = noise(seed % 991 + 7);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const edge = Math.max(Math.abs(x), Math.abs(z));
    const rise = THREE.MathUtils.smoothstep(edge, WALL - 1.2, WALL + 1.5);
    const bump = (n1(x * 0.9 + 20, z * 0.9 + 20) - 0.5) * 0.08;
    pos.setY(i, bump + rise * 1.4);
    const patch = n2(x * 0.45 + 10, z * 0.45 + 10);
    c.copy(pal.floor).lerp(pal.floorLight, THREE.MathUtils.clamp((patch - 0.35) * 1.6, 0, 1));
    // grit specks and a darker ring towards the walls
    if (((i * 2654435761) >>> 0) % 13 === 0) c.lerp(pal.light, 0.25);
    c.multiplyScalar(1 - rise * 0.35 - THREE.MathUtils.smoothstep(Math.hypot(x, z), 6, 11) * 0.2);
    c.toArray(col, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, assets.vertexMaterial);
  m.receiveShadow = true;
  return m;
}

function isUnder(o: THREE.Object3D, root: THREE.Object3D): boolean { for (let p = o.parent; p; p = p.parent) if (p === root) return true; return false; }

/** Scale a geometry's vertex colours (in place). */
function brighten(g: THREE.BufferGeometry, k: number): THREE.BufferGeometry {
  const col = g.attributes.color as THREE.BufferAttribute | undefined;
  if (!col) return g;
  for (let i = 0; i < col.count; i++) col.setXYZ(i, Math.min(1, col.getX(i) * k), Math.min(1, col.getY(i) * k), Math.min(1, col.getZ(i) * k));
  col.needsUpdate = true;
  return g;
}

function sharedGeo(g: THREE.BufferGeometry): THREE.BufferGeometry { SHARED.add(g); return g; }
/** A material made for one floor only: freed with it. */
function ownMat<M extends THREE.Material>(m: M): M { m.userData.own = true; return m; }

function disposeTree(o: THREE.Object3D): void {
  o.traverse((c) => {
    if ((c as THREE.Sprite).isSprite) { ((c as THREE.Sprite).material as THREE.Material).dispose(); return; }
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    // shared model geometries (from the asset cache) are kept; recoloured and built ones are freed
    if (m.geometry && !SHARED.has(m.geometry)) m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) if (mat?.userData.own) mat.dispose();
  });
}

