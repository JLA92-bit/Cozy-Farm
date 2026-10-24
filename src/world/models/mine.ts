import * as THREE from 'three';
import { geo, PAL, rng } from '../Procedural';

/**
 * 1.31 The Old Mine: models built in code. The Smelter (a stone furnace with a glowing mouth, a chimney and a coal
 * heap) and the Jeweller's Bench (a little workshop with a gem sign) for the farm; four Old Mine decor pieces; and the
 * props inside the mine (cart, lift, ladders, the hole down) and its three cave animals. Chunky and soft like the
 * farm's other own models; the front faces +z.
 */
const STONE = '#9b958a', STONE_DARK = '#6d675e', IRON = '#4a4a52', WOOD = '#8a5a33', WOOD_DARK = '#5e3a20';

/** A faceted crystal: a six-sided prism with a pointed top, tilted. */
export function crystal(b: ReturnType<typeof geo>, r: number, h: number, colour: string, pos: [number, number, number], tilt: [number, number] = [0, 0]): void {
  const g = new THREE.CylinderGeometry(r * 0.75, r, h * 0.7, 6).translate(0, h * 0.35, 0);
  const tip = new THREE.ConeGeometry(r * 0.75, h * 0.3, 6).translate(0, h * 0.85, 0);
  for (const part of [g, tip]) b.geometry(part, colour, pos, [tilt[0], 0, tilt[1]]);
}

export const MINE_PROC: Record<string, () => THREE.BufferGeometry> = {
  smelter: () => {
    const b = geo();
    b.block(2.9, 0.07, 2.9, '#cdbfa3', [0, 0, 0]);
    // the furnace: a stone dome on a square base, a glowing mouth
    b.block(1.6, 0.9, 1.4, STONE, [0, 0.07, -0.35]);
    for (let i = 0; i < 6; i++) b.box(1.62, 0.04, 1.42, STONE_DARK, [0, 0.2 + i * 0.15, -0.35]);
    b.sphere(0.85, STONE, [0, 0.97, -0.35], 1, [1, 0.75, 0.9]);
    b.block(0.62, 0.5, 0.08, '#2a1a12', [0, 0.25, 0.36]);
    b.block(0.5, 0.36, 0.06, '#ff8a2a', [0, 0.3, 0.39]);
    b.block(0.3, 0.18, 0.04, '#ffd36a', [0, 0.36, 0.42]);
    b.box(0.74, 0.08, 0.14, STONE_DARK, [0, 0.78, 0.36]);
    // a chimney with a cap
    b.cyl(0.18, 0.24, 1.1, STONE_DARK, [0.45, 1.3, -0.6], 8);
    b.cyl(0.26, 0.26, 0.1, IRON, [0.45, 2.38, -0.6], 8);
    // bellows, coal heap, a bucket of ore and an anvil
    b.block(0.5, 0.12, 0.34, WOOD, [-1.0, 0.07, 0.35], [0, 0.4, 0]);
    b.sphere(0.2, '#7a5236', [-1.0, 0.25, 0.35], 1, [1.2, 0.5, 0.9]);
    for (let i = 0; i < 9; i++) b.sphere(0.12 + (i % 3) * 0.03, '#2b2826', [0.85 + (i % 3) * 0.16, 0.07 + Math.floor(i / 3) * 0.08, 0.6 - Math.floor(i / 3) * 0.1], 0);
    b.cyl(0.18, 0.15, 0.3, IRON, [-1.05, 0.07, -0.7], 10);
    for (let i = 0; i < 4; i++) b.sphere(0.08, i % 2 ? '#c4743a' : '#9aa4ae', [-1.1 + (i % 2) * 0.1, 0.38, -0.72 + Math.floor(i / 2) * 0.08], 0);
    b.block(0.5, 0.24, 0.22, IRON, [1.05, 0.33, -0.15]);
    b.cyl(0.08, 0.14, 0.26, '#5a3a22', [1.05, 0.07, -0.15], 8);
    // two bars cooling on the anvil
    b.block(0.16, 0.06, 0.08, '#ffb820', [0.98, 0.57, -0.12]);
    b.block(0.16, 0.06, 0.08, '#c4743a', [1.15, 0.57, -0.18]);
    return b.build();
  },
  jeweller: () => {
    const b = geo();
    b.block(2.9, 0.07, 2.9, '#d9c7a3', [0, 0, 0]);
    // a little shop: plum walls, a cream trim, a slate roof
    b.block(2.1, 1.25, 1.5, '#8c5a8a', [0, 0.07, -0.45]);
    b.block(2.18, 0.1, 1.58, '#f6ead2', [0, 0.07, -0.45]);
    b.prism(2.4, 0.75, 1.8, '#4a4a5a', [0, 1.32, -0.45]);
    // a bay window full of sparkle
    b.block(1.0, 0.7, 0.3, '#f6ead2', [0.35, 0.3, 0.38]);
    b.block(0.86, 0.5, 0.05, '#cfeeff', [0.35, 0.4, 0.54]);
    for (const [x, c] of [[0.1, '#e2533c'], [0.32, '#4fae6a'], [0.54, '#3f6fd8']] as const) b.geometry(new THREE.OctahedronGeometry(0.06), c, [x, 0.55, 0.5]);
    b.block(0.38, 0.8, 0.06, '#5a3a22', [-0.55, 0.07, 0.31]);
    b.sphere(0.03, PAL.gold, [-0.42, 0.45, 0.35], 0);
    // a hanging sign with a big gem
    b.block(0.07, 1.1, 0.07, WOOD_DARK, [-1.25, 0.07, 0.95]);
    b.box(0.6, 0.06, 0.06, WOOD_DARK, [-1.0, 1.12, 0.95]);
    b.block(0.5, 0.36, 0.06, '#f6ead2', [-0.95, 0.68, 0.95]);
    b.geometry(new THREE.OctahedronGeometry(0.13), '#b48cff', [-0.95, 0.86, 1.0], [0, 0, 0], [1, 1.25, 0.5]);
    // a workbench under an awning
    b.block(0.9, 0.5, 0.4, WOOD, [0.9, 0.07, 0.9]);
    b.box(1.1, 0.06, 0.7, '#e2b4dc', [0.9, 1.05, 0.85], [-0.25, 0, 0]);
    for (const x of [0.4, 1.4]) b.block(0.05, 0.95, 0.05, WOOD_DARK, [x, 0.07, 1.15]);
    b.geometry(new THREE.OctahedronGeometry(0.07), '#ffcf3f', [0.75, 0.62, 0.9]);
    b.cyl(0.05, 0.05, 0.08, '#dfe4ea', [1.05, 0.57, 0.92], 10);
    return b.build();
  },
  mine_cart_rails: () => {
    const b = geo();
    // two rails on sleepers
    for (let i = 0; i < 6; i++) b.block(0.2, 0.05, 0.9, WOOD_DARK, [-1.0 + i * 0.4, 0, 0]);
    for (const z of [-0.3, 0.3]) b.block(2.4, 0.06, 0.06, '#8a8f96', [0, 0.05, z]);
    cartInto(b, [0.1, 0.11, 0], '#c4743a');
    return b.build();
  },
  mine_lantern_post: () => {
    const b = geo();
    b.block(0.5, 0.08, 0.5, STONE_DARK, [0, 0, 0]);
    b.block(0.14, 1.7, 0.14, WOOD_DARK, [0, 0.08, 0]);
    b.box(0.6, 0.08, 0.1, WOOD_DARK, [0.22, 1.72, 0]);
    b.cyl(0.015, 0.015, 0.2, IRON, [0.45, 1.5, 0], 4);
    b.block(0.24, 0.05, 0.24, IRON, [0.45, 1.16, 0]);
    b.block(0.2, 0.28, 0.2, '#ffe2a0', [0.45, 1.21, 0]);
    b.cone(0.17, 0.12, IRON, [0.45, 1.49, 0], 4, [0, Math.PI / 4, 0]);
    return b.build();
  },
  crystal_garden: () => {
    const b = geo();
    const r = rng(77);
    b.cyl(1.3, 1.4, 0.12, '#5f9a43', [0, 0, 0], 16);
    for (let i = 0; i < 14; i++) { const a = r() * Math.PI * 2, d = 0.4 + r() * 0.85; b.sphere(0.12 + r() * 0.1, i % 2 ? STONE : STONE_DARK, [Math.cos(a) * d, 0.12, Math.sin(a) * d], 0, [1, 0.6, 1]); }
    const cols = ['#b48cff', '#6fd8ff', '#ff8fd0', '#b48cff', '#7fffd4'];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + r() * 0.3, d = i === 0 ? 0 : 0.35 + r() * 0.6;
      crystal(b, 0.08 + r() * 0.06, i === 0 ? 1.1 : 0.4 + r() * 0.5, cols[i % cols.length], [Math.cos(a) * d, 0.1, Math.sin(a) * d], [(r() - 0.5) * 0.5, (r() - 0.5) * 0.5]);
    }
    for (let i = 0; i < 8; i++) { const a = r() * Math.PI * 2, d = 0.9 + r() * 0.35; b.sphere(0.1, '#3f7a2e', [Math.cos(a) * d, 0.14, Math.sin(a) * d], 0, [1, 0.5, 1]); }
    return b.build();
  },
  gem_fountain: () => {
    const b = geo();
    b.cyl(1.25, 1.35, 0.5, STONE, [0, 0, 0], 20);
    b.cyl(1.1, 1.1, 0.06, '#4fc3e8', [0, 0.44, 0], 20);
    b.torus(1.2, 0.08, STONE_DARK, [0, 0.5, 0], [Math.PI / 2, 0, 0]);
    b.cyl(0.32, 0.4, 0.6, STONE_DARK, [0, 0.45, 0], 10);
    b.cyl(0.55, 0.5, 0.12, STONE, [0, 1.0, 0], 14);
    b.cyl(0.45, 0.45, 0.04, '#7fd7f5', [0, 1.1, 0], 14);
    crystal(b, 0.2, 1.3, '#6fd8ff', [0, 1.1, 0]);
    for (const [a, c] of [[0, '#b48cff'], [2.1, '#ff8fd0'], [4.2, '#7fffd4']] as const) crystal(b, 0.09, 0.55, c, [Math.cos(a) * 0.25, 1.1, Math.sin(a) * 0.25], [Math.sin(a) * 0.4, Math.cos(a) * 0.4]);
    // water spilling over the rim
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.box(0.12, 0.42, 0.03, '#9fe3f8', [Math.cos(a) * 0.52, 0.72, Math.sin(a) * 0.52], [0, -a, 0]); }
    return b.build();
  },
};

/** A wooden mine cart with iron bands on four wheels, heaped with ore of `ore` colour. About 1.0 x 0.7 x 0.6. */
export function cartInto(b: ReturnType<typeof geo>, at: [number, number, number], ore: string, empty = false): void {
  const [x, y, z] = at;
  b.block(1.0, 0.5, 0.7, WOOD, [x, y + 0.16, z]);
  b.block(1.04, 0.06, 0.74, IRON, [x, y + 0.6, z]);
  b.block(1.04, 0.06, 0.74, IRON, [x, y + 0.26, z]);
  for (const sx of [-0.35, 0.35]) b.block(0.06, 0.5, 0.74, IRON, [x + sx, y + 0.16, z]);
  for (const sx of [-0.32, 0.32]) for (const sz of [-0.38, 0.38]) b.cyl(0.13, 0.13, 0.06, '#3a3a40', [x + sx, y + 0.13, z + sz], 10, [Math.PI / 2, 0, 0]);
  if (empty) { b.block(0.9, 0.04, 0.6, '#3a2a1e', [x, y + 0.55, z]); return; }
  const r = rng(Math.floor((x + 3) * 1000 + z * 100));
  for (let i = 0; i < 9; i++) b.sphere(0.1 + r() * 0.05, i % 3 === 0 ? '#5a5650' : ore, [x - 0.32 + (i % 3) * 0.32, y + 0.66 + r() * 0.06, z - 0.2 + Math.floor(i / 3) * 0.2], 0);
}

/** The cart inside the mine (a separate full and empty look). */
export const mineCartGeometry = (ore: string, empty: boolean): THREE.BufferGeometry => {
  const b = geo();
  for (let i = 0; i < 5; i++) b.block(0.18, 0.05, 0.85, WOOD_DARK, [-0.9 + i * 0.45, 0, 0]);
  for (const z of [-0.28, 0.28]) b.block(2.2, 0.06, 0.06, '#8a8f96', [0, 0.05, z]);
  cartInto(b, [0, 0.11, 0], ore, empty);
  return b.build();
};

/** A ladder leaning up into the dark (the way up), about 0.5 wide and `h` tall, top leaning back (-z). */
export function ladderGeometry(h: number, lean = 0.25): THREE.BufferGeometry {
  const b = geo();
  for (const x of [-0.24, 0.24]) b.box(0.07, h, 0.07, '#9a6a3a', [x, h / 2, 0], [-lean, 0, 0]);
  const n = Math.floor(h / 0.32);
  for (let i = 1; i < n; i++) { const yy = i * 0.32; b.box(0.5, 0.05, 0.06, '#b07a44', [0, yy, -Math.sin(lean) * yy], [-lean, 0, 0]); }
  return b.build();
}

/** The hole down with a ladder poking out of it, and a ring of stones. */
export function holeGeometry(): THREE.BufferGeometry {
  const b = geo();
  const r = rng(5);
  b.cyl(0.62, 0.62, 0.03, '#08060a', [0, 0.005, 0], 18);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; b.sphere(0.13 + r() * 0.05, i % 2 ? '#6d675e' : '#857e72', [Math.cos(a) * 0.68, 0.04, Math.sin(a) * 0.68], 0, [1, 0.55, 1]); }
  for (const x of [-0.2, 0.2]) b.box(0.06, 0.9, 0.06, '#b07a44', [x, 0.2, -0.25], [-0.35, 0, 0]);
  for (const y of [0.1, 0.38]) b.box(0.44, 0.05, 0.05, '#c48a50', [0, y, -0.25 - Math.sin(0.35) * (y - 0.2)], [-0.35, 0, 0]);
  return b.build();
}

/** The lift: a timber frame with a winch wheel, ropes, a gate and a lamp. About 1.6 wide and 3.4 tall. */
export function liftGeometry(): THREE.BufferGeometry {
  const b = geo();
  b.block(1.7, 0.08, 1.7, '#5e3a20', [0, 0, 0]);
  for (const x of [-0.75, 0.75]) for (const z of [-0.75, 0.75]) b.block(0.14, 3.0, 0.14, WOOD, [x, 0.08, z]);
  for (const z of [-0.75, 0.75]) b.block(1.64, 0.14, 0.14, WOOD_DARK, [0, 3.0, z]);
  for (const x of [-0.75, 0.75]) b.block(0.14, 0.14, 1.64, WOOD_DARK, [x, 3.0, 0]);
  // braces
  for (const x of [-0.75, 0.75]) b.box(0.08, 1.4, 0.08, WOOD_DARK, [x, 2.4, -0.4], [0.7, 0, 0]);
  // the winch wheel on top and its ropes
  b.cyl(0.42, 0.42, 0.1, IRON, [0, 3.55, 0], 16, [Math.PI / 2, 0, 0]);
  b.cyl(0.32, 0.32, 0.12, '#6a6a74', [0, 3.55, 0], 16, [Math.PI / 2, 0, 0]);
  for (const x of [-0.3, 0.3]) b.cyl(0.02, 0.02, 2.3, '#c9a46a', [x, 1.0, 0], 4);
  // the cage floor waiting at this level, and a gate of slats
  b.block(1.3, 0.1, 1.3, '#8a6a42', [0, 0.6, 0]);
  for (let i = 0; i < 5; i++) b.block(0.06, 1.0, 0.06, IRON, [-0.5 + i * 0.25, 0.7, 0.66]);
  b.block(1.3, 0.06, 0.06, IRON, [0, 1.7, 0.66]);
  // a lamp on the front post
  b.block(0.16, 0.22, 0.16, '#ffe2a0', [0.88, 1.8, 0.78]);
  b.cone(0.13, 0.1, IRON, [0.88, 2.02, 0.78], 4, [0, Math.PI / 4, 0]);
  return b.build();
}

/** A shaft of daylight falling down the ladder hole: a soft open cone (drawn additive). */
export function lightShaftGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.45, 1.05, 6, 20, 1, true).translate(0, 3, 0);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const y = g.attributes.position.getY(i) / 6; const k = 0.15 + (1 - y) * 0.55; col[i * 3] = k; col[i * 3 + 1] = k * 0.95; col[i * 3 + 2] = k * 0.8; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// ------------------------------------------------------------------ cave animals (Wildlife Album)

export function batGeometry(): THREE.BufferGeometry {
  // hanging upside down, wings folded like a little umbrella
  const b = geo();
  b.cyl(0.015, 0.015, 0.12, '#2a2226', [0, 0.38, 0], 4);
  b.sphere(0.12, '#4a3c46', [0, 0.24, 0], 1, [0.9, 1.4, 0.9]);
  b.cone(0.16, 0.3, '#3a2e38', [0, 0.06, 0], 6, [Math.PI, 0, 0]);
  b.sphere(0.07, '#5a4a56', [0, 0.05, 0.05], 1);
  for (const x of [-0.05, 0.05]) b.cone(0.03, 0.07, '#4a3c46', [x, -0.05, 0.03], 4, [Math.PI, 0, 0]);
  for (const x of [-0.025, 0.025]) b.sphere(0.012, '#ffe27a', [x, 0.04, 0.1], 0);
  return b.build();
}

export function glowwormGeometry(): THREE.BufferGeometry {
  // a cluster of glowing threads hanging from the rock, each with a bright bead
  const b = geo();
  const r = rng(11);
  b.sphere(0.2, '#3a3a4a', [0, 0.5, 0], 0, [1.4, 0.4, 1]);
  for (let i = 0; i < 9; i++) {
    const x = (r() - 0.5) * 0.45, z = (r() - 0.5) * 0.3, h = 0.15 + r() * 0.3;
    b.cyl(0.004, 0.004, h, '#bff8ff', [x, 0.45 - h, z], 3);
    b.sphere(0.022, '#7ff7ff', [x, 0.45 - h, z], 0);
  }
  b.sphere(0.04, '#9fffe0', [0.05, 0.47, 0.08], 0, [2.2, 0.8, 0.8]);
  return b.build();
}

export function salamanderGeometry(): THREE.BufferGeometry {
  const b = geo();
  const skin = '#f2c6c0', dark = '#d99a94';
  b.sphere(0.08, skin, [0, 0.07, 0.12], 1, [1, 0.7, 1.4]);
  b.sphere(0.07, skin, [0, 0.07, -0.02], 1, [1, 0.65, 1.6]);
  b.cone(0.05, 0.3, dark, [0, 0.06, -0.15], 6, [-Math.PI / 2, 0, 0]);
  for (const [x, z] of [[0.08, 0.1], [-0.08, 0.1], [0.08, -0.06], [-0.08, -0.06]] as const) b.cyl(0.018, 0.018, 0.08, dark, [x, 0, z], 4, [0, 0, x > 0 ? 0.9 : -0.9]);
  for (const x of [-0.04, 0.04]) b.sphere(0.014, '#3a2a2a', [x, 0.1, 0.21], 0);
  // feathery gills
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) b.cone(0.012, 0.06, '#ff8fa0', [s * 0.07, 0.1 + k * 0.012, 0.13 - k * 0.02], 3, [0, 0, s * (1.2 + k * 0.3)]);
  return b.build();
}

export const MINE_WILD_PROC: Record<string, () => THREE.BufferGeometry> = {
  'proc:bat': batGeometry, 'proc:glowworm': glowwormGeometry, 'proc:salamander': salamanderGeometry,
};
