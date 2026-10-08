import * as THREE from 'three';
import { geo, PAL } from '../Procedural';

/**
 * 1.8.5 Village Festival: the golden Village Hero statue (also a keepsake decoration for the farm) and the strings
 * of bunting that hang round the village square once all six rooms are rebuilt.
 */
const GOLD = '#f2c14e', GOLD_DARK = '#c8962a', GOLD_LIGHT = '#ffe08a', STONE = '#d9c7a3', STONE_DARK = '#b3a78d';

export function heroStatueGeometry(): THREE.BufferGeometry {
  const b = geo();
  // stone steps and plinth
  b.cyl(0.62, 0.7, 0.1, STONE_DARK, [0, 0, 0], 14);
  b.cyl(0.46, 0.52, 0.16, STONE, [0, 0.1, 0], 14);
  b.block(0.5, 0.34, 0.5, STONE, [0, 0.26, 0]);
  b.block(0.58, 0.05, 0.58, STONE_DARK, [0, 0.6, 0]);
  b.box(0.3, 0.1, 0.02, GOLD_DARK, [0, 0.4, 0.26]);
  // a golden farmer holding a little wheat sheaf up high
  b.cyl(0.1, 0.12, 0.36, GOLD, [0, 0.65, 0], 8);
  b.sphere(0.13, GOLD, [0, 1.12, 0], 1);
  b.cyl(0.17, 0.17, 0.03, GOLD_DARK, [0, 1.2, 0], 10);
  b.cyl(0.1, 0.12, 0.08, GOLD_DARK, [0, 1.23, 0], 10);
  b.box(0.07, 0.34, 0.07, GOLD, [-0.15, 0.8, 0], [0, 0, 0.35]);
  b.box(0.07, 0.4, 0.07, GOLD, [0.17, 1.0, 0], [0, 0, -0.45]);
  // sheaf
  b.cyl(0.015, 0.015, 0.35, GOLD_LIGHT, [0.3, 1.2, 0], 6, [0, 0, -0.1]);
  for (let i = 0; i < 4; i++) b.sphere(0.04, GOLD_LIGHT, [0.31 + i * 0.012, 1.42 + i * 0.07, 0], 1, [0.7, 1.2, 0.7]);
  // a star above
  b.sphere(0.07, GOLD_LIGHT, [-0.1, 1.5, 0], 1);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.cone(0.035, 0.12, GOLD_LIGHT, [-0.1 + Math.sin(a) * 0.1, 1.5 + Math.cos(a) * 0.1, 0], 4, [0, 0, -a]);
  }
  return b.build();
}

/** The mastery plaque: a gold-framed board with a star on a little stone post. */
export function masteryPlaqueGeometry(): THREE.BufferGeometry {
  const b = geo();
  b.cyl(0.4, 0.46, 0.08, STONE_DARK, [0, 0, 0], 12);
  b.block(0.14, 0.7, 0.14, STONE, [0, 0.08, 0]);
  b.block(0.78, 0.5, 0.08, GOLD_DARK, [0, 0.74, 0]);
  b.block(0.68, 0.4, 0.1, '#fff1c9', [0, 0.79, 0.01]);
  b.sphere(0.1, GOLD, [0, 0.99, 0.08], 1, [1, 1, 0.5]);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.cone(0.05, 0.14, GOLD, [Math.sin(a) * 0.13, 0.99 + Math.cos(a) * 0.13, 0.08], 4, [Math.PI / 2, 0, -a]);
  }
  b.block(0.46, 0.03, 0.02, GOLD_DARK, [0, 0.66, 0.1]);
  b.block(0.3, 0.03, 0.02, GOLD_DARK, [0, 0.6, 0.1]);
  return b.build();
}

const FLAGS = ['#ff6b6b', '#ffd166', '#6cc644', '#3fa9f5', '#ff8fb4', '#a97bd8'];

/** Bunting between two points: a sagging string with little pennants, in island-space coordinates. */
export function buntingGeometry(ax: number, az: number, bx: number, bz: number, y: number, sag: number, n: number, seed = 0): THREE.BufferGeometry {
  const b = geo();
  const point = (t: number): [number, number, number] => [ax + (bx - ax) * t, y - Math.sin(t * Math.PI) * sag, az + (bz - az) * t];
  const yaw = Math.atan2(bx - ax, bz - az);
  const steps = n * 2;
  for (let i = 0; i < steps; i++) {
    const [x0, y0, z0] = point(i / steps), [x1, y1, z1] = point((i + 1) / steps);
    const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    b.box(0.025, 0.025, len, PAL.woodDark, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [Math.atan2(y0 - y1, Math.hypot(x1 - x0, z1 - z0)), yaw, 0]);
  }
  for (let i = 0; i < n; i++) {
    const [x, py, z] = point((i + 0.5) / n);
    b.cone(0.13, 0.3, FLAGS[(i + seed) % FLAGS.length], [x, py - 0.17, z], 3, [Math.PI, yaw, 0]);
  }
  return b.build();
}

export const FESTIVAL_PROC: Record<string, () => THREE.BufferGeometry> = { hero_statue: heroStatueGeometry, mastery_plaque: masteryPlaqueGeometry };
