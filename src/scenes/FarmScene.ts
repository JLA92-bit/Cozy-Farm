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
  /** Canvas rect cached on resize: reading it every frame forces a layout per projected bubble. */
  private rect = { left: 0, top: 0, width: 1, height: 1 };
  private projTmp = new THREE.Vector3();
  private resizeTimer = 0;
  /** Lights, sky and clouds: everything that stays on screen while visiting a neighbour. */
  private envObjects: Set<THREE.Object3D>;
  private hiddenForVisit: THREE.Object3D[] = [];
  /**
   * A neighbour's farm being visited (read-only). While set, it is drawn instead of the player's farm,
   * and the player's own tick and frame hooks are paused: nothing of the player's farm runs or changes.
   */
  visit: { view: FarmView; frame: (dt: number, t: number) => void } | null = null;

  constructor(readonly canvas: HTMLCanvasElement, readonly renderer: Renderer) {
    this.rig = new CameraRig(window.innerWidth / window.innerHeight);
    this.rig.bounds.set(new THREE.Vector2(-HALF + 2, -HALF + 2), new THREE.Vector2(HALF - 2, HALF - 2));
    this.rig.target.set(-3, 0, -2);
    this.env = new Environment(this.scene, renderer.profile.shadowMapSize, renderer.profile.ambientLife);
    this.envObjects = new Set(this.scene.children);
    this.farm = new FarmView(this.scene);
    this.input = new Input(canvas, this);
    this.loop = new GameLoop((dt, t) => this.frame(dt, t), (now) => this.tick(now));
    this.loop.maxFps = renderer.profile.maxFps >= 60 ? 0 : renderer.profile.maxFps;
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    // some mobile browsers report the old size during orientationchange; settle again shortly after
    const settle = () => { clearTimeout(this.resizeTimer); this.resize(); this.resizeTimer = window.setTimeout(() => this.resize(), 350); };
    window.addEventListener('orientationchange', settle);
    screen.orientation?.addEventListener?.('change', settle);
    this.resize();
  }

  private lastW = 0;
  private lastH = 0;
  private updateRect(): void {
    const r = this.canvas.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) this.rect = { left: r.left, top: r.top, width: r.width, height: r.height };
    else this.rect = { left: 0, top: 0, width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight) };
  }

  onFrame(fn: (dt: number, t: number) => void): void { this.frameHooks.push(fn); }
  onTick(fn: (now: number) => void): void { this.tickHooks.push(fn); }

  resize(): void {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    if (w === this.lastW && h === this.lastH && this.rect.width > 1) { this.updateRect(); return; }
    this.lastW = w; this.lastH = h;
    this.renderer.resize(w, h);
    this.updateRect();
    this.rig.setAspect(w / h);
    this.loop.wake(0.5);
  }

  /**
   * Hide everything of the player's farm (farm view, farmer, villagers, effects, ghosts) so a visited
   * farm can be shown in its place. Only lights, sky and clouds stay.
   */
  hideOwnFarm(): void {
    for (const o of this.scene.children) {
      if (this.envObjects.has(o) || !o.visible) continue;
      o.visible = false;
      this.hiddenForVisit.push(o);
    }
  }
  /** Undo hideOwnFarm: the player's farm exactly as it was. */
  showOwnFarm(): void {
    for (const o of this.hiddenForVisit) o.visible = true;
    this.hiddenForVisit = [];
    this.loop.wake(1);
  }

  private tick(now: number): void {
    if (this.visit) return; // the player's systems are paused while visiting
    for (const fn of this.tickHooks) fn(this.now());
    void now;
  }

  private frame(dt: number, t: number): void {
    const start = performance.now();
    this.rig.update(dt);
    this.env.update(dt, t, this.now(), this.rig.target);
    const visit = this.visit;
    const view = visit ? visit.view : this.farm;
    view.terrain.update(t, this.env.light, this.env.sky, this.env.night, this.rig.target, dt);
    view.blobShadows = !this.renderer.renderer.shadowMap.enabled || !this.env.sun.castShadow;
    view.frame(dt, t, this.env.night);
    if (visit) visit.frame(dt, t);
    else for (const fn of this.frameHooks) fn(dt, t);
    this.renderer.renderer.render(this.scene, this.rig.camera);
    this.gpuGuard?.afterRender();
    // keep animating while things move; otherwise the loop idles at low fps
    if (this.rig.moving || this.input.active || (!visit && this.farm.hints.visible) || view.gatesSwinging) this.loop.wake(0.3);
    this.lastFrameMs = performance.now() - start;
    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc >= 1) { this.fps = this.fpsFrames / this.fpsAcc; this.fpsAcc = 0; this.fpsFrames = 0; }
  }

  /** Set by Boot: watches the first frames for a blank canvas and context loss. */
  gpuGuard: import('./GpuGuard').GpuGuard | null = null;

  /** Apply the current quality + Shadows switch: shadow map size, and recompile materials for the shadow change. */
  refreshShadows(): void {
    this.env.setShadowMapSize(this.renderer.profile.shadowMapSize);
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) m.forEach((x) => { x.needsUpdate = true; });
      else if (m) m.needsUpdate = true;
    });
    this.loop.wake(0.5);
  }

  get frameMs(): number { return this.lastFrameMs; }

  // ------------------------------------------------------------ picking helpers
  ray(p: Pointer): THREE.Ray {
    const r = this.rect;
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
    const p = this.projTmp.copy(v).project(this.rig.camera);
    const r = this.rect;
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
