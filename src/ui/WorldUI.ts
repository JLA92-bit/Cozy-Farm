import * as THREE from 'three';
import gsap from 'gsap';
import { h } from './dom';

/** A DOM element pinned to a world position (re-projected every frame while the camera moves). */
interface Anchor { el: HTMLElement; pos: THREE.Vector3; dy: number; visible: boolean }

/**
 * World-anchored UI: one context popup at a time (building info, clear obstacle, buy land) and
 * persistent status bubbles (ready products, hungry animals, timers).
 */
export class WorldUI {
  readonly layer: HTMLElement;
  private anchors = new Set<Anchor>();
  private popup: Anchor | null = null;
  private bubbles = new Map<string, Anchor>();
  private tmp = new THREE.Vector2();

  constructor(root: HTMLElement, private project: (v: THREE.Vector3, out: THREE.Vector2) => THREE.Vector2) {
    this.layer = h('div', { class: 'world-layer' });
    root.append(this.layer);
  }

  private add(el: HTMLElement, pos: THREE.Vector3, dy = 0): Anchor {
    const wrap = h('div', { class: 'world-pop' }, el);
    this.layer.append(wrap);
    const a: Anchor = { el: wrap, pos: pos.clone(), dy, visible: true };
    this.anchors.add(a);
    this.position(a);
    return a;
  }

  private remove(a: Anchor): void {
    this.anchors.delete(a);
    a.el.remove();
  }

  showPopup(pos: THREE.Vector3, content: HTMLElement): void {
    this.hidePopup();
    this.popup = this.add(content, pos, -6);
    this.popup.el.style.zIndex = '5';
    gsap.fromTo(content, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(2)' });
  }

  hidePopup(): boolean {
    if (!this.popup) return false;
    const a = this.popup;
    this.popup = null;
    gsap.to(a.el.firstElementChild, { scale: 0.5, opacity: 0, duration: 0.12, onComplete: () => this.remove(a) });
    return true;
  }
  get popupOpen(): boolean { return !!this.popup; }

  /** Create/update/remove keyed bubbles; `build` returns the element for a new key. */
  setBubble(key: string, pos: THREE.Vector3 | null, build: () => HTMLElement, version = ''): HTMLElement | null {
    const cur = this.bubbles.get(key);
    if (!pos) {
      if (cur) { this.remove(cur); this.bubbles.delete(key); }
      return null;
    }
    if (cur && cur.el.dataset.v === version) { cur.pos.copy(pos); return cur.el; }
    if (cur) this.remove(cur);
    const a = this.add(build(), pos);
    a.el.dataset.v = version;
    this.bubbles.set(key, a);
    gsap.fromTo(a.el.firstElementChild, { scale: 0 }, { scale: 1, duration: 0.35, ease: 'back.out(2.5)' });
    return a.el;
  }

  clearBubbles(prefix = ''): void {
    for (const [k, a] of this.bubbles) if (k.startsWith(prefix)) { this.remove(a); this.bubbles.delete(k); }
  }
  bubbleKeys(): string[] { return [...this.bubbles.keys()]; }

  private position(a: Anchor): void {
    const p = this.project(a.pos, this.tmp);
    const off = p.x < -80 || p.y < -80 || p.x > window.innerWidth + 80 || p.y > window.innerHeight + 80;
    if (off !== !a.visible) { a.visible = !off; a.el.style.display = off ? 'none' : ''; }
    if (!off) a.el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${(p.y + a.dy).toFixed(1)}px, 0) translate(-50%, -100%)`;
  }

  update(): void {
    for (const a of this.anchors) this.position(a);
  }
}
