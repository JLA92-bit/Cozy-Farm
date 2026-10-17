import * as THREE from 'three';
import { geo, PAL } from '../Procedural';

/**
 * 1.24 the Tea House (a cream cottage with a green tiled roof, a round window, a veranda with a little table and
 * a teapot sign) and the Florist (a shop front with a striped awning, buckets of flowers and a bench of pots).
 * Chunky and soft like the farm's other own models.
 */
const TEA = '#5f9a3a', CREAM = '#f6ead2', TRIM = '#7a4a2a';

export const TEAHOUSE_PROC: Record<string, () => THREE.BufferGeometry> = {
  tea_house: () => {
    const b = geo();
    b.block(2.9, 0.07, 2.9, '#d9c7a3', [0, 0, 0]);
    // the cottage
    b.block(2.0, 1.25, 1.5, CREAM, [0, 0.07, -0.45]);
    b.block(2.08, 0.1, 1.58, TRIM, [0, 0.07, -0.45]);
    b.prism(2.3, 0.8, 1.8, TEA, [0, 1.32, -0.45]);
    b.box(2.34, 0.06, 0.12, '#3f7a2e', [0, 2.1, -0.45]);
    b.block(0.24, 0.5, 0.24, PAL.stone, [0.6, 1.6, -0.8]);
    // door, round window, shutters
    b.block(0.42, 0.75, 0.06, TRIM, [-0.45, 0.07, 0.31]);
    b.sphere(0.03, PAL.gold, [-0.3, 0.45, 0.35], 0);
    b.cyl(0.22, 0.22, 0.05, TRIM, [0.42, 0.75, 0.31], 14, [Math.PI / 2, 0, 0]);
    b.cyl(0.17, 0.17, 0.06, PAL.glass, [0.42, 0.75, 0.32], 14, [Math.PI / 2, 0, 0]);
    // veranda: decking, posts and a little roof
    b.block(2.2, 0.08, 0.95, PAL.woodLight, [0, 0.07, 0.8]);
    for (const x of [-1.0, 1.0]) b.block(0.08, 0.95, 0.08, TRIM, [x, 0.15, 1.2]);
    b.box(2.3, 0.07, 1.0, TEA, [0, 1.12, 0.78], [-0.25, 0, 0]);
    // a table with a teapot and cups, two stools
    b.cyl(0.26, 0.26, 0.05, PAL.wood, [0.45, 0.55, 0.85], 12);
    b.cyl(0.04, 0.06, 0.4, TRIM, [0.45, 0.15, 0.85], 6);
    b.sphere(0.1, '#ffffff', [0.42, 0.68, 0.85], 1, [1, 0.85, 1]);
    b.cyl(0.015, 0.025, 0.1, '#ffffff', [0.53, 0.68, 0.85], 4, [0, 0, -1.0]);
    for (const x of [0.28, 0.62]) b.cyl(0.04, 0.035, 0.05, '#ffffff', [x, 0.6, 0.98], 8);
    for (const x of [0.05, 0.85]) b.cyl(0.12, 0.12, 0.3, PAL.woodDark, [x, 0.15, 1.0], 8);
    // a teapot sign on a post
    b.block(0.07, 1.0, 0.07, TRIM, [-1.25, 0.07, 1.2]);
    b.box(0.5, 0.06, 0.06, TRIM, [-1.05, 1.02, 1.2]);
    b.sphere(0.15, TEA, [-0.92, 0.85, 1.2], 1, [1, 0.8, 0.5]);
    b.cyl(0.02, 0.03, 0.14, TEA, [-0.78, 0.85, 1.2], 4, [0, 0, -1.0]);
    // tea bushes along the side
    for (const z of [-1.0, -0.55, -0.1]) b.sphere(0.24, z === -0.55 ? '#4f9a3a' : '#3f8a35', [1.25, 0.25, z], 1, [1, 0.8, 1]);
    return b.build();
  },
  florist: () => {
    const b = geo();
    b.block(2.0, 0.07, 2.0, '#d9c7a3', [0, 0, 0]);
    // the shop: pink walls, a white roof, a big window
    b.block(1.6, 1.15, 1.0, '#ffd1dc', [0, 0.07, -0.42]);
    b.prism(1.8, 0.6, 1.25, PAL.white, [0, 1.22, -0.42]);
    b.block(0.36, 0.7, 0.05, TRIM, [-0.5, 0.07, 0.08]);
    b.block(0.7, 0.5, 0.05, '#ffffff', [0.3, 0.4, 0.08]);
    b.block(0.6, 0.4, 0.06, PAL.glass, [0.3, 0.45, 0.09]);
    // striped awning
    for (let i = 0; i < 6; i++) b.box(0.28, 0.04, 0.5, i % 2 ? '#ffffff' : '#e2537a', [-0.7 + i * 0.28, 1.06, 0.28], [0.35, 0, 0]);
    // buckets of flowers in front
    const blooms = ['#d6334a', '#ffd23a', '#a98be6', '#ff8fb4', '#ffffff'];
    [-0.65, -0.25, 0.15, 0.55].forEach((x, k) => {
      b.cyl(0.13, 0.11, 0.24, '#8a9aa6', [x, 0.07, 0.62], 10);
      for (let i = 0; i < 5; i++) { const a = i * 1.25; b.cyl(0.01, 0.01, 0.22, '#4f8a3a', [x + Math.cos(a) * 0.06, 0.28, 0.62 + Math.sin(a) * 0.06], 4); b.sphere(0.05, blooms[(k + i) % blooms.length], [x + Math.cos(a) * 0.07, 0.52, 0.62 + Math.sin(a) * 0.07], 0); }
    });
    // a bench of potted plants by the side
    b.block(0.35, 0.3, 0.9, PAL.wood, [0.85, 0.07, -0.35]);
    for (const z of [-0.65, -0.35, -0.05]) { b.cyl(0.09, 0.07, 0.14, PAL.red, [0.85, 0.37, z], 8); b.sphere(0.1, '#5fae3a', [0.85, 0.56, z], 0); }
    return b.build();
  },
};
