import * as THREE from 'three';
import { geo, rng, type GeoBuilder } from '../Procedural';

/**
 * Path tiles: flat 1x1 walkway pieces, centred on the tile (x/z in -0.5..0.5, y up from 0).
 *
 * Patterned paths (bricks, setts, flagstones, planks) are laid out as a pattern that repeats exactly every tile and
 * is clipped to the tile square, so a stone cut by one tile edge continues on the neighbouring tile with the same
 * colour and height: a run of tiles reads as one continuous path. Each tile has a full-size grout bed underneath so
 * no grass shows through at the seams. Scattered paths (gravel, petals, stepping stones) keep everything inside the
 * tile and may be turned per tile (see PATH_SPIN) so big areas don't repeat.
 */

type Pt = [number, number];
const H = 0.5;
/** Grout bed height; pieces stand on top of it. */
const BED = 0.014;

const area = (p: Pt[]): number => {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % p.length]; a += x1 * z2 - x2 * z1; }
  return a / 2;
};
const ccw = (p: Pt[]): Pt[] => (area(p) < 0 ? [...p].reverse() : p);
const centroid = (p: Pt[]): Pt => [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];

/** Drop duplicate and collinear points. */
function tidy(p: Pt[]): Pt[] {
  let out = p.filter((q, i) => { const n = p[(i + 1) % p.length]; return Math.hypot(q[0] - n[0], q[1] - n[1]) > 1e-5; });
  out = out.filter((q, i) => {
    const a = out[(i + out.length - 1) % out.length], b = out[(i + 1) % out.length];
    return Math.abs((q[0] - a[0]) * (b[1] - a[1]) - (q[1] - a[1]) * (b[0] - a[0])) > 1e-7;
  });
  return out;
}

/** Sutherland-Hodgman clip of a convex polygon to the tile square. */
function clipTile(poly: Pt[]): Pt[] {
  let p = poly;
  const planes: [number, number, number][] = [[1, 0, H], [-1, 0, H], [0, 1, H], [0, -1, H]]; // keep a*x + b*z <= c
  for (const [a, b, c] of planes) {
    if (!p.length) break;
    const out: Pt[] = [];
    for (let i = 0; i < p.length; i++) {
      const cur = p[i], prev = p[(i + p.length - 1) % p.length];
      const dc = a * cur[0] + b * cur[1] - c, dp = a * prev[0] + b * prev[1] - c;
      if (dc <= 0) {
        if (dp > 0) { const t = dp / (dp - dc); out.push([prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t]); }
        out.push(cur);
      } else if (dp <= 0) { const t = dp / (dp - dc); out.push([prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t]); }
    }
    p = out;
  }
  return tidy(p);
}

/** Move each edge of a convex CCW polygon inward by d[i] (edge i runs from p[i] to p[i+1]). */
function offset(p: Pt[], d: number | number[]): Pt[] {
  const n = p.length;
  const dist = (i: number): number => (typeof d === 'number' ? d : d[i]);
  const lines = p.map((a, i) => {
    const b = p[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
    const nx = -dz, nz = dx; // inward normal for a CCW polygon
    return { px: a[0] + nx * dist(i), pz: a[1] + nz * dist(i), dx, dz };
  });
  return p.map((_, i) => {
    const l1 = lines[(i + n - 1) % n], l2 = lines[i];
    const den = l1.dx * l2.dz - l1.dz * l2.dx;
    if (Math.abs(den) < 1e-9) return [l2.px, l2.pz] as Pt;
    const t = ((l2.px - l1.px) * l2.dz - (l2.pz - l1.pz) * l2.dx) / den;
    return [l1.px + l1.dx * t, l1.pz + l1.dz * t] as Pt;
  });
}

/** Point inside (or on) a convex CCW polygon. */
const inside = (p: Pt[], q: Pt): boolean => p.every((a, i) => {
  const b = p[(i + 1) % p.length];
  return (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]) >= -1e-6;
});

const onEdge = (a: Pt, b: Pt): boolean =>
  (Math.abs(Math.abs(a[0]) - H) < 1e-6 && Math.abs(a[0] - b[0]) < 1e-6) || (Math.abs(Math.abs(a[1]) - H) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6);

/** Flat prism from `bot` (at y0) to `top` (at y1, same vertex order). No bottom face. */
function prism(bot: Pt[], top: Pt[], y0: number, y1: number): THREE.BufferGeometry {
  const v: number[] = [];
  const tri = (a: number[], b: number[], c: number[]): void => { v.push(...a, ...b, ...c); };
  const T = top.map(([x, z]) => [x, y1, z]), B = bot.map(([x, z]) => [x, y0, z]);
  for (let i = 1; i < T.length - 1; i++) tri(T[0], T[i + 1], T[i]);
  for (let i = 0; i < B.length; i++) {
    const j = (i + 1) % B.length;
    tri(B[i], T[j], B[j]);
    tri(B[i], T[i], T[j]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return g;
}

/** Stable 0..1 hash of a point taken modulo the tile, so the two halves of a cut stone agree. */
function cellHash(p: Pt, salt = 0): number {
  const w = (x: number): number => Math.round((((x + H) % 1) + 1) % 1 * 1000) % 1000;
  let h = Math.imul(w(p[0]) + 7919 * w(p[1]) + 104729 * salt, 2654435761) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

interface Lay {
  /** gap between pieces */
  grout: number;
  /** piece height above the bed */
  h: number;
  /** top chamfer (soft rounded look); 0 on cut edges so neighbours meet flush */
  bevel: number;
  colors: string[];
  /** extra random height per piece */
  bump?: number;
}

/** Lay one periodic piece: grout inset, clip to the tile, chamfer, colour by its (tile-periodic) identity. */
function lay(b: GeoBuilder, poly: Pt[], o: Lay, salt = 0): void {
  const id = centroid(poly);
  let p = ccw(poly);
  if (o.grout > 0) p = offset(p, o.grout / 2);
  if (area(p) <= 0) return;
  p = clipTile(p);
  if (p.length < 3 || area(p) < 0.0004) return;
  p = ccw(p);
  const xs = p.map((q) => q[0]), zs = p.map((q) => q[1]);
  const minDim = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  // chamfer the top; on sharp corners the mitred inset can overshoot the stone, so shrink it until it fits
  let bev = Math.min(o.bevel, minDim * 0.3);
  let top = p;
  for (let k = 0; k < 4 && bev > 0.002; k++, bev /= 2) {
    const t = offset(p, p.map((q, i) => (onEdge(q, p[(i + 1) % p.length]) ? 0 : bev)));
    if (area(t) > 0 && t.every((q) => inside(p, q))) { top = t; break; }
  }
  const r = cellHash(id, salt);
  const color = o.colors[Math.floor(r * o.colors.length) % o.colors.length];
  const h = o.h + (o.bump ? (cellHash(id, salt + 17) - 0.5) * o.bump : 0);
  b.geometry(prism(p, top, BED, BED + h), color);
}

const rect = (x0: number, z0: number, x1: number, z1: number): Pt[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
// Grout bed: just a flat top, a hair wider than the tile so neighbours overlap. No side walls: where two beds meet,
// a wall would peek through the join as a faint line, and at the outer edge it is too thin to see anyway.
const bed = (color: string): GeoBuilder => geo().geometry(new THREE.PlaneGeometry(1.004, 1.004), color, [0, BED, 0], [-Math.PI / 2, 0, 0]);

/** Running bond: rows of `len` x `row` bricks, every other row shifted half a brick. */
function runningBond(b: GeoBuilder, len: number, row: number, o: Lay, jitter = 0): void {
  const rows = Math.round(1 / row);
  for (let r = -1; r <= rows; r++) {
    const shift = (r & 1) * len / 2;
    for (let x = -H - len + shift; x < H + len; x += len) {
      const z = -H + r * row;
      const j = jitter ? (cellHash([x + len / 2, z + row / 2], 5) - 0.5) * jitter : 0;
      lay(b, rect(x + j, z, x + len + j * 0.5, z + row), o);
    }
  }
}

/** 90-degree herringbone of 2:1 bricks (unit = brick width, 8 units per tile so it repeats every tile). */
function herringbone(b: GeoBuilder, o: Lay): void {
  const u = 1 / 8;
  for (let c = -4; c <= 4; c++) for (let k = -10; k <= 10; k++) {
    const ox = k + 2 * c, oz = k - 2 * c;
    lay(b, rect(ox * u - H, oz * u - H, (ox + 2) * u - H, (oz + 1) * u - H), o);
    lay(b, rect(ox * u - H, (oz + 1) * u - H, (ox + 1) * u - H, (oz + 3) * u - H), o);
  }
}

/** Irregular stones from a jittered vertex grid that repeats every tile (n x n stones per tile). */
function crazyPaving(b: GeoBuilder, n: number, amp: number, seed: number, o: Lay, split = 0.3): void {
  const jit = (i: number, j: number, axis: number): number => {
    const r = rng(seed * 997 + (((i % n) + n) % n) * 31 + (((j % n) + n) % n) * 131 + axis * 7)();
    return (r - 0.5) * 2 * amp;
  };
  const vtx = (i: number, j: number): Pt => [i / n - H + jit(i, j, 0), j / n - H + jit(i, j, 1)];
  for (let i = -1; i <= n; i++) for (let j = -1; j <= n; j++) {
    const a = vtx(i, j), bb = vtx(i + 1, j), c = vtx(i + 1, j + 1), d = vtx(i, j + 1);
    const cut = cellHash(centroid([a, bb, c, d]), seed + 3);
    if (cut < split) { lay(b, [a, bb, c], o, seed); lay(b, [a, c, d], o, seed + 1); }
    else if (cut < split * 2) { lay(b, [a, bb, d], o, seed); lay(b, [bb, c, d], o, seed + 1); }
    else lay(b, [a, bb, c, d], o, seed);
  }
}

/** Little flattened pebbles scattered inside the tile. */
function pebbles(b: GeoBuilder, n: number, seed: number, colors: string[], size: [number, number], y = BED, margin = 0.06): void {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const s = size[0] + r() * (size[1] - size[0]);
    const x = (r() - 0.5) * (1 - margin * 2), z = (r() - 0.5) * (1 - margin * 2);
    b.geometry(new THREE.IcosahedronGeometry(s, 0), colors[Math.floor(r() * colors.length)], [x, y, z], [r() * 3, r() * 3, r() * 3], [1.2, 0.35, 1]);
  }
}

/** A rounded flat stone (n-gon with soft chamfer), fully inside the tile. */
function flatStone(b: GeoBuilder, cx: number, cz: number, rx: number, rz: number, h: number, color: string, seed: number, y = 0): void {
  const r = rng(seed);
  const n = 9;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.25;
    const k = 0.85 + r() * 0.15;
    pts.push([cx + Math.cos(a) * rx * k, cz + Math.sin(a) * rz * k]);
  }
  const p = ccw(pts);
  b.geometry(prism(p, offset(p, Math.min(rx, rz) * 0.18), y, y + h), color);
}

function petals(b: GeoBuilder, n: number, seed: number, colors: string[]): void {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = (r() - 0.5) * 0.9, z = (r() - 0.5) * 0.9;
    b.box(0.065, 0.006, 0.042, colors[Math.floor(r() * colors.length)], [x, BED + 0.004 + r() * 0.004, z], [(r() - 0.5) * 0.3, r() * Math.PI, (r() - 0.5) * 0.3]);
  }
}

export const PATH_MODELS: Record<string, () => THREE.BufferGeometry> = {
  path_gravel: () => {
    const b = bed('#cfc2a6');
    pebbles(b, 30, 11, ['#b8aa8e', '#e4d9c3', '#a69a83', '#d8cbb0', '#9a8f7b', '#c4b89e'], [0.025, 0.045]);
    return b.build();
  },

  path_planks: () => {
    const b = bed('#6e4628');
    // five planks across the tile, joints staggered row by row (pattern repeats every tile)
    const o: Lay = { grout: 0.022, h: 0.026, bevel: 0.01, colors: ['#c98a4b', '#d39656', '#bd7f43', '#d9a062', '#c4884e'] };
    const offs = [0.12, 0.62, 0.32, 0.82, 0.47];
    for (let r = 0; r < 5; r++) for (let k = -2; k <= 1; k++) {
      const x0 = -H + offs[r] + k;
      lay(b, rect(x0, -H + r * 0.2, x0 + 1, -H + (r + 1) * 0.2), o, r);
    }
    return b.build();
  },

  path_cobble: () => {
    const b = bed('#9d978a');
    runningBond(b, 0.25, 0.25, { grout: 0.03, h: 0.024, bevel: 0.03, bump: 0.01, colors: ['#c6c2b6', '#b3aea1', '#d1ccbf', '#aaa598', '#bdb8aa', '#c9bfae'] }, 0.04);
    return b.build();
  },

  path_stepping: () => {
    const b = geo();
    flatStone(b, 0.02, -0.03, 0.3, 0.26, 0.035, '#bdb9ad', 41);
    flatStone(b, 0.31, 0.32, 0.1, 0.08, 0.025, '#a9a598', 42);
    return b.build();
  },

  path_brick: () => {
    const b = bed('#dccbae');
    herringbone(b, { grout: 0.016, h: 0.022, bevel: 0.008, colors: ['#c4573d', '#b84d36', '#cf6447', '#ad4831', '#d26b4a', '#bf5a3f'] });
    return b.build();
  },

  path_flagstone: () => {
    const b = bed('#a99a7e');
    crazyPaving(b, 3, 0.07, 3, { grout: 0.028, h: 0.022, bevel: 0.02, bump: 0.008, colors: ['#dccfb5', '#cbbd9f', '#e3d9c4', '#c2b393', '#d5c3a2', '#cfc6b4'] }, 0.12);
    return b.build();
  },

  path_mossy: () => {
    // old rounded stones bedded in soft moss, a few tufts and moss patches on top
    const b = bed('#6c9a45');
    const r = rng(9);
    const greys = ['#a3a899', '#939b8c', '#adb19f', '#9aa38d', '#b2b4a6'];
    // one big stone, two middling and one small, packed loosely (tiles are turned by position so it never grids up)
    const stones: [number, number, number, number][] = [[-0.16, -0.14, 0.27, 0.24], [0.25, 0.17, 0.2, 0.22], [0.27, -0.27, 0.17, 0.15], [-0.24, 0.29, 0.18, 0.15]];
    stones.forEach(([cx, cz, rx, rz], k) => {
      flatStone(b, cx, cz, rx * 1.1, rz * 1.1, 0.026 + r() * 0.008, greys[Math.floor(r() * greys.length)], 50 + k, BED);
      if (rx > 0.15 && r() < 0.7) b.geometry(new THREE.IcosahedronGeometry(0.05, 0), r() < 0.5 ? '#7fb24c' : '#8cc055', [cx + (r() - 0.5) * rx * 0.8, BED + 0.032, cz + (r() - 0.5) * rz * 0.8], [r() * 3, r() * 3, r() * 3], [1.3, 0.12, 1]);
    });
    pebbles(b, 7, 77, ['#79b84a', '#5f9e3a', '#8cc858'], [0.03, 0.05], BED + 0.004, 0.04);
    return b.build();
  },

  path_mosaic: () => {
    const b = bed('#7c7f79');
    const r = rng(23);
    const peb = (x: number, z: number, s: number, c: string): void => {
      b.geometry(new THREE.IcosahedronGeometry(s, 0), c, [x, BED + 0.004, z], [r() * 3, r() * 3, r() * 3], [1.25, 0.4, 1]);
    };
    // a flower in the middle...
    peb(0, 0, 0.05, '#e8c25a');
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; peb(Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0.038, '#f3ead6'); }
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + 0.26; peb(Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0.032, '#d0764e'); }
    // ...and quarter circles in every corner that meet up into whole circles across tiles
    for (const [cx, cz] of [[-H, -H], [H, -H], [H, H], [-H, H]] as Pt[]) {
      for (let i = 0; i < 3; i++) {
        const a = Math.atan2(-cz, -cx) + ((i + 0.5) / 3 - 0.5) * (Math.PI / 2);
        peb(cx + Math.cos(a) * 0.2, cz + Math.sin(a) * 0.2, 0.032, '#5f7186');
      }
      const a = Math.atan2(-cz, -cx);
      peb(cx + Math.cos(a) * 0.08, cz + Math.sin(a) * 0.08, 0.035, '#f3ead6');
    }
    // grey and cream filler pebbles everywhere between the motifs
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      const x = (i + 0.5) / 8 - H + (r() - 0.5) * 0.03, z = (j + 0.5) / 8 - H + (r() - 0.5) * 0.03;
      if (Math.hypot(x, z) < 0.27 || Math.min(...[[-H, -H], [H, -H], [H, H], [-H, H]].map(([cx, cz]) => Math.hypot(x - cx, z - cz))) < 0.27) continue;
      peb(x, z, 0.028, ['#c9c2b2', '#b4ad9d', '#dcd6c8', '#a39d90'][Math.floor(r() * 4)]);
    }
    return b.build();
  },

  path_terracotta: () => {
    const b = bed('#efe2c8');
    // octagon-and-dot: four terracotta octagons, little blue diamonds where their corners meet
    const o: Lay = { grout: 0.02, h: 0.02, bevel: 0.008, colors: ['#d9773f', '#cf6c37', '#e0834a', '#c96633'] };
    const c = 0.1;
    for (const x0 of [-H, 0]) for (const z0 of [-H, 0]) {
      lay(b, [[x0 + c, z0], [x0 + 0.5 - c, z0], [x0 + 0.5, z0 + c], [x0 + 0.5, z0 + 0.5 - c], [x0 + 0.5 - c, z0 + 0.5], [x0 + c, z0 + 0.5], [x0, z0 + 0.5 - c], [x0, z0 + c]], o);
    }
    const dot: Lay = { grout: 0.02, h: 0.022, bevel: 0.006, colors: ['#4f9fc4'] };
    for (const x of [-H, 0, H]) for (const z of [-H, 0, H]) lay(b, [[x, z - c], [x + c, z], [x, z + c], [x - c, z]], dot, 9);
    return b.build();
  },

  path_marble: () => {
    const b = bed('#d6d1c7');
    for (const x0 of [-H, 0]) for (const z0 of [-H, 0]) {
      const light = (x0 === z0);
      lay(b, rect(x0, z0, x0 + 0.5, z0 + 0.5), { grout: 0.012, h: 0.02, bevel: 0.006, colors: light ? ['#fbf8f2'] : ['#d2d5da'] });
    }
    // soft veins
    const vein = (x: number, z: number, len: number, a: number, c: string): void => {
      b.box(len, 0.002, 0.012, c, [x, BED + 0.021, z], [0, a, 0]);
    };
    vein(-0.27, -0.22, 0.26, 0.6, '#e2dfd8');
    vein(-0.2, -0.32, 0.14, -0.3, '#e6e3dd');
    vein(0.24, 0.27, 0.28, -0.5, '#e4e1da');
    vein(0.3, 0.17, 0.12, 0.4, '#e8e5df');
    vein(0.25, -0.25, 0.25, 0.7, '#c2c6cc');
    vein(-0.25, 0.26, 0.24, -0.8, '#c4c8ce');
    return b.build();
  },

  path_blossom: () => {
    const b = bed('#ead8c6');
    pebbles(b, 10, 31, ['#f4e7d8', '#dcc8b4', '#e8d3c4'], [0.02, 0.035]);
    petals(b, 26, 5, ['#ffb7cf', '#ff9fc0', '#ffd2e0', '#fbc4d6', '#ffffff']);
    return b.build();
  },

  path_glazed: () => {
    // glazed pottery tiles: three by three, alternating blue and cream with a golden centre tile
    const b = bed('#e8dcc2');
    const o: Lay = { grout: 0.03, h: 0.03, bevel: 0.012, colors: ['#3f8fd9'] };
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const centre = r === 1 && c === 1;
      const colour = centre ? '#f2c14e' : (r + c) % 2 ? '#f7efdc' : '#3f8fd9';
      lay(b, rect(-H + c / 3, -H + r / 3, -H + (c + 1) / 3, -H + (r + 1) / 3), { ...o, colors: [colour] }, r * 3 + c);
    }
    return b.build();
  },

  path_golden: () => {
    const b = bed('#a97d2a');
    runningBond(b, 0.25, 0.125, { grout: 0.016, h: 0.022, bevel: 0.01, colors: ['#ffd24a', '#f5c23a', '#ffdd6a', '#ecb52f', '#ffe48a'] });
    return b.build();
  },
};

/** Path models with no pattern crossing the tile edge: these are turned per tile (by position) for variety. */
export const PATH_SPIN = new Set(['path_gravel', 'path_stepping', 'path_mossy', 'path_mosaic', 'path_blossom']);
