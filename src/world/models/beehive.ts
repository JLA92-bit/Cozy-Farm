import * as THREE from 'three';
import { geo, PAL } from '../Procedural';

/**
 * 1.8.5+ the Beehive house (a workshop for honey and beeswax candles): a stack of painted hive boxes on a stand, a
 * straw skep beside it, a few flowers and some bees. Chunky and soft like the rest of the farm's own models.
 */
const CREAM = '#f7ecd0', YELLOW = '#f2c14e', YELLOW_DARK = '#d9a02a', STRAW = '#e2b867', STRAW_DARK = '#c8963f', BEE = '#2f2a24';

function bee(b: ReturnType<typeof geo>, x: number, y: number, z: number): void {
  b.sphere(0.06, YELLOW, [x, y, z], 1, [1.2, 0.9, 0.9]);
  b.box(0.035, 0.08, 0.1, BEE, [x, y, z], [0, 0, 0]);
  b.sphere(0.05, '#ffffff', [x - 0.02, y + 0.07, z + 0.03], 1, [1, 0.3, 1.2]);
  b.sphere(0.05, '#ffffff', [x - 0.02, y + 0.07, z - 0.03], 1, [1, 0.3, 1.2]);
}

export const BEEHIVE_PROC: Record<string, () => THREE.BufferGeometry> = {
  beehive: () => {
    const b = geo();
    // grass-and-stone base
    b.cyl(1.02, 1.08, 0.08, '#b9d98a', [0, 0, 0], 16);
    b.cyl(0.78, 0.82, 0.05, '#d9c7a3', [-0.12, 0.08, -0.05], 14);
    // stand
    for (const [x, z] of [[-0.42, -0.28], [0.18, -0.28], [-0.42, 0.24], [0.18, 0.24]]) b.block(0.07, 0.22, 0.07, PAL.woodDark, [x, 0.08, z]);
    b.block(0.78, 0.06, 0.66, PAL.wood, [-0.12, 0.3, -0.02]);
    // three hive boxes, each a little different, with entrance slots
    const cols = [CREAM, '#f3dfa0', CREAM];
    for (let i = 0; i < 3; i++) {
      const y = 0.36 + i * 0.24;
      b.block(0.66, 0.22, 0.56, cols[i], [-0.12, y, -0.02]);
      b.block(0.7, 0.03, 0.6, YELLOW_DARK, [-0.12, y + 0.22, -0.02]);
      b.box(0.22, 0.04, 0.02, BEE, [-0.12, y + 0.07, 0.27]);
    }
    // sloped lid
    b.block(0.78, 0.05, 0.68, YELLOW, [-0.12, 1.08, -0.02]);
    b.cone(0.5, 0.2, YELLOW_DARK, [-0.12, 1.13, -0.02], 4, [0, Math.PI / 4, 0]);
    // a straw skep on the ground
    b.sphere(0.3, STRAW, [0.62, 0.3, 0.25], 1, [1, 0.95, 1]);
    for (const y of [0.16, 0.3, 0.44]) b.torus(0.27 - Math.abs(y - 0.3) * 0.5, 0.025, STRAW_DARK, [0.62, y, 0.25], [Math.PI / 2, 0, 0]);
    b.box(0.12, 0.1, 0.02, BEE, [0.62, 0.18, 0.55]);
    b.sphere(0.05, STRAW_DARK, [0.62, 0.6, 0.25], 1);
    // flowers
    for (const [x, z, c] of [[-0.78, 0.55, '#ff8fb4'], [-0.55, 0.78, '#ffd166'], [0.2, 0.82, '#a97bd8'], [0.95, -0.3, '#ff8fb4']] as const) {
      b.cyl(0.015, 0.015, 0.28, PAL.green, [x, 0.06, z], 5);
      b.sphere(0.07, c, [x, 0.36, z], 1);
      b.sphere(0.035, '#fff3a0', [x, 0.37, z], 1);
    }
    // bees
    bee(b, -0.5, 0.95, 0.4);
    bee(b, 0.3, 0.7, 0.55);
    bee(b, 0.8, 0.5, 0.0);
    return b.build();
  },
};
