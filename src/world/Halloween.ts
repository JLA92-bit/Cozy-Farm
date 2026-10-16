import * as THREE from 'three';
import { HALF } from './Grid';
import { geo, rng } from './Procedural';
import { mergeStatic, modelObject, tallObject } from './SquareView';
import { assets } from '../core/Assets';
export { costume, halloweenOn, halloweenSeason } from './FarmLook';

/**
 * 1.20.1 Spooky season: a purely cosmetic Halloween look for October. It changes nothing about how the game plays and
 * saves nothing: a dusky purple sky and orange specks (FarmLook `halloween`), falling orange and purple leaves, a ring
 * of jack-o'-lanterns round the farm that glow after dark, friendly ghosts drifting about wherever the camera looks,
 * bats at dusk and night, and villagers in witch and pumpkin hats. It switches itself off after 31 October, and players
 * can turn it off in Settings (`settings.halloween = false`).
 */

/** A soft round glow for the lanterns' light after dark. */
function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,200,110,1)');
  grad.addColorStop(0.35, 'rgba(255,140,40,0.55)');
  grad.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A friendly little ghost, about 1.3 tall: a round head on a flared sheet with a wavy hem, big dark eyes and an "oo" mouth. */
function ghostGeometry(): THREE.BufferGeometry {
  const b = geo()
    .sphere(0.4, '#ffffff', [0, 0.9, 0], 2)
    .cyl(0.4, 0.5, 0.75, '#f6f6ff', [0, 0.15, 0], 14)
    .sphere(0.1, '#2a2a38', [0.15, 0.97, 0.33], 1, [0.8, 1.25, 0.6])
    .sphere(0.1, '#2a2a38', [-0.15, 0.97, 0.33], 1, [0.8, 1.25, 0.6])
    .sphere(0.06, '#2a2a38', [0, 0.78, 0.37], 1, [1, 1.3, 0.5]);
  // a wavy hem
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.sphere(0.13, '#f6f6ff', [Math.cos(a) * 0.42, 0.15, Math.sin(a) * 0.42], 1); }
  // little arms
  b.sphere(0.11, '#ffffff', [0.46, 0.55, 0.05], 1, [1.5, 0.7, 0.7]).sphere(0.11, '#ffffff', [-0.46, 0.55, 0.05], 1, [1.5, 0.7, 0.7]);
  return b.build();
}

/** A small bat, wings out, facing +z. */
function batGeometry(): THREE.BufferGeometry {
  return geo()
    .sphere(0.14, '#3a2f4a', [0, 0, 0], 0, [1, 0.9, 1.2])
    .box(0.55, 0.03, 0.26, '#2b2238', [-0.32, 0.02, 0], [0, 0, 0.25])
    .box(0.55, 0.03, 0.26, '#2b2238', [0.32, 0.02, 0], [0, 0, -0.25])
    .cone(0.05, 0.1, '#3a2f4a', [0.07, 0.1, 0.05], 4)
    .cone(0.05, 0.1, '#3a2f4a', [-0.07, 0.1, 0.05], 4)
    .build();
}

/** A witch on her broomstick, about 1.6 long, flying towards +x: broom, bristles, a purple dress and cape, a green-banded hat. */
function witchGeometry(): THREE.BufferGeometry {
  return geo()
    .cyl(0.045, 0.045, 1.7, '#8a5a2a', [0, 0.2, 0], 6, [0, 0, Math.PI / 2])
    .cone(0.2, 0.5, '#e8c45a', [-1.05, 0.2, 0], 8, [0, 0, Math.PI / 2])
    .cone(0.28, 0.75, '#5a3a9a', [0, 0.18, 0], 10)
    .box(0.12, 0.55, 0.42, '#3b2a5a', [-0.28, 0.6, 0], [0, 0, 0.6])
    .sphere(0.19, '#f6c9a0', [0.05, 1.0, 0], 1)
    .sphere(0.17, '#e8833a', [-0.08, 1.02, 0], 1, [0.8, 1.1, 1.15])
    .cyl(0.42, 0.42, 0.04, '#2b1a3a', [0.03, 1.12, 0], 14)
    .cone(0.22, 0.65, '#2b1a3a', [0, 1.14, 0], 10, [0, 0, -0.35])
    .cyl(0.23, 0.23, 0.07, '#6cc644', [0.02, 1.15, 0], 10)
    .build();
}

/** One string of bunting: little hanging pennants in orange, purple and black along a sagging line. */
function buntingGeometry(a: THREE.Vector3, b: THREE.Vector3, sag: number, step: number): THREE.BufferGeometry {
  const g = geo(), cols = ['#ff8a2a', '#7f55d0', '#2b2238'];
  const n = Math.max(2, Math.floor(a.distanceTo(b) / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = a.clone().lerp(b, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    g.cone(0.42, 0.8, cols[i % 3], [p.x, p.y - 0.8, p.z], 3, [Math.PI, yaw, 0]);
  }
  return g.build();
}

/** The cord the pennants hang from, sagging the same way. */
function buntingCord(a: THREE.Vector3, b: THREE.Vector3, sag: number, mat: THREE.LineBasicMaterial): THREE.Line {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 40; i++) { const t = i / 40, p = a.clone().lerp(b, t); p.y -= Math.sin(t * Math.PI) * sag; pts.push(p); }
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
}

interface Ghost { obj: THREE.Object3D; a: number; r: number; speed: number; y: number; phase: number }
interface Bat { a: number; r: number; speed: number; y: number; phase: number }

export class HalloweenDecor {
  readonly group = new THREE.Group();
  /** what follows the camera (ghosts and bats), so they turn up on the farm, in the square and in the woods */
  private roaming = new THREE.Group();
  private ghosts: Ghost[] = [];
  private bats?: THREE.InstancedMesh;
  private batData: Bat[] = [];
  private glow?: THREE.Points;
  private glowMat?: THREE.PointsMaterial;
  private ghostMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.88, emissive: '#55556a', depthWrite: false });
  private floaters: { obj: THREE.Object3D; glow: THREE.Sprite; a: number; r: number; speed: number; y: number; phase: number }[] = [];
  private witch?: THREE.Object3D;
  private witchT = 6;
  private mist?: THREE.Points;
  private mistMat?: THREE.PointsMaterial;
  private glowTex = glowTexture();
  private t = 0;
  private tmp = new THREE.Object3D();

  constructor(private density = 1) {}

  async build(): Promise<void> {
    this.group.add(this.roaming);
    await this.buildPumpkins();
    this.buildGhosts();
    this.buildBats();
    await this.buildFloaters();
    this.buildWitch();
    this.buildMist();
  }

  /** Jack-o'-lanterns round the edge of the farm, just off the fields, with a lantern post at each corner. */
  private async buildPumpkins(): Promise<void> {
    const r = rng(1031);
    const ring = new THREE.Group();
    const edge = HALF + 1.4;
    const at: THREE.Vector3[] = [];
    const per = Math.max(6, Math.round(13 * this.density));
    const top = 5.6;
    for (let side = 0; side < 4; side++) {
      for (let i = 0; i < per; i++) {
        const u = -edge + 3 + ((2 * edge - 6) * (i + 0.5)) / per + (r() - 0.5) * 1.2;
        const x = side === 0 ? u : side === 1 ? edge : side === 2 ? -u : -edge;
        const z = side === 0 ? -edge : side === 1 ? u : side === 2 ? edge : -u;
        const id = r() < 0.12 ? 'hal/jack_gold' : r() < 0.3 ? 'hal/pumpkin' : 'hal/jack';
        const w = 1.1 + r() * 0.5;
        const p = await modelObject(id, w);
        p.position.set(x, 0, z);
        // faces look in towards the farm
        p.rotation.y = Math.atan2(-x, -z) + (r() - 0.5) * 0.6;
        ring.add(p);
        if (id !== 'hal/pumpkin') at.push(new THREE.Vector3(x, w * 0.55, z));
      }
    }
    for (const [x, z] of [[-edge, -edge], [edge, -edge], [edge, edge], [-edge, edge]] as const) {
      const post = await tallObject('hal/lantern_post', top + 0.3);
      post.position.set(x, 0, z);
      ring.add(post);
      at.push(new THREE.Vector3(x, 2.1, z), new THREE.Vector3(x, top - 0.2, z));
    }
    // orange and yellow autumn pines a step further out, between the pumpkins
    for (let side = 0; side < 4; side++) for (let i = 0; i < Math.ceil(per / 2); i++) {
      const out = edge + 2.2, u = -out + 4 + ((2 * out - 8) * (i + 0.5)) / Math.ceil(per / 2) + (r() - 0.5) * 2;
      const x = side === 0 ? u : side === 1 ? out : side === 2 ? -u : -out;
      const z = side === 0 ? -out : side === 1 ? u : side === 2 ? out : -u;
      const pine = await modelObject(r() < 0.5 ? 'hal/pine_orange' : 'hal/pine_yellow', 1.6 + r() * 0.8);
      pine.position.set(x, 0, z);
      pine.rotation.y = r() * Math.PI * 2;
      ring.add(pine);
    }
    this.group.add(ring);
    mergeStatic(ring);
    // bunting strung between the lantern posts round the farm
    const c = [[-edge, -edge], [edge, -edge], [edge, edge], [-edge, edge]].map(([x, z]) => new THREE.Vector3(x, top, z));
    const flags = new THREE.Group();
    const cord = new THREE.LineBasicMaterial({ color: '#2b2238' });
    const strings: [THREE.Vector3, THREE.Vector3, number][] = [[c[0], c[1], 1.4], [c[1], c[2], 1.4], [c[2], c[3], 1.4], [c[3], c[0], 1.4]];
    for (const [a, b, sag] of strings) flags.add(new THREE.Mesh(buntingGeometry(a, b, sag, 1.25), assets.vertexMaterial), buntingCord(a, b, sag, cord));
    flags.traverse((o) => { (o as THREE.Mesh).castShadow = false; });
    this.group.add(flags);
    // their glow after dark
    const g = new THREE.BufferGeometry().setFromPoints(at);
    this.glowMat = new THREE.PointsMaterial({ map: glowTexture(), size: 2.2, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    this.glow = new THREE.Points(g, this.glowMat);
    this.glow.frustumCulled = false;
    this.glow.renderOrder = 2;
    this.group.add(this.glow);
  }

  private buildGhosts(): void {
    const r = rng(1313);
    const g = ghostGeometry();
    const n = Math.max(4, Math.round(10 * this.density));
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(g, this.ghostMat);
      m.renderOrder = 3;
      // yaw towards the camera, then tip the face up a little so it reads from above
      m.rotation.order = 'YXZ';
      m.rotation.x = -0.45;
      const s = 0.8 + r() * 0.35;
      m.scale.setScalar(s);
      this.roaming.add(m);
      this.ghosts.push({ obj: m, a: (i / n) * Math.PI * 2, r: 3.5 + r() * 9, speed: (0.12 + r() * 0.1) * (i % 2 ? -1 : 1), y: 1.6 + r() * 1.6, phase: r() * 10 });
    }
  }

  private buildBats(): void {
    const r = rng(1031 * 3);
    const n = Math.max(3, Math.round(10 * this.density));
    this.bats = new THREE.InstancedMesh(batGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), n);
    this.bats.frustumCulled = false;
    for (let i = 0; i < n; i++) this.batData.push({ a: r() * Math.PI * 2, r: 7 + r() * 12, speed: (0.5 + r() * 0.5) * (i % 2 ? -1 : 1), y: 6 + r() * 4, phase: r() * 10 });
    this.roaming.add(this.bats);
  }

  /** Jack-o'-lanterns floating high over the farm, each with its own warm glow (day and night). */
  private async buildFloaters(): Promise<void> {
    const r = rng(3110);
    const n = Math.max(3, Math.round(6 * this.density));
    for (let i = 0; i < n; i++) {
      const obj = await modelObject(i % 3 === 2 ? 'hal/jack_gold' : 'hal/jack', 1.3 + r() * 0.5);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
      glow.scale.setScalar(3.4);
      glow.renderOrder = 2;
      this.roaming.add(obj, glow);
      this.floaters.push({ obj, glow, a: (i / n) * Math.PI * 2 + 0.4, r: 4 + r() * 10, speed: (0.08 + r() * 0.08) * (i % 2 ? 1 : -1), y: 4.2 + r() * 2.4, phase: r() * 10 });
    }
  }

  private buildWitch(): void {
    const m = new THREE.Mesh(witchGeometry(), assets.vertexMaterial);
    m.scale.setScalar(2.4);
    m.visible = false;
    this.witch = m;
    this.roaming.add(m);
  }

  /** Low purple mist drifting over the ground. */
  private buildMist(): void {
    const r = rng(1111);
    const n = Math.max(10, Math.round(26 * this.density));
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2, d = 2 + r() * 18; pts.push(new THREE.Vector3(Math.cos(a) * d, 0.5 + r() * 0.6, Math.sin(a) * d)); }
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(225,205,255,0.9)');
    grad.addColorStop(1, 'rgba(225,205,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    this.mistMat = new THREE.PointsMaterial({ map: tex, size: 7, transparent: true, opacity: 0.32, depthWrite: false });
    this.mist = new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts), this.mistMat);
    this.mist.frustumCulled = false;
    this.mist.renderOrder = 1;
    this.roaming.add(this.mist);
  }

  /** Once a frame: ghosts drift and bob round the camera's target, bats flit at dusk and night, lanterns glow after dark. */
  update(dt: number, night: number, target: THREE.Vector3): void {
    if (!this.group.visible) return;
    this.t += dt;
    this.roaming.position.set(target.x, 0, target.z);
    for (const g of this.ghosts) {
      g.a += g.speed * dt * 0.4;
      const x = Math.cos(g.a) * g.r, z = Math.sin(g.a) * g.r;
      g.obj.position.set(x, g.y + Math.sin(this.t * 1.3 + g.phase) * 0.25, z);
      // they keep their faces turned to the camera (it looks in from +x +z), swaying a little
      g.obj.rotation.y = Math.PI / 4 + Math.sin(this.t * 0.8 + g.phase) * 0.35;
      g.obj.rotation.z = Math.sin(this.t * 1.7 + g.phase) * 0.08;
    }
    // ghosts are easier to spot by night
    this.ghostMat.opacity = 0.86 + 0.08 * night;
    this.ghostMat.emissive.setRGB(0.32 + 0.3 * night, 0.32 + 0.32 * night, 0.4 + 0.4 * night);
    if (this.bats) {
      // bats all day in spooky season, more of them after dark
      const show = true;
      this.bats.count = night > 0.25 ? this.batData.length : Math.ceil(this.batData.length / 2);
      if (show) {
        this.batData.forEach((b, i) => {
          b.a += b.speed * dt * 0.35;
          const flap = Math.sin(this.t * 14 + b.phase);
          this.tmp.position.set(Math.cos(b.a) * b.r, b.y + Math.sin(this.t * 2 + b.phase) * 0.6, Math.sin(b.a) * b.r);
          this.tmp.rotation.set(0, -b.a + (b.speed > 0 ? 0 : Math.PI), flap * 0.35);
          this.tmp.scale.set(1, 1 + flap * 0.15, 1);
          this.tmp.updateMatrix();
          this.bats!.setMatrixAt(i, this.tmp.matrix);
        });
        this.bats.instanceMatrix.needsUpdate = true;
      }
    }
    for (const f of this.floaters) {
      f.a += f.speed * dt * 0.35;
      const y = f.y + Math.sin(this.t * 0.9 + f.phase) * 0.45;
      f.obj.position.set(Math.cos(f.a) * f.r, y, Math.sin(f.a) * f.r);
      f.obj.rotation.y = Math.PI / 4 + Math.sin(this.t * 0.6 + f.phase) * 0.5;
      f.glow.position.set(f.obj.position.x, y + 0.6, f.obj.position.z);
      (f.glow.material as THREE.SpriteMaterial).opacity = (0.45 + 0.5 * night) * (0.85 + 0.15 * Math.sin(this.t * 4 + f.phase));
    }
    // the witch zooms across now and then
    if (this.witch) {
      this.witchT -= dt;
      const fly = 7;
      if (this.witchT <= 0) this.witchT = 28 + Math.random() * 14;
      const k = 1 - this.witchT / fly;
      this.witch.visible = this.witchT <= fly && this.witchT > 0;
      if (this.witch.visible) {
        const x = -22 + 44 * k, z = 10 - 20 * k;
        this.witch.position.set(x, 7 + Math.sin(k * Math.PI) * 2 + Math.sin(this.t * 6) * 0.15, z);
        // heading along the path (44 across, 20 back), nose to +x
        this.witch.rotation.set(0, Math.atan2(20, 44), Math.sin(this.t * 3) * 0.08);
      }
    }
    if (this.mist) this.mist.rotation.y += dt * 0.02;
    if (this.glowMat && this.glow) {
      const o = Math.min(1, Math.max(0, (night - 0.05) * 1.6));
      this.glowMat.opacity = o * (0.85 + 0.15 * Math.sin(this.t * 3));
      this.glow.visible = o > 0.01;
    }
  }
}
