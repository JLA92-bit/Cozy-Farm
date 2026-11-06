import * as THREE from 'three';
import { geo, PAL } from '../Procedural';

/**
 * 1.46 Bean and Spice: the Chocolatier (a chocolate-brown shop with a cream awning, a window of boxes and a giant
 * chocolate bar sign) and the Coffee Roastery (a brick shed with a tall flue, a copper drum roaster, sacks of beans
 * and a cup on a post). Chunky and soft like the farm's other own models.
 */
const COCOA = '#6a3f26', COCOA_DARK = '#4a2a18', CREAM = '#f6ead2', BRICK = '#a8583f', BRICK_DARK = '#8a4530', COPPER = '#c97a3f', SACK = '#c9ae7f';

export const BEANSPICE_PROC: Record<string, () => THREE.BufferGeometry> = {
  chocolatier: () => {
    const b = geo();
    b.block(1.95, 0.07, 1.95, '#d9c7a3', [0, 0, 0]);
    // the shop
    b.block(1.6, 1.15, 1.05, COCOA, [0, 0.07, -0.4]);
    b.prism(1.8, 0.6, 1.3, COCOA_DARK, [0, 1.22, -0.4]);
    b.block(0.36, 0.72, 0.05, CREAM, [-0.5, 0.07, 0.14]);
    b.sphere(0.03, PAL.gold, [-0.38, 0.4, 0.18], 0);
    // the window with boxes of chocolates
    b.block(0.74, 0.5, 0.05, CREAM, [0.3, 0.4, 0.14]);
    b.block(0.64, 0.4, 0.06, PAL.glass, [0.3, 0.45, 0.15]);
    for (const [x, c] of [[0.1, '#d6334a'], [0.3, '#e8a33a'], [0.5, '#7a3a8a']] as const) b.block(0.15, 0.1, 0.04, c, [x, 0.47, 0.18]);
    // a cream and brown striped awning
    for (let i = 0; i < 6; i++) b.box(0.28, 0.04, 0.5, i % 2 ? CREAM : '#8a5a33', [-0.7 + i * 0.28, 1.06, 0.34], [0.35, 0, 0]);
    // a chocolate bar sign on the roof
    b.block(0.72, 0.42, 0.08, COCOA_DARK, [0, 1.6, -0.1]);
    for (let x = 0; x < 3; x++) for (let y = 0; y < 2; y++) b.block(0.19, 0.16, 0.04, COCOA, [-0.22 + x * 0.22, 1.63 + y * 0.19, -0.05]);
    // a table of truffles out front
    b.cyl(0.26, 0.26, 0.05, PAL.wood, [0.55, 0.5, 0.65], 12);
    b.cyl(0.04, 0.06, 0.42, COCOA_DARK, [0.55, 0.07, 0.65], 6);
    for (let i = 0; i < 5; i++) { const a = i * 1.26; b.sphere(0.055, i % 2 ? COCOA_DARK : '#8a5a33', [0.55 + Math.cos(a) * 0.14, 0.59, 0.65 + Math.sin(a) * 0.14], 0); }
    // cocoa pods in a basket
    b.cyl(0.2, 0.16, 0.2, '#b98a4a', [-0.6, 0.07, 0.62], 10);
    for (const [x, z] of [[-0.68, 0.58], [-0.52, 0.6], [-0.6, 0.72]] as const) b.sphere(0.075, '#c9702a', [x, 0.3, z], 1, [0.8, 1.3, 0.8]);
    return b.build();
  },
  coffee_roastery: () => {
    const b = geo();
    b.block(1.95, 0.07, 1.95, '#cbb894', [0, 0, 0]);
    // the brick shed
    b.block(1.3, 1.1, 1.05, BRICK, [-0.25, 0.07, -0.4]);
    for (let i = 0; i < 4; i++) b.block(1.32, 0.03, 1.07, BRICK_DARK, [-0.25, 0.28 + i * 0.24, -0.4]);
    b.prism(1.5, 0.55, 1.25, '#4a4a52', [-0.25, 1.17, -0.4]);
    b.block(0.38, 0.72, 0.05, PAL.woodDark, [-0.45, 0.07, 0.14]);
    // a tall flue with a wisp of smoke
    b.cyl(0.09, 0.09, 1.9, '#6a6a72', [0.62, 0.07, -0.65], 8);
    b.cyl(0.14, 0.09, 0.12, '#55555c', [0.62, 1.97, -0.65], 8);
    for (const [y, s] of [[2.2, 0.12], [2.42, 0.16]] as const) b.sphere(s, '#e6e6ea', [0.62 + (y - 2.2) * 0.3, y, -0.65], 1);
    // the copper drum roaster under a little lean-to
    b.block(0.06, 0.95, 0.06, PAL.woodDark, [0.85, 0.07, 0.72]);
    b.block(0.06, 0.95, 0.06, PAL.woodDark, [0.38, 0.07, 0.72]);
    b.box(0.72, 0.05, 1.0, '#4a4a52', [0.62, 1.04, 0.3], [0.12, 0, 0]);
    b.block(0.5, 0.26, 0.42, '#3b3b42', [0.62, 0.07, 0.25]);
    b.cyl(0.21, 0.21, 0.42, COPPER, [0.62, 0.53, 0.25], 14, [0, 0, Math.PI / 2]);
    b.cyl(0.08, 0.08, 0.05, PAL.gold, [0.35, 0.53, 0.25], 10, [0, 0, Math.PI / 2]);
    b.cone(0.11, 0.18, '#a8a8b0', [0.62, 0.84, 0.25], 8, [Math.PI, 0, 0]);
    // sacks of beans
    for (const [x, z] of [[-0.75, 0.55], [-0.38, 0.62]] as const) {
      b.sphere(0.2, SACK, [x, 0.26, z], 1, [1, 1.1, 0.9]);
      b.sphere(0.1, '#4a2a18', [x, 0.44, z], 0, [1, 0.35, 1]);
    }
    // a coffee cup on a post
    b.block(0.07, 0.95, 0.07, PAL.woodDark, [-0.9, 0.07, 0.85]);
    b.cyl(0.14, 0.1, 0.17, PAL.white, [-0.9, 1.04, 0.85], 10);
    b.cyl(0.12, 0.12, 0.02, COCOA_DARK, [-0.9, 1.13, 0.85], 10);
    return b.build();
  },
};
