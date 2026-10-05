import * as THREE from 'three';
import gsap from 'gsap';
import { assets, assetUrl } from '../core/Assets';
import { ANIMAL, BUILDING, CROP, ITEMS, LAND, TREE, type BuildingDef } from '../data';
import { game, type Game } from '../systems/Game';
import type { Obstacle, PlacedBuilding } from '../systems/State';
import { CHUNK, HALF, MAP, chunkOf, footprintCenter, rotatedSize, tileToWorld } from './Grid';
import { PoolSet, type InstancePool } from './InstancePool';
import { procGeometry } from './ProcModels';
import { Terrain } from './Terrain';
import { PlantHints } from './PlantHints';
import { constructionVisual, objectFor, tintGeometry, visualFor, type Visual } from './Visuals';
import { hashString, rng } from './Procedural';
import { cropStage, plotReady, treeReady, animalState, productionState } from '../systems/Timers';
import { attachFx, fxKey, hasFx, styledVisual, type DecorFx } from './models/DecorFx';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ2 = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
/** Seconds a freshly grown / planted crop takes to spring up. */
const SPRING_SEC = 0.5;
/** Growing stages that reuse a tinted ripe model are drawn in this fresh green. */
const GROWING_TINT = '#74d843';

/** Elastic overshoot 0..1 -> scale factor (starts small, pops past 1, settles). */
function springScale(k: number): number {
  if (k >= 1) return 1;
  return 1 - Math.cos(k * Math.PI * 2.5) * Math.exp(-k * 5.5) * 0.85;
}

interface AnimalSprite {
  pool: InstancePool; handle: number; scale: number;
  x: number; z: number; tx: number; tz: number; heading: number;
  wait: number; hop: number; phase: number; ready: boolean; hungry: boolean;
  /** seconds left of a happy jump (fed / collected) */
  jump: number;
  /** the product it laid, waiting on the ground until collected */
  prod: { pool: InstancePool; handle: number } | null;
}

/** One crop / fruit instance with its rest transform, so it can spring up and sway in the breeze. */
interface PlantInst {
  pool: InstancePool; handle: number;
  x: number; y: number; z: number; s: number; sy: number; yaw: number;
  /** breeze sway amplitude in radians (0 = still) */
  sway: number; phase: number;
}

/** 3D model used for an item lying on the ground (animal products, harvest pops). */
export function productModel(item: string): string {
  const icon = ITEMS[item]?.icon ?? '';
  if (icon.startsWith('model:')) return icon.slice(6);
  return ({ egg: 'food/egg', milk: 'food/carton', truffle: 'food/mushroom' } as Record<string, string>)[item] ?? 'food/bag';
}

export interface BuildingView {
  b: PlacedBuilding;
  def: BuildingDef;
  visual: Visual | null;
  /** standalone object (big buildings, animating or moving) */
  obj: THREE.Group | null;
  pool?: InstancePool;
  handle?: number;
  construction: THREE.Object3D | null;
  center: THREE.Vector3;
  height: number;
  box: THREE.Box3;
  plants: PlantInst[];
  plantKey: string;
  /** seconds since the plants last changed (drives the spring-up animation) */
  plantAge: number;
  /** plants sway gently (ripe crops / fruit) */
  swaying: boolean;
  animals: AnimalSprite[];
  fan?: THREE.Object3D;
  fanAxis?: 'x' | 'y' | 'z';
  glow?: THREE.Sprite;
  /** warm pool of light on the ground under lamps at night */
  lightPool?: THREE.Mesh;
  /** chimney smoke: emitter point in the inner model space, and time until the next puff */
  smokeAt?: THREE.Vector3;
  smokeT?: number;
  busy: boolean;
  /** fences: extra half-length arms drawn at corners, T-junctions and crossings */
  links?: { pool: InstancePool; handle: number }[];
  /** tile the view was last placed on (a move changes b.x/b.z in place) */
  at?: [number, number];
  /** pretty decor: per-instance extras (flames, bulbs, sign text) and the paint/text they were built for */
  fx?: DecorFx | null;
  styleKey?: string;
}

/** Fences join up with neighbouring fences of the same kind (straight runs turn to follow them, corners get arms). */
const isLinked = (def: BuildingDef): boolean => def.id.startsWith('fence') && def.size[0] === 1 && def.size[1] === 1;
const LINK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
/** Whether a model's long side runs along x (after its fit transform), per visual. */
const runsAlongX = new Map<string, boolean>();
function alongX(visual: Visual): boolean {
  let v = runsAlongX.get(visual.key);
  if (v === undefined) {
    visual.geometry.computeBoundingBox();
    const size = visual.geometry.boundingBox!.clone().applyMatrix4(visual.local).getSize(new THREE.Vector3());
    v = size.x >= size.z;
    runsAlongX.set(visual.key, v);
  }
  return v;
}

/** Shared clock for the wind-sway materials. */
const swayTime = { value: 0 };
const swayCache = new Map<string, THREE.Material>();
/**
 * Copy of a material whose vertices lean gently in the wind, more toward the top of the model (trees, bushes,
 * crops). Each instance gets its own phase from its world position so a field ripples instead of moving in lockstep.
 * `height` is the model height, `amp` the sway at the top, both in model units.
 */
function swayMaterial(src: THREE.Material, height: number, amp: number): THREE.Material {
  const key = `${src.uuid}|${height.toFixed(2)}|${amp}`;
  let m = swayCache.get(key);
  if (!m) {
    m = src.clone();
    const uH = { value: Math.max(0.05, height) }, uAmp = { value: amp };
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uSwayT = swayTime; sh.uniforms.uSwayH = uH; sh.uniforms.uSwayA = uAmp;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uSwayT; uniform float uSwayH; uniform float uSwayA;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          {
            #ifdef USE_INSTANCING
              vec4 swO = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            #else
              vec4 swO = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            #endif
            float swH = clamp(transformed.y / uSwayH, 0.0, 1.3);
            float swP = uSwayT * 1.6 + swO.x * 0.33 + swO.z * 0.21;
            float sw = (sin(swP) * 0.7 + sin(swP * 2.3 + 1.7) * 0.3) * uSwayA * swH * swH;
            transformed.x += sw;
            transformed.z += sw * 0.55;
          }`);
    };
    swayCache.set(key, m);
  }
  return m;
}
const SWAYS: Record<string, number> = { tree_big: 0.05, tree_small: 0.055, bush: 0.03 };

/** Buildings with a chimney: 'always' puffs gently, 'busy' only while something is cooking. */
const SMOKE: Record<string, 'always' | 'busy'> = { farmhouse: 'always', bakery: 'busy', jam_kitchen: 'busy', dairy: 'busy' };

interface Puff { sprite: THREE.Sprite; life: number; max: number; vx: number; size: number }

/** Instance-pool keys for crop stage models: tinted variants get their own pool. */
function cropModelKey(model: string, tint?: string): string { return tint ? `${model}|${tint}` : model; }

export class FarmView {
  readonly root = new THREE.Group();
  readonly terrain: Terrain;
  readonly pools: PoolSet;
  readonly views = new Map<number, BuildingView>();
  private obstacleHandles = new Map<number, { pool: InstancePool; handle: number; height: number; locked: boolean }>();
  private saleSigns: { chunk: string; pool: InstancePool; handle: number }[] = [];
  private glowTex: THREE.Texture;
  private pending = new Set<number>();
  private hidden = new Set<number>();
  private puffs: Puff[] = [];
  private freePuffs: Puff[] = [];
  private smokeTex: THREE.Texture | null = null;
  private smokeTint = new THREE.Color();
  /** Soft round contact shadows, used when real shadows are off (low quality) so things don't float. */
  blobShadows = false;
  private blobs: THREE.InstancedMesh | null = null;
  private blobDirty = true;
  /** dashed frames over empty fields while planting */
  readonly hints: PlantHints;

  /** set once the initial farm is built: later crop changes animate */
  private live = false;
  private disposed = false;

  constructor(scene: THREE.Object3D, readonly g: Game = game) {
    this.terrain = new Terrain(assets.vertexMaterial);
    this.root.add(this.terrain.group);
    this.pools = new PoolSet(this.root);
    scene.add(this.root);
    this.glowTex = makeGlowTexture();
    this.hints = new PlantHints(this.root);
    // happy little jumps when animals are fed or give their product
    this.g.bus.on('animal:fed', ({ b, index }) => this.animalJump(b.uid, index, 0.45));
    this.g.bus.on('animal:collected', ({ b, index }) => this.animalJump(b.uid, index, 0.55));
  }

  private animalJump(uid: number, index: number, sec: number): void {
    const a = this.views.get(uid)?.animals[index];
    if (a) a.jump = sec + index * 0.06;
  }

  // ------------------------------------------------------------------ setup
  async build(): Promise<void> {
    this.refreshLand();
    for (const o of this.g.state.obstacles) await this.addObstacle(o);
    await Promise.all(this.g.state.buildings.map((b) => this.addBuilding(b)));
    this.tick(this.g.now());
    this.live = true;
  }

  refreshLand(): void {
    // swap background stand-ins for full models on newly bought land
    for (const o of this.g.state.obstacles) {
      const h = this.obstacleHandles.get(o.id);
      if (h?.locked && this.g.isUnlocked(chunkOf(o.x, o.z))) {
        h.pool.remove(h.handle);
        this.obstacleHandles.delete(o.id);
        void this.addObstacle(o);
      }
    }
    const purch = purchasableChunks(this.g);
    this.terrain.setLand(this.g.unlockedChunks, new Set(purch));
    // paint dirt paths + soil
    for (const b of this.g.state.buildings) this.paintFor(b, true);
    // for-sale signs
    for (const s of this.saleSigns) s.pool.remove(s.handle);
    this.saleSigns = [];
    const pool = this.pools.pool('proc/for_sale_sign', () => ({ geometry: procGeometry('for_sale_sign'), material: assets.vertexMaterial }));
    for (const chunk of purch) {
      const c = Terrain.chunkCenter(chunk);
      // nudge the sign off any obstacle in the chunk centre
      tmpM.compose(c.setY(0), tmpQ.setFromAxisAngle(UP, Math.PI / 4), tmpS.set(1.3, 1.3, 1.3));
      this.saleSigns.push({ chunk, pool, handle: pool.add(tmpM) });
    }
  }

  private painted = new Map<number, [number, number][]>();
  /** Paint (or restore) terrain tiles for 'paint:' buildings such as dirt paths. */
  private paintFor(b: PlacedBuilding, on: boolean): void {
    const def = BUILDING[b.type];
    if (!def.model.startsWith('paint:')) return;
    for (const [x, z] of this.painted.get(b.uid) ?? []) this.terrain.paintTile(x, z, null);
    this.painted.delete(b.uid);
    if (!on) return;
    const [w, d] = rotatedSize(def.size, b.rot);
    const color = new THREE.Color(def.model.slice(6));
    const tiles: [number, number][] = [];
    for (let z = b.z; z < b.z + d; z++) for (let x = b.x; x < b.x + w; x++) {
      const c = color.clone().offsetHSL(0, 0, ((x * 7 + z * 13) % 5) * 0.008);
      this.terrain.paintTile(x, z, c);
      tiles.push([x, z]);
    }
    this.painted.set(b.uid, tiles);
  }

  // ------------------------------------------------------------------ obstacles
  async addObstacle(o: Obstacle): Promise<void> {
    const t = LAND.obstacles.types[o.type as keyof typeof LAND.obstacles.types];
    // background LOD: wilderness on land you don't own yet uses cheaper stand-ins
    const locked = !this.g.isUnlocked(chunkOf(o.x, o.z));
    const lod: Record<string, string> = { tree_big: 'nat/tree_b', tree_small: 'nat/tree_a', bush: 'nat/bush', stump: 'nat/stump_round' };
    const id = locked && lod[o.type] ? lod[o.type] : t.models[o.model % t.models.length];
    const sm = await assets.static(id);
    if (this.disposed) return;
    const sway = SWAYS[o.type];
    const pool = this.pools.pool(`obs/${id}`, () => ({ geometry: sm.geometry, material: sway ? swayMaterial(sm.material, sm.size.y, sway) : sm.material, castShadow: false }));
    const r = rng(o.id * 7919 + 13);
    const big = o.type === 'tree_big' || o.type === 'big_rock';
    const s = Math.min(1.6, (big ? 1.05 : 0.85) / Math.max(sm.size.x, sm.size.z)) * (0.9 + r() * 0.2);
    tmpM.compose(tmpV.set(tileToWorld(o.x) + (r() - 0.5) * 0.15, 0, tileToWorld(o.z) + (r() - 0.5) * 0.15), tmpQ.setFromAxisAngle(UP, r() * Math.PI * 2), tmpS.set(s, s, s));
    this.obstacleHandles.set(o.id, { pool, handle: pool.add(tmpM), height: sm.size.y * s, locked });
    this.blobDirty = true;
  }

  /** Remove with a little shrink/fly animation. */
  removeObstacle(o: Obstacle): void {
    const h = this.obstacleHandles.get(o.id);
    if (!h) return;
    const m = h.pool.get(h.handle, new THREE.Matrix4());
    h.pool.remove(h.handle);
    this.obstacleHandles.delete(o.id);
    this.blobDirty = true;
    const mesh = new THREE.Mesh(h.pool.mesh.geometry, h.pool.mesh.material as THREE.Material);
    m.decompose(mesh.position, mesh.quaternion, mesh.scale);
    this.root.add(mesh);
    const s = mesh.scale.x;
    gsap.timeline({ onComplete: () => { this.root.remove(mesh); } })
      .to(mesh.scale, { x: s * 1.25, y: s * 0.7, z: s * 1.25, duration: 0.12, ease: 'power2.out' })
      .to(mesh.scale, { x: 0.01, y: s * 1.6, z: 0.01, duration: 0.3, ease: 'back.in(2)' })
      .to(mesh.rotation, { y: mesh.rotation.y + 3, duration: 0.3 }, '<');
  }

  obstacleHeight(o: Obstacle): number { return this.obstacleHandles.get(o.id)?.height ?? 1; }

  // ------------------------------------------------------------------ buildings
  private isPooled(def: BuildingDef): boolean {
    if (def.parts?.length) return false;
    if (def.cat === 'farm') return true; // plots, trees
    return def.cat === 'decor' && def.size[0] * def.size[1] <= 2 && !def.glow && !hasFx(def);
  }

  async addBuilding(b: PlacedBuilding, animate = false): Promise<void> {
    if (this.views.has(b.uid) || this.pending.has(b.uid)) return;
    this.pending.add(b.uid);
    const def = BUILDING[b.type];
    const visual = await visualFor(b.type);
    this.pending.delete(b.uid);
    if (this.disposed || !this.g.byUid(b.uid)) return; // removed while loading
    const view: BuildingView = {
      b, def, visual, obj: null, construction: null, center: new THREE.Vector3(), height: visual?.height ?? 0.1,
      box: new THREE.Box3(), plants: [], plantKey: '', plantAge: 99, swaying: false, animals: [], busy: false,
    };
    this.views.set(b.uid, view);
    this.paintFor(b, true);
    this.place(view);
    if (isLinked(def)) this.relinkAround(b.x, b.z);
    if (animate) this.squash(view);
    this.updateDynamic(view, this.g.now(), true);
  }

  /** Compute the world transform for a building view and (re)attach its visual. */
  place(view: BuildingView): void {
    const { b, def } = view;
    const visual = view.visual && styledVisual(view.visual, def, b);
    // repainted or re-lettered: rebuild the visual from scratch
    const style = visual ? fxKey(visual, b) : '';
    if (view.styleKey !== undefined && view.styleKey !== style) this.detachVisual(view);
    view.styleKey = style;
    view.at = [b.x, b.z];
    const [w, d] = rotatedSize(def.size, b.rot);
    view.center.set(footprintCenter(b.x, w), 0, footprintCenter(b.z, d));
    view.box.set(new THREE.Vector3(b.x - HALF, 0, b.z - HALF), new THREE.Vector3(b.x - HALF + w, Math.max(0.4, view.height), b.z - HALF + d));
    this.blobDirty = true;
    if (!visual) return;
    if (this.hidden.has(b.uid)) {
      this.detachVisual(view);
      if (view.construction) { this.root.remove(view.construction); view.construction = null; }
      return;
    }
    const underConstruction = !!b.buildEnd && b.buildEnd > this.g.now();
    if (underConstruction) {
      this.detachVisual(view);
      if (!view.construction) {
        view.construction = new THREE.Group();
        constructionVisual(def.size).then((o) => { view.construction?.add(o); });
        this.root.add(view.construction);
      }
      view.construction.position.copy(view.center);
      view.construction.rotation.y = -b.rot * Math.PI / 2;
      return;
    }
    if (view.construction) { this.root.remove(view.construction); view.construction = null; }
    const rotQ = tmpQ.setFromAxisAngle(UP, -b.rot * Math.PI / 2);
    if (this.isPooled(def) && !view.busy) {
      if (view.obj) { this.root.remove(view.obj); view.obj = null; }
      const mats = isLinked(def) ? this.linkMatrices(view, visual) : null;
      const world = mats ? mats[0] : new THREE.Matrix4().compose(view.center, rotQ, tmpS.set(1, 1, 1)).multiply(visual.local);
      if (!view.pool) {
        view.pool = this.pools.pool(`b/${visual.key}`, () => ({ geometry: visual.geometry, material: visual.material, castShadow: visual.castShadow }));
        view.handle = view.pool.add(world);
      } else view.pool.set(view.handle!, world);
      // extra arms for fence corners / junctions
      const extra = mats ? mats.slice(1) : [];
      view.links ??= [];
      while (view.links.length > extra.length) { const l = view.links.pop()!; l.pool.remove(l.handle); }
      extra.forEach((m, i) => {
        const l = view.links![i];
        if (l) l.pool.set(l.handle, m); else view.links!.push({ pool: view.pool!, handle: view.pool!.add(m) });
      });
    } else {
      this.detachFromPool(view);
      if (!view.obj) {
        view.obj = objectFor(visual);
        view.fan = view.obj.getObjectByName(def.parts?.[0] ?? '__none') ?? undefined;
        if (view.fan) {
          // spin around the axis where the blade assembly is thinnest
          const g = (view.fan as THREE.Mesh).geometry;
          g.computeBoundingBox();
          const sz = g.boundingBox!.getSize(new THREE.Vector3());
          view.fanAxis = sz.x < sz.y && sz.x < sz.z ? 'x' : sz.z < sz.y ? 'z' : 'y';
        }
        this.root.add(view.obj);
        view.fx = attachFx(view.obj.children[0], b, def, this.g.state.player.name);
        if (def.glow) {
          view.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#ffd27a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
          view.glow.scale.setScalar(2.2 * def.glow);
          if (view.fx?.glowY !== undefined) {
            // low glows (fires, strings of lights) would be cut off by the ground: smaller, drawn over it
            view.glow.position.y = view.fx.glowY * visual.local.getMaxScaleOnAxis();
            view.glow.scale.setScalar(1.2 * def.glow);
            view.glow.material.depthTest = false;
            view.glow.material.color.set('#ffb36b');
          } else view.glow.position.y = view.height * 0.85;
          view.obj.add(view.glow);
          view.lightPool = new THREE.Mesh(lightPoolGeometry(), new THREE.MeshBasicMaterial({ map: this.glowTex, color: '#ffc46b', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
          view.lightPool.scale.setScalar(2.6 * def.glow);
          view.lightPool.position.y = 0.03;
          view.lightPool.renderOrder = 1;
          view.lightPool.visible = false;
          view.obj.add(view.lightPool);
        }
        if (SMOKE[def.id]) view.smokeAt = chimneyPoint(visual.geometry);
      }
      view.obj.position.copy(view.center);
      view.obj.quaternion.copy(rotQ);
    }
  }

  private detachFromPool(view: BuildingView): void {
    if (view.pool && view.handle) { view.pool.remove(view.handle); }
    for (const l of view.links ?? []) l.pool.remove(l.handle);
    view.links = undefined;
    view.pool = undefined; view.handle = undefined;
  }

  /** The same-kind fence next to `b` in each direction (E, W, S, N), ignoring ones being moved. */
  private linkedNeighbours(b: PlacedBuilding): boolean[] {
    return LINK_DIRS.map(([dx, dz]) => {
      const n = this.g.buildingAt(b.x + dx, b.z + dz);
      return !!n && n.uid !== b.uid && n.type === b.type && !this.hidden.has(n.uid) && !(n.buildEnd && n.buildEnd > this.g.now());
    });
  }

  /**
   * Instance matrices for a fence tile: one full piece along a straight run (or as placed when alone), or one
   * half-length arm from the tile centre towards each neighbour at a corner, T-junction or crossing.
   */
  private linkMatrices(view: BuildingView, visual: Visual): THREE.Matrix4[] {
    const [e, w, s, n] = this.linkedNeighbours(view.b);
    const onX = e || w, onZ = s || n;
    const longX = alongX(visual);
    // rotation that lays the model's long side along world x or z
    const turn = (worldX: boolean) => tmpQ2.setFromAxisAngle(UP, worldX === longX ? 0 : Math.PI / 2);
    if (!onX && !onZ) return [new THREE.Matrix4().compose(view.center, tmpQ.setFromAxisAngle(UP, -view.b.rot * Math.PI / 2), tmpS.set(1, 1, 1)).multiply(visual.local)];
    if (onX !== onZ) return [new THREE.Matrix4().compose(view.center, turn(onX), tmpS.set(1, 1, 1)).multiply(visual.local)];
    const half = longX ? tmpS.set(0.5, 1, 1) : tmpS.set(1, 1, 0.5);
    const out: THREE.Matrix4[] = [];
    [e, w, s, n].forEach((has, i) => {
      if (!has) return;
      const [dx, dz] = LINK_DIRS[i];
      const pos = new THREE.Vector3(view.center.x + dx * 0.25, view.center.y, view.center.z + dz * 0.25);
      out.push(new THREE.Matrix4().compose(pos, turn(dx !== 0), half).multiply(visual.local));
    });
    return out;
  }

  /** Re-place the fences around a tile after a fence there appeared, disappeared or moved. */
  private relinkAround(x: number, z: number): void {
    for (const [dx, dz] of LINK_DIRS) {
      const n = this.g.buildingAt(x + dx, z + dz);
      const v = n && this.views.get(n.uid);
      if (v && isLinked(v.def)) this.place(v);
    }
  }
  private detachVisual(view: BuildingView): void {
    this.detachFromPool(view);
    if (view.obj) {
      this.root.remove(view.obj);
      view.obj = null;
      view.fx?.dispose();
      view.fx = null;
      (view.glow?.material as THREE.Material | undefined)?.dispose();
      (view.lightPool?.material as THREE.Material | undefined)?.dispose();
      view.glow = view.lightPool = undefined;
    }
  }

  /** Take a building out of its pool into a standalone object (for move mode / animations). */
  detach(view: BuildingView): THREE.Group | null {
    view.busy = true;
    this.place(view);
    return view.obj;
  }
  attach(view: BuildingView): void {
    view.busy = false;
    this.place(view);
  }

  /** Squash-and-stretch pop when a building lands. */
  squash(view: BuildingView): void {
    const pooled = this.isPooled(view.def);
    const obj = pooled ? this.detach(view) : view.obj ?? view.construction;
    if (!obj) return;
    obj.scale.set(1, 1, 1);
    gsap.timeline({ onComplete: () => { obj.scale.set(1, 1, 1); if (pooled) this.attach(view); } })
      .fromTo(obj.scale, { x: 1.25, y: 0.55, z: 1.25 }, { x: 0.88, y: 1.18, z: 0.88, duration: 0.14, ease: 'power2.out' })
      .to(obj.scale, { x: 1.05, y: 0.95, z: 1.05, duration: 0.12, ease: 'power1.inOut' })
      .to(obj.scale, { x: 1, y: 1, z: 1, duration: 0.18, ease: 'elastic.out(1.2, 0.5)' });
  }

  /** Small wobble used for taps on buildings. */
  bounce(view: BuildingView): void {
    const pooled = this.isPooled(view.def);
    const obj = pooled ? this.detach(view) : view.obj;
    if (!obj) return;
    gsap.timeline({ onComplete: () => { obj.scale.set(1, 1, 1); if (pooled) this.attach(view); } })
      .to(obj.scale, { x: 1.08, y: 0.9, z: 1.08, duration: 0.08 })
      .to(obj.scale, { x: 1, y: 1, z: 1, duration: 0.3, ease: 'elastic.out(1.4, 0.4)' });
  }

  /** Hide a building while it is being moved (its ghost is shown instead). */
  setHidden(uid: number, hidden: boolean): void {
    const view = this.views.get(uid);
    if (hidden) this.hidden.add(uid); else this.hidden.delete(uid);
    if (!view) return;
    this.paintFor(view.b, !hidden);
    this.clearPlants(view);
    this.clearAnimals(view);
    this.place(view);
    if (isLinked(view.def)) this.relinkAround(view.b.x, view.b.z);
    if (!hidden) this.updateDynamic(view, this.g.now(), true);
  }

  removeBuilding(uid: number): void {
    const view = this.views.get(uid);
    if (!view) return;
    this.paintFor(view.b, false);
    this.detachVisual(view);
    if (view.construction) this.root.remove(view.construction);
    this.clearPlants(view);
    this.clearAnimals(view);
    this.views.delete(uid);
    this.blobDirty = true;
    if (isLinked(view.def)) this.relinkAround(view.b.x, view.b.z);
  }

  refreshBuilding(b: PlacedBuilding, moved = false): void {
    const view = this.views.get(b.uid);
    if (!view) { void this.addBuilding(b); return; }
    if (moved) { this.paintFor(view.b, false); this.clearAnimals(view); this.clearPlants(view); }
    const before = view.at ?? [b.x, b.z];
    view.b = b;
    this.paintFor(b, true);
    this.place(view);
    if (isLinked(view.def)) { this.relinkAround(before[0], before[1]); this.relinkAround(b.x, b.z); }
    this.updateDynamic(view, this.g.now(), true);
  }

  // ------------------------------------------------------------------ crops, trees, animals
  private clearPlants(view: BuildingView): void {
    for (const p of view.plants) p.pool.remove(p.handle);
    view.plants = [];
    view.plantKey = '';
    view.swaying = false;
  }

  private cropPool(model: string, tint?: string): InstancePool | null {
    const sm = assets.getStatic(model);
    if (!sm) { void assets.static(model); return null; }
    return this.pools.pool(`c/${cropModelKey(model, tint)}`, () => ({
      geometry: tint ? this.own(tintGeometry(sm.geometry, tint)) : sm.geometry, material: model.startsWith('crop/') ? swayMaterial(sm.material, sm.size.y, 0.035) : sm.material, castShadow: false,
    }));
  }

  /** Geometry made for this view only (freed by dispose). */
  private ownGeometry: THREE.BufferGeometry[] = [];
  private ownMaterial: THREE.Material[] = [];
  private own(g: THREE.BufferGeometry): THREE.BufferGeometry { this.ownGeometry.push(g); return g; }

  private procPool(name: string): InstancePool {
    return this.pools.pool(`p/${name}`, () => ({ geometry: procGeometry(name), material: assets.vertexMaterial, castShadow: false }));
  }

  /** Rebuild plant instances on a plot to match its stage. */
  private updatePlot(view: BuildingView, now: number): void {
    const plot = view.b.plot;
    const built = !view.b.buildEnd || view.b.buildEnd <= now;
    let key = '';
    if (plot && built) key = `${plot.crop}:${cropStage(plot, now)}`;
    if (key === view.plantKey) return;
    const prevKey = view.plantKey.replace(/\*+$/, '');
    this.clearPlants(view);
    if (!plot || !built) return;
    const crop = CROP[plot.crop];
    const stage = cropStage(plot, now);
    const ready = stage >= 3;
    const model = ready ? crop.ready.model : crop.stages[Math.min(stage, crop.stages.length - 1)];
    // growing stages that reuse the (tinted) ripe model stay fresh green so ripe crops stand out
    const tint = ready ? crop.ready.tint : model === crop.ready.model && crop.ready.tint ? GROWING_TINT : undefined;
    const pool = this.cropPool(model, tint);
    if (!pool) { view.plantKey = ''; return; }
    const sm = assets.getStatic(model)!;
    const isFood = model.startsWith('food/');
    let s = isFood ? 0.5 / Math.max(sm.size.x, sm.size.z) : 1.55;
    if (stage === 0) s *= 0.5; else if (stage === 1) s *= 0.75;
    const r = rng(view.b.uid * 31);
    const produce = ready && crop.ready.produce;
    const prodPool = produce ? (produce.startsWith('proc/') ? this.procPool(produce.slice(5)) : this.cropPool(produce)) : null;
    const prodSm = produce && !produce.startsWith('proc/') ? assets.getStatic(produce) : null;
    // a slow wave of wind rolls across the farm: phase follows position
    const wave = view.center.x * 0.55 + view.center.z * 0.35;
    for (let i = 0; i < 4; i++) {
      const ox = (i % 2 === 0 ? -0.45 : 0.45) + (r() - 0.5) * 0.08;
      const oz = (i < 2 ? -0.45 : 0.45) + (r() - 0.5) * 0.08;
      const px = view.center.x + ox, pz = view.center.z + oz;
      view.plants.push(this.addPlant(pool, px, 0.12, pz, s, s * (0.9 + r() * 0.2), r() * Math.PI * 2, ready ? 0.07 : 0, wave + ox * 0.5 + oz * 0.3));
      if (prodPool) {
        const ps = prodSm ? 0.26 / Math.max(prodSm.size.x, prodSm.size.y, prodSm.size.z) : 1.0;
        for (let k = 0; k < 2; k++) {
          const a = r() * Math.PI * 2;
          view.plants.push(this.addPlant(prodPool, px + Math.cos(a) * 0.14, 0.18 + r() * 0.2, pz + Math.sin(a) * 0.14, ps, ps, a, 0, 0));
        }
      }
    }
    view.plantKey = key;
    this.startGrow(view, prevKey !== key, ready);
  }

  private addPlant(pool: InstancePool, x: number, y: number, z: number, s: number, sy: number, yaw: number, sway: number, phase: number): PlantInst {
    tmpM.compose(tmpV.set(x, y, z), tmpQ.setFromAxisAngle(UP, yaw), tmpS.set(s, sy, s));
    return { pool, handle: pool.add(tmpM), x, y, z, s, sy, yaw, sway, phase };
  }

  /** Kick off the spring-up animation for freshly changed plants (only once the farm is live). */
  private startGrow(view: BuildingView, changed: boolean, sway: boolean): void {
    view.swaying = sway;
    view.plantAge = this.live && changed ? 0 : 99;
    if (view.plantAge === 0) for (const p of view.plants) this.writePlant(p, 0, 0);
  }

  private writePlant(p: PlantInst, grow: number, t: number): void {
    const k = springScale(grow);
    const sw = p.sway ? Math.sin(t * 1.7 + p.phase) * p.sway : 0;
    tmpQ.setFromEuler(tmpE.set(sw, p.yaw, sw * 0.6));
    tmpM.compose(tmpV.set(p.x, p.y, p.z), tmpQ, tmpS.set(p.s * k, p.sy * k, p.s * k));
    p.pool.set(p.handle, tmpM);
  }

  private updateTree(view: BuildingView, now: number): void {
    const ready = treeReady(view.b, now);
    const key = ready ? 'ready' : 'growing';
    if (key === view.plantKey) return;
    const prevKey = view.plantKey.replace(/\*+$/, '');
    this.clearPlants(view);
    view.plantKey = key;
    if (!ready || !view.visual) return;
    const t = TREE[view.def.tree!];
    const pool = this.cropPool(t.fruit);
    const sm = assets.getStatic(t.fruit);
    if (!pool || !sm) { view.plantKey = ''; return; }
    const s = 0.3 / Math.max(sm.size.x, sm.size.y, sm.size.z);
    const r = rng(view.b.uid);
    const rotQ = tmpQ2.setFromAxisAngle(UP, -view.b.rot * Math.PI / 2);
    for (const spot of this.fruitSpots(view.visual)) {
      const p = tmpV2.copy(spot).applyQuaternion(rotQ).add(view.center);
      view.plants.push(this.addPlant(pool, p.x, p.y, p.z, s, s, r() * Math.PI * 2, 0, 0));
    }
    this.startGrow(view, prevKey === 'growing', false);
  }

  private fruitSpotCache = new Map<string, THREE.Vector3[]>();
  /**
   * Where fruit hangs on a tree model: rays cast in from 8 directions (alternating an upper and a lower
   * height) find the outside of the canopy, so fruit sits on the leaves instead of hidden inside them.
   * Computed once per tree type.
   */
  private fruitSpots(visual: Visual): THREE.Vector3[] {
    let spots = this.fruitSpotCache.get(visual.key);
    if (spots) return spots;
    const pos = visual.geometry.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(visual.local);
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    }
    const H = maxY - minY, N = 8;
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(visual.geometry, mat);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(visual.local);
    mesh.matrixWorld.copy(visual.local);
    const rc = new THREE.Raycaster();
    const dir = new THREE.Vector3();
    spots = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + 0.35;
      dir.set(-Math.cos(a), 0, -Math.sin(a));
      rc.set(v.set(Math.cos(a) * 6, minY + H * (i % 2 ? 0.56 : 0.74), Math.sin(a) * 6), dir);
      const hit = rc.intersectObject(mesh, false)[0];
      if (hit && Math.hypot(hit.point.x, hit.point.z) > 0.2) spots.push(hit.point.clone().addScaledVector(dir, -0.05));
    }
    mat.dispose();
    if (spots.length < 4) {
      // odd model: fall back to a simple ring
      spots = [];
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; spots.push(new THREE.Vector3(Math.cos(a) * 0.45, minY + H * 0.6, Math.sin(a) * 0.45)); }
    }
    this.fruitSpotCache.set(visual.key, spots);
    return spots;
  }

  private clearAnimals(view: BuildingView): void {
    for (const a of view.animals) { a.pool.remove(a.handle); this.dropProduct(a); }
    view.animals = [];
  }

  private dropProduct(a: AnimalSprite): void {
    if (a.prod) { a.prod.pool.remove(a.prod.handle); a.prod = null; }
  }

  /** Instance pool for an item model lying on the ground (null until the model has loaded). */
  private itemPool(model: string): InstancePool | null {
    return model.startsWith('proc/') ? this.procPool(model.slice(5)) : this.cropPool(model);
  }

  /** A ready animal leaves its product on the ground beside it (egg, milk, wool...). */
  private layProduct(a: AnimalSprite, item: string): void {
    const model = productModel(item);
    const pool = this.itemPool(model);
    if (!pool) return; // model still loading: try again next tick
    const sm = model.startsWith('proc/') ? null : assets.getStatic(model);
    const s = sm ? 0.36 / Math.max(sm.size.x, sm.size.y, sm.size.z) : 0.9;
    const side = a.heading + Math.PI * 0.75;
    const off = 0.25 + a.scale * 0.6;
    tmpM.compose(tmpV.set(a.x + Math.sin(side) * off, 0.02, a.z + Math.cos(side) * off), tmpQ.setFromAxisAngle(UP, a.phase), tmpS.set(s, s, s));
    a.prod = { pool, handle: pool.add(tmpM) };
  }

  private async syncAnimals(view: BuildingView, now: number): Promise<void> {
    const list = view.b.animals ?? [];
    const def = ANIMAL[view.def.animal!];
    if (view.animals.length !== list.length) {
      const pool = await this.animalPool(def.id);
      const [w, d] = rotatedSize(view.def.size, view.b.rot);
      while (view.animals.length < list.length) {
        const r = Math.random;
        const x = view.center.x + (r() - 0.5) * (w - 1.4), z = view.center.z + (r() - 0.5) * (d - 1.4) + 0.3;
        tmpM.makeTranslation(x, 0, z);
        view.animals.push({ pool, handle: pool.add(tmpM), scale: def.scale, x, z, tx: x, tz: z, heading: r() * 6, wait: r() * 3, hop: 0, phase: r() * 10, ready: false, hungry: true, jump: 0, prod: null });
      }
      while (view.animals.length > list.length) { const a = view.animals.pop()!; a.pool.remove(a.handle); this.dropProduct(a); }
    }
    list.forEach((_a, i) => {
      const st = animalState(view.b, i, now);
      const a = view.animals[i];
      if (!a) return;
      a.ready = st === 'ready';
      a.hungry = st === 'hungry';
      if (a.ready && !a.prod && !this.hidden.has(view.b.uid)) this.layProduct(a, def.product);
      else if (!a.ready && a.prod) this.dropProduct(a);
    });
  }

  private animalPools = new Map<string, Promise<InstancePool>>();
  private animalPool(animal: string): Promise<InstancePool> {
    let p = this.animalPools.get(animal);
    if (!p) {
      p = (async () => {
        const def = ANIMAL[animal];
        const sm = await assets.static(def.model);
        let geometry = sm.geometry;
        let material = sm.material;
        if (def.variant === 'sheep') geometry = this.own(sheepGeometry(sm.geometry, sm.size));
        if (def.variant === 'goat') { material = goatMaterial(sm.material as THREE.MeshLambertMaterial); this.ownMaterial.push(material); }
        return this.pools.pool(`a/${animal}`, () => ({ geometry, material, castShadow: true }));
      })();
      this.animalPools.set(animal, p);
    }
    return p;
  }

  /** Per-frame animal motion: wander, hop, bob and turn inside the pen. */
  private animateAnimals(view: BuildingView, dt: number, t: number): void {
    const [w, d] = rotatedSize(view.def.size, view.b.rot);
    const minX = view.center.x - w / 2 + 0.55, maxX = view.center.x + w / 2 - 0.55;
    const minZ = view.center.z - d / 2 + 0.55, maxZ = view.center.z + d / 2 - 0.55;
    for (const a of view.animals) {
      a.wait -= dt;
      const dx = a.tx - a.x, dz = a.tz - a.z;
      const dist = Math.hypot(dx, dz);
      let moving = false;
      if (a.wait <= 0 && dist < 0.05) {
        a.tx = THREE.MathUtils.lerp(minX, maxX, Math.random());
        a.tz = THREE.MathUtils.lerp(minZ, maxZ, Math.random());
        a.wait = 1.5 + Math.random() * 4;
      } else if (a.wait <= 0 || dist > 0.05) {
        if (dist > 0.05 && a.wait <= 0) {
          const sp = (a.hungry ? 0.35 : 0.6) * dt;
          a.x += (dx / dist) * Math.min(sp, dist);
          a.z += (dz / dist) * Math.min(sp, dist);
          const target = Math.atan2(dx, dz);
          let diff = target - a.heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          a.heading += diff * Math.min(1, dt * 6);
          moving = true;
        }
      }
      // idle head-turn sway, walking hop, happy bounce when product ready
      const sway = moving ? 0 : Math.sin(t * 0.9 + a.phase) * 0.35;
      let hop = moving ? Math.abs(Math.sin(t * 9 + a.phase)) * 0.08 : a.ready ? Math.abs(Math.sin(t * 4 + a.phase)) * 0.06 : 0;
      // head pitch: hungry animals droop, fed ones stop now and then to nibble the grass
      let pitch = 0;
      if (!moving) {
        if (a.hungry) pitch = 0.16 + Math.sin(t * 0.7 + a.phase) * 0.04;
        else if (!a.ready) {
          const gate = Math.sin(t * 0.45 + a.phase);
          if (gate > 0.45) pitch = Math.min(1, (gate - 0.45) * 5) * (0.22 + Math.sin(t * 11 + a.phase) * 0.06);
        }
      }
      let squash = 0;
      if (a.jump > 0) {
        a.jump = Math.max(0, a.jump - dt);
        const k = 1 - Math.min(1, a.jump / 0.45);
        if (k > 0) { hop += Math.sin(k * Math.PI) * 0.28 * Math.min(1.4, a.scale * 2); squash = Math.sin(k * Math.PI * 2) * 0.08; pitch = -0.15 * Math.sin(k * Math.PI); }
      }
      const breathe = 1 + Math.sin(t * 2.2 + a.phase) * 0.025 + squash;
      const s = a.scale;
      tmpQ.setFromEuler(tmpE.set(pitch, a.heading + sway, 0));
      tmpM.compose(tmpV.set(a.x, hop, a.z), tmpQ, tmpS.set(s * (2 - breathe), s * breathe, s * (2 - breathe)));
      a.pool.set(a.handle, tmpM);
    }
  }

  /** State-dependent visuals (crop stages, fruit, construction completion, animals). */
  updateDynamic(view: BuildingView, now: number, force = false): void {
    const b = view.b;
    if (b.buildEnd && b.buildEnd <= now && view.construction) {
      this.place(view);
      this.squash(view);
    }
    if (force) view.plantKey = view.plantKey + '*';
    if (this.hidden.has(b.uid)) return;
    if (view.def.id === 'plot') this.updatePlot(view, now);
    else if (view.def.tree) this.updateTree(view, now);
    else if (view.def.animal) void this.syncAnimals(view, now);
  }

  tick(now: number): void {
    for (const v of this.views.values()) this.updateDynamic(v, now);
  }

  frame(dt: number, t: number, night: number): void {
    swayTime.value = t;
    this.hints.update(dt, this.views, this.g.now());
    for (const v of this.views.values()) {
      if (v.animals.length) this.animateAnimals(v, dt, t);
      if (v.plants.length && (v.swaying || v.plantAge < 1)) {
        const age = v.plantAge;
        v.plantAge += dt;
        const done = age >= SPRING_SEC + 0.15;
        for (let i = 0; i < v.plants.length; i++) {
          // stagger the plants of a field so they pop up one after another
          const g = done ? 1 : THREE.MathUtils.clamp((age - (i % 4) * 0.05) / SPRING_SEC, 0, 1);
          this.writePlant(v.plants[i], g, t);
        }
      }
      if (v.fan) {
        const busy = productionState(v.b, this.g.now()).running;
        v.fan.rotation[v.fanAxis ?? 'z'] += dt * (busy ? 2.4 : 0.35);
      }
      if (v.fx && !this.hidden.has(v.b.uid)) v.fx.update(dt, t, night);
      if (v.glow) {
        // fires flicker, lamps hum steadily
        const flick = v.def.id === 'campfire' || v.def.id === 'pumpkin_lanterns' ? 0.82 + 0.18 * Math.sin(t * 13 + v.b.uid) * Math.sin(t * 7.3) : 1;
        (v.glow.material as THREE.SpriteMaterial).opacity = night * 0.9 * flick;
        if (v.lightPool) {
          v.lightPool.visible = night > 0.02;
          (v.lightPool.material as THREE.MeshBasicMaterial).opacity = night * 0.38 * flick;
        }
      }
      if (v.smokeAt && v.obj && !v.busy) this.emitSmoke(v, dt);
      // busy workshops hum: a tiny rhythmic squash while something is being made
      if (v.def.cat === 'production' && v.obj && !v.busy && !gsap.isTweening(v.obj.scale)) {
        const k = productionState(v.b, this.g.now()).running ? Math.sin(t * 5.5 + v.b.uid) * 0.012 : 0;
        v.obj.scale.set(1 - k * 0.5, 1 + k, 1 - k * 0.5);
      }
    }
    this.updatePuffs(dt, night);
    this.updateBlobs();
  }

  // ------------------------------------------------------------------ blob shadows (no-shadow quality)
  private updateBlobs(): void {
    if (!this.blobShadows) { if (this.blobs) this.blobs.visible = false; return; }
    if (!this.blobs) {
      const g = new THREE.PlaneGeometry(1, 1);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.MeshBasicMaterial({ map: makeBlobTexture(), color: '#12280a', transparent: true, opacity: 0.5, depthWrite: false });
      this.blobs = new THREE.InstancedMesh(g, m, 1024);
      this.blobs.count = 0;
      this.blobs.renderOrder = 1;
      this.blobs.frustumCulled = false;
      this.root.add(this.blobs);
      this.blobDirty = true;
    }
    this.blobs.visible = true;
    if (!this.blobDirty) return;
    this.blobDirty = false;
    const im = this.blobs;
    let n = 0;
    const put = (x: number, z: number, r: number): void => {
      if (n >= im.instanceMatrix.count) return;
      tmpM.compose(tmpV.set(x + 0.06, 0.015, z - 0.12), tmpQ.identity(), tmpS.set(r * 2, 1, r * 2));
      im.setMatrixAt(n++, tmpM);
    };
    for (const h of this.obstacleHandles.values()) {
      h.pool.get(h.handle, tmpM);
      tmpV.setFromMatrixPosition(tmpM);
      put(tmpV.x, tmpV.z, h.height > 0.8 ? 0.7 : 0.5);
    }
    for (const v of this.views.values()) {
      if (this.hidden.has(v.b.uid) || v.def.model.startsWith('paint:') || v.def.path || v.def.id === 'plot' || v.height < 0.15) continue;
      const [w, d] = rotatedSize(v.def.size, v.b.rot);
      put(v.center.x, v.center.z, Math.max(w, d) * (v.def.tree ? 0.38 : 0.5));
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------ chimney smoke
  private emitSmoke(v: BuildingView, dt: number): void {
    const mode = SMOKE[v.def.id];
    if (mode === 'busy' && !productionState(v.b, this.g.now()).running) return;
    v.smokeT = (v.smokeT ?? Math.random()) - dt;
    if (v.smokeT > 0) return;
    v.smokeT = mode === 'always' ? 0.8 + Math.random() * 0.5 : 0.45 + Math.random() * 0.25;
    if (this.puffs.length >= 40) return;
    if (!this.smokeTex) {
      this.smokeTex = new THREE.TextureLoader().load(assetUrl('textures/particles/smoke_04.png'));
      this.smokeTex.colorSpace = THREE.SRGBColorSpace;
    }
    let p = this.freePuffs.pop();
    if (!p) {
      p = { sprite: new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, depthWrite: false, opacity: 0 })), life: 0, max: 1, vx: 0, size: 1 };
      p.sprite.renderOrder = 4;
    }
    const inner = v.obj!.children[0];
    p.sprite.position.copy(v.smokeAt!);
    inner.localToWorld(p.sprite.position);
    p.life = 0;
    p.max = 2.4 + Math.random() * 0.8;
    p.vx = 0.12 + Math.random() * 0.1;
    p.size = mode === 'always' ? 0.8 : 1.0;
    p.sprite.scale.setScalar(p.size * 0.4);
    (p.sprite.material as THREE.SpriteMaterial).rotation = Math.random() * Math.PI * 2;
    this.root.add(p.sprite);
    this.puffs.push(p);
  }

  private updatePuffs(dt: number, night: number): void {
    if (!this.puffs.length) return;
    // smoke is unlit: dim it with the evening so it doesn't glow at night
    this.smokeTint.setRGB(1, 0.98, 0.95).multiplyScalar(1 - night * 0.55);
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life += dt;
      const k = p.life / p.max;
      if (k >= 1) { this.root.remove(p.sprite); this.freePuffs.push(p); this.puffs.splice(i, 1); continue; }
      p.sprite.position.y += (0.55 - k * 0.25) * dt;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.z -= p.vx * 0.4 * dt;
      p.sprite.scale.setScalar(p.size * (0.4 + k * 1.1));
      const m = p.sprite.material as THREE.SpriteMaterial;
      m.opacity = (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85) * 0.8;
      m.rotation += dt * 0.4;
      m.color.copy(this.smokeTint);
    }
  }

  /** True when something needs per-frame animation (keeps the loop awake). */
  get animating(): boolean {
    for (const v of this.views.values()) if (v.animals.length || v.fan || v.fx) return true;
    return false;
  }

  /**
   * Take this view out of the scene and free what it alone owns (instance buffers, the terrain's own
   * geometry and materials). Shared model geometry and materials (asset cache, sway materials) stay.
   * Used for the read-only farm of a neighbour you visited; the player's own view is never disposed.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.parent?.remove(this.root);
    const shared = assets.vertexMaterial;
    this.terrain.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.geometry) return;
      m.geometry.dispose();
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) if (mat && mat !== shared) mat.dispose();
    });
    this.root.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose(); });
    this.glowTex.dispose();
    for (const g of this.ownGeometry) g.dispose();
    for (const m of this.ownMaterial) { (m as THREE.MeshLambertMaterial).map?.dispose(); m.dispose(); }
    for (const v of this.views.values()) {
      v.fx?.dispose();
      (v.glow?.material as THREE.Material | undefined)?.dispose();
      (v.lightPool?.material as THREE.Material | undefined)?.dispose();
    }
    for (const p of [...this.puffs, ...this.freePuffs]) (p.sprite.material as THREE.Material).dispose();
    this.smokeTex?.dispose();
    if (this.blobs) { this.blobs.geometry.dispose(); const bm = this.blobs.material as THREE.MeshBasicMaterial; bm.map?.dispose(); bm.dispose(); }
    this.views.clear();
    this.obstacleHandles.clear();
  }

  // ------------------------------------------------------------------ picking
  /** Building whose box the ray hits first (tall buildings are easier to tap than their footprint). */
  pickBuilding(ray: THREE.Ray): BuildingView | null {
    let best: BuildingView | null = null;
    let bestD = Infinity;
    for (const v of this.views.values()) {
      if (v.def.model.startsWith('paint:') || v.def.path) continue;
      const hit = ray.intersectBox(v.box, tmpV);
      if (hit) {
        const d = hit.distanceToSquared(ray.origin);
        if (d < bestD) { bestD = d; best = v; }
      }
    }
    return best;
  }

  viewAt(tx: number, tz: number): BuildingView | null {
    const b = this.g.buildingAt(tx, tz);
    return b ? this.views.get(b.uid) ?? null : null;
  }

  /** Top-centre of a building in world space (for floating UI). */
  anchor(uid: number, out = new THREE.Vector3()): THREE.Vector3 {
    const v = this.views.get(uid);
    if (!v) return out.set(0, 0, 0);
    return out.copy(v.center).setY(Math.max(0.5, v.height) + 0.2);
  }

  hasReadyCrops(): boolean {
    const now = this.g.now();
    return this.g.state.buildings.some((b) => b.plot && plotReady(b, now));
  }
}

// ------------------------------------------------------------------ helpers
export function purchasableChunks(g: Game = game): string[] {
  const out: string[] = [];
  const n = MAP / CHUNK;
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
    const key = `${x},${z}`;
    if (g.isUnlocked(key)) continue;
    const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => g.isUnlocked(`${x + dx},${z + dz}`));
    if (adj) out.push(key);
  }
  return out;
}

export function chunkAt(tx: number, tz: number): string { return chunkOf(tx, tz); }

/** Highest point of a model (its chimney, for the cottages we use), nudged up a touch. */
function chimneyPoint(g: THREE.BufferGeometry): THREE.Vector3 {
  const pos = g.attributes.position as THREE.BufferAttribute;
  let top = 0;
  for (let i = 1; i < pos.count; i++) if (pos.getY(i) > pos.getY(top)) top = i;
  return new THREE.Vector3(pos.getX(top), pos.getY(top) + 0.05, pos.getZ(top));
}

function makeBlobTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.75)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

let poolGeo: THREE.PlaneGeometry | null = null;
function lightPoolGeometry(): THREE.PlaneGeometry {
  if (!poolGeo) { poolGeo = new THREE.PlaneGeometry(1, 1); poolGeo.rotateX(-Math.PI / 2); }
  return poolGeo;
}

function makeGlowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,240,200,1)');
  grd.addColorStop(0.3, 'rgba(255,210,120,0.6)');
  grd.addColorStop(1, 'rgba(255,200,100,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Polar-bear cube pet + wool tufts = sheep. Tufts reuse the body's UVs so they sample the atlas white. */
function sheepGeometry(src: THREE.BufferGeometry, size: THREE.Vector3): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [src];
  const uv = src.attributes.uv as THREE.BufferAttribute;
  const pos = src.attributes.position as THREE.BufferAttribute;
  let top = 0;
  for (let i = 1; i < pos.count; i++) if (pos.getY(i) > pos.getY(top)) top = i;
  const u = uv.getX(top), v = uv.getY(top);
  const r = rng(hashString('sheep'));
  for (let i = 0; i < 9; i++) {
    const ico = new THREE.IcosahedronGeometry(size.x * (0.16 + r() * 0.05), 0);
    const g = ico.index ? ico.toNonIndexed() : ico; // r186 builds it non-indexed already
    g.translate((r() - 0.5) * size.x * 0.75, size.y * (0.72 + r() * 0.2), (r() - 0.5) * size.z * 0.6 - size.z * 0.05);
    const n = g.attributes.position.count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2).map((_, k) => (k % 2 ? v : u)), 2));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.98), 3));
    parts.push(g);
  }
  // merge manually (attributes position/normal/uv/color)
  return mergeAll(parts);
}

function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const names = ['position', 'normal', 'uv', 'color'];
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const itemSize = parts[0].attributes[name].itemSize;
    const total = parts.reduce((s, p) => s + p.attributes[name].count, 0);
    const arr = new Float32Array(total * itemSize);
    let off = 0;
    for (const p of parts) {
      const a = p.attributes[name] as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) for (let k = 0; k < itemSize; k++) arr[off++] = a.getComponent(i, k);
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, itemSize));
  }
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

/** Desaturated + brightened copy of the pets atlas turns the deer into a cream-coloured goat. */
function goatMaterial(src: THREE.MeshLambertMaterial): THREE.Material {
  const img = src.map!.image as HTMLImageElement | ImageBitmap;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d')!;
  g.drawImage(img as CanvasImageSource, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    const l = 0.3 * r + 0.59 * gg + 0.11 * b;
    const sat = Math.max(r, gg, b) - Math.min(r, gg, b);
    if (sat > 40 && r > b) { // warm fur -> cream; dark antlers stay dark-ish
      const k = Math.min(255, l * 1.45 + 40);
      d[i] = k; d[i + 1] = k * 0.97; d[i + 2] = k * 0.9;
    }
  }
  g.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return new THREE.MeshLambertMaterial({ map: tex, vertexColors: true });
}
