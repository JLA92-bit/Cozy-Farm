import * as THREE from 'three';
import { geo, PAL, type GeoBuilder } from '../Procedural';
import { VILLAGERS, type VillagerDef } from '../../data';

/**
 * 1.8 Village Friends keepsakes: one decoration per villager for 4 hearts (their story's gift) and a framed
 * portrait for 8 hearts, painted in the villager's own colours. Static geometry, about one tile, chunky and soft.
 */
type V3 = [number, number, number];

const GOLD = '#f2c14e', GOLD_DARK = '#c8962a', IRON = '#5d646b', IRON_DARK = '#40454a';

/** Small grassy plinth so every keepsake sits nicely on any ground. */
function plinth(b: GeoBuilder, r = 0.42, color = '#d9c7a3'): void {
  b.cyl(r, r + 0.03, 0.06, color, [0, 0, 0], 12);
}

/** A little heart made of two spheres and a cone, facing +z. */
function heart(b: GeoBuilder, s: number, color: string, pos: V3): void {
  b.sphere(s * 0.5, color, [pos[0] - s * 0.32, pos[1] + s * 0.2, pos[2]], 1);
  b.sphere(s * 0.5, color, [pos[0] + s * 0.32, pos[1] + s * 0.2, pos[2]], 1);
  b.cone(s * 0.62, s * 0.8, color, [pos[0], pos[1] - s * 0.62, pos[2]], 4, [Math.PI, 0, 0]);
}

const KEEPSAKES: Record<string, () => THREE.BufferGeometry> = {
  // Rosa: a hanging bakery sign with a loaf and a strawberry
  keepsake_rosa: () => {
    const b = geo();
    plinth(b);
    b.block(0.08, 1.1, 0.08, PAL.woodDark, [-0.3, 0.05, 0]);
    b.box(0.62, 0.07, 0.07, PAL.woodDark, [0.0, 1.08, 0]);
    for (const x of [-0.12, 0.22]) b.box(0.015, 0.16, 0.015, IRON, [x, 0.98, 0]);
    b.box(0.5, 0.36, 0.06, '#f7e6bd', [0.05, 0.74, 0]);
    b.box(0.56, 0.42, 0.04, '#ff8fb4', [0.05, 0.74, -0.03]);
    // loaf on the board
    b.sphere(0.12, '#d9934a', [-0.02, 0.74, 0.05], 1, [1.3, 0.65, 0.5]);
    for (const x of [-0.08, -0.02, 0.04]) b.box(0.015, 0.06, 0.01, '#f7e6bd', [x, 0.77, 0.1], [0, 0, 0.5]);
    // strawberry
    b.cone(0.06, 0.12, '#e2533c', [0.17, 0.66, 0.05], 8, [Math.PI, 0, 0]);
    b.cone(0.05, 0.03, PAL.green, [0.17, 0.66, 0.05], 6);
    return b.build();
  },
  // Old Tom: his anchor, leaning in a coil of rope
  keepsake_tom: () => {
    const b = geo();
    plinth(b, 0.42, '#c9b48a');
    b.torus(0.2, 0.05, '#d8c08a', [0, 0.06, 0.05], [Math.PI / 2, 0, 0]);
    b.torus(0.14, 0.045, '#e2cc96', [0, 0.12, 0.05], [Math.PI / 2, 0, 0]);
    const g = geo();
    g.block(0.08, 0.85, 0.08, IRON, [0, 0.12, 0]);
    g.torus(0.09, 0.03, IRON_DARK, [0, 1.02, 0]);
    g.box(0.42, 0.07, 0.08, IRON, [0, 0.82, 0]);
    // the curved arms: a half ring opening upwards, with a fluke at each tip
    g.geometry(new THREE.TorusGeometry(0.3, 0.05, 6, 14, Math.PI), IRON, [0, 0.42, 0], [0, 0, Math.PI]);
    g.cone(0.09, 0.16, IRON_DARK, [-0.3, 0.36, 0], 4, [0, 0, 0.5]);
    g.cone(0.09, 0.16, IRON_DARK, [0.3, 0.36, 0], 4, [0, 0, -0.5]);
    b.geometry(g.build(), null, [0, 0, -0.05], [-0.12, 0, 0]);
    return b.build();
  },
  // Juniper: her easel with a little painting of a farm
  keepsake_juniper: () => {
    const b = geo();
    plinth(b);
    b.box(0.06, 1.2, 0.06, PAL.wood, [-0.25, 0.6, 0.05], [0.12, 0, 0.18]);
    b.box(0.06, 1.2, 0.06, PAL.wood, [0.25, 0.6, 0.05], [0.12, 0, -0.18]);
    b.box(0.06, 1.1, 0.06, PAL.woodDark, [0, 0.55, -0.2], [-0.3, 0, 0]);
    b.box(0.62, 0.05, 0.1, PAL.woodDark, [0, 0.42, 0.12]);
    // canvas with a sunny farm: sky, hills, a red barn and a sun
    const c = geo();
    c.box(0.6, 0.48, 0.03, '#fff6e8', [0, 0, 0]);
    c.box(0.54, 0.24, 0.01, '#8fd3f4', [0, 0.1, 0.02]);
    c.box(0.54, 0.18, 0.01, '#7ccf4f', [0, -0.12, 0.02]);
    c.sphere(0.12, '#93dd62', [-0.12, -0.04, 0.015], 1, [1.4, 0.6, 0.1]);
    c.box(0.1, 0.08, 0.01, '#e2533c', [0.1, -0.03, 0.03]);
    c.cone(0.08, 0.05, '#b53a28', [0.1, 0.01, 0.03], 4, [0, Math.PI / 4, 0]);
    c.sphere(0.04, '#ffcf3f', [0.18, 0.15, 0.03], 1, [1, 1, 0.2]);
    b.geometry(c.build(), null, [0, 0.72, 0.13], [-0.12, 0, 0]);
    // paint pots
    for (const [x, col] of [[-0.22, '#e8655a'], [-0.1, '#5aaee0'], [0.24, '#f6d04d']] as [number, string][]) b.cyl(0.05, 0.05, 0.08, col, [x, 0.06, 0.28], 8);
    return b.build();
  },
  // Pip: a treasure chest spilling coins and shells
  keepsake_pip: () => {
    const b = geo();
    plinth(b, 0.44, '#e8d39a');
    b.block(0.62, 0.34, 0.4, '#a0622e', [0, 0.06, 0]);
    for (const x of [-0.26, 0.26]) b.block(0.06, 0.35, 0.42, GOLD_DARK, [x, 0.06, 0]);
    b.block(0.64, 0.05, 0.42, GOLD_DARK, [0, 0.24, 0]);
    // open lid tipped back
    b.box(0.62, 0.06, 0.4, '#b9723a', [0, 0.56, -0.24], [-1.2, 0, 0]);
    b.box(0.08, 0.1, 0.04, GOLD, [0, 0.33, 0.21]);
    // treasure
    for (let i = 0; i < 9; i++) b.cyl(0.05, 0.05, 0.02, GOLD, [-0.2 + (i % 5) * 0.1, 0.4 + Math.floor(i / 5) * 0.03, -0.05 + (i % 3) * 0.06], 8, [0.3 * (i % 2), 0, 0.2]);
    b.sphere(0.07, '#4fe0d0', [0.12, 0.44, 0.02], 0);
    b.sphere(0.06, '#a77bf3', [-0.14, 0.43, 0.05], 0);
    // spilled coins and a shell in front
    for (const [x, z] of [[0.3, 0.3], [0.2, 0.34], [-0.28, 0.32]]) b.cyl(0.05, 0.05, 0.02, GOLD, [x, 0.06, z], 8);
    b.cone(0.07, 0.08, '#ffd6e6', [-0.12, 0.06, 0.32], 6);
    return b.build();
  },
  // Hazel: her grandmother's brass shop scale on a little counter
  keepsake_hazel: () => {
    const b = geo();
    plinth(b);
    b.block(0.6, 0.38, 0.42, '#86c06a', [0, 0.06, 0]);
    b.block(0.66, 0.05, 0.48, PAL.woodLight, [0, 0.44, 0]);
    b.cyl(0.1, 0.13, 0.05, GOLD_DARK, [0, 0.49, 0], 10);
    b.block(0.04, 0.42, 0.04, GOLD, [0, 0.54, 0]);
    b.box(0.6, 0.035, 0.035, GOLD, [0, 0.94, 0], [0, 0, 0.08]);
    b.sphere(0.04, GOLD_DARK, [0, 0.97, 0], 1);
    for (const [x, y] of [[-0.27, 0.92], [0.27, 0.97]] as [number, number][]) {
      for (const dx of [-0.05, 0.05]) b.box(0.008, 0.2, 0.008, GOLD_DARK, [x + dx, y - 0.11, 0]);
      b.cyl(0.11, 0.08, 0.035, GOLD, [x, y - 0.24, 0], 10);
    }
    b.sphere(0.06, PAL.red, [-0.27, 0.74, 0], 1);
    b.sphere(0.05, PAL.yellow, [0.27, 0.78, 0], 1);
    return b.build();
  },
  // Bram: his old anvil on a tree stump, with a hammer
  keepsake_bram: () => {
    const b = geo();
    plinth(b, 0.42, '#c9b48a');
    b.cyl(0.24, 0.27, 0.36, '#8a5528', [0, 0.06, 0], 10);
    b.cyl(0.23, 0.23, 0.02, '#e8bd82', [0, 0.42, 0], 10);
    b.block(0.2, 0.12, 0.18, IRON_DARK, [0, 0.43, 0]);
    b.block(0.14, 0.1, 0.14, IRON, [0, 0.55, 0]);
    b.block(0.46, 0.11, 0.2, IRON, [0.02, 0.65, 0]);
    b.cone(0.1, 0.22, IRON, [-0.3, 0.71, 0], 6, [0, 0, Math.PI / 2]);
    b.box(0.46, 0.015, 0.2, '#8c9aa6', [0.02, 0.765, 0]);
    // hammer leaning on the stump
    b.box(0.04, 0.42, 0.04, PAL.wood, [0.28, 0.2, 0.18], [0, 0, -0.35]);
    b.box(0.16, 0.07, 0.07, IRON_DARK, [0.35, 0.4, 0.18], [0, 0, -0.35]);
    return b.build();
  },
};

/** A framed portrait on a stand, painted from the villager's look. */
function portrait(v: VillagerDef): () => THREE.BufferGeometry {
  return () => {
    const L = v.look;
    const b = geo();
    plinth(b, 0.36);
    // stand
    b.box(0.05, 1.05, 0.05, PAL.woodDark, [-0.2, 0.52, -0.02], [0.1, 0, 0.12]);
    b.box(0.05, 1.05, 0.05, PAL.woodDark, [0.2, 0.52, -0.02], [0.1, 0, -0.12]);
    b.box(0.05, 0.95, 0.05, PAL.woodDark, [0, 0.47, -0.22], [-0.32, 0, 0]);
    const p = geo();
    // gold frame and a soft background in their colour
    p.box(0.66, 0.78, 0.06, GOLD, [0, 0, 0]);
    p.box(0.56, 0.68, 0.02, '#fff6e8', [0, 0, 0.03]);
    p.box(0.52, 0.64, 0.01, v.colour, [0, 0, 0.045]);
    // shoulders, face, hair and a hat hint
    p.sphere(0.2, L.top, [0, -0.25, 0.05], 1, [1.25, 0.7, 0.1]);
    p.sphere(0.12, L.skin, [0, 0.0, 0.06], 1, [1, 1.1, 0.25]);
    p.sphere(0.13, L.hair, [0, 0.07, 0.05], 1, [1.08, 0.8, 0.2]);
    if (L.hat !== 'none') p.box(0.3, 0.07, 0.015, L.hat === 'chef' ? '#ffffff' : L.hat === 'bucket' ? '#7f8f6a' : L.hat === 'beanie' ? '#e8655a' : '#3fa9f5', [0, 0.17, 0.075]);
    p.sphere(0.018, PAL.black, [-0.045, 0.0, 0.09], 0);
    p.sphere(0.018, PAL.black, [0.045, 0.0, 0.09], 0);
    p.box(0.06, 0.012, 0.01, '#b5523f', [0, -0.06, 0.09]);
    heart(p, 0.07, '#ff6b8a', [0.19, 0.24, 0.06]);
    b.geometry(p.build(), null, [0, 0.82, 0.08], [-0.12, 0, 0]);
    return b.build();
  };
}

export const KEEPSAKE_PROC: Record<string, () => THREE.BufferGeometry> = {
  ...KEEPSAKES,
  ...Object.fromEntries(VILLAGERS.map((v) => [`portrait_${v.id}`, portrait(v)])),
};
