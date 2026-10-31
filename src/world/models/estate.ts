import * as THREE from 'three';
import { geo, PAL } from '../Procedural';

/**
 * 1.26 Estate Projects: the Clock Tower and the Lighthouse, built up stage by stage (0 = nothing yet, 4 = finished).
 * The clock's hands and the lighthouse's light are added and moved by SquareView; the farm models (decor) use the
 * finished look. Sizes are in square units: the clock tower is about 11 tall, the lighthouse about 10.
 */
const STONE = '#b9b2a2', STONE_D = '#8f887a', BRICK = '#e6cfa6', ROOF = '#3f6fb5', WHITE = '#f6f2ea', RED = '#d9473a';

/** Height of the clock faces' centres (for the hands). */
export const CLOCK_FACE_Y = 7.7;
/** Half the width of the clock housing (the faces sit just outside it). */
export const CLOCK_HALF = 1.05;

export function clockTowerGeometry(stage: number, withHands = false): THREE.BufferGeometry {
  const b = geo();
  // before anything is built: a ring of old cracked stones where the tower once stood
  if (stage === 0) for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; b.block(0.6 + (k % 3) * 0.15, 0.2 + (k % 2) * 0.15, 0.5, k % 2 ? STONE : STONE_D, [Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4], [0, a, 0]); }
  if (stage >= 1) {
    b.block(3.4, 0.35, 3.4, STONE_D, [0, 0, 0]);
    b.block(3.0, 0.35, 3.0, STONE, [0, 0.35, 0]);
    for (const [x, z] of [[1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6]] as const) b.block(Math.abs(x) ? 0.3 : 1.0, 0.18, Math.abs(z) ? 0.3 : 1.0, STONE, [x * 1.02, 0, z * 1.02]);
  }
  if (stage >= 2) {
    b.block(2.2, 6.0, 2.2, BRICK, [0, 0.7, 0]);
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) b.block(0.3, 6.0, 0.3, STONE, [x * 1.0, 0.7, z * 1.0]);
    // a door and two slit windows on the front
    b.block(0.7, 1.2, 0.08, '#7a4a2a', [0, 0.7, 1.11]);
    for (const y of [3.0, 4.6]) b.block(0.22, 0.6, 0.06, '#3a3a46', [0, y, 1.12]);
    b.block(2.5, 0.25, 2.5, STONE, [0, 6.7, 0]);
  }
  if (stage >= 3) {
    // the clock housing with a face on every side
    b.block(2.1, 2.0, 2.1, BRICK, [0, 6.7, 0]);
    for (const [x, z, ry] of [[0, CLOCK_HALF, 0], [0, -CLOCK_HALF, Math.PI], [CLOCK_HALF, 0, Math.PI / 2], [-CLOCK_HALF, 0, -Math.PI / 2]] as const) {
      const dx = Math.sin(ry), dz = Math.cos(ry);
      // a disc facing out: along z for the front and back, along x for the sides
      const disc: [number, number, number] = Math.abs(dz) > 0.5 ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2];
      b.cyl(0.78, 0.78, 0.06, PAL.gold, [x, CLOCK_FACE_Y, z], 24, disc);
      b.cyl(0.7, 0.7, 0.08, '#fff8ea', [x + dx * 0.02, CLOCK_FACE_Y, z + dz * 0.02], 24, disc);
      for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; const r = 0.58; b.box(0.05, k % 3 ? 0.06 : 0.12, 0.03, '#3a3a46', [x + dx * 0.07 + Math.cos(ry) * Math.cos(a) * r, CLOCK_FACE_Y + Math.sin(a) * r, z + dz * 0.07 - Math.sin(ry) * Math.cos(a) * r], [0, ry, -a + Math.PI / 2]); }
      if (withHands) {
        b.box(0.07, 0.38, 0.03, '#2b2622', [x + dx * 0.1 - Math.cos(ry) * 0.13, CLOCK_FACE_Y + 0.11, z + dz * 0.1 + Math.sin(ry) * 0.13], [0, ry, 0.95]);
        b.box(0.05, 0.55, 0.03, '#2b2622', [x + dx * 0.12 + Math.cos(ry) * 0.2, CLOCK_FACE_Y + 0.17, z + dz * 0.12 - Math.sin(ry) * 0.2], [0, ry, -0.95]);
      }
    }
    b.block(2.4, 0.2, 2.4, STONE, [0, 8.7, 0]);
  }
  if (stage >= 4) {
    // the belfry: four posts, the bell, a blue spire and a gold finial
    for (const [x, z] of [[0.9, 0.9], [0.9, -0.9], [-0.9, 0.9], [-0.9, -0.9]] as const) b.block(0.22, 1.3, 0.22, STONE, [x, 8.9, z]);
    b.cone(0.5, 0.6, PAL.gold, [0, 9.25, 0], 12);
    b.sphere(0.12, PAL.gold, [0, 9.2, 0], 1);
    b.block(2.3, 0.18, 2.3, STONE, [0, 10.2, 0]);
    b.cone(1.55, 2.2, ROOF, [0, 10.38, 0], 4, [0, Math.PI / 4, 0]);
    b.cyl(0.04, 0.04, 0.5, PAL.gold, [0, 12.5, 0], 5);
    b.sphere(0.13, PAL.gold, [0, 13.05, 0], 1);
  }
  return b.build();
}

/** Height of the lamp's centre (for the light and the beam). */
export const LAMP_Y = 8.6;

export function lighthouseGeometry(stage: number): THREE.BufferGeometry {
  const b = geo();
  // the rocks of the point are always there; the old dark stump stands on them until the footings are set
  if (stage === 0) {
    for (const [x, z, r] of [[0, 0, 1.6], [1.4, 0.7, 1.0], [-1.2, 1.0, 0.9], [0.8, -1.3, 1.0]] as const) b.sphere(r, x || z ? STONE_D : STONE, [x, r * 0.25, z], 1, [1, 0.45, 1]);
    b.cyl(0.9, 1.1, 1.4, '#9a948a', [0, 0.5, 0], 12);
  }
  if (stage >= 1) {
    for (const [x, z, r] of [[0, 0, 1.9], [1.6, 0.8, 1.1], [-1.4, 1.2, 1.0], [0.9, -1.5, 1.2], [-1.2, -1.1, 0.9]] as const) b.sphere(r, x || z ? STONE_D : STONE, [x, r * 0.25, z], 1, [1, 0.45, 1]);
    b.cyl(1.7, 1.8, 0.4, STONE, [0, 0.55, 0], 16);
  }
  if (stage >= 2) {
    // a tapered white tower with two red bands and a door
    const segs: [number, number, number, string][] = [[0.95, 1.4, 2.0, WHITE], [0.88, 0.95, 0.9, RED], [0.8, 0.88, 2.0, WHITE], [0.74, 0.8, 0.9, RED], [0.7, 0.74, 1.6, WHITE]];
    let y = 0.95;
    for (const [rt, rb, h, c] of segs) { b.cyl(rt, rb, h, c, [0, y, 0], 16); y += h; }
    b.block(0.55, 1.0, 0.1, '#7a4a2a', [0, 0.95, 1.3]);
    for (const yy of [3.4, 5.6]) b.block(0.22, 0.4, 0.06, '#3a3a46', [0, yy, 0.86 - (yy - 3.4) * 0.03]);
  }
  if (stage >= 3) {
    // the gallery, the glazed lamp room and its red dome
    b.cyl(1.15, 1.15, 0.15, '#3a3a46', [0, 8.35, 0], 18);
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; b.cyl(0.03, 0.03, 0.45, '#3a3a46', [Math.cos(a) * 1.08, 8.5, Math.sin(a) * 1.08], 4); }
    b.torus(1.08, 0.03, '#3a3a46', [0, 8.95, 0], [Math.PI / 2, 0, 0]);
    b.cyl(0.62, 0.62, 1.1, '#bfe8ff', [0, 8.5, 0], 12);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; b.cyl(0.035, 0.035, 1.1, '#3a3a46', [Math.cos(a) * 0.62, 8.5, Math.sin(a) * 0.62], 4); }
    b.cone(0.72, 0.7, RED, [0, 9.6, 0], 12);
    b.sphere(0.12, PAL.gold, [0, 10.35, 0], 1);
  }
  if (stage >= 4) b.sphere(0.32, '#fff2a8', [0, LAMP_Y, 0], 1);
  return b.build();
}

/** 1.42 The Observatory: a round stone tower with a copper dome and a brass telescope (0 = nothing yet, 4 = finished). */
export function observatoryGeometry(stage: number): THREE.BufferGeometry {
  const b = geo();
  if (stage === 0) for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; b.block(0.5, 0.25, 0.45, k % 2 ? STONE : STONE_D, [Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3], [0, a, 0]); }
  if (stage >= 1) b.cyl(1.8, 1.9, 0.4, STONE_D, [0, 0, 0], 18);
  if (stage >= 2) {
    b.cyl(1.35, 1.45, 4.2, STONE, [0, 0.4, 0], 18);
    b.cyl(1.42, 1.42, 0.2, STONE_D, [0, 2.4, 0], 18);
    b.block(0.6, 1.2, 0.1, '#6a4a2e', [0, 0.4, 1.4]);
    for (const a of [0.8, 2.4, 4.0]) b.block(0.3, 0.5, 0.06, '#3a3a52', [Math.sin(a) * 1.42, 2.9, Math.cos(a) * 1.42], [0, a, 0]);
  }
  if (stage >= 3) {
    // the copper dome with its slit
    b.sphere(1.5, '#5fa89a', [0, 4.6, 0], 1, [1, 0.85, 1]);
    b.block(0.32, 1.5, 0.2, '#2a2f44', [0, 4.7, 1.25], [-0.5, 0, 0]);
    b.sphere(0.12, PAL.gold, [0, 5.95, 0], 1);
  }
  if (stage >= 4) {
    // the telescope peeping out of the slit, and a little star flag
    b.cyl(0.16, 0.22, 1.6, '#d9a43a', [0, 5.0, 1.0], 10, [1.0, 0, 0]);
    b.cyl(0.02, 0.02, 1.0, '#3a3a46', [1.0, 5.6, 0], 4);
    b.block(0.45, 0.3, 0.02, '#2a3a8a', [1.23, 6.4, 0]);
    b.sphere(0.07, '#fff2a8', [1.2, 6.4, 0.02], 0);
  }
  return b.build();
}

/** 1.42 The Windmill Mill: a white tower mill with a thatched cap and four sails (0 = nothing yet, 4 = finished). */
export function windmillGeometry(stage: number): THREE.BufferGeometry {
  const b = geo();
  if (stage === 0) for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; b.block(0.6, 0.18, 0.18, '#8a6a48', [Math.cos(a) * 1.2, 0.05, Math.sin(a) * 1.2], [0, a, 0]); }
  if (stage >= 1) b.cyl(1.7, 1.8, 0.35, STONE_D, [0, 0, 0], 16);
  if (stage >= 2) {
    b.cyl(0.95, 1.4, 4.6, WHITE, [0, 0.35, 0], 16);
    b.block(0.55, 1.0, 0.1, '#6a4a2e', [0, 0.35, 1.32]);
    for (const y of [2.2, 3.6]) b.block(0.3, 0.4, 0.06, '#3a3a46', [0, y, 1.3 - (y - 2.2) * 0.17]);
    for (let k = 0; k < 3; k++) b.block(0.7, 0.5, 0.6, '#e6cfa6', [1.3 + (k % 2) * 0.2, 0.35, -0.6 + k * 0.6]);
  }
  if (stage >= 3) b.cone(1.25, 1.3, '#c99a4a', [0, 4.95, 0], 12);
  if (stage >= 4) {
    // the sails on the front of the cap
    b.cyl(0.14, 0.14, 0.5, '#5a3a22', [0, 5.2, 1.0], 8, [Math.PI / 2, 0, 0]);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const x = Math.cos(a) * 1.55, y = 5.2 + Math.sin(a) * 1.55;
      b.block(0.08, 3.1, 0.06, '#5a3a22', [Math.cos(a) * 0.0, 5.2, 1.3], [0, 0, a - Math.PI / 2]);
      b.box(0.55, 2.4, 0.03, '#f2efe6', [x * 0.55, y - (y - 5.2) * 0.45, 1.33], [0, 0, a - Math.PI / 2]);
    }
  }
  return b.build();
}
