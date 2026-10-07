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
  private clouds: { obj: THREE.Object3D; speed: number; a: number; r: number; y: number }[] = [];
  /** Pollen motes by day, blinking fireflies by night: one Points draw call. */
  private motes?: THREE.Points;
  private moteMat?: THREE.PointsMaterial;
  private moteData: { x: number; z: number; y: number; phase: number; speed: number; r: number }[] = [];
  private moteNight = -1;
  private birds?: THREE.InstancedMesh;
  private birdData: { x: number; z: number; y: number; vx: number; vz: number; phase: number }[] = [];
  private butterflies?: THREE.InstancedMesh;
  private bflyData: { cx: number; cz: number; r: number; phase: number; speed: number }[] = [];
  private dummy = new THREE.Object3D();
  private skyDay = new THREE.Color('#8fd3f4');
  private skyDusk = new THREE.Color('#f7b27a');
  private skyDawn = new THREE.Color('#f9c6c9');
  private skyNight = new THREE.Color('#2a3a74');
  // light grading targets (allocated once, reused every frame)
  private hemiDay = new THREE.Color('#fffaf0');
  private hemiNight = new THREE.Color('#7d98ff');
  private hemiDusk = new THREE.Color('#ffd2a8');
  private groundDay = new THREE.Color('#7da35a');
  private groundNight = new THREE.Color('#2c3f66');
  private sunDay = new THREE.Color('#fff3d6');
  private sunDusk = new THREE.Color('#ff9f5a');
  private sunDawn = new THREE.Color('#ffc2a0');
  private moon = new THREE.Color('#a9c0ff');
  private fireflyCol = new THREE.Color('#e9ff8a');
  private pollenCol = new THREE.Color('#fffbe6');
  readonly sky = new THREE.Color();
  timeOffset = 0;
  /** 1.8 weather: what today looks like ('sunny', 'rain', 'mist'), eased in over a few seconds. */
  weather = 'sunny';
  private rainK = 0;
  private mistK = 0;
  private rain?: THREE.LineSegments;
  private rainData?: Float32Array;
  private skyRain = new THREE.Color('#8d9caf');
  private skyMist = new THREE.Color('#dfe7ea');

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
      const sc = 3.5 + r() * 3.5;
      m.scale.setScalar(sc);
      // clouds circle slowly out over the sea, framing the island instead of covering the farm
      const c = { obj: m, speed: (0.006 + r() * 0.006) * (i % 3 === 0 ? -1 : 1), a: (i / n) * Math.PI * 2 + r() * 0.5, r: HALF + 12 + r() * 22, y: 6 + r() * 6 };
      m.position.set(Math.cos(c.a) * c.r, c.y, Math.sin(c.a) * c.r);
      this.group.add(m);
      this.clouds.push(c);
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
    // pollen / fireflies
    const nm = Math.max(8, Math.round(70 * this.density));
    const mp = new Float32Array(nm * 3);
    for (let i = 0; i < nm; i++) {
      this.moteData.push({ x: (r() - 0.5) * (MAP - 4), z: (r() - 0.5) * (MAP - 4), y: 0.4 + r() * 1.6, phase: r() * 10, speed: 0.3 + r() * 0.5, r: 0.4 + r() * 1.2 });
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    mg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), MAP);
    this.moteMat = new THREE.PointsMaterial({ map: glowDot(), size: 0.22, sizeAttenuation: true, transparent: true, depthWrite: false, color: this.pollenCol, opacity: 0.5 });
    this.motes = new THREE.Points(mg, this.moteMat);
    this.motes.renderOrder = 4;
    this.group.add(this.motes);
    // 1.8 rain: short streaks around the camera target, one draw call (fewer on Low graphics)
    const nr = Math.max(90, Math.round(560 * this.density));
    this.rainData = new Float32Array(nr * 3);
    for (let i = 0; i < nr; i++) this.rainData.set([(r() - 0.5) * RAIN_BOX, r() * RAIN_TOP, (r() - 0.5) * RAIN_BOX], i * 3);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nr * 6), 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#dff1ff', transparent: true, opacity: 0, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.rain.renderOrder = 4;
    this.group.add(this.rain);
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
    this.light = 1 - night * 0.3;
    const dawn = p >= 0.88 ? dusk : 0;
    const eve = p < 0.88 ? dusk : 0;
    // 1.8 weather eases in and out over a few seconds
    this.rainK += ((this.weather === 'rain' ? 1 : 0) - this.rainK) * Math.min(1, dt * 1.2);
    this.mistK += ((this.weather === 'mist' ? 1 : 0) - this.mistK) * Math.min(1, dt * 1.2);
    const rainK = this.rainK, mistK = this.mistK;
    this.sky.copy(this.skyDay).lerp(this.skyNight, night * 0.8).lerp(this.skyDusk, eve * 0.6).lerp(this.skyDawn, dawn * 0.7);
    if (rainK > 0.001) this.sky.lerp(this.skyRain, rainK * (0.55 - night * 0.3));
    if (mistK > 0.001) this.sky.lerp(this.skyMist, mistK * (0.5 - night * 0.3));
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(this.sky);
    // evening haze: the distance melts into warm peach at dusk and soft blue at night
    fog.near = 70 - night * 32 - dusk * 18 - rainK * 30 - mistK * 58;
    fog.far = 160 - night * 50 - dusk * 30 - rainK * 55 - mistK * 98;
    // soft moonlit blue at night (still readable), warm peach at golden hour; a little greyer when it rains
    this.hemi.intensity = 1.35 - night * 0.45 - rainK * 0.28;
    this.hemi.color.copy(this.hemiDay).lerp(this.hemiNight, night * 0.9).lerp(this.hemiDusk, dusk * 0.75);
    this.hemi.groundColor.copy(this.groundDay).lerp(this.groundNight, night * 0.85);
    this.sun.intensity = (2.1 - night * 1.35 + eve * 0.35) * (1 - rainK * 0.5 - mistK * 0.25);
    this.sun.color.copy(this.sunDay).lerp(this.sunDusk, eve * 0.9).lerp(this.sunDawn, dawn * 0.7).lerp(this.moon, night * 0.85);
    // sun swings across the sky and sinks low at golden hour (long cosy shadows); the moon rides high at night
    const ang = -0.6 + p * 1.2;
    this.sun.position.set(focus.x + Math.cos(ang) * 18 - 6, 30 - dusk * 14, focus.z + Math.sin(ang) * 10 + 14);
    this.sun.target.position.set(focus.x, 0, focus.z);

    // ---- clouds drift and wrap
    for (const c of this.clouds) {
      c.a += c.speed * dt;
      c.obj.position.set(Math.cos(c.a) * c.r, c.y + Math.sin(t * 0.2 + c.r) * 0.3, Math.sin(c.a) * c.r);
    }
    this.updateMotes(t, night);
    this.updateRain(dt, focus);
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

  /** Show today's weather at once (on boot), instead of easing in. */
  snapWeather(): void {
    this.rainK = this.weather === 'rain' ? 1 : 0;
    this.mistK = this.weather === 'mist' ? 1 : 0;
  }

  /** Rain streaks fall and wrap inside a box that follows the camera target. */
  private updateRain(dt: number, focus: THREE.Vector3): void {
    const rain = this.rain, d = this.rainData;
    if (!rain || !d) return;
    rain.visible = this.rainK > 0.02;
    if (!rain.visible) return;
    (rain.material as THREE.LineBasicMaterial).opacity = 0.75 * this.rainK;
    const arr = (rain.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < d.length; i += 3) {
      d[i + 1] -= RAIN_SPEED * dt;
      if (d[i + 1] < 0) d[i + 1] += RAIN_TOP;
      // drops stay around the camera target as it pans
      const x = d[i] + focus.x, z = d[i + 2] + focus.z;
      const j = i * 2;
      arr[j] = x; arr[j + 1] = d[i + 1]; arr[j + 2] = z;
      // slanted a touch, like a light breeze
      arr[j + 3] = x - 0.1; arr[j + 4] = d[i + 1] + 0.8; arr[j + 5] = z - 0.05;
    }
    rain.geometry.attributes.position.needsUpdate = true;
  }

  private updateMotes(t: number, night: number): void {
    if (!this.motes || !this.moteMat) return;
    const isNight = night > 0.45 ? 1 : 0;
    if (isNight !== this.moteNight) {
      // swap look only when crossing the threshold (no per-frame material churn)
      this.moteNight = isNight;
      this.moteMat.color.copy(isNight ? this.fireflyCol : this.pollenCol);
      this.moteMat.blending = isNight ? THREE.AdditiveBlending : THREE.NormalBlending;
      this.moteMat.size = isNight ? 0.8 : 0.32;
      this.moteMat.needsUpdate = true;
    }
    this.moteMat.opacity = isNight ? Math.min(1, (night - 0.45) * 3) : 0.55 * (1 - night * 2);
    const arr = (this.motes.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < this.moteData.length; i++) {
      const m = this.moteData[i];
      const a = t * m.speed + m.phase;
      let y = m.y + Math.sin(a * 1.7) * 0.25;
      // fireflies blink: park the unlit ones underground for that moment
      if (isNight && Math.sin(t * (1.3 + m.speed) + m.phase * 3) < -0.35) y = -5;
      arr[i * 3] = m.x + Math.cos(a) * m.r;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = m.z + Math.sin(a * 0.8) * m.r;
    }
    this.motes.geometry.attributes.position.needsUpdate = true;
  }
}

/** Rain box around the camera target (world units), drop height and fall speed (units / s). */
const RAIN_BOX = 30;
const RAIN_TOP = 14;
const RAIN_SPEED = 13;

/** Small soft round dot used by the motes (canvas texture, made once). */
function glowDot(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
