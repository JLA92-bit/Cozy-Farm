import * as THREE from 'three';
import { MAP, HALF, CHUNK, CHUNKS, chunkOf } from './Grid';
import { PAL, geo, rng } from './Procedural';

/**
 * The farm island: a grass slab with per-tile colour variation, cliffs, a sandy beach ring, animated water,
 * a build-mode grid overlay and tinted locked land.
 */
export class Terrain {
  readonly group = new THREE.Group();
  readonly ground: THREE.Mesh;
  readonly water: THREE.Mesh;
  readonly gridLines: THREE.LineSegments;
  private colors: Float32Array;
  private baseColors: Float32Array;
  private waterUniforms = { uTime: { value: 0 }, uDeep: { value: new THREE.Color(PAL.waterDeep) }, uShallow: { value: new THREE.Color(PAL.water) }, uLight: { value: 1 } };

  constructor(material: THREE.Material) {
    // ---- grass top: two triangles per tile, flat colour per tile
    const positions: number[] = [];
    const cols: number[] = [];
    const r = rng(1234);
    const base = new THREE.Color(PAL.grass);
    const c = new THREE.Color();
    for (let z = 0; z < MAP; z++) {
      for (let x = 0; x < MAP; x++) {
        const x0 = x - HALF, z0 = z - HALF;
        positions.push(x0, 0, z0, x0, 0, z0 + 1, x0 + 1, 0, z0, x0 + 1, 0, z0, x0, 0, z0 + 1, x0 + 1, 0, z0 + 1);
        // gentle checker + noise like Hay Day turf
        const checker = (x + z) % 2 === 0 ? 0.035 : 0;
        const n = (r() - 0.5) * 0.05;
        c.copy(base).offsetHSL(n * 0.15, n * 0.5, checker + n);
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
    this.ground = new THREE.Mesh(g, material);
    this.ground.receiveShadow = true;
    this.ground.name = 'ground';
    this.group.add(this.ground);

    // ---- cliffs + beach
    const cliffH = 1.6;
    const b = geo()
      .box(MAP, cliffH, MAP, PAL.dirt, [0, -cliffH / 2 - 0.001, 0])
      .box(MAP + 0.3, 0.25, MAP + 0.3, PAL.grassDark, [0, -0.13, 0])
      .box(MAP + 5, 0.6, MAP + 5, PAL.sand, [0, -cliffH + 0.1, 0])
      .box(MAP + 3, 0.6, MAP + 3, '#e8c878', [0, -cliffH + 0.35, 0]);
    // little rocks on the beach for variety
    const rr = rng(99);
    for (let i = 0; i < 40; i++) {
      const side = Math.floor(rr() * 4);
      const along = (rr() - 0.5) * (MAP + 2);
      const out = HALF + 0.8 + rr() * 1.4;
      const x = side === 0 ? along : side === 1 ? along : side === 2 ? out : -out;
      const z = side === 0 ? out : side === 1 ? -out : along;
      b.sphere(0.2 + rr() * 0.35, rr() > 0.5 ? PAL.stone : PAL.stoneDark, [x, -cliffH + 0.55, z], 0, [1, 0.6, 1]);
    }
    const cliff = new THREE.Mesh(b.build(), material);
    cliff.receiveShadow = true;
    this.group.add(cliff);

    // ---- water: big plane with a cheap animated shader (waves + shoreline foam band)
    const wg = new THREE.PlaneGeometry(400, 400, 1, 1);
    wg.rotateX(-Math.PI / 2);
    const wm = new THREE.ShaderMaterial({
      uniforms: this.waterUniforms,
      vertexShader: /* glsl */`
        varying vec3 vPos;
        void main() { vPos = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform float uLight;
        varying vec3 vPos;
        void main() {
          float half_ = ${(HALF + 2.5).toFixed(1)};
          vec2 d = max(abs(vPos.xz) - vec2(half_), vec2(0.0));
          float dist = length(d);
          float shore = smoothstep(9.0, 0.0, dist);
          vec3 col = mix(uDeep, uShallow, shore * 0.85);
          float w = sin(vPos.x * 0.55 + uTime * 0.9) * sin(vPos.z * 0.45 - uTime * 0.7);
          col += vec3(0.06) * smoothstep(0.55, 1.0, w);
          float foam = smoothstep(1.4, 0.2, abs(dist - 0.6 - 0.25 * sin(uTime * 1.3 + vPos.x * 0.3 + vPos.z * 0.3)));
          col = mix(col, vec3(1.0), foam * 0.7);
          gl_FragColor = vec4(col * uLight, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.water = new THREE.Mesh(wg, wm);
    this.water.position.y = -cliffH + 0.2;
    this.group.add(this.water);

    // ---- build grid overlay
    const lp: number[] = [];
    for (let i = 0; i <= MAP; i++) {
      lp.push(-HALF, 0.02, i - HALF, HALF, 0.02, i - HALF);
      lp.push(i - HALF, 0.02, -HALF, i - HALF, 0.02, HALF);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    this.gridLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#2d5a1a', transparent: true, opacity: 0.22, depthWrite: false }));
    this.gridLines.visible = false;
    this.group.add(this.gridLines);
  }

  /** Tint locked chunks, highlight purchasable ones. */
  setLand(unlocked: Set<string>, purchasable: Set<string>): void {
    const locked = new THREE.Color('#5d7f4a');
    const forSale = new THREE.Color('#8fb35c');
    const c = new THREE.Color();
    for (let z = 0; z < MAP; z++) {
      for (let x = 0; x < MAP; x++) {
        const key = chunkOf(x, z);
        const i0 = (z * MAP + x) * 18;
        for (let v = 0; v < 6; v++) {
          const i = i0 + v * 3;
          c.setRGB(this.baseColors[i], this.baseColors[i + 1], this.baseColors[i + 2]);
          if (!unlocked.has(key)) c.lerp(purchasable.has(key) ? forSale : locked, purchasable.has(key) ? 0.45 : 0.6);
          // soft edge darkening on chunk borders of locked land
          this.colors[i] = c.r; this.colors[i + 1] = c.g; this.colors[i + 2] = c.b;
        }
      }
    }
    (this.ground.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
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

  update(t: number, light: number): void {
    this.waterUniforms.uTime.value = t;
    this.waterUniforms.uLight.value = light;
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
