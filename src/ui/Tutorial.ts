import gsap from 'gsap';
import * as THREE from 'three';
import { h, icon, button, setIcon } from './dom';
import { ui } from './UI';
import { Panel } from './Panel';
import { TUTORIAL, BUILDING } from '../data';
import { game } from '../systems/Game';
import type { PlacedBuilding } from '../systems/State';
import { plotReady, formatTime } from '../systems/Timers';
import { audio, haptics } from '../systems/Audio';
import { daily } from '../systems/Progression';
import { orders } from '../systems/Economy';
import { buildings } from '../systems/Buildings';

type Pt = { x: number; y: number; inPanel: boolean };

/**
 * Short, skippable first-session tutorial driven by tutorial.json. Each step shows a speech box, a
 * bouncing pointing hand and a pulsing ring on the target, and completes on a game signal (bus
 * 'tutorial' events or stat changes). Steps whose goal the player already reached on their own are
 * skipped, so the tutorial never asks for something that is already done.
 */
export class Tutorial {
  private box: HTMLElement | null = null;
  private sub: HTMLElement | null = null;
  private hand: HTMLElement | null = null;
  private ring: HTMLElement | null = null;
  private handTween: gsap.core.Tween | null = null;
  private handDown = false;
  private boxTop: boolean | null = null;
  private boxSide: string | null = null;
  private subText = '';
  private scrolledTo: Element | null = null;
  private plantedAtStart = 0;
  private baseline = new Map<string, number>();
  private active = false;
  private wired = false;
  private showTimer = 0;

  get running(): boolean { return this.active; }

  start(): void {
    if (game.state.tutorial.done || this.active) return;
    this.active = true;
    this.wire();
    // remember where the player is now, so steps they complete out of order can be skipped later
    this.baseline.clear();
    for (const s of TUTORIAL) for (const c of s.skip?.split(',') ?? []) this.baseline.set(c, this.measure(c));
    this.enterStep();
    this.show();
  }

  /** Start over from the first step (from Settings). */
  replay(): void {
    clearTimeout(this.showTimer);
    this.clear();
    this.active = false;
    game.state.tutorial.step = 0;
    game.state.tutorial.done = false;
    Panel.closeAll();
    setTimeout(() => this.start(), 400);
  }

  private wire(): void {
    if (this.wired) return;
    this.wired = true;
    game.bus.on('tutorial', ({ signal }) => this.signal(signal));
    game.bus.on('stat', ({ stat }) => { if (stat === 'plants_planted') this.signal('planted'); });
    ui.onTick(() => this.updateHand());
    // follow the camera smoothly while the farm is panned or zoomed
    ui.scene.onFrame(() => { if (this.hand) this.updateHand(); });
  }

  private get step() { return TUTORIAL[game.state.tutorial.step]; }

  /** Current value for a step's skip condition. */
  private measure(cond: string): number {
    const [kind, arg] = cond.split(':');
    if (kind === 'stat') return game.stat(arg);
    if (kind === 'more') return game.buildingsOf(arg).length;
    return 0;
  }

  /**
   * Should this step be skipped? Conditions (comma separated): 'stat:x' / 'more:type' when the
   * player already did it since the tutorial started, 'none:x' when the step cannot be done now.
   */
  private alreadyDone(skip?: string): boolean {
    if (!skip) return false;
    return skip.split(',').some((cond) => {
      const [kind, arg] = cond.split(':');
      if (kind === 'none') {
        if (arg === 'empty_plot') return !game.state.buildings.some((b) => b.type === 'plot' && !b.plot);
        if (arg === 'deliverable') return !game.state.orders.list.some((o) => orders.canComplete(o));
        if (arg === 'plot_buyable') return !buildings.canBuy('plot').ok;
        return false;
      }
      const base = this.baseline.get(cond);
      return base !== undefined && this.measure(cond) > base;
    });
  }

  private show(): void {
    this.clear();
    if (!this.active) return;
    let s = this.step;
    while (s && this.alreadyDone(s.skip)) { game.state.tutorial.step++; this.enterStep(); s = this.step; }
    if (!s) { this.finish(false); return; }
    // nothing left to plant (e.g. every field was sown during the step change): move on
    if (s.wait === 'planted:3' && this.plantDone()) { this.advance(); return; }
    // the goal card joins in on the last step, which introduces it
    ui.root.classList.toggle('tut-running', s.target !== 'ui:goal');
    const text = s.text.replace(/\{name\}/g, game.state.player.name);
    const idx = game.state.tutorial.step;
    const dots = h('div', { class: 'tut-dots' }, ...TUTORIAL.map((_, i) => h('span', { class: i < idx ? 'done' : i === idx ? 'now' : '' })));
    this.sub = h('div', { class: 'tut-sub' });
    this.subText = '';
    this.box = h('div', { class: 'tut-box' },
      icon('farmer', 'tut-avatar'), dots, h('div', { class: 'tut-text' }, text), this.sub,
      button('Skip', () => this.confirmSkip(), 'small grey tut-skip'));
    if (s.wait === 'tap') {
      this.box.append(h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:6px' }, button(s.button ?? 'OK!', () => this.advance(), 'small')));
    }
    ui.root.append(this.box);
    this.boxTop = null;
    this.boxSide = null;
    if (s.target !== 'none') {
      this.ring = h('div', { class: 'tut-ring' });
      this.hand = icon('hand', 'tut-hand');
      this.handDown = false;
      ui.root.append(this.ring, this.hand);
      this.handTween = gsap.to(this.hand, { y: -14, duration: 0.45, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    }
    this.scrolledTo = null;
    // place the box first, then pop it in (the CSS transform takes over again afterwards)
    this.updateHand();
    gsap.fromTo(this.box, { y: 30, opacity: 0, scale: 0.9 }, { y: 0, opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(2)', clearProps: 'transform' });
    audio.play('pop', { volume: 0.6 });
  }

  /** Called as soon as a step becomes current (before its box appears). */
  private enterStep(): void {
    if (this.step?.wait === 'planted:3') this.plantedAtStart = game.stat('plants_planted');
  }

  private plantDone(): boolean {
    return game.stat('plants_planted') - this.plantedAtStart >= 3 || !game.state.buildings.some((b) => b.type === 'plot' && !b.plot);
  }

  private confirmSkip(): void {
    if (!this.box) return;
    const box = this.box;
    box.querySelector('.tut-text')!.textContent = 'Skip the tips? You can replay them any time from Settings.';
    box.querySelector('.tut-sub')!.textContent = '';
    box.querySelectorAll('.btn').forEach((b) => b.remove());
    box.append(h('div', { class: 'row', style: 'justify-content:flex-end;gap:8px;margin-top:6px' },
      button('Keep going', () => this.show(), 'small'),
      button('Skip tips', () => this.finish(true), 'small grey')));
    audio.play('select', { volume: 0.5 });
  }

  /** Screen position of the current step's target. */
  private targetPos(): Pt | null {
    const s = this.step;
    if (!s) return null;
    const now = game.now();
    const world = (v: THREE.Vector3): Pt | null => {
      const p = ui.screen(v);
      if (p.x < 0 || p.y < 0 || p.x > innerWidth || p.y > innerHeight) return null;
      return { x: p.x, y: p.y, inPanel: false };
    };
    const at = (e: Element | null | undefined, scroll = false): Pt | null => {
      if (!e) return null;
      if (scroll && this.scrolledTo !== e) { this.scrolledTo = e; e.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      const r = e.getBoundingClientRect();
      if (!r.width) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, inPanel: !!e.closest('.overlay') };
    };
    const board = () => { const b = game.buildingsOf('order_board')[0]; return b ? world(ui.scene.farm.anchor(b.uid).setY(0.6)) : null; };
    const topPanel = Panel.stack[Panel.stack.length - 1];
    switch (s.target) {
      case 'plot': return this.nearestPlot((b) => !b.plot, 0.2, world);
      case 'ready_plot': return this.nearestPlot((b) => !!b.plot && plotReady(b, now), 0.3, world);
      case 'order_board': return board();
      case 'deliver': {
        if (topPanel) return at(topPanel.overlay.querySelector('.card.done > .btn'), true);
        return board();
      }
      case 'place_plot': {
        if (ui.root.classList.contains('mode-place')) return at(document.querySelector('[aria-label="Place"]'));
        if (topPanel) {
          const card = [...topPanel.overlay.querySelectorAll('.card')].find((c) => c.querySelector('.card-title')?.textContent === BUILDING.plot.name);
          return at(card, true);
        }
        return at(document.querySelector('[data-hud="shop"]'));
      }
      case 'tray_wheat': return at(document.querySelector('.tray-item[data-crop="wheat"]'));
      case 'ui:shop': return at(document.querySelector('[data-hud="shop"]'));
      case 'ui:goal': return at(document.querySelector('.goal-card'));
      default: return null;
    }
  }

  /**
   * Field nearest the middle of the screen that passes `test`, so the hand does not jump around.
   * Fields hidden behind the seed tray only count when nothing else is visible.
   */
  private nearestPlot(test: (b: PlacedBuilding) => boolean, y: number, world: (v: THREE.Vector3) => Pt | null): Pt | null {
    const tray = ui.root.classList.contains('mode-tray') ? document.querySelector('.tray')?.getBoundingClientRect() : undefined;
    let best: Pt | null = null, bd = Infinity;
    for (const b of game.state.buildings) {
      if (b.type !== 'plot' || !test(b)) continue;
      const p = world(ui.scene.farm.anchor(b.uid).setY(y));
      if (!p) continue;
      const hidden = tray && p.x > tray.left - 20 && p.x < tray.right + 20 && p.y > tray.top - 30;
      const d = Math.hypot(p.x - innerWidth / 2, p.y - innerHeight / 2) + (hidden ? 10000 : 0);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  private updateHand(): void {
    if (!this.box) return;
    const s = this.step;
    const p = this.hand ? this.targetPos() : null;
    const visible = !!p && (p.inPanel || !Panel.isOpen);
    if (this.hand && this.ring) {
      this.hand.style.display = this.ring.style.display = visible ? '' : 'none';
      if (p && visible) {
        // near the bottom edge the hand points down from above instead of up from below
        const down = p.y > innerHeight - 150;
        if (down !== this.handDown) { this.handDown = down; setIcon(this.hand as HTMLImageElement, down ? 'hand_down' : 'hand'); }
        this.hand.style.left = `${p.x - 12}px`;
        this.hand.style.top = down ? `${p.y - 74}px` : `${p.y + 6}px`;
        this.ring.style.left = `${p.x}px`;
        this.ring.style.top = `${p.y}px`;
      }
    }
    // keep the speech box out of the way of the target and the seed tray
    const trayOpen = ui.root.classList.contains('mode-tray') || ui.root.classList.contains('mode-place');
    const top = p && visible ? p.y > innerHeight * 0.5 : trayOpen;
    if (top !== this.boxTop) { this.boxTop = top; this.box.classList.toggle('top', top); }
    // on wide screens the box also moves to the side away from the target
    const side = innerWidth > innerHeight && p && visible ? (p.x > innerWidth / 2 ? 'side-left' : 'side-right') : '';
    if (side !== this.boxSide) {
      this.box.classList.remove('side-left', 'side-right');
      if (side) this.box.classList.add(side);
      this.boxSide = side;
    }
    // live progress line
    let sub = '';
    if (s?.wait === 'planted:3') sub = `Planted ${Math.min(3, game.stat('plants_planted') - this.plantedAtStart)}/3`;
    else if (s?.target === 'ready_plot' && !p) {
      const now = game.now();
      let soonest = Infinity;
      for (const b of game.state.buildings) if (b.plot) soonest = Math.min(soonest, b.plot.plantedAt + b.plot.growSec * 1000 - now);
      sub = soonest < Infinity ? `Growing... ready in ${formatTime(Math.max(1000, soonest))}` : 'Plant some wheat first!';
    } else if (s?.target === 'deliver' && !Panel.isOpen) sub = 'Tap the Order Board';
    else if (s?.target === 'place_plot' && !Panel.isOpen && !trayOpen) sub = 'Open the Shop and pick a Field';
    else if (p && !visible) sub = 'Close this window to carry on';
    if (sub !== this.subText && this.sub) { this.subText = sub; this.sub.textContent = sub; }
  }

  signal(sig: string): void {
    const s = this.step;
    if (!s || !this.active) return;
    if (s.wait === 'planted:3' && sig === 'planted') {
      if (this.plantDone()) this.advance();
      else { this.updateHand(); if (this.sub) gsap.fromTo(this.sub, { scale: 1.25 }, { scale: 1, duration: 0.25, ease: 'back.out(3)' }); }
      return;
    }
    if (s.wait === sig) this.advance();
  }

  private advance(): void {
    // the build tool offers another field right away; for the tutorial one is enough
    if (this.step?.wait === 'placed:plot') setTimeout(() => { if (ui.root.classList.contains('mode-place')) ui.interaction.cancelPlacement(); }, 400);
    game.state.tutorial.step++;
    this.enterStep();
    audio.play('quest', { volume: 0.5 });
    haptics.buzz(12);
    const box = this.box;
    this.clear(true);
    if (box) gsap.to(box, { scale: 0.85, opacity: 0, duration: 0.2, ease: 'back.in(2)', onComplete: () => box.remove() });
    clearTimeout(this.showTimer);
    if (game.state.tutorial.step >= TUTORIAL.length) this.finish(false);
    else this.showTimer = window.setTimeout(() => this.show(), 450);
  }

  private clear(keepBox = false): void {
    this.handTween?.kill();
    if (!keepBox) this.box?.remove();
    this.hand?.remove();
    this.ring?.remove();
    this.box = this.hand = this.ring = this.sub = null;
  }

  finish(skipped = false): void {
    clearTimeout(this.showTimer);
    this.clear();
    ui.root.classList.remove('tut-running');
    game.state.tutorial.done = true;
    if (!this.active) return;
    this.active = false;
    if (skipped) return;
    // a little celebration, then the first daily gift if one is waiting
    ui.feedback.toast("You're all set!", 'Happy farming!', 'party', 'gold');
    const t = ui.scene.rig.target;
    ui.effects.sparkle(t.clone().setY(1), '#fff6a0', 14);
    ui.effects.burst(t.clone().setY(1), '#ffd25a', 16);
    audio.play('reward');
    setTimeout(() => { if (!Panel.isOpen && daily.check()) ui.open('daily'); }, 1800);
  }
}

export const tutorial = new Tutorial();
