import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Builder for chunky low-poly vertex-coloured geometry. Every procedural model in the game is built with this,
 * merged into a single BufferGeometry that uses the shared vertex-colour material (one draw call per model).
 */
export const PAL = {
  grass: '#7ccf4f', grassDark: '#5fb83c', grassLight: '#93dd62', dirt: '#a8693a', dirtDark: '#7f4a26', soil: '#8a5530',
  soilWet: '#6e3f22', sand: '#f2d58c', water: '#4fc3e8', waterDeep: '#2e9fd0', wood: '#c98a4b', woodDark: '#8a5528',
  woodLight: '#e0aa6a', red: '#e2533c', redDark: '#b53a28', white: '#fff6e8', cream: '#f8e8c8', stone: '#a9a9a0',
  stoneDark: '#7b7d78', roof: '#d9473a', roofBlue: '#3f86d8', yellow: '#ffcf3f', gold: '#ffb820', green: '#4fae3a',
  leaf: '#62c447', pink: '#ff8fb4', purple: '#a77bf3', orange: '#ff8c3a', black: '#2b2622', hay: '#f0c75a', hayDark: '#c99a2e',
  metal: '#8c9aa6', glass: '#bfe8ff', skin: '#f2c49a', wool: '#fbf7ee',
} as const;

type V3 = [number, number, number];

export class GeoBuilder {
  private parts: THREE.BufferGeometry[] = [];

  private push(g: THREE.BufferGeometry, color: THREE.ColorRepresentation | null, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]): this {
    let geo = g.index ? g.toNonIndexed() : g;
    geo.deleteAttribute('uv');
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...pos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
      new THREE.Vector3(...scale),
    );
    geo.applyMatrix4(m);
    if (geo.index) geo = geo.toNonIndexed();
    geo.computeVertexNormals();
    const n = geo.attributes.position.count;
    if (color !== null || !geo.attributes.color) {
      const c = new THREE.Color(color ?? '#ffffff');
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) c.toArray(arr, i * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'color'].includes(name)) geo.deleteAttribute(name);
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    this.parts.push(geo);
    return this;
  }

  box(w: number, h: number, d: number, color: THREE.ColorRepresentation, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0]): this {
    return this.push(new THREE.BoxGeometry(w, h, d), color, pos, rot);
  }
  /** Box resting on y=pos[1]. */
  block(w: number, h: number, d: number, color: THREE.ColorRepresentation, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0]): this {
    return this.box(w, h, d, color, [pos[0], pos[1] + h / 2, pos[2]], rot);
  }
  cyl(rTop: number, rBot: number, h: number, color: THREE.ColorRepresentation, pos: V3 = [0, 0, 0], seg = 8, rot: V3 = [0, 0, 0]): this {
    return this.push(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1), color, [pos[0], pos[1] + (rot[0] || rot[2] ? 0 : h / 2), pos[2]], rot);
  }
  cone(r: number, h: number, color: THREE.ColorRepresentation, pos: V3 = [0, 0, 0], seg = 8, rot: V3 = [0, 0, 0]): this {
    return this.push(new THREE.ConeGeometry(r, h, seg, 1), color, [pos[0], pos[1] + h / 2, pos[2]], rot);
  }
  sphere(r: number, color: THREE.ColorRepresentation, pos: V3 = [0, 0, 0], detail = 1, scale: V3 = [1, 1, 1]): this {
    return this.push(new THREE.IcosahedronGeometry(r, detail), color, pos, [0, 0, 0], scale);
  }
  /** Triangular prism (gable roof). Ridge along X. */
  prism(w: number, h: number, d: number, color: THREE.ColorRepresentation, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0]): this {
    const shape = new THREE.Shape();
    shape.moveTo(-d / 2, 0);
    shape.lineTo(d / 2, 0);
    shape.lineTo(0, h);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
    g.translate(0, 0, -w / 2);
    g.rotateY(Math.PI / 2);
    return this.push(g, color, pos, rot);
  }
  torus(r: number, tube: number, color: THREE.ColorRepresentation, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0]): this {
    return this.push(new THREE.TorusGeometry(r, tube, 5, 10), color, pos, rot);
  }
  geometry(g: THREE.BufferGeometry, color: THREE.ColorRepresentation | null, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]): this {
    return this.push(g, color, pos, rot, scale);
  }

  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false)!;
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

export const geo = (): GeoBuilder => new GeoBuilder();

/** Deterministic PRNG (mulberry32) so procedural variety is stable between sessions. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
