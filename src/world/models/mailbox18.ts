import * as THREE from 'three';
import { geo, PAL } from '../Procedural';

/**
 * 1.8 procedural models for the mailbox by the farmhouse and the little daily finds. Sizes in tiles. The mailbox
 * flag is its own geometry so it can swing up when a letter is waiting.
 */

/** Post, box with a rounded top, a little door and a name plate. Origin at the foot of the post. */
export function mailboxGeometry(): THREE.BufferGeometry {
  const b = geo();
  // post with a small foot so it sits in the grass
  b.block(0.1, 0.62, 0.1, PAL.woodDark, [0, 0, 0]);
  b.block(0.24, 0.05, 0.24, PAL.wood, [0, 0, 0]);
  b.box(0.3, 0.05, 0.12, PAL.woodDark, [0, 0.6, 0]);
  // the box: body + half-cylinder roof, along z (door at +z)
  b.block(0.3, 0.2, 0.46, '#4f8fd8', [0, 0.62, 0]);
  b.cyl(0.15, 0.15, 0.46, '#4f8fd8', [0, 0.82, 0], 10, [Math.PI / 2, 0, 0]);
  // trim and door
  b.box(0.32, 0.03, 0.03, PAL.white, [0, 0.66, 0.235]);
  b.box(0.26, 0.3, 0.02, '#3f78bd', [0, 0.79, 0.236]);
  b.cyl(0.025, 0.025, 0.03, PAL.gold, [0, 0.79, 0.255], 6, [Math.PI / 2, 0, 0]);
  // name plate on the side facing the flag's other side
  b.box(0.02, 0.1, 0.26, PAL.cream, [-0.155, 0.74, 0]);
  return b.build();
}

/** The red flag on its pivot: a stick and a pennant. Rotate around x: 0 = up, about -PI/2 = down. */
export function mailboxFlagGeometry(): THREE.BufferGeometry {
  return geo()
    .box(0.03, 0.34, 0.03, PAL.metal, [0, 0.17, 0])
    .box(0.03, 0.12, 0.16, PAL.red, [0, 0.28, 0.08])
    .build();
}

/** Small things lying in the grass. */
export function findGeometry(kind: string): THREE.BufferGeometry {
  const b = geo();
  switch (kind) {
    case 'shell':
      // a little scallop: ribbed fan and a hinge
      for (let i = -2; i <= 2; i++) b.box(0.05, 0.03, 0.22, i % 2 ? '#ffd2c4' : '#ffb7a6', [i * 0.045, 0.03, 0.02], [0, i * 0.22, 0]);
      b.box(0.12, 0.035, 0.05, '#f5a08c', [0, 0.03, -0.1]);
      break;
    case 'petal':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.sphere(0.06, i % 2 ? PAL.pink : '#ffc4dc', [Math.cos(a) * 0.08, 0.025, Math.sin(a) * 0.08], 0, [1, 0.35, 0.7]);
      }
      b.sphere(0.035, PAL.yellow, [0, 0.04, 0], 0);
      b.sphere(0.05, '#ffd6e8', [0.2, 0.02, 0.1], 0, [1, 0.3, 0.7]);
      break;
    case 'acorn':
      for (const [x, z, r] of [[0, 0, 0], [0.13, 0.07, 1.2]] as const) {
        b.sphere(0.07, '#c98a4b', [x, 0.07, z], 1, [0.9, 1.1, 0.9]);
        b.sphere(0.075, '#7a4a24', [x, 0.12, z], 0, [1, 0.55, 1]);
        b.box(0.015, 0.05, 0.015, '#5a3519', [x, 0.17, z], [0, r, 0.3]);
      }
      break;
    case 'lost:rosa':
      // recipe card with a red stripe
      b.box(0.24, 0.02, 0.17, PAL.white, [0, 0.01, 0], [0, 0.3, 0]);
      b.box(0.24, 0.022, 0.03, PAL.red, [0, 0.012, -0.05], [0, 0.3, 0]);
      b.box(0.16, 0.022, 0.015, '#c9b9a0', [0.01, 0.012, 0.02], [0, 0.3, 0]);
      b.box(0.12, 0.022, 0.015, '#c9b9a0', [0.01, 0.012, 0.05], [0, 0.3, 0]);
      break;
    case 'lost:tom':
      // red and white fishing float
      b.sphere(0.07, PAL.red, [0, 0.07, 0], 1, [1, 0.8, 1]);
      b.sphere(0.072, PAL.white, [0, 0.11, 0], 1, [1, 0.45, 1]);
      b.box(0.015, 0.08, 0.015, PAL.black, [0, 0.17, 0]);
      break;
    case 'lost:juniper':
      // paintbrush with a blue tip and a dab of paint
      b.box(0.3, 0.03, 0.03, PAL.woodLight, [0, 0.02, 0], [0, 0.5, 0]);
      b.box(0.06, 0.035, 0.04, PAL.metal, [0.15 * Math.cos(0.5), 0.02, -0.15 * Math.sin(0.5)], [0, 0.5, 0]);
      b.box(0.07, 0.04, 0.045, '#3f86d8', [0.2 * Math.cos(0.5), 0.02, -0.2 * Math.sin(0.5)], [0, 0.5, 0]);
      b.cyl(0.05, 0.05, 0.01, PAL.purple, [-0.08, 0, 0.1], 8);
      break;
    case 'lost:pip':
      // a shiny glass marble with a swirl
      b.sphere(0.07, '#7fd3ff', [0, 0.07, 0], 1);
      b.sphere(0.03, '#ffcf3f', [0.03, 0.1, 0.04], 0);
      break;
    case 'lost:hazel':
      // brass key
      b.torus(0.045, 0.014, PAL.gold, [-0.09, 0.015, 0], [Math.PI / 2, 0, 0]);
      b.box(0.16, 0.025, 0.025, PAL.gold, [0.02, 0.015, 0]);
      b.box(0.025, 0.025, 0.05, PAL.gold, [0.08, 0.015, 0.03]);
      b.box(0.025, 0.025, 0.035, PAL.gold, [0.04, 0.015, 0.025]);
      break;
    case 'lost:bram':
      // small hammer lying down
      b.box(0.28, 0.035, 0.035, PAL.wood, [0, 0.02, 0], [0, -0.4, 0]);
      b.box(0.06, 0.06, 0.13, PAL.stoneDark, [0.13 * Math.cos(0.4), 0.035, 0.13 * Math.sin(0.4)], [0, -0.4, 0]);
      break;
    default:
      b.sphere(0.07, PAL.yellow, [0, 0.07, 0], 1);
  }
  return b.build();
}
