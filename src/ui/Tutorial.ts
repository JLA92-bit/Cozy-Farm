import gsap from 'gsap';
import * as THREE from 'three';
import { h, icon, button } from './dom';
import { ui } from './UI';
import { Panel } from './Panel';
import { TUTORIAL } from '../data';
import { game } from '../systems/Game';
import { plotReady } from '../systems/Timers';
import { audio } from '../systems/Audio';

/**
 * Short, skippable first-session tutorial driven by tutorial.json. Each step shows a speech box and a
 * bouncing pointing hand, and completes on a game signal (bus 'tutorial' events or stat changes).
 */
export class Tutorial {
  private box: HTMLElement | null = null;
  private hand: HTMLElement | null = null;
  private handTween: gsap.core.Tween | null = null;
  private plantedAtStart = 0;
  private active = false;

  start(): void {
    if (game.state.tutorial.done || this.active) return;
    this.active = true;
    game.bus.on('tutorial', ({ signal }) => this.signal(signal));
    game.bus.on('stat', ({ stat }) => { if (stat === 'plants_planted') this.signal('planted'); });
    const prevClose = Panel.prototype.close;
    const self = this;
    Panel.prototype.close = function (this: Panel) { prevClose.call(this); setTimeout(() => self.signal('panel_closed'), 250); };
    ui.onTick(() => this.updateHand());
    this.show();
  }

  private get step() { return TUTORIAL[game.state.tutorial.step]; }

  private show(): void {
    this.clear();
    const s = this.step;
    if (!s) { this.finish(); return; }
    if (s.wait === 'planted:3') this.plantedAtStart = game.stat('plants_planted');
    const text = s.text.replace('{name}', game.state.player.name);
    this.box = h('div', { class: `tut-box ${s.target === 'tray_wheat' || s.target === 'ui:shop' ? 'top' : ''}` },
      icon('farmer', 'tut-avatar'), h('div', null, text),
      button('Skip', () => this.finish(), 'small grey tut-skip'));
    if (s.wait === 'tap') {
      this.box.append(h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:6px' }, button('OK!', () => this.advance(), 'small')));
    }
    ui.root.append(this.box);
    gsap.fromTo(this.box, { y: 30, opacity: 0, scale: 0.9 }, { y: 0, opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(2)' });
    if (s.target !== 'none') {
      this.hand = icon('hand', 'tut-hand');
      ui.root.append(this.hand);
      this.handTween = gsap.to(this.hand, { y: -14, duration: 0.45, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      this.updateHand();
    }
    audio.play('pop', { volume: 0.6 });
  }

  /** Screen position of the current step's target. */
  private targetPos(): { x: number; y: number } | null {
    const s = this.step;
    if (!s) return null;
    const now = game.now();
    const world = (v: THREE.Vector3) => { const p = ui.screen(v); return { x: p.x, y: p.y }; };
    const el = (sel: string) => {
      const e = document.querySelector<HTMLElement>(sel);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    switch (s.target) {
      case 'plot': { const b = game.state.buildings.find((x) => x.type === 'plot' && !x.plot); return b ? world(ui.scene.farm.anchor(b.uid).setY(0.2)) : null; }
      case 'ready_plot': { const b = game.state.buildings.find((x) => x.plot && plotReady(x, now)); return b ? world(ui.scene.farm.anchor(b.uid).setY(0.3)) : null; }
      case 'order_board': { const b = game.buildingsOf('order_board')[0]; return b ? world(ui.scene.farm.anchor(b.uid)) : null; }
      case 'tray_wheat': return el('.tray-item[data-crop="wheat"]');
      case 'ui:shop': return el('[data-hud="shop"]');
      case 'ui:goal': return el('.goal-card');
      default: return null;
    }
  }

  private updateHand(): void {
    if (!this.hand) return;
    const p = this.targetPos();
    this.hand.style.display = p && !Panel.isOpen ? '' : 'none';
    if (p) { this.hand.style.left = `${p.x - 12}px`; this.hand.style.top = `${p.y + 6}px`; }
  }

  signal(sig: string): void {
    const s = this.step;
    if (!s || !this.active) return;
    if (s.wait === 'planted:3' && sig === 'planted') {
      if (game.stat('plants_planted') - this.plantedAtStart >= 3 || !game.state.buildings.some((b) => b.type === 'plot' && !b.plot)) this.advance();
      return;
    }
    if (s.wait === sig || (s.wait === 'harvested' && sig === 'harvested') || (s.wait === 'order_completed' && sig === 'order_completed')) this.advance();
    else if (s.wait.startsWith('panel:') && sig === s.wait) this.advance();
    else if (s.wait.startsWith('placed:') && sig === s.wait) this.advance();
  }

  private advance(): void {
    game.state.tutorial.step++;
    audio.play('quest', { volume: 0.5 });
    if (game.state.tutorial.step >= TUTORIAL.length) this.finish();
    else setTimeout(() => this.show(), 350);
    this.clear();
  }

  private clear(): void {
    this.handTween?.kill();
    this.box?.remove();
    this.hand?.remove();
    this.box = this.hand = null;
  }

  finish(): void {
    this.clear();
    game.state.tutorial.done = true;
    this.active = false;
  }
}

export const tutorial = new Tutorial();
