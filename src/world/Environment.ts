import * as THREE from 'three';
import { HALF, MAP } from './Grid';
import { geo, PAL, rng } from './Procedural';
import { assets } from '../core/Assets';

/** Lights, sky colour, gentle day/night cycle and ambient life (clouds, birds, butterflies). */
export class Environment {
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly group = new THREE.Group();
  /** 0 = full day, 1 = deepest night. */
  night = 0;
  /** Overall light multiplier (water shader etc.). */
  light = 1;
  cycleMinutes = 24;
  private clouds: { obj: THREE.Object3D; speed: number }[] = [];
  private birds?: THREE.InstancedMesh;
  private birdData: { x: number; z: number; y: number; vx: number; vz: number; phase: number }[] = [];
  private butterflies?: THREE.InstancedMesh;
  private bflyData: { cx: number; cz: number; r: number; phase: number; speed: number }[] = [];
  private dummy = new THREE.Object3D();
  private skyDay = new THREE.Color('#8fd3f4');
  private skyDusk = new THREE.Color('#f7b27a');
  private skyNight = new THREE.Color('#2e3f78');
  readonly sky = new THREE.Color();
  timeOffset = 0;

  constructor(private scene: THREE.Scene, shadowMapSize: number, private density: number) {
    this.hemi = new THREE.HemisphereLight('#fffaf0', '#7da35a', 1.35);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff3d6', 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    const s = 22;
    Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 90 });
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun, this.sun.target);
    scene.add(this.group);
    scene.fog = new THREE.Fog(this.skyDay, 70, 160);
    scene.background = this.sky;
  }

  setShadowMapSize(n: number): void {
    this.sun.shadow.mapSize.set(n, n);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
  }

  async populate(): Promise<void> {
    const r = rng(7);
    // clouds
    const cloudIds = ['nat/cloud_big', 'nat/cloud_small'];
    const n = Math.round(10 * this.density);
    for (let i = 0; i < n; i++) {
      const m = await assets.mesh(cloudIds[i % 2]);
      m.traverse((o) => { (o as THREE.Mesh).castShadow = false; (o as THREE.Mesh).receiveShadow = false; });
      const sc = 4 + r() * 4;
      m.scale.setScalar(sc);
      m.position.set((r() - 0.5) * 130, 14 + r() * 8, (r() - 0.5) * 130);
      this.group.add(m);
      this.clouds.push({ obj: m, speed: 0.4 + r() * 0.5 });
    }
    // birds: tiny V shapes, instanced
    const bird = geo().box(0.5, 0.05, 0.16, PAL.white, [-0.22, 0, 0], [0, 0, 0.35]).box(0.5, 0.05, 0.16, PAL.white, [0.22, 0, 0], [0, 0, -0.35]).box(0.16, 0.1, 0.3, PAL.white).build();
    const nb = Math.round(9 * this.density);
    this.birds = new THREE.InstancedMesh(bird, assets.vertexMaterial, Math.max(1, nb));
    this.birds.count = nb;
    this.birds.frustumCulled = false;
    for (let i = 0; i < nb; i++) {
      const a = r() * Math.PI * 2;
      this.birdData.push({ x: (r() - 0.5) * 80, z: (r() - 0.5) * 80, y: 9 + r() * 5, vx: Math.cos(a) * 3, vz: Math.sin(a) * 3, phase: r() * 10 });
    }
    this.group.add(this.birds);
    // butterflies around the farm
    const wing = geo().box(0.18, 0.02, 0.14, '#ffffff', [-0.09, 0, 0]).box(0.18, 0.02, 0.14, '#ffffff', [0.09, 0, 0]).build();
    const nf = Math.round(14 * this.density);
    this.butterflies = new THREE.InstancedMesh(wing, new THREE.MeshBasicMaterial({ vertexColors: false }), Math.max(1, nf));
    this.butterflies.count = nf;
    this.butterflies.frustumCulled = false;
    const tints = ['#ff9fd0', '#ffe066', '#9fd8ff', '#ffffff', '#c8a2ff', '#ffb86b'];
    for (let i = 0; i < nf; i++) {
      this.bflyData.push({ cx: (r() - 0.5) * (MAP - 8), cz: (r() - 0.5) * (MAP - 8), r: 1 + r() * 3, phase: r() * 10, speed: 0.4 + r() * 0.6 });
      this.butterflies.setColorAt(i, new THREE.Color(tints[i % tints.length]));
    }
    this.group.add(this.butterflies);
  }

  /** Day phase 0..1 from the wall clock, so the cycle continues between sessions. */
  phase(now: number): number {
    const period = this.cycleMinutes * 60000;
    return (((now + this.timeOffset) % period) + period) % period / period;
  }

  update(dt: number, t: number, now: number, focus: THREE.Vector3): void {
    // ---- day/night: long bright day, warm dusk, short soft-blue night, dawn
    const p = this.phase(now);
    let night: number, dusk: number;
    if (p < 0.6) { night = 0; dusk = 0; }
    else if (p < 0.7) { const k = (p - 0.6) / 0.1; dusk = Math.sin(k * Math.PI); night = k; }
    else if (p < 0.88) { night = 1; dusk = 0; }
    else { const k = (p - 0.88) / 0.12; night = 1 - k; dusk = Math.sin(k * Math.PI) * 0.6; }
    this.night = night;
    this.light = 1 - night * 0.25;
    this.sky.copy(this.skyDay).lerp(this.skyNight, night * 0.7).lerp(this.skyDusk, dusk * 0.6);
    (this.scene.fog as THREE.Fog).color.copy(this.sky);
    this.hemi.intensity = 1.35 - night * 0.35;
    this.hemi.color.set('#fffaf0').lerp(new THREE.Color('#9fb4ff'), night * 0.7);
    this.sun.intensity = 2.1 - night * 1.15;
    this.sun.color.set('#fff3d6').lerp(new THREE.Color('#ffb877'), dusk * 0.8).lerp(new THREE.Color('#a8bdff'), night * 0.7);
    // sun direction swings slowly across the sky; shadow camera follows the camera focus
    const ang = -0.6 + p * 1.2;
    this.sun.position.set(focus.x + Math.cos(ang) * 18 - 6, 30, focus.z + Math.sin(ang) * 10 + 14);
    this.sun.target.position.set(focus.x, 0, focus.z);

    // ---- clouds drift and wrap
    for (const c of this.clouds) {
      c.obj.position.x += c.speed * dt;
      if (c.obj.position.x > 75) c.obj.position.x = -75;
    }
    // ---- birds: flap and glide, wrapping around the island
    if (this.birds) {
      for (let i = 0; i < this.birdData.length; i++) {
        const b = this.birdData[i];
        b.x += b.vx * dt; b.z += b.vz * dt;
        const lim = HALF + 30;
        if (b.x > lim) b.x = -lim; if (b.x < -lim) b.x = lim;
        if (b.z > lim) b.z = -lim; if (b.z < -lim) b.z = lim;
        this.dummy.position.set(b.x, b.y + Math.sin(t * 0.8 + b.phase) * 0.6, b.z);
        this.dummy.rotation.set(0, Math.atan2(b.vx, b.vz), 0);
        const flap = 0.5 + 0.5 * Math.sin(t * 9 + b.phase);
        this.dummy.scale.set(0.6 + flap * 0.6, 1, 1);
        this.dummy.updateMatrix();
        this.birds.setMatrixAt(i, this.dummy.matrix);
      }
      this.birds.instanceMatrix.needsUpdate = true;
      this.birds.visible = night < 0.6;
    }
    if (this.butterflies) {
      for (let i = 0; i < this.bflyData.length; i++) {
        const f = this.bflyData[i];
        const a = t * f.speed + f.phase;
        this.dummy.position.set(f.cx + Math.cos(a) * f.r, 0.8 + Math.sin(a * 2.3) * 0.35, f.cz + Math.sin(a * 1.3) * f.r);
        this.dummy.rotation.set(0, -a, 0);
        this.dummy.scale.set(0.35 + 0.65 * Math.abs(Math.sin(t * 14 + f.phase)), 1, 1);
        this.dummy.updateMatrix();
        this.butterflies.setMatrixAt(i, this.dummy.matrix);
      }
      this.butterflies.instanceMatrix.needsUpdate = true;
      this.butterflies.visible = night < 0.5;
    }
  }
}
