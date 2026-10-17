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
  // 1.23 the Ancient Grove
  acorn: '#b07a3a', moonflower: '#f4f0ff',
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

// ------------------------------------------------------------------------------------ 1.20 Woodland Friends

/** A feeding stump: a cut log with rings on top and a little wooden dish. */
export function stumpGeometry(): THREE.BufferGeometry {
  return geo()
    .cyl(0.42, 0.5, 0.5, '#8a6238', [0, 0, 0], 10)
    .cyl(0.4, 0.4, 0.02, '#d9b98a', [0, 0.5, 0], 10)
    .cyl(0.24, 0.24, 0.025, '#c7a273', [0, 0.505, 0], 10)
    .cone(0.12, 0.22, '#7a5530', [0.42, 0, 0.1], 5, [0, 0, -0.5])
    .cone(0.1, 0.18, '#7a5530', [-0.38, 0, -0.22], 5, [0, 0, 0.5])
    .sphere(0.14, '#5f9a3a', [-0.32, 0.06, 0.3], 0, [1.2, 0.5, 1])
    .build();
}

/** The treat waiting on a stump: a small heap in the treat's colour. */
export function treatGeometry(color: string): THREE.BufferGeometry {
  const b = geo();
  for (let i = 0; i < 5; i++) { const a = i * 1.3; b.sphere(0.07, color, [Math.cos(a) * 0.09, 0.56 + (i === 4 ? 0.06 : 0), Math.sin(a) * 0.09], 0); }
  return b.build();
}

/** A hedgehog, about 0.6 long, facing +z. */
export function hedgehogGeometry(): THREE.BufferGeometry {
  const b = geo()
    .sphere(0.28, '#7a5a3a', [0, 0.2, -0.04], 1, [1, 0.75, 1.2])
    .sphere(0.13, '#d8b88e', [0, 0.16, 0.26], 1, [0.9, 0.85, 1.1])
    .sphere(0.04, '#2a2018', [0, 0.17, 0.4], 0)
    .sphere(0.025, '#1a1410', [0.06, 0.22, 0.32], 0)
    .sphere(0.025, '#1a1410', [-0.06, 0.22, 0.32], 0);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, y = 0.26 + (i % 2) * 0.08;
    b.cone(0.05, 0.14, '#5a4028', [Math.cos(a) * 0.18, y, -0.06 + Math.sin(a) * 0.2], 4, [Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8]);
  }
  for (const [x, z] of [[0.12, 0.12], [-0.12, 0.12], [0.12, -0.18], [-0.12, -0.18]] as const) b.cyl(0.035, 0.035, 0.08, '#4a3624', [x, 0, z], 5);
  return b.build();
}

/** A red squirrel sitting up with its bushy tail, facing +z. */
export function squirrelGeometry(): THREE.BufferGeometry {
  return geo()
    .sphere(0.16, '#c8582a', [0, 0.2, 0], 1, [1, 1.3, 0.9])
    .sphere(0.12, '#c8582a', [0, 0.44, 0.04], 1)
    .sphere(0.08, '#f3dcc0', [0, 0.18, 0.1], 0, [1, 1.4, 0.6])
    .cone(0.04, 0.1, '#b04a22', [0.07, 0.52, 0.02], 4)
    .cone(0.04, 0.1, '#b04a22', [-0.07, 0.52, 0.02], 4)
    .sphere(0.022, '#1a1410', [0.05, 0.47, 0.14], 0)
    .sphere(0.022, '#1a1410', [-0.05, 0.47, 0.14], 0)
    .sphere(0.15, '#d8642e', [0, 0.32, -0.22], 1, [0.8, 1.6, 0.8])
    .sphere(0.12, '#e07038', [0, 0.56, -0.16], 1, [0.8, 1, 0.8])
    .build();
}

/** A tawny owl, about 0.6 tall, facing +z. */
export function owlGeometry(): THREE.BufferGeometry {
  return geo()
    .sphere(0.22, '#8a6a46', [0, 0.26, 0], 1, [1, 1.25, 0.95])
    .sphere(0.16, '#d9c2a0', [0, 0.22, 0.1], 1, [1, 1.3, 0.6])
    .sphere(0.17, '#8a6a46', [0, 0.54, 0], 1)
    .sphere(0.07, '#f3e6c8', [0.07, 0.56, 0.13], 0)
    .sphere(0.07, '#f3e6c8', [-0.07, 0.56, 0.13], 0)
    .sphere(0.035, '#1a1410', [0.07, 0.57, 0.18], 0)
    .sphere(0.035, '#1a1410', [-0.07, 0.57, 0.18], 0)
    .cone(0.03, 0.06, '#e8a838', [0, 0.47, 0.17], 4, [Math.PI, 0, 0])
    .cone(0.05, 0.1, '#6f5236', [0.11, 0.66, 0], 4)
    .cone(0.05, 0.1, '#6f5236', [-0.11, 0.66, 0], 4)
    .sphere(0.1, '#6f5236', [0.19, 0.26, -0.02], 0, [0.5, 1.4, 1])
    .sphere(0.1, '#6f5236', [-0.19, 0.26, -0.02], 0, [0.5, 1.4, 1])
    .cyl(0.03, 0.03, 0.06, '#e8a838', [0.06, 0, 0.04], 4)
    .cyl(0.03, 0.03, 0.06, '#e8a838', [-0.06, 0, 0.04], 4)
    .build();
}

/**
 * 1.23 the Elder Oak at `stage` 0 (asleep: bare, grey-brown branches) to 5 (whole: a wide crown taller than any tree in
 * the woods). Roots and trunk thicken and the canopy fills and greens with each stage. About 6 wide at stage 5.
 */
export function elderOakGeometry(stage: number): THREE.BufferGeometry {
  const s = Math.max(0, Math.min(5, stage));
  const b = geo();
  const bark = s === 0 ? '#7a6a58' : '#6a4a2e', rootC = s === 0 ? '#6e604f' : '#5e4128';
  const trunkH = 3.2 + s * 0.55, trunkR = 0.75 + s * 0.08;
  b.cyl(trunkR * 0.78, trunkR * 1.25, trunkH, bark, [0, 0, 0], 10);
  // roots spread round the foot
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9 + 0.3;
    b.cone(0.32 + s * 0.03, 1.5 + s * 0.12, rootC, [Math.cos(a) * trunkR * 0.95, -0.15, Math.sin(a) * trunkR * 0.95], 5, [Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25]);
  }
  // knots and moss on the bark
  b.sphere(0.2, '#4e3720', [trunkR * 0.75, trunkH * 0.45, 0.2], 0, [0.6, 1, 0.6]);
  b.sphere(0.32, s === 0 ? '#7f8a5a' : '#5f9a3a', [-trunkR * 0.7, 0.35, trunkR * 0.4], 0, [1.2, 0.5, 1]);
  // boughs: more and longer with every stage
  const boughs = 4 + s;
  for (let i = 0; i < boughs; i++) {
    const a = (i / boughs) * Math.PI * 2 + 0.4, len = s === 0 ? 2.4 : 1.4 + s * 0.3, y = trunkH * (0.62 + (i % 3) * 0.1);
    const tip: [number, number, number] = [Math.cos(a) * len * 0.55, y + len * 0.42, Math.sin(a) * len * 0.55];
    b.cyl(0.1 + s * 0.012, 0.22 + s * 0.02, len, bark, [tip[0] * 0.5, y + len * 0.21 - len / 2, tip[2] * 0.5], 6, [Math.sin(a) * 0.95, 0, -Math.cos(a) * 0.95]);
    if (s === 0) b.cyl(0.04, 0.07, 0.8, bark, [tip[0] * 1.2, tip[1] - 0.1, tip[2] * 1.2], 4, [Math.sin(a + 0.6) * 0.6, 0, -Math.cos(a + 0.6) * 0.6]);
  }
  if (s === 0) {
    // a few last brown leaves
    for (let i = 0; i < 5; i++) { const a = i * 1.3; b.sphere(0.22, '#a5864a', [Math.cos(a) * 1.4, trunkH + 0.5, Math.sin(a) * 1.4], 0, [1, 0.6, 1]); }
    return b.build();
  }
  // the canopy: clumps of leaves in rings, more, larger and greener stage by stage
  const greens = ['#9aa84a', '#7fb04a', '#5fa83f', '#4f9a3a', '#3f8a35'];
  const g = greens[s - 1], g2 = greens[Math.max(0, s - 2)];
  const top = trunkH + 0.4, spread = 1.2 + s * 0.48, clump = 0.7 + s * 0.17;
  const rings: [number, number, number][] = [[0.0, top + 0.6 + s * 0.25, 1], [spread * 0.55, top + 0.2 + s * 0.12, 5], [spread, top - 0.3, 7 + s]];
  rings.forEach(([d, y, n], k) => {
    if (k === 2 && s < 2) return;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + k * 0.5;
      b.sphere(clump * (k === 0 ? 1.25 : 1), i % 2 ? g : g2, [Math.cos(a) * d, y + (i % 3) * 0.12, Math.sin(a) * d], 1, [1, 0.8, 1]);
    }
  });
  if (s >= 3) for (let i = 0; i < 6 + s * 2; i++) {
    const a = i * 2.4, d = spread * (0.3 + ((i * 7) % 10) / 14);
    b.sphere(0.09, '#b07a3a', [Math.cos(a) * d, top - 0.6 + (i % 4) * 0.35, Math.sin(a) * d], 0);
  }
  return b.build();
}

// ------------------------------------------------------------------ 1.27 wildlife (each about 0.5-0.7 long, facing +z)

/** A mallard drake: green head, white collar, grey body. */
export function duckGeometry(): THREE.BufferGeometry {
  return geo()
    .sphere(0.2, '#9a9a92', [0, 0.16, -0.02], 1, [0.9, 0.7, 1.35])
    .sphere(0.12, '#6a4a3a', [0, 0.2, 0.18], 1, [0.9, 0.9, 0.7])
    .sphere(0.1, '#2f7a3a', [0, 0.36, 0.22], 1)
    .torus(0.07, 0.015, '#ffffff', [0, 0.28, 0.21], [Math.PI / 2, 0, 0])
    .box(0.07, 0.03, 0.1, '#f2b83a', [0, 0.34, 0.33])
    .sphere(0.018, '#111111', [0.06, 0.39, 0.27], 0)
    .sphere(0.018, '#111111', [-0.06, 0.39, 0.27], 0)
    .cone(0.07, 0.12, '#2a2a2a', [0, 0.16, -0.32], 4, [-1.6, 0, 0])
    .sphere(0.08, '#3f5fb0', [0.16, 0.2, -0.02], 0, [0.4, 0.6, 1.2])
    .sphere(0.08, '#3f5fb0', [-0.16, 0.2, -0.02], 0, [0.4, 0.6, 1.2])
    .build();
}

/** A grey heron standing in the shallows on its long legs. */
export function heronGeometry(): THREE.BufferGeometry {
  return geo()
    .cyl(0.012, 0.014, 0.42, '#c9a046', [0.05, 0, 0], 4)
    .cyl(0.012, 0.014, 0.42, '#c9a046', [-0.05, 0, 0], 4)
    .sphere(0.15, '#a7adb2', [0, 0.5, -0.04], 1, [0.8, 0.85, 1.4])
    .sphere(0.08, '#5a6068', [0, 0.53, -0.24], 0, [0.6, 0.5, 1.2])
    .cyl(0.035, 0.045, 0.3, '#d9dde0', [0, 0.6, 0.12], 6, [0.5, 0, 0])
    .sphere(0.07, '#e6e9ec', [0, 0.86, 0.2], 1)
    .box(0.12, 0.03, 0.03, '#2a2a2a', [0.03, 0.9, 0.2], [0, -0.3, 0])
    .cone(0.02, 0.2, '#e0b030', [0, 0.85, 0.32], 4, [Math.PI / 2, 0, 0])
    .sphere(0.015, '#111111', [0.05, 0.88, 0.24], 0)
    .sphere(0.015, '#111111', [-0.05, 0.88, 0.24], 0)
    .build();
}

/** A green frog sitting on a lily pad. */
export function frogGeometry(): THREE.BufferGeometry {
  return geo()
    .cyl(0.32, 0.32, 0.02, '#4f9a3a', [0, 0, 0], 14)
    .sphere(0.16, '#6fbf4a', [0, 0.13, 0], 1, [1.1, 0.7, 1.1])
    .sphere(0.06, '#6fbf4a', [0.08, 0.24, 0.08], 0)
    .sphere(0.06, '#6fbf4a', [-0.08, 0.24, 0.08], 0)
    .sphere(0.03, '#111111', [0.09, 0.27, 0.12], 0)
    .sphere(0.03, '#111111', [-0.09, 0.27, 0.12], 0)
    .sphere(0.11, '#e8f0c8', [0, 0.09, 0.08], 0, [1, 0.6, 0.8])
    .sphere(0.06, '#5aa83a', [0.15, 0.05, -0.08], 0, [0.8, 0.5, 1.6])
    .sphere(0.06, '#5aa83a', [-0.15, 0.05, -0.08], 0, [0.8, 0.5, 1.6])
    .build();
}

/** A river otter on its belly, head up. */
export function otterGeometry(): THREE.BufferGeometry {
  return geo()
    .sphere(0.16, '#6a4a30', [0, 0.14, -0.05], 1, [0.85, 0.7, 1.8])
    .sphere(0.12, '#6a4a30', [0, 0.26, 0.24], 1)
    .sphere(0.08, '#d9c2a0', [0, 0.22, 0.32], 0, [1, 0.8, 0.8])
    .sphere(0.025, '#1a1410', [0, 0.25, 0.39], 0)
    .sphere(0.02, '#111111', [0.05, 0.31, 0.33], 0)
    .sphere(0.02, '#111111', [-0.05, 0.31, 0.33], 0)
    .sphere(0.03, '#5a3a24', [0.08, 0.36, 0.22], 0)
    .sphere(0.03, '#5a3a24', [-0.08, 0.36, 0.22], 0)
    .cone(0.07, 0.36, '#5a3a24', [0, 0.1, -0.5], 5, [-1.65, 0, 0])
    .build();
}

/** A robin: round, brown, with an orange-red breast. */
export function robinGeometry(): THREE.BufferGeometry {
  return geo()
    .sphere(0.14, '#8a6a46', [0, 0.18, 0], 1, [0.9, 0.95, 1.1])
    .sphere(0.1, '#e8642e', [0, 0.17, 0.08], 1, [1, 1.1, 0.6])
    .sphere(0.09, '#8a6a46', [0, 0.33, 0.06], 1)
    .sphere(0.06, '#e8642e', [0, 0.3, 0.12], 0, [1, 1, 0.6])
    .cone(0.025, 0.07, '#3a2a1a', [0, 0.33, 0.17], 4, [Math.PI / 2, 0, 0])
    .sphere(0.018, '#111111', [0.05, 0.35, 0.12], 0)
    .sphere(0.018, '#111111', [-0.05, 0.35, 0.12], 0)
    .box(0.1, 0.02, 0.16, '#6a4a30', [0, 0.2, -0.16], [0.5, 0, 0])
    .cyl(0.01, 0.01, 0.08, '#4a3624', [0.04, 0.02, 0], 4)
    .cyl(0.01, 0.01, 0.08, '#4a3624', [-0.04, 0.02, 0], 4)
    .build();
}

/** A peacock butterfly resting on a flower head, wings open. */
export function butterflyGeometry(): THREE.BufferGeometry {
  const b = geo()
    .cyl(0.012, 0.015, 0.35, '#4f8a3a', [0, 0, 0], 4)
    .sphere(0.07, '#ffd23a', [0, 0.36, 0], 0, [1, 0.5, 1])
    .cyl(0.015, 0.015, 0.18, '#2a2018', [0, 0.4, -0.06], 4, [Math.PI / 2, 0, 0]);
  for (const s of [1, -1]) {
    b.sphere(0.13, '#b5302a', [s * 0.13, 0.42, 0.0], 0, [1, 0.12, 0.85]);
    b.sphere(0.04, '#3f6fb5', [s * 0.17, 0.44, 0.02], 0, [1, 0.3, 1]);
    b.sphere(0.09, '#8a2420', [s * 0.1, 0.41, -0.12], 0, [1, 0.12, 0.8]);
  }
  return b.build();
}

/** A badger, low and stripy-faced. */
export function badgerGeometry(): THREE.BufferGeometry {
  return geo()
    .sphere(0.2, '#7d7d78', [0, 0.18, -0.04], 1, [1, 0.75, 1.5])
    .sphere(0.12, '#f2f2ee', [0, 0.2, 0.26], 1, [0.9, 0.8, 1.2])
    .box(0.04, 0.05, 0.22, '#1a1a1a', [0.05, 0.27, 0.27])
    .box(0.04, 0.05, 0.22, '#1a1a1a', [-0.05, 0.27, 0.27])
    .sphere(0.03, '#111111', [0, 0.18, 0.4], 0)
    .sphere(0.035, '#3a3a38', [0.08, 0.3, 0.18], 0)
    .sphere(0.035, '#3a3a38', [-0.08, 0.3, 0.18], 0)
    .cyl(0.04, 0.04, 0.08, '#2a2a28', [0.12, 0, 0.14], 5)
    .cyl(0.04, 0.04, 0.08, '#2a2a28', [-0.12, 0, 0.14], 5)
    .cyl(0.04, 0.04, 0.08, '#2a2a28', [0.12, 0, -0.22], 5)
    .cyl(0.04, 0.04, 0.08, '#2a2a28', [-0.12, 0, -0.22], 5)
    .build();
}

/** The procedural wild animals by model id ('proc:<name>'). */
export const WILD_PROC: Record<string, () => THREE.BufferGeometry> = {
  'proc:hedgehog': hedgehogGeometry, 'proc:squirrel': squirrelGeometry, 'proc:owl': owlGeometry,
  'proc:duck': duckGeometry, 'proc:heron': heronGeometry, 'proc:frog': frogGeometry, 'proc:otter': otterGeometry,
  'proc:robin': robinGeometry, 'proc:butterfly': butterflyGeometry, 'proc:badger': badgerGeometry,
};

// ------------------------------------------------------------------ 1.27 the treehouse

/** Height of the treehouse platform. */
export const TREEHOUSE_Y = 3.2;

/**
 * The great pine with the treehouse at `stage` 0 (just the tree and a sign) to 3 (platform, cabin and a mossy roof
 * with a flag). The cabin faces +z. About 4 wide and 10 tall.
 */
export function treehouseGeometry(stage: number): THREE.BufferGeometry {
  const b = geo();
  const Y = TREEHOUSE_Y, wood = '#a8743a', dark = '#7a4a2a';
  // the great pine: a tall trunk and tiers of needles above the house
  // (the needles start above the roof, so the house is not hidden from the camera)
  b.cyl(0.3, 0.5, 9.0, '#6a4a2e', [0, 0, -0.5], 8);
  for (const [y, r, h] of [[6.9, 1.7, 1.5], [7.8, 1.4, 1.4], [8.6, 1.1, 1.2], [9.3, 0.8, 1.0], [9.9, 0.5, 0.9]] as const) b.cone(r, h, y % 2 < 1 ? '#2f6a3a' : '#3a7a40', [0, y, -0.5], 8);
  if (stage === 0) {
    // a sign at the foot: "treehouse coming soon"
    b.block(0.08, 0.9, 0.08, dark, [0.9, 0, 0.6]);
    b.block(0.7, 0.4, 0.06, wood, [0.9, 0.7, 0.62]);
    return b.build();
  }
  // platform, beams, railing and a rope ladder
  b.cyl(1.9, 1.9, 0.14, wood, [0, Y, 0], 16);
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.4; b.cyl(0.06, 0.08, 1.9, dark, [Math.cos(a) * 0.9, Y - 1.5, Math.sin(a) * 0.9 - 0.25], 5, [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]); }
  for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; if (Math.abs(a - Math.PI / 2) < 0.3) continue; b.cyl(0.035, 0.035, 0.5, dark, [Math.cos(a) * 1.82, Y + 0.14, Math.sin(a) * 1.82], 4); }
  b.torus(1.82, 0.03, dark, [0, Y + 0.62, 0], [Math.PI / 2, 0, 0]);
  for (const x of [-0.18, 0.18]) b.cyl(0.02, 0.02, Y, '#c9a46a', [x, 0, 1.86], 4);
  for (let i = 1; i < 7; i++) b.box(0.42, 0.04, 0.05, wood, [0, (i * Y) / 7, 1.86]);
  if (stage >= 2) {
    // the cabin: pine walls, a door and a round window
    b.block(1.7, 1.35, 1.3, '#c98a4b', [0, Y + 0.14, -0.35]);
    b.block(0.4, 0.8, 0.05, dark, [-0.4, Y + 0.14, 0.31]);
    b.cyl(0.22, 0.22, 0.05, dark, [0.35, Y + 0.85, 0.31], 14, [Math.PI / 2, 0, 0]);
    b.cyl(0.17, 0.17, 0.06, '#ffe9a8', [0.35, Y + 0.85, 0.32], 14, [Math.PI / 2, 0, 0]);
  }
  if (stage >= 3) {
    // a mossy roof and a flag
    b.prism(2.0, 0.8, 1.6, '#5f9a3a', [0, Y + 1.49, -0.35]);
    b.cyl(0.025, 0.025, 1.0, dark, [0.75, Y + 1.5, -0.35], 4);
    b.box(0.45, 0.28, 0.03, '#e2533c', [0.98, Y + 2.3, -0.35]);
  }
  return b.build();
}

/** The six furnishings, placed on the treehouse platform (shown once each is made). */
export const FURNISH_GEO: Record<string, () => THREE.BufferGeometry> = {
  chairs: () => geo().cyl(0.18, 0.2, 0.36, '#8a5a30', [0.9, TREEHOUSE_Y + 0.07, 0.75], 8).cyl(0.18, 0.2, 0.36, '#8a5a30', [1.25, TREEHOUSE_Y + 0.07, 0.25], 8).cyl(0.17, 0.17, 0.02, '#d9b98a', [0.9, TREEHOUSE_Y + 0.43, 0.75], 8).cyl(0.17, 0.17, 0.02, '#d9b98a', [1.25, TREEHOUSE_Y + 0.43, 0.25], 8).build(),
  lamp: () => geo().cyl(0.05, 0.07, 0.45, '#f2eee2', [-1.25, TREEHOUSE_Y + 0.07, 0.7], 6).sphere(0.26, '#ffe9b0', [-1.25, TREEHOUSE_Y + 0.6, 0.7], 1, [1, 0.6, 1]).build(),
  lanterns: () => {
    const b = geo();
    for (const [x, z] of [[1.3, -1.1], [-1.4, -0.9], [0.2, 1.5]] as const) { b.cyl(0.01, 0.01, 0.5, '#3a3a46', [x, TREEHOUSE_Y + 1.9, z], 3); b.cyl(0.1, 0.12, 0.2, '#ffd27a', [x, TREEHOUSE_Y + 1.7, z], 6); }
    return b.build();
  },
  rug: () => geo().cyl(0.75, 0.75, 0.03, '#6fae4a', [0.2, TREEHOUSE_Y + 0.14, 0.95], 16).cyl(0.5, 0.5, 0.035, '#8fd06a', [0.2, TREEHOUSE_Y + 0.14, 0.95], 16).build(),
  books: () => {
    const b = geo().block(0.6, 0.9, 0.25, '#7a4a2a', [-1.2, TREEHOUSE_Y + 0.07, -0.95]);
    const cols = ['#d9473a', '#3f86d8', '#ffcf3f', '#4fae3a', '#a77bf3'];
    for (let i = 0; i < 5; i++) b.block(0.09, 0.3, 0.2, cols[i], [-1.42 + i * 0.11, TREEHOUSE_Y + 0.45, -0.93]);
    return b.build();
  },
  telescope: () => geo().cyl(0.02, 0.02, 0.6, '#3a3a46', [-0.9, TREEHOUSE_Y + 0.07, 1.15], 4, [0.25, 0, 0]).cyl(0.02, 0.02, 0.6, '#3a3a46', [-1.05, TREEHOUSE_Y + 0.07, 1.0], 4, [-0.2, 0, 0.2])
    .cyl(0.07, 0.1, 0.7, '#d9a43a', [-0.95, TREEHOUSE_Y + 0.62, 1.15], 10, [0.9, 0, 0]).build(),
};
