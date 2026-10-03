import * as THREE from 'three';
import { CameraRig } from '../core/CameraRig';
import { Input, type InputHandler, type Pointer, type DragKind } from '../core/Input';
import { Renderer } from '../core/Renderer';
import { GameLoop } from '../core/GameLoop';
import { Environment } from '../world/Environment';
import { FarmView } from '../world/FarmView';
import { HALF, worldToTile } from '../world/Grid';

/**
 * Owns the 3D side: renderer, camera rig, input, environment and the farm view.
 * Gameplay interaction is delegated to an InteractionHandler (set by the game layer).
 */
export interface WorldHandler {
  tap(p: Pointer): void;
  longPress(p: Pointer): void;
  dragStart(p: Pointer): DragKind;
  toolDrag(p: Pointer): void;
  toolDragEnd(p: Pointer): void;
  pointerDown(): void;
}

export class FarmScene implements InputHandler {
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly env: Environment;
  readonly farm: FarmView;
  readonly input: Input;
  readonly loop: GameLoop;
  handler: WorldHandler | null = null;
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private frameHooks: ((dt: number, t: number) => void)[] = [];
  private tickHooks: ((now: number) => void)[] = [];
  private lastFrameMs = 16;
  fps = 60;
  private fpsAcc = 0;
  private fpsFrames = 0;
  now: () => number = () => Date.now();

  constructor(readonly canvas: HTMLCanvasElement, readonly renderer: Renderer) {
    this.rig = new CameraRig(window.innerWidth / window.innerHeight);
    this.rig.bounds.set(new THREE.Vector2(-HALF + 2, -HALF + 2), new THREE.Vector2(HALF - 2, HALF - 2));
    this.rig.target.set(-3, 0, -2);
    this.env = new Environment(this.scene, renderer.profile.shadowMapSize, renderer.profile.ambientLife);
    this.farm = new FarmView(this.scene);
    this.input = new Input(canvas, this);
    this.loop = new GameLoop((dt, t) => this.frame(dt, t), (now) => this.tick(now));
    this.loop.maxFps = renderer.profile.maxFps >= 60 ? 0 : renderer.profile.maxFps;
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    this.resize();
  }

  onFrame(fn: (dt: number, t: number) => void): void { this.frameHooks.push(fn); }
  onTick(fn: (now: number) => void): void { this.tickHooks.push(fn); }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.resize(w, h);
    this.rig.setAspect(w / h);
    this.loop.wake(0.5);
  }

  private tick(now: number): void {
    for (const fn of this.tickHooks) fn(this.now());
    void now;
  }

  private frame(dt: number, t: number): void {
    const start = performance.now();
    this.rig.update(dt);
    this.env.update(dt, t, this.now(), this.rig.target);
    this.farm.terrain.update(t, this.env.light, this.env.sky, this.env.night, this.rig.target, dt);
    this.farm.blobShadows = !this.renderer.renderer.shadowMap.enabled;
    this.farm.frame(dt, t, this.env.night);
    for (const fn of this.frameHooks) fn(dt, t);
    this.renderer.renderer.render(this.scene, this.rig.camera);
    // keep animating while things move; otherwise the loop idles at low fps
    if (this.rig.moving || this.input.active || this.farm.hints.visible) this.loop.wake(0.3);
    this.lastFrameMs = performance.now() - start;
    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc >= 1) { this.fps = this.fpsFrames / this.fpsAcc; this.fpsAcc = 0; this.fpsFrames = 0; }
  }

  get frameMs(): number { return this.lastFrameMs; }

  // ------------------------------------------------------------ picking helpers
  ray(p: Pointer): THREE.Ray {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set((p.x / r.width) * 2 - 1, -(p.y / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.rig.camera);
    return this.raycaster.ray;
  }
  groundPoint(p: Pointer, out = new THREE.Vector3()): THREE.Vector3 | null {
    return this.ray(p).intersectPlane(this.groundPlane, out);
  }
  tileAt(p: Pointer): [number, number] | null {
    const g = this.groundPoint(p);
    return g ? [worldToTile(g.x), worldToTile(g.z)] : null;
  }
  /** World position -> CSS pixel position. */
  project(v: THREE.Vector3, out = new THREE.Vector2()): THREE.Vector2 {
    const p = v.clone().project(this.rig.camera);
    const r = this.canvas.getBoundingClientRect();
    return out.set((p.x + 1) / 2 * r.width, (1 - p.y) / 2 * r.height);
  }

  // ------------------------------------------------------------ InputHandler
  onPointerDown(): void { this.rig.stop(); this.loop.wake(); this.handler?.pointerDown(); }
  onTap(p: Pointer): void { this.loop.wake(); this.handler?.tap(p); }
  onLongPress(p: Pointer): void { this.loop.wake(); this.handler?.longPress(p); }
  onDragStart(p: Pointer): DragKind { return this.handler?.dragStart(p) ?? 'pan'; }
  onToolDrag(p: Pointer): void { this.loop.wake(); this.handler?.toolDrag(p); }
  onToolDragEnd(p: Pointer): void { this.handler?.toolDragEnd(p); }
  onPan(dx: number, dy: number): void { this.rig.panPixels(dx, dy, this.canvas.clientHeight); this.loop.wake(); }
  onPanEnd(vx: number, vy: number): void {
    // convert pixel velocity to world velocity using the same mapping as panPixels
    const before = this.rig.target.clone();
    this.rig.panPixels(vx * 0.05, vy * 0.05, this.canvas.clientHeight);
    const after = this.rig.target.clone();
    this.rig.target.copy(before);
    this.rig.fling((after.x - before.x) / 0.05 * 0.9, (after.z - before.z) / 0.05 * 0.9);
    this.loop.wake(1.5);
  }
  onPinch(scale: number): void { this.rig.zoomBy(scale); this.loop.wake(); }
}
