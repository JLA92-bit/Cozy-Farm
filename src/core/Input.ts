/**
 * Touch-first gesture recogniser for the game canvas.
 *  - one finger: tap, long-press, drag (pan the camera, or a "tool" drag the world claims)
 *  - two fingers: pinch zoom + pan
 *  - mouse wheel: zoom (desktop)
 */
export interface Pointer { x: number; y: number }

export type DragKind = 'pan' | 'tool';

export interface InputHandler {
  onTap(p: Pointer): void;
  onLongPress(p: Pointer): void;
  /** Decide what a drag starting at `start` does. 'tool' drags are delivered to onToolDrag*. */
  onDragStart(start: Pointer): DragKind;
  onToolDrag(p: Pointer): void;
  onToolDragEnd(p: Pointer): void;
  onPan(dx: number, dy: number): void;
  onPanEnd(vx: number, vy: number): void;
  onPinch(scale: number, center: Pointer): void;
  onPointerDown(): void;
  onHover?(p: Pointer): void;
}

const TAP_SLOP = 10;
const LONG_PRESS_MS = 480;

export class Input {
  private pointers = new Map<number, Pointer & { startX: number; startY: number; t: number }>();
  private dragKind: DragKind | null = null;
  private longTimer = 0;
  private longFired = false;
  private pinchDist = 0;
  private pinchMid: Pointer = { x: 0, y: 0 };
  private history: { x: number; y: number; t: number }[] = [];
  enabled = true;

  constructor(private el: HTMLElement, private handler: InputHandler) {
    el.addEventListener('pointerdown', this.down);
    window.addEventListener('pointermove', this.move, { passive: true });
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.cancel);
    el.addEventListener('wheel', this.wheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    // block iOS gesture zoom and double-tap zoom on the game
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
    // a finger held while the app is backgrounded (or the window loses focus) may never get its
    // pointerup/pointercancel; drop it so the next touch is not mistaken for a pinch
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
  }

  /** Forget every held pointer and end any gesture in progress. */
  reset(): void {
    clearTimeout(this.longTimer);
    if (!this.pointers.size) return;
    const last = [...this.pointers.values()].pop()!;
    this.pointers.clear();
    if (this.dragKind === 'tool' || this.longFired) this.handler.onToolDragEnd({ x: last.x, y: last.y });
    else if (this.dragKind === 'pan') this.handler.onPanEnd(0, 0);
    this.dragKind = null;
    this.longFired = false;
  }

  private local(e: PointerEvent | WheelEvent): Pointer {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private down = (e: PointerEvent): void => {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { this.el.setPointerCapture?.(e.pointerId); } catch { /* pointer already gone */ }
    // a primary pointer starting a new gesture means any pointers we still hold are stale
    if (e.isPrimary && this.pointers.size && !this.pointers.has(e.pointerId)) this.reset();
    const p = this.local(e);
    this.pointers.set(e.pointerId, { ...p, startX: p.x, startY: p.y, t: performance.now() });
    this.handler.onPointerDown();
    if (this.pointers.size === 1) {
      this.dragKind = null;
      this.longFired = false;
      this.history = [{ ...p, t: performance.now() }];
      clearTimeout(this.longTimer);
      this.longTimer = window.setTimeout(() => {
        const ptr = this.pointers.get(e.pointerId);
        if (ptr && this.pointers.size === 1 && !this.dragKind) {
          this.longFired = true;
          this.handler.onLongPress({ x: ptr.x, y: ptr.y });
        }
      }, LONG_PRESS_MS);
    } else if (this.pointers.size === 2) {
      clearTimeout(this.longTimer);
      if (this.dragKind === 'tool') {
        const first = [...this.pointers.values()][0];
        this.handler.onToolDragEnd(first);
      }
      this.dragKind = 'pan';
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  };

  private move = (e: PointerEvent): void => {
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) {
      if (e.pointerType === 'mouse' && this.handler.onHover && e.target === this.el) this.handler.onHover(this.local(e));
      return;
    }
    const p = this.local(e);
    const dx = p.x - ptr.x, dy = p.y - ptr.y;
    ptr.x = p.x; ptr.y = p.y;
    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (this.pinchDist > 0) this.handler.onPinch(this.pinchDist / dist, mid);
      this.handler.onPan(mid.x - this.pinchMid.x, mid.y - this.pinchMid.y);
      this.pinchDist = dist;
      this.pinchMid = mid;
      return;
    }
    if (!this.dragKind) {
      if (this.longFired) {
        // after a long press, movement becomes a tool drag (e.g. dragging a building in move mode)
        this.dragKind = 'tool';
      } else if (Math.hypot(p.x - ptr.startX, p.y - ptr.startY) > TAP_SLOP) {
        clearTimeout(this.longTimer);
        this.dragKind = this.handler.onDragStart({ x: ptr.startX, y: ptr.startY });
        if (this.dragKind === 'pan') this.handler.onPan(p.x - ptr.startX, p.y - ptr.startY);
      } else return;
    }
    if (this.dragKind === 'tool') this.handler.onToolDrag(p);
    else {
      this.handler.onPan(dx, dy);
      this.history.push({ ...p, t: performance.now() });
      if (this.history.length > 6) this.history.shift();
    }
  };

  private up = (e: PointerEvent): void => {
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;
    this.pointers.delete(e.pointerId);
    clearTimeout(this.longTimer);
    if (this.pointers.size === 1) {
      // went from pinch back to one finger: continue as pan without a jump
      const rest = [...this.pointers.values()][0];
      rest.startX = rest.x; rest.startY = rest.y;
      this.history = [{ x: rest.x, y: rest.y, t: performance.now() }];
      return;
    }
    if (this.pointers.size > 0) return;
    const p = { x: ptr.x, y: ptr.y };
    if (this.dragKind === 'tool') this.handler.onToolDragEnd(p);
    else if (this.dragKind === 'pan') {
      const h = this.history;
      let vx = 0, vy = 0;
      if (h.length >= 2) {
        const a = h[0], b = h[h.length - 1];
        const dt = (b.t - a.t) / 1000;
        if (dt > 0 && performance.now() - b.t < 80) { vx = (b.x - a.x) / dt; vy = (b.y - a.y) / dt; }
      }
      this.handler.onPanEnd(vx, vy);
    } else if (!this.longFired) {
      this.handler.onTap(p);
    } else if (this.longFired) {
      this.handler.onToolDragEnd(p);
    }
    this.dragKind = null;
    this.longFired = false;
  };

  private cancel = (e: PointerEvent): void => {
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;
    this.pointers.delete(e.pointerId);
    clearTimeout(this.longTimer);
    if (this.pointers.size === 0) {
      if (this.dragKind === 'tool' || this.longFired) this.handler.onToolDragEnd({ x: ptr.x, y: ptr.y });
      this.dragKind = null;
      this.longFired = false;
    }
  };

  private wheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (!this.enabled) return;
    const f = Math.exp(e.deltaY * 0.0015);
    this.handler.onPinch(f, this.local(e));
  };

  /** True while a finger/mouse button is held. */
  get active(): boolean { return this.pointers.size > 0; }
}
