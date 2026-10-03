import gsap from 'gsap';
import { h, icon, fmt } from './dom';

/** Toasts, floating "+XP"/"+coins" numbers and icons that arc into HUD counters. */
export class Feedback {
  readonly toastStack: HTMLElement;
  readonly floatLayer: HTMLElement;
  private toastQueue: HTMLElement[] = [];
  /** HUD targets for flying icons. */
  targets: Record<string, () => HTMLElement | null> = {};
  /** Called as each flying icon lands (sound / haptic tick per icon). */
  onLand?: (target: string, i: number, n: number) => void;
  /** Called once when a group of icons takes off. */
  onLaunch?: (target: string, n: number) => void;
  private comboEl: HTMLElement | null = null;
  private comboHide: ReturnType<typeof setTimeout> | null = null;

  constructor(root: HTMLElement) {
    this.floatLayer = h('div', { class: 'float-layer' });
    this.toastStack = h('div', { class: 'toast-stack' });
    root.append(this.floatLayer, this.toastStack);
  }

  toast(title: string, sub?: string, iconKey = 'star', style = ''): void {
    const el = h('div', { class: `toast ${style}` }, icon(iconKey), h('div', null, h('div', { class: 't-title' }, title), sub ? h('div', { class: 't-sub' }, sub) : null));
    this.toastStack.append(el);
    this.toastQueue.push(el);
    while (this.toastQueue.length > 3) this.dismiss(this.toastQueue[0]);
    gsap.fromTo(el, { y: -30, opacity: 0, scale: 0.8 }, { y: 0, opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(2)' });
    el.addEventListener('click', () => this.dismiss(el));
    setTimeout(() => this.dismiss(el), 3200);
  }

  private dismiss(el: HTMLElement): void {
    if (!el.isConnected) return;
    this.toastQueue = this.toastQueue.filter((t) => t !== el);
    gsap.to(el, { y: -20, opacity: 0, duration: 0.25, onComplete: () => el.remove() });
  }

  /** Floating text that rises and fades at a screen position. */
  floatText(x: number, y: number, text: string, iconKey?: string, color = '#fff', delay = 0): void {
    const el = h('div', { class: 'float-text outlined', style: `left:${x}px;top:${y}px;color:${color}` }, iconKey ? icon(iconKey) : null, text);
    this.floatLayer.append(el);
    gsap.timeline({ delay, onComplete: () => el.remove() })
      .fromTo(el, { scale: 0.3, opacity: 0 }, { scale: 1.15, opacity: 1, duration: 0.18, ease: 'back.out(3)' })
      .to(el, { scale: 1, duration: 0.1 })
      .to(el, { y: -50, duration: 0.9, ease: 'power1.out' }, 0.1)
      .to(el, { opacity: 0, duration: 0.3 }, 0.75);
  }

  /** Icons fly in an arc from a screen point into a HUD target, calling `onArrive` per icon. */
  fly(x: number, y: number, iconKey: string, target: string, count = 5, onArrive?: () => void): void {
    const t = this.targets[target]?.();
    if (!t) { onArrive?.(); return; }
    const r = t.getBoundingClientRect();
    const tx = r.left + Math.min(28, r.width / 2), ty = r.top + r.height / 2;
    const n = Math.min(8, Math.max(1, count));
    this.onLaunch?.(target, n);
    for (let i = 0; i < n; i++) {
      const el = icon(iconKey, 'fly-icon');
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      this.floatLayer.append(el);
      const sx = x + (Math.random() - 0.5) * 70, sy = y - 20 - Math.random() * 40;
      const ctrlX = (sx + tx) / 2 + (Math.random() - 0.5) * 120, ctrlY = Math.min(sy, ty) - 60 - Math.random() * 60;
      const obj = { t: 0 };
      gsap.timeline({ delay: i * 0.05, onComplete: () => { el.remove(); this.onLand?.(target, i, n); if (i === n - 1) onArrive?.(); this.bump(t); } })
        .fromTo(el, { scale: 0.2 }, { scale: 1.1, duration: 0.15, ease: 'back.out(3)' })
        .to(el, { left: sx, top: sy, duration: 0.18, ease: 'power2.out' }, 0)
        .to(obj, {
          t: 1, duration: 0.55, ease: 'power2.in',
          onUpdate: () => {
            const k = obj.t, a = (1 - k) * (1 - k), b = 2 * (1 - k) * k, c = k * k;
            el.style.left = `${a * sx + b * ctrlX + c * tx}px`;
            el.style.top = `${a * sy + b * ctrlY + c * ty}px`;
            el.style.transform = `translate(-50%,-50%) scale(${1.1 - k * 0.45})`;
          },
        }, 0.2);
    }
  }

  /**
   * Swipe combo counter that follows the finger: "x5" growing and warming in colour as the
   * chain gets longer. Call `endCombo` when the swipe ends.
   */
  combo(x: number, y: number, n: number): void {
    if (this.comboHide) { clearTimeout(this.comboHide); this.comboHide = null; }
    let el = this.comboEl;
    if (!el) {
      el = h('div', { class: 'combo-pop outlined' });
      this.comboEl = el;
      this.floatLayer.append(el);
      gsap.set(el, { xPercent: -50, yPercent: -50 });
      gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.12 });
    }
    gsap.killTweensOf(el, 'scale,rotate');
    const big = n >= 10 ? 'hot' : n >= 5 ? 'warm' : '';
    el.className = `combo-pop outlined ${big}`;
    el.textContent = `x${n}`;
    el.style.left = `${Math.max(40, Math.min(window.innerWidth - 40, x + 34))}px`;
    el.style.top = `${Math.max(90, y - 70)}px`;
    const s = Math.min(1.5, 1 + n * 0.035);
    gsap.fromTo(el, { scale: s * 1.35, rotate: (n % 2 ? -1 : 1) * 8 }, { scale: s, rotate: 0, duration: 0.3, ease: 'back.out(3)' });
  }
  endCombo(): void {
    const el = this.comboEl;
    if (!el || this.comboHide) return;
    this.comboHide = setTimeout(() => {
      this.comboHide = null;
      this.comboEl = null;
      gsap.to(el, { y: -30, opacity: 0, scale: 0.6, duration: 0.35, ease: 'power2.in', onComplete: () => el.remove() });
    }, 350);
  }

  bump(el: HTMLElement): void {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  /** Floating "+N" with icon (coins, xp, items). */
  reward(x: number, y: number, kind: 'coins' | 'xp' | 'gems' | 'item', n: number, iconKey?: string, delay = 0): void {
    const k = kind === 'coins' ? 'coin' : kind === 'gems' ? 'gem' : kind === 'xp' ? 'xp' : iconKey ?? 'package';
    const color = kind === 'xp' ? '#c9ff8a' : kind === 'gems' ? '#9ff7ee' : kind === 'coins' ? '#ffe680' : '#ffffff';
    this.floatText(x, y, `+${fmt(n)}`, k, color, delay);
  }
}
