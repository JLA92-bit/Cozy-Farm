import * as THREE from 'three';
import { geo, PAL } from '../Procedural';

/**
 * 1.8.5 crafted helpers made at Bram's forge: a garden sprinkler on a post and an auto-feeder (a little barrel
 * hopper over a trough). Static geometry in the game's own chunky style.
 */
const BRASS = '#d9a441', IRON = '#5d646b', WATER = '#8fd3f0';

export const HELPER_PROC: Record<string, () => THREE.BufferGeometry> = {
  sprinkler: () => {
    const b = geo();
    b.cyl(0.3, 0.34, 0.08, '#d9c7a3', [0, 0, 0], 10);
    b.cyl(0.05, 0.07, 0.62, BRASS, [0, 0.08, 0], 8);
    b.cyl(0.11, 0.09, 0.12, IRON, [0, 0.66, 0], 8);
    // three arms with little nozzles
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      b.box(0.34, 0.04, 0.04, BRASS, [Math.cos(a) * 0.17, 0.76, Math.sin(a) * 0.17], [0, -a, 0]);
      b.sphere(0.045, IRON, [Math.cos(a) * 0.34, 0.76, Math.sin(a) * 0.34], 1);
      b.sphere(0.035, WATER, [Math.cos(a) * 0.46, 0.7, Math.sin(a) * 0.46], 1);
    }
    b.sphere(0.07, BRASS, [0, 0.8, 0], 1);
    return b.build();
  },
  auto_feeder: () => {
    const b = geo();
    // trough
    b.block(1.5, 0.08, 0.8, PAL.woodDark, [0, 0, 0]);
    b.block(1.4, 0.26, 0.1, PAL.wood, [0, 0.08, -0.32]);
    b.block(1.4, 0.26, 0.1, PAL.wood, [0, 0.08, 0.32]);
    b.block(0.1, 0.26, 0.64, PAL.wood, [-0.65, 0.08, 0]);
    b.block(0.1, 0.26, 0.64, PAL.wood, [0.65, 0.08, 0]);
    b.block(1.2, 0.1, 0.5, '#e6c76a', [0, 0.1, 0]);
    // legs and hopper
    for (const x of [-0.5, 0.5]) b.block(0.1, 0.9, 0.1, PAL.woodDark, [x, 0.08, -0.12]);
    b.cyl(0.45, 0.45, 0.5, PAL.wood, [0, 0.98, -0.12], 10);
    b.cone(0.5, 0.3, IRON, [0, 1.48, -0.12], 10);
    for (const y of [1.1, 1.3]) b.torus(0.46, 0.025, IRON, [0, y, -0.12], [Math.PI / 2, 0, 0]);
    b.cone(0.16, 0.34, BRASS, [0, 0.72, -0.12], 8, [Math.PI, 0, 0]);
    b.sphere(0.07, PAL.red, [0, 1.8, -0.12], 1);
    return b.build();
  },
};
