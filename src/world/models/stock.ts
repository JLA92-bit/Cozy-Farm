import * as THREE from 'three';
import { geo, PAL } from '../Procedural';

/**
 * 1.38 New Stock: the Smokehouse (a dark timber hut with a stone chimney, a smoking rack of fish and an oak log pile)
 * and the Preserves Cellar (a stone-faced cellar door in a grassy bank, shelves of jars and a barrel). Chunky and
 * soft like the farm's other own models.
 */
const TIMBER = '#5a3a26', TIMBER_DARK = '#3b2618', STONE = '#a9a091', STONE_DARK = '#8a8274';

export const STOCK_PROC: Record<string, () => THREE.BufferGeometry> = {
  smokehouse: () => {
    const b = geo();
    b.block(1.95, 0.07, 1.95, '#cbb894', [0, 0, 0]);
    // the hut
    b.block(1.2, 1.0, 1.0, TIMBER, [-0.25, 0.07, -0.35]);
    for (let i = 0; i < 4; i++) b.block(1.22, 0.04, 1.02, TIMBER_DARK, [-0.25, 0.25 + i * 0.22, -0.35]);
    b.prism(1.4, 0.55, 1.2, '#4a4a52', [-0.25, 1.07, -0.35]);
    b.block(0.36, 0.65, 0.05, TIMBER_DARK, [-0.35, 0.07, 0.16]);
    // a stone chimney with a wisp of smoke
    b.block(0.32, 1.65, 0.32, STONE, [0.38, 0.07, -0.6]);
    b.block(0.38, 0.1, 0.38, STONE_DARK, [0.38, 1.72, -0.6]);
    for (const [y, s] of [[1.95, 0.14], [2.15, 0.18], [2.4, 0.22]] as const) b.sphere(s, '#e6e6ea', [0.38 + (y - 1.95) * 0.3, y, -0.6], 1, [1, 0.8, 1]);
    // a rack of fish
    for (const x of [0.55, 0.9]) b.block(0.05, 0.8, 0.05, TIMBER_DARK, [x, 0.07, 0.45]);
    b.box(0.45, 0.04, 0.04, TIMBER_DARK, [0.72, 0.85, 0.45]);
    for (let i = 0; i < 3; i++) b.sphere(0.07, '#c9884a', [0.6 + i * 0.12, 0.7, 0.45], 1, [0.6, 1.6, 0.4]);
    // oak logs
    for (let i = 0; i < 3; i++) b.cyl(0.1, 0.1, 0.55, i === 1 ? '#8a5a33' : '#7a4a2a', [-0.75 + i * 0.2, 0.17 + (i === 1 ? 0.15 : 0), 0.6], 8, [0, 0, Math.PI / 2]);
    return b.build();
  },
  preserves_cellar: () => {
    const b = geo();
    b.block(1.95, 0.07, 1.95, '#cbb894', [0, 0, 0]);
    // a grassy bank with a stone front
    b.sphere(1.0, '#7fbf5a', [0, 0.05, -0.45], 1, [1, 0.55, 0.7]);
    b.block(1.3, 0.85, 0.2, STONE, [0, 0.07, 0.05]);
    b.prism(1.4, 0.3, 0.3, STONE_DARK, [0, 0.92, 0.05]);
    // an arched door
    b.block(0.5, 0.6, 0.06, '#6a4a2e', [0, 0.07, 0.17]);
    b.cyl(0.25, 0.25, 0.06, '#6a4a2e', [0, 0.67, 0.17], 12, [Math.PI / 2, 0, 0]);
    b.sphere(0.03, PAL.gold, [0.15, 0.35, 0.21], 0);
    // a shelf of jars outside
    b.block(0.5, 0.06, 0.25, PAL.wood, [0.62, 0.45, 0.45]);
    b.block(0.5, 0.06, 0.25, PAL.wood, [0.62, 0.15, 0.45]);
    const jars = ['#c8324a', '#e8a33a', '#7a3a8a', '#d9c34a'];
    jars.forEach((c, i) => { b.cyl(0.06, 0.06, 0.16, c, [0.45 + (i % 2) * 0.32, i < 2 ? 0.51 : 0.21, 0.45], 8); b.cyl(0.065, 0.065, 0.03, '#f2efe6', [0.45 + (i % 2) * 0.32, i < 2 ? 0.67 : 0.37, 0.45], 8); });
    // a barrel
    b.cyl(0.2, 0.2, 0.42, '#8a5a33', [-0.65, 0.07, 0.5], 12);
    for (const y of [0.15, 0.4]) b.cyl(0.21, 0.21, 0.03, '#4a4a52', [-0.65, y, 0.5], 12);
    return b.build();
  },
};
