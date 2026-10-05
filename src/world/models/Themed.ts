import * as THREE from 'three';
import { geo, PAL, rng, type GeoBuilder } from '../Procedural';
import { assets } from '../../core/Assets';

/**
 * Themed decor sets (update 6): cottage garden, zen garden, seaside, fairy, water and wildlife.
 * Each model is a static body (merged, vertex coloured, used for the shop thumbnail, ghost and pooled copies)
 * plus, for the ones that move or light up, an animator that the farm view attaches to the standalone object:
 * koi and ducks drifting, water sparkles, birds visiting the feeder, the lighthouse beam, glass glints and
 * night glows (an additive overlay of the glowing parts that fades in with the night).
 */
type V3 = [number, number, number];

const UP = new THREE.Vector3(0, 1, 0);
/** Cylinder between two points (radius r at a, r2 at c). */
function rod(b: GeoBuilder, a: V3, c: V3, r: number, color: string, seg = 6, r2 = r): GeoBuilder {
  const va = new THREE.Vector3(...a), vc = new THREE.Vector3(...c);
  const dir = vc.clone().sub(va);
  const len = dir.length();
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
  const mid = va.add(vc).multiplyScalar(0.5);
  return b.geometry(new THREE.CylinderGeometry(r2, r, len, seg, 1), color, [mid.x, mid.y, mid.z], [e.x, e.y, e.z]);
}

/** Ring of rounded stones (pond rims). */
function stoneRim(b: GeoBuilder, rx: number, rz: number, n: number, seed: number, y = 0.06, size = 0.13): void {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.1;
    const s = size + r() * size * 0.5;
    b.sphere(s, r() > 0.45 ? PAL.stone : PAL.stoneDark, [Math.cos(a) * rx, y, Math.sin(a) * rz], 0, [1.2, 0.65, 1.1]);
  }
}

function reeds(b: GeoBuilder, x: number, z: number, seed: number, n = 4): void {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const px = x + (r() - 0.5) * 0.18, pz = z + (r() - 0.5) * 0.18, h = 0.35 + r() * 0.25;
    const tx = px + (r() - 0.5) * 0.08, tz = pz + (r() - 0.5) * 0.08;
    rod(b, [px, 0.02, pz], [tx, h, tz], 0.018, '#5f9e3a', 4, 0.012);
    if (i % 2 === 0) b.sphere(0.04, '#8a5528', [tx, h - 0.06, tz], 0, [0.8, 2.0, 0.8]);
  }
  b.sphere(0.12, PAL.grassDark, [x, 0.03, z], 0, [1.3, 0.5, 1.1]);
}

function flowerDot(b: GeoBuilder, x: number, y: number, z: number, color: string, s = 1): void {
  b.sphere(0.045 * s, color, [x, y, z], 0, [1, 0.7, 1]);
  b.sphere(0.018 * s, PAL.yellow, [x, y + 0.025 * s, z], 0);
}

// ------------------------------------------------------------------ shared animation bits
let moteTex: THREE.Texture | null = null;
function softDot(): THREE.Texture {
  if (moteTex) return moteTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.65)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  moteTex = new THREE.CanvasTexture(c);
  return moteTex;
}

const mats = new Map<string, THREE.Material>();
function mat<T extends THREE.Material>(key: string, make: () => T): T {
  let m = mats.get(key) as T | undefined;
  if (!m) { m = make(); mats.set(key, m); }
  return m;
}
const additive = (key: string, color: string, vertexColors = false, side: THREE.Side = THREE.FrontSide): THREE.MeshBasicMaterial =>
  mat(key, () => new THREE.MeshBasicMaterial({
    color: vertexColors ? '#ffffff' : color, vertexColors, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, side, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));

const geoCache = new Map<string, THREE.BufferGeometry>();
function cachedGeo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material = assets.vertexMaterial, shadow = false): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.castShadow = shadow;
  return o;
}

/** Little four-point twinkles lying on a water surface. They grow and shrink in turn (one shared material). */
function sparkles(parent: THREE.Object3D, rx: number, rz: number, y: number, n: number, seed: number, cx = 0, cz = 0): (t: number, night: number) => void {
  const g = cachedGeo('sparkle', () => {
    const s = new THREE.BufferGeometry();
    const v = [0, 0, -0.07, 0.018, 0, 0, -0.018, 0, 0, 0, 0, 0.07, -0.018, 0, 0, 0.018, 0, 0,
      -0.07, 0, 0, 0, 0, 0.018, 0, 0, -0.018, 0.07, 0, 0, 0, 0, -0.018, 0, 0, 0.018];
    s.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    return s;
  });
  const m = mat('sparkle', () => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  const r = rng(seed);
  const items = Array.from({ length: n }, () => {
    const o = new THREE.Mesh(g, m);
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.85;
    o.position.set(cx + Math.cos(a) * rx * d, y, cz + Math.sin(a) * rz * d);
    o.rotation.y = r() * Math.PI;
    parent.add(o);
    return { o, ph: r() * 10, sp: 0.6 + r() * 0.5 };
  });
  return (t, night) => {
    for (const s of items) {
      const k = Math.max(0, Math.sin(t * s.sp * 2 + s.ph));
      const sc = k * k * k * (1 - night * 0.5) + 0.001;
      s.o.scale.setScalar(sc);
      s.o.visible = sc > 0.02;
    }
  };
}

// ------------------------------------------------------------------ models
export interface ThemedModel {
  body: (b: GeoBuilder) => void;
  /** Parts that light up at night (drawn by day as well; an additive copy fades in after dusk). */
  glow?: (b: GeoBuilder) => void;
  /** Night overlay colour; omit to glow in each part's own vertex colour. */
  glowColor?: string;
  glowStrength?: number;
  /** Colour and position (model space) of the halo sprite for decor with a `glow` value. */
  halo?: { color: string; at?: V3; pool?: string };
  /** Extra moving parts. Returns a per-frame update. */
  anim?: (inner: THREE.Object3D, seed: number) => (dt: number, t: number, night: number) => void;
  /** Keep the piece standalone (not pooled) even without an animator, e.g. for the glass. */
}

function koiGeo(main: string, spot: string): THREE.BufferGeometry {
  return geo()
    .sphere(0.06, main, [0, 0, 0], 1, [1.9, 0.55, 0.85])
    .sphere(0.035, spot, [0.03, 0.02, 0.01], 0, [1.3, 0.5, 1])
    .sphere(0.028, spot, [-0.05, 0.02, -0.01], 0, [1.2, 0.5, 1])
    .geometry(new THREE.ConeGeometry(0.05, 0.09, 4), main, [-0.14, 0, 0], [0, 0, Math.PI / 2], [1, 1, 0.35])
    .box(0.05, 0.008, 0.07, main, [0.0, 0, 0.0])
    .build();
}

function duckGeo(body: string, scale: number): THREE.BufferGeometry {
  const s = scale;
  return geo()
    .sphere(0.12 * s, body, [0, 0.06 * s, 0], 1, [1.35, 0.8, 1])
    .sphere(0.07 * s, body, [-0.13 * s, 0.11 * s, 0], 0, [1.2, 0.7, 0.8])
    .sphere(0.075 * s, body, [0.11 * s, 0.2 * s, 0], 1)
    .cone(0.035 * s, 0.09 * s, PAL.orange, [0.2 * s, 0.17 * s, 0], 5, [0, 0, -Math.PI / 2])
    .sphere(0.016 * s, PAL.black, [0.15 * s, 0.23 * s, 0.05 * s], 0)
    .sphere(0.016 * s, PAL.black, [0.15 * s, 0.23 * s, -0.05 * s], 0)
    .sphere(0.06 * s, body === PAL.white ? '#f1e6cf' : '#f5c21b', [-0.02 * s, 0.1 * s, 0.075 * s], 0, [1.6, 0.6, 0.5])
    .sphere(0.06 * s, body === PAL.white ? '#f1e6cf' : '#f5c21b', [-0.02 * s, 0.1 * s, -0.075 * s], 0, [1.6, 0.6, 0.5])
    .build();
}

function birdParts(color: string, belly: string): { body: THREE.BufferGeometry; wing: THREE.BufferGeometry } {
  const body = geo()
    .sphere(0.05, color, [0, 0.05, 0], 1, [1.3, 1, 1])
    .sphere(0.035, belly, [0.02, 0.035, 0], 0, [1.2, 0.8, 1])
    .sphere(0.035, color, [0.05, 0.095, 0], 1)
    .cone(0.012, 0.03, PAL.orange, [0.09, 0.09, 0], 4, [0, 0, -Math.PI / 2])
    .box(0.06, 0.012, 0.035, color, [-0.07, 0.07, 0], [0, 0, 0.35])
    .sphere(0.008, PAL.black, [0.07, 0.105, 0.022], 0).sphere(0.008, PAL.black, [0.07, 0.105, -0.022], 0)
    .build();
  const wing = geo().box(0.06, 0.01, 0.06, color, [0, 0, 0.03]).build();
  return { body, wing };
}

export const THEMED: Record<string, ThemedModel> = {
  // ================================================================ cottage garden
  rose_bush: {
    body: (b) => {
      b.cyl(0.36, 0.4, 0.06, PAL.soil, [0, 0, 0], 10);
      const r = rng(41);
      const leaf = ['#3f8f3a', '#4ea544', '#37803a'];
      const blobs: V3[] = [[0, 0.3, 0], [-0.17, 0.22, 0.08], [0.17, 0.24, -0.05], [0.04, 0.22, 0.18], [-0.05, 0.25, -0.17], [0.03, 0.47, 0.02], [-0.12, 0.42, -0.06], [0.13, 0.41, 0.07]];
      blobs.forEach((p, i) => b.sphere(0.2 - (p[1] > 0.4 ? 0.05 : 0), leaf[i % 3], p, 1));
      const roses = ['#e2384f', '#ff5c7a', '#ff8fb4', '#e2384f'];
      for (let i = 0; i < 14; i++) {
        const a = r() * Math.PI * 2, up = 0.15 + r() * 0.85;
        const rad = 0.22 + (1 - up) * 0.12;
        const p: V3 = [Math.cos(a) * rad, 0.18 + up * 0.38, Math.sin(a) * rad];
        const c = roses[i % roses.length];
        b.sphere(0.058, c, p, 1, [1, 0.8, 1]);
        b.sphere(0.03, i % 2 ? '#b8243a' : '#ffd1dc', [p[0], p[1] + 0.035, p[2]], 0);
      }
    },
  },
  lavender_row: {
    body: (b) => {
      b.block(1.9, 0.12, 0.62, PAL.woodDark, [0, 0, 0]);
      b.block(1.8, 0.13, 0.52, PAL.soil, [0, 0, 0]);
      b.block(1.92, 0.04, 0.08, PAL.wood, [0, 0.12, 0.3]).block(1.92, 0.04, 0.08, PAL.wood, [0, 0.12, -0.3]);
      const r = rng(77);
      const purples = ['#9a6fe0', '#b48cf0', '#8a5fd0'];
      for (let i = 0; i < 7; i++) {
        const cx = -0.78 + i * 0.26, cz = (i % 2 ? 0.07 : -0.07);
        b.sphere(0.13, '#7fa36a', [cx, 0.17, cz], 0, [1, 0.6, 1]);
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2 + r(), d = 0.03 + r() * 0.09;
          const bx = cx + Math.cos(a) * d, bz = cz + Math.sin(a) * d, h = 0.36 + r() * 0.2;
          const tx = bx + Math.cos(a) * 0.06, tz = bz + Math.sin(a) * 0.06;
          rod(b, [bx, 0.15, bz], [tx, h, tz], 0.012, '#6d9a52', 4);
          b.sphere(0.035, purples[(i + k) % 3], [tx, h + 0.05, tz], 0, [0.75, 2.1, 0.75]);
        }
      }
    },
  },
  watering_fountain: {
    body: (b) => {
      b.cyl(0.48, 0.5, 0.2, PAL.stone, [0, 0, 0], 12);
      b.cyl(0.4, 0.4, 0.03, '#58bfe0', [0, 0.18, 0], 12);
      b.torus(0.44, 0.045, '#bdbdb2', [0, 0.2, 0], [Math.PI / 2, 0, 0]);
      // pedestal at the back with the big tilted watering can
      b.cyl(0.13, 0.15, 0.32, PAL.stoneDark, [-0.24, 0.18, -0.12], 8);
      const can = '#5fb3a8', trim = '#3f8f86';
      b.geometry(new THREE.CylinderGeometry(0.16, 0.18, 0.3, 12, 1), can, [-0.22, 0.66, -0.12], [0, 0, -0.5]);
      b.geometry(new THREE.CylinderGeometry(0.17, 0.17, 0.035, 12, 1), trim, [-0.15, 0.79, -0.12], [0, 0, -0.5]);
      b.geometry(new THREE.CylinderGeometry(0.185, 0.185, 0.035, 12, 1), trim, [-0.29, 0.53, -0.12], [0, 0, -0.5]);
      b.geometry(new THREE.TorusGeometry(0.12, 0.022, 5, 10, Math.PI), trim, [-0.31, 0.8, -0.12], [0, 0, 0.9]);
      rod(b, [-0.1, 0.58, -0.12], [0.16, 0.72, -0.12], 0.035, can, 6, 0.025);
      b.geometry(new THREE.CylinderGeometry(0.07, 0.03, 0.06, 8, 1), PAL.gold, [0.18, 0.73, -0.12], [0, 0, -1.1]);
      // flowers around the rim
      const fl = ['#ff8fb4', '#ffcf3f', '#ffffff', '#a77bf3'];
      for (let i = 0; i < 7; i++) {
        const a = 0.6 + (i / 7) * Math.PI * 1.3;
        b.sphere(0.07, PAL.leaf, [Math.cos(a) * 0.5, 0.05, Math.sin(a) * 0.5], 0, [1, 0.7, 1]);
        flowerDot(b, Math.cos(a) * 0.5, 0.11, Math.sin(a) * 0.5, fl[i % 4], 1.1);
      }
    },
    anim: (inner, seed) => {
      // a stream of drops arcs from the rose into the basin
      const g = cachedGeo('drop', () => geo().sphere(0.022, '#d6f4ff', [0, 0, 0], 0).build());
      const m = mat('drop', () => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }));
      const n = 9;
      const drops = Array.from({ length: n }, () => { const d = mesh(g, m); inner.add(d); return d; });
      const sp = sparkles(inner, 0.32, 0.32, 0.215, 5, seed);
      const start = new THREE.Vector3(0.2, 0.72, -0.12);
      return (_dt, t, night) => {
        for (let i = 0; i < n; i++) {
          const k = ((t * 1.3 + i / n) % 1);
          const x = start.x + k * 0.12, y = start.y - k * 0.1 - k * k * 0.43;
          drops[i].position.set(x, y, start.z + Math.sin(i * 2.1) * 0.015 * k);
          drops[i].scale.setScalar(0.7 + k * 0.5);
        }
        sp(t, night);
      };
    },
  },
  greenhouse: {
    body: (b) => {
      b.block(1.8, 0.22, 1.56, '#b0623e', [0, 0, 0]);
      b.block(1.86, 0.04, 1.62, PAL.cream, [0, 0.22, 0]);
      b.block(1.7, 0.02, 1.46, '#c9b48e', [0, 0.22, 0]);
      const f = PAL.white;
      // frame posts, eaves and ridge
      for (const x of [-0.86, -0.29, 0.29, 0.86]) for (const z of [-0.74, 0.74]) b.block(0.05, 0.75, 0.05, f, [x, 0.24, z]);
      for (const z of [-0.25, 0.25]) for (const x of [-0.86, 0.86]) b.block(0.05, 0.75, 0.05, f, [x, 0.24, z]);
      for (const z of [-0.74, 0.74]) b.box(1.78, 0.05, 0.05, f, [0, 0.99, z]);
      for (const x of [-0.86, 0.86]) b.box(0.05, 0.05, 1.5, f, [x, 0.99, 0]);
      b.box(1.86, 0.06, 0.06, f, [0, 1.56, 0]);
      for (const x of [-0.86, -0.29, 0.29, 0.86]) for (const s of [1, -1]) {
        rod(b, [x, 0.99, s * 0.74], [x, 1.56, 0], 0.025, f, 4);
      }
      // gable ends
      for (const x of [-0.86, 0.86]) rod(b, [x, 0.99, 0], [x, 1.56, 0], 0.02, f, 4);
      // door at the front
      b.block(0.42, 0.7, 0.04, f, [0, 0.24, 0.75]);
      b.block(0.34, 0.62, 0.03, '#9fd6e8', [0, 0.27, 0.76]);
      b.sphere(0.025, PAL.gold, [0.12, 0.55, 0.79], 0);
      // inside: benches of pots and tomato plants
      for (const z of [-0.45, 0.42]) {
        b.block(1.5, 0.05, 0.36, PAL.wood, [0, 0.52, z]);
        for (const x of [-0.65, 0.65]) b.block(0.05, 0.3, 0.05, PAL.woodDark, [x, 0.24, z]);
        for (let i = 0; i < 5; i++) {
          const x = -0.6 + i * 0.3;
          b.cyl(0.08, 0.06, 0.1, '#c96a3f', [x, 0.57, z], 8);
          b.sphere(0.11, i % 2 ? '#4fae3a' : '#62c447', [x, 0.72, z], 0);
          if (i % 2 === 0) b.sphere(0.035, PAL.red, [x + 0.05, 0.72, z + 0.08], 0).sphere(0.03, PAL.red, [x - 0.05, 0.78, z + 0.06], 0);
          else b.sphere(0.03, PAL.yellow, [x + 0.04, 0.8, z + 0.05], 0);
        }
      }
      b.sphere(0.15, '#5fb83c', [0.75, 0.38, 0.95], 0).sphere(0.06, PAL.pink, [0.8, 0.48, 1.0], 0);
    },
    halo: { color: '#ffe0a0', at: [0, 0.7, 0] },
    anim: (inner, seed) => {
      const glass = mat('glass', () => new THREE.MeshLambertMaterial({ color: '#d4f2ff', transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
      const gg = cachedGeo('greenhouse_glass', () => {
        const b = geo();
        for (const z of [-0.74, 0.74]) b.box(1.72, 0.75, 0.015, '#ffffff', [0, 0.615, z]);
        for (const x of [-0.86, 0.86]) b.box(0.015, 0.75, 1.48, '#ffffff', [x, 0.615, 0]);
        const L = Math.hypot(0.74, 0.57), ang = Math.atan2(0.57, 0.74);
        b.box(1.72, 0.015, L, '#ffffff', [0, 1.275, 0.37], [ang, 0, 0]);
        b.box(1.72, 0.015, L, '#ffffff', [0, 1.275, -0.37], [-ang, 0, 0]);
        for (const x of [-0.86, 0.86]) {
          const tri = new THREE.BufferGeometry();
          tri.setAttribute('position', new THREE.Float32BufferAttribute([x, 0.99, -0.74, x, 0.99, 0.74, x, 1.56, 0], 3));
          b.geometry(tri, '#ffffff');
        }
        return b.build();
      });
      const gm = mesh(gg, glass);
      gm.renderOrder = 2;
      inner.add(gm);
      // a bright glint sweeps along the roof now and then
      const L = Math.hypot(0.74, 0.57), ang = Math.atan2(0.57, 0.74);
      const glintMat = additive('glint', '#ffffff', false, THREE.DoubleSide);
      const pane = new THREE.Group();
      pane.position.set(0, 1.285, 0.37);
      pane.rotation.x = ang;
      const glint = mesh(new THREE.PlaneGeometry(0.16, L * 0.96), glintMat);
      glint.rotation.x = -Math.PI / 2;
      glint.rotation.z = 0.35;
      glint.renderOrder = 3;
      pane.add(glint);
      inner.add(pane);
      const wall = mesh(new THREE.PlaneGeometry(0.12, 0.7), glintMat);
      wall.position.set(0, 0.62, 0.755);
      wall.rotation.z = 0.35;
      wall.renderOrder = 3;
      inner.add(wall);
      const ph = (seed % 7) * 0.9;
      return (_dt, t, night) => {
        const k = ((t + ph) % 6) / 1.6;
        const on = k < 1;
        glint.visible = wall.visible = on;
        if (on) {
          glint.position.x = -0.95 + k * 1.9;
          wall.position.x = -0.95 + Math.max(0, k - 0.15) * 2.2;
          glintMat.opacity = Math.sin(k * Math.PI) * 0.55 * (1 - night);
        }
      };
    },
  },

  // ================================================================ zen garden
  stone_lantern: {
    body: (b) => {
      const s = '#b9b6aa', d = '#9a978c';
      b.cyl(0.3, 0.34, 0.08, d, [0, 0, 0], 6);
      b.cyl(0.2, 0.24, 0.1, s, [0, 0.08, 0], 6);
      b.cyl(0.09, 0.11, 0.42, s, [0, 0.18, 0], 6);
      b.cyl(0.24, 0.16, 0.1, d, [0, 0.6, 0], 6);
      b.block(0.32, 0.26, 0.32, s, [0, 0.7, 0]);
      b.cyl(0.04, 0.46, 0.2, d, [0, 0.96, 0], 6);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.sphere(0.045, d, [Math.cos(a) * 0.44, 0.99, Math.sin(a) * 0.44], 0);
      }
      b.sphere(0.07, s, [0, 1.18, 0], 0, [1, 1.3, 1]);
      b.sphere(0.08, '#6f9a4a', [0.17, 0.08, 0.16], 0, [1.5, 0.4, 1]);
    },
    glow: (b) => {
      b.box(0.17, 0.15, 0.02, '#ffd27a', [0, 0.83, 0.162]).box(0.02, 0.15, 0.17, '#ffd27a', [0.162, 0.83, 0]);
      b.box(0.17, 0.15, 0.02, '#ffd27a', [0, 0.83, -0.162]).box(0.02, 0.15, 0.17, '#ffd27a', [-0.162, 0.83, 0]);
    },
    glowColor: '#ffbb55',
    halo: { color: '#ffcf7a', at: [0, 0.83, 0] },
  },
  bonsai: {
    body: (b) => {
      b.block(0.86, 0.08, 0.6, '#8a8a82', [0, 0, 0]);
      b.block(0.6, 0.15, 0.4, '#3d6fb0', [0, 0.08, 0]);
      b.block(0.64, 0.035, 0.44, '#2f5a94', [0, 0.23, 0]);
      b.block(0.54, 0.02, 0.34, '#6e4a2c', [0, 0.23, 0]);
      b.sphere(0.06, '#8fc06a', [0.15, 0.255, 0.08], 0, [1.6, 0.4, 1.2]);
      const bark = '#6e4a32';
      rod(b, [-0.05, 0.24, 0], [0.06, 0.45, 0.02], 0.06, bark, 6, 0.05);
      rod(b, [0.06, 0.45, 0.02], [-0.06, 0.62, -0.02], 0.05, bark, 6, 0.04);
      rod(b, [-0.06, 0.62, -0.02], [0.02, 0.76, 0], 0.04, bark, 6, 0.03);
      rod(b, [0.06, 0.45, 0.02], [0.26, 0.52, 0.04], 0.035, bark, 5, 0.025);
      rod(b, [-0.06, 0.6, -0.02], [-0.25, 0.66, 0.02], 0.03, bark, 5, 0.02);
      const g = ['#3f8f4a', '#4ea55a', '#357a3f'];
      b.sphere(0.15, g[0], [0.28, 0.56, 0.04], 1, [1.4, 0.5, 1.1]);
      b.sphere(0.14, g[1], [-0.27, 0.69, 0.02], 1, [1.4, 0.5, 1.1]);
      b.sphere(0.17, g[2], [0.02, 0.82, 0], 1, [1.5, 0.55, 1.2]);
      b.sphere(0.1, g[1], [0.1, 0.9, 0.04], 1, [1.4, 0.5, 1.1]);
    },
  },
  raked_sand: {
    body: (b) => {
      const sand = '#efe3c4', groove = '#d9c9a0';
      b.block(1.96, 0.08, 1.96, '#8a7a62', [0, 0, 0]);
      b.block(1.84, 0.1, 1.84, sand, [0, 0, 0]);
      for (let i = 0; i < 11; i++) b.box(1.8, 0.012, 0.035, groove, [0, 0.105, -0.8 + i * 0.16]);
      const rocks: [number, number, number][] = [[-0.38, -0.3, 0.2], [0.42, 0.36, 0.15]];
      for (const [x, z, s] of rocks) {
        b.cyl(s + 0.3, s + 0.3, 0.012, sand, [x, 0.1, z], 18);
        for (const rr of [s + 0.1, s + 0.2, s + 0.3]) b.geometry(new THREE.TorusGeometry(rr, 0.016, 3, 22), groove, [x, 0.113, z], [Math.PI / 2, 0, 0]);
      }
      b.sphere(0.2, '#8f8d86', [-0.38, 0.14, -0.3], 0, [1.2, 0.95, 1]);
      b.sphere(0.12, '#a5a39b', [-0.22, 0.12, -0.18], 0, [1.1, 0.8, 1]);
      b.sphere(0.13, '#7d7b74', [0.42, 0.14, 0.36], 0, [1.3, 1.1, 1]);
      b.sphere(0.12, '#6f9a4a', [-0.4, 0.26, -0.33], 0, [1.2, 0.3, 1]);
      b.sphere(0.09, '#6f9a4a', [0.75, 0.1, -0.78], 0, [1.6, 0.4, 1.3]);
      b.sphere(0.07, '#6f9a4a', [-0.8, 0.1, 0.75], 0, [1.6, 0.4, 1.3]);
    },
  },
  koi_pond: {
    body: (b) => {
      b.cyl(0.98, 1.0, 0.07, PAL.stoneDark, [0, 0, 0], 16);
      b.cyl(0.84, 0.84, 0.12, '#2f8fb0', [0, 0, 0], 16);
      stoneRim(b, 0.9, 0.9, 16, 11, 0.07, 0.12);
      // lily pads, a lotus, a little rock island
      for (const [x, z, s] of [[0.42, -0.3, 1], [0.52, -0.08, 0.7], [-0.5, 0.35, 0.85]] as V3[]) {
        b.geometry(new THREE.CylinderGeometry(0.12 * s, 0.12 * s, 0.01, 10, 1, false, 0.4, Math.PI * 1.8), '#5fae4a', [x, 0.125, z]);
      }
      b.sphere(0.05, '#ffb3cf', [0.42, 0.16, -0.3], 0, [1, 0.8, 1]).sphere(0.03, '#fff0f4', [0.42, 0.19, -0.3], 0);
      b.sphere(0.14, '#9a978c', [-0.3, 0.12, -0.42], 0, [1.2, 0.8, 1]);
      b.sphere(0.06, '#6f9a4a', [-0.3, 0.2, -0.42], 0, [1.2, 0.4, 1]);
      reeds(b, -0.82, -0.55, 3, 3);
      reeds(b, 0.7, 0.62, 4, 3);
    },
    anim: (inner, seed) => {
      const kinds: [string, string][] = [['#ff7a2a', '#ffffff'], ['#ffffff', '#e2402c'], ['#ffc22a', '#ff8a2a']];
      const m = mat('koi', () => new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.88 }));
      const fish = kinds.map(([a, c], i) => { const f = mesh(cachedGeo(`koi${i}`, () => koiGeo(a, c)), m); inner.add(f); return f; });
      const sp = sparkles(inner, 0.7, 0.7, 0.128, 6, seed);
      const ph = (seed % 13) * 0.7;
      const pos = (i: number, u: number): [number, number] => {
        if (i === 0) return [Math.sin(u) * 0.55, Math.sin(u) * Math.cos(u) * 0.75];
        if (i === 1) return [Math.cos(u) * 0.5, Math.sin(u) * 0.45 + 0.05];
        return [Math.cos(u) * 0.3 + 0.12, Math.sin(u * 1) * 0.55];
      };
      return (_dt, t, night) => {
        fish.forEach((f, i) => {
          const sp2 = [0.32, -0.26, 0.4][i];
          const u = t * sp2 + ph + i * 2.1;
          const [x, z] = pos(i, u);
          const [x2, z2] = pos(i, u + 0.02 * Math.sign(sp2));
          f.position.set(x, 0.122 + Math.sin(t * 1.3 + i) * 0.003, z);
          f.rotation.y = Math.atan2(-(z2 - z), x2 - x) + Math.sin(t * 7 + i) * 0.18;
        });
        sp(t, night);
      };
    },
  },
  red_bridge: {
    body: (b) => {
      // a little pool under the arch
      b.cyl(0.5, 0.5, 0.04, PAL.stoneDark, [0, 0, 0], 14);
      b.cyl(0.42, 0.42, 0.05, '#4fb8dc', [0, 0, 0], 14);
      stoneRim(b, 0.46, 0.46, 10, 21, 0.04, 0.07);
      const red = '#d8452f', dark = '#8a5528';
      const arc = (x: number) => 0.06 + 0.42 * Math.cos((x / 1.0) * Math.PI / 2);
      const n = 13;
      for (let i = 0; i < n; i++) {
        const x = -0.96 + (i + 0.5) * (1.92 / n);
        const y = arc(x), slope = Math.atan2(arc(x + 0.01) - arc(x - 0.01), 0.02);
        b.box(1.92 / n - 0.012, 0.05, 0.46, i % 2 ? '#a8693a' : '#b87a46', [x, y, 0], [0, 0, slope]);
      }
      // stringer beams under the deck
      for (const z of [-0.2, 0.2]) for (let i = 0; i < n; i++) {
        const xa = -0.96 + i * (1.92 / n), xb = xa + 1.92 / n;
        rod(b, [xa, arc(xa) - 0.05, z], [xb, arc(xb) - 0.05, z], 0.035, dark, 4);
      }
      for (const z of [-0.25, 0.25]) {
        const posts = [-0.92, -0.5, 0, 0.5, 0.92];
        for (const x of posts) {
          b.block(0.05, 0.3, 0.05, red, [x, arc(x) - 0.02, z]);
          b.sphere(0.04, PAL.gold, [x, arc(x) + 0.3, z], 0, [1, 1.3, 1]);
        }
        for (let i = 0; i < 12; i++) {
          const xa = -0.92 + i * (1.84 / 12), xb = xa + 1.84 / 12;
          rod(b, [xa, arc(xa) + 0.26, z], [xb, arc(xb) + 0.26, z], 0.022, red, 4);
          rod(b, [xa, arc(xa) + 0.13, z], [xb, arc(xb) + 0.13, z], 0.014, red, 4);
        }
      }
    },
  },

  // ================================================================ seaside
  beach_hut: {
    body: (b) => {
      b.block(0.98, 0.04, 0.98, PAL.sand, [0, 0, 0]);
      b.block(0.86, 0.08, 0.3, PAL.woodLight, [0, 0.04, 0.32]);
      const stripes = ['#4f9fe0', PAL.white];
      const W = 0.7, D = 0.56, H = 0.72;
      for (let i = 0; i < 7; i++) {
        const c = stripes[i % 2];
        b.block(W / 7, H, 0.03, c, [-W / 2 + (i + 0.5) * W / 7, 0.06, D / 2 - 0.1]);
        b.block(W / 7, H, 0.03, c, [-W / 2 + (i + 0.5) * W / 7, 0.06, -D / 2 - 0.1]);
      }
      for (let i = 0; i < 6; i++) {
        const c = stripes[i % 2];
        b.block(0.03, H, D / 6, c, [W / 2, 0.06, -D / 2 - 0.1 + (i + 0.5) * D / 6]);
        b.block(0.03, H, D / 6, c, [-W / 2, 0.06, -D / 2 - 0.1 + (i + 0.5) * D / 6]);
      }
      // gable front and roof
      const gab = new THREE.Shape();
      gab.moveTo(-W / 2, 0); gab.lineTo(W / 2, 0); gab.lineTo(0, 0.26); gab.closePath();
      b.geometry(new THREE.ExtrudeGeometry(gab, { depth: D, bevelEnabled: false }), PAL.white, [0, 0.78, -D / 2 - 0.1]);
      b.prism(D + 0.16, 0.3, W + 0.2, '#e2533c', [0, 0.76, -0.1], [0, Math.PI / 2, 0]);
      b.block(0.26, 0.5, 0.03, '#2f78c0', [0, 0.1, D / 2 - 0.08]);
      b.sphere(0.02, PAL.gold, [0.08, 0.34, D / 2 - 0.06], 0);
      b.cyl(0.05, 0.05, 0.02, '#fff6c0', [0, 0.85, D / 2 - 0.07], 10, [Math.PI / 2, 0, 0]);
      // life ring and a bucket and spade
      b.torus(0.09, 0.03, PAL.red, [0.25, 0.5, D / 2 - 0.06]);
      b.torus(0.09, 0.031, PAL.white, [0.25, 0.5, D / 2 - 0.065], [0, 0, Math.PI / 4]);
      b.cyl(0.07, 0.05, 0.1, PAL.yellow, [-0.32, 0.04, 0.38], 8);
      rod(b, [-0.22, 0.04, 0.42], [-0.18, 0.26, 0.36], 0.012, PAL.woodDark, 4);
      b.box(0.06, 0.07, 0.01, PAL.red, [-0.225, 0.07, 0.42]);
    },
  },
  rowing_boat: {
    body: (b) => {
      b.sphere(0.5, PAL.sand, [0, 0, 0], 1, [2, 0.06, 1]);
      // chocks
      for (const x of [-0.45, 0.45]) b.block(0.12, 0.12, 0.5, PAL.woodDark, [x, 0, 0]);
      const hull = new THREE.SphereGeometry(0.5, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
      b.geometry(hull, '#3f86d8', [0, 0.38, 0], [0, 0, 0], [1.75, 0.55, 0.72]);
      b.geometry(new THREE.TorusGeometry(0.5, 0.035, 5, 20), PAL.white, [0, 0.36, 0], [Math.PI / 2, 0, 0], [1.75, 0.72, 1]);
      b.geometry(new THREE.TorusGeometry(0.5, 0.03, 5, 20), PAL.woodLight, [0, 0.39, 0], [Math.PI / 2, 0, 0], [1.75, 0.72, 1]);
      b.cyl(0.5, 0.5, 0.02, '#a8693a', [0, 0.33, 0], 16, [0, 0, 0]);
      // scale the floor into the hull ellipse
      b.geometry(new THREE.CylinderGeometry(0.47, 0.47, 0.02, 16), '#c98a4b', [0, 0.34, 0], [0, 0, 0], [1.72, 1, 0.68]);
      for (const x of [-0.3, 0.25]) b.box(0.12, 0.03, 0.6, PAL.woodLight, [x, 0.38, 0]);
      rod(b, [-0.7, 0.4, -0.25], [0.55, 0.43, 0.2], 0.018, PAL.woodLight, 5);
      b.box(0.24, 0.015, 0.08, PAL.woodLight, [0.62, 0.43, 0.23], [0, 0.35, 0]);
      rod(b, [-0.6, 0.4, 0.27], [0.6, 0.42, -0.14], 0.018, PAL.woodLight, 5);
      b.box(0.24, 0.015, 0.08, PAL.woodLight, [0.68, 0.42, -0.17], [0, -0.3, 0]);
      b.torus(0.08, 0.025, '#d9c08a', [0.62, 0.04, 0.32], [Math.PI / 2, 0, 0]);
      b.torus(0.05, 0.022, '#d9c08a', [0.62, 0.07, 0.32], [Math.PI / 2, 0, 0]);
      b.sphere(0.05, PAL.shell ?? '#ffd1c0', [-0.75, 0.04, 0.3], 0, [1, 0.5, 1]);
    },
  },
  lighthouse: {
    body: (b) => {
      const r = rng(8);
      b.cyl(0.95, 1.0, 0.1, '#9a978c', [0, 0, 0], 12);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        b.sphere(0.18 + r() * 0.1, i % 2 ? PAL.stone : PAL.stoneDark, [Math.cos(a) * 0.8, 0.1, Math.sin(a) * 0.8], 0, [1.2, 0.7, 1]);
      }
      // banded tower
      const bands = 6, H = 2.1, r0 = 0.46, r1 = 0.3;
      for (let i = 0; i < bands; i++) {
        const a = i / bands, c = (i + 1) / bands;
        b.cyl(r0 + (r1 - r0) * c, r0 + (r1 - r0) * a, H / bands, i % 2 ? '#e2533c' : PAL.white, [0, 0.1 + a * H, 0], 12);
      }
      b.block(0.18, 0.32, 0.04, '#2f78c0', [0, 0.1, 0.445]);
      b.sphere(0.06, '#2f78c0', [0, 0.42, 0.44], 0, [1.5, 1, 0.4]);
      for (const y of [0.9, 1.5]) b.cyl(0.05, 0.05, 0.02, '#2f4f6f', [0.0, y, 0.43 - (y - 0.1) / H * 0.16], 8, [Math.PI / 2, 0, 0]);
      // gallery
      b.cyl(0.46, 0.4, 0.08, '#4a4a4a', [0, 2.2, 0], 12);
      b.torus(0.43, 0.018, '#4a4a4a', [0, 2.42, 0], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        b.block(0.025, 0.14, 0.025, '#4a4a4a', [Math.cos(a) * 0.43, 2.28, Math.sin(a) * 0.43]);
      }
      b.cyl(0.22, 0.22, 0.04, '#4a4a4a', [0, 2.28, 0], 10);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.block(0.03, 0.34, 0.03, '#3a3a3a', [Math.cos(a) * 0.22, 2.3, Math.sin(a) * 0.22]);
      }
      b.cone(0.3, 0.3, '#e2533c', [0, 2.64, 0], 10);
      b.cyl(0.3, 0.3, 0.03, '#3a3a3a', [0, 2.63, 0], 10);
      b.sphere(0.05, PAL.gold, [0, 2.96, 0], 0);
      // keeper's cottage
      b.block(0.6, 0.42, 0.5, PAL.white, [0.55, 0.1, 0.45]);
      b.prism(0.7, 0.26, 0.62, '#e2533c', [0.55, 0.52, 0.45]);
      b.block(0.16, 0.26, 0.03, '#2f78c0', [0.55, 0.1, 0.71]);
      b.block(0.12, 0.12, 0.03, '#bfe8ff', [0.75, 0.24, 0.71]);
    },
    glow: (b) => {
      b.cyl(0.2, 0.2, 0.34, '#fff1b0', [0, 2.3, 0], 10);
    },
    glowColor: '#ffd56a',
    glowStrength: 1,
    halo: { color: '#ffe08a', at: [0, 2.46, 0] },
    anim: (inner) => {
      const m = mat('beam', () => new THREE.MeshBasicMaterial({ color: '#fff0b0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      const g = cachedGeo('beam', () => {
        const c = new THREE.ConeGeometry(0.55, 4.5, 14, 1, true);
        c.translate(0, -2.25, 0);
        c.rotateZ(Math.PI / 2 - 0.06);
        return c;
      });
      const pivot = new THREE.Group();
      pivot.position.set(0, 2.46, 0);
      const a = mesh(g, m), c = mesh(g, m);
      c.rotation.y = Math.PI;
      a.renderOrder = c.renderOrder = 4;
      pivot.add(a, c);
      inner.add(pivot);
      return (dt, _t, night) => {
        pivot.visible = night > 0.05;
        if (!pivot.visible) return;
        pivot.rotation.y += dt * 0.9;
        m.opacity = night * 0.22;
      };
    },
  },

  // ================================================================ fairy
  crystal_cluster: {
    body: (b) => {
      b.sphere(0.36, '#8a8780', [0, 0.04, 0], 0, [1.25, 0.45, 1.1]);
      b.sphere(0.16, '#9a978c', [0.24, 0.06, 0.18], 0, [1.2, 0.7, 1]);
      b.sphere(0.08, '#6f9a4a', [-0.3, 0.1, 0.22], 0, [1.6, 0.4, 1.2]);
    },
    glow: (b) => {
      const list: [number, number, number, number, number, string][] = [
        [0, 0, 0.11, 0.7, 0, '#b28cff'], [-0.17, 0.05, 0.08, 0.45, 0.45, '#ff9fd8'], [0.16, -0.06, 0.08, 0.5, -0.4, '#8fd8ff'],
        [0.05, 0.16, 0.07, 0.38, -0.5, '#c9a6ff'], [-0.1, -0.16, 0.065, 0.36, 0.5, '#8fd8ff'], [0.22, 0.12, 0.05, 0.26, -0.7, '#ff9fd8'],
      ];
      for (const [x, z, r, h, tilt, c] of list) {
        const rot: V3 = [z * 1.8, 0, tilt];
        const dir = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(...rot));
        const base = new THREE.Vector3(x, 0.12, z);
        const mid = base.clone().addScaledVector(dir, h / 2), tip = base.clone().addScaledVector(dir, h + r * 0.9);
        b.geometry(new THREE.CylinderGeometry(r, r * 0.85, h, 6, 1), c, [mid.x, mid.y, mid.z], rot);
        b.geometry(new THREE.ConeGeometry(r, r * 1.8, 6, 1), c, [tip.x - dir.x * r * 0.9 * 0.5, tip.y - dir.y * r * 0.45, tip.z - dir.z * r * 0.45], rot);
      }
    },
    glowStrength: 0.75,
    halo: { color: '#c7a6ff', at: [0, 0.45, 0], pool: '#b48cff' },
  },
  fairy_door: {
    body: (b) => {
      const bark = '#7a5132', light = '#d9b27a';
      b.cyl(0.34, 0.4, 0.55, bark, [0, 0, 0], 10);
      b.cyl(0.33, 0.33, 0.02, light, [0, 0.55, 0], 10);
      b.torus(0.2, 0.012, '#b58a5a', [0, 0.565, 0], [Math.PI / 2, 0, 0]);
      b.torus(0.1, 0.012, '#b58a5a', [0, 0.565, 0], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.6;
        rod(b, [Math.cos(a) * 0.3, 0.16, Math.sin(a) * 0.3], [Math.cos(a) * 0.52, 0.0, Math.sin(a) * 0.52], 0.07, bark, 5, 0.03);
      }
      // arched door, step and knob
      b.block(0.2, 0.2, 0.05, '#c0582b', [0, 0.04, 0.37]);
      b.geometry(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 10, 1, false, 0, Math.PI), '#c0582b', [0, 0.24, 0.37], [Math.PI / 2, Math.PI / 2, 0]);
      b.geometry(new THREE.TorusGeometry(0.11, 0.018, 4, 10, Math.PI), '#5e3a20', [0, 0.24, 0.39]);
      b.sphere(0.018, PAL.gold, [0.06, 0.15, 0.4], 0);
      b.block(0.26, 0.04, 0.12, '#9a978c', [0, 0, 0.44]);
      // moss, toadstools and a lantern on a twig
      b.sphere(0.13, '#6f9a4a', [-0.18, 0.56, -0.08], 0, [1.4, 0.3, 1.2]);
      b.cyl(0.02, 0.025, 0.1, PAL.cream, [0.32, 0, 0.3], 5).sphere(0.06, PAL.red, [0.32, 0.1, 0.3], 0, [1, 0.6, 1]);
      b.cyl(0.015, 0.02, 0.07, PAL.cream, [0.4, 0, 0.18], 5).sphere(0.045, PAL.red, [0.4, 0.07, 0.18], 0, [1, 0.6, 1]);
      rod(b, [-0.3, 0.0, 0.36], [-0.3, 0.42, 0.38], 0.012, '#5e3a20', 4);
      rod(b, [-0.3, 0.42, 0.38], [-0.22, 0.44, 0.4], 0.01, '#5e3a20', 4);
    },
    glow: (b) => {
      b.cyl(0.06, 0.06, 0.03, '#ffd27a', [0, 0.42, 0.36], 10, [Math.PI / 2, 0, 0]);
      b.sphere(0.035, '#ffe08a', [-0.22, 0.4, 0.4], 0, [1, 1.3, 1]);
    },
    glowColor: '#ffc860',
    halo: { color: '#ffd27a', at: [-0.05, 0.4, 0.4] },
  },
  toadstool_ring: {
    body: (b) => {
      b.cyl(0.98, 0.98, 0.02, '#8fd86a', [0, 0, 0], 20);
      const r = rng(5);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + r() * 0.2, d = 0.72 + r() * 0.1, s = 0.8 + r() * 0.6;
        b.cyl(0.035 * s, 0.05 * s, 0.18 * s, PAL.cream, [Math.cos(a) * d, 0.0, Math.sin(a) * d], 6);
      }
      b.sphere(0.12, '#9a978c', [0, 0.02, 0], 0, [1.4, 0.4, 1.2]);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        flowerDot(b, Math.cos(a) * 0.35, 0.04, Math.sin(a) * 0.35, i % 2 ? '#ffffff' : '#ffd1ec', 0.8);
      }
    },
    glow: (b) => {
      const r = rng(5);
      const caps = ['#ff8fb4', '#b48cf0', '#7fd6ff', '#ffb36b'];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + r() * 0.2, d = 0.72 + r() * 0.1, s = 0.8 + r() * 0.6;
        const x = Math.cos(a) * d, z = Math.sin(a) * d, y = 0.18 * s;
        b.sphere(0.11 * s, caps[i % 4], [x, y, z], 1, [1, 0.6, 1]);
        for (let k = 0; k < 3; k++) {
          const sa = k * 2.1 + i;
          b.sphere(0.022 * s, '#fff6e8', [x + Math.cos(sa) * 0.06 * s, y + 0.045 * s, z + Math.sin(sa) * 0.06 * s], 0);
        }
      }
    },
    glowStrength: 0.85,
    halo: { color: '#b9f0ff', at: [0, 0.3, 0], pool: '#9fe8ff' },
    anim: (inner, seed) => {
      const sm = mat('mote', () => new THREE.SpriteMaterial({ map: softDot(), color: '#fff3b0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      const r = rng(seed);
      const motes = Array.from({ length: 7 }, () => {
        const s = new THREE.Sprite(sm);
        s.scale.setScalar(0.12);
        inner.add(s);
        return { s, a: r() * 6.28, d: 0.15 + r() * 0.5, sp: 0.2 + r() * 0.3, h: 0.25 + r() * 0.35 };
      });
      return (_dt, t, night) => {
        sm.opacity = night;
        for (const m of motes) {
          m.s.visible = night > 0.05;
          if (!m.s.visible) continue;
          const a = m.a + t * m.sp;
          m.s.position.set(Math.cos(a) * m.d, m.h + Math.sin(t * 1.7 + m.a) * 0.08, Math.sin(a) * m.d);
          m.s.scale.setScalar(0.09 + Math.max(0, Math.sin(t * 3 + m.a * 3)) * 0.07);
        }
      };
    },
  },
  mushroom_house: {
    body: (b) => {
      b.cyl(0.98, 0.98, 0.02, '#8fd86a', [0, 0, 0], 18);
      // stem house
      b.cyl(0.42, 0.5, 0.95, '#f5e6c8', [-0.05, 0, -0.05], 12);
      b.cyl(0.52, 0.52, 0.06, '#e8d3a2', [-0.05, 0, -0.05], 12);
      // cap with spots
      const cx = -0.05, cy = 1.05, cz = -0.05, R = 0.8, Ry = 0.5;
      b.sphere(R, '#e2453c', [cx, cy, cz], 2, [1, Ry / R, 1]);
      b.cyl(0.78, 0.62, 0.12, '#f6dfc0', [cx, cy - 0.12, cz], 14);
      const r = rng(17);
      for (let i = 0; i < 11; i++) {
        const th = r() * Math.PI * 2, ph = 0.25 + r() * 0.9;
        const nx = Math.sin(ph) * Math.cos(th), ny = Math.cos(ph), nz = Math.sin(ph) * Math.sin(th);
        b.sphere(0.07 + r() * 0.04, PAL.white, [cx + nx * R * 0.97, cy + ny * Ry * 0.97, cz + nz * R * 0.97], 0, [1, 0.45, 1]);
      }
      // door, step, flower box
      b.block(0.26, 0.4, 0.06, '#8a5528', [-0.05, 0, 0.42]);
      b.geometry(new THREE.CylinderGeometry(0.13, 0.13, 0.06, 10, 1, false, 0, Math.PI), '#8a5528', [-0.05, 0.4, 0.42], [Math.PI / 2, Math.PI / 2, 0]);
      b.sphere(0.025, PAL.gold, [0.04, 0.22, 0.46], 0);
      b.block(0.34, 0.05, 0.16, '#9a978c', [-0.05, 0, 0.53]);
      b.block(0.26, 0.07, 0.08, PAL.wood, [0.37, 0.38, 0.13]);
      flowerDot(b, 0.32, 0.47, 0.14, PAL.pink).toString();
      flowerDot(b, 0.42, 0.47, 0.13, PAL.yellow);
      // little chimney through the cap
      b.cyl(0.07, 0.08, 0.3, '#9a978c', [0.3, 1.3, -0.3], 6);
      // stepping stones, a baby mushroom and a fence
      for (let i = 0; i < 3; i++) b.cyl(0.08, 0.09, 0.03, '#b9b6aa', [-0.05 + i * 0.12, 0, 0.7 + i * 0.1], 7);
      b.cyl(0.08, 0.1, 0.3, '#f5e6c8', [0.62, 0, 0.55], 8);
      b.sphere(0.2, '#e2453c', [0.62, 0.32, 0.55], 1, [1, 0.6, 1]);
      b.sphere(0.04, PAL.white, [0.6, 0.43, 0.6], 0, [1, 0.5, 1]).sphere(0.03, PAL.white, [0.7, 0.4, 0.5], 0, [1, 0.5, 1]);
      b.sphere(0.13, PAL.leaf, [-0.65, 0.06, 0.55], 0).sphere(0.1, '#4fae3a', [-0.72, 0.05, 0.35], 0);
      flowerDot(b, -0.62, 0.17, 0.58, '#a77bf3');
    },
    glow: (b) => {
      b.cyl(0.08, 0.08, 0.04, '#ffd27a', [0.28, 0.6, 0.31], 10, [Math.PI / 2, 0, 0.0]);
      b.cyl(0.07, 0.07, 0.04, '#ffd27a', [0.4, 0.55, -0.12], 10, [0, 0, Math.PI / 2]);
      b.cyl(0.07, 0.07, 0.04, '#ffd27a', [-0.38, 0.6, 0.27], 10, [Math.PI / 2, 0, 0.0]);
    },
    glowColor: '#ffb84a',
    halo: { color: '#ffd27a', at: [0.1, 0.55, 0.3] },
  },

  // ================================================================ water and wildlife
  bird_feeder: {
    body: (b) => {
      b.cyl(0.3, 0.32, 0.02, '#c9955c', [0, 0, 0], 10);
      for (let i = 0; i < 9; i++) b.sphere(0.012, PAL.hay, [Math.cos(i * 2.4) * (0.1 + (i % 3) * 0.07), 0.025, Math.sin(i * 2.4) * (0.1 + (i % 3) * 0.07)], 0);
      b.block(0.07, 0.8, 0.07, PAL.woodDark, [0, 0, 0]);
      rod(b, [0, 0.55, 0], [0.12, 0.79, 0], 0.02, PAL.woodDark, 4);
      rod(b, [0, 0.55, 0], [-0.12, 0.79, 0], 0.02, PAL.woodDark, 4);
      b.block(0.46, 0.04, 0.36, PAL.wood, [0, 0.8, 0]);
      for (const [x, z, w, d] of [[0, 0.17, 0.46, 0.03], [0, -0.17, 0.46, 0.03], [0.22, 0, 0.03, 0.36], [-0.22, 0, 0.03, 0.36]]) b.block(w, 0.05, d, PAL.woodLight, [x, 0.83, z]);
      for (let i = 0; i < 14; i++) b.sphere(0.018, i % 3 ? PAL.hay : '#c99a2e', [-0.16 + (i % 7) * 0.055, 0.85, -0.08 + Math.floor(i / 7) * 0.12], 0);
      for (const x of [-0.18, 0.18]) for (const z of [-0.13, 0.13]) b.block(0.03, 0.26, 0.03, PAL.woodDark, [x, 0.84, z]);
      b.prism(0.56, 0.18, 0.46, '#4fae3a', [0, 1.1, 0]);
      b.block(0.04, 0.03, 0.04, PAL.red, [0, 1.28, 0]);
    },
    anim: (inner, seed) => {
      const kinds: [string, string][] = [['#4f9fe0', '#ffe8c0'], ['#e2533c', '#fff0d0'], ['#f0b429', '#fff6d8']];
      const perches: V3[] = [[0.15, 0.86, 0.18], [-0.2, 0.86, -0.02], [0.2, 0.03, -0.25], [-0.15, 0.03, 0.26]];
      const r = rng(seed);
      const birds = kinds.map(([c, belly], i) => {
        const p = cachedGeo(`bird${i}`, () => birdParts(c, belly).body);
        const w = cachedGeo(`wing${i}`, () => birdParts(c, belly).wing);
        const g = new THREE.Group();
        const body = mesh(p);
        const l = mesh(w), rr = mesh(w);
        l.position.set(-0.01, 0.07, 0.035); rr.position.set(-0.01, 0.07, -0.035); rr.rotation.y = Math.PI;
        g.add(body, l, rr);
        inner.add(g);
        return { g, body, l, rr, off: i * 3.7 + r() * 2, spot: i, from: new THREE.Vector3(), to: new THREE.Vector3(), turn: r() * 6 };
      });
      const P = 11;
      const tmp = new THREE.Vector3();
      return (_dt, t, night) => {
        birds.forEach((bd, i) => {
          const cyc = Math.floor((t + bd.off) / P);
          const k = ((t + bd.off) % P);
          const spot = perches[(cyc + i) % perches.length];
          const ang = (cyc * 2.3 + i * 1.7) % (Math.PI * 2);
          const far = tmp.set(spot[0] + Math.cos(ang) * 2.4, spot[1] + 1.6, spot[2] + Math.sin(ang) * 2.4);
          let x: number, y: number, z: number, yaw: number, flap = 0, pitch = 0;
          bd.g.visible = night < 0.5 && k < 8.6;
          if (!bd.g.visible) return;
          if (k < 1.4 || k > 7.2) {
            const inn = k < 1.4;
            const u = inn ? k / 1.4 : (k - 7.2) / 1.4;
            const e = inn ? 1 - (1 - u) * (1 - u) : u * u;
            const a = inn ? far : new THREE.Vector3(spot[0] - Math.cos(ang) * 2.4, spot[1] + 1.8, spot[2] - Math.sin(ang) * 2.4);
            const from = inn ? a : new THREE.Vector3(...spot), to = inn ? new THREE.Vector3(...spot) : a;
            x = from.x + (to.x - from.x) * e;
            z = from.z + (to.z - from.z) * e;
            y = from.y + (to.y - from.y) * e + Math.sin(e * Math.PI) * 0.25;
            yaw = Math.atan2(-(to.z - from.z), to.x - from.x);
            flap = Math.sin(t * 38) * 0.9;
          } else {
            [x, y, z] = spot;
            const hop = (k * 1.3) % 1.9;
            if (hop < 0.25) y += Math.sin((hop / 0.25) * Math.PI) * 0.05;
            yaw = bd.turn + Math.floor(k * 0.7) * 1.3;
            pitch = Math.max(0, Math.sin(k * 5.5 + i)) > 0.7 ? -0.6 : 0;
          }
          bd.g.position.set(x, y, z);
          bd.g.rotation.set(0, yaw, pitch);
          bd.l.rotation.x = -0.25 - flap;
          bd.rr.rotation.x = -0.25 - flap;
          bd.rr.rotation.y = Math.PI;
        });
      };
    },
  },
  duck_pond: {
    body: (b) => {
      b.sphere(1.0, '#d8c48a', [0, 0, 0], 2, [1, 0.05, 0.95]);
      b.sphere(0.88, '#56c1e4', [0, 0.02, 0], 2, [1, 0.05, 0.86]);
      stoneRim(b, 0.92, 0.84, 18, 31, 0.04, 0.09);
      reeds(b, -0.75, -0.45, 7, 5);
      reeds(b, -0.6, -0.65, 8, 4);
      reeds(b, 0.82, 0.3, 9, 4);
      // a little duck house on a post
      b.block(0.06, 0.32, 0.06, PAL.woodDark, [0.55, 0, -0.55]);
      b.block(0.32, 0.22, 0.26, '#f0c75a', [0.55, 0.3, -0.55]);
      b.prism(0.4, 0.15, 0.34, PAL.red, [0.55, 0.52, -0.55]);
      b.cyl(0.06, 0.06, 0.02, '#5e3a20', [0.55, 0.4, -0.415], 8, [Math.PI / 2, 0, 0]);
      rod(b, [0.4, 0.12, -0.32], [0.55, 0.3, -0.42], 0.03, PAL.woodLight, 4);
      for (const [x, z] of [[0.2, 0.5], [-0.35, 0.2]]) b.geometry(new THREE.CylinderGeometry(0.1, 0.1, 0.01, 10, 1, false, 0.4, Math.PI * 1.8), '#5fae4a', [x, 0.07, z]);
      b.sphere(0.04, '#fff', [0.2, 0.09, 0.5], 0).sphere(0.02, PAL.yellow, [0.2, 0.11, 0.5], 0);
    },
    anim: (inner, seed) => {
      const mom = mesh(cachedGeo('duck', () => duckGeo(PAL.white, 1)));
      const kids = [0, 1, 2].map(() => mesh(cachedGeo('duckling', () => duckGeo('#ffd84a', 0.55))));
      const drake = mesh(cachedGeo('duck2', () => duckGeo('#f6efe2', 0.95)));
      inner.add(mom, drake, ...kids);
      const sp = sparkles(inner, 0.75, 0.68, 0.07, 6, seed);
      const ph = (seed % 11) * 0.6;
      const path = (u: number): [number, number] => [Math.cos(u) * 0.48 - 0.05, Math.sin(u) * 0.38 + 0.05 + Math.sin(u * 2) * 0.08];
      const put = (o: THREE.Object3D, u: number, t: number, bob: number, dir = 1) => {
        const [x, z] = path(u), [x2, z2] = path(u + 0.02 * dir);
        o.position.set(x, 0.055 + Math.sin(t * 2.2 + bob) * 0.008, z);
        o.rotation.y = Math.atan2(-(z2 - z), x2 - x);
        o.rotation.z = Math.sin(t * 2.2 + bob) * 0.05;
      };
      return (_dt, t, night) => {
        const u = t * 0.16 + ph;
        put(mom, u, t, 0);
        kids.forEach((k, i) => put(k, u - 0.42 - i * 0.3, t, i + 1));
        const v = -t * 0.11 + ph + 2;
        const [x, z] = [Math.cos(v) * 0.22 + 0.15, Math.sin(v) * 0.18 - 0.05];
        drake.position.set(x, 0.055 + Math.sin(t * 1.9) * 0.008, z);
        drake.rotation.y = Math.atan2(-Math.cos(v) * 0.18 * -1, -Math.sin(v) * 0.22 * -1) + Math.PI;
        sp(t, night);
      };
    },
  },
};

// ------------------------------------------------------------------ registration hooks
/** Static geometry for every themed model (registered in ProcModels' PROC table). */
export const THEMED_PROC: Record<string, () => THREE.BufferGeometry> = Object.fromEntries(
  Object.entries(THEMED).map(([name, m]) => [name, () => {
    const b = geo();
    m.body(b);
    m.glow?.(b);
    return b.build();
  }]),
);

const themedName = (model: string): string | null => (model.startsWith('proc:') && THEMED[model.slice(5)] ? model.slice(5) : null);

/** Whether a decor model moves or lights up (then it is drawn standalone instead of pooled). */
export function themedAnimated(model: string): boolean {
  const n = themedName(model);
  return !!n && !!(THEMED[n].anim || THEMED[n].glow);
}

/**
 * Attach the moving and glowing parts of a themed model to its standalone object (from `objectFor`) and return the
 * per-frame update. Also tints and places the halo sprite (and its light pool) of decor with a `glow` value.
 */
export function attachThemed(model: string, obj: THREE.Object3D, seed: number, halo?: THREE.Sprite, pool?: THREE.Mesh): ((dt: number, t: number, night: number) => void) | undefined {
  const n = themedName(model);
  if (!n) return undefined;
  const m = THEMED[n];
  const inner = obj.children[0];
  if (!inner) return undefined;
  if (m.halo && halo) {
    (halo.material as THREE.SpriteMaterial).color.set(m.halo.color);
    if (m.halo.at) halo.position.set(...m.halo.at).applyMatrix4(inner.matrix);
    if (pool) (pool.material as THREE.MeshBasicMaterial).color.set(m.halo.pool ?? m.halo.color);
  }
  const parts: ((dt: number, t: number, night: number) => void)[] = [];
  if (m.glow) {
    const g = cachedGeo(`glow_${n}`, () => { const b = geo(); m.glow!(b); return b.build(); });
    const gm = additive(`glow_${n}`, m.glowColor ?? '#ffffff', !m.glowColor);
    const o = mesh(g, gm);
    o.renderOrder = 2;
    inner.add(o);
    const k = m.glowStrength ?? 0.9;
    parts.push((_dt, t, night) => {
      o.visible = night > 0.02;
      gm.opacity = night * k * (0.88 + 0.12 * Math.sin(t * 1.6 + seed));
    });
  }
  if (m.anim) parts.push(m.anim(inner, seed));
  return parts.length === 1 ? parts[0] : (dt, t, night) => { for (const p of parts) p(dt, t, night); };
}
