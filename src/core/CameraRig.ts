import * as THREE from 'three';
import gsap from 'gsap';

/**
 * Fixed-angle isometric-style camera. A perspective camera with a narrow FOV looks at `target`
 * from a fixed azimuth/elevation; zoom changes the distance. Pans are clamped to world bounds.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly target = new THREE.Vector3();
  distance = 26;
  minDistance = 12;
  maxDistance = 58;
  azimuth = Math.PI / 4;
  elevation = THREE.MathUtils.degToRad(48);
  bounds = new THREE.Box2(new THREE.Vector2(-20, -20), new THREE.Vector2(20, 20));
  private velocity = new THREE.Vector2();
  private shakeT = 0;
  private shakeDur = 0;
  private shakeAmp = 0;
  private shakeSeed = 0;
  /** 0 disables screen shake (Settings), 1 is full strength. */
  shakeScale = 1;
  /** Short zoom "kick" (fraction of the distance), springs back on its own. */
  private punchK = 0;
  private offset = new THREE.Vector3();
  onChange?: () => void;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(32, aspect, 1, 300);
    this.update(0);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    // portrait screens see less width: widen FOV a bit so the farm stays readable
    this.camera.fov = aspect < 1 ? 40 : 32;
    this.camera.updateProjectionMatrix();
  }

  /** Move the target by a screen-space delta in pixels. */
  panPixels(dx: number, dy: number, viewportHeight: number): void {
    const worldPerPixel = (2 * this.distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / viewportHeight;
    // screen right/up projected onto the ground plane
    const right = new THREE.Vector3(Math.cos(this.azimuth), 0, -Math.sin(this.azimuth));
    const up = new THREE.Vector3(-Math.sin(this.azimuth), 0, -Math.cos(this.azimuth));
    const upScale = 1 / Math.sin(this.elevation);
    this.target.addScaledVector(right, -dx * worldPerPixel);
    this.target.addScaledVector(up, dy * worldPerPixel * upScale);
    this.clamp();
  }

  /** Inertial pan velocity in world units/s, set on drag release. */
  fling(vx: number, vz: number): void { this.velocity.set(vx, vz); }
  /** Finger down: stop inertia and any camera glide so the farm never fights the player. */
  stop(): void {
    this.velocity.set(0, 0);
    gsap.killTweensOf(this.target);
    gsap.killTweensOf(this, 'distance');
  }

  /**
   * Pinch/wheel zoom. Past the limits the zoom gets stiff (rubber band) and springs back in
   * update(), so the player feels the edge instead of hitting a wall.
   */
  zoomBy(factor: number): void {
    const lo = this.minDistance, hi = this.maxDistance;
    const pushingOut = (this.distance >= hi && factor > 1) || (this.distance <= lo && factor < 1);
    const f = pushingOut ? Math.pow(factor, 0.3) : factor;
    this.distance = THREE.MathUtils.clamp(this.distance * f, lo * 0.88, hi * 1.08);
  }

  focus(x: number, z: number, distance?: number, duration = 0.6): void {
    gsap.to(this.target, { x, z, duration, ease: 'power2.inOut', overwrite: 'auto', onUpdate: () => this.clamp() });
    if (distance !== undefined) gsap.to(this, { distance: THREE.MathUtils.clamp(distance, this.minDistance, this.maxDistance), duration, ease: 'power2.inOut', overwrite: 'auto' });
  }

  /** Smooth, decaying wobble. A stronger shake is never cut short by a weaker one. */
  shake(amplitude = 0.25, duration = 0.35): void {
    amplitude *= this.shakeScale;
    if (amplitude <= 0) return;
    if (this.shakeT > 0 && this.shakeAmp * (this.shakeT / this.shakeDur) > amplitude) return;
    this.shakeAmp = amplitude;
    this.shakeT = this.shakeDur = duration;
    this.shakeSeed = Math.random() * 100;
  }

  /** Quick zoom-in kick that eases back out (level ups, big rewards). */
  punch(amount = 0.06, duration = 0.6): void {
    if (this.shakeScale <= 0) return;
    gsap.killTweensOf(this, 'punchK');
    gsap.timeline()
      .to(this, { punchK: amount, duration: duration * 0.25, ease: 'power2.out' })
      .to(this, { punchK: 0, duration: duration * 0.75, ease: 'elastic.out(1, 0.5)' });
  }

  private clamp(): void {
    this.target.x = THREE.MathUtils.clamp(this.target.x, this.bounds.min.x, this.bounds.max.x);
    this.target.z = THREE.MathUtils.clamp(this.target.z, this.bounds.min.y, this.bounds.max.y);
  }

  get moving(): boolean {
    return this.velocity.lengthSq() > 0.0004 || this.shakeT > 0 || this.punchK !== 0
      || this.distance > this.maxDistance + 0.01 || this.distance < this.minDistance - 0.01;
  }

  update(dt: number): void {
    if (this.velocity.lengthSq() > 0.0001) {
      this.target.x += this.velocity.x * dt;
      this.target.z += this.velocity.y * dt;
      this.velocity.multiplyScalar(Math.pow(0.02, dt));
      this.clamp();
    } else this.velocity.set(0, 0);
    // spring back from a rubber-band overshoot
    const k = 1 - Math.exp(-12 * dt);
    if (this.distance > this.maxDistance) this.distance += (this.maxDistance - this.distance) * k;
    else if (this.distance < this.minDistance) this.distance += (this.minDistance - this.distance) * k;
    const d = this.distance * (1 - this.punchK);
    this.offset.set(
      Math.sin(this.azimuth) * Math.cos(this.elevation) * d,
      Math.sin(this.elevation) * d,
      Math.cos(this.azimuth) * Math.cos(this.elevation) * d,
    );
    this.camera.position.copy(this.target).add(this.offset);
    let roll = 0;
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      // smooth layered sines instead of per-frame random jitter: reads as a soft thump, not a buzz
      const k = this.shakeT / this.shakeDur;
      const a = this.shakeAmp * k * k;
      const t = (this.shakeDur - this.shakeT) * 38 + this.shakeSeed;
      this.camera.position.x += (Math.sin(t) + 0.5 * Math.sin(t * 2.3 + 1.7)) * a * 0.6;
      this.camera.position.y += (Math.sin(t * 1.3 + 0.5) + 0.5 * Math.sin(t * 2.9)) * a * 0.6;
      roll = Math.sin(t * 0.9 + 2.1) * a * 0.02;
    }
    this.camera.lookAt(this.target);
    if (roll) this.camera.rotateZ(roll);
    this.onChange?.();
  }
}
