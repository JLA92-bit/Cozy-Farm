import * as THREE from 'three';
import { geo, PAL, rng, type GeoBuilder } from '../Procedural';
import { assets } from '../../core/Assets';

/**
 * "Pretty farm" decor: the cosy campfire and small personal pieces (farm sign, bench, bunting, fairy lights,
 * bird bath, beehive, picnic blanket, mailbox, gnome, sunflowers, planter, pinwheel, rocking chair, pumpkin
 * lanterns). Static geometry only: moving or glowing bits (flames, bees, blades, bulbs, sign text) are added
 * per instance by `DecorFx`.
 *
 * Paintable pieces use one "paint" colour (the `paint` field of their buildings.json entry) for the parts a
 * player can repaint; no other part of the same model shares that hue.
 */
type V3 = [number, number, number];

/** Paint marker colours (keep in sync with `paint` in buildings.json). */
export const MARK = {
  sign: '#d9573f', bench: '#7fb069', bunting: '#e8655a', mailbox: '#4f9fd8', gnome: '#e04a3a',
  blanket: '#e8655a', planter: '#5f9fd0', pinwheel: '#f27ba8', rocker: '#e58a4e',
} as const;

const STONES = ['#bdb8ab', '#a8a397', '#cdc7b8', '#9d998e', '#b3ae9f'];
const BARK = '#8a5528', BARK_DARK = '#6e4220', LOGEND = '#e8bd82';

/** Add a flat-coloured Kenney model (same trick as ProcModels' kit). */
function kit(b: GeoBuilder, id: string, pos: V3, scale = 1, rotY = 0): void {
  const m = assets.getStatic(id);
  if (!m || m.material !== assets.vertexMaterial) return;
  const g = m.geometry.clone();
  g.deleteAttribute('uv');
  b.geometry(g, null, pos, [0, rotY, 0], [scale, scale, scale]);
}

const Y = new THREE.Vector3(0, 1, 0);
/** A log from `a` to `b` with pale cut ends. */
function log(bld: GeoBuilder, a: THREE.Vector3, b: THREE.Vector3, r: number, bark = BARK): void {
  const dir = b.clone().sub(a);
  const len = dir.length();
  dir.normalize();
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, dir));
  const rot: V3 = [e.x, e.y, e.z];
  const mid = a.clone().add(b).multiplyScalar(0.5);
  bld.geometry(new THREE.CylinderGeometry(r, r * 1.05, len, 7), bark, [mid.x, mid.y, mid.z], rot);
  for (const end of [a, b]) {
    const p = end.clone().addScaledVector(dir, end === a ? 0.004 : -0.004);
    bld.geometry(new THREE.CylinderGeometry(r * 0.82, r * 0.82, 0.014, 7), LOGEND, [p.x, p.y, p.z], rot);
  }
}

/** Rounded pebble. */
function stone(b: GeoBuilder, r: number, color: string, pos: V3, yaw: number, scale: V3 = [1.25, 0.78, 1]): void {
  b.geometry(new THREE.IcosahedronGeometry(r, 1), color, pos, [0, yaw, 0], scale);
}

/** Thin flat triangle in the x-y plane, pointing down from y=0. */
function pennant(w: number, h: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, -h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false });
  g.translate(0, 0, -0.006);
  return g;
}

/** Two posts with a gently sagging line between them; returns points along the line. */
function postsAndLine(b: GeoBuilder, half: number, top: number, sag: number, line: string, n: number): THREE.Vector3[] {
  for (const x of [-half, half]) {
    b.block(0.07, top + 0.05, 0.07, PAL.woodDark, [x, 0, 0]);
    b.sphere(0.05, PAL.woodLight, [x, top + 0.07, 0], 0);
    b.cyl(0.07, 0.09, 0.05, PAL.woodDark, [x, 0, 0], 6);
  }
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const x = -half + (i / n) * half * 2;
    pts.push(new THREE.Vector3(x, top - sag * (1 - (x / half) ** 2), 0));
  }
  for (let i = 0; i < n; i++) {
    const a = pts[i], c = pts[i + 1];
    const mid = a.clone().add(c).multiplyScalar(0.5);
    const ang = Math.atan2(c.y - a.y, c.x - a.x);
    b.box(a.distanceTo(c) + 0.004, 0.014, 0.014, line, [mid.x, mid.y, mid.z], [0, 0, ang]);
  }
  return pts;
}

/** Point on the sagging line at x. */
const lineY = (x: number, half: number, top: number, sag: number) => top - sag * (1 - (x / half) ** 2);

export const DECOR_PROC: Record<string, () => THREE.BufferGeometry> = {
  // ------------------------------------------------------------------ cosy campfire
  campfire_cosy: () => {
    const b = geo();
    const r = rng(21);
    // soft ash bed with darker charcoal in the middle
    b.cyl(0.31, 0.33, 0.025, '#8d7c6c', [0, 0, 0], 14);
    b.cyl(0.21, 0.23, 0.032, '#5a4a40', [0, 0, 0], 12);
    // a neat ring of rounded, slightly varied stones
    const N = 11;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + (r() - 0.5) * 0.1;
      const s = 0.072 + r() * 0.02;
      const rad = 0.36 + (r() - 0.5) * 0.02;
      stone(b, s, STONES[Math.floor(r() * STONES.length)], [Math.cos(a) * rad, s * 0.5, Math.sin(a) * rad], -a, [1.3, 0.85 + r() * 0.15, 1.0]);
    }
    // two logs crossed flat, then a little teepee of four leaning in
    log(b, new THREE.Vector3(-0.2, 0.05, -0.12), new THREE.Vector3(0.2, 0.05, 0.12), 0.042, BARK_DARK);
    log(b, new THREE.Vector3(-0.2, 0.09, 0.12), new THREE.Vector3(0.2, 0.09, -0.12), 0.042);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const foot = new THREE.Vector3(Math.cos(a) * 0.2, 0.03, Math.sin(a) * 0.2);
      const tip = new THREE.Vector3(Math.cos(a) * 0.035, 0.27, Math.sin(a) * 0.035);
      log(b, foot, tip, 0.032, i % 2 ? BARK : '#9a6232');
    }
    return b.build();
  },

  // ------------------------------------------------------------------ farm sign (text added by DecorFx)
  farm_sign: () => {
    const b = geo();
    for (const x of [-0.4, 0.4]) {
      b.block(0.08, 0.84, 0.08, PAL.woodDark, [x, 0, -0.01]);
      b.cyl(0.07, 0.09, 0.05, PAL.woodDark, [x, 0, -0.01], 6);
    }
    // the board: two planks with a painted trim and a tiny roof
    b.block(0.96, 0.4, 0.06, PAL.woodLight, [0, 0.36, 0.035]);
    b.box(0.96, 0.012, 0.062, '#c98a4b', [0, 0.56, 0.035]);
    b.box(1.02, 0.05, 0.08, MARK.sign, [0, 0.36, 0.035]);
    b.box(1.02, 0.05, 0.08, MARK.sign, [0, 0.76, 0.035]);
    b.box(0.05, 0.42, 0.08, MARK.sign, [-0.5, 0.56, 0.035]);
    b.box(0.05, 0.42, 0.08, MARK.sign, [0.5, 0.56, 0.035]);
    b.prism(1.12, 0.12, 0.2, '#b8432f', [0, 0.785, 0.02]);
    // flowers at the foot of the posts
    kit(b, 'nat/flower_yellow_a', [-0.4, 0, 0.12], 1.4);
    kit(b, 'nat/flower_purple_a', [0.4, 0, 0.12], 1.4, 1.2);
    kit(b, 'nat/grass_large', [0.25, 0, 0.1], 0.9);
    return b.build();
  },

  // ------------------------------------------------------------------ garden bench
  garden_bench: () => {
    const b = geo();
    const iron = '#4a4540';
    for (const x of [-0.44, 0.44]) {
      b.block(0.05, 0.3, 0.05, iron, [x, 0, 0.14]);
      b.block(0.05, 0.62, 0.05, iron, [x, 0, -0.14]);
      b.box(0.05, 0.04, 0.34, iron, [x, 0.46, 0.0]);
      b.sphere(0.035, iron, [x, 0.47, 0.17], 0);
      b.box(0.05, 0.04, 0.3, iron, [x, 0.12, 0]);
    }
    for (let i = 0; i < 3; i++) b.box(1.0, 0.04, 0.09, MARK.bench, [0, 0.31, -0.1 + i * 0.1]);
    for (let i = 0; i < 2; i++) b.box(1.0, 0.07, 0.035, MARK.bench, [0, 0.45 + i * 0.12, -0.16], [-0.12, 0, 0]);
    // a cushion and a sleepy cat-shaped cushion would be too much: just a little pot of flowers
    b.cyl(0.07, 0.055, 0.1, '#d9774a', [0.33, 0.33, 0.0], 8);
    kit(b, 'nat/flower_yellow_a', [0.33, 0.42, 0.0], 0.8);
    return b.build();
  },

  // ------------------------------------------------------------------ bunting
  bunting: () => {
    const b = geo();
    const half = 0.44, top = 0.86, sag = 0.16;
    postsAndLine(b, half, top, sag, '#f3e6c8', 10);
    const cols = [MARK.bunting, '#fbf1dc', '#f6c84a'];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const x = -half + ((i + 0.75) / (n + 0.5)) * half * 2;
      const y = lineY(x, half, top, sag);
      const slope = Math.atan(sag * 2 * x / (half * half));
      b.geometry(pennant(0.1, 0.15), cols[i % 3], [x, y - 0.005, 0], [0.05, 0, slope]);
    }
    return b.build();
  },

  // ------------------------------------------------------------------ fairy lights (bulbs added by DecorFx)
  fairy_lights: () => {
    const b = geo();
    postsAndLine(b, 0.44, 0.9, 0.18, '#4b4038', 12);
    // little lantern caps on the posts
    for (const x of [-0.44, 0.44]) b.cyl(0.05, 0.05, 0.03, '#4b4038', [x, 0.9, 0], 6);
    return b.build();
  },

  // ------------------------------------------------------------------ bird bath
  bird_bath: () => {
    const b = geo();
    const st = '#cfc8b8', st2 = '#b9b2a2';
    b.cyl(0.2, 0.23, 0.07, st2, [0, 0, 0], 10);
    b.cyl(0.14, 0.18, 0.06, st, [0, 0.07, 0], 10);
    b.cyl(0.075, 0.09, 0.3, st, [0, 0.13, 0], 10);
    b.cyl(0.12, 0.08, 0.06, st2, [0, 0.42, 0], 10);
    b.cyl(0.32, 0.16, 0.1, st, [0, 0.47, 0], 12);
    b.torus(0.31, 0.025, st2, [0, 0.57, 0], [Math.PI / 2, 0, 0]);
    b.cyl(0.285, 0.285, 0.02, '#6ccbea', [0, 0.545, 0], 12);
    b.cyl(0.12, 0.12, 0.005, '#a8e6f7', [0.06, 0.566, -0.05], 10);
    // a little robin on the rim
    const bx = 0.2, bz = 0.16, by = 0.6;
    b.sphere(0.055, '#8a6a4a', [bx, by + 0.03, bz], 1, [1.25, 0.95, 0.95]);
    b.sphere(0.04, '#ef7b45', [bx + 0.035, by + 0.02, bz + 0.02], 1);
    b.sphere(0.038, '#8a6a4a', [bx + 0.05, by + 0.08, bz + 0.015], 1);
    b.cone(0.012, 0.035, '#f2b33a', [bx + 0.09, by + 0.075, bz + 0.015], 4, [0, 0, -Math.PI / 2]);
    b.sphere(0.008, PAL.black, [bx + 0.075, by + 0.09, bz + 0.045], 0);
    b.box(0.06, 0.012, 0.035, '#6a4f36', [bx - 0.07, by + 0.05, bz], [0, 0, 0.5]);
    // pebbles and a tuft at the foot
    stone(b, 0.05, '#a8a397', [-0.22, 0.02, 0.14], 0.4);
    stone(b, 0.04, '#bdb8ab', [-0.15, 0.015, 0.22], 1.1);
    kit(b, 'nat/grass_large', [0.2, 0, -0.18], 0.8);
    return b.build();
  },

  // ------------------------------------------------------------------ beehive (bees added by DecorFx)
  beehive: () => {
    const b = geo();
    // stump stand
    b.cyl(0.24, 0.27, 0.2, '#9a6232', [0, 0, 0], 9);
    b.cyl(0.22, 0.22, 0.012, LOGEND, [0, 0.2, 0], 9);
    // straw skep: stacked rings with a rounded top
    const rings: [number, number][] = [[0.24, 0.09], [0.235, 0.085], [0.215, 0.08], [0.18, 0.075], [0.13, 0.07]];
    let y = 0.21;
    rings.forEach(([rad, h], i) => {
      b.cyl(rad * 0.94, rad, h, i % 2 ? '#e3b04a' : '#d39a35', [0, y, 0], 12);
      b.torus(rad * 0.97, 0.022, i % 2 ? '#d39a35' : '#e8bb55', [0, y + 0.01, 0], [Math.PI / 2, 0, 0]);
      y += h;
    });
    b.sphere(0.13, '#e3b04a', [0, y - 0.02, 0], 1, [1, 0.6, 1]);
    // entrance
    b.box(0.09, 0.05, 0.03, '#3d2a18', [0, 0.24, 0.23]);
    b.box(0.13, 0.015, 0.05, '#c98a4b', [0, 0.215, 0.25]);
    // a honey pot and flowers for the bees
    b.cyl(0.07, 0.06, 0.1, '#f2a530', [0.3, 0, 0.22], 8);
    b.cyl(0.075, 0.075, 0.025, '#fff1c8', [0.3, 0.1, 0.22], 8);
    kit(b, 'nat/flower_yellow_a', [-0.3, 0, 0.25], 1.5);
    kit(b, 'nat/flower_purple_a', [-0.22, 0, 0.34], 1.3, 2);
    kit(b, 'nat/flower_red_a', [0.36, 0, -0.2], 1.3, 1);
    return b.build();
  },

  // ------------------------------------------------------------------ picnic blanket
  picnic_blanket: () => {
    const b = geo();
    const n = 5, s = 0.9 / n;
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) {
      b.block(s, 0.02, s, (i + k) % 2 ? '#fbf1dc' : MARK.blanket, [-0.45 + s * (i + 0.5), 0.004, -0.45 + s * (k + 0.5)]);
    }
    // wicker basket with a handle and a cloth peeking out
    b.block(0.3, 0.16, 0.2, '#c98a4b', [-0.17, 0.02, -0.15]);
    for (let i = 0; i < 3; i++) b.box(0.305, 0.012, 0.205, '#a8703a', [-0.17, 0.06 + i * 0.045, -0.15]);
    b.block(0.32, 0.03, 0.11, '#b07a42', [-0.17, 0.18, -0.2]);
    b.torus(0.12, 0.015, '#a8703a', [-0.17, 0.2, -0.15], [0, 0, 0]);
    b.box(0.12, 0.015, 0.1, '#fbf1dc', [-0.1, 0.19, -0.1], [0.3, 0.2, 0]);
    // plate with a sandwich, cups, lemonade and apples
    b.cyl(0.1, 0.09, 0.015, '#fffaf0', [0.15, 0.024, 0.13], 12);
    b.block(0.11, 0.025, 0.08, '#f2d08a', [0.15, 0.04, 0.13], [0, 0.4, 0]);
    b.block(0.11, 0.012, 0.08, '#7fbf4f', [0.15, 0.064, 0.13], [0, 0.4, 0]);
    b.block(0.11, 0.025, 0.08, '#f2d08a', [0.15, 0.075, 0.13], [0, 0.4, 0]);
    b.cyl(0.045, 0.04, 0.2, '#fff4b0', [0.25, 0.024, -0.18], 8);
    b.cyl(0.03, 0.03, 0.04, '#f6d04d', [0.25, 0.22, -0.18], 8);
    for (const [x, z] of [[0.02, 0.28], [-0.25, 0.2]]) {
      b.cyl(0.035, 0.03, 0.07, '#ffffff', [x, 0.024, z], 8);
      b.cyl(0.028, 0.028, 0.005, '#ffd84a', [x, 0.088, z], 8);
    }
    b.sphere(0.045, '#8fd14f', [0.33, 0.065, 0.31], 1);
    b.sphere(0.04, '#a5dc5c', [0.27, 0.06, 0.36], 1);
    return b.build();
  },

  // ------------------------------------------------------------------ mailbox
  mailbox: () => {
    const b = geo();
    b.block(0.07, 0.62, 0.07, PAL.woodDark, [0, 0, 0]);
    b.block(0.14, 0.03, 0.2, PAL.woodDark, [0, 0.6, 0]);
    b.block(0.22, 0.14, 0.38, MARK.mailbox, [0, 0.63, 0]);
    b.cyl(0.11, 0.11, 0.38, MARK.mailbox, [0, 0.77, 0], 10, [Math.PI / 2, 0, 0]);
    // door with a little handle
    b.box(0.2, 0.2, 0.012, '#3f86c4', [0, 0.73, 0.192]);
    b.sphere(0.018, PAL.gold, [0, 0.78, 0.2], 0);
    // red flag up
    b.box(0.015, 0.22, 0.02, '#6a6a6a', [0.12, 0.8, -0.06]);
    b.box(0.012, 0.07, 0.1, PAL.red, [0.125, 0.88, -0.02]);
    // house number plate and flowers
    b.box(0.006, 0.07, 0.12, '#fff6e8', [-0.112, 0.69, 0.02]);
    kit(b, 'nat/flower_yellow_a', [0.1, 0, 0.12], 1.3);
    kit(b, 'nat/flower_purple_a', [-0.1, 0, 0.1], 1.2, 2);
    kit(b, 'nat/grass_large', [0.04, 0, -0.1], 0.8);
    return b.build();
  },

  // ------------------------------------------------------------------ garden gnome
  garden_gnome: () => {
    const b = geo();
    const coat = '#3f86d8';
    // little stone base
    b.cyl(0.2, 0.22, 0.05, '#b3ae9f', [0, 0, 0], 10);
    // boots, body and belt
    b.sphere(0.06, '#4a3424', [-0.06, 0.08, 0.04], 1, [1, 0.7, 1.4]);
    b.sphere(0.06, '#4a3424', [0.06, 0.08, 0.04], 1, [1, 0.7, 1.4]);
    b.cyl(0.11, 0.16, 0.26, coat, [0, 0.07, 0], 10);
    b.cyl(0.125, 0.125, 0.04, '#5a3a24', [0, 0.2, 0], 10);
    b.box(0.05, 0.04, 0.02, PAL.gold, [0, 0.22, 0.125]);
    // arms
    b.sphere(0.045, coat, [-0.13, 0.26, 0.02], 1, [0.9, 1.4, 0.9]);
    b.sphere(0.045, coat, [0.13, 0.26, 0.02], 1, [0.9, 1.4, 0.9]);
    b.sphere(0.03, PAL.skin, [-0.14, 0.2, 0.05], 0);
    b.sphere(0.03, PAL.skin, [0.14, 0.2, 0.05], 0);
    // head, beard, nose and the tall painted hat
    b.sphere(0.1, PAL.skin, [0, 0.4, 0], 1);
    b.cone(0.11, 0.2, '#fbf7ee', [0, 0.38, 0.05], 8, [Math.PI, 0, 0]);
    b.sphere(0.075, '#fbf7ee', [0, 0.33, 0.06], 1, [1.2, 0.9, 0.8]);
    b.sphere(0.035, '#f29a8a', [0, 0.41, 0.1], 1);
    b.sphere(0.012, PAL.black, [-0.04, 0.445, 0.085], 0);
    b.sphere(0.012, PAL.black, [0.04, 0.445, 0.085], 0);
    b.cyl(0.115, 0.115, 0.04, MARK.gnome, [0, 0.45, 0], 10);
    b.cone(0.11, 0.3, MARK.gnome, [0, 0.47, -0.02], 10, [-0.15, 0, 0]);
    b.sphere(0.025, '#c93a2c', [0, 0.75, -0.07], 0);
    // a mushroom friend
    b.cyl(0.02, 0.025, 0.06, '#fbf7ee', [0.15, 0.04, 0.12], 6);
    b.sphere(0.045, '#e04a3a', [0.15, 0.1, 0.12], 1, [1, 0.6, 1]);
    return b.build();
  },

  // ------------------------------------------------------------------ sunflower patch
  sunflower_patch: () => {
    const b = geo();
    const r = rng(77);
    b.cyl(0.36, 0.42, 0.06, '#8a5530', [0, 0, 0], 12);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      stone(b, 0.05, STONES[i % STONES.length], [Math.cos(a) * 0.4, 0.03, Math.sin(a) * 0.4], a, [1.3, 0.8, 1]);
    }
    const spots: [number, number, number][] = [[-0.14, -0.12, 0.98], [0.15, -0.08, 0.82], [-0.05, 0.16, 0.7], [0.2, 0.2, 0.58]];
    for (const [x, z, hgt] of spots) {
      b.cyl(0.018, 0.024, hgt, '#4f9a32', [x, 0.05, z], 6);
      for (const side of [-1, 1]) {
        b.sphere(0.06, '#5fb83c', [x + side * 0.06, 0.05 + hgt * (0.35 + r() * 0.2), z], 0, [1.4, 0.25, 0.8]);
      }
      // the head faces the front and tips up a little
      const head = geo();
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        head.sphere(0.04, k % 2 ? '#ffcf3f' : '#ffb820', [Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0], 0, [1.5, 0.75, 0.35]);
      }
      head.cyl(0.07, 0.07, 0.03, '#6b3d1e', [0, 0, 0.01], 10, [Math.PI / 2, 0, 0]);
      head.sphere(0.05, '#7a4a26', [0, 0, 0.02], 1, [1, 1, 0.35]);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2 + 0.26;
        head.sphere(0.04, k % 2 ? '#ffd84a' : '#ffc130', [Math.cos(a) * 0.09, Math.sin(a) * 0.09, -0.015], 0, [1.5, 0.75, 0.35]);
      }
      b.geometry(head.build(), null, [x, 0.05 + hgt, z + 0.02], [-0.35, (r() - 0.5) * 0.6, 0]);
    }
    return b.build();
  },

  // ------------------------------------------------------------------ planter box
  planter_box: () => {
    const b = geo();
    b.block(0.86, 0.3, 0.36, MARK.planter, [0, 0.04, 0]);
    // plank lines, rim and feet
    for (const y of [0.13, 0.23]) b.box(0.865, 0.012, 0.365, '#4e88b8', [0, y, 0]);
    b.box(0.92, 0.04, 0.42, '#fbf1dc', [0, 0.34, 0]);
    for (const x of [-0.38, 0.38]) for (const z of [-0.14, 0.14]) b.block(0.06, 0.05, 0.06, PAL.woodDark, [x, 0, z]);
    b.block(0.8, 0.03, 0.3, PAL.soil, [0, 0.33, 0]);
    const flowers = ['nat/flower_red_a', 'nat/flower_yellow_a', 'nat/flower_purple_a'];
    for (let i = 0; i < 6; i++) {
      const x = -0.3 + i * 0.12, z = i % 2 ? 0.06 : -0.06;
      kit(b, flowers[i % 3], [x, 0.35, z], 1.35, i * 1.3);
    }
    kit(b, 'nat/grass_large', [0.36, 0.35, 0], 0.7);
    return b.build();
  },

  // ------------------------------------------------------------------ pinwheel (blades added by DecorFx)
  pinwheel: () => {
    const b = geo();
    b.cyl(0.018, 0.022, 0.86, '#fff6e8', [0, 0, 0], 6);
    for (let i = 0; i < 4; i++) b.box(0.04, 0.012, 0.042, '#f6c84a', [0, 0.2 + i * 0.2, 0], [0, 0, 0.6]);
    b.cyl(0.05, 0.07, 0.04, '#7fb069', [0, 0, 0], 8);
    kit(b, 'nat/grass_large', [0.06, 0, 0.04], 0.8);
    kit(b, 'nat/flower_yellow_a', [-0.07, 0, 0.05], 1.1);
    return b.build();
  },

  // ------------------------------------------------------------------ rocking chair
  rocking_chair: () => {
    const b = geo();
    // two curved rockers
    for (const x of [-0.22, 0.22]) {
      const arc = new THREE.TorusGeometry(0.9, 0.022, 5, 12, 0.7);
      b.geometry(arc, MARK.rocker, [x, 0.92, 0.02], [0, Math.PI / 2, -Math.PI / 2 - 0.35]);
    }
    // legs, seat, arms and a tall slatted back
    for (const x of [-0.22, 0.22]) for (const z of [-0.17, 0.17]) b.block(0.045, 0.3, 0.045, MARK.rocker, [x, 0.03, z]);
    b.block(0.5, 0.05, 0.42, MARK.rocker, [0, 0.31, 0]);
    for (const x of [-0.24, 0.24]) {
      b.box(0.05, 0.035, 0.42, MARK.rocker, [x, 0.53, 0.02]);
      b.block(0.035, 0.2, 0.035, MARK.rocker, [x, 0.34, 0.19]);
    }
    for (const x of [-0.22, 0.22]) b.box(0.05, 0.62, 0.05, MARK.rocker, [x, 0.62, -0.2], [-0.15, 0, 0]);
    for (let i = 0; i < 4; i++) b.box(0.045, 0.5, 0.025, MARK.rocker, [-0.12 + i * 0.08, 0.62, -0.205], [-0.15, 0, 0]);
    b.box(0.5, 0.06, 0.05, MARK.rocker, [0, 0.9, -0.245], [-0.15, 0, 0]);
    // gingham cushion and a knitted blanket over the arm
    b.block(0.42, 0.05, 0.36, '#fbf1dc', [0, 0.36, 0.01]);
    for (let i = 0; i < 3; i++) b.box(0.43, 0.052, 0.035, '#f2b8a8', [0, 0.385, -0.1 + i * 0.1]);
    b.box(0.07, 0.24, 0.2, '#9fc7e8', [0.27, 0.45, 0.05]);
    return b.build();
  },

  // ------------------------------------------------------------------ pumpkin lanterns (faces lit by DecorFx)
  pumpkin_lanterns: () => {
    const b = geo();
    b.block(0.62, 0.08, 0.38, PAL.hay, [-0.05, 0, -0.08], [0, 0.15, 0]);
    for (let i = 0; i < 5; i++) b.box(0.02, 0.012, 0.1, PAL.hayDark, [-0.3 + i * 0.12, 0.083, -0.08 + (i % 2) * 0.1], [0, i, 0]);
    for (const p of PUMPKINS) {
      const [x, y, z, s] = p;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        b.sphere(0.13 * s, k % 2 ? '#ff8c2a' : '#f47a1e', [x + Math.cos(a) * 0.06 * s, y + 0.11 * s, z + Math.sin(a) * 0.06 * s], 1, [0.8, 0.85, 0.8]);
      }
      b.sphere(0.15 * s, '#ff9433', [x, y + 0.11 * s, z], 1, [1.05, 0.78, 1.05]);
      b.cyl(0.018 * s, 0.03 * s, 0.07 * s, '#5a7a2a', [x, y + 0.21 * s, z], 5, [0.2, 0, 0.15]);
      b.sphere(0.03 * s, '#6fae3a', [x + 0.04 * s, y + 0.22 * s, z], 0, [1.6, 0.4, 1]);
    }
    return b.build();
  },
};

/** Pumpkins of the lantern piece: [x, y, z, scale]; their faces look along +z. */
export const PUMPKINS: [number, number, number, number][] = [[-0.12, 0.08, -0.05, 1.25], [0.2, 0.0, 0.12, 0.95], [-0.32, 0.0, 0.2, 0.8]];
