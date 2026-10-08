import * as THREE from 'three';
import { assets } from '../core/Assets';
import { WOODS } from '../data';
import { woods } from '../systems/Woods';
import { seasons } from '../systems/Seasons';
import { rng } from './Procedural';
import { CLIFF_H, R_ISLAND, grassTop, islandBase, mergeStatic, modelObject } from './SquareView';
import { boatGeometry, jettyGeometry } from './models/square';
import { FORAGE_COLOR, dugGeometry, forageGeometry, moundGeometry, pondGeometry } from './models/woods';

/**
 * The Wild Woods (1.9): a second little island in the same sea as the farm and the village square, reached by boat from
 * the farm's south beach. Trees round the rim and scattered inside, a quiet pond, forage spots that show today's plant
 * and dig mounds. What is where comes from src/systems/Woods.ts; this file only draws it and answers taps.
 */
export const WOODS_AT = { x: -130, z: 0 };
const JETTY_ANGLE = Math.PI / 4;
const POND = { x: -7.5, z: -6, r: 4.1 };
const TREES = ['nat/tree_default', 'nat/tree_oak', 'nat/tree_a', 'nat/tree_b', 'nat/tree_fat', 'nat/tree_simple'] as const;

export interface WoodsHit { kind: 'forage' | 'dig'; i: number }

interface ForageNode { i: number; group: THREE.Group; byItem: Map<string, THREE.Mesh>; glint: THREE.Mesh; pick: THREE.Mesh; at: THREE.Vector3 }
interface DigNode { i: number; mound: THREE.Mesh; dug: THREE.Mesh; glint: THREE.Mesh; pick: THREE.Mesh; at: THREE.Vector3 }

export const MODELS = [
  'nat/tree_default', 'nat/tree_oak', 'nat/tree_a', 'nat/tree_b', 'nat/tree_fat', 'nat/tree_simple', 'nat/rock_small', 'nat/bush', 'nat/grass_large',
  'nat/flower_red', 'nat/flower_yellow', 'nat/flower_purple', 'prop/lumber', 'prop/stones',
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
    // the season's turf colour (same lean as the farm's ground, see Terrain.ts)
    const look = seasons.now().def.look, lean = new THREE.Color(look.grass), col = top.geometry.attributes.color as THREE.BufferAttribute, c = new THREE.Color();
    for (let i = 0; i < col.count; i++) { c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).lerp(lean, look.grassMix); col.setXYZ(i, c.r, c.g, c.b); }
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
      [...spots.forage, ...spots.dig].every((p) => Math.hypot(p.x - x, p.y - z) > gap) && Math.hypot(x - POND.x, z - POND.z) > POND.r + 1.4;
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

    this.buildSpots(spots);
    this.refresh();
  }

  private buildSpots(spots: { forage: THREE.Vector2[]; dig: THREE.Vector2[] }): void {
    const mat = assets.vertexMaterial;
    const glintGeo = new THREE.OctahedronGeometry(0.13, 0);
    // one geometry per wild plant, shared by every spot
    const geos = new Map<string, THREE.BufferGeometry>();
    for (const list of Object.values(WOODS.foragedBySeason)) for (const e of list) if (!geos.has(e.id)) geos.set(e.id, forageGeometry(e.kind, FORAGE_COLOR[e.id] ?? '#7fd05a', e.id));
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

  /** Show today's plants and mounds. */
  refresh(): void {
    const spots = woods.forage();
    for (const n of this.forageNodes) {
      const s = spots[n.i];
      const on = !!s && s.active && !s.picked;
      n.group.visible = on;
      n.pick.visible = on;
      if (!s) continue;
      for (const [id, m] of n.byItem) m.visible = id === s.item;
    }
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
    const n = hit.kind === 'forage' ? this.forageNodes[hit.i] : this.digNodes[hit.i];
    return n ? this.world(n.at.x, 0.6, n.at.z) : null;
  }

  pick(ray: THREE.Ray): WoodsHit | null {
    this.raycaster.ray.copy(ray);
    this.group.updateMatrixWorld(true);
    const live = this.pickers.filter((p) => {
      const ud = p.userData as WoodsHit;
      return ud.kind === 'forage' ? this.forageNodes[ud.i]?.group.visible : true;
    });
    const hits = this.raycaster.intersectObjects(live, false);
    return hits.length ? (hits[0].object.userData as WoodsHit) : null;
  }

  update(dt: number): void {
    this.t += dt;
    for (const n of this.forageNodes) if (n.group.visible) { n.glint.position.y = 0.9 + Math.sin(this.t * 2.2 + n.i) * 0.06; n.glint.rotation.y = this.t * 1.5; }
    for (const n of this.digNodes) if (n.glint.visible) { n.glint.position.y = 1.3 + Math.sin(this.t * 2.2 + n.i) * 0.08; n.glint.rotation.y = this.t * 1.5; }
  }
}
