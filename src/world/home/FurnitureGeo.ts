import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { assets, dequantize } from '../../core/Assets';
import { PIECE, type PieceDef } from '../../data';
import { buildProc } from './ProcFurniture';

/**
 * 1.29 furniture geometry for the home. Like Assets.prepareStatic (one merged geometry, colours baked into the
 * vertices so pieces batch together), but it remembers which part (material) each vertex came from, so the player
 * can recolour each part: a sofa's fabric and its wooden legs separately. Kenney Furniture Kit pieces have named
 * flat-colour parts; KayKit pieces are one textured part, tinted as a whole ("tint").
 */

/** Friendly names for the Kenney Furniture Kit's material names (the colour screen shows these). */
export const PART_NAMES: Record<string, string> = {
  wood: 'Wood', woodDark: 'Dark wood', carpet: 'Fabric', carpetWhite: 'Linen', carpetDarker: 'Fabric trim', carpetBlue: 'Upholstery',
  metal: 'Metal', metalDark: 'Dark metal', metalLight: 'Enamel', metalMedium: 'Trim', glass: 'Glass', lamp: 'Shade', plant: 'Leaves',
  fur: 'Fur', _defaultMat: 'Detail', tint: 'Finish',
  frame: 'Frame', sill: 'Sill', rod: 'Rod', fabric: 'Fabric', tie: 'Tie-back', stone: 'Stone', firebox: 'Firebox', mantel: 'Mantel', logs: 'Logs',
  case: 'Case', face: 'Face', hands: 'Hands', mount: 'Mount', board: 'Board', trim: 'Trim', books1: 'Books', books2: 'More books', books3: 'Other books',
  holder: 'Holder', wax: 'Candles', vase: 'Vase', stems: 'Stems', flowers: 'Flowers',
};

export interface PieceGeo {
  /** the piece with its default colours */
  base: THREE.BufferGeometry;
  material: THREE.Material;
  /** part names in vertex order of `partIndex` */
  parts: string[];
  /** default colour of each part (hex) */
  defaults: string[];
  partIndex: Uint8Array;
  /** size in metres (after the piece's scale) */
  size: THREE.Vector3;
  scale: number;
  atlas: boolean;
}

const geos = new Map<string, PieceGeo>();
const loading = new Map<string, Promise<PieceGeo>>();
const coloured = new Map<string, THREE.BufferGeometry>();
const tmp = new THREE.Color();

/** Same lift as Assets' flat-colour models get, so furniture matches the farm. */
function boost(c: THREE.Color): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return c.setHSL(hsl.h, Math.min(1, hsl.s * 1.15 + 0.03), Math.min(0.94, hsl.l * 1.05 + 0.02));
}

/** Load and prepare a piece's geometry (once). */
export function pieceGeo(piece: string): Promise<PieceGeo> {
  const done = geos.get(piece);
  if (done) return Promise.resolve(done);
  let p = loading.get(piece);
  if (!p) {
    p = build(PIECE[piece]);
    loading.set(piece, p);
  }
  return p;
}
export const pieceGeoNow = (piece: string): PieceGeo | undefined => geos.get(piece);

async function build(def: PieceDef): Promise<PieceGeo> {
  const proc = def.model.startsWith('proc:');
  const atlas = !proc && !!assets.info(def.model).atlas;
  const parts: string[] = [];
  const defaults: string[] = [];
  const chunks: THREE.BufferGeometry[] = [];
  const index: number[] = [];
  if (proc) {
    // built in code: every part already has its name and colour
    for (const p of buildProc(def.model.slice(5))) {
      let g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
      if (!g.attributes.normal) g.computeVertexNormals();
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.clearGroups();
      let k = parts.indexOf(p.part);
      if (k < 0) { k = parts.push(p.part) - 1; defaults.push(p.colour); }
      chunks.push(g);
      for (let i = 0; i < g.attributes.position.count; i++) index.push(k);
    }
    return finish(def, chunks, index, parts, defaults, false);
  }
  const gltf = await assets.loadGLTF(def.model);
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    let g = dequantize(mesh.geometry.clone());
    if (g.index) g = g.toNonIndexed();
    g.applyMatrix4(mesh.matrixWorld);
    const count = g.attributes.position.count;
    const partOf = new Uint8Array(count);
    const assign = (start: number, n: number, mat: THREE.Material) => {
      const name = atlas ? 'tint' : (mat.name || '_defaultMat');
      let k = parts.indexOf(name);
      if (k < 0) {
        k = parts.push(name) - 1;
        defaults.push(atlas ? '#ffffff' : `#${boost(tmp.copy((mat as THREE.MeshStandardMaterial).color ?? new THREE.Color(1, 1, 1))).getHexString()}`);
      }
      for (let i = start; i < Math.min(count, start + n); i++) partOf[i] = k;
    };
    if (g.groups.length && mats.length > 1) for (const grp of g.groups) assign(grp.start, grp.count, mats[grp.materialIndex ?? 0]);
    else assign(0, count, mats[0]);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    g.clearGroups();
    chunks.push(g);
    for (let i = 0; i < count; i++) index.push(partOf[i]);
  });
  return finish(def, chunks, index, parts, defaults, atlas);
}

function finish(def: PieceDef, chunks: THREE.BufferGeometry[], index: number[], parts: string[], defaults: string[], atlas: boolean): PieceGeo {
  const merged = chunks.length ? mergeGeometries(chunks, false)! : new THREE.BufferGeometry();
  const scale = def.scale ?? 1;
  merged.scale(scale, scale, scale);
  merged.computeBoundingBox();
  const bb = merged.boundingBox!;
  // recentre: middle at x/z 0, base at y 0
  merged.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  const size = merged.boundingBox!.getSize(new THREE.Vector3());
  const partIndex = Uint8Array.from(index);
  // pictures (frames, plaques) are drawn on a plane in front: keep where it goes, in the piece's own space
  const geo: PieceGeo = { base: merged, material: atlas ? assets.materials.get(assets.info(def.model).atlas!)! : assets.vertexMaterial, parts, defaults, partIndex, size, scale, atlas };
  paint(geo, merged, {});
  geos.set(def.id, geo);
  return geo;
}

function paint(geo: PieceGeo, g: THREE.BufferGeometry, colours: Record<string, string>, lit?: boolean): void {
  const n = geo.partIndex.length;
  const arr = new Float32Array(n * 3);
  const cols = geo.parts.map((p, i) => {
    const c = new THREE.Color(colours[p] ?? geo.defaults[i]);
    // a lamp's shade glows when it is on and goes dim when it is off
    if (p === 'lamp' && lit !== undefined) { if (lit) c.lerp(new THREE.Color('#fff6d0'), 0.55).multiplyScalar(1.15); else c.multiplyScalar(0.6); }
    return c;
  });
  for (let i = 0; i < n; i++) cols[geo.partIndex[i]].toArray(arr, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

/** The piece's geometry in these colours (cached per colour set; the default colours share the base geometry). */
export function colouredGeo(piece: string, colours: Record<string, string> | undefined, lit?: boolean): THREE.BufferGeometry | null {
  const geo = geos.get(piece);
  if (!geo) return null;
  const isLamp = !!PIECE[piece]?.lamp;
  const keyCols = colours && Object.keys(colours).length ? Object.entries(colours).sort().map(([k, v]) => `${k}=${v}`).join(',') : '';
  if (!keyCols && !isLamp) return geo.base;
  const key = `${piece}|${keyCols}|${isLamp ? (lit === false ? 0 : 1) : ''}`;
  let g = coloured.get(key);
  if (!g) {
    g = geo.base.clone();
    paint(geo, g, colours ?? {}, isLamp ? lit !== false : undefined);
    coloured.set(key, g);
  }
  return g;
}
