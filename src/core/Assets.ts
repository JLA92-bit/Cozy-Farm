import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

/** Shape of public/assets/manifest.json (written by scripts/build-assets.mjs). */
export interface ModelInfo {
  url: string;
  atlas?: string;
  pack: string;
  min: [number, number, number];
  max: [number, number, number];
  tris: number;
  skinned?: boolean;
  anims?: string[];
}
export interface Manifest {
  textures: Record<string, string>;
  models: Record<string, ModelInfo>;
  sfx: Record<string, string>;
  music: Record<string, string>;
  icons: Record<string, string>;
}

export const BASE = import.meta.env.BASE_URL;
export const assetUrl = (p: string): string => `${BASE}assets/${p}`;

/**
 * Path of an icon inside assets/. Every icon is built as icons/<key>.svg, so a key missing from the
 * manifest (a phone still holding an older manifest.json than the game code) still finds its file.
 */
export const iconPath = (key: string): string => assets.manifest?.icons[key] ?? `icons/${key}.svg`;

/** A prepared static model: one merged geometry + one shared material, plus optional animated sub-parts. */
export interface StaticModel {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  parts: { name: string; geometry: THREE.BufferGeometry; pivot: THREE.Vector3 }[];
  size: THREE.Vector3;
}

const tmpColor = new THREE.Color();

/** meshopt/KHR_mesh_quantization stores attributes as normalized ints; convert to float before transforming. */
export function dequantize(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name] as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
    if (a.array instanceof Float32Array && !a.normalized && !(a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) continue;
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
    g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
  return g;
}

/** Saturation/brightness lift applied to flat-coloured models so they match the brighter KayKit palette. */
function boostColor(c: THREE.Color): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  // Kenney's foliage is teal; pull it toward the warmer grass green used by the terrain and KayKit
  if (hsl.h > 0.36 && hsl.h < 0.52 && hsl.s > 0.2) hsl.h = 0.29 + (hsl.h - 0.36) * 0.35;
  hsl.s = Math.min(1, hsl.s * 1.25 + 0.04);
  hsl.l = Math.min(0.92, hsl.l * 1.08 + 0.02);
  return c.setHSL(hsl.h, hsl.s, hsl.l);
}

export class Assets {
  manifest!: Manifest;
  readonly textures = new Map<string, THREE.Texture>();
  readonly materials = new Map<string, THREE.Material>();
  private gltfs = new Map<string, Promise<GLTF>>();
  private statics = new Map<string, StaticModel>();
  private loader = new GLTFLoader();
  private texLoader = new THREE.TextureLoader();
  /** Material used for flat vertex-coloured models (Kenney kits + procedural geometry). */
  readonly vertexMaterial: THREE.MeshLambertMaterial;

  constructor() {
    this.loader.setMeshoptDecoder(MeshoptDecoder);
    this.vertexMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.vertexMaterial.name = 'vertex-palette';
  }

  async loadManifest(): Promise<void> {
    // revalidate so a browser-cached manifest.json never lags behind freshly deployed game code
    const res = await fetch(assetUrl('manifest.json'), { cache: 'no-cache' }).catch(() => fetch(assetUrl('manifest.json')));
    this.manifest = await res.json();
  }

  async loadAtlases(): Promise<void> {
    await Promise.all(Object.entries(this.manifest.textures).map(async ([key, url]) => {
      const tex = await this.texLoader.loadAsync(assetUrl(url));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false; // glTF UV convention
      // palette atlases: nearest keeps swatches crisp, no mips needed
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = key.startsWith('kaykit') ? THREE.LinearFilter : THREE.NearestFilter;
      tex.generateMipmaps = false;
      this.textures.set(key, tex);
      const mat = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true });
      mat.name = `atlas-${key}`;
      this.materials.set(key, mat);
    }));
  }

  has(id: string): boolean { return !!this.manifest.models[id]; }
  info(id: string): ModelInfo {
    const m = this.manifest.models[id];
    if (!m) throw new Error(`unknown model ${id}`);
    return m;
  }

  loadGLTF(id: string): Promise<GLTF> {
    let p = this.gltfs.get(id);
    if (!p) {
      p = this.loader.loadAsync(assetUrl(this.info(id).url));
      this.gltfs.set(id, p);
    }
    return p;
  }

  /** Preload a list of models, reporting progress 0..1. */
  async preload(ids: string[], onProgress?: (f: number) => void): Promise<void> {
    let done = 0;
    await Promise.all(ids.map(async (id) => {
      try {
        await this.loadGLTF(id);
        if (!this.info(id).skinned && !this.info(id).anims) this.prepareStatic(id, await this.loadGLTF(id));
      } catch (e) {
        console.warn('model failed', id, e);
      }
      done++;
      onProgress?.(done / ids.length);
    }));
  }

  /**
   * Merge a static glTF into a single geometry with a single shared material.
   * Material base colours are baked into vertex colours, so flat-coloured kits batch with one material.
   * Nodes listed in `partNames` stay separate so they can be animated (e.g. windmill blades).
   */
  prepareStatic(id: string, gltf: GLTF, partNames: string[] = []): StaticModel {
    const key = partNames.length ? `${id}|${partNames.join(',')}` : id;
    const cached = this.statics.get(key);
    if (cached) return cached;
    const info = this.info(id);
    const atlas = info.atlas;
    const main: THREE.BufferGeometry[] = [];
    const partGeoms = new Map<string, THREE.BufferGeometry[]>();
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      let g = dequantize(mesh.geometry.clone());
      if (g.index) g = g.toNonIndexed();
      g.applyMatrix4(mesh.matrixWorld);
      const count = g.attributes.position.count;
      // vertex colours from material colour (per group when multi-material)
      const colors = new Float32Array(count * 3);
      const fill = (start: number, n: number, mat: THREE.Material) => {
        const c = (mat as THREE.MeshStandardMaterial).color ?? new THREE.Color(1, 1, 1);
        tmpColor.copy(c);
        if (!atlas) boostColor(tmpColor);
        else tmpColor.setRGB(1, 1, 1);
        for (let i = start; i < Math.min(count, start + n); i++) tmpColor.toArray(colors, i * 3);
      };
      if (g.groups.length && mats.length > 1) for (const grp of g.groups) fill(grp.start, grp.count, mats[grp.materialIndex ?? 0]);
      else fill(0, count, mats[0]);
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
      g.clearGroups();
      // find whether this mesh belongs to an animated part
      let partName: string | undefined;
      let p: THREE.Object3D | null = mesh;
      while (p) { if (partNames.includes(p.name)) { partName = p.name; break; } p = p.parent; }
      if (partName) {
        if (!partGeoms.has(partName)) partGeoms.set(partName, []);
        partGeoms.get(partName)!.push(g);
      } else main.push(g);
    });
    const geometry = main.length ? mergeGeometries(main, false)! : new THREE.BufferGeometry();
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!;
    const size = bb.getSize(new THREE.Vector3());
    // recentre: XZ centre at origin, base at y=0
    const offset = new THREE.Vector3(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    geometry.translate(offset.x, offset.y, offset.z);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const parts: StaticModel['parts'] = [];
    for (const [name, gs] of partGeoms) {
      const pg = mergeGeometries(gs, false)!;
      pg.translate(offset.x, offset.y, offset.z);
      pg.computeBoundingBox();
      const pivot = pg.boundingBox!.getCenter(new THREE.Vector3());
      pg.translate(-pivot.x, -pivot.y, -pivot.z);
      parts.push({ name, geometry: pg, pivot });
    }
    const material = atlas ? this.materials.get(atlas)! : this.vertexMaterial;
    const model: StaticModel = { geometry, material, parts, size };
    this.statics.set(key, model);
    return model;
  }

  /** Synchronous access to an already-loaded static model. */
  getStatic(id: string): StaticModel | undefined { return this.statics.get(id); }

  async static(id: string, partNames: string[] = []): Promise<StaticModel> {
    const gltf = await this.loadGLTF(id);
    return this.prepareStatic(id, gltf, partNames);
  }

  /** Mesh (or group with animated parts) for a static model. */
  async mesh(id: string, partNames: string[] = []): Promise<THREE.Object3D> {
    const m = await this.static(id, partNames);
    return this.meshFrom(m);
  }

  meshFrom(m: StaticModel): THREE.Object3D {
    const mesh = new THREE.Mesh(m.geometry, m.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (!m.parts.length) return mesh;
    const group = new THREE.Group();
    group.add(mesh);
    for (const p of m.parts) {
      const pm = new THREE.Mesh(p.geometry, m.material);
      pm.name = p.name;
      pm.position.copy(p.pivot);
      pm.castShadow = true;
      group.add(pm);
    }
    return group;
  }

  /**
   * Clone an animated model (pets: node animation, characters: skinned).
   * Materials are swapped to the shared atlas material unless `material` is given (used for recolours).
   */
  async animated(id: string, material?: THREE.Material): Promise<{ root: THREE.Object3D; clips: THREE.AnimationClip[] }> {
    const gltf = await this.loadGLTF(id);
    const info = this.info(id);
    if (info.atlas) {
      // shared atlas material uses vertex colours as a tint: give the source geometry white colours once
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && !mesh.geometry.attributes.color) {
          const n = mesh.geometry.attributes.position.count;
          mesh.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
        }
      });
    }
    const root = SkeletonUtils.clone(gltf.scene);
    const mat = material ?? (info.atlas ? this.materials.get(info.atlas)! : this.vertexMaterial);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        if (!info.atlas) {
          // flat colour model: keep per-material colours via cloned lambert
          const src = mesh.material as THREE.MeshStandardMaterial;
          mesh.material = new THREE.MeshLambertMaterial({ color: boostColor(src.color.clone()) });
        } else {
          mesh.material = mat;
        }
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        mesh.frustumCulled = false;
      }
    });
    return { root, clips: gltf.animations };
  }
}

export const assets = new Assets();
