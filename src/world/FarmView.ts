import * as THREE from 'three';
import gsap from 'gsap';
import { assets } from '../core/Assets';
import { ANIMAL, BUILDING, CROP, LAND, TREE, type BuildingDef } from '../data';
import { game } from '../systems/Game';
import type { Obstacle, PlacedBuilding } from '../systems/State';
import { CHUNK, HALF, MAP, chunkOf, footprintCenter, rotatedSize, tileToWorld } from './Grid';
import { PoolSet, type InstancePool } from './InstancePool';
import { procGeometry } from './ProcModels';
import { Terrain } from './Terrain';
import { constructionVisual, objectFor, tintGeometry, visualFor, type Visual } from './Visuals';
import { hashString, rng } from './Procedural';
import { cropStage, plotReady, treeReady, animalState, productionState } from '../systems/Timers';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

interface AnimalSprite {
  pool: InstancePool; handle: number; scale: number;
  x: number; z: number; tx: number; tz: number; heading: number;
  wait: number; hop: number; phase: number; ready: boolean; hungry: boolean;
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
  plants: { pool: InstancePool; handle: number }[];
  plantKey: string;
  animals: AnimalSprite[];
  fan?: THREE.Object3D;
  glow?: THREE.Sprite;
  busy: boolean;
}

/** Instance-pool keys for crop stage models: tinted variants get their own pool. */
function cropModelKey(model: string, tint?: string): string { return tint ? `${model}|${tint}` : model; }

export class FarmView {
  readonly root = new THREE.Group();
  readonly terrain: Terrain;
  readonly pools: PoolSet;
  readonly views = new Map<number, BuildingView>();
  private obstacleHandles = new Map<number, { pool: InstancePool; handle: number; height: number }>();
  private saleSigns: { chunk: string; pool: InstancePool; handle: number }[] = [];
  private glowTex: THREE.Texture;
  private pending = new Set<number>();
  private hidden = new Set<number>();

  constructor(scene: THREE.Scene) {
    this.terrain = new Terrain(assets.vertexMaterial);
    this.root.add(this.terrain.group);
    this.pools = new PoolSet(this.root);
    scene.add(this.root);
    this.glowTex = makeGlowTexture();
  }

  // ------------------------------------------------------------------ setup
  async build(): Promise<void> {
    this.refreshLand();
    for (const o of game.state.obstacles) await this.addObstacle(o);
    await Promise.all(game.state.buildings.map((b) => this.addBuilding(b)));
    this.tick(game.now());
  }

  refreshLand(): void {
    const purch = purchasableChunks();
    this.terrain.setLand(game.unlockedChunks, new Set(purch));
    // paint dirt paths + soil
    for (const b of game.state.buildings) this.paintFor(b, true);
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
    const id = t.models[o.model % t.models.length];
    const sm = await assets.static(id);
    const pool = this.pools.pool(`obs/${id}`, () => ({ geometry: sm.geometry, material: sm.material }));
    const r = rng(o.id * 7919 + 13);
    const big = o.type === 'tree_big' || o.type === 'big_rock';
    const s = Math.min(1.6, (big ? 1.05 : 0.85) / Math.max(sm.size.x, sm.size.z)) * (0.9 + r() * 0.2);
    tmpM.compose(tmpV.set(tileToWorld(o.x) + (r() - 0.5) * 0.15, 0, tileToWorld(o.z) + (r() - 0.5) * 0.15), tmpQ.setFromAxisAngle(UP, r() * Math.PI * 2), tmpS.set(s, s, s));
    this.obstacleHandles.set(o.id, { pool, handle: pool.add(tmpM), height: sm.size.y * s });
  }

  /** Remove with a little shrink/fly animation. */
  removeObstacle(o: Obstacle): void {
    const h = this.obstacleHandles.get(o.id);
    if (!h) return;
    const m = h.pool.get(h.handle, new THREE.Matrix4());
    h.pool.remove(h.handle);
    this.obstacleHandles.delete(o.id);
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
    return def.cat === 'decor' && def.size[0] * def.size[1] <= 2 && !def.glow;
  }

  async addBuilding(b: PlacedBuilding, animate = false): Promise<void> {
    if (this.views.has(b.uid) || this.pending.has(b.uid)) return;
    this.pending.add(b.uid);
    const def = BUILDING[b.type];
    const visual = await visualFor(b.type);
    this.pending.delete(b.uid);
    if (!game.byUid(b.uid)) return; // removed while loading
    const view: BuildingView = {
      b, def, visual, obj: null, construction: null, center: new THREE.Vector3(), height: visual?.height ?? 0.1,
      box: new THREE.Box3(), plants: [], plantKey: '', animals: [], busy: false,
    };
    this.views.set(b.uid, view);
    this.paintFor(b, true);
    this.place(view);
    if (animate) this.squash(view);
    this.updateDynamic(view, game.now(), true);
  }

  /** Compute the world transform for a building view and (re)attach its visual. */
  place(view: BuildingView): void {
    const { b, def, visual } = view;
    const [w, d] = rotatedSize(def.size, b.rot);
    view.center.set(footprintCenter(b.x, w), 0, footprintCenter(b.z, d));
    view.box.set(new THREE.Vector3(b.x - HALF, 0, b.z - HALF), new THREE.Vector3(b.x - HALF + w, Math.max(0.4, view.height), b.z - HALF + d));
    if (!visual) return;
    if (this.hidden.has(b.uid)) {
      this.detachVisual(view);
      if (view.construction) { this.root.remove(view.construction); view.construction = null; }
      return;
    }
    const underConstruction = !!b.buildEnd && b.buildEnd > game.now();
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
      const world = new THREE.Matrix4().compose(view.center, rotQ, tmpS.set(1, 1, 1)).multiply(visual.local);
      if (!view.pool) {
        view.pool = this.pools.pool(`b/${visual.key}`, () => ({ geometry: visual.geometry, material: visual.material, castShadow: visual.castShadow }));
        view.handle = view.pool.add(world);
      } else view.pool.set(view.handle!, world);
    } else {
      this.detachFromPool(view);
      if (!view.obj) {
        view.obj = objectFor(visual);
        view.fan = view.obj.getObjectByName(def.parts?.[0] ?? '__none') ?? undefined;
        this.root.add(view.obj);
        if (def.glow) {
          view.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#ffd27a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
          view.glow.scale.setScalar(2.2 * def.glow);
          view.glow.position.y = view.height * 0.85;
          view.obj.add(view.glow);
        }
      }
      view.obj.position.copy(view.center);
      view.obj.quaternion.copy(rotQ);
    }
  }

  private detachFromPool(view: BuildingView): void {
    if (view.pool && view.handle) { view.pool.remove(view.handle); }
    view.pool = undefined; view.handle = undefined;
  }
  private detachVisual(view: BuildingView): void {
    this.detachFromPool(view);
    if (view.obj) { this.root.remove(view.obj); view.obj = null; }
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
    if (!hidden) this.updateDynamic(view, game.now(), true);
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
  }

  refreshBuilding(b: PlacedBuilding, moved = false): void {
    const view = this.views.get(b.uid);
    if (!view) { void this.addBuilding(b); return; }
    if (moved) { this.paintFor(view.b, false); this.clearAnimals(view); this.clearPlants(view); }
    view.b = b;
    this.paintFor(b, true);
    this.place(view);
    this.updateDynamic(view, game.now(), true);
  }

  // ------------------------------------------------------------------ crops, trees, animals
  private clearPlants(view: BuildingView): void {
    for (const p of view.plants) p.pool.remove(p.handle);
    view.plants = [];
    view.plantKey = '';
  }

  private cropPool(model: string, tint?: string): InstancePool | null {
    const sm = assets.getStatic(model);
    if (!sm) { void assets.static(model); return null; }
    return this.pools.pool(`c/${cropModelKey(model, tint)}`, () => ({
      geometry: tint ? tintGeometry(sm.geometry, tint) : sm.geometry, material: sm.material, castShadow: false,
    }));
  }

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
    this.clearPlants(view);
    if (!plot || !built) return;
    const crop = CROP[plot.crop];
    const stage = cropStage(plot, now);
    const ready = stage >= 3;
    const model = ready ? crop.ready.model : crop.stages[Math.min(stage, crop.stages.length - 1)];
    const pool = this.cropPool(model, ready ? crop.ready.tint : undefined);
    if (!pool) { view.plantKey = ''; return; }
    const sm = assets.getStatic(model)!;
    const isFood = model.startsWith('food/');
    let s = isFood ? 0.5 / Math.max(sm.size.x, sm.size.z) : 1.55;
    if (stage === 0) s *= 0.5; else if (stage === 1) s *= 0.75;
    const r = rng(view.b.uid * 31);
    const produce = ready && crop.ready.produce;
    const prodPool = produce ? (produce.startsWith('proc/') ? this.procPool(produce.slice(5)) : this.cropPool(produce)) : null;
    const prodSm = produce && !produce.startsWith('proc/') ? assets.getStatic(produce) : null;
    for (let i = 0; i < 4; i++) {
      const ox = (i % 2 === 0 ? -0.45 : 0.45) + (r() - 0.5) * 0.08;
      const oz = (i < 2 ? -0.45 : 0.45) + (r() - 0.5) * 0.08;
      const pos = tmpV.set(view.center.x + ox, 0.12, view.center.z + oz);
      tmpM.compose(pos, tmpQ.setFromAxisAngle(UP, r() * Math.PI * 2), tmpS.set(s, s * (0.9 + r() * 0.2), s));
      view.plants.push({ pool, handle: pool.add(tmpM) });
      if (prodPool) {
        const ps = prodSm ? 0.26 / Math.max(prodSm.size.x, prodSm.size.y, prodSm.size.z) : 1.0;
        for (let k = 0; k < 2; k++) {
          const a = r() * Math.PI * 2;
          tmpM.compose(tmpV.set(pos.x + Math.cos(a) * 0.14, 0.18 + r() * 0.2, pos.z + Math.sin(a) * 0.14), tmpQ.setFromAxisAngle(UP, a), tmpS.set(ps, ps, ps));
          view.plants.push({ pool: prodPool, handle: prodPool.add(tmpM) });
        }
      }
    }
    view.plantKey = key;
  }

  private updateTree(view: BuildingView, now: number): void {
    const ready = treeReady(view.b, now);
    const key = ready ? 'ready' : 'growing';
    if (key === view.plantKey) return;
    this.clearPlants(view);
    view.plantKey = key;
    if (!ready || !view.visual) return;
    const t = TREE[view.def.tree!];
    const pool = this.cropPool(t.fruit);
    const sm = assets.getStatic(t.fruit);
    if (!pool || !sm) { view.plantKey = ''; return; }
    const s = 0.3 / Math.max(sm.size.x, sm.size.y, sm.size.z);
    const r = rng(view.b.uid);
    const h = view.height;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + r();
      const rad = 0.35 + r() * 0.2;
      tmpM.compose(tmpV.set(view.center.x + Math.cos(a) * rad, h * (0.5 + r() * 0.3), view.center.z + Math.sin(a) * rad), tmpQ.setFromAxisAngle(UP, a), tmpS.set(s, s, s));
      view.plants.push({ pool, handle: pool.add(tmpM) });
    }
  }

  private clearAnimals(view: BuildingView): void {
    for (const a of view.animals) a.pool.remove(a.handle);
    view.animals = [];
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
        view.animals.push({ pool, handle: pool.add(tmpM), scale: def.scale, x, z, tx: x, tz: z, heading: r() * 6, wait: r() * 3, hop: 0, phase: r() * 10, ready: false, hungry: true });
      }
      while (view.animals.length > list.length) { const a = view.animals.pop()!; a.pool.remove(a.handle); }
    }
    list.forEach((_a, i) => {
      const st = animalState(view.b, i, now);
      view.animals[i].ready = st === 'ready';
      view.animals[i].hungry = st === 'hungry';
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
        if (def.variant === 'sheep') geometry = sheepGeometry(sm.geometry, sm.size);
        if (def.variant === 'goat') material = goatMaterial(sm.material as THREE.MeshLambertMaterial);
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
      const hop = moving ? Math.abs(Math.sin(t * 9 + a.phase)) * 0.08 : a.ready ? Math.abs(Math.sin(t * 4 + a.phase)) * 0.06 : 0;
      const breathe = 1 + Math.sin(t * 2.2 + a.phase) * 0.025;
      const s = a.scale;
      tmpM.compose(tmpV.set(a.x, hop, a.z), tmpQ.setFromAxisAngle(UP, a.heading + sway), tmpS.set(s * (2 - breathe), s * breathe, s * (2 - breathe)));
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
    for (const v of this.views.values()) {
      if (v.animals.length) this.animateAnimals(v, dt, t);
      if (v.fan) {
        const busy = productionState(v.b, game.now()).running;
        v.fan.rotation.z += dt * (busy ? 2.4 : 0.35);
      }
      if (v.glow) (v.glow.material as THREE.SpriteMaterial).opacity = night * 0.9;
    }
  }

  /** True when something needs per-frame animation (keeps the loop awake). */
  get animating(): boolean {
    for (const v of this.views.values()) if (v.animals.length || v.fan) return true;
    return false;
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
    const b = game.buildingAt(tx, tz);
    return b ? this.views.get(b.uid) ?? null : null;
  }

  /** Top-centre of a building in world space (for floating UI). */
  anchor(uid: number, out = new THREE.Vector3()): THREE.Vector3 {
    const v = this.views.get(uid);
    if (!v) return out.set(0, 0, 0);
    return out.copy(v.center).setY(Math.max(0.5, v.height) + 0.2);
  }

  hasReadyCrops(): boolean {
    const now = game.now();
    return game.state.buildings.some((b) => b.plot && plotReady(b, now));
  }
}

// ------------------------------------------------------------------ helpers
export function purchasableChunks(): string[] {
  const out: string[] = [];
  const n = MAP / CHUNK;
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
    const key = `${x},${z}`;
    if (game.isUnlocked(key)) continue;
    const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => game.isUnlocked(`${x + dx},${z + dz}`));
    if (adj) out.push(key);
  }
  return out;
}

export function chunkAt(tx: number, tz: number): string { return chunkOf(tx, tz); }

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
    const g = new THREE.IcosahedronGeometry(size.x * (0.16 + r() * 0.05), 0).toNonIndexed();
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
