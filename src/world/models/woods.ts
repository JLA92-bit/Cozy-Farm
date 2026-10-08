import * as THREE from 'three';
import { PAL, geo } from '../Procedural';
import type { ForageKind } from '../../data';

/** 1.9 Wild Woods pieces: forage plants, dig mounds and the pond. Static geometry in the game's chunky style. */

const GREEN = '#5fae3f', GREEN_D = '#3f8a33', STEM = '#6f9f3f';

/** What colour each wild plant shows. */
export const FORAGE_COLOR: Record<string, string> = {
  wild_leek: '#8fd95f', dandelion: '#ffd93a', daffodil: '#ffe36a', raspberry: '#d63a5c', wild_rose: '#ff7fa8', fern_frond: '#4fae3a',
  chanterelle: '#f2a93a', hazelnut: '#a8743a', blackberry: '#4a3a7c', winter_root: '#c9a06a', holly: '#2f7a3a', snow_yam: '#d9c7b0',
};

/** A wild plant (a small patch about 0.7 wide) of the given shape and colour. */
export function forageGeometry(kind: ForageKind, color: string, id = ''): THREE.BufferGeometry {
  const b = geo();
  if (kind === 'leaf') {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.cone(0.09, 0.42 + (i % 2) * 0.12, id === 'holly' ? '#2f7a3a' : color, [Math.cos(a) * 0.14, 0, Math.sin(a) * 0.14], 4, [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35]);
    }
    if (id === 'holly') for (let i = 0; i < 4; i++) b.sphere(0.045, '#d9343c', [Math.cos(i * 1.6) * 0.1, 0.34, Math.sin(i * 1.6) * 0.1], 0);
  } else if (kind === 'flower') {
    for (const [x, z, h] of [[-0.16, 0.02, 0.4], [0.12, -0.1, 0.5], [0.08, 0.16, 0.34]] as const) {
      b.cyl(0.015, 0.02, h, STEM, [x, 0, z], 4);
      for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; b.sphere(0.06, color, [x + Math.cos(a) * 0.07, h, z + Math.sin(a) * 0.07], 0); }
      b.sphere(0.045, '#fff2a8', [x, h + 0.01, z], 0);
    }
    b.cone(0.08, 0.2, GREEN, [-0.05, 0, 0.0], 4);
  } else if (kind === 'berry') {
    b.sphere(0.26, GREEN_D, [0, 0.2, 0], 1, [1.1, 0.8, 1]);
    b.sphere(0.2, GREEN, [0.16, 0.26, 0.08], 1);
    for (let i = 0; i < 9; i++) { const a = i * 2.3; b.sphere(0.05, color, [Math.cos(a) * 0.28, 0.16 + (i % 3) * 0.1, Math.sin(a) * 0.24], 0); }
  } else if (kind === 'mushroom') {
    for (const [x, z, s] of [[-0.14, 0.02, 1], [0.12, -0.08, 0.8], [0.06, 0.16, 0.6]] as const) {
      b.cyl(0.05 * s, 0.07 * s, 0.22 * s, '#f1e6c8', [x, 0, z], 6);
      b.sphere(0.16 * s, color, [x, 0.22 * s, z], 1, [1, 0.55, 1]);
    }
  } else if (kind === 'nut') {
    b.block(0.4, 0.03, 0.12, '#7a5a34', [0, 0, -0.05], [0, 0.4, 0]);
    for (let i = 0; i < 5; i++) { const a = i * 1.3; b.sphere(0.06, color, [Math.cos(a) * 0.18, 0.05, Math.sin(a) * 0.16], 0); b.cone(0.045, 0.04, '#7a5a34', [Math.cos(a) * 0.18, 0.09, Math.sin(a) * 0.16], 5); }
    b.cone(0.11, 0.1, GREEN_D, [-0.22, 0, 0.12], 5, [0, 0, 0.5]);
  } else {
    // a half-buried root with a tuft of leaves
    b.cone(0.1, 0.34, color, [0, 0.16, 0], 6, [Math.PI, 0, 0]);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; b.cone(0.05, 0.28, GREEN, [Math.cos(a) * 0.06, 0.2, Math.sin(a) * 0.06], 4, [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]); }
  }
  return b.build();
}

/** A heap of fresh earth with a pebble, the sign of something buried. */
export function moundGeometry(): THREE.BufferGeometry {
  return geo()
    .sphere(0.5, '#8a6a46', [0, 0, 0], 1, [1.1, 0.45, 1])
    .sphere(0.22, '#a78358', [0.12, 0.14, -0.05], 1, [1, 0.5, 1])
    .sphere(0.07, PAL.stone, [-0.28, 0.12, 0.2], 0)
    .sphere(0.05, PAL.stoneDark, [0.32, 0.08, 0.2], 0)
    .build();
}

/** Earth already dug: a flat dark patch. */
export function dugGeometry(): THREE.BufferGeometry {
  return geo().cyl(0.46, 0.5, 0.03, '#6f5636', [0, 0, 0], 10).sphere(0.12, '#7d6140', [0.14, 0.02, 0.1], 0, [1, 0.3, 1]).build();
}

/** The quiet pond: dark rim stones, water, lily pads and reeds. */
export function pondGeometry(r: number): THREE.BufferGeometry {
  const b = geo();
  b.cyl(r + 0.35, r + 0.45, 0.1, '#a99a76', [0, 0, 0], 28);
  b.cyl(r, r, 0.14, '#5fb7dd', [0, 0.02, 0], 28);
  b.cyl(r * 0.62, r * 0.62, 0.15, '#7cc8e8', [0, 0.02, 0], 24);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; b.sphere(0.16 + (i % 3) * 0.05, i % 2 ? PAL.stone : PAL.stoneDark, [Math.cos(a) * (r + 0.4), 0.08, Math.sin(a) * (r + 0.4)], 0, [1, 0.6, 1]); }
  for (const [x, z] of [[-1.2, 0.8], [0.9, -1.1], [1.4, 0.9]] as const) { b.cyl(0.32, 0.32, 0.02, '#4fae3a', [x, 0.16, z], 8); b.sphere(0.07, '#ffb7d5', [x + 0.05, 0.2, z], 0); }
  for (let i = 0; i < 7; i++) { const a = 2.6 + i * 0.2; b.cyl(0.02, 0.025, 0.9 + (i % 3) * 0.2, '#7aa83a', [Math.cos(a) * (r + 0.1), 0, Math.sin(a) * (r + 0.1)], 4); b.cyl(0.04, 0.04, 0.22, '#7a4a2a', [Math.cos(a) * (r + 0.1), 0.78 + (i % 3) * 0.2, Math.sin(a) * (r + 0.1)], 5); }
  return b.build();
}
