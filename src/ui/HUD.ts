import gsap from 'gsap';
import { h, icon, fmt, button, badgeText, setIcon } from './dom';
import { game } from '../systems/Game';
import { MAX_LEVEL } from '../data';
import { buildings } from '../systems/Buildings';

export interface HudActions {
  open(panel: string): void;
  levelBadgeTap(): void;
  goalTap(): void;
}

/** Top bar (level, XP, currencies), goal card, side shortcuts and bottom menu. */
export class HUD {
  readonly el: HTMLElement;
  readonly levelEl: HTMLElement;
  readonly xpFill: HTMLElement;
  readonly xpText: HTMLElement;
  readonly nameEl: HTMLElement;
  readonly charmEl: HTMLElement;
  readonly coinsEl: HTMLElement;
  readonly gemsEl: HTMLElement;
  readonly coinsVal: HTMLElement;
  readonly gemsVal: HTMLElement;
  readonly goal: HTMLElement;
  readonly side: HTMLElement;
  readonly menu: HTMLElement;
  readonly buttons: Record<string, HTMLElement> = {};
  private shownCoins = 0;
  private lastXp = -1;
  private lastLevel = -1;
  private goalKey = '';
  private goalIcon?: HTMLImageElement;
  private goalTitle?: HTMLElement;
  private goalText?: HTMLElement;
  private goalBar?: HTMLElement;
  private goalFill?: HTMLElement;

  private coinTween?: gsap.core.Tween;

  constructor(root: HTMLElement, private actions: HudActions) {
    this.levelEl = h('div', { class: 'outlined' }, '1');
    const badge = h('div', { class: 'level-badge', role: 'button', 'aria-label': 'Level and unlocks', onclick: () => actions.levelBadgeTap() }, this.levelEl);
    this.xpFill = h('div', { class: 'xp-fill' });
    this.xpText = h('div', { class: 'xp-text outlined' }, '0/0');
    this.nameEl = h('span', { class: 'name-text' }, 'Farmer');
    this.charmEl = h('span', { class: 'charm-pill', onclick: (e: MouseEvent) => { e.stopPropagation(); actions.open('__charm'); } }, icon('sparkle_heart'), h('span', null, '0'));
    const xp = h('div', { class: 'xp-wrap' }, h('div', { class: 'player-name outlined' }, this.nameEl, this.charmEl), h('div', { class: 'xp-bar' }, this.xpFill, this.xpText));
    this.coinsVal = h('span', { class: 'outlined' }, '0');
    this.gemsVal = h('span', { class: 'outlined' }, '0');
    this.coinsEl = h('div', { class: 'currency coins', role: 'button', 'aria-label': 'Coins', onclick: () => actions.open('inventory') }, icon('coin'), this.coinsVal);
    this.gemsEl = h('div', { class: 'currency gems', role: 'button', 'aria-label': 'Gems', onclick: () => actions.open('gems') }, icon('gem'), this.gemsVal, h('span', { class: 'cur-plus outlined', 'aria-hidden': 'true' }, '+'));
    const settings = button(icon('gear'), () => actions.open('settings'), 'grey round hud-settings', { 'aria-label': 'Settings' });
    const top = h('div', { class: 'hud-top' }, badge, xp, h('div', { class: 'currency-row' }, this.coinsEl, this.gemsEl, settings));

    this.goal = h('div', { class: 'goal-card', onclick: () => actions.goalTap() });
    this.side = h('div', { class: 'hud-side' });

    this.menu = h('div', { class: 'hud-menu' });
    const items: [string, string, string, string][] = [
      ['character', 'Me', 'farmer', 'blue'],
      ['collection', 'Book', 'books', 'purple'],
      ['achievements', 'Awards', 'trophy', 'yellow'],
      ['quests', 'Quests', 'scroll', 'yellow'],
      ['inventory', 'Barn', 'package', 'blue'],
      ['build', 'Build', 'hammer', 'grey'],
      ['shop', 'Shop', 'cart', 'primary'],
    ];
    for (const [id, label, ic, color] of items) {
      const b = button([icon(ic), h('span', { class: 'lbl outlined' }, label)], () => actions.open(id), `hud-btn ${color}`, { 'aria-label': label, dataset: { hud: id } });
      this.buttons[id] = b;
      this.menu.append(b);
    }
    this.el = h('div', { class: 'passthrough hud-layer', style: 'position:absolute;inset:0' }, top, this.goal, this.side, h('div', { class: 'hud-bottom' }, h('div'), this.menu));
    root.append(this.el);
    this.shownCoins = game.coins;

    this.refresh();
  }

  refresh(): void {
    const p = game.state.player;
    this.levelEl.textContent = String(p.level);
    this.nameEl.textContent = p.name;
    (this.charmEl.lastChild as HTMLElement).textContent = String(buildings.charm());
    const need = game.xpToNext();
    const pct = p.level >= MAX_LEVEL ? 100 : Math.min(100, (p.xp / Math.max(1, need)) * 100);
    this.xpFill.style.width = `${pct}%`;
    if (this.lastXp >= 0 && (p.xp > this.lastXp || p.level > this.lastLevel)) this.flash(this.xpFill.parentElement!, 'gain');
    this.lastXp = p.xp;
    this.lastLevel = p.level;
    this.xpText.textContent = p.level >= MAX_LEVEL ? 'MAX' : `${fmt(p.xp)}/${fmt(need)}`;
    this.setCoins(game.coins, false);
    this.setGems(game.gems);
  }

  /** Count coins up smoothly (so flying coins look like they land). */
  setCoins(n: number, animate = true): void {
    if (!animate) { this.shownCoins = n; this.coinsVal.textContent = fmt(n); return; }
    if (n < this.shownCoins - 0.5) this.flash(this.coinsEl, 'spend');
    this.coinTween?.kill();
    const o = { v: this.shownCoins };
    this.coinTween = gsap.to(o, { v: n, duration: 0.6, ease: 'power1.out', onUpdate: () => { this.shownCoins = o.v; this.coinsVal.textContent = fmt(o.v); } });
  }
  setGems(n: number): void { this.gemsVal.textContent = fmt(n); }

  /** Restart a one-shot CSS animation class on an element. */
  private flash(el: HTMLElement, cls: string): void {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /**
   * Update the goal card in place. This runs every tick, so only touch the DOM when something
   * changed: that keeps the card steady under the thumb and lets the progress bar glide.
   */
  setGoal(title: string, text: string, iconKey: string, progress?: number): void {
    if (!this.goalIcon) {
      this.goalIcon = icon(iconKey);
      this.goalTitle = h('div', { class: 'goal-title' });
      this.goalText = h('div', { class: 'goal-text' });
      this.goalFill = h('div');
      this.goalBar = h('div', { class: 'goal-progress' }, this.goalFill);
      this.goal.setAttribute('role', 'button');
      this.goal.append(this.goalIcon, this.goalTitle, this.goalText, this.goalBar, h('span', { class: 'goal-chevron', 'aria-hidden': 'true' }));
    }
    const key = `${title}|${text}|${iconKey}`;
    if (key !== this.goalKey) {
      const isNew = this.goalKey !== '';
      this.goalKey = key;
      setIcon(this.goalIcon, iconKey);
      this.goalTitle!.textContent = title;
      this.goalText!.textContent = text;
      if (isNew && this.goal.dataset.title !== title) this.flash(this.goal, 'goal-new');
      this.goal.dataset.title = title;
    }
    this.goalBar!.style.display = progress === undefined ? 'none' : '';
    if (progress !== undefined) {
      const w = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
      if (this.goalFill!.style.width !== w) this.goalFill!.style.width = w;
    }
  }

  setBadge(id: string, n: number | boolean): void {
    const b = this.buttons[id] ?? this.side.querySelector<HTMLElement>(`[data-side="${id}"]`);
    if (!b) return;
    let dot = b.querySelector<HTMLElement>('.badge-dot');
    if (!n) { dot?.remove(); return; }
    const text = badgeText(n);
    if (!dot) { dot = h('span', { class: 'badge-dot outlined pop' }); b.append(dot); }
    else if (dot.textContent !== text) this.flash(dot, 'pop');
    if (dot.textContent !== text) dot.textContent = text;
  }

  /** Side shortcut buttons (daily reward, event, truck, merchant). */
  setSide(list: { id: string; icon: string; label: string; color?: string; badge?: boolean }[]): void {
    const key = list.map((l) => `${l.id}${l.badge ? '!' : ''}`).join(',');
    if (this.side.dataset.key === key) return;
    this.side.dataset.key = key;
    const before = new Set([...this.side.children].map((c) => (c as HTMLElement).dataset.side));
    this.side.replaceChildren(...list.map((l) => {
      const b = button([icon(l.icon), h('span', { class: 'lbl outlined' }, l.label)], () => this.actions.open(l.id), `hud-btn ${l.color ?? 'blue'}`, { 'aria-label': l.label, dataset: { side: l.id } });
      if (l.badge) b.append(h('span', { class: 'badge-dot' }));
      // shortcuts that just appeared (merchant arrived, truck ready...) pop in so they get noticed
      if (!before.has(l.id) && this.side.dataset.ready) gsap.fromTo(b, { scale: 0.2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(2.2)', clearProps: 'transform,opacity' });
      return b;
    }));
    this.side.dataset.ready = '1';
  }

  levelUpFlash(): void {
    gsap.fromTo(this.levelEl.parentElement!, { scale: 1.6, rotate: -20 }, { scale: 1, rotate: 0, duration: 0.8, ease: 'elastic.out(1.2, 0.4)' });
  }
}
