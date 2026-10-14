import * as THREE from 'three';
import { PAL, geo } from '../Procedural';
import type { ForageKind } from '../../data';

/** 1.9 Wild Woods pieces: forage plants, dig mounds and the pond. Static geometry in the game's chunky style. */

const GREEN = '#5fae3f', GREEN_D = '#3f8a33', STEM = '#6f9f3f';

/** What colour each wild plant shows. */
export const FORAGE_COLOR: Record<string, string> = {
  wild_leek: '#8fd95f', dandelion: '#ffd93a', daffodil: '#ffe36a', raspberry: '#d63a5c', wild_rose: '#ff7fa8', fern_frond: '#4fae3a',
  chanterelle: '#f2a93a', hazelnut: '#a8743a', blackberry: '#4a3a7c', winter_root: '#c9a06a', holly: '#2f7a3a', snow_yam: '#d9c7b0',
  // 1.19 the Deep Woods
  moss: '#5f9a3a', bluebell: '#6f86e8', puffball: '#f2eee2', wild_garlic: '#7fcf6a', elderberry: '#3a2a52', morel: '#b08a5a',
  watercress: '#6fd06a', river_mint: '#8fe0b0', cattail: '#8a5a34', water_lily: '#ffc2dc', wild_strawberry: '#e8424f',
  pinecone: '#8a6238', chestnut: '#9a5a2a', lingonberry: '#d8303a', pine_bolete: '#a86a3a', sloe: '#4a4a8a',
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

/** The expedition board at the landing: two posts, a board with pinned notes and a little roof. Faces +z. */
export function noticeBoardGeometry(): THREE.BufferGeometry {
  const b = geo();
  b.block(0.16, 1.7, 0.16, PAL.woodDark, [-0.75, 0, 0]);
  b.block(0.16, 1.7, 0.16, PAL.woodDark, [0.75, 0, 0]);
  b.block(1.8, 0.95, 0.1, PAL.woodLight, [0, 0.7, 0.02]);
  b.box(1.86, 0.08, 0.16, PAL.woodDark, [0, 0.7, 0.02]);
  b.box(1.86, 0.08, 0.16, PAL.woodDark, [0, 1.65, 0.02]);
  for (const [x, y, c] of [[-0.55, 1.2, '#fff3c4'], [0.0, 1.35, '#ffd6e0'], [0.5, 1.15, '#d4f0ff'], [-0.2, 0.9, '#e2f7c9'], [0.55, 0.85, '#fff3c4']] as const) b.box(0.34, 0.4, 0.02, c, [x, y, 0.1], [0, 0, (x * 0.2)]);
  b.prism(2.1, 0.4, 0.8, PAL.roof, [0, 1.75, 0]);
  b.block(0.34, 0.08, 0.34, PAL.stoneDark, [-0.75, 0, 0]);
  b.block(0.34, 0.08, 0.34, PAL.stoneDark, [0.75, 0, 0]);
  // a compass rose on top
  b.sphere(0.12, PAL.gold, [0, 2.3, 0], 1);
  return b.build();
}

/** A stone pedestal for a museum piece (the gem on top is added per shelf). */
export function pedestalGeometry(): THREE.BufferGeometry {
  return geo().cyl(0.28, 0.34, 0.5, '#d8cba9', [0, 0, 0], 8).cyl(0.34, 0.34, 0.08, '#b3a78d', [0, 0.5, 0], 8).build();
}

// ------------------------------------------------------------------------------------------- 1.19 the Deep Woods

/** A plank footbridge `len` long along +x (from 0 to len), with rope rails. `broken`: the middle third is missing. */
export function bridgeGeometry(len: number, broken: boolean): THREE.BufferGeometry {
  const b = geo();
  const n = Math.max(4, Math.round(len / 0.42));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    if (broken && t > 0.36 && t < 0.66) continue;
    b.box(0.36, 0.1, 1.7, i % 2 ? '#a8743a' : '#b9824a', [t * len, 0.12, 0], [0, 0, 0]);
  }
  for (const z of [-0.9, 0.9]) {
    for (let k = 0; k <= 4; k++) {
      const x = (k / 4) * len;
      if (broken && k === 2) continue;
      b.cyl(0.06, 0.07, 1.0, '#7a5a34', [x, 0.1, z], 6);
    }
    if (!broken) b.box(len, 0.05, 0.05, '#d9c08a', [len / 2, 0.95, z]);
    else { b.box(len * 0.36, 0.05, 0.05, '#d9c08a', [len * 0.18, 0.95, z]); b.box(len * 0.34, 0.05, 0.05, '#d9c08a', [len * 0.83, 0.95, z]); }
  }
  return b.build();
}

/** A shallow gravel pool on the creek with a gold pan resting on its edge. */
export function panPoolGeometry(): THREE.BufferGeometry {
  return geo()
    .cyl(1.15, 1.25, 0.06, '#b7a98c', [0, 0.02, 0], 20)
    .cyl(0.95, 0.95, 0.05, '#7fc8e8', [0, 0.05, 0], 20)
    .cyl(0.34, 0.26, 0.08, '#c9a24a', [0.95, 0.12, 0.35], 14, [0.4, 0, 0])
    .build();
}

/** A sap bucket hung on a tap at the foot of a tree. */
export function sapBucketGeometry(): THREE.BufferGeometry {
  return geo()
    .cyl(0.17, 0.14, 0.3, '#9aa5b1', [0, 0.35, 0], 10)
    .cyl(0.18, 0.18, 0.03, '#7a8590', [0, 0.5, 0], 10)
    .box(0.05, 0.05, 0.22, '#5a4a3a', [0, 0.62, -0.12])
    .build();
}

/** A winding strip of water across an island (for Crystal Creek): `pts` in island space. */
export function streamGeometry(pts: [number, number][], width: number): THREE.BufferGeometry {
  const b = geo();
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0);
    b.box(width + 0.5, 0.04, len + 0.4, '#c9b48a', [(x0 + x1) / 2, 0.02, (z0 + z1) / 2], [0, yaw, 0]);
    b.box(width, 0.05, len + 0.3, '#6fbfe0', [(x0 + x1) / 2, 0.035, (z0 + z1) / 2], [0, yaw, 0]);
  }
  return b.build();
}
