import * as THREE from 'three';
import { assets } from '../core/Assets';
import { CRITTERS, TREEHOUSE, WOODS, WOODS_REGIONS, WREN, type CritterDef } from '../data';
import { REGION_IDS, woods } from '../systems/Woods';
import { schedules } from '../systems/Schedules';
import { VILLAGERS } from '../data';
import { Character } from './Character';
import { museum } from '../systems/Museum';
import { expeditions } from '../systems/Expeditions';
import { geo, rng } from './Procedural';
import { costume, currentLook } from './FarmLook';
import { CLIFF_H, R_ISLAND, grassTop, islandBase, mergeStatic, modelObject } from './SquareView';
import { boatGeometry, jettyGeometry } from './models/square';
import { FURNISH_GEO, TREEHOUSE_Y, treehouseGeometry, elderOakGeometry, FORAGE_COLOR, hedgehogGeometry, owlGeometry, squirrelGeometry, stumpGeometry, treatGeometry, bridgeGeometry, dugGeometry, forageGeometry, moundGeometry, noticeBoardGeometry, panPoolGeometry, pedestalGeometry, pondGeometry, sapBucketGeometry, streamGeometry } from './models/woods';
import { restoration } from '../systems/Restoration';
import { game } from '../systems/Game';
import { critters } from '../systems/Critters';
import { canopyGlows, currentStage, stageOpen, stagesDone } from '../systems/Grove';
import { wildlife } from '../systems/Wildlife';
import { hasFurnishing, treehouseStage } from '../systems/Treehouse';
import { wildObject } from './Wild';
import { localDay } from '../systems/Progression';
import type { CharacterLook } from '../systems/State';

/**
 * The Wild Woods (1.9): a second little island in the same sea as the farm and the village square, reached by boat from
 * the farm's south beach. Trees round the rim and scattered inside, a quiet pond, forage spots that show today's plant
 * and dig mounds. What is where comes from src/systems/Woods.ts; this file only draws it and answers taps.
 */
export const WOODS_AT = { x: -130, z: 0 };
const JETTY_ANGLE = Math.PI / 4;
const POND = { x: -7.5, z: -6, r: 4.1 };
const TREES = ['nat/tree_default', 'nat/tree_oak', 'nat/tree_a', 'nat/tree_b', 'nat/tree_fat', 'nat/tree_simple'] as const;

export interface WoodsHit { kind: 'forage' | 'dig' | 'museum' | 'board' | 'villager' | 'trail' | 'pan' | 'tap' | 'firefly' | 'stump' | 'critter' | 'wren' | 'camp' | 'oak' | 'wild' | 'treehouse'; i: number; id?: string }
/** Fixed places in island space: the Museum at the top of the island and the expedition board at the landing. */
const MUSEUM_AT = { x: -1, z: -15 };
const BOARD_AT = { x: 10.5, z: 13.5 };
/** 1.20 the deer's feeding stump in the glade (east side, clear of the bridges and the landing). */
const GLADE_STUMP = { x: 15, z: -3 };
/** 1.21 the campsite: a fire, a log to sit on and (once pitched) a tent. */
const CAMP_AT = { x: 12.5, z: 5 };

interface ForageNode { i: number; group: THREE.Group; byItem: Map<string, THREE.Mesh>; glint: THREE.Mesh; pick: THREE.Mesh; at: THREE.Vector3 }
interface DigNode { i: number; mound: THREE.Mesh; dug: THREE.Mesh; glint: THREE.Mesh; pick: THREE.Mesh; at: THREE.Vector3 }

export const MODELS = [
  'nat/tree_default', 'nat/tree_oak', 'nat/tree_a', 'nat/tree_b', 'nat/tree_fat', 'nat/tree_simple', 'nat/rock_small', 'nat/bush', 'nat/grass_large',
  'nat/flower_red', 'nat/flower_yellow', 'nat/flower_purple', 'prop/lumber', 'prop/stones', 'bld/home_b', 'bld/tower', 'prop/banner_red', 'pet/deer', 'pet/fox', 'pet/bunny', 'bld/home_a', 'nat/campfire', 'nat/log', 'nat/tent',
];

/** Where the spots stand: spread over the island, away from the pond, the landing and each other. Same on every device. */
function layoutSpots(): { forage: THREE.Vector2[]; dig: THREE.Vector2[] } {
  const r = rng(1909);
  const all: THREE.Vector2[] = [];
  const total = WOODS.forage.spots + WOODS.dig.spots;
  for (let tries = 0; all.length < total && tries < 4000; tries++) {
    const a = r() * Math.PI * 2, d = 4.5 + r() * 12;
    const p = new THREE.Vector2(Math.cos(a) * d, Math.sin(a) * d);
    if (Math.abs(Math.atan2(Math.sin(a - JETTY_ANGLE), Math.cos(a - JETTY_ANGLE))) < 0.4) continue;
    if (Math.hypot(p.x - POND.x, p.y - POND.z) < POND.r + 1.6) continue;
    if (Math.hypot(p.x - MUSEUM_AT.x - 1.5, p.y - MUSEUM_AT.z - 1.5) < 8.5 || Math.hypot(p.x - BOARD_AT.x, p.y - BOARD_AT.z) < 4) continue;
    if (Math.hypot(p.x - GLADE_STUMP.x, p.y - GLADE_STUMP.z) < 3.4 || Math.hypot(p.x - CAMP_AT.x, p.y - CAMP_AT.z) < 4) continue;
    if (all.some((q) => q.distanceTo(p) < 3.2)) continue;
    all.push(p);
  }
  return { forage: all.slice(0, WOODS.forage.spots), dig: all.slice(WOODS.forage.spots) };
}

export class WoodsView {
  readonly group = new THREE.Group();
  /** forage spots by spot id (the glade's 0.., each region's REGION_IDS * k + i) */
  private forageNodes = new Map<number, ForageNode>();
  /** 1.19 the regions: bridges (whole and broken), trail signs, fireflies, pans and taps */
  private regionParts = new Map<string, { whole: THREE.Mesh; broken: THREE.Mesh; signDot: THREE.Mesh; sign: THREE.Vector3; centre: THREE.Vector3 }>();
  private fireflyNodes = new Map<number, { mesh: THREE.Mesh; pick: THREE.Mesh; base: THREE.Vector3 }>();
  private panNodes: { i: number; glint: THREE.Mesh; at: THREE.Vector3 }[] = [];
  private tapNodes = new Map<string, { glint: THREE.Mesh; at: THREE.Vector3 }>();
  private fireflyMat = new THREE.MeshBasicMaterial({ color: '#fff27a', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  private digNodes: DigNode[] = [];
  /** 1.20 a feeding stump per critter family, its waiting treat and its visitor */
  private stumps = new Map<string, { at: THREE.Vector3; treat: THREE.Mesh; glint: THREE.Mesh; critter: THREE.Object3D; pick: THREE.Mesh; treatKey: string }>();
  private treatGeos = new Map<string, THREE.BufferGeometry>();
  private wren?: { char: Character; pick: THREE.Mesh; glint: THREE.Mesh; cabin: THREE.Object3D };
  private wrenAt?: THREE.Vector3;
  private camp?: { tent: THREE.Object3D; fire: THREE.Sprite; flames: THREE.Mesh; glint: THREE.Mesh };
  /** 1.27 the treehouse in Whispering Pines: the tree and house (rebuilt as it grows) and its furnishings */
  private treehouse?: { mesh: THREE.Mesh; stage: number; furnish: Map<string, THREE.Mesh>; glow: THREE.Sprite; at: THREE.Vector3; glint: THREE.Mesh };
  /** 1.27 wild visitors for the Wildlife Album: where each stands today, by species */
  private wild = new Map<string, { obj: THREE.Object3D; pick: THREE.Mesh; base: THREE.Vector3; day: string }>();
  /** 1.23 the Elder Oak in the Ancient Grove: its look follows the stages grown, its canopy glows at night once grown */
  private oak?: { mesh: THREE.Mesh; stage: number; glow: THREE.Sprite; lights: THREE.Mesh[]; glint: THREE.Mesh; at: THREE.Vector3 };
  private pickers: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();
  private folk = new Map<string, { char: Character; pick: THREE.Mesh }>();
  private folkBusy = false;
  private folkIn = 0;
  private top?: THREE.Mesh;
  private plainTop?: Float32Array;
  private gems: { gem: THREE.Mesh; shelf: string }[] = [];
  private flag?: THREE.Object3D;
  private boardDot?: THREE.Mesh;
  private glintMat = new THREE.MeshBasicMaterial({ color: '#fffbe0', transparent: true, opacity: 0.9, depthWrite: false });
  private t = 0;
  private built = false;

  /** World position of a point on the island. */
  world(x: number, y: number, z: number): THREE.Vector3 { return new THREE.Vector3(WOODS_AT.x + x, y, WOODS_AT.z + z); }
  get centre(): THREE.Vector3 { return this.world(0, 0, 0); }
  get focus(): THREE.Vector3 { return this.world(-1, 0, -1); }

  async build(): Promise<void> {
    if (this.built) return;
    this.built = true;
    const g = this.group;
    g.position.set(WOODS_AT.x, 0, WOODS_AT.z);
    const top = grassTop(0, 0, R_ISLAND);
    this.top = top;
    this.plainTop = Float32Array.from((top.geometry.attributes.color as THREE.BufferAttribute).array as Float32Array);
    this.setLook(currentLook());
    g.add(top, islandBase(0, 0));
    const pond = new THREE.Mesh(pondGeometry(POND.r), assets.vertexMaterial);
    pond.position.set(POND.x, 0.02, POND.z);
    pond.receiveShadow = true;
    g.add(pond);

    const spots = layoutSpots();
    // trees: a thick rim and a scatter inside, never on a spot, the pond or the landing
    const scenery = new THREE.Group();
    g.add(scenery);
    const r = rng(2468);
    const clear = (x: number, z: number, gap: number): boolean =>
      [...spots.forage, ...spots.dig].every((p) => Math.hypot(p.x - x, p.y - z) > gap) && Math.hypot(x - POND.x, z - POND.z) > POND.r + 1.4
      && Math.hypot(x - MUSEUM_AT.x, z - MUSEUM_AT.z) > 6.5 && Math.hypot(x - BOARD_AT.x, z - BOARD_AT.z) > 3.2 && Math.hypot(x - GLADE_STUMP.x, z - GLADE_STUMP.z) > 2.6 && Math.hypot(x - CAMP_AT.x, z - CAMP_AT.z) > 3.4;
    const wedge = (a: number): boolean => Math.abs(Math.atan2(Math.sin(a - JETTY_ANGLE), Math.cos(a - JETTY_ANGLE))) < 0.34;
    for (let i = 0; i < 70; i++) {
      const rim = i < 30;
      const a = rim ? (i / 30) * Math.PI * 2 + r() * 0.12 : r() * Math.PI * 2;
      const d = rim ? R_ISLAND - 1.2 - r() * 3.2 : 6 + r() * (R_ISLAND - 10);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (wedge(a) || !clear(x, z, rim ? 1.2 : 2.6)) continue;
      const t = await modelObject(TREES[Math.floor(r() * TREES.length)], 1.5 + r() * 1.1);
      t.position.set(x, 0, z);
      t.rotation.y = r() * Math.PI * 2;
      scenery.add(t);
    }
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2, d = 3 + r() * (R_ISLAND - 5);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (wedge(a) || !clear(x, z, 1.6)) continue;
      const ids = ['nat/bush', 'nat/grass_large', 'nat/flower_red', 'nat/flower_yellow', 'nat/flower_purple', 'nat/rock_small', 'prop/stones', 'prop/lumber'];
      const id = ids[Math.floor(r() * ids.length)];
      const f = await modelObject(id, id === 'prop/lumber' ? 1.0 : 0.5 + r() * 0.6);
      f.position.set(x, 0, z);
      f.rotation.y = r() * Math.PI * 2;
      scenery.add(f);
    }
    mergeStatic(scenery);

    // the jetty and a boat: the way home
    const jx = Math.cos(JETTY_ANGLE) * (R_ISLAND - 0.2), jz = Math.sin(JETTY_ANGLE) * (R_ISLAND - 0.2);
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

    await this.buildMuseum();
    this.buildSpots(spots);
    await this.buildRegions();
    for (const c of CRITTERS.families) if (c.region === 'glade') await this.buildStump(c, new THREE.Vector2(GLADE_STUMP.x, GLADE_STUMP.z), Math.PI / 4);
    await this.buildCamp();
    await this.buildWild();
    this.refresh();
  }

  /** The Museum with its pedestals, and the expedition board by the landing. */
  private async buildMuseum(): Promise<void> {
    const g = this.group, mat = assets.vertexMaterial;
    const hall = await modelObject('bld/home_b', 7);
    hall.position.set(MUSEUM_AT.x, 0.02, MUSEUM_AT.z);
    hall.rotation.y = Math.PI / 4;
    const tower = await modelObject('bld/tower', 3.4);
    tower.position.set(MUSEUM_AT.x - 3.2, 0.02, MUSEUM_AT.z - 1.4);
    tower.rotation.y = Math.PI / 4;
    const dirt = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.2, 0.06, 20), new THREE.MeshLambertMaterial({ color: '#d8c8a6' }));
    dirt.position.set(MUSEUM_AT.x + 1.5, 0.01, MUSEUM_AT.z + 1.5);
    dirt.receiveShadow = true;
    g.add(dirt, hall, tower);
    // a pedestal for every shelf, a gem lights up when the shelf is full
    const ped = pedestalGeometry(), gemGeo = new THREE.OctahedronGeometry(0.2, 0);
    const colours = ['#7fd0ff', '#d9b27c', '#ffc93c', '#7fd05a', '#4fa9ff', '#ffd84a'];
    museum.shelves().forEach((s, k) => {
      // 1.20 more than six shelves: two rows, so they stay inside the museum yard
      const n = museum.shelves().length, perRow = n > 6 ? Math.ceil(n / 2) : n, row = Math.floor(k / perRow), i = k % perRow;
      const off = (i - (perRow - 1) / 2) * 1.15 * Math.SQRT1_2, back = row * 1.25 * Math.SQRT1_2;
      const px = MUSEUM_AT.x + 4.6 + off - back, pz = MUSEUM_AT.z + 4.6 - off - back;
      const m = new THREE.Mesh(ped, mat);
      m.position.set(px, 0.04, pz);
      m.scale.setScalar(1.3);
      m.castShadow = true;
      const gem = new THREE.Mesh(gemGeo, new THREE.MeshLambertMaterial({ color: colours[k % colours.length], emissive: colours[k % colours.length], emissiveIntensity: 0.45 }));
      gem.position.set(px, 1.15, pz);
      gem.visible = false;
      g.add(m, gem);
      this.gems.push({ gem, shelf: s.id });
    });
    const flag = await modelObject('prop/banner_red', 1.2);
    flag.position.set(MUSEUM_AT.x + 3.4, 0.02, MUSEUM_AT.z + 3.4);
    flag.visible = false;
    g.add(flag);
    this.flag = flag;
    const pick = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 5, 10), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.set(MUSEUM_AT.x + 0.5, 2.5, MUSEUM_AT.z + 0.5);
    pick.userData = { kind: 'museum', i: 0 };
    g.add(pick);
    this.pickers.push(pick);
    // the board
    const board = new THREE.Mesh(noticeBoardGeometry(), mat);
    board.position.set(BOARD_AT.x, 0.02, BOARD_AT.z);
    board.rotation.y = Math.PI / 4;
    board.scale.setScalar(1.3);
    board.castShadow = true;
    g.add(board);
    const dot = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), this.glintMat);
    dot.position.set(BOARD_AT.x, 3.6, BOARD_AT.z);
    dot.visible = false;
    g.add(dot);
    this.boardDot = dot;
    const bp = new THREE.Mesh(new THREE.BoxGeometry(3, 3.2, 1.6), new THREE.MeshBasicMaterial({ visible: false }));
    bp.position.set(BOARD_AT.x, 1.6, BOARD_AT.z);
    bp.userData = { kind: 'board', i: 0 };
    g.add(bp);
    this.pickers.push(bp);
  }

  private buildSpots(spots: { forage: THREE.Vector2[]; dig: THREE.Vector2[] }): void {
    const mat = assets.vertexMaterial;
    const glintGeo = new THREE.OctahedronGeometry(0.13, 0);
    // one geometry per wild plant, shared by every spot
    const geos = new Map<string, THREE.BufferGeometry>();
    for (const e of WOODS.foraged) if (!geos.has(e.id)) geos.set(e.id, forageGeometry(e.kind, FORAGE_COLOR[e.id] ?? '#7fd05a', e.id));
    spots.forage.forEach((p, i) => {
      const group = new THREE.Group();
      group.position.set(p.x, 0.02, p.y);
      group.rotation.y = i * 1.7;
      group.scale.setScalar(1.7);
      const byItem = new Map<string, THREE.Mesh>();
      for (const [id, gm] of geos) { const m = new THREE.Mesh(gm, mat); m.visible = false; m.castShadow = true; group.add(m); byItem.set(id, m); }
      const glint = new THREE.Mesh(glintGeo, this.glintMat);
      glint.position.set(0, 0.9, 0);
      group.add(glint);
      this.group.add(group);
      const pick = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 1.6, 8), new THREE.MeshBasicMaterial({ visible: false }));
      pick.position.set(p.x, 0.8, p.y);
      pick.userData = { kind: 'forage', i };
      this.group.add(pick);
      this.pickers.push(pick);
      this.forageNodes.set(i, { i, group, byItem, glint, pick, at: new THREE.Vector3(p.x, 0.5, p.y) });
    });
    const mg = moundGeometry(), dg = dugGeometry();
    spots.dig.forEach((p, i) => {
      const mound = new THREE.Mesh(mg, mat), dug = new THREE.Mesh(dg, mat);
      for (const m of [mound, dug]) { m.position.set(p.x, 0.02, p.y); m.scale.setScalar(1.8); m.rotation.y = i * 2.1; m.receiveShadow = true; this.group.add(m); }
      mound.castShadow = true;
      const glint = new THREE.Mesh(glintGeo, this.glintMat);
      glint.position.set(p.x, 1.3, p.y);
      this.group.add(glint);
      const pick = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 1.4, 8), new THREE.MeshBasicMaterial({ visible: false }));
      pick.position.set(p.x, 0.7, p.y);
      pick.userData = { kind: 'dig', i };
      this.group.add(pick);
      this.pickers.push(pick);
      this.digNodes.push({ i, mound, dug, glint, pick, at: new THREE.Vector3(p.x, 0.5, p.y) });
    });
  }

  // ---------------------------------------------------------------------------------------- 1.19 regions

  /**
   * The Deep Woods: an island per region round the glade with its own trees, a footbridge to it (broken until its
   * trail is restored), a trail sign at the glade end, its forage spots and its feature (fireflies, pans or taps).
   */
  private async buildRegions(): Promise<void> {
    const mat = assets.vertexMaterial;
    const glintGeo = new THREE.OctahedronGeometry(0.13, 0);
    const SCENERY: Record<string, { trees: string[]; props: string[] }> = {
      hollow: { trees: ['nat/tree_detailed', 'nat/tree_fat', 'nat/tree_oak', 'nat/tree_default'], props: ['nat/mushroom', 'nat/mushroom_tan', 'nat/log', 'nat/stump_old', 'nat/bush_large', 'nat/grass_large'] },
      creek: { trees: ['nat/tree_default', 'nat/tree_simple', 'nat/tree_small', 'nat/tree_a'], props: ['nat/rock_a', 'nat/rock_b', 'nat/rock_c', 'nat/waterplant', 'nat/grass_large', 'nat/bush'] },
      pines: { trees: ['nat/tree_pine', 'nat/tree_pine', 'nat/tree_pine', 'nat/tree_b'], props: ['nat/rock_tall', 'nat/log_stack', 'nat/stump_round', 'nat/rock_large', 'nat/grass_large'] },
    };
    for (const [k, reg] of WOODS_REGIONS.entries()) {
      const [ax, az] = reg.at;
      const dist = Math.hypot(ax, az);
      const dir = new THREE.Vector2(ax / dist, az / dist), side = new THREE.Vector2(-dir.y, dir.x);
      this.group.add(grassTop(ax, az, reg.r), islandBase(ax, az, reg.r));
      // the footbridge from the glade's shore to the region's
      const from = R_ISLAND - 0.8, len = dist - reg.r + 0.8 - from;
      const bridge = (broken: boolean): THREE.Mesh => {
        const m = new THREE.Mesh(bridgeGeometry(len, broken), mat);
        m.position.set(dir.x * from, -0.06, dir.y * from);
        m.rotation.y = Math.atan2(-dir.y, dir.x);
        m.castShadow = true; m.receiveShadow = true;
        this.group.add(m);
        return m;
      };
      const whole = bridge(false), broken = bridge(true);
      // the trail sign at the glade end
      const sx = dir.x * (R_ISLAND - 2.8) + side.x * 2.2, sz = dir.y * (R_ISLAND - 2.8) + side.y * 2.2;
      const board = new THREE.Mesh(noticeBoardGeometry(), mat);
      board.position.set(sx, 0.02, sz);
      board.rotation.y = Math.PI / 4;
      board.scale.setScalar(1.2);
      board.castShadow = true;
      this.group.add(board);
      const signDot = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), this.glintMat);
      signDot.position.set(sx, 3.4, sz);
      this.group.add(signDot);
      const sp = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.2, 1.6), new THREE.MeshBasicMaterial({ visible: false }));
      sp.position.set(sx, 1.6, sz);
      sp.rotation.y = Math.PI / 4;
      sp.userData = { kind: 'trail', i: k, id: reg.id };
      this.group.add(sp);
      this.pickers.push(sp);
      this.regionParts.set(reg.id, { whole, broken, signDot, sign: new THREE.Vector3(sx, 0, sz), centre: new THREE.Vector3(ax, 0, az) });

      // places on the island: the feature first, then forage spots, then trees round them
      const r = rng(7700 + k * 131);
      const taken: THREE.Vector2[] = [];
      const free = (p: THREE.Vector2, gap: number) => taken.every((q) => q.distanceTo(p) > gap);
      const spot = (minD: number, maxD: number, gap: number): THREE.Vector2 | null => {
        for (let t = 0; t < 400; t++) {
          const a = r() * Math.PI * 2, d = minD + r() * (maxD - minD);
          const p = new THREE.Vector2(ax + Math.cos(a) * d, az + Math.sin(a) * d);
          // keep the bridge landing clear
          if (Math.hypot(p.x - (ax - dir.x * reg.r), p.y - (az - dir.y * reg.r)) < 3) continue;
          if (free(p, gap)) { taken.push(p); return p; }
        }
        return null;
      };
      const scenery = new THREE.Group();
      this.group.add(scenery);
      if (reg.feature === 'panning' && reg.pan) {
        // a stream across the island, with the panning pools on its bank
        const pts: [number, number][] = [[-reg.r + 1.2, -2.5], [-4, 1.5], [1, -1], [5, 1.8], [reg.r - 1.2, 0.5]].map(([x, z]) => [ax + x * side.x + z * dir.x, az + x * side.y + z * dir.y] as [number, number]);
        const stream = new THREE.Mesh(streamGeometry(pts, 1.3), mat);
        stream.receiveShadow = true;
        this.group.add(stream);
        for (const [x, z] of pts) taken.push(new THREE.Vector2(x, z));
        for (let i = 0; i < reg.pan.spots; i++) {
          const [x0, z0] = pts[i + 1];
          const at = new THREE.Vector2(x0 + dir.x * 1.9, z0 + dir.y * 1.9);
          taken.push(at);
          const pool = new THREE.Mesh(panPoolGeometry(), mat);
          pool.position.set(at.x, 0.02, at.y);
          pool.receiveShadow = true;
          this.group.add(pool);
          const glint = new THREE.Mesh(glintGeo, this.glintMat);
          glint.position.set(at.x, 0.9, at.y);
          this.group.add(glint);
          const pick = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.2, 8), new THREE.MeshBasicMaterial({ visible: false }));
          pick.position.set(at.x, 0.6, at.y);
          pick.userData = { kind: 'pan', i, id: reg.id };
          this.group.add(pick);
          this.pickers.push(pick);
          this.panNodes.push({ i, glint, at: new THREE.Vector3(at.x, 0.5, at.y) });
        }
        for (let i = 0; i < 10; i++) {
          const [x, z] = pts[i % pts.length];
          const p = await modelObject(i % 2 ? 'nat/waterlily' : 'nat/waterplant', 0.7 + r() * 0.4);
          p.position.set(x + (r() - 0.5) * 1.6, 0.05, z + (r() - 0.5) * 1.6);
          scenery.add(p);
        }
      }
      if (reg.feature === 'taps' && reg.taps) {
        // the old tapped trees in a ring, a bucket at each foot
        const bucket = sapBucketGeometry();
        for (let i = 0; i < reg.taps.count; i++) {
          const a = (i / reg.taps.count) * Math.PI * 2 + 0.3, d = reg.r * 0.55;
          const p = new THREE.Vector2(ax + Math.cos(a) * d, az + Math.sin(a) * d);
          taken.push(p);
          const tree = await modelObject('nat/tree_pine', 2.2);
          tree.position.set(p.x, 0, p.y);
          scenery.add(tree);
          const bx = p.x + 0.75, bz = p.y + 0.75;
          const b = new THREE.Mesh(bucket, mat);
          b.position.set(bx, 0, bz);
          b.castShadow = true;
          this.group.add(b);
          const glint = new THREE.Mesh(glintGeo, this.glintMat);
          glint.position.set(bx, 1.2, bz);
          this.group.add(glint);
          const pick = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 2.6, 8), new THREE.MeshBasicMaterial({ visible: false }));
          pick.position.set(bx - 0.35, 1.3, bz - 0.35);
          pick.userData = { kind: 'tap', i, id: `${reg.id}:${i}` };
          this.group.add(pick);
          this.pickers.push(pick);
          this.tapNodes.set(`${reg.id}:${i}`, { glint, at: new THREE.Vector3(bx, 0.5, bz) });
        }
      }
      // 1.23 the Elder Oak in the middle of the Ancient Grove, with a clearing round it
      if (reg.feature === 'oak') {
        const c = new THREE.Vector2(ax, az);
        taken.push(c);
        for (let k = 0; k < 10; k++) taken.push(new THREE.Vector2(ax + Math.cos(k * Math.PI / 5) * 4.4, az + Math.sin(k * Math.PI / 5) * 4.4));
        this.buildOak(new THREE.Vector3(ax, 0, az));
      }
      // 1.20 Wren's cabin (far side from the bridge) and a feeding stump for each critter family living here
      if (reg.id === WREN.region) {
        const cab = new THREE.Vector2(ax + dir.x * 4.2, az + dir.y * 4.2);
        // the cabin is about 4.4 wide: keep stumps, spots and trees off it and off the front of it
        taken.push(cab);
        for (let k = 0; k < 8; k++) taken.push(new THREE.Vector2(cab.x + Math.cos(k * Math.PI / 4) * 3.2, cab.y + Math.sin(k * Math.PI / 4) * 3.2));
        taken.push(new THREE.Vector2(ax + dir.x * 1.6 + side.x * 2.2, az + dir.y * 1.6 + side.y * 2.2));
        await this.buildWren(cab, new THREE.Vector2(ax + dir.x * 1.6 + side.x * 2.2, az + dir.y * 1.6 + side.y * 2.2), Math.atan2(-dir.x, -dir.y));
      }
      // 1.27 the treehouse in the great pine, to the side of the island
      if (reg.id === TREEHOUSE.region) {
        const th = new THREE.Vector2(ax - side.x * 5.4 - dir.x * 1.5, az - side.y * 5.4 - dir.y * 1.5);
        taken.push(th);
        for (let k = 0; k < 8; k++) taken.push(new THREE.Vector2(th.x + Math.cos(k * Math.PI / 4) * 2.6, th.y + Math.sin(k * Math.PI / 4) * 2.6));
        this.buildTreehouse(new THREE.Vector3(th.x, 0, th.y));
      }
      for (const c of CRITTERS.families) if (c.region === reg.id) {
        const p = spot(3, reg.r - 3.6, 3.4);
        // keep the camera's side of the stump clear of trees so the visitor can be seen
        if (p) { taken.push(new THREE.Vector2(p.x + 2.2, p.y + 2.2)); await this.buildStump(c, p, Math.PI / 4 + (r() - 0.5)); }
      }
      // forage spots
      const geos = new Map<string, THREE.BufferGeometry>();
      for (const e of reg.foraged) geos.set(e.id, forageGeometry(e.kind, FORAGE_COLOR[e.id] ?? '#7fd05a', e.id));
      for (let i = 0; i < reg.forage.spots; i++) {
        const p = spot(2.5, reg.r - 2.4, 2.6);
        if (!p) continue;
        const id = REGION_IDS * (k + 1) + i;
        const group = new THREE.Group();
        group.position.set(p.x, 0.02, p.y);
        group.rotation.y = i * 1.7;
        group.scale.setScalar(1.7);
        const byItem = new Map<string, THREE.Mesh>();
        for (const [fid, gm] of geos) { const m = new THREE.Mesh(gm, mat); m.visible = false; m.castShadow = true; group.add(m); byItem.set(fid, m); }
        const glint = new THREE.Mesh(glintGeo, this.glintMat);
        glint.position.set(0, 0.9, 0);
        group.add(glint);
        this.group.add(group);
        const pick = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 1.6, 8), new THREE.MeshBasicMaterial({ visible: false }));
        pick.position.set(p.x, 0.8, p.y);
        pick.userData = { kind: 'forage', i: id };
        this.group.add(pick);
        this.pickers.push(pick);
        this.forageNodes.set(id, { i: id, group, byItem, glint, pick, at: new THREE.Vector3(p.x, 0.5, p.y) });
      }
      if (reg.feature === 'fireflies' && reg.fireflies) {
        const fly = new THREE.SphereGeometry(0.11, 8, 6);
        for (const f of woods.fireflies(reg.id)) {
          const p = spot(1.5, reg.r - 2, 1.4) ?? new THREE.Vector2(ax, az);
          const base = new THREE.Vector3(p.x, 1.3 + r() * 1.2, p.y);
          const mesh = new THREE.Mesh(fly, this.fireflyMat);
          mesh.position.copy(base);
          mesh.renderOrder = 3;
          this.group.add(mesh);
          const pick = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
          pick.position.copy(base);
          pick.userData = { kind: 'firefly', i: f.id };
          this.group.add(pick);
          this.pickers.push(pick);
          this.fireflyNodes.set(f.id, { mesh, pick, base });
        }
      }
      // trees round the rim and a scatter inside, props between
      const sc = SCENERY[reg.id] ?? SCENERY.hollow;
      // the Pines keep a clearing round their tapped trees so the buckets can be seen
      const inner = reg.feature === 'taps' || reg.feature === 'oak' ? [reg.r * 0.78, reg.r - 2.4] : [2, reg.r - 3];
      for (let i = 0; i < 28; i++) {
        const rim = i < 18;
        const p = spot(rim ? reg.r - 2.2 : inner[0], rim ? reg.r - 0.8 : inner[1], rim ? 1.3 : 2.4);
        if (!p) continue;
        const t = await modelObject(sc.trees[Math.floor(r() * sc.trees.length)], 1.5 + r() * 1.2);
        t.position.set(p.x, 0, p.y);
        t.rotation.y = r() * Math.PI * 2;
        scenery.add(t);
      }
      for (let i = 0; i < 16; i++) {
        const p = spot(1.5, reg.r - 1.5, 1.4);
        if (!p) continue;
        const id = sc.props[Math.floor(r() * sc.props.length)];
        const o = await modelObject(id, id.includes('log') || id.includes('rock_large') ? 1.3 : 0.6 + r() * 0.5);
        o.position.set(p.x, 0, p.y);
        o.rotation.y = r() * Math.PI * 2;
        scenery.add(o);
      }
      mergeStatic(scenery);
    }
  }

  /** 1.23 the Elder Oak: the tree (rebuilt as it grows), a soft glow and floating lights for its canopy at night. */
  private buildOak(at: THREE.Vector3): void {
    const mesh = new THREE.Mesh(elderOakGeometry(0), assets.vertexMaterial);
    mesh.position.copy(at);
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.group.add(mesh);
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(190,255,170,0.9)');
    grad.addColorStop(1, 'rgba(120,255,160,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7, depthTest: false }));
    glow.position.set(at.x, 6.6, at.z);
    glow.renderOrder = 4;
    glow.scale.setScalar(13);
    glow.visible = false;
    this.group.add(glow);
    const lights: THREE.Mesh[] = [];
    const dot = new THREE.SphereGeometry(0.12, 8, 6);
    for (let i = 0; i < 22; i++) {
      const m = new THREE.Mesh(dot, this.fireflyMat);
      // round the edge of the full crown, high and low, so they are seen from any side
      const a = i * 2.39, d = 4.3 + (i % 4) * 0.6;
      m.position.set(at.x + Math.cos(a) * d, 2.4 + (i % 6) * 1.0, at.z + Math.sin(a) * d);
      m.userData.base = m.position.clone();
      m.renderOrder = 3;
      m.visible = false;
      this.group.add(m);
      lights.push(m);
    }
    const glint = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), this.glintMat);
    glint.position.set(at.x, 1.8, at.z + 1.9);
    this.group.add(glint);
    const pick = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 8, 10), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.set(at.x, 4, at.z);
    pick.userData = { kind: 'oak', i: 0 };
    this.group.add(pick);
    this.pickers.push(pick);
    this.oak = { mesh, stage: 0, glow, lights, glint, at };
  }

  private refreshOak(): void {
    const o = this.oak;
    if (!o) return;
    const stage = stagesDone();
    if (stage !== o.stage) { o.mesh.geometry.dispose(); o.mesh.geometry = elderOakGeometry(stage); o.stage = stage; }
    const h = new Date(game.now()).getHours();
    const night = canopyGlows() && (h >= 19 || h < 6);
    o.glow.visible = night;
    for (const l of o.lights) l.visible = night;
    const cur = currentStage();
    o.glint.visible = woods.regionOpen('grove') && !!cur && stageOpen(cur.id);
  }

  /** 1.27 the treehouse: one mesh that grows by stage, a mesh per furnishing, the lamp's glow at night. */
  private buildTreehouse(at: THREE.Vector3): void {
    const mat = assets.vertexMaterial;
    const mesh = new THREE.Mesh(treehouseGeometry(0), mat);
    mesh.position.copy(at);
    // the cabin's door faces the camera
    mesh.rotation.y = Math.PI / 4;
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.group.add(mesh);
    const furnish = new Map<string, THREE.Mesh>();
    for (const [name, make] of Object.entries(FURNISH_GEO)) {
      const m = new THREE.Mesh(make(), mat);
      m.visible = false;
      m.castShadow = true;
      mesh.add(m);
      furnish.set(name, m);
    }
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g2 = c.getContext('2d')!;
    const grad = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,230,160,1)');
    grad.addColorStop(1, 'rgba(255,200,120,0)');
    g2.fillStyle = grad;
    g2.fillRect(0, 0, 64, 64);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
    glow.position.set(at.x, TREEHOUSE_Y + 1.0, at.z);
    glow.scale.setScalar(4);
    glow.visible = false;
    this.group.add(glow);
    const glint = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), this.glintMat);
    glint.position.set(at.x + 1.4, 1.8, at.z + 1.4);
    this.group.add(glint);
    const pick = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 6, 10), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.set(at.x, 3, at.z);
    pick.userData = { kind: 'treehouse', i: 0 };
    this.group.add(pick);
    this.pickers.push(pick);
    this.treehouse = { mesh, stage: 0, furnish, glow, at, glint };
  }

  private refreshTreehouse(): void {
    const t = this.treehouse;
    if (!t) return;
    const stage = treehouseStage();
    if (stage !== t.stage) { t.mesh.geometry.dispose(); t.mesh.geometry = treehouseGeometry(stage); t.stage = stage; }
    for (const [name, m] of t.furnish) m.visible = hasFurnishing(name);
    const h = new Date(game.now()).getHours();
    t.glow.visible = (hasFurnishing('lamp') || hasFurnishing('lanterns')) && (h >= 19 || h < 6);
    const open = [...TREEHOUSE.stages, ...TREEHOUSE.furnishings].some((r) => restoration.isOpen(r.id) && !restoration.isDone(r.id));
    t.glint.visible = woods.regionOpen(TREEHOUSE.region) && open;
  }

  /** 1.27 the Wild Woods' visitors (hidden until they are out): one object each, placed afresh every day. */
  private async buildWild(): Promise<void> {
    for (const s of wildlife.species().filter((x) => x.place !== 'farm')) {
      try {
        const obj = await wildObject(s);
        obj.visible = false;
        const pick = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
        pick.userData = { kind: 'wild', i: 0, id: s.id };
        pick.visible = false;
        this.group.add(obj, pick);
        this.pickers.push(pick);
        this.wild.set(s.id, { obj, pick, base: new THREE.Vector3(), day: '' });
      } catch (e) { console.warn('[woods] wild visitor could not be drawn', s.id, e); }
    }
  }

  /** Where a visitor stands today: in the glade between the landmarks, or round its region's island. */
  private wildSpot(place: string, t: number): THREE.Vector3 {
    if (place === 'glade') {
      const GLADE = [[-4, 9], [5, -10], [-14, 5], [3, 17], [-10, -14], [17, 6]];
      const [x, z] = GLADE[Math.floor(t * GLADE.length) % GLADE.length];
      return new THREE.Vector3(x, 0.02, z);
    }
    const c = this.regionParts.get(place)?.centre;
    if (!c) return new THREE.Vector3();
    // round the island's middle, clear of the oak (the panda naps beside it)
    const a = t * Math.PI * 2, d = place === 'grove' ? 5.2 : 5.5 + (t * 7 % 1) * 2.5;
    return new THREE.Vector3(c.x + Math.cos(a) * d, 0.02, c.z + Math.sin(a) * d);
  }

  private refreshWild(): void {
    const day = localDay(game.now());
    for (const [id, w] of this.wild) {
      const s = wildlife.def(id);
      if (!s) continue;
      if (w.day !== day) {
        w.day = day;
        w.base.copy(this.wildSpot(s.place, wildlife.spot(s)));
        w.obj.position.copy(w.base);
        w.obj.rotation.y = Math.PI / 4 + (wildlife.spot(s) - 0.5);
        w.pick.position.set(w.base.x, 0.8, w.base.z);
      }
      const here = wildlife.present(id);
      w.obj.visible = here;
      w.pick.visible = here;
    }
  }

  /** 1.21 the campsite in the glade: a campfire and a log, and a tent while it is pitched. */
  private async buildCamp(): Promise<void> {
    const fire = await modelObject('nat/campfire', 1.8);
    fire.position.set(CAMP_AT.x, 0.02, CAMP_AT.z);
    const log = await modelObject('nat/log', 1.8);
    log.position.set(CAMP_AT.x - 1.5, 0.02, CAMP_AT.z + 1.2);
    log.rotation.y = 0.6;
    const tent = await modelObject('nat/tent', 2.6);
    tent.position.set(CAMP_AT.x + 1.2, 0.02, CAMP_AT.z - 2.2);
    tent.rotation.y = Math.PI / 4 + Math.PI;
    tent.visible = false;
    this.group.add(fire, log, tent);
    // the fire's glow (made the same way as the lantern glow)
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,170,80,1)');
    grad.addColorStop(1, 'rgba(255,90,10,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
    glow.position.set(CAMP_AT.x, 0.8, CAMP_AT.z);
    glow.scale.setScalar(2.6);
    glow.visible = false;
    this.group.add(glow);
    const glint = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), this.glintMat);
    glint.position.set(CAMP_AT.x, 2.6, CAMP_AT.z);
    this.group.add(glint);
    const pick = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 2.4, 10), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.set(CAMP_AT.x, 1.2, CAMP_AT.z - 0.6);
    pick.userData = { kind: 'camp', i: 0 };
    this.group.add(pick);
    this.pickers.push(pick);
    // flames, lit in the evening and while someone is camping
    const flames = new THREE.Mesh(geo()
      .cone(0.32, 0.9, '#ff7a1a', [0, 0.1, 0], 6).cone(0.2, 0.7, '#ffb21a', [0.12, 0.1, 0.08], 6).cone(0.18, 0.6, '#ffd84a', [-0.12, 0.1, -0.06], 6)
      .build(), new THREE.MeshBasicMaterial({ vertexColors: true }));
    flames.position.set(CAMP_AT.x, 0.02, CAMP_AT.z);
    flames.visible = false;
    this.group.add(flames);
    this.camp = { tent, fire: glow, flames, glint };
  }

  /** 1.20 a feeding stump with a spot for the treat, and the family's visitor (hidden until it comes). */
  private async buildStump(c: CritterDef, p: THREE.Vector2, turn: number): Promise<void> {
    const mat = assets.vertexMaterial;
    const stump = new THREE.Mesh(stumpGeometry(), mat);
    stump.position.set(p.x, 0.02, p.y);
    stump.scale.setScalar(1.5);
    stump.castShadow = true; stump.receiveShadow = true;
    this.group.add(stump);
    const treat = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    treat.position.copy(stump.position);
    treat.scale.setScalar(1.5);
    treat.visible = false;
    this.group.add(treat);
    const glint = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), this.glintMat);
    glint.position.set(p.x, 1.5, p.y);
    this.group.add(glint);
    // the visitor stands beside the stump on the camera's side, turned half towards the camera
    const off = new THREE.Vector2(Math.cos(turn), Math.sin(turn)).multiplyScalar(c.id === 'deer' ? 2.1 : 1.35);
    const critter = await this.critterObject(c);
    critter.position.set(p.x + off.x, 0.02, p.y + off.y);
    critter.rotation.y = Math.PI / 4 + (turn - Math.PI / 4) * 2 + 0.5;
    critter.visible = false;
    this.group.add(critter);
    const pick = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 1.8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.set(p.x, 0.9, p.y);
    pick.userData = { kind: 'stump', i: 0, id: c.id };
    this.group.add(pick);
    this.pickers.push(pick);
    const cp = new THREE.Mesh(new THREE.SphereGeometry(1.0, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    cp.position.set(critter.position.x, 0.7, critter.position.z);
    cp.userData = { kind: 'critter', i: 0, id: c.id };
    cp.visible = false;
    this.group.add(cp);
    this.pickers.push(cp);
    this.stumps.set(c.id, { at: new THREE.Vector3(p.x, 0, p.y), treat, glint, critter, pick: cp, treatKey: '' });
  }

  /** The visitor's model: a modelled pet (deer, fox, rabbit) or a small procedural one. */
  private async critterObject(c: CritterDef): Promise<THREE.Object3D> {
    const proc: Record<string, () => THREE.BufferGeometry> = { 'proc:hedgehog': hedgehogGeometry, 'proc:squirrel': squirrelGeometry, 'proc:owl': owlGeometry };
    if (proc[c.model]) {
      const g = new THREE.Group();
      const m = new THREE.Mesh(proc[c.model](), assets.vertexMaterial);
      m.castShadow = true;
      m.scale.setScalar(2.1);
      g.add(m);
      return g;
    }
    return modelObject(c.model, c.id === 'deer' ? 1.9 : 1.25);
  }

  /** 1.20 Wren the ranger's cabin in Whispering Pines, with Wren outside it. */
  private async buildWren(cabin: THREE.Vector2, at: THREE.Vector2, face: number): Promise<void> {
    const house = await modelObject('bld/home_a', 4.4);
    house.position.set(cabin.x, 0.02, cabin.y);
    house.rotation.y = face;
    this.group.add(house);
    const char = await Character.create(WREN.look as unknown as CharacterLook, 1.3);
    char.play('idle');
    char.root.position.set(at.x, 0.02, at.y);
    char.root.rotation.y = face;
    char.root.visible = false;
    this.group.add(char.root);
    const pick = new THREE.Mesh(new THREE.SphereGeometry(1.0, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.set(at.x, 1.0, at.y);
    pick.userData = { kind: 'wren', i: 0 };
    this.group.add(pick);
    this.pickers.push(pick);
    const glint = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), this.glintMat);
    glint.position.set(at.x, 3.0, at.y);
    this.group.add(glint);
    this.wren = { char, pick, glint, cabin: house };
    this.wrenAt = new THREE.Vector3(at.x, 0, at.y);
  }

  /** Treats on the stumps, visitors at them, and Wren at home. */
  private refreshCritters(): void {
    for (const c of CRITTERS.families) {
      const s = this.stumps.get(c.id);
      if (!s) continue;
      const open = critters.open(c.id), treat = open ? critters.treatOn(c.id) : undefined, here = critters.present(c.id);
      const key = treat ?? '';
      if (key !== s.treatKey) {
        s.treatKey = key;
        if (treat) {
          const col = FORAGE_COLOR[treat] ?? '#e8424f';
          let g = this.treatGeos.get(col);
          if (!g) { g = treatGeometry(col); this.treatGeos.set(col, g); }
          s.treat.geometry = g;
        }
      }
      s.treat.visible = !!treat && !here;
      s.critter.visible = here;
      s.pick.visible = here;
      // a glint invites a treat on an empty stump
      s.glint.visible = open && !treat && !critters.seenToday(c.id);
    }
    if (this.wren) {
      const home = critters.wrenHere;
      this.wren.char.root.visible = home;
      this.wren.pick.visible = home;
      this.wren.glint.visible = home && !(critters.note()?.done ?? true);
    }
  }

  /** Bridges whole or broken, the trail signs' dots, tonight's fireflies, pans left and full taps. */
  private refreshRegions(): void {
    for (const reg of WOODS_REGIONS) {
      const p = this.regionParts.get(reg.id);
      if (!p) continue;
      const open = woods.regionOpen(reg.id);
      p.whole.visible = open;
      p.broken.visible = !open;
      p.signDot.visible = !open && woods.unlocked && restoration.isOpen(reg.trail);
      if (reg.feature === 'fireflies') {
        const night = open && woods.isFireflyTime(reg.id);
        for (const f of woods.fireflies(reg.id)) {
          const n = this.fireflyNodes.get(f.id);
          if (n) { n.mesh.visible = night && !f.caught; n.pick.visible = n.mesh.visible; }
        }
      }
      if (reg.feature === 'panning') { const left = open && woods.pansLeft(reg.id) > 0; for (const n of this.panNodes) n.glint.visible = left; }
      if (reg.feature === 'taps') for (const t of woods.taps(reg.id)) { const n = this.tapNodes.get(t.id); if (n) n.glint.visible = open && t.ready; }
    }
  }

  /** The middle of a region's island (or the glade), for the camera. */
  regionCentre(id: string): THREE.Vector3 | null {
    if (id === 'glade') return this.focus;
    const p = this.regionParts.get(id);
    // the Elder Oak is tall: look a little behind it so its crown clears the woods banner
    const back = id === 'grove' ? 3.5 : 0;
    return p ? this.world(p.centre.x - back, 0, p.centre.z - back) : null;
  }

  /** 1.10 farm look: lean the island's grass toward a season (null = normal). */
  setLook(look: { grass: string; grassMix: number } | null): void {
    const col = this.top?.geometry.attributes.color as THREE.BufferAttribute | undefined, plain = this.plainTop;
    if (!col || !plain) return;
    const lean = look ? new THREE.Color(look.grass) : null, c = new THREE.Color();
    for (let i = 0; i < col.count; i++) {
      c.setRGB(plain[i * 3], plain[i * 3 + 1], plain[i * 3 + 2]);
      if (lean && look) c.lerp(lean, look.grassMix);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  /** Villagers whose routine puts them in the woods right now stand about the island (made the first time they are needed). */
  private async syncVillagers(): Promise<void> {
    if (this.folkBusy) return;
    this.folkBusy = true;
    try {
      const here = new Set(schedules.at('woods'));
      const SPOTS: [number, number][] = [[-2, -6], [3, -9], [-11, -1], [5, 3], [-5, 5], [9, -4]];
      for (const v of VILLAGERS) {
        let f = this.folk.get(v.id);
        if (here.has(v.id) && !f) {
          const char = await Character.create(costume(v.look, v.id), v.scale);
          char.play('idle');
          char.root.userData.speechHeight = 2.1;
          const k = VILLAGERS.indexOf(v);
          char.root.position.set(SPOTS[k % SPOTS.length][0], 0.02, SPOTS[k % SPOTS.length][1]);
          char.root.rotation.y = Math.PI / 4 + k;
          this.group.add(char.root);
          const pick = new THREE.Mesh(new THREE.SphereGeometry(0.95, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
          pick.position.copy(char.root.position).setY(1.0);
          pick.userData = { kind: 'villager', i: k, id: v.id };
          this.group.add(pick);
          this.pickers.push(pick);
          f = { char, pick };
          this.folk.set(v.id, f);
        }
        if (f) { f.char.root.visible = here.has(v.id); f.pick.visible = here.has(v.id); }
      }
    } catch (e) { console.warn('[woods] villagers could not be drawn', e); } finally { this.folkBusy = false; }
  }

  /** Show today's plants and mounds. */
  refresh(): void {
    void this.syncVillagers();
    const spots = new Map(woods.forage().map((s) => [s.i, s]));
    for (const r of WOODS_REGIONS) if (woods.regionOpen(r.id)) for (const s of woods.regionForage(r.id)) spots.set(s.i, s);
    for (const n of this.forageNodes.values()) {
      const s = spots.get(n.i);
      const on = !!s && s.active && !s.picked;
      n.group.visible = on;
      n.pick.visible = on;
      if (!s || !on) continue;
      for (const [id, m] of n.byItem) m.visible = id === s.item;
    }
    for (const e of this.gems) e.gem.visible = museum.isDone(e.shelf);
    if (this.flag) this.flag.visible = museum.curator();
    if (this.boardDot) this.boardDot.visible = expeditions.readyCount() > 0;
    const left = woods.digsLeft();
    for (const n of this.digNodes) {
      const done = woods.dug(n.i);
      n.mound.visible = !done;
      n.dug.visible = done;
      n.glint.visible = !done && left > 0;
    }
    this.refreshRegions();
    this.refreshCritters();
    this.refreshOak();
    this.refreshWild();
    this.refreshTreehouse();
    if (this.camp) {
      const st = woods.campStatus();
      this.camp.tent.visible = st === 'sleeping' || st === 'ready';
      this.camp.fire.visible = st !== 'day';
      this.camp.flames.visible = st !== 'day';
      this.camp.glint.visible = woods.unlocked && (st === 'ready' || st === 'pitch');
    }
  }

  /** World position for an effect over a spot. */
  spotAt(hit: WoodsHit): THREE.Vector3 | null {
    if (hit.kind === 'villager') return this.world(this.folk.get(hit.id ?? '')?.char.root.position.x ?? 0, 1.5, this.folk.get(hit.id ?? '')?.char.root.position.z ?? 0);
    if (hit.kind === 'museum') return this.world(MUSEUM_AT.x + 1.5, 1.5, MUSEUM_AT.z + 1.5);
    if (hit.kind === 'board') return this.world(BOARD_AT.x, 1.5, BOARD_AT.z);
    if (hit.kind === 'trail') { const p = this.regionParts.get(hit.id ?? ''); return p ? this.world(p.sign.x, 1.5, p.sign.z) : null; }
    if (hit.kind === 'firefly') { const f = this.fireflyNodes.get(hit.i); return f ? this.world(f.mesh.position.x, f.mesh.position.y, f.mesh.position.z) : null; }
    if (hit.kind === 'pan') { const p = this.panNodes[hit.i]; return p ? this.world(p.at.x, 0.6, p.at.z) : null; }
    if (hit.kind === 'stump' || hit.kind === 'critter') { const st = this.stumps.get(hit.id ?? ''); if (!st) return null; const at = hit.kind === 'critter' ? st.critter.position : st.at; return this.world(at.x, 1, at.z); }
    if (hit.kind === 'camp') return this.world(CAMP_AT.x, 1.2, CAMP_AT.z);
    if (hit.kind === 'treehouse') return this.treehouse ? this.world(this.treehouse.at.x, 2, this.treehouse.at.z) : null;
    if (hit.kind === 'wild') { const w = this.wild.get(hit.id ?? ''); return w ? this.world(w.base.x, 0.9, w.base.z) : null; }
    if (hit.kind === 'oak') return this.oak ? this.world(this.oak.at.x, 2.5, this.oak.at.z + 1.5) : null;
    if (hit.kind === 'wren') return this.wrenAt ? this.world(this.wrenAt.x, 1.6, this.wrenAt.z) : null;
    if (hit.kind === 'tap') { const t = this.tapNodes.get(hit.id ?? ''); return t ? this.world(t.at.x, 0.8, t.at.z) : null; }
    const n = hit.kind === 'forage' ? this.forageNodes.get(hit.i) : this.digNodes[hit.i];
    return n ? this.world(n.at.x, 0.6, n.at.z) : null;
  }

  pick(ray: THREE.Ray): WoodsHit | null {
    this.raycaster.ray.copy(ray);
    this.group.updateMatrixWorld(true);
    const live = this.pickers.filter((p) => {
      const ud = p.userData as WoodsHit;
      return ud.kind === 'forage' ? (this.forageNodes.get(ud.i)?.group.visible ?? false) : ud.kind === 'villager' ? (this.folk.get(ud.id ?? '')?.pick.visible ?? false)
        : ud.kind === 'firefly' ? (this.fireflyNodes.get(ud.i)?.mesh.visible ?? false)
        : ud.kind === 'critter' || ud.kind === 'wren' ? p.visible : true;
    });
    const hits = this.raycaster.intersectObjects(live, false);
    return hits.length ? (hits[0].object.userData as WoodsHit) : null;
  }

  update(dt: number): void {
    this.t += dt;
    for (const f of this.folk.values()) if (f.char.root.visible) f.char.update(dt);
    if ((this.folkIn -= dt) <= 0) { this.folkIn = 30; void this.syncVillagers(); }
    for (const n of this.forageNodes.values()) if (n.group.visible) { n.glint.position.y = 0.9 + Math.sin(this.t * 2.2 + n.i) * 0.06; n.glint.rotation.y = this.t * 1.5; }
    // fireflies drift and pulse
    for (const [id, f] of this.fireflyNodes) if (f.mesh.visible) {
      const k = id * 0.37;
      f.mesh.position.set(f.base.x + Math.sin(this.t * 0.7 + k) * 0.8, f.base.y + Math.sin(this.t * 1.3 + k * 2) * 0.35, f.base.z + Math.cos(this.t * 0.6 + k) * 0.8);
      f.pick.position.copy(f.mesh.position);
      f.mesh.scale.setScalar(0.8 + 0.35 * Math.sin(this.t * 4 + k * 3));
    }
    for (const p of this.regionParts.values()) if (p.signDot.visible) { p.signDot.position.y = 3.4 + Math.sin(this.t * 2.4) * 0.1; p.signDot.rotation.y = this.t * 1.5; }
    for (const p of this.panNodes) if (p.glint.visible) { p.glint.position.y = 0.9 + Math.sin(this.t * 2.2 + p.i) * 0.06; p.glint.rotation.y = this.t * 1.5; }
    for (const t of this.tapNodes.values()) if (t.glint.visible) { t.glint.rotation.y = this.t * 1.5; }
    for (const e of this.gems) if (e.gem.visible) e.gem.rotation.y = this.t;
    for (const s of this.stumps.values()) {
      if (s.glint.visible) { s.glint.position.y = 1.5 + Math.sin(this.t * 2.2) * 0.07; s.glint.rotation.y = this.t * 1.5; }
      // visitors breathe and nibble
      if (s.critter.visible) s.critter.scale.set(1, 1 + Math.sin(this.t * 3) * 0.03, 1);
    }
    if (this.wren?.char.root.visible) this.wren.char.update(dt);
    if (this.camp?.glint.visible) { this.camp.glint.position.y = 2.6 + Math.sin(this.t * 2.4) * 0.1; this.camp.glint.rotation.y = this.t * 1.5; }
    if (this.camp?.fire.visible) { this.camp.fire.scale.setScalar(2.4 + Math.sin(this.t * 7) * 0.2); this.camp.flames.scale.set(1, 0.85 + Math.sin(this.t * 9) * 0.15, 1); this.camp.flames.rotation.y = this.t * 0.8; }
    if (this.wren?.glint.visible) { this.wren.glint.position.y = 3.0 + Math.sin(this.t * 2.4) * 0.1; this.wren.glint.rotation.y = this.t * 1.5; }
    if (this.boardDot?.visible) { this.boardDot.position.y = 3.6 + Math.sin(this.t * 2.4) * 0.1; this.boardDot.rotation.y = this.t * 1.5; }
    for (const n of this.digNodes) if (n.glint.visible) { n.glint.position.y = 1.3 + Math.sin(this.t * 2.2 + n.i) * 0.08; n.glint.rotation.y = this.t * 1.5; }
    if (this.treehouse?.glint.visible) { const g = this.treehouse.glint; g.position.y = 1.8 + Math.sin(this.t * 2.4) * 0.1; g.rotation.y = this.t * 1.5; }
    if (this.oak) {
      const o = this.oak;
      if (o.glint.visible) { o.glint.position.y = 1.8 + Math.sin(this.t * 2.4) * 0.1; o.glint.rotation.y = this.t * 1.5; }
      if (o.glow.visible) {
        o.glow.material.opacity = 0.35 + Math.sin(this.t * 0.9) * 0.1;
        o.lights.forEach((l, i) => { const b = l.userData.base as THREE.Vector3; l.position.set(b.x + Math.sin(this.t * 0.5 + i) * 0.5, b.y + Math.sin(this.t * 0.8 + i * 1.7) * 0.3, b.z + Math.cos(this.t * 0.45 + i) * 0.5); });
      }
    }
  }
}
