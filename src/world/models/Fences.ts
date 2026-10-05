import * as THREE from 'three';
import { geo, rng, type GeoBuilder } from '../Procedural';

/**
 * Fence styles and their gates. Sizes are in tiles (1 unit = 1 tile); every piece runs along x.
 *
 * Each style has three builders:
 *  - `<id>`      one full tile: a post at the centre and rails / wall across the whole tile, so runs join seamlessly
 *  - `<id>_arm`  half a tile from the centre post to the +x edge, drawn once towards each neighbour at corners,
 *                T-junctions and crossings (FarmView picks it up automatically when it exists)
 * and every gate (`gate_<style>`) is a frame plus one or two swinging leaves (see `gateParts`), merged for thumbnails.
 */
type V3 = [number, number, number];

/** Draws a style's piece: the whole tile, or just the arm from the centre to +x. */
type Piece = (b: GeoBuilder, arm: boolean) => void;

/**
 * Positions along a tile for repeated parts (pickets, canes, bars), evenly spaced `step` apart right across tile
 * edges so runs never show a seam, keeping clear of the centre post by `min`. Arms keep the ones on the +x side.
 */
function spots(step: number, arm: boolean, min = step / 2): number[] {
  const out: number[] = [];
  for (let x = 0.5 - step / 2; x >= min - 1e-6; x -= step) { out.push(x); if (!arm) out.push(-x); }
  return out;
}
/** Start of the rails / wall: the far edge for a full tile, just behind the centre for an arm. */
const x0 = (arm: boolean, back = 0): number => (arm ? -back : -0.5);
/** A box from x=a to x=b. */
function span(b: GeoBuilder, a: number, e: number, h: number, d: number, color: string, y: number, z = 0): void {
  b.box(e - a, h, d, color, [(a + e) / 2, y, z]);
}

// ---------------------------------------------------------------------------------------- palette
const C = {
  white: '#fbf5e9', whiteShade: '#e8dcc6', whitePost: '#f4ecdc',
  stone: ['#b9b3a5', '#a8a396', '#c7c1b2', '#9f9a8d', '#b2ad9f'], stoneCap: '#928d81', moss: '#86b84f',
  bamboo: '#d4c070', bambooDark: '#b7a255', bambooNode: '#9b8a44', tie: '#7c5a32',
  brick: ['#c8673f', '#b95a37', '#d27449'], mortar: '#e9d9bb', coping: '#f1e5c8', copingShade: '#dccdab',
  iron: '#3d3a45', ironLight: '#55515e', gold: '#f0bd4c', plinth: '#bdb7aa',
  palisade: '#7f4b2b', palisadeDark: '#5f3620', palisadeLight: '#93603a',
  rail: '#ffc5a6', railDark: '#e3ad94',
  sage: '#79a868', sageDark: '#5d8a50', wood: '#c98a4b', woodDark: '#8a5528',
};

// ---------------------------------------------------------------------------------------- styles
const whitePicket: Piece = (b, arm) => {
  // rails behind the pickets
  for (const y of [0.13, 0.32]) span(b, x0(arm), 0.5, 0.05, 0.035, C.whiteShade, y, -0.035);
  for (const x of spots(0.1, arm, 0.1)) {
    b.block(0.065, 0.36, 0.03, C.white, [x, 0.02, 0]);
    b.box(0.046, 0.046, 0.03, C.white, [x, 0.38, 0], [0, 0, Math.PI / 4]);
  }
  // centre post with a little cap
  b.block(0.09, 0.44, 0.09, C.whitePost, [0, 0, -0.01]);
  b.block(0.12, 0.035, 0.12, C.white, [0, 0.44, -0.01]);
  b.cone(0.05, 0.06, C.white, [0, 0.475, -0.01], 4);
};

/** Stones of the dry stone wall, laid out once so a full tile and an arm use exactly the same stones. */
const STONES = (() => {
  const r = rng(4242);
  const out: { x: number; y: number; w: number; h: number; d: number; c: string; tilt: number }[] = [];
  const courses = [{ y: 0, h: 0.13 }, { y: 0.125, h: 0.12 }, { y: 0.24, h: 0.11 }];
  courses.forEach((co, i) => {
    let x = -0.5 - (i % 2) * 0.09;
    while (x < 0.5) {
      const w = 0.15 + r() * 0.09;
      const a = Math.max(-0.5, x), e = Math.min(0.5, x + w);
      if (e - a > 0.04) out.push({ x: (a + e) / 2, y: co.y, w: e - a - 0.012, h: co.h - 0.012, d: 0.3 - i * 0.03 + r() * 0.02, c: C.stone[Math.floor(r() * C.stone.length)], tilt: (r() - 0.5) * 0.08 });
      x += w;
    }
  });
  return out;
})();
const dryStone: Piece = (b, arm) => {
  // a rough core so no gaps show through, then the stones
  b.block(arm ? 0.66 : 1, 0.33, 0.22, C.stone[3], [arm ? 0.17 : 0, 0, 0]);
  for (const s of STONES) {
    if (arm && s.x < -0.12) continue;
    b.block(s.w, s.h, s.d, s.c, [s.x, s.y, 0], [0, 0, s.tilt]);
  }
  // flat cap stones on top, with a tuft of moss
  const caps = [-0.4, -0.2, 0, 0.2, 0.4].filter((x) => !arm || x > -0.1);
  caps.forEach((x, i) => b.block(0.19, 0.06, 0.26, i % 2 ? C.stoneCap : C.stone[2], [x, 0.34, 0], [0, (i % 3 - 1) * 0.05, 0]));
  b.sphere(0.05, C.moss, [arm ? 0.3 : -0.3, 0.38, 0.06], 0, [1.2, 0.5, 1]);
};

const bamboo: Piece = (b, arm) => {
  const r = rng(77);
  const canes = spots(1 / 14, arm, 0.08);
  const hs = new Map<number, number>();
  for (const x of spots(1 / 14, false, 0.08)) hs.set(Math.round(x * 1000), 0.5 + r() * 0.08);
  for (const x of canes) {
    const h = hs.get(Math.round(x * 1000)) ?? 0.52;
    const col = Math.round(x * 1000) % 3 === 0 ? C.bambooDark : C.bamboo;
    b.cyl(0.03, 0.033, h, col, [x, 0, 0], 6);
    b.cyl(0.035, 0.035, 0.025, C.bambooNode, [x, h * 0.45, 0], 6);
  }
  // split-cane rails, both faces, tied on
  for (const y of [0.14, 0.38]) for (const z of [-0.045, 0.045]) b.cyl(0.022, 0.022, arm ? 0.56 : 1, C.bambooDark, [arm ? 0.22 : 0, y, z], 6, [0, 0, Math.PI / 2]);
  // stout centre post with a lashing
  b.cyl(0.05, 0.055, 0.62, C.bamboo, [0, 0, 0], 7);
  b.cyl(0.058, 0.058, 0.03, C.bambooNode, [0, 0.3, 0], 7);
  for (const y of [0.14, 0.38]) b.cyl(0.062, 0.062, 0.05, C.tie, [0, y - 0.025, 0], 7);
};

const lowBrick: Piece = (b, arm) => {
  // mortar core, bricks set slightly proud of it so the joints read
  const a = x0(arm, 0.14);
  span(b, a, 0.5, 0.36, 0.24, C.mortar, 0.18);
  for (let i = 0; i < 5; i++) {
    const off = i % 2 ? 0.08 : 0;
    for (let x = -0.5 - off; x < 0.5; x += 0.16) {
      const s = Math.max(a, x + 0.007), e = Math.min(0.5, x + 0.16 - 0.007);
      if (e - s < 0.02) continue;
      const c = C.brick[(Math.round((x + 1) * 50) + i) % 3];
      b.box(e - s, 0.062, 0.26, c, [(s + e) / 2, 0.038 + i * 0.07, 0]);
    }
  }
  // cream coping along the top
  span(b, x0(arm, 0.16), 0.5, 0.05, 0.31, C.coping, 0.385);
  span(b, x0(arm, 0.16), 0.5, 0.02, 0.27, C.copingShade, 0.355);
};

const wroughtIron: Piece = (b, arm) => {
  // stone plinth
  span(b, x0(arm, 0.09), 0.5, 0.09, 0.16, C.plinth, 0.045);
  span(b, x0(arm, 0.08), 0.5, 0.02, 0.18, C.stone[2], 0.1);
  for (const y of [0.17, 0.5]) span(b, x0(arm), 0.5, 0.03, 0.03, C.iron, y);
  for (const x of spots(0.1, arm, 0.04)) {
    b.block(0.022, 0.5, 0.022, C.iron, [x, 0.1, 0]);
    b.cone(0.03, 0.07, C.iron, [x, 0.6, 0], 4);
  }
  // little scrolls between the rails
  for (const x of spots(0.25, arm)) b.torus(0.045, 0.01, C.ironLight, [x, 0.25, 0]);
  // centre post with a gold finial
  b.block(0.06, 0.6, 0.06, C.iron, [0, 0.1, 0]);
  b.block(0.08, 0.03, 0.08, C.ironLight, [0, 0.69, 0]);
  b.sphere(0.04, C.gold, [0, 0.75, 0], 1);
};

const STYLES: Record<string, Piece> = {
  fence_white: whitePicket, fence_stone: dryStone, fence_bamboo: bamboo, fence_brick: lowBrick, fence_iron: wroughtIron,
};

// ---------------------------------------------------------------------------------------- gates
/** One swinging leaf: geometry built with the hinge at the origin, opening along +x (dir 1) or -x (dir -1). */
export interface GateLeaf { geometry: THREE.BufferGeometry; hinge: number; dir: 1 | -1 }
export interface GateParts { frame: THREE.BufferGeometry; leaves: GateLeaf[] }

/** Hinge posts sit near the tile edges so the neighbouring fence's rails meet them. */
const HINGE = 0.38;
const LEAF = HINGE * 2 - 0.02;

function leaf(build: (b: GeoBuilder, len: number) => void, len = LEAF, hinge = -HINGE, dir: 1 | -1 = 1): GateLeaf {
  const b = geo();
  build(b, len);
  const g = b.build();
  if (dir === -1) { g.scale(-1, 1, 1); g.computeVertexNormals(); }
  return { geometry: g, hinge, dir };
}

/** A pair of square posts either side of the opening. */
function posts(b: GeoBuilder, w: number, h: number, color: string, top?: (b: GeoBuilder, x: number) => void): void {
  for (const x of [-0.44, 0.44]) { b.block(w, h, w, color, [x, 0, 0]); top?.(b, x); }
}

const GATE_BUILDERS: Record<string, () => GateParts> = {
  gate_wood: () => ({
    frame: (() => {
      const b = geo();
      posts(b, 0.12, 0.6, C.palisadeDark, (g, x) => g.cone(0.085, 0.12, C.palisadeDark, [x, 0.6, 0], 4, [0, Math.PI / 4, 0]));
      b.block(1, 0.06, 0.08, C.palisadeDark, [0, 0, 0]);
      return b.build();
    })(),
    leaves: [leaf((b, len) => {
      const n = 5, w = len / n;
      for (let i = 0; i < n; i++) {
        const x = w * (i + 0.5), h = 0.42 + (i % 2) * 0.03;
        b.block(w - 0.012, h, 0.045, i % 2 ? C.palisade : C.palisadeLight, [x, 0.04, 0]);
        b.cone(w * 0.62, 0.07, i % 2 ? C.palisade : C.palisadeLight, [x, 0.04 + h, 0], 4, [0, Math.PI / 4, 0]);
      }
      for (const y of [0.12, 0.36]) b.box(len - 0.02, 0.055, 0.03, C.palisadeDark, [len / 2, y, 0.035]);
      b.box(Math.hypot(len, 0.24) - 0.06, 0.05, 0.03, C.palisadeDark, [len / 2, 0.24, 0.035], [0, 0, Math.atan2(0.24, len)]);
    })],
  }),
  gate_picket: () => ({
    frame: (() => {
      const b = geo();
      posts(b, 0.09, 0.42, C.railDark, (g, x) => g.block(0.11, 0.025, 0.11, C.rail, [x, 0.42, 0]));
      return b.build();
    })(),
    leaves: [leaf((b, len) => {
      // five-bar farm gate with a diagonal brace
      b.block(0.05, 0.32, 0.045, C.railDark, [0.03, 0.03, 0]);
      b.block(0.05, 0.32, 0.045, C.railDark, [len - 0.03, 0.03, 0]);
      for (const y of [0.07, 0.15, 0.23, 0.32]) b.box(len - 0.02, 0.04, 0.035, C.rail, [len / 2, y, 0]);
      b.box(Math.hypot(len, 0.25) - 0.04, 0.04, 0.03, C.railDark, [len / 2, 0.195, 0.025], [0, 0, Math.atan2(0.25, len)]);
    })],
  }),
  gate_white: () => ({
    frame: (() => {
      const b = geo();
      posts(b, 0.1, 0.5, C.whitePost, (g, x) => { g.block(0.13, 0.035, 0.13, C.white, [x, 0.5, 0]); g.sphere(0.045, C.white, [x, 0.57, 0], 1); });
      return b.build();
    })(),
    leaves: [leaf((b, len) => {
      for (const y of [0.12, 0.3]) b.box(len - 0.02, 0.05, 0.035, C.whiteShade, [len / 2, y, -0.035]);
      // pickets rising to a gentle arch in the middle
      const n = 7;
      for (let i = 0; i < n; i++) {
        const x = (len / n) * (i + 0.5), t = (x / len) * 2 - 1, h = 0.34 + (1 - t * t) * 0.08;
        b.block(0.06, h, 0.03, C.white, [x, 0.03, 0]);
        b.box(0.042, 0.042, 0.03, C.white, [x, 0.03 + h, 0], [0, 0, Math.PI / 4]);
      }
      b.box(0.05, 0.05, 0.02, C.gold, [len - 0.07, 0.22, 0.03]);
    })],
  }),
  gate_stone: () => ({
    frame: (() => {
      const b = geo();
      posts(b, 0.17, 0.48, C.stone[1], (g, x) => { g.block(0.21, 0.06, 0.32, C.stoneCap, [x, 0.48, 0]); g.sphere(0.04, C.moss, [x + 0.03, 0.55, 0.08], 0, [1.3, 0.5, 1]); });
      // pillar stones so the posts read as stacked, not cast
      for (const x of [-0.44, 0.44]) for (const [y, c] of [[0.02, C.stone[0]], [0.17, C.stone[2]], [0.32, C.stone[4]]] as [number, string][]) b.block(0.18, 0.13, 0.3, c, [x, y, 0], [0, 0, (y - 0.17) * 0.3]);
      return b.build();
    })(),
    leaves: [leaf((b, len) => {
      // weathered plank gate with iron straps
      const n = 5, w = len / n;
      for (let i = 0; i < n; i++) b.block(w - 0.01, 0.36, 0.04, i % 2 ? C.wood : '#bd7f43', [w * (i + 0.5), 0.04, 0]);
      for (const y of [0.1, 0.32]) b.box(len - 0.04, 0.035, 0.02, C.iron, [len / 2, y, 0.03]);
      b.box(0.04, 0.04, 0.02, C.iron, [len - 0.08, 0.22, 0.04]);
    })],
  }),
  gate_bamboo: () => ({
    frame: (() => {
      const b = geo();
      for (const x of [-0.44, 0.44]) {
        b.cyl(0.055, 0.06, 0.68, C.bamboo, [x, 0, 0], 7);
        b.cyl(0.063, 0.063, 0.03, C.bambooNode, [x, 0.34, 0], 7);
      }
      // a cane lintel across the top, lashed at both ends
      b.cyl(0.04, 0.04, 1.02, C.bambooDark, [0, 0.66, 0], 7, [0, 0, Math.PI / 2]);
      for (const x of [-0.44, 0.44]) b.cyl(0.065, 0.065, 0.05, C.tie, [x, 0.635, 0], 7);
      return b.build();
    })(),
    leaves: [leaf((b, len) => {
      const n = 9;
      for (let i = 0; i < n; i++) {
        const x = (len / n) * (i + 0.5);
        b.cyl(0.028, 0.03, 0.44 + (i % 2) * 0.03, i % 3 ? C.bamboo : C.bambooDark, [x, 0.04, 0], 6);
      }
      for (const y of [0.13, 0.36]) b.cyl(0.02, 0.02, len - 0.02, C.bambooDark, [len / 2, y, 0.035], 6, [0, 0, Math.PI / 2]);
      b.cyl(0.02, 0.02, Math.hypot(len, 0.23) - 0.05, C.tie, [len / 2, 0.245, 0.04], 6, [0, 0, Math.PI / 2 + Math.atan2(0.23, len)]);
    })],
  }),
  gate_brick: () => ({
    frame: (() => {
      const b = geo();
      for (const x of [-0.44, 0.44]) {
        b.block(0.2, 0.5, 0.3, C.mortar, [x, 0, 0]);
        for (let i = 0; i < 7; i++) b.box(0.21, 0.062, 0.31, C.brick[i % 3], [x, 0.038 + i * 0.07, 0]);
        b.block(0.25, 0.05, 0.35, C.coping, [x, 0.5, 0]);
        b.sphere(0.07, C.coping, [x, 0.6, 0], 1);
      }
      return b.build();
    })(),
    leaves: [leaf((b, len) => {
      // painted sage garden door with a little arched top
      const n = 6, w = len / n;
      for (let i = 0; i < n; i++) {
        const x = w * (i + 0.5), t = (x / len) * 2 - 1;
        b.block(w - 0.01, 0.34 + (1 - t * t) * 0.06, 0.04, i % 2 ? C.sage : C.sageDark, [x, 0.04, 0]);
      }
      for (const y of [0.11, 0.3]) b.box(len - 0.04, 0.04, 0.02, C.sageDark, [len / 2, y, 0.03]);
      b.sphere(0.022, C.gold, [len - 0.08, 0.22, 0.04], 0);
    })],
  }),
  gate_iron: () => ({
    frame: (() => {
      const b = geo();
      for (const x of [-0.44, 0.44]) {
        b.block(0.15, 0.62, 0.15, C.plinth, [x, 0, 0]);
        b.block(0.19, 0.05, 0.19, C.stone[2], [x, 0.62, 0]);
        b.sphere(0.055, C.gold, [x, 0.7, 0], 1);
      }
      return b.build();
    })(),
    // a pair of leaves meeting in the middle, rising to a peak
    leaves: ([1, -1] as const).map((dir) => leaf((b, len) => {
      for (const y of [0.1, 0.48]) b.box(len - 0.01, 0.03, 0.03, C.iron, [len / 2, y, 0]);
      const n = 4;
      for (let i = 0; i < n; i++) {
        const x = (len / n) * (i + 0.5), h = 0.5 + (x / len) * 0.14;
        b.block(0.022, h, 0.022, C.iron, [x, 0.06, 0]);
        b.cone(0.03, 0.07, C.iron, [x, 0.06 + h, 0], 4);
      }
      b.block(0.03, 0.55, 0.03, C.iron, [0.015, 0.06, 0]);
      b.block(0.03, 0.66, 0.03, C.ironLight, [len - 0.015, 0.06, 0]);
      b.torus(0.06, 0.012, C.gold, [len * 0.5, 0.29, 0]);
      b.sphere(0.03, C.gold, [len - 0.015, 0.75, 0], 0);
    }, HINGE - 0.005, dir === 1 ? -HINGE : HINGE, dir)),
  }),
};

const gateCache = new Map<string, GateParts>();
/** Frame and leaves of a gate model (cached), or null if `name` is not a gate. */
export function gateParts(name: string): GateParts | null {
  let p = gateCache.get(name);
  if (!p) {
    const fn = GATE_BUILDERS[name];
    if (!fn) return null;
    p = fn();
    gateCache.set(name, p);
  }
  return p;
}

/** The whole gate, closed, as one geometry (shop thumbnails, build ghosts). */
function closedGate(name: string): THREE.BufferGeometry {
  const p = gateParts(name)!;
  const b = geo().geometry(p.frame.clone(), null);
  for (const l of p.leaves) b.geometry(l.geometry.clone(), null, [l.hinge, 0, 0] as V3);
  return b.build();
}

/** Procedural models for ProcModels.PROC: every fence, its corner arm and every gate. */
export const FENCE_MODELS: Record<string, () => THREE.BufferGeometry> = Object.fromEntries([
  ...Object.entries(STYLES).flatMap(([id, piece]) => [
    [id, () => { const b = geo(); piece(b, false); return b.build(); }],
    [`${id}_arm`, () => { const b = geo(); piece(b, true); return b.build(); }],
  ]),
  ...Object.keys(GATE_BUILDERS).map((id) => [id, () => closedGate(id)]),
]);
