import * as THREE from 'three';
import { assets, type StaticModel } from '../core/Assets';
import { BUILDING, TREE, type BuildingDef } from '../data';
import { procGeometry } from './ProcModels';
import { geo } from './Procedural';

/** Geometry + material + local transform for a placeable thing, ready for pooling or a standalone mesh. */
export interface Visual {
  key: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Transform from footprint centre (y=0) to the model. */
  local: THREE.Matrix4;
  parts?: StaticModel['parts'];
  height: number;
  castShadow: boolean;
}

const visualCache = new Map<string, Promise<Visual | null>>();

/** Multiply vertex colours toward `tint`. `greensOnly` limits it to leafy colours (tree canopies). */
export function tintGeometry(src: THREE.BufferGeometry, tint: string, greensOnly = false, amount = 0.85): THREE.BufferGeometry {
  const g = src.clone();
  const col = g.attributes.color as THREE.BufferAttribute;
  const t = new THREE.Color(tint);
  const c = new THREE.Color();
  const hsl = { h: 0, s: 0, l: 0 };
  for (let i = 0; i < col.count; i++) {
    c.fromBufferAttribute(col, i);
    if (greensOnly) {
      c.getHSL(hsl);
      if (hsl.h < 0.18 || hsl.h > 0.5 || hsl.s < 0.15) continue;
    }
    const l = (c.r + c.g + c.b) / 3;
    c.lerp(new THREE.Color(t.r * (0.6 + l * 0.8), t.g * (0.6 + l * 0.8), t.b * (0.6 + l * 0.8)), amount);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
  return g;
}

/** Fit a model of size (sx, sz) into a footprint of (w, d) tiles; rotates 90° when the long axes disagree. */
function fitMatrix(size: THREE.Vector3, w: number, d: number, fit: number, extraScale = 1): THREE.Matrix4 {
  const rotate = w !== d && (w > d) !== (size.x > size.z);
  const sx = rotate ? size.z : size.x;
  const sz = rotate ? size.x : size.z;
  const s = Math.min((w * fit) / sx, (d * fit) / sz) * extraScale;
  return new THREE.Matrix4().compose(
    new THREE.Vector3(0, 0, 0),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotate ? Math.PI / 2 : 0),
    new THREE.Vector3(s, s, s),
  );
}

export function visualFor(type: string): Promise<Visual | null> {
  let p = visualCache.get(type);
  if (!p) {
    p = buildVisual(BUILDING[type]);
    visualCache.set(type, p);
  }
  return p;
}

async function buildVisual(def: BuildingDef): Promise<Visual | null> {
  const [w, d] = def.size;
  const m = def.model;
  if (m.startsWith('paint:')) return null;
  if (m.startsWith('proc:')) {
    const g = procGeometry(m.slice(5));
    g.computeBoundingBox();
    const size = g.boundingBox!.getSize(new THREE.Vector3());
    const local = def.fit !== 1 ? fitMatrix(size, w, d, def.fit) : new THREE.Matrix4();
    return { key: def.id, geometry: g, material: assets.vertexMaterial, local, height: size.y, castShadow: def.cat !== 'farm' };
  }
  if (m === 'tree') {
    const t = TREE[def.tree!];
    const sm = await assets.static(t.model);
    let g = sm.geometry;
    if (t.leafTint) g = tintGeometry(g, t.leafTint, true);
    const local = fitMatrix(sm.size, w, d, def.fit, sm.size.y < 1 ? 1.5 : 1.2);
    return { key: def.id, geometry: g, material: sm.material, local, height: sm.size.y * local.getMaxScaleOnAxis(), castShadow: true };
  }
  const sm = await assets.static(m, def.parts ?? []);
  const local = fitMatrix(sm.size, w, d, def.fit);
  const flat = sm.size.y < 0.12; // paths: lift a hair to avoid z-fighting
  if (flat) local.premultiply(new THREE.Matrix4().makeTranslation(0, 0.012, 0));
  return {
    key: def.id, geometry: sm.geometry, material: sm.material, local, parts: sm.parts,
    height: sm.size.y * local.getMaxScaleOnAxis(), castShadow: !flat && def.size[0] * def.size[1] > 1,
  };
}

/** Standalone object for a visual (used for big buildings, ghosts and animations). */
export function objectFor(v: Visual): THREE.Group {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.matrixAutoUpdate = false;
  inner.matrix.copy(v.local);
  g.add(inner);
  const mesh = new THREE.Mesh(v.geometry, v.material);
  mesh.castShadow = v.castShadow;
  mesh.receiveShadow = true;
  inner.add(mesh);
  for (const p of v.parts ?? []) {
    const pm = new THREE.Mesh(p.geometry, v.material);
    pm.name = p.name;
    pm.position.copy(p.pivot);
    pm.castShadow = v.castShadow;
    inner.add(pm);
  }
  return g;
}

/** Translucent copy for build-mode ghosts. */
export function ghostMaterial(src: THREE.Material): THREE.Material {
  const m = (src as THREE.MeshLambertMaterial).clone();
  m.transparent = true;
  m.opacity = 0.75;
  m.depthWrite = false;
  return m;
}

/** Ground highlight squares under a footprint. */
export function footprintMesh(): THREE.Mesh {
  const g = new THREE.PlaneGeometry(1, 1);
  g.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: '#4cff6a', transparent: true, opacity: 0.45, depthWrite: false });
  const mesh = new THREE.Mesh(g, mat);
  mesh.renderOrder = 2;
  return mesh;
}

/** Simple "construction" crates + scaffolding look composed from KayKit stage models. */
export async function constructionVisual(size: [number, number]): Promise<THREE.Object3D> {
  const id = size[0] >= 3 ? 'bld/stage_b' : 'bld/stage_a';
  const sm = await assets.static(id);
  const v: Visual = { key: id, geometry: sm.geometry, material: sm.material, local: fitMatrix(sm.size, size[0], size[1], 0.95), height: sm.size.y, castShadow: true };
  const o = objectFor(v);
  // a little sign so it reads as "under construction"
  const sign = new THREE.Mesh(geo().block(0.06, 0.7, 0.06, '#8a5528').block(0.55, 0.32, 0.05, '#ffcf3f', [0, 0.45, 0]).build(), assets.vertexMaterial);
  sign.position.set(size[0] / 2 - 0.3, 0, size[1] / 2 - 0.2);
  o.add(sign);
  return o;
}
