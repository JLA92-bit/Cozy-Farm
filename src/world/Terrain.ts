import * as THREE from 'three';
import { MAP, HALF, CHUNK, CHUNKS, chunkOf } from './Grid';
import { PAL, geo, rng } from './Procedural';

/** Smooth 2D value noise on a wrapped lattice (deterministic, cheap; used at build time only). */
function valueNoise(seed: number, cells = 32): (x: number, z: number) => number {
  const r = rng(seed);
  const lat = new Float32Array(cells * cells);
  for (let i = 0; i < lat.length; i++) lat[i] = r();
  const at = (x: number, z: number): number => lat[(((z % cells) + cells) % cells) * cells + (((x % cells) + cells) % cells)];
  return (x: number, z: number): number => {
    const x0 = Math.floor(x), z0 = Math.floor(z);
    const fx = x - x0, fz = z - z0;
    const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
    const a = at(x0, z0) + (at(x0 + 1, z0) - at(x0, z0)) * sx;
    const b = at(x0, z0 + 1) + (at(x0 + 1, z0 + 1) - at(x0, z0 + 1)) * sx;
    return a + (b - a) * sz;
  };
}

interface Tuft { m: THREE.Matrix4; chunk: string }

/**
 * The farm island: a grass slab with meadow-patch colour variation, drifting cloud shadows and a soft
 * shader-drawn build grid, cliffs, a sandy beach ring with a little dock, animated water with glints and
 * lapping foam, distant islands on the horizon, and wild overgrown look for land you don't own yet.
 */
export class Terrain {
  readonly group = new THREE.Group();
  readonly ground: THREE.Mesh;
  readonly water: THREE.Mesh;
  /** Kept for callers that toggle `.visible` for build mode; the grid itself is drawn by the ground shader. */
  readonly gridLines: THREE.LineSegments;
  private colors: Float32Array;
  private baseColors: Float32Array;
  private waterUniforms = {
    uTime: { value: 0 }, uDeep: { value: new THREE.Color(PAL.waterDeep) }, uShallow: { value: new THREE.Color(PAL.water) },
    uShore: { value: new THREE.Color('#8ae6dc') }, uLight: { value: 1 }, uSky: { value: new THREE.Color('#8fd3f4') }, uDay: { value: 1 },
  };
  private groundUniforms = { uTime: { value: 0 }, uGrid: { value: 0 }, uFocus: { value: new THREE.Vector2() }, uCloud: { value: 0.11 } };
  private tufts: THREE.InstancedMesh;
  private flowers: THREE.InstancedMesh;
  private tuftList: Tuft[] = [];
  private flowerList: Tuft[] = [];
  private saleBorder: THREE.Mesh;
  private saleMat: THREE.MeshBasicMaterial;
  private boat: THREE.Mesh;
  private gridTarget = 0;

  constructor(material: THREE.Material) {
    // ---- grass top: two triangles per tile, flat colour per tile
    const positions: number[] = [];
    const cols: number[] = [];
    const r = rng(1234);
    const base = new THREE.Color(PAL.grass);
    const meadow = new THREE.Color('#9be06a');
    const lush = new THREE.Color('#5fbf45');
    const warm = new THREE.Color('#a9d65c');
    const big = valueNoise(51);
    const small = valueNoise(77);
    const c = new THREE.Color();
    for (let z = 0; z < MAP; z++) {
      for (let x = 0; x < MAP; x++) {
        const x0 = x - HALF, z0 = z - HALF;
        positions.push(x0, 0, z0, x0, 0, z0 + 1, x0 + 1, 0, z0, x0 + 1, 0, z0, x0, 0, z0 + 1, x0 + 1, 0, z0 + 1);
        // soft meadow patches (low-frequency noise) + gentle checker + per-tile jitter, like Hay Day turf
        const patch = big(x / 7, z / 7) * 0.7 + small(x / 3, z / 3) * 0.3;
        c.copy(base);
        if (patch > 0.55) c.lerp(meadow, Math.min(1, (patch - 0.55) * 2.2) * 0.55);
        else if (patch < 0.4) c.lerp(lush, Math.min(1, (0.4 - patch) * 2.5) * 0.5);
        // sun-warmed rim near the island edge
        const edge = Math.min(x, z, MAP - 1 - x, MAP - 1 - z);
        if (edge < 3) c.lerp(warm, (3 - edge) * 0.08);
        const checker = (x + z) % 2 === 0 ? 0.03 : 0;
        const n = (r() - 0.5) * 0.045;
        c.offsetHSL(n * 0.15, n * 0.5, checker + n);
        for (let i = 0; i < 6; i++) cols.push(c.r, c.g, c.b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.colors = new Float32Array(cols);
    this.baseColors = new Float32Array(cols);
    g.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
    g.computeVertexNormals();
    this.ground = new THREE.Mesh(g, this.groundMaterial());
    this.ground.receiveShadow = true;
    this.ground.name = 'ground';
    this.group.add(this.ground);

    // ---- cliffs + beach (cliff tops sit clearly below the grass so they never z-fight with it when zoomed out)
    const cliffH = 1.6;
    const b = geo()
      .box(MAP, cliffH, MAP, PAL.dirt, [0, -cliffH / 2 - 0.06, 0])
      .box(MAP + 0.3, 0.25, MAP + 0.3, PAL.grassDark, [0, -0.16, 0])
      .box(MAP + 0.5, 0.35, MAP + 0.5, PAL.dirtDark, [0, -cliffH + 0.55, 0])
      .box(MAP + 5, 0.6, MAP + 5, PAL.sand, [0, -cliffH + 0.1, 0])
      .box(MAP + 3, 0.6, MAP + 3, '#e8c878', [0, -cliffH + 0.35, 0]);
    // little rocks and shells on the beach for variety
    const rr = rng(99);
    for (let i = 0; i < 46; i++) {
      const side = Math.floor(rr() * 4);
      const along = (rr() - 0.5) * (MAP + 2);
      const out = HALF + 0.8 + rr() * 1.4;
      const x = side === 0 ? along : side === 1 ? along : side === 2 ? out : -out;
      const z = side === 0 ? out : side === 1 ? -out : along;
      if (i % 6 === 5) b.sphere(0.12, i % 4 ? '#ffd9c8' : '#fff1de', [x, -cliffH + 0.66, z], 0, [1, 0.4, 0.8]);
      else b.sphere(0.2 + rr() * 0.35, rr() > 0.5 ? PAL.stone : PAL.stoneDark, [x, -cliffH + 0.55, z], 0, [1, 0.6, 1]);
    }
    // beach grass clumps along the cliff foot
    for (let i = 0; i < 30; i++) {
      const side = i % 4;
      const along = (rr() - 0.5) * (MAP - 2);
      const out = HALF + 0.35 + rr() * 0.4;
      const x = side < 2 ? along : side === 2 ? out : -out;
      const z = side < 2 ? (side === 0 ? out : -out) : along;
      for (let k = 0; k < 3; k++) b.geometry(new THREE.ConeGeometry(0.05, 0.45 + rr() * 0.2, 4, 1, true), k === 1 ? '#9cc95a' : '#c6c86a', [x + (k - 1) * 0.1, -cliffH + 0.85, z + (rr() - 0.5) * 0.1], [(rr() - 0.5) * 0.5, 0, (rr() - 0.5) * 0.5]);
    }
    // a little wooden dock on the far beach
    const dx = 5, dz0 = -HALF - 1.2, deckY = -cliffH + 0.68;
    for (let k = 0; k < 6; k++) {
      const zz = dz0 - k * 0.9;
      b.block(1.3, 0.08, 0.8, k % 2 ? PAL.wood : PAL.woodLight, [dx, deckY, zz]);
      if (k % 2 === 0) for (const sx of [-0.6, 0.6]) b.block(0.14, 1.0, 0.14, PAL.woodDark, [dx + sx, deckY - 0.9, zz]);
    }
    b.block(0.12, 0.5, 0.12, PAL.woodDark, [dx + 0.6, deckY, dz0 - 4.6]).cyl(0.1, 0.1, 0.06, '#e2d3b0', [dx + 0.6, deckY + 0.5, dz0 - 4.6], 6);
    const cliff = new THREE.Mesh(b.build(), material);
    cliff.receiveShadow = true;
    this.group.add(cliff);

    // ---- water: big plane with a cheap animated shader (waves, glints, shore colour, lapping foam)
    const wg = new THREE.PlaneGeometry(400, 400, 1, 1);
    wg.rotateX(-Math.PI / 2);
    const wm = new THREE.ShaderMaterial({
      uniforms: this.waterUniforms,
      vertexShader: /* glsl */`
        varying vec3 vPos;
        void main() { vPos = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uShore; uniform float uLight;
        uniform vec3 uSky; uniform float uDay;
        varying vec3 vPos;
        void main() {
          float half_ = ${(HALF + 2.5).toFixed(1)};
          vec2 d = max(abs(vPos.xz) - vec2(half_), vec2(0.0));
          float dist = length(d);
          float shore = smoothstep(9.0, 0.0, dist);
          vec3 col = mix(uDeep, uShallow, shore * 0.85);
          col = mix(col, uShore, smoothstep(2.6, 0.4, dist) * 0.55);
          // a hint of sky reflected in open water (warm at dusk, blue at night)
          col = mix(col, uSky, (1.0 - shore) * 0.16);
          float w = sin(vPos.x * 0.55 + uTime * 0.9) * sin(vPos.z * 0.45 - uTime * 0.7);
          col += vec3(0.06) * smoothstep(0.55, 1.0, w);
          // sun glints: sparse twinkles where three wave trains line up
          float gl = sin(vPos.x * 2.3 + uTime * 1.9) * sin(vPos.z * 2.1 - uTime * 1.4) * sin((vPos.x + vPos.z) * 1.1 + uTime * 0.8);
          col += vec3(1.0, 0.97, 0.85) * smoothstep(0.78, 0.97, gl) * 0.45 * uDay * (0.35 + 0.65 * shore);
          // foam hugging the beach, plus soft ripples that roll in and fade
          float foam = smoothstep(1.4, 0.2, abs(dist - 0.6 - 0.25 * sin(uTime * 1.3 + vPos.x * 0.3 + vPos.z * 0.3)));
          float k = fract(uTime * 0.12 + sin(vPos.x * 0.07 + vPos.z * 0.05) * 0.15);
          float ripple = smoothstep(0.35, 0.0, abs(dist - (4.0 - k * 3.2))) * k * 0.45;
          col = mix(col, vec3(1.0), clamp(foam * 0.7 + ripple, 0.0, 1.0));
          gl_FragColor = vec4(col * uLight, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.water = new THREE.Mesh(wg, wm);
    this.water.position.y = -cliffH + 0.2;
    this.group.add(this.water);

    // ---- distant islands on the far horizon so the sea doesn't feel empty
    this.group.add(this.buildIslands(this.water.position.y, material));

    // ---- a little rowing boat bobbing by the dock
    this.boat = new THREE.Mesh(geo()
      .box(0.8, 0.22, 1.7, PAL.woodDark, [0, 0.05, 0])
      .box(0.66, 0.06, 1.5, PAL.wood, [0, 0.17, 0])
      .box(0.84, 0.08, 1.74, PAL.white, [0, 0.2, 0])
      .box(0.7, 0.06, 0.2, PAL.woodLight, [0, 0.22, 0.2])
      .box(0.56, 0.2, 0.4, PAL.woodDark, [0, 0.07, -0.95], [0, Math.PI / 4, 0])
      .box(0.05, 0.05, 1.1, PAL.woodLight, [0.5, 0.25, 0.1], [0.3, 0, 0])
      .build(), material);
    this.boat.position.set(dx + 1.6, this.water.position.y, dz0 - 3.2);
    this.boat.rotation.y = 0.35;
    this.group.add(this.boat);

    // ---- wild meadow on land you don't own yet: grass tufts and wildflower patches (instanced)
    const blade = (h: number): THREE.ConeGeometry => new THREE.ConeGeometry(0.055, h, 4, 1, true);
    const tuftGeo = geo()
      .geometry(blade(0.38), '#4f9e33', [0, 0.19, 0], [0.15, 0, 0.1])
      .geometry(blade(0.3), '#6cc244', [0.1, 0.15, 0.05], [-0.1, 0, -0.35])
      .geometry(blade(0.26), '#5bb03b', [-0.09, 0.13, -0.04], [0.25, 0, 0.3])
      .build();
    const fb = geo()
      .geometry(blade(0.3), '#4f9e33', [0, 0.15, 0], [0.1, 0, 0.1])
      .geometry(blade(0.24), '#6cc244', [0.18, 0.12, -0.1], [0, 0, -0.3]);
    const heads: [number, number, string][] = [[-0.12, 0.08, '#fff6e8'], [0.14, 0.14, '#ffd84a'], [0.02, -0.16, '#ff9fc8'], [-0.2, -0.12, '#fff6e8']];
    for (const [x, z, col] of heads) {
      fb.geometry(new THREE.ConeGeometry(0.02, 0.22, 3, 1, true), '#5aa83a', [x, 0.11, z], [0, 0, 0]);
      fb.geometry(new THREE.OctahedronGeometry(0.07, 0), col, [x, 0.23, z], [0, 0, 0], [1, 0.55, 1]);
    }
    const flowerGeo = fb.build();
    const tr = rng(4242);
    for (let z = 0; z < MAP; z++) for (let x = 0; x < MAP; x++) {
      const roll = tr();
      if (roll > 0.26) continue;
      const list = roll < 0.06 ? this.flowerList : this.tuftList;
      const s = 0.8 + tr() * 0.6;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x - HALF + 0.2 + tr() * 0.6, 0, z - HALF + 0.2 + tr() * 0.6),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), tr() * Math.PI * 2),
        new THREE.Vector3(s, s * (0.85 + tr() * 0.4), s),
      );
      list.push({ m, chunk: chunkOf(x, z) });
    }
    this.tufts = new THREE.InstancedMesh(tuftGeo, material, Math.max(1, this.tuftList.length));
    this.flowers = new THREE.InstancedMesh(flowerGeo, material, Math.max(1, this.flowerList.length));
    for (const im of [this.tufts, this.flowers]) { im.count = 0; im.receiveShadow = true; this.group.add(im); }

    // ---- dashed, gently pulsing outline around land that is for sale
    this.saleMat = new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.6, depthWrite: false });
    this.saleBorder = new THREE.Mesh(new THREE.BufferGeometry(), this.saleMat);
    this.saleBorder.renderOrder = 1;
    this.group.add(this.saleBorder);

    // ---- build grid: drawn in the ground shader (soft, anti-aliased, fades with distance)
    this.gridLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ visible: false }));
    this.gridLines.visible = false;
    this.group.add(this.gridLines);
  }

  /** Lambert ground with two cheap extras injected: drifting cloud shadows and a fading build grid. */
  private groundMaterial(): THREE.MeshLambertMaterial {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    m.name = 'ground';
    const u = this.groundUniforms;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', /* glsl */`#include <common>
          varying vec3 vGPos; uniform float uTime; uniform float uGrid; uniform vec2 uFocus; uniform float uCloud;
          float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float gNoise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y);
          }`)
        .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
          {
            vec2 cp = vGPos.xz * 0.07 + vec2(uTime * 0.018, uTime * 0.011);
            float cn = gNoise(cp) * 0.65 + gNoise(cp * 2.3 + 7.0) * 0.35;
            diffuseColor.rgb *= 1.0 - uCloud * smoothstep(0.52, 0.75, cn);
            if (uGrid > 0.001) {
              vec2 f = abs(fract(vGPos.xz) - 0.5);
              vec2 w = fwidth(vGPos.xz) * 1.2;
              vec2 l = smoothstep(vec2(0.5) - w - 0.012, vec2(0.496), f);
              float line = max(l.x, l.y);
              float fade = 1.0 - smoothstep(5.0, 13.0, length(vGPos.xz - uFocus));
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 1.0, 0.9), line * uGrid * (0.12 + 0.3 * fade));
            }
          }`);
    };
    return m;
  }

  private buildIslands(waterY: number, material: THREE.Material): THREE.Mesh {
    const b = geo();
    const r = rng(2024);
    // mostly on the far sides (top of the screen), a couple to the sides
    const spots: [number, number, number][] = [[-44, -12, 6], [-14, -46, 5], [-40, -40, 4], [-50, 20, 4.5], [22, -50, 4], [-30, -58, 3], [-60, -26, 3.5], [44, -34, 2.6], [-36, 40, 2.4]];
    for (const [x, z, s] of spots) {
      const rocky = s < 3;
      b.cyl(s * 1.05, s * 1.2, 0.5, PAL.sand, [x, waterY - 0.3, z], 10);
      if (rocky) {
        for (let k = 0; k < 4; k++) b.sphere(s * (0.35 + r() * 0.3), k % 2 ? PAL.stone : PAL.stoneDark, [x + (r() - 0.5) * s, waterY + 0.2, z + (r() - 0.5) * s], 0, [1, 0.9 + r() * 0.8, 1]);
        b.cone(s * 0.25, s * 0.6, '#3f8f3a', [x, waterY + s * 0.55, z], 6);
        continue;
      }
      b.sphere(s * 0.95, '#62b043', [x, waterY + 0.1, z], 1, [1, 0.32, 1]);
      b.sphere(s * 0.55, '#6fbd4c', [x + s * 0.2, waterY + s * 0.2, z - s * 0.1], 1, [1, 0.6, 1]);
      const trees = 3 + Math.floor(r() * 4);
      for (let k = 0; k < trees; k++) {
        const a = r() * Math.PI * 2, d = r() * s * 0.6;
        const tx = x + Math.cos(a) * d, tz = z + Math.sin(a) * d;
        const h = 2.2 + r() * 1.8;
        const y = waterY + s * 0.22 + (1 - d / s) * s * 0.12;
        b.block(0.25, h * 0.4, 0.25, PAL.woodDark, [tx, y, tz]);
        if (r() > 0.4) b.cone(h * 0.42, h, r() > 0.5 ? '#3f9a3c' : '#2f8a42', [tx, y + h * 0.3, tz], 7);
        else b.sphere(h * 0.4, r() > 0.5 ? '#5cb845' : '#4aa63e', [tx, y + h * 0.6, tz], 0);
      }
      if (s >= 5) {
        // a tiny cottage on the biggest islands
        const hx = x - s * 0.3, hz = z + s * 0.25, hy = waterY + s * 0.28;
        b.block(1.2, 0.9, 1.0, PAL.cream, [hx, hy, hz]).prism(1.4, 0.7, 1.2, PAL.roof, [hx, hy + 0.9, hz]);
      }
    }
    const mesh = new THREE.Mesh(b.build(), material);
    mesh.name = 'islands';
    return mesh;
  }

  /** Tint locked chunks, highlight purchasable ones, grow wild meadow on land you don't own yet. */
  setLand(unlocked: Set<string>, purchasable: Set<string>): void {
    const locked = new THREE.Color('#4f7a45');
    const forSale = new THREE.Color('#9cc464');
    const c = new THREE.Color();
    for (let z = 0; z < MAP; z++) {
      for (let x = 0; x < MAP; x++) {
        const key = chunkOf(x, z);
        const i0 = (z * MAP + x) * 18;
        const sale = purchasable.has(key);
        for (let v = 0; v < 6; v++) {
          const i = i0 + v * 3;
          c.setRGB(this.baseColors[i], this.baseColors[i + 1], this.baseColors[i + 2]);
          if (!unlocked.has(key)) c.lerp(sale ? forSale : locked, sale ? 0.4 : 0.55);
          this.colors[i] = c.r; this.colors[i + 1] = c.g; this.colors[i + 2] = c.b;
        }
      }
    }
    (this.ground.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    // wild tufts + flowers only on locked land (they vanish when you buy the chunk)
    for (const [im, list] of [[this.tufts, this.tuftList], [this.flowers, this.flowerList]] as const) {
      let n = 0;
      for (const t of list) if (!unlocked.has(t.chunk)) im.setMatrixAt(n++, t.m);
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    }
    this.buildSaleBorder(purchasable);
  }

  private buildSaleBorder(purchasable: Set<string>): void {
    const pos: number[] = [];
    const y = 0.025, inset = 0.18, w = 0.09, dash = 0.55;
    const quad = (x0: number, z0: number, x1: number, z1: number): void => {
      pos.push(x0, y, z0, x0, y, z1, x1, y, z0, x1, y, z0, x0, y, z1, x1, y, z1);
    };
    for (const key of purchasable) {
      const [cx, cz] = key.split(',').map(Number);
      const ax = cx * CHUNK - HALF + inset, az = cz * CHUNK - HALF + inset;
      const bx = ax + CHUNK - inset * 2, bz = az + CHUNK - inset * 2;
      for (let s = ax; s < bx - 0.05; s += 1) {
        const e = Math.min(bx, s + dash);
        quad(s, az - w, e, az + w); quad(s, bz - w, e, bz + w);
      }
      for (let s = az; s < bz - 0.05; s += 1) {
        const e = Math.min(bz, s + dash);
        quad(ax - w, s, ax + w, e); quad(bx - w, s, bx + w, e);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.saleBorder.geometry.dispose();
    this.saleBorder.geometry = g;
    this.saleBorder.visible = pos.length > 0;
  }

  /** Paint arbitrary tiles (soil under plots, paths). colour = null restores grass. */
  paintTile(x: number, z: number, color: THREE.Color | null): void {
    const i0 = (z * MAP + x) * 18;
    for (let v = 0; v < 6; v++) {
      const i = i0 + v * 3;
      if (color) { this.colors[i] = color.r; this.colors[i + 1] = color.g; this.colors[i + 2] = color.b; }
      else { this.colors[i] = this.baseColors[i]; this.colors[i + 1] = this.baseColors[i + 1]; this.colors[i + 2] = this.baseColors[i + 2]; }
    }
    (this.ground.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  /**
   * Per-frame: animate water, cloud shadows, the for-sale outline and the boat; fade the build grid in/out.
   * `sky` / `night` come from the Environment, `focus` is the camera target (the grid is brightest there).
   */
  update(t: number, light: number, sky?: THREE.Color, night = 0, focus?: THREE.Vector3, dt = 1 / 30): void {
    const wu = this.waterUniforms;
    wu.uTime.value = t;
    wu.uLight.value = light;
    wu.uDay.value = 1 - night;
    if (sky) wu.uSky.value.copy(sky);
    const gu = this.groundUniforms;
    gu.uTime.value = t;
    gu.uCloud.value = 0.11 * (1 - night);
    if (focus) gu.uFocus.value.set(focus.x, focus.z);
    this.gridTarget = this.gridLines.visible ? 1 : 0;
    gu.uGrid.value += (this.gridTarget - gu.uGrid.value) * Math.min(1, dt * 10);
    if (Math.abs(gu.uGrid.value - this.gridTarget) < 0.002) gu.uGrid.value = this.gridTarget;
    this.saleMat.opacity = (0.42 + 0.28 * Math.sin(t * 2.4)) * (1 - night * 0.5);
    this.boat.position.y = this.water.position.y + Math.sin(t * 1.3) * 0.05;
    this.boat.rotation.z = Math.sin(t * 1.1 + 1) * 0.05;
    this.boat.rotation.x = Math.sin(t * 0.9) * 0.03;
  }

  /** Centres of chunks, for "for sale" signs. */
  static chunkCenter(key: string): THREE.Vector3 {
    const [cx, cz] = key.split(',').map(Number);
    return new THREE.Vector3(cx * CHUNK + CHUNK / 2 - HALF, 0, cz * CHUNK + CHUNK / 2 - HALF);
  }

  static allChunks(): string[] {
    const out: string[] = [];
    for (let z = 0; z < CHUNKS; z++) for (let x = 0; x < CHUNKS; x++) out.push(`${x},${z}`);
    return out;
  }
}
