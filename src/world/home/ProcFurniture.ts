import * as THREE from 'three';

/**
 * 1.29 furniture built in code (furniture.json models "proc:<name>"): windows, curtains, a fireplace, a wall clock,
 * picture frames, plaques, a bookshelf of coloured books, candles and a vase. Each is a list of parts (name, default
 * colour, geometry) so the player can recolour every part, like the Kenney pieces. Sizes in metres; the front faces
 * +z and the base is at y 0 (wall pieces: the back is at z 0).
 */

export interface ProcPart { part: string; colour: string; geo: THREE.BufferGeometry }

const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z + d / 2);
const cyl = (r: number, h: number, x = 0, y = 0, z = 0, seg = 16, r2 = r): THREE.BufferGeometry => new THREE.CylinderGeometry(r2, r, h, seg).translate(x, y + h / 2, z);
/** a disc facing +z */
const disc = (r: number, d: number, x = 0, y = 0, z = 0, seg = 24): THREE.BufferGeometry => new THREE.CylinderGeometry(r, r, d, seg).rotateX(Math.PI / 2).translate(x, y, z + d / 2);

function frame(w: number, h: number, t: number, d: number, y0: number, z = 0): THREE.BufferGeometry[] {
  return [box(w, t, d, 0, y0, z), box(w, t, d, 0, y0 + h - t, z), box(t, h - 2 * t, d, -w / 2 + t / 2, y0 + t, z), box(t, h - 2 * t, d, w / 2 - t / 2, y0 + t, z)];
}

function windowParts(w: number, h: number, mullions: [number, number]): ProcPart[] {
  const parts: ProcPart[] = [];
  const t = 0.05;
  parts.push({ part: 'glass', colour: '#bfe3f2', geo: box(w - 2 * t, h - 2 * t, 0.01, 0, t, 0.02) });
  for (const g of frame(w, h, t, 0.06, 0)) parts.push({ part: 'frame', colour: '#f7f1e3', geo: g });
  // glazing bars
  for (let i = 1; i < mullions[0]; i++) parts.push({ part: 'frame', colour: '#f7f1e3', geo: box(0.02, h - 2 * t, 0.04, -w / 2 + (w * i) / mullions[0], t, 0.01) });
  for (let i = 1; i < mullions[1]; i++) parts.push({ part: 'frame', colour: '#f7f1e3', geo: box(w - 2 * t, 0.02, 0.04, 0, (h * i) / mullions[1] - 0.01, 0.01) });
  parts.push({ part: 'sill', colour: '#f7f1e3', geo: box(w + 0.1, 0.035, 0.12, 0, -0.035, 0) });
  return parts;
}

const BUILDERS: Record<string, () => ProcPart[]> = {
  window: () => windowParts(0.7, 0.6, [2, 2]),
  window_tall: () => windowParts(0.5, 0.95, [2, 3]),
  window_wide: () => windowParts(1.2, 0.65, [3, 2]),
  window_round: () => {
    const parts: ProcPart[] = [{ part: 'glass', colour: '#bfe3f2', geo: disc(0.24, 0.01, 0, 0.3, 0.02, 28) }];
    const ring = new THREE.TorusGeometry(0.26, 0.04, 8, 28).translate(0, 0.3, 0.04);
    parts.push({ part: 'frame', colour: '#8a5a33', geo: ring });
    parts.push({ part: 'frame', colour: '#8a5a33', geo: box(0.48, 0.02, 0.03, 0, 0.29, 0.015) }, { part: 'frame', colour: '#8a5a33', geo: box(0.02, 0.48, 0.03, 0, 0.06, 0.015) });
    return parts;
  },
  curtains: () => {
    const parts: ProcPart[] = [{ part: 'rod', colour: '#5a3a22', geo: new THREE.CylinderGeometry(0.015, 0.015, 1.05, 8).rotateZ(Math.PI / 2).translate(0, 1.0, 0.07) }];
    for (const s of [-1, 1]) {
      // a drape in soft folds
      for (let k = 0; k < 4; k++) parts.push({ part: 'fabric', colour: '#d98fa0', geo: cyl(0.035, 0.98, s * (0.47 - k * 0.055), 0, 0.07, 8) });
      parts.push({ part: 'tie', colour: '#f3d98a', geo: box(0.24, 0.03, 0.09, s * 0.39, 0.42, 0.03) });
    }
    return parts;
  },
  curtains_short: () => {
    const parts: ProcPart[] = [{ part: 'rod', colour: '#f7f1e3', geo: new THREE.CylinderGeometry(0.012, 0.012, 0.8, 8).rotateZ(Math.PI / 2).translate(0, 0.32, 0.05) }];
    for (let k = 0; k < 10; k++) parts.push({ part: 'fabric', colour: '#f6e6ea', geo: cyl(0.04, 0.3, -0.36 + k * 0.08, 0.02, 0.05, 6) });
    return parts;
  },
  fireplace: () => [
    { part: 'stone', colour: '#b9b2a6', geo: box(1.1, 0.9, 0.3, 0, 0, 0) },
    { part: 'firebox', colour: '#2e2622', geo: box(0.55, 0.45, 0.04, 0, 0.08, 0.28) },
    { part: 'mantel', colour: '#7a4f2a', geo: box(1.25, 0.07, 0.38, 0, 0.9, -0.02) },
    { part: 'lamp', colour: '#ff9a3c', geo: box(0.36, 0.14, 0.12, 0, 0.1, 0.2) },
    { part: 'logs', colour: '#6e4426', geo: box(0.42, 0.06, 0.1, 0, 0.08, 0.2) },
    { part: 'stone', colour: '#b9b2a6', geo: box(1.2, 0.05, 0.5, 0, 0, 0.02) },
  ],
  clock: () => [
    { part: 'case', colour: '#7a4f2a', geo: disc(0.2, 0.05, 0, 0.2, 0) },
    { part: 'face', colour: '#fff6df', geo: disc(0.165, 0.01, 0, 0.2, 0.05) },
    { part: 'hands', colour: '#2d1e10', geo: disc(0.015, 0.012, 0, 0.2, 0.06, 10) },
  ],
  frame_wall: () => [
    ...frame(0.46, 0.38, 0.04, 0.035, 0).map((g) => ({ part: 'frame', colour: '#c99a2e', geo: g })),
    { part: 'mount', colour: '#fff6df', geo: box(0.4, 0.32, 0.015, 0, 0.03, 0) },
  ],
  frame_big: () => [
    ...frame(0.8, 0.62, 0.05, 0.04, 0).map((g) => ({ part: 'frame', colour: '#7a4f2a', geo: g })),
    { part: 'mount', colour: '#fff6df', geo: box(0.72, 0.54, 0.015, 0, 0.04, 0) },
  ],
  frame_stand: () => [
    ...frame(0.22, 0.27, 0.025, 0.025, 0, 0).map((g) => ({ part: 'frame', colour: '#c99a2e', geo: g.clone().rotateX(-0.2) })),
    { part: 'mount', colour: '#fff6df', geo: box(0.18, 0.23, 0.01, 0, 0.02, -0.005).rotateX(-0.2) },
    { part: 'frame', colour: '#c99a2e', geo: box(0.03, 0.22, 0.02, 0, 0, -0.08).rotateX(0.35) },
  ],
  plaque: () => [
    { part: 'board', colour: '#7a4f2a', geo: box(0.6, 0.3, 0.035, 0, 0, 0) },
    { part: 'trim', colour: '#c99a2e', geo: box(0.64, 0.025, 0.04, 0, -0.02, 0) },
  ],
  bookshelf: () => {
    const parts: ProcPart[] = [];
    const W = 0.8, H = 0.95, D = 0.28;
    parts.push({ part: 'wood', colour: '#9a6a3d', geo: box(W, 0.03, D, 0, 0, 0) }, { part: 'wood', colour: '#9a6a3d', geo: box(W, 0.03, D, 0, H - 0.03, 0) },
      { part: 'wood', colour: '#9a6a3d', geo: box(0.03, H, D, -W / 2 + 0.015, 0, 0) }, { part: 'wood', colour: '#9a6a3d', geo: box(0.03, H, D, W / 2 - 0.015, 0, 0) },
      { part: 'wood', colour: '#7a4f2a', geo: box(W, H, 0.02, 0, 0, 0) });
    const rnd = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    for (let shelf = 0; shelf < 3; shelf++) {
      const y = 0.03 + shelf * 0.3;
      if (shelf) parts.push({ part: 'wood', colour: '#9a6a3d', geo: box(W - 0.06, 0.025, D - 0.02, 0, y - 0.025, 0.02) });
      let x = -W / 2 + 0.05;
      let k = 0;
      while (x < W / 2 - 0.08) {
        const bw = 0.035 + rnd() * 0.03, bh = 0.17 + rnd() * 0.08;
        parts.push({ part: `books${(k++ % 3) + 1}`, colour: ['#a8322b', '#3b6aa8', '#5f9a43'][(k + shelf) % 3], geo: box(bw, bh, 0.18, x + bw / 2, y, 0.05) });
        x += bw + 0.005;
      }
    }
    return parts;
  },
  candles: () => [
    { part: 'holder', colour: '#c99a2e', geo: cyl(0.08, 0.02, 0, 0, 0, 16) },
    { part: 'wax', colour: '#fff6df', geo: cyl(0.025, 0.16, -0.035, 0.02, 0, 10) },
    { part: 'wax', colour: '#fff6df', geo: cyl(0.025, 0.11, 0.035, 0.02, 0.01, 10) },
    { part: 'lamp', colour: '#ffcf5a', geo: cyl(0.012, 0.035, -0.035, 0.18, 0, 6) },
    { part: 'lamp', colour: '#ffcf5a', geo: cyl(0.012, 0.035, 0.035, 0.13, 0.01, 6) },
  ],
  vase: () => {
    const parts: ProcPart[] = [{ part: 'vase', colour: '#3b8c86', geo: cyl(0.06, 0.2, 0, 0, 0, 14, 0.04) }];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      parts.push({ part: 'stems', colour: '#5f9a43', geo: cyl(0.006, 0.18, Math.cos(a) * 0.02, 0.18, Math.sin(a) * 0.02, 5) });
      parts.push({ part: 'flowers', colour: '#f6c1c7', geo: new THREE.SphereGeometry(0.035, 8, 6).translate(Math.cos(a) * 0.05, 0.38, Math.sin(a) * 0.05) });
    }
    return parts;
  },
};

export const hasProc = (name: string): boolean => !!BUILDERS[name];
export function buildProc(name: string): ProcPart[] { return (BUILDERS[name] ?? BUILDERS.vase)(); }
