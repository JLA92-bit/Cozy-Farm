/**
 * requestAnimationFrame loop with:
 *  - full pause while the tab is hidden
 *  - idle throttling: when nothing has asked for smooth frames recently, render at a low rate to save battery
 *  - a fixed-rate logic tick (timers, systems) decoupled from rendering
 */
export type FrameFn = (dt: number, time: number) => void;

export class GameLoop {
  private running = false;
  private hidden = false;
  private last = 0;
  private lastRender = 0;
  private tickAccum = 0;
  private activeUntil = 0;
  private rafId = 0;
  /** Frames per second while idle. */
  idleFps = 20;
  /** Seconds between logic ticks. */
  tickInterval = 0.25;
  /** Max fps cap (0 = uncapped/display rate). */
  maxFps = 0;

  constructor(private onFrame: FrameFn, private onTick: (now: number) => void) {
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.hidden;
      if (!this.hidden && this.running) {
        this.last = performance.now();
        this.wake(1);
        this.schedule();
      }
    });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.wake(2);
    this.schedule();
  }

  /** Request full frame rate for at least `seconds`. Call on input, animation, tweens. */
  wake(seconds = 1.5): void {
    this.activeUntil = Math.max(this.activeUntil, performance.now() + seconds * 1000);
  }

  get isActive(): boolean {
    return performance.now() < this.activeUntil;
  }

  private schedule(): void {
    if (!this.running || this.hidden) return;
    cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(this.frame);
  }

  private frame = (t: number): void => {
    if (!this.running || this.hidden) return;
    const minGap = this.isActive ? (this.maxFps > 0 ? 1000 / this.maxFps - 1 : 0) : 1000 / this.idleFps - 1;
    if (t - this.lastRender >= minGap) {
      const dt = Math.min(0.1, (t - this.last) / 1000);
      this.last = t;
      this.lastRender = t;
      this.tickAccum += dt;
      if (this.tickAccum >= this.tickInterval) {
        this.tickAccum = 0;
        this.onTick(Date.now());
      }
      this.onFrame(dt, t / 1000);
    }
    this.schedule();
  };
}
