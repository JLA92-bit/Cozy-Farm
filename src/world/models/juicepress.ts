import * as THREE from 'three';
import { geo, PAL } from '../Procedural';

/**
 * 1.8.6 the Juice Press (a workshop for fruit juices): a wooden screw press over a trough, a barrel with a tap, a
 * jug and crates of fruit. Chunky and soft like the rest of the farm's own models.
 */
const BARREL = '#b07a45', IRON = '#5d646b', JUICE = '#ff9d3c';

export const JUICEPRESS_PROC: Record<string, () => THREE.BufferGeometry> = {
  juice_press: () => {
    const b = geo();
    b.block(2.0, 0.07, 2.0, '#d9c7a3', [0, 0, 0]);
    // press: base trough, two posts, a beam and a screw with a cross handle
    b.block(0.9, 0.12, 0.7, PAL.woodDark, [-0.2, 0.07, -0.1]);
    b.block(0.74, 0.1, 0.54, JUICE, [-0.2, 0.19, -0.1]);
    b.block(0.1, 1.05, 0.1, PAL.wood, [-0.62, 0.07, -0.1]);
    b.block(0.1, 1.05, 0.1, PAL.wood, [0.22, 0.07, -0.1]);
    b.block(0.95, 0.12, 0.16, PAL.woodDark, [-0.2, 1.0, -0.1]);
    b.cyl(0.05, 0.05, 0.55, IRON, [-0.2, 0.55, -0.1], 8);
    b.cyl(0.26, 0.26, 0.08, PAL.wood, [-0.2, 0.46, -0.1], 12);
    b.box(0.7, 0.05, 0.05, PAL.woodDark, [-0.2, 1.26, -0.1]);
    b.sphere(0.06, PAL.red, [-0.55, 1.26, -0.1], 1);
    b.sphere(0.06, PAL.red, [0.15, 1.26, -0.1], 1);
    // spout into a jug
    b.block(0.14, 0.06, 0.32, IRON, [-0.2, 0.2, 0.25]);
    b.cyl(0.17, 0.2, 0.34, '#f7ecd0', [-0.2, 0.07, 0.62], 10);
    b.cyl(0.15, 0.15, 0.05, JUICE, [-0.2, 0.39, 0.62], 10);
    // barrel with a tap
    b.cyl(0.3, 0.3, 0.55, BARREL, [0.72, 0.07, 0.35], 12);
    for (const y of [0.18, 0.5]) b.torus(0.31, 0.02, IRON, [0.72, y, 0.35], [Math.PI / 2, 0, 0]);
    b.box(0.08, 0.06, 0.14, IRON, [0.72, 0.28, 0.68]);
    // crates of fruit
    b.block(0.5, 0.26, 0.4, PAL.wood, [0.55, 0.07, -0.65]);
    for (const [x, z] of [[0.4, -0.7], [0.58, -0.58], [0.68, -0.75], [0.48, -0.55]] as const) b.sphere(0.09, '#e2533c', [x, 0.36, z], 1);
    b.block(0.5, 0.26, 0.4, PAL.wood, [-0.75, 0.07, -0.72]);
    for (const [x, z] of [[-0.9, -0.78], [-0.7, -0.66], [-0.58, -0.8], [-0.82, -0.62]] as const) b.sphere(0.09, '#ff9d3c', [x, 0.36, z], 1);
    return b.build();
  },
};
