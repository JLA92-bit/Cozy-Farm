import * as THREE from 'three';
import { geo, PAL } from '../Procedural';

/**
 * 1.47 Colour and Lanterns: the Dye Works (a timber shed with three dye vats and cloth drying on a line) and four
 * decor sets built in code: Lantern Walk, Cottage Garden, Lighthouse Point and Village Fete. Paintable parts use the
 * exact marker colours named in buildings.json (`paint: "=#..."`), so keep those hex values as they are.
 */
const TIMBER = '#7a4a2a', WHITE = '#f6f1e6', LANTERN = '#ffcf6a', IRON = '#3b3b42', ROPE = '#c9a66b';
/** paint markers (buildings.json `paint`) */
export const COLOUR_PAINT = { bunting: '#d6334b', awning: '#e2537b', barrow: '#4f9fd9', post: '#2f6f4f' };

const stringOfLanterns = (b: ReturnType<typeof geo>, x0: number, x1: number, y: number, z: number, n: number, sag = 0.12) => {
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n, x = x0 + (x1 - x0) * f, yy = y - Math.sin(f * Math.PI) * sag;
    b.cyl(0.006, 0.006, 0.08, IRON, [x, yy - 0.02, z], 4);
    b.sphere(0.065, i % 3 === 0 ? '#ff8a5a' : i % 3 === 1 ? LANTERN : '#ff6a8a', [x, yy - 0.09, z], 1, [1, 1.2, 1]);
  }
  b.box(x1 - x0, 0.012, 0.012, IRON, [(x0 + x1) / 2, y - sag * 0.6, z]);
};

export const COLOUR_PROC: Record<string, () => THREE.BufferGeometry> = {
  dye_works: () => {
    const b = geo();
    b.block(1.95, 0.07, 1.95, '#d4c3a0', [0, 0, 0]);
    // the shed, open at the front
    b.block(1.3, 1.05, 0.95, '#c9b28a', [-0.25, 0.07, -0.45]);
    for (let i = 0; i < 5; i++) b.block(0.04, 1.05, 0.97, TIMBER, [-0.86 + i * 0.3, 0.07, -0.45]);
    b.prism(1.5, 0.5, 1.15, '#5a6a8a', [-0.25, 1.12, -0.45]);
    b.block(0.4, 0.7, 0.05, TIMBER, [-0.35, 0.07, 0.04]);
    // three dye vats: blue, red, gold
    for (const [x, c] of [[-0.6, '#3b4f9e'], [-0.05, '#b8423a'], [0.5, '#f0a020']] as [number, string][]) {
      b.cyl(0.24, 0.21, 0.36, '#8a5a33', [x, 0.07, 0.45], 12);
      for (const y of [0.15, 0.36]) b.cyl(0.245, 0.245, 0.025, IRON, [x, y, 0.45], 12);
      b.cyl(0.21, 0.21, 0.02, c, [x, 0.42, 0.45], 12);
    }
    b.cyl(0.015, 0.015, 0.55, TIMBER, [0.0, 0.42, 0.5], 4, [0.5, 0, 0.3]);
    // cloth drying on a line
    for (const x of [0.4, 0.9]) b.block(0.05, 1.2, 0.05, TIMBER, [x, 0.07, -0.2]);
    b.box(0.5, 0.015, 0.015, IRON, [0.65, 1.22, -0.2]);
    for (const [x, c] of [[0.5, '#3b4f9e'], [0.65, '#b8423a'], [0.8, '#f0a020']] as [number, string][]) b.box(0.13, 0.42, 0.015, c, [x, 1.0, -0.2]);
    return b.build();
  },

  // ---- Lantern Walk
  lantern_string: () => {
    const b = geo();
    for (const x of [-0.42, 0.42]) { b.block(0.05, 1.05, 0.05, TIMBER, [x, 0, 0]); b.cyl(0.07, 0.08, 0.04, '#5a5a5a', [x, 0, 0], 8); }
    stringOfLanterns(b, -0.42, 0.42, 1.0, 0, 5);
    return b.build();
  },
  lantern_arch: () => {
    const b = geo();
    for (const x of [-0.8, 0.8]) { b.block(0.1, 1.3, 0.1, TIMBER, [x, 0, 0]); b.block(0.18, 0.08, 0.18, PAL.stone, [x, 0, 0]); }
    for (let i = 0; i <= 8; i++) { const a = Math.PI * (i / 8); b.box(0.12, 0.07, 0.12, TIMBER, [-Math.cos(a) * 0.8, 1.3 + Math.sin(a) * 0.35, 0]); }
    for (let i = 1; i < 8; i += 2) { const a = Math.PI * (i / 8); const x = -Math.cos(a) * 0.8, y = 1.3 + Math.sin(a) * 0.35; b.cyl(0.006, 0.006, 0.1, IRON, [x, y - 0.1, 0], 4); b.sphere(0.07, i % 4 === 1 ? LANTERN : '#ff8a5a', [x, y - 0.2, 0], 1, [1, 1.25, 1]); }
    return b.build();
  },
  lantern_post: () => {
    const b = geo();
    b.cyl(0.12, 0.15, 0.1, PAL.stone, [0, 0, 0], 8);
    b.cyl(0.035, 0.045, 1.25, COLOUR_PAINT.post, [0, 0.1, 0], 8);
    b.box(0.32, 0.03, 0.03, COLOUR_PAINT.post, [0.12, 1.25, 0]);
    b.block(0.16, 0.2, 0.16, LANTERN, [0.24, 0.95, 0]);
    b.prism(0.2, 0.08, 0.2, COLOUR_PAINT.post, [0.24, 1.15, 0]);
    for (const [dx, dz] of [[-0.08, -0.08], [0.08, -0.08], [-0.08, 0.08], [0.08, 0.08]]) b.block(0.02, 0.2, 0.02, COLOUR_PAINT.post, [0.24 + dx, 0.95, dz]);
    b.cyl(0.006, 0.006, 0.1, IRON, [0.24, 1.17, 0], 4);
    return b.build();
  },
  lantern_tree: () => {
    const b = geo();
    b.cyl(0.08, 0.14, 0.9, '#6a4a2e', [0, 0, 0], 7);
    for (const [x, y, z, s] of [[0, 1.1, 0, 0.5], [-0.3, 0.95, 0.15, 0.32], [0.32, 0.98, -0.1, 0.34], [0.05, 1.42, -0.05, 0.32]] as [number, number, number, number][]) b.sphere(s, '#4f8a3a', [x, y, z], 1, [1, 0.85, 1]);
    for (const [x, y, z, c] of [[-0.5, 0.6, 0.25, LANTERN], [0.55, 0.62, -0.1, '#ff8a5a'], [0.12, 0.55, 0.55, '#ff6a8a'], [-0.18, 0.62, -0.52, LANTERN], [0.42, 0.6, 0.42, '#ff8a5a']] as [number, number, number, string][]) {
      b.cyl(0.005, 0.005, 0.12, IRON, [x, y + 0.08, z], 4);
      b.sphere(0.07, c, [x, y, z], 1, [1, 1.2, 1]);
    }
    return b.build();
  },

  // ---- Cottage Garden
  rose_arbour: () => {
    const b = geo();
    for (const x of [-0.75, 0.75]) for (const z of [-0.25, 0.25]) b.block(0.07, 1.25, 0.07, WHITE, [x, 0, z]);
    for (let i = 0; i <= 8; i++) { const a = Math.PI * (i / 8); for (const z of [-0.25, 0.25]) b.box(0.08, 0.06, 0.08, WHITE, [-Math.cos(a) * 0.75, 1.25 + Math.sin(a) * 0.3, z]); }
    for (let i = 0; i < 4; i++) b.box(0.05, 0.05, 0.55, WHITE, [-0.6 + i * 0.4, 1.25 + Math.sin(Math.PI * ((i * 0.4 + 0.15) / 1.5)) * 0.3, 0]);
    for (let i = 0; i < 14; i++) {
      const a = Math.PI * (i / 13), side = i % 2 ? 0.27 : -0.27;
      b.sphere(0.12, '#4f8a3a', [-Math.cos(a) * 0.75, 1.25 + Math.sin(a) * 0.3, side], 0);
      if (i % 2 === 0) b.sphere(0.06, i % 4 ? '#ff8fb4' : '#d6334a', [-Math.cos(a) * 0.75, 1.32 + Math.sin(a) * 0.3, side + 0.06], 0);
    }
    for (const x of [-0.75, 0.75]) for (let k = 0; k < 3; k++) { b.sphere(0.1, '#4f8a3a', [x, 0.3 + k * 0.35, 0.27], 0); b.sphere(0.05, '#ff8fb4', [x + 0.05, 0.36 + k * 0.35, 0.33], 0); }
    return b.build();
  },
  bee_skep: () => {
    const b = geo();
    b.block(0.6, 0.05, 0.6, TIMBER, [0, 0.42, 0]);
    for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) b.block(0.05, 0.42, 0.05, TIMBER, [x, 0, z]);
    for (let i = 0; i < 5; i++) { const r = 0.24 - i * 0.04; b.cyl(r - 0.02, r, 0.09, '#d9b25a', [0, 0.47 + i * 0.085, 0], 12); }
    b.sphere(0.04, '#c9a04a', [0, 0.92, 0], 0);
    b.block(0.08, 0.06, 0.02, '#3b2618', [0, 0.47, 0.235]);
    for (const [x, y, z] of [[0.3, 0.8, 0.2], [-0.25, 0.95, 0.1], [0.1, 1.05, -0.25]] as [number, number, number][]) { b.sphere(0.025, '#f2c23a', [x, y, z], 0, [1.3, 1, 1]); b.sphere(0.018, '#ffffff', [x, y + 0.02, z], 0); }
    for (const x of [-0.35, 0.35]) b.sphere(0.1, '#a98be3', [x, 0.08, 0.35], 0);
    return b.build();
  },
  herb_spiral: () => {
    const b = geo();
    for (let i = 0; i < 22; i++) {
      const a = i * 0.5, r = 0.75 - i * 0.03, h = 0.08 + i * 0.022;
      b.block(0.16, h, 0.16, i % 2 ? PAL.stone : '#b9b0a0', [Math.cos(a) * r, 0, Math.sin(a) * r]);
      if (i % 2 === 0) b.sphere(0.09, ['#5fae3a', '#8fd06a', '#7a9a4a', '#a98be3'][i % 4], [Math.cos(a) * (r - 0.12), h + 0.04, Math.sin(a) * (r - 0.12)], 0);
    }
    b.sphere(0.14, '#5fae3a', [0, 0.6, 0], 0);
    return b.build();
  },
  flower_barrow: () => {
    const b = geo();
    b.box(0.7, 0.25, 0.5, COLOUR_PAINT.barrow, [0, 0.35, 0], [0, 0, 0.12]);
    b.cyl(0.14, 0.14, 0.06, '#3b3b42', [0.38, 0.14, 0], 12, [Math.PI / 2, 0, 0]);
    for (const z of [-0.18, 0.18]) { b.box(0.55, 0.04, 0.04, TIMBER, [-0.48, 0.3, z], [0, 0, 0.35]); b.block(0.04, 0.24, 0.04, TIMBER, [-0.25, 0, z]); }
    const blooms = ['#d6334a', '#ffd23a', '#a98be6', '#ff8fb4', '#ffffff', '#ff8a3a'];
    for (let i = 0; i < 12; i++) { const x = -0.25 + (i % 4) * 0.16, z = -0.15 + Math.floor(i / 4) * 0.15; b.sphere(0.06, '#4f8a3a', [x, 0.5, z], 0); b.sphere(0.055, blooms[i % blooms.length], [x + 0.02, 0.57, z + 0.02], 0); }
    return b.build();
  },

  // ---- Lighthouse Point
  ship_anchor: () => {
    const b = geo();
    b.block(0.8, 0.06, 0.5, '#e8d9b0', [0, 0, 0]);
    b.cyl(0.04, 0.04, 0.9, IRON, [0, 0.06, 0], 8);
    b.cyl(0.09, 0.09, 0.03, IRON, [0, 1.0, 0], 10, [Math.PI / 2, 0, 0]);
    b.box(0.5, 0.05, 0.05, IRON, [0, 0.82, 0]);
    for (let i = 0; i <= 6; i++) { const a = Math.PI * (i / 6); b.box(0.07, 0.07, 0.07, IRON, [-Math.cos(a) * 0.32, 0.2 - Math.sin(a) * 0.13, 0]); }
    for (const x of [-0.34, 0.34]) b.cone(0.07, 0.14, IRON, [x, 0.24, 0], 4);
    for (let i = 0; i < 6; i++) b.cyl(0.13 - i * 0.012, 0.13 - i * 0.012, 0.03, ROPE, [0.25, 0.06 + i * 0.03, 0.12], 12);
    return b.build();
  },
  buoy_stack: () => {
    const b = geo();
    b.block(0.8, 0.05, 0.6, TIMBER, [0, 0, 0]);
    for (const [x, z, c] of [[-0.2, -0.08, '#e2402a'], [0.2, -0.05, WHITE], [0.0, 0.18, '#e2402a']] as [number, number, string][]) {
      b.sphere(0.16, c, [x, 0.21, z], 1);
      b.cyl(0.165, 0.165, 0.06, c === WHITE ? '#e2402a' : WHITE, [x, 0.19, z], 12);
    }
    b.sphere(0.15, '#f2c23a', [0, 0.47, 0], 1);
    b.cyl(0.02, 0.02, 0.12, IRON, [0, 0.6, 0], 6);
    for (let i = 0; i < 5; i++) b.cyl(0.12 - i * 0.01, 0.12 - i * 0.01, 0.03, ROPE, [0.28, 0.05 + i * 0.03, 0.2], 12);
    return b.build();
  },
  mini_lighthouse: () => {
    const b = geo();
    b.cyl(0.42, 0.48, 0.12, PAL.stone, [0, 0, 0], 12);
    for (let i = 0; i < 6; i++) b.cyl(0.3 - i * 0.025, 0.32 - i * 0.025, 0.28, i % 2 ? '#e2402a' : WHITE, [0, 0.12 + i * 0.28, 0], 14);
    b.cyl(0.22, 0.22, 0.04, IRON, [0, 1.8, 0], 14);
    b.cyl(0.13, 0.13, 0.24, LANTERN, [0, 1.84, 0], 10);
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; b.block(0.015, 0.24, 0.015, IRON, [Math.cos(a) * 0.14, 1.84, Math.sin(a) * 0.14]); }
    b.cone(0.18, 0.2, '#e2402a', [0, 2.08, 0], 10);
    b.block(0.14, 0.24, 0.03, '#3b4f9e', [0, 0.12, 0.31]);
    for (const y of [0.7, 1.25]) b.block(0.08, 0.1, 0.03, '#5aaee0', [0, y, 0.24]);
    return b.build();
  },
  harbour_bollards: () => {
    const b = geo();
    b.block(1.8, 0.07, 0.6, '#9a8a6a', [0, 0, 0]);
    for (let i = 0; i < 8; i++) b.box(0.21, 0.02, 0.6, i % 2 ? '#8a7a5a' : '#a89870', [-0.79 + i * 0.225, 0.075, 0]);
    for (const x of [-0.55, 0.55]) {
      b.cyl(0.11, 0.13, 0.3, IRON, [x, 0.07, 0], 10);
      b.cyl(0.15, 0.13, 0.06, IRON, [x, 0.37, 0], 10);
    }
    b.box(1.1, 0.04, 0.04, ROPE, [0, 0.3, 0.03]);
    for (let i = 0; i < 5; i++) b.cyl(0.16 - i * 0.012, 0.16 - i * 0.012, 0.035, ROPE, [0, 0.08 + i * 0.035, 0.12], 12);
    return b.build();
  },

  // ---- Village Fete
  fete_bunting: () => {
    const b = geo();
    for (const x of [-0.85, 0.85]) { b.block(0.06, 1.4, 0.06, WHITE, [x, 0, 0]); b.sphere(0.05, '#f2c23a', [x, 1.43, 0], 0); }
    for (let i = 0; i < 9; i++) {
      const f = (i + 0.5) / 9, x = -0.85 + 1.7 * f, y = 1.3 - Math.sin(f * Math.PI) * 0.15;
      b.cone(0.07, 0.18, i % 2 ? COLOUR_PAINT.bunting : i % 3 ? '#f2c23a' : '#4f9fd9', [x, y - 0.1, 0], 3, [Math.PI, 0, 0]);
    }
    b.box(1.7, 0.012, 0.012, IRON, [0, 1.25, 0]);
    return b.build();
  },
  coconut_shy: () => {
    const b = geo();
    b.block(1.6, 0.06, 0.8, '#d9c7a3', [0, 0, 0]);
    for (const x of [-0.75, 0.75]) b.block(0.06, 1.2, 0.06, '#c9a04a', [x, 0.06, -0.3]);
    for (let i = 0; i < 7; i++) b.box(0.22, 0.05, 0.4, i % 2 ? WHITE : '#3b8ac9', [-0.66 + i * 0.22, 1.3, -0.15], [0.3, 0, 0]);
    b.block(1.4, 0.04, 0.2, '#c9a04a', [0, 0.65, -0.3]);
    for (let i = 0; i < 4; i++) {
      const x = -0.5 + i * 0.33;
      b.cyl(0.02, 0.02, 0.18, '#7a4a2a', [x, 0.69, -0.3], 4);
      b.sphere(0.08, '#6a4a2e', [x, 0.93, -0.3], 1);
    }
    b.block(0.5, 0.3, 0.3, '#a8583f', [0.4, 0.06, 0.2]);
    for (let i = 0; i < 3; i++) b.sphere(0.06, '#6a4a2e', [0.3 + i * 0.1, 0.42, 0.2], 1);
    return b.build();
  },
  cake_stall: () => {
    const b = geo();
    b.block(1.0, 0.55, 0.5, WHITE, [0, 0, 0]);
    b.block(1.05, 0.04, 0.55, '#f4a3c4', [0, 0.55, 0]);
    for (const x of [-0.48, 0.48]) b.block(0.05, 0.75, 0.05, '#c9a04a', [x, 0.55, -0.22]);
    for (let i = 0; i < 6; i++) b.box(0.18, 0.04, 0.45, i % 2 ? WHITE : COLOUR_PAINT.awning, [-0.45 + i * 0.18, 1.35, 0.02], [0.3, 0, 0]);
    b.cyl(0.16, 0.16, 0.18, '#fff0d8', [-0.28, 0.59, 0], 14);
    b.cyl(0.165, 0.165, 0.04, '#f4a3c4', [-0.28, 0.77, 0], 14);
    b.sphere(0.03, '#d6334a', [-0.28, 0.82, 0], 0);
    b.cyl(0.11, 0.11, 0.14, '#7a4a2a', [0.05, 0.59, 0.05], 12);
    b.cyl(0.115, 0.115, 0.03, WHITE, [0.05, 0.73, 0.05], 12);
    for (let i = 0; i < 3; i++) { b.cyl(0.045, 0.035, 0.06, '#e8d9b0', [0.28 + (i % 2) * 0.1, 0.59, -0.08 + i * 0.09], 8); b.sphere(0.045, ['#ff8fb4', '#ffffff', '#a98be3'][i], [0.28 + (i % 2) * 0.1, 0.67, -0.08 + i * 0.09], 0); }
    return b.build();
  },
  maypole: () => {
    const b = geo();
    b.cyl(0.4, 0.45, 0.06, '#5fae3a', [0, 0, 0], 16);
    b.cyl(0.04, 0.055, 2.2, WHITE, [0, 0.06, 0], 8);
    b.sphere(0.08, '#f2c23a', [0, 2.3, 0], 1);
    b.cyl(0.14, 0.14, 0.05, '#5fae3a', [0, 2.12, 0], 12);
    const cols = ['#d6334a', '#f2c23a', '#4f9fd9', '#ff8fb4', '#86c06a', '#a98be3'];
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3, ex = Math.cos(a) * 0.62, ez = Math.sin(a) * 0.62;
      const dx = ex, dz = ez, dy = 0.4 - 2.1, len = Math.hypot(dx, dy, dz);
      const mid: [number, number, number] = [ex / 2, (2.1 + 0.4) / 2, ez / 2];
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
      const e = new THREE.Euler().setFromQuaternion(q);
      b.cyl(0.012, 0.012, len, cols[i], mid, 4, [e.x, e.y, e.z]);
      b.block(0.04, 0.4, 0.04, '#c9a04a', [ex, 0, ez]);
    }
    return b.build();
  },
};
