import gsap from 'gsap';
import { h, button, icon } from './dom';
import { audio } from '../systems/Audio';

export interface PanelOptions {
  title: string;
  size?: 'small' | 'medium' | 'large';
  color?: 'orange' | 'green' | 'blue' | 'purple' | 'pink';
  icon?: string;
  tabs?: { id: string; label: string; icon?: string }[];
  closable?: boolean;
  dim?: boolean;
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
  static stack: Panel[] = [];
  static root: HTMLElement;

  constructor(readonly opts: PanelOptions) {
    const size = opts.size === 'small' ? 'small' : opts.size === 'medium' ? 'medium' : '';
    this.header = h('div', { class: `panel-header ${opts.color && opts.color !== 'orange' ? opts.color : ''}` },
      opts.icon ? icon(opts.icon, 'icon') : null,
      h('h2', { class: 'outlined' }, opts.title),
    );
    if (opts.icon) (this.header.firstChild as HTMLElement).style.cssText = 'width:34px;height:34px;margin-right:8px';
    this.body = h('div', { class: 'panel-body' });
    this.footer = h('div', { class: 'panel-footer' });
    this.panel = h('div', { class: `panel ${size}` }, this.header);
    if (opts.tabs?.length) {
      this.tabsEl = h('div', { class: 'tabs' });
      for (const t of opts.tabs) {
        const el = h('button', { class: 'tab', dataset: { tab: t.id }, onclick: () => this.setTab(t.id) }, t.icon ? icon(t.icon) : null, t.label);
        this.tabsEl.append(el);
      }
      this.panel.append(this.tabsEl);
      this.tab = opts.tabs[0].id;
    }
    this.panel.append(this.body, this.footer);
    if (opts.closable !== false) {
      const close = button('✕', () => this.close(), 'red close-btn');
      this.panel.append(close);
    }
    this.overlay = h('div', { class: 'overlay' }, this.panel);
    if (opts.dim === false) this.overlay.style.background = 'transparent';
    this.overlay.addEventListener('pointerdown', (e) => {
      if (e.target === this.overlay && opts.closable !== false) this.close();
    });
  }

  setTab(id: string, silent = false): void {
    this.tab = id;
    this.tabsEl?.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', (t as HTMLElement).dataset.tab === id));
    this.body.scrollTop = 0;
    if (!silent) audio.play('page', { volume: 0.5 });
    this.onTab?.(id);
  }

  open(): this {
    Panel.root.append(this.overlay);
    Panel.stack.push(this);
    if (this.tabsEl) this.setTab(this.tab, true);
    if (!this.footer.childElementCount) this.footer.style.display = 'none';
    gsap.fromTo(this.overlay, { opacity: 0 }, { opacity: 1, duration: 0.18 });
    gsap.fromTo(this.panel, { scale: 0.6, y: 30 }, { scale: 1, y: 0, duration: 0.42, ease: 'back.out(1.8)' });
    audio.play('open', { volume: 0.6 });
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

  static closeAll(): void { for (const p of [...Panel.stack]) p.close(); }
  static get isOpen(): boolean { return Panel.stack.length > 0; }
}
