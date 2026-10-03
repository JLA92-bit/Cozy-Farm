import gsap from 'gsap';
import { h, button, icon, fmt } from './dom';
import { audio } from '../systems/Audio';
import { game } from '../systems/Game';

export interface PanelOptions {
  title: string;
  size?: 'small' | 'medium' | 'large';
  color?: 'orange' | 'green' | 'blue' | 'purple' | 'pink';
  icon?: string;
  tabs?: { id: string; label: string; icon?: string }[];
  closable?: boolean;
  dim?: boolean;
  /** Show the player's live coins (and gems) in the header, for panels where you spend or earn. */
  wallet?: boolean;
}

/** Chunky cartoon modal panel with a bouncy scale-in/out. */
export class Panel {
  readonly overlay: HTMLElement;
  readonly panel: HTMLElement;
  readonly body: HTMLElement;
  readonly footer: HTMLElement;
  readonly header: HTMLElement;
  readonly tabsEl: HTMLElement | null = null;
  tab = '';
  onClose?: () => void;
  onTab?: (id: string) => void;
  private closing = false;
  private cleanups: (() => void)[] = [];
  static stack: Panel[] = [];
  static root: HTMLElement;

  constructor(readonly opts: PanelOptions) {
    const size = opts.size === 'small' ? 'small' : opts.size === 'medium' ? 'medium' : '';
    this.header = h('div', { class: `panel-header ${opts.color && opts.color !== 'orange' ? opts.color : ''}` },
      opts.icon ? icon(opts.icon, 'icon') : null,
      h('h2', { class: 'outlined' }, opts.title),
    );
    if (opts.icon) (this.header.firstChild as HTMLElement).style.cssText = 'width:34px;height:34px;margin-right:8px';
    if (opts.wallet) this.header.append(this.wallet());
    this.body = h('div', { class: 'panel-body' });
    this.footer = h('div', { class: 'panel-footer' });
    this.panel = h('div', { class: `panel ${size}` }, this.header);
    if (opts.tabs?.length) {
      this.tabsEl = h('div', { class: 'tabs', role: 'tablist' });
      for (const t of opts.tabs) {
        const el = h('button', { class: 'tab', type: 'button', role: 'tab', dataset: { tab: t.id }, onclick: () => { if (this.tab !== t.id) this.setTab(t.id); } }, t.icon ? icon(t.icon) : null, h('span', { class: 'tab-label' }, t.label));
        this.tabsEl.append(el);
      }
      this.panel.append(this.tabsEl);
      this.tab = opts.tabs[0].id;
    }
    this.panel.append(this.body, this.footer);
    if (opts.closable !== false) {
      const close = button('✕', () => this.close(), 'red close-btn', { 'aria-label': 'Close' });
      this.panel.append(close);
    }
    this.overlay = h('div', { class: 'overlay' }, this.panel);
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', opts.title);
    // soft fade at the bottom edge while there is more to scroll to
    this.body.addEventListener('scroll', () => this.updateScrollHint(), { passive: true });
    new MutationObserver(() => this.updateScrollHint()).observe(this.body, { childList: true });
    if (opts.dim === false) this.overlay.style.background = 'transparent';
    this.overlay.addEventListener('pointerdown', (e) => {
      if (e.target === this.overlay && opts.closable !== false) this.close();
    });
  }

  setTab(id: string): void {
    this.tab = id;
    this.tabsEl?.querySelectorAll<HTMLElement>('.tab').forEach((t) => {
      const on = t.dataset.tab === id;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
      // keep the active tab visible when the row overflows on narrow phones
      if (on && this.tabsEl) {
        const row = this.tabsEl;
        const left = t.offsetLeft - row.offsetLeft;
        if (left < row.scrollLeft + 8 || left + t.offsetWidth > row.scrollLeft + row.clientWidth - 8) {
          row.scrollTo({ left: Math.max(0, left - (row.clientWidth - t.offsetWidth) / 2), behavior: this.overlay.isConnected ? 'smooth' : 'auto' });
        }
      }
    });
    this.body.scrollTop = 0;
    audio.play('page', { volume: 0.5 });
    this.onTab?.(id);
    this.updateScrollHint();
  }

  /** Live balance pill: updates as coins/gems change while the panel is open. */
  private wallet(): HTMLElement {
    const coins = h('span', { class: 'outlined' }, fmt(game.coins));
    const gems = h('span', { class: 'outlined' }, fmt(game.gems));
    const coinPill = h('span', { class: 'wallet-pill' }, icon('coin'), coins);
    const gemPill = h('span', { class: 'wallet-pill gem' }, icon('gem'), gems);
    const bump = (el: HTMLElement) => gsap.fromTo(el, { scale: 1.18 }, { scale: 1, duration: 0.3, ease: 'back.out(3)' });
    this.cleanups.push(
      game.bus.on('coins', ({ total }) => { const t = fmt(total); if (coins.textContent !== t) { coins.textContent = t; bump(coinPill); } }),
      game.bus.on('gems', ({ total }) => { const t = fmt(total); if (gems.textContent !== t) { gems.textContent = t; bump(gemPill); } }),
    );
    return h('div', { class: 'panel-wallet' }, coinPill, gemPill);
  }

  private hintRaf = 0;
  private updateScrollHint(): void {
    if (this.hintRaf) return;
    this.hintRaf = requestAnimationFrame(() => {
      this.hintRaf = 0;
      const b = this.body;
      this.panel.classList.toggle('more-below', b.scrollHeight - b.clientHeight - b.scrollTop > 6);
    });
  }

  open(): this {
    Panel.root.append(this.overlay);
    Panel.stack.push(this);
    if (this.tabsEl) this.setTab(this.tab);
    if (!this.footer.childElementCount) this.footer.style.display = 'none';
    gsap.fromTo(this.overlay, { opacity: 0 }, { opacity: 1, duration: 0.18 });
    gsap.fromTo(this.panel, { scale: 0.6, y: 30 }, { scale: 1, y: 0, duration: 0.42, ease: 'back.out(1.8)' });
    audio.play('open', { volume: 0.6 });
    Panel.listenKeys();
    this.updateScrollHint();
    return this;
  }

  close(): void {
    if (this.closing) return;
    this.closing = true;
    audio.play('close', { volume: 0.5 });
    gsap.to(this.panel, { scale: 0.7, y: 20, duration: 0.16, ease: 'power2.in' });
    gsap.to(this.overlay, {
      opacity: 0, duration: 0.18, onComplete: () => {
        this.overlay.remove();
        Panel.stack = Panel.stack.filter((p) => p !== this);
        this.onClose?.();
      },
    });
  }

  /** The top panel's wallet pill for coins/gems, so reward icons can fly into it instead of the hidden HUD. */
  static walletTarget(kind: 'coins' | 'gems'): HTMLElement | null {
    const top = Panel.stack[Panel.stack.length - 1];
    if (!top || top.closing) return null;
    const el = top.header.querySelector<HTMLElement>(kind === 'gems' ? '.wallet-pill.gem' : '.wallet-pill:not(.gem)');
    return el && el.offsetParent ? el : null;
  }

  static closeAll(): void { for (const p of [...Panel.stack]) p.close(); }

  private static keys = false;
  /** Escape (keyboards, some Android remotes) closes the top-most closable panel. */
  private static listenKeys(): void {
    if (Panel.keys) return;
    Panel.keys = true;
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const top = Panel.stack[Panel.stack.length - 1];
      if (top && top.opts.closable !== false) { e.preventDefault(); top.close(); }
    });
  }
  static get isOpen(): boolean { return Panel.stack.length > 0; }
}
