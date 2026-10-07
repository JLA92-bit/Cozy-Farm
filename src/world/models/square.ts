import * as THREE from 'three';
import { PAL, geo } from '../Procedural';

/** Procedural pieces shared by the village square and the farm's way to it (the jetty, the boat and the signpost). */

/** Height of the cliff the islands stand on (same as the farm island), so the jetty meets the water right. */
export const SEA_CLIFF = 1.6;

/** A rowing boat for the jetty. */
export function boatGeometry(): THREE.BufferGeometry {
  return geo()
    .box(0.9, 0.24, 1.9, PAL.woodDark, [0, 0.05, 0])
    .box(0.74, 0.06, 1.7, PAL.wood, [0, 0.19, 0])
    .box(0.94, 0.08, 1.94, PAL.white, [0, 0.22, 0])
    .box(0.8, 0.05, 0.22, PAL.woodLight, [0, 0.3, -0.2])
    .build();
}

/** The little wooden jetty: planks over the water, posts every other plank. */
export function jettyGeometry(): THREE.BufferGeometry {
  const b = geo();
  const planks = 8, step = 0.9;
  for (let k = 0; k < planks; k++) {
    const z = -k * step;
    b.block(1.5, 0.1, 0.8, k % 2 ? PAL.wood : PAL.woodLight, [0, -SEA_CLIFF + 0.7, z]);
    if (k % 2 === 0) for (const sx of [-0.7, 0.7]) b.block(0.16, 1.0, 0.16, PAL.woodDark, [sx, -SEA_CLIFF - 0.1, z]);
  }
  b.block(0.14, 0.55, 0.14, PAL.woodDark, [0.7, -SEA_CLIFF + 0.75, -planks * step + 0.5]);
  b.cyl(0.1, 0.1, 0.06, '#e2d3b0', [0.7, -SEA_CLIFF + 1.3, -planks * step + 0.5], 6);
  return b.build();
}

/** A signpost at the start of the jetty: a post, two arrow boards, a little roof and a pennant. Faces +z. */
export function signpostGeometry(): THREE.BufferGeometry {
  const b = geo();
  b.block(0.16, 2.1, 0.16, PAL.woodDark, [0, 0, 0]);
  b.block(0.5, 0.1, 0.5, PAL.stoneDark, [0, 0, 0]);
  // two boards, one longer, both pointing the same way along the jetty (+x)
  b.block(1.5, 0.34, 0.07, PAL.woodLight, [0.62, 1.4, 0.1]);
  b.prism(0.36, 0.34, 0.07, PAL.woodLight, [1.5, 1.4, 0.1], [0, Math.PI / 2, Math.PI / 2]);
  b.block(1.2, 0.3, 0.07, PAL.wood, [0.5, 0.95, 0.1]);
  b.box(1.6, 0.04, 0.09, PAL.woodDark, [0.62, 1.4, 0.1]);
  // a roof and a pennant on top
  b.prism(0.9, 0.3, 0.6, PAL.roof, [0, 2.1, 0]);
  b.block(0.05, 0.5, 0.05, PAL.woodDark, [0, 2.4, 0]);
  b.box(0.04, 0.22, 0.34, PAL.red, [0, 2.78, 0.17]);
  return b.build();
}
