import * as THREE from 'three';
import { geo, PAL } from '../Procedural';

/**
 * 1.8.7 Marlow Pike's fish stall: a striped awning on two posts over a counter with a tray of fish on ice, a
 * crate and a barrel. Faces +z. Chunky and soft like the rest of the farm's own models.
 */
const SILVER = '#c9d6e2', BLUE = '#5aa7d9', ORANGE = '#f08a4b', STRIPE_A = '#3fa9f5', STRIPE_B = '#fff6e8', ICE = '#e6f4ff';

function fish(b: ReturnType<typeof geo>, x: number, y: number, z: number, yaw: number, color: string): void {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  b.sphere(0.1, color, [x, y, z], 1, [1.9, 0.7, 0.7].map((v, i) => (i === 0 ? v : v)) as [number, number, number]);
  b.cone(0.07, 0.12, color, [x - c * 0.2, y, z + s * 0.2], 4, [0, 0, Math.PI / 2]);
  b.sphere(0.022, '#1b1410', [x + c * 0.12, y + 0.05, z - s * 0.12 + 0.05], 1);
}

export const FISHSTALL_PROC: Record<string, () => THREE.BufferGeometry> = {
  fish_stall: () => {
    const b = geo();
    // counter
    b.block(1.6, 0.5, 0.7, PAL.wood, [0, 0, 0]);
    b.block(1.7, 0.06, 0.8, PAL.woodLight, [0, 0.5, 0]);
    // tray of ice with fish
    b.block(1.3, 0.08, 0.5, ICE, [0, 0.56, 0]);
    const cols = [SILVER, BLUE, ORANGE, SILVER, BLUE, ORANGE];
    for (let i = 0; i < 6; i++) fish(b, -0.5 + (i % 3) * 0.5, 0.7 + (i > 2 ? 0.03 : 0), -0.12 + (i > 2 ? 0.22 : 0), i % 2 ? 0.2 : -0.15, cols[i]);
    // posts and a striped awning
    for (const x of [-0.78, 0.78]) b.block(0.07, 1.3, 0.07, PAL.woodDark, [x, 0.5, -0.32]);
    for (let i = 0; i < 6; i++) b.block(0.28, 0.05, 0.95, i % 2 ? STRIPE_B : STRIPE_A, [-0.7 + i * 0.28, 1.76 - i * 0.0, -0.08], [0.18, 0, 0]);
    b.block(1.72, 0.05, 0.06, STRIPE_A, [0, 1.62, 0.36]);
    // a hanging sign
    b.block(0.5, 0.2, 0.04, '#fff6e8', [0, 1.38, 0.38]);
    b.sphere(0.06, BLUE, [0, 1.38, 0.41], 1, [1.8, 0.8, 0.4]);
    // crate and barrel beside it
    b.block(0.42, 0.3, 0.34, PAL.wood, [1.15, 0, 0.1]);
    for (const [x, z] of [[1.08, 0.05], [1.22, 0.14]] as const) b.sphere(0.07, SILVER, [x, 0.34, z], 1, [1.6, 0.6, 0.6]);
    b.cyl(0.24, 0.24, 0.5, '#b07a45', [-1.2, 0, 0.1], 10);
    for (const y of [0.12, 0.38]) b.torus(0.245, 0.02, '#5d646b', [-1.2, y, 0.1], [Math.PI / 2, 0, 0]);
    return b.build();
  },
};
