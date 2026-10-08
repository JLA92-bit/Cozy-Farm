import * as THREE from 'three';
import { geo, PAL } from '../Procedural';

/**
 * 1.8.6 the Pottery Kiln (a workshop for pots, vases and glazed tiles): a brick dome kiln with a chimney and a
 * glowing firing door, a potter's wheel and shelves of finished pots. Chunky and soft like the farm's own models.
 */
const BRICK = '#c4573d', BRICK_DARK = '#a8452e', CLAY = '#d98e5c', GLAZE = '#3f8fd9', GLAZE2 = '#f2c14e', STONE = '#9d978a';

export const KILN_PROC: Record<string, () => THREE.BufferGeometry> = {
  pottery_kiln: () => {
    const b = geo();
    b.block(2.0, 0.07, 2.0, '#d9c7a3', [0, 0, 0]);
    // the dome kiln: a round brick base, a dome made of two spheres, a chimney and rings of darker brick
    b.cyl(0.62, 0.68, 0.45, BRICK, [-0.35, 0.07, -0.3], 14);
    b.sphere(0.62, BRICK, [-0.35, 0.52, -0.3], 1, [1, 0.8, 1]);
    for (const y of [0.22, 0.38]) b.torus(0.66, 0.025, BRICK_DARK, [-0.35, y, -0.3], [Math.PI / 2, 0, 0]);
    b.cyl(0.13, 0.15, 0.55, STONE, [-0.55, 0.9, -0.5], 8);
    b.cyl(0.17, 0.17, 0.05, '#6c665a', [-0.55, 1.45, -0.5], 8);
    // firing door with a glow
    b.block(0.38, 0.34, 0.14, '#3b2a22', [-0.2, 0.1, 0.22]);
    b.block(0.26, 0.22, 0.05, '#ffb347', [-0.2, 0.16, 0.3]);
    b.block(0.14, 0.12, 0.04, '#fff0a0', [-0.2, 0.2, 0.33]);
    // wood stack
    for (let i = 0; i < 4; i++) b.cyl(0.05, 0.05, 0.4, PAL.wood, [0.2 + i * 0.1, 0.1 + (i % 2) * 0.08, 0.45], 6, [0, 0, Math.PI / 2]);
    // a potter's wheel with a pot in progress
    b.cyl(0.3, 0.3, 0.07, STONE, [0.62, 0.22, -0.55], 12);
    b.block(0.1, 0.22, 0.1, PAL.woodDark, [0.62, 0.07, -0.55]);
    b.cyl(0.11, 0.12, 0.22, CLAY, [0.62, 0.29, -0.55], 10);
    // shelf of finished pots
    b.block(0.9, 0.05, 0.3, PAL.wood, [0.5, 0.42, 0.62]);
    b.block(0.06, 0.4, 0.06, PAL.woodDark, [0.1, 0.07, 0.62]);
    b.block(0.06, 0.4, 0.06, PAL.woodDark, [0.9, 0.07, 0.62]);
    b.cyl(0.1, 0.13, 0.22, CLAY, [0.25, 0.47, 0.62], 10);
    b.cyl(0.08, 0.14, 0.3, GLAZE, [0.55, 0.47, 0.62], 10);
    b.sphere(0.12, GLAZE2, [0.8, 0.6, 0.62], 1, [1, 1.1, 1]);
    // big pots on the ground
    b.cyl(0.16, 0.2, 0.34, CLAY, [0.82, 0.07, 0.1], 10);
    b.cyl(0.18, 0.18, 0.04, '#b4713f', [0.82, 0.41, 0.1], 10);
    b.cyl(0.13, 0.17, 0.28, GLAZE, [0.55, 0.07, 0.2], 10);
    return b.build();
  },
};
