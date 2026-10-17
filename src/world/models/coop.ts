import * as THREE from 'three';
import { geo, PAL } from '../Procedural';

/**
 * 1.28 Together: decorations from finished co-op Village Projects. Each fills a 2x2 footprint (about 2 wide) except
 * the plaque (1x1). Chunky and soft like the farm's other own models.
 */
export const COOP_PROC: Record<string, () => THREE.BufferGeometry> = {
  /** A wooden plaque on two posts with a brass name plate (the names are listed in the Village Projects screen). */
  coop_plaque: () => geo()
    .block(0.08, 0.8, 0.08, PAL.woodDark, [-0.32, 0, 0]).block(0.08, 0.8, 0.08, PAL.woodDark, [0.32, 0, 0])
    .block(0.82, 0.5, 0.08, PAL.wood, [0, 0.45, 0.02])
    .block(0.64, 0.3, 0.03, PAL.gold, [0, 0.55, 0.07])
    .block(0.5, 0.03, 0.035, '#8a6a2a', [0, 0.72, 0.08]).block(0.4, 0.03, 0.035, '#8a6a2a', [0, 0.64, 0.08]).block(0.46, 0.03, 0.035, '#8a6a2a', [0, 0.58, 0.08])
    .sphere(0.06, '#ff8fb4', [0, 0.98, 0.02], 1)
    .build(),
  /** A little arched footbridge with rails. */
  coop_footbridge: () => {
    const b = geo();
    for (let i = 0; i < 9; i++) {
      const x = -0.9 + i * 0.225, y = 0.12 + Math.sin((i / 8) * Math.PI) * 0.28;
      b.block(0.2, 0.06, 0.8, i % 2 ? PAL.wood : PAL.woodLight, [x, y, 0]);
    }
    for (const z of [-0.38, 0.38]) {
      for (let i = 0; i < 5; i++) { const x = -0.9 + i * 0.45, y = 0.12 + Math.sin((i / 4) * Math.PI) * 0.28; b.block(0.06, 0.4, 0.06, PAL.woodDark, [x, y, z]); }
      for (let i = 0; i < 8; i++) { const x = -0.8 + i * 0.225, y = 0.5 + Math.sin(((i + 0.5) / 8) * Math.PI) * 0.28; b.box(0.24, 0.05, 0.05, PAL.woodDark, [x, y, z], [0, 0, Math.cos(((i + 0.5) / 8) * Math.PI) * 0.35]); }
    }
    b.block(2.0, 0.05, 1.2, '#7fd0ff', [0, 0, 0]);
    return b.build();
  },
  /** Two raised beds of flowers and veg, a bench and a watering can. */
  coop_garden: () => {
    const b = geo();
    for (const z of [-0.45, 0.45]) {
      b.block(1.4, 0.22, 0.55, PAL.woodDark, [-0.2, 0, z]);
      b.block(1.3, 0.04, 0.45, PAL.soil, [-0.2, 0.22, z]);
      for (let i = 0; i < 6; i++) b.sphere(0.09, ['#d6334a', '#ffd23a', '#7fd05a', '#a98be6', '#ff8fb4', '#62c447'][(i + (z > 0 ? 2 : 0)) % 6], [-0.75 + i * 0.22, 0.32, z + (i % 2 ? 0.08 : -0.08)], 1);
    }
    b.block(0.3, 0.06, 0.9, PAL.wood, [0.8, 0.3, 0]).block(0.05, 0.3, 0.05, PAL.woodDark, [0.8, 0, -0.38]).block(0.05, 0.3, 0.05, PAL.woodDark, [0.8, 0, 0.38]);
    b.cyl(0.08, 0.1, 0.16, '#5fa8d0', [0.8, 0.36, 0.25], 8).cyl(0.015, 0.02, 0.14, '#5fa8d0', [0.88, 0.42, 0.25], 4, [0, 0, -1]);
    return b.build();
  },
  /** A fireworks stand: a crate of rockets, a lantern string and a big star. */
  coop_fireworks: () => {
    const b = geo();
    b.block(1.0, 0.4, 0.7, '#c94a3a', [0, 0, 0]);
    b.block(1.04, 0.05, 0.74, PAL.gold, [0, 0.4, 0]);
    const cols = ['#ffd23a', '#7fd0ff', '#ff8fb4', '#a98be6', '#7fd05a'];
    for (let i = 0; i < 10; i++) {
      const x = -0.4 + (i % 5) * 0.2, z = i < 5 ? -0.15 : 0.15, h = 0.35 + (i % 3) * 0.1;
      b.cyl(0.04, 0.04, h, cols[i % 5], [x, 0.45, z], 6).cone(0.05, 0.1, '#ffffff', [x, 0.45 + h, z], 6);
    }
    for (const x of [-0.85, 0.85]) b.cyl(0.03, 0.03, 1.4, PAL.woodDark, [x, 0, 0.45], 5);
    for (let i = 0; i < 7; i++) b.sphere(0.06, cols[i % 5], [-0.75 + i * 0.25, 1.32 - Math.sin((i / 6) * Math.PI) * 0.18, 0.45], 1);
    b.sphere(0.16, PAL.gold, [0.85, 1.55, 0.45], 0, [1, 1, 0.4]);
    return b.build();
  },
};
