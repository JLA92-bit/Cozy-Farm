import * as THREE from 'three';
import { assets } from '../core/Assets';
import { WOODS } from '../data';
import { woods } from '../systems/Woods';
import { schedules } from '../systems/Schedules';
import { VILLAGERS } from '../data';
import { Character } from './Character';
import { museum } from '../systems/Museum';
import { expeditions } from '../systems/Expeditions';
import { rng } from './Procedural';
import { CLIFF_H, R_ISLAND, grassTop, islandBase, mergeStatic, modelObject } from './SquareView';
import { boatGeometry, jettyGeometry } from './models/square';
import { FORAGE_COLOR, dugGeometry, forageGeometry, moundGeometry, noticeBoardGeometry, pedestalGeometry, pondGeometry } from './models/woods';

/**
 * The Wild Woods (1.9): a second little island in the same sea as the farm and the village square, reached by boat from
 * the farm's south beach. Trees round the rim and scattered inside, a quiet pond, forage spots that show today's plant
 * and dig mounds. What is where comes from src/systems/Woods.ts; this file only draws it and answers taps.
 */
export const WOODS_AT = { x: -130, z: 0 };
const JETTY_ANGLE = Math.PI / 4;
const POND = { x: -7.5, z: -6, r: 4.1 };
const TREES = ['nat/tree_default', 'nat/tree_oak', 'nat/tree_a', 'nat/tree_b', 'nat/tree_fat', 'nat/tree_simple'] as const;

export interface WoodsHit { kind: 'forage' | 'dig' | 'museum' | 'board' | 'villager'; i: number; id?: string }
/** Fixed places in island space: the Museum at the top of the island and the expedition board at the landing. */
const MUSEUM_AT = { x: -1, z: -15 };
const BOARD_AT = { x: 10.5, z: 13.5 };

interface ForageNode { i: number; group: THREE.Group; byItem: Map<string, THREE.Mesh>; glint: THREE.Mesh; pick: THREE.Mesh; at: THREE.Vector3 }
interface DigNode { i: number; mound: THREE.Mesh; dug: THREE.Mesh; glint: THREE.Mesh; pick: THREE.Mesh; at: THREE.Vector3 }

export const MODELS = [
  'nat/tree_default', 'nat/tree_oak', 'nat/tree_a', 'nat/tree_b', 'nat/tree_fat', 'nat/tree_simple', 'nat/rock_small', 'nat/bush', 'nat/grass_large',
  'nat/flower_red', 'nat/flower_yellow', 'nat/flower_purple', 'prop/lumber', 'prop/stones', 'bld/home_b', 'bld/tower', 'prop/banner_red',
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
    if (all.some((q) => q.distanceTo(p) < 3.2)) continue;
    all.push(p);
  }
  return { forage: all.slice(0, WOODS.forage.spots), dig: all.slice(WOODS.forage.spots) };
}

export class WoodsView {
  readonly group = new THREE.Group();
  private forageNodes: ForageNode[] = [];
  private digNodes: DigNode[] = [];
  private pickers: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();
  private folk = new Map<string, { char: Character; pick: THREE.Mesh }>();
  private folkBusy = false;
  private folkIn = 0;
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
      && Math.hypot(x - MUSEUM_AT.x, z - MUSEUM_AT.z) > 6.5 && Math.hypot(x - BOARD_AT.x, z - BOARD_AT.z) > 3.2;
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
      const off = (k - (museum.shelves().length - 1) / 2) * 1.15 * Math.SQRT1_2;
      const px = MUSEUM_AT.x + 4.6 + off, pz = MUSEUM_AT.z + 4.6 - off;
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
      this.forageNodes.push({ i, group, byItem, glint, pick, at: new THREE.Vector3(p.x, 0.5, p.y) });
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
          const char = await Character.create(v.look, v.scale);
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
    const spots = woods.forage();
    for (const n of this.forageNodes) {
      const s = spots[n.i];
      const on = !!s && s.active && !s.picked;
      n.group.visible = on;
      n.pick.visible = on;
      if (!s) continue;
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
  }

  /** World position for an effect over a spot. */
  spotAt(hit: WoodsHit): THREE.Vector3 | null {
    if (hit.kind === 'villager') return this.world(this.folk.get(hit.id ?? '')?.char.root.position.x ?? 0, 1.5, this.folk.get(hit.id ?? '')?.char.root.position.z ?? 0);
    if (hit.kind === 'museum') return this.world(MUSEUM_AT.x + 1.5, 1.5, MUSEUM_AT.z + 1.5);
    if (hit.kind === 'board') return this.world(BOARD_AT.x, 1.5, BOARD_AT.z);
    const n = hit.kind === 'forage' ? this.forageNodes[hit.i] : this.digNodes[hit.i];
    return n ? this.world(n.at.x, 0.6, n.at.z) : null;
  }

  pick(ray: THREE.Ray): WoodsHit | null {
    this.raycaster.ray.copy(ray);
    this.group.updateMatrixWorld(true);
    const live = this.pickers.filter((p) => {
      const ud = p.userData as WoodsHit;
      return ud.kind === 'forage' ? this.forageNodes[ud.i]?.group.visible : ud.kind === 'villager' ? (this.folk.get(ud.id ?? '')?.pick.visible ?? false) : true;
    });
    const hits = this.raycaster.intersectObjects(live, false);
    return hits.length ? (hits[0].object.userData as WoodsHit) : null;
  }

  update(dt: number): void {
    this.t += dt;
    for (const f of this.folk.values()) if (f.char.root.visible) f.char.update(dt);
    if ((this.folkIn -= dt) <= 0) { this.folkIn = 30; void this.syncVillagers(); }
    for (const n of this.forageNodes) if (n.group.visible) { n.glint.position.y = 0.9 + Math.sin(this.t * 2.2 + n.i) * 0.06; n.glint.rotation.y = this.t * 1.5; }
    for (const e of this.gems) if (e.gem.visible) e.gem.rotation.y = this.t;
    if (this.boardDot?.visible) { this.boardDot.position.y = 3.6 + Math.sin(this.t * 2.4) * 0.1; this.boardDot.rotation.y = this.t * 1.5; }
    for (const n of this.digNodes) if (n.glint.visible) { n.glint.position.y = 1.3 + Math.sin(this.t * 2.2 + n.i) * 0.08; n.glint.rotation.y = this.t * 1.5; }
  }
}
