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
  private shakeAmp = 0;
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
  stop(): void { this.velocity.set(0, 0); }

  zoomBy(factor: number): void {
    this.distance = THREE.MathUtils.clamp(this.distance * factor, this.minDistance, this.maxDistance);
  }

  focus(x: number, z: number, distance?: number, duration = 0.6): void {
    gsap.to(this.target, { x, z, duration, ease: 'power2.out', onUpdate: () => this.clamp() });
    if (distance !== undefined) gsap.to(this, { distance: THREE.MathUtils.clamp(distance, this.minDistance, this.maxDistance), duration, ease: 'power2.out' });
  }

  shake(amplitude = 0.25, duration = 0.35): void {
    this.shakeAmp = amplitude;
    this.shakeT = duration;
  }

  private clamp(): void {
    this.target.x = THREE.MathUtils.clamp(this.target.x, this.bounds.min.x, this.bounds.max.x);
    this.target.z = THREE.MathUtils.clamp(this.target.z, this.bounds.min.y, this.bounds.max.y);
  }

  get moving(): boolean { return this.velocity.lengthSq() > 0.0004 || this.shakeT > 0; }

  update(dt: number): void {
    if (this.velocity.lengthSq() > 0.0001) {
      this.target.x += this.velocity.x * dt;
      this.target.z += this.velocity.y * dt;
      this.velocity.multiplyScalar(Math.pow(0.02, dt));
      this.clamp();
    } else this.velocity.set(0, 0);
    const d = this.distance;
    this.offset.set(
      Math.sin(this.azimuth) * Math.cos(this.elevation) * d,
      Math.sin(this.elevation) * d,
      Math.cos(this.azimuth) * Math.cos(this.elevation) * d,
    );
    this.camera.position.copy(this.target).add(this.offset);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * Math.max(0, this.shakeT) * 3;
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
    }
    this.camera.lookAt(this.target);
    this.onChange?.();
  }
}
