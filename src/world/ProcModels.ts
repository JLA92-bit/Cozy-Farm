import * as THREE from 'three';
import { geo, PAL, rng, type GeoBuilder } from './Procedural';
import { assets } from '../core/Assets';
import { FENCE_MODELS } from './models/Fences';

/**
 * Procedurally built models (fallbacks where no CC0 model fitted). Sizes are in tiles (1 unit = 1 tile).
 * Builders may splice in flat-coloured Kenney geometry via `kit()` so they stay stylistically consistent.
 */
type V3 = [number, number, number];

/** Add an already-loaded flat-coloured static model into a builder. */
function kit(b: GeoBuilder, id: string, pos: V3, scale = 1, rotY = 0): GeoBuilder {
  const m = assets.getStatic(id);
  if (!m || m.material !== assets.vertexMaterial) return b;
  const g = m.geometry.clone();
  g.deleteAttribute('uv');
  return b.geometry(g, null, pos, [0, rotY, 0], [scale, scale, scale]);
}

function fencePosts(b: GeoBuilder, w: number, d: number, color: string = PAL.woodLight, gate = true): void {
  const hw = w / 2 - 0.08, hd = d / 2 - 0.08;
  const posts: V3[] = [];
  for (let x = -hw; x <= hw + 0.01; x += w / 4) { posts.push([x, 0, -hd], [x, 0, hd]); }
  for (let z = -hd + d / 4; z < hd - 0.01; z += d / 4) { posts.push([-hw, 0, z], [hw, 0, z]); }
  for (const p of posts) b.block(0.1, 0.55, 0.1, PAL.woodDark, p);
  // rails
  for (const y of [0.22, 0.42]) {
    b.box(w - 0.12, 0.07, 0.05, color, [0, y, -hd]);
    if (gate) {
      b.box(w / 2 - 0.5, 0.07, 0.05, color, [-w / 4 - 0.25, y, hd]);
      b.box(w / 2 - 0.5, 0.07, 0.05, color, [w / 4 + 0.25, y, hd]);
    } else b.box(w - 0.12, 0.07, 0.05, color, [0, y, hd]);
    b.box(0.05, 0.07, d - 0.12, color, [-hw, y, 0]);
    b.box(0.05, 0.07, d - 0.12, color, [hw, y, 0]);
  }
}

function shed(b: GeoBuilder, w: number, d: number, h: number, wall: string, roof: string, pos: V3): void {
  b.block(w, h, d, wall, pos);
  b.box(w + 0.04, 0.06, d + 0.04, PAL.white, [pos[0], pos[1] + h, pos[2]]);
  b.prism(w + 0.25, h * 0.55, d + 0.25, roof, [pos[0], pos[1] + h, pos[2]]);
  b.block(w * 0.36, h * 0.7, 0.04, PAL.woodDark, [pos[0], pos[1], pos[2] + d / 2]);
}

function jar(content: string, lid: string = PAL.red): THREE.BufferGeometry {
  return geo()
    .cyl(0.32, 0.3, 0.55, PAL.glass, [0, 0, 0], 10)
    .cyl(0.28, 0.27, 0.45, content, [0, 0.04, 0], 10)
    .cyl(0.34, 0.34, 0.12, lid, [0, 0.55, 0], 10)
    .box(0.4, 0.18, 0.02, PAL.cream, [0, 0.28, 0.31])
    .build();
}

function sack(tag: string): THREE.BufferGeometry {
  return geo()
    .sphere(0.36, '#e8d3a2', [0, 0.33, 0], 1, [1, 1.05, 0.85])
    .cyl(0.12, 0.2, 0.2, '#d8bf88', [0, 0.62, 0], 7)
    .box(0.3, 0.2, 0.04, tag, [0, 0.35, 0.3])
    .build();
}

export const PROC: Record<string, () => THREE.BufferGeometry> = {
  ...FENCE_MODELS,
  barn: () => {
    const b = geo();
    b.block(3, 0.12, 3, PAL.stoneDark, [0, 0, 0]);
    b.block(2.2, 1.5, 2.5, PAL.red, [-0.25, 0.1, 0]);
    // gambrel-ish roof: two prisms
    b.prism(2.5, 0.95, 2.7, PAL.redDark, [-0.25, 1.6, 0]);
    b.box(2.26, 0.08, 2.56, PAL.white, [-0.25, 1.6, 0]);
    // doors with white X
    b.block(1.1, 1.1, 0.06, PAL.white, [-0.25, 0.1, 1.26]);
    b.block(1.0, 1.0, 0.07, PAL.redDark, [-0.25, 0.15, 1.27]);
    b.box(1.35, 0.08, 0.04, PAL.white, [-0.25, 0.65, 1.31], [0, 0, 0.75]);
    b.box(1.35, 0.08, 0.04, PAL.white, [-0.25, 0.65, 1.31], [0, 0, -0.75]);
    // hay loft window
    b.block(0.5, 0.42, 0.06, PAL.white, [-0.25, 1.68, 1.33]);
    b.block(0.4, 0.32, 0.07, PAL.hay, [-0.25, 1.73, 1.34]);
    // silo
    b.cyl(0.48, 0.48, 2.3, '#c9ced6', [1.15, 0.1, -0.5], 10);
    b.cyl(0.5, 0.5, 0.08, PAL.metal, [1.15, 0.9, -0.5], 10);
    b.cyl(0.5, 0.5, 0.08, PAL.metal, [1.15, 1.6, -0.5], 10);
    b.sphere(0.48, PAL.roofBlue, [1.15, 2.4, -0.5], 1, [1, 0.6, 1]);
    // hay bales by the door
    b.cyl(0.22, 0.22, 0.35, PAL.hay, [0.75, 0.32, 1.1], 8, [Math.PI / 2, 0, 0]);
    b.cyl(0.22, 0.22, 0.35, PAL.hayDark, [1.15, 0.32, 1.25], 8, [Math.PI / 2, 0, 0.3]);
    return b.build();
  },
  order_board: () => {
    const b = geo();
    b.block(0.14, 1.5, 0.14, PAL.woodDark, [-0.7, 0, 0]);
    b.block(0.14, 1.5, 0.14, PAL.woodDark, [0.7, 0, 0]);
    b.block(1.7, 1.0, 0.1, PAL.wood, [0, 0.5, 0]);
    b.block(1.55, 0.86, 0.04, '#e8c48c', [0, 0.57, 0.06]);
    b.prism(1.95, 0.32, 0.45, PAL.roof, [0, 1.5, 0]);
    const notes = ['#fff6df', '#ffe066', '#bfe8ff', '#ffc2d6', '#d9f7c0'];
    for (let i = 0; i < 5; i++) {
      b.box(0.3, 0.3, 0.02, notes[i], [-0.55 + (i % 3) * 0.55, 0.95 - Math.floor(i / 3) * 0.38, 0.09], [0, 0, (i - 2) * 0.08]);
      b.box(0.05, 0.05, 0.03, PAL.red, [-0.55 + (i % 3) * 0.55, 1.08 - Math.floor(i / 3) * 0.38, 0.1]);
    }
    b.block(0.5, 0.3, 0.35, PAL.wood, [0.55, 0, 0.5]);
    b.block(0.38, 0.22, 0.32, PAL.woodLight, [-0.5, 0, 0.55]);
    return b.build();
  },
  depot: () => {
    const b = geo();
    b.block(3, 0.1, 3, '#b9b2a5', [0, 0, 0]);
    // loading dock
    b.block(2.8, 0.35, 1.0, PAL.stone, [0, 0.1, -0.95]);
    b.block(2.6, 1.4, 0.9, PAL.wood, [0, 0.45, -1.0]);
    b.prism(2.9, 0.5, 1.2, PAL.roofBlue, [0, 1.85, -1.0]);
    b.block(1.2, 1.0, 0.05, PAL.woodDark, [0, 0.45, -0.53]);
    // crates and sign
    b.block(0.4, 0.4, 0.4, PAL.woodLight, [-1.1, 0.45, -0.3]);
    b.block(0.35, 0.35, 0.35, PAL.wood, [-1.1, 0.85, -0.3]);
    b.block(0.4, 0.4, 0.4, PAL.woodLight, [1.1, 0.45, -0.3]);
    b.block(0.08, 1.1, 0.08, PAL.woodDark, [1.3, 0.1, 1.2]);
    b.block(0.8, 0.4, 0.06, PAL.yellow, [1.3, 0.85, 1.2]);
    // road stripes
    for (let i = -1; i <= 1; i++) b.box(0.4, 0.02, 0.1, PAL.white, [i * 0.8, 0.11, 0.8]);
    return b.build();
  },
  plot: () => {
    const b = geo();
    b.block(1.92, 0.12, 1.92, PAL.soil, [0, 0, 0]);
    for (let i = 0; i < 4; i++) b.block(1.75, 0.07, 0.24, PAL.soilWet, [0, 0.12, -0.66 + i * 0.44]);
    b.box(1.98, 0.06, 0.06, PAL.dirtDark, [0, 0.06, 0.97]);
    b.box(1.98, 0.06, 0.06, PAL.dirtDark, [0, 0.06, -0.97]);
    b.box(0.06, 0.06, 1.98, PAL.dirtDark, [0.97, 0.06, 0]);
    b.box(0.06, 0.06, 1.98, PAL.dirtDark, [-0.97, 0.06, 0]);
    return b.build();
  },
  coop: () => {
    const b = geo();
    b.block(2.9, 0.06, 2.9, '#d7c38a', [0, 0, 0]);
    fencePosts(b, 2.9, 2.9);
    shed(b, 1.2, 1.0, 0.8, PAL.white, PAL.red, [-0.6, 0.05, -0.65]);
    b.block(0.5, 0.5, 0.5, PAL.hay, [0.7, 0.05, -0.8]);
    b.cyl(0.25, 0.2, 0.15, PAL.woodDark, [0.6, 0.05, 0.6], 8);
    b.cyl(0.2, 0.18, 0.05, PAL.hay, [0.6, 0.2, 0.6], 8);
    return b.build();
  },
  pen_cow: () => penBuilder(PAL.grassDark, PAL.red, '#bfe8ff'),
  pen_sheep: () => penBuilder('#8fd16a', '#3fa9f5', '#bfe8ff'),
  pen_pig: () => penBuilder('#a07850', PAL.orange, '#8a5a33'),
  pen_goat: () => penBuilder('#9bc66a', '#6a7d8f', '#bfe8ff'),
  haybale: () => geo()
    .cyl(0.32, 0.32, 0.55, PAL.hay, [0, 0.32, 0], 9, [Math.PI / 2, 0, 0])
    .cyl(0.33, 0.33, 0.06, PAL.hayDark, [0, 0.32, 0.12], 9, [Math.PI / 2, 0, 0])
    .cyl(0.33, 0.33, 0.06, PAL.hayDark, [0, 0.32, -0.12], 9, [Math.PI / 2, 0, 0])
    .build(),
  flowerbed_red: () => flowerBed('nat/flower_red', '#ff5a5a'),
  flowerbed_yellow: () => flowerBed('nat/flower_yellow', '#ffd23f'),
  flowerbed_purple: () => flowerBed('nat/flower_purple', '#b98cff'),
  flowerpot: () => {
    const b = geo().cyl(0.26, 0.2, 0.36, '#d9774a', [0, 0, 0], 8).cyl(0.28, 0.28, 0.06, '#c4633a', [0, 0.34, 0], 8).cyl(0.23, 0.23, 0.04, PAL.soil, [0, 0.36, 0], 8);
    kit(b, 'nat/flower_red_a', [-0.08, 0.38, 0], 1.3);
    kit(b, 'nat/flower_yellow_a', [0.1, 0.38, 0.06], 1.2);
    kit(b, 'nat/flower_purple_a', [0.02, 0.38, -0.1], 1.25);
    return b.build();
  },
  scarecrow: () => scarecrow(PAL.roofBlue, PAL.hay),
  scarecrow_fest: () => {
    const g = geo();
    addScarecrow(g, '#c0582b', PAL.hay);
    g.sphere(0.18, PAL.orange, [0.32, 0.18, 0.2], 1, [1, 0.8, 1]).sphere(0.15, PAL.orange, [-0.3, 0.15, 0.25], 1, [1, 0.8, 1]);
    g.sphere(0.14, PAL.orange, [0, 1.15, 0.03], 1, [1.1, 0.95, 1]);
    return g.build();
  },
  pond: () => {
    const b = geo();
    const r = rng(5);
    b.cyl(0.95, 0.98, 0.08, PAL.stone, [0, 0, 0], 12);
    b.cyl(0.82, 0.82, 0.09, PAL.water, [0, 0.01, 0], 12);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      b.sphere(0.13 + r() * 0.06, r() > 0.5 ? PAL.stone : PAL.stoneDark, [Math.cos(a) * 0.92, 0.06, Math.sin(a) * 0.92], 0, [1, 0.6, 1]);
    }
    kit(b, 'nat/lily', [0.25, 0.1, 0.1], 1.6);
    kit(b, 'nat/lily', [-0.3, 0.1, -0.2], 1.2);
    kit(b, 'nat/grass_large', [-0.8, 0.0, 0.6], 1.5);
    kit(b, 'nat/grass_large', [0.75, 0.0, -0.65], 1.4);
    return b.build();
  },
  gazebo: () => {
    const b = geo();
    b.cyl(0.95, 0.95, 0.15, PAL.stone, [0, 0, 0], 8);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.block(0.1, 1.2, 0.1, PAL.white, [Math.cos(a) * 0.8, 0.15, Math.sin(a) * 0.8]);
    }
    b.cone(1.15, 0.7, PAL.roofBlue, [0, 1.35, 0], 6);
    b.cyl(1.0, 1.0, 0.08, PAL.white, [0, 1.3, 0], 6);
    b.sphere(0.08, PAL.gold, [0, 2.1, 0], 0);
    b.block(0.9, 0.08, 0.3, PAL.wood, [0, 0.45, 0]);
    return b.build();
  },
  pumpkin_pile: () => {
    const b = geo();
    const put = (x: number, z: number, s: number, c: string) => {
      b.sphere(0.22 * s, c, [x, 0.17 * s, z], 1, [1.1, 0.8, 1.1]);
      b.cyl(0.03, 0.04, 0.12 * s, '#4a7a2a', [x, 0.32 * s, z], 5);
    };
    put(-0.15, 0.1, 1.3, PAL.orange); put(0.22, -0.05, 1.0, '#ff9f3a'); put(0.05, -0.25, 0.8, '#ffb24a'); put(0.05, 0.05, 0.9, PAL.orange);
    b.block(0.5, 0.06, 0.4, PAL.hay, [0.1, 0, 0.25]);
    return b.build();
  },
  harvest_cart: () => {
    const b = geo();
    b.block(1.4, 0.35, 0.7, PAL.wood, [0, 0.3, 0]);
    b.cyl(0.28, 0.28, 0.08, PAL.woodDark, [-0.4, 0.28, 0.4], 10, [Math.PI / 2, 0, 0]);
    b.cyl(0.28, 0.28, 0.08, PAL.woodDark, [0.4, 0.28, 0.4], 10, [Math.PI / 2, 0, 0]);
    b.cyl(0.28, 0.28, 0.08, PAL.woodDark, [-0.4, 0.28, -0.4], 10, [Math.PI / 2, 0, 0]);
    b.cyl(0.28, 0.28, 0.08, PAL.woodDark, [0.4, 0.28, -0.4], 10, [Math.PI / 2, 0, 0]);
    b.sphere(0.2, PAL.orange, [-0.35, 0.78, 0], 1, [1.1, 0.8, 1.1]).sphere(0.17, '#ff9f3a', [0.05, 0.75, 0.1], 1, [1.1, 0.8, 1.1]);
    b.sphere(0.15, PAL.red, [0.35, 0.72, -0.1], 1).sphere(0.12, PAL.yellow, [0.3, 0.72, 0.15], 1);
    b.block(0.12, 0.08, 0.6, PAL.woodDark, [0.85, 0.35, 0]);
    return b.build();
  },
  snowman: () => geo()
    .sphere(0.3, PAL.white, [0, 0.27, 0], 1).sphere(0.22, PAL.white, [0, 0.66, 0], 1).sphere(0.16, PAL.white, [0, 0.95, 0], 1)
    .cone(0.04, 0.18, PAL.orange, [0, 0.93, 0.13], 6, [Math.PI / 2, 0, 0])
    .cyl(0.14, 0.14, 0.2, PAL.black, [0, 1.06, 0], 8).cyl(0.2, 0.2, 0.03, PAL.black, [0, 1.06, 0], 8)
    .torus(0.17, 0.04, PAL.red, [0, 0.82, 0], [Math.PI / 2, 0, 0])
    .build(),
  festive_tree: () => {
    const b = geo().cyl(0.08, 0.1, 0.25, PAL.woodDark, [0, 0, 0], 6)
      .cone(0.5, 0.6, '#2f8f4e', [0, 0.2, 0], 8).cone(0.4, 0.5, '#36a05a', [0, 0.55, 0], 8).cone(0.28, 0.45, '#3fb066', [0, 0.85, 0], 8)
      .sphere(0.09, PAL.yellow, [0, 1.32, 0], 0);
    const r = rng(9);
    for (let i = 0; i < 14; i++) {
      const y = 0.3 + r() * 0.85, rad = (1.25 - y) * 0.42, a = r() * Math.PI * 2;
      b.sphere(0.045, ['#ff4d4d', '#ffd23f', '#5ab8ff', '#ff8fd0'][i % 4], [Math.cos(a) * rad, y, Math.sin(a) * rad], 0);
    }
    return b.build();
  },
  blossom_tree: () => {
    const b = geo().cyl(0.08, 0.12, 0.7, '#8a5a3a', [0, 0, 0], 6);
    const r = rng(3);
    for (let i = 0; i < 7; i++) b.sphere(0.25 + r() * 0.1, ['#ffb3cf', '#ffc9dc', '#ff9fc2'][i % 3], [(r() - 0.5) * 0.6, 0.75 + r() * 0.35, (r() - 0.5) * 0.6], 0);
    return b.build();
  },
  umbrella: () => {
    const b = geo().cyl(0.03, 0.03, 1.2, PAL.white, [0, 0, 0], 6);
    const cols = [PAL.red, PAL.white];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.geometry(new THREE.ConeGeometry(0.62, 0.28, 3, 1, true, a, Math.PI / 4), cols[i % 2], [0, 1.25, 0]);
    }
    b.block(0.6, 0.06, 0.35, PAL.yellow, [0.2, 0, 0.3]);
    return b.build();
  },
  // ---- item thumbnails / small props
  cotton: () => {
    const b = geo();
    for (const p of [[0, 0.2, 0], [0.12, 0.28, 0.05], [-0.1, 0.27, 0.08], [0.03, 0.34, -0.08]] as V3[]) b.sphere(0.11, PAL.wool, p, 1);
    b.cyl(0.02, 0.025, 0.2, '#6a8f3a', [0, 0, 0], 5);
    return b.build();
  },
  wool: () => {
    const b = geo();
    for (const p of [[0, 0.22, 0], [0.18, 0.2, 0.05], [-0.16, 0.2, 0.06], [0.04, 0.3, -0.12], [0.02, 0.36, 0.08]] as V3[]) b.sphere(0.16, PAL.wool, p, 1);
    return b.build();
  },
  sugar: () => geo().block(0.5, 0.5, 0.5, '#ffffff', [0, 0, 0]).block(0.35, 0.35, 0.35, '#f4f4f4', [0.35, 0, 0.2]).block(0.3, 0.3, 0.3, '#fbfbfb', [-0.1, 0.5, 0.05]).build(),
  goat_milk: () => geo().cyl(0.22, 0.25, 0.6, '#f5f2ea', [0, 0, 0], 10).cyl(0.12, 0.2, 0.18, '#f5f2ea', [0, 0.6, 0], 10).cyl(0.13, 0.13, 0.08, PAL.green, [0, 0.78, 0], 10).box(0.3, 0.22, 0.02, '#cde8a8', [0, 0.3, 0.24]).build(),
  feed_chicken: () => sack(PAL.yellow),
  feed_cow: () => sack('#6a6a6a'),
  feed_sheep: () => sack('#a8d8ff'),
  feed_pig: () => sack('#ff9fc2'),
  feed_goat: () => sack('#9bd16a'),
  jam_red: () => jar('#e2304a'),
  jam_gold: () => jar('#f2a530', PAL.green),
  jam_purple: () => jar('#7b3fa8', PAL.gold),
  jam_cherry: () => jar('#b51e3a', '#f7f1e3'),
  jam_orange: () => jar('#ff8c1a', PAL.roofBlue),
  jam_beet: () => jar('#a3214f', PAL.green),
  sauce: () => jar('#d9381e', PAL.green),
  sold_sign: () => geo().block(0.08, 0.6, 0.08, PAL.woodDark, [0, 0, 0]).block(0.5, 0.3, 0.05, PAL.yellow, [0, 0.45, 0]).build(),
  for_sale_sign: () => geo().block(0.1, 1.0, 0.1, PAL.woodDark, [-0.35, 0, 0]).block(0.1, 1.0, 0.1, PAL.woodDark, [0.35, 0, 0]).block(1.0, 0.5, 0.08, '#fff6df', [0, 0.55, 0]).block(0.9, 0.12, 0.09, PAL.red, [0, 0.85, 0]).build(),
  fish_shack: () => {
    const b = geo();
    // boardwalk floor, a weathered blue-grey hut with a red-striped awning, nets, a barrel and a fish sign
    b.block(2.95, 0.1, 2.95, PAL.woodLight, [0, 0, 0]);
    for (let i = 0; i < 6; i++) b.box(2.9, 0.012, 0.03, PAL.wood, [0, 0.105, -1.25 + i * 0.5]);
    b.block(2.2, 1.25, 1.6, '#7f9fb2', [-0.2, 0.1, -0.55]);
    for (let i = 0; i < 4; i++) b.box(2.22, 0.04, 1.62, '#6a889b', [-0.2, 0.32 + i * 0.28, -0.55]);
    b.prism(2.5, 0.75, 1.95, '#4d6f86', [-0.2, 1.35, -0.55]);
    b.box(2.26, 0.07, 1.66, PAL.white, [-0.2, 1.36, -0.55]);
    b.block(0.55, 0.85, 0.05, PAL.woodDark, [-0.6, 0.1, 0.26]);
    b.block(0.5, 0.36, 0.05, PAL.glass, [0.35, 0.6, 0.26]);
    b.box(0.6, 0.06, 0.08, PAL.white, [0.35, 0.58, 0.29]);
    // striped awning over the window
    for (let i = 0; i < 4; i++) b.box(0.18, 0.04, 0.5, i % 2 ? PAL.white : PAL.red, [0.08 + i * 0.18, 1.08, 0.5], [0.45, 0, 0]);
    // fish sign on a post
    b.block(0.08, 1.35, 0.08, PAL.woodDark, [1.15, 0.1, 0.95]);
    b.block(0.7, 0.36, 0.06, '#fff6df', [1.15, 1.05, 0.95]);
    b.sphere(0.13, '#3fa9f5', [1.1, 1.23, 1.0], 1, [1.4, 0.75, 0.4]);
    b.cone(0.08, 0.16, '#3fa9f5', [1.33, 1.15, 1.0], 4, [0, 0, -Math.PI / 2]);
    // barrel, crate of fish and a hanging net
    b.cyl(0.24, 0.22, 0.5, PAL.wood, [1.0, 0.1, -0.3], 10);
    b.cyl(0.25, 0.25, 0.05, PAL.metal, [1.0, 0.45, -0.3], 10);
    b.block(0.5, 0.25, 0.4, PAL.woodLight, [0.25, 0.1, 0.85]);
    for (let i = 0; i < 3; i++) b.sphere(0.07, i % 2 ? '#c9d6de' : '#9fc0d4', [0.1 + i * 0.15, 0.37, 0.85], 0, [1.5, 0.6, 0.7]);
    b.box(0.9, 0.7, 0.02, '#d9c79b', [-1.35, 0.75, -0.2], [0, Math.PI / 2, 0.1]);
    for (let i = 0; i < 4; i++) b.box(0.02, 0.7, 0.025, PAL.woodDark, [-1.37, 0.75, -0.55 + i * 0.22]);
    b.torus(0.18, 0.05, PAL.red, [-1.38, 0.95, 0.5], [0, Math.PI / 2, 0]);
    return b.build();
  },
};

function penBuilder(ground: string, roof: string, trough: string): THREE.BufferGeometry {
  const b = geo();
  b.block(3.9, 0.05, 3.9, ground, [0, 0, 0]);
  fencePosts(b, 3.9, 3.9);
  shed(b, 1.4, 1.0, 0.95, PAL.wood, roof, [-1.0, 0.04, -1.25]);
  b.block(1.0, 0.25, 0.35, PAL.woodDark, [1.0, 0.05, -1.3]);
  b.block(0.9, 0.06, 0.25, trough, [1.0, 0.27, -1.3]);
  b.cyl(0.3, 0.3, 0.45, PAL.hay, [1.3, 0.3, 1.2], 8, [Math.PI / 2, 0, 0]);
  return b.build();
}

function flowerBed(flower: string, accent: string): THREE.BufferGeometry {
  const b = geo();
  b.block(0.92, 0.14, 0.92, PAL.wood, [0, 0, 0]);
  b.block(0.8, 0.06, 0.8, PAL.soil, [0, 0.12, 0]);
  const r = rng(flower.length * 7);
  for (let i = 0; i < 5; i++) {
    const x = (i % 3 - 1) * 0.25 + (r() - 0.5) * 0.08, z = (Math.floor(i / 3) - 0.5) * 0.35 + (r() - 0.5) * 0.08;
    if (assets.getStatic(flower)) kit(b, flower, [x, 0.17, z], 1.4 + r() * 0.3, r() * 6);
    else b.sphere(0.08, accent, [x, 0.3, z], 0);
  }
  return b.build();
}

function addScarecrow(g: GeoBuilder, shirt: string, hat: string): void {
  g.block(0.07, 1.0, 0.07, PAL.woodDark, [0, 0, 0]);
  g.box(0.9, 0.07, 0.07, PAL.woodDark, [0, 0.72, 0]);
  g.block(0.42, 0.42, 0.24, shirt, [0, 0.48, 0]);
  g.box(0.75, 0.13, 0.16, shirt, [0, 0.74, 0]);
  g.sphere(0.17, '#f2dca0', [0, 1.06, 0], 1);
  g.cyl(0.32, 0.32, 0.04, hat, [0, 1.17, 0], 10).cone(0.16, 0.22, hat, [0, 1.19, 0], 10);
  g.sphere(0.03, PAL.black, [-0.06, 1.08, 0.15], 0).sphere(0.03, PAL.black, [0.06, 1.08, 0.15], 0);
  g.box(0.08, 0.1, 0.02, PAL.hay, [0.38, 0.68, 0.06]).box(0.08, 0.1, 0.02, PAL.hay, [-0.38, 0.68, 0.06]);
}
function scarecrow(shirt: string, hat: string): THREE.BufferGeometry {
  const g = geo();
  addScarecrow(g, shirt, hat);
  return g.build();
}

/** Kenney models that procedural builders splice in; preload before building procedural geometry. */
export const PROC_DEPENDENCIES = ['nat/flower_red', 'nat/flower_yellow', 'nat/flower_purple', 'nat/flower_red_a', 'nat/flower_yellow_a', 'nat/flower_purple_a', 'nat/lily', 'nat/grass_large'];

const procCache = new Map<string, THREE.BufferGeometry>();
export function procGeometry(name: string): THREE.BufferGeometry {
  let g = procCache.get(name);
  if (!g) {
    const fn = PROC[name];
    if (!fn) throw new Error(`no procedural model ${name}`);
    g = fn();
    procCache.set(name, g);
  }
  return g;
}
