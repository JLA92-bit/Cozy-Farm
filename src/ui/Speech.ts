import * as THREE from 'three';
import gsap from 'gsap';
import { h, icon, itemIcon } from './dom';
import { ui } from './UI';
import { ITEMS } from '../data';

/** One speech/emote bubble floating above a character. */
interface Line { key: string; target: THREE.Object3D; height: number; pos: THREE.Vector3; until: number; build: () => HTMLElement; version: string; prio: number; leaving: boolean }

export interface SayOpts {
  text?: string;
  /** icon key (assets/icons) or item id */
  icon?: string;
  /** seconds on screen */
  dur?: number;
  /** height above the character's feet */
  height?: number;
  /** higher priority lines may replace lower ones when the screen is busy */
  prio?: number;
  /** a small name tag over the line (a villager you tapped) */
  name?: string;
}

const MAX_LINES = 3;

/**
 * Little speech and emote bubbles for villagers, the farmer and visitors. DOM-only (no draw calls),
 * pinned to a moving character every frame, at most a few on screen so the farm never feels noisy.
 */
class SpeechBubbles {
  private lines = new Map<THREE.Object3D, Line>();
  private seq = 0;
  private time = 0;
  private hidden = false;

  /** Show a short line above `target`. Returns false when it was skipped because the screen is busy. */
  say(target: THREE.Object3D, o: SayOpts): boolean {
    if (!ui.world || (!o.text && !o.icon)) return false;
    const prio = o.prio ?? 0;
    const cur = this.lines.get(target);
    if (cur && !cur.leaving && cur.prio > prio) return false;
    if (!cur) {
      let active = 0;
      let weakest: Line | null = null;
      for (const l of this.lines.values()) if (!l.leaving) { active++; if (!weakest || l.prio < weakest.prio || (l.prio === weakest.prio && l.until < weakest.until)) weakest = l; }
      if (active >= MAX_LINES) {
        if (!weakest || weakest.prio >= prio) return false;
        this.drop(weakest);
      }
    } else this.remove(cur);
    const ic = o.icon, text = o.text, name = o.name;
    const build = (): HTMLElement => {
      const kids: (HTMLElement | string)[] = [];
      if (ic) kids.push(ITEMS[ic] ? itemIcon(ic) : icon(ic));
      if (text && name) kids.push(h('span', { class: 'speech-body' }, h('span', { class: 'speech-name' }, name), h('span', { class: 'speech-text' }, text)));
      else if (text) kids.push(h('span', { class: 'speech-text' }, text));
      return h('div', { class: `speech${text ? '' : ' speech-emote'}` }, ...kids);
    };
    const line: Line = { key: `speech${++this.seq}`, target, height: o.height ?? (target.userData.speechHeight as number | undefined) ?? 1.9, pos: new THREE.Vector3(), until: this.time + (o.dur ?? (text ? 2.4 + text.length * 0.05 : 1.8)), build, version: String(this.seq), prio, leaving: false };
    // stack above a neighbour's bubble instead of covering it
    for (const l of this.lines.values()) {
      if (l.leaving || l.target === target) continue;
      const dx = l.target.position.x - target.position.x, dz = l.target.position.z - target.position.z;
      if (dx * dx + dz * dz < 2.5 && Math.abs(l.height - line.height) < 0.5) line.height = l.height + 0.55;
    }
    this.lines.set(target, line);
    this.place(line);
    return true;
  }

  /** Pop this character's bubble now (e.g. when their chat partner answers). */
  hush(target: THREE.Object3D): void { const l = this.lines.get(target); if (l) this.drop(l); }

  /** Is this character currently showing a line? */
  speaking(target: THREE.Object3D): boolean { const l = this.lines.get(target); return !!l && !l.leaving; }

  /** Pop the bubble away with a little shrink. */
  private drop(l: Line): void {
    if (l.leaving) return;
    l.leaving = true;
    const el = ui.world.setBubble(l.key, l.pos, l.build, l.version)?.firstElementChild;
    if (!el) { this.remove(l); return; }
    gsap.to(el, { scale: 0.3, opacity: 0, y: -6, duration: 0.18, ease: 'power2.in', onComplete: () => this.remove(l) });
  }

  private remove(l: Line): void {
    ui.world.setBubble(l.key, null, l.build);
    if (this.lines.get(l.target) === l) this.lines.delete(l.target);
  }

  private place(l: Line): void {
    l.target.getWorldPosition(l.pos);
    l.pos.y += l.height;
    const el = ui.world.setBubble(l.key, l.pos, l.build, l.version);
    if (el && !el.dataset.speech) { el.dataset.speech = '1'; el.style.pointerEvents = 'none'; el.style.zIndex = '2'; }
  }

  update(dt: number): void {
    this.time += dt;
    if (!this.lines.size) return;
    // keep build/edit mode clean
    const hide = ui.interaction?.mode.kind === 'place' || ui.interaction?.mode.kind === 'edit';
    if (hide !== this.hidden) { this.hidden = hide; ui.world.layer.classList.toggle('speech-hidden', hide); }
    for (const l of this.lines.values()) {
      if (!l.target.parent) { this.remove(l); continue; }
      this.place(l);
      if (!l.leaving && this.time > l.until) this.drop(l);
    }
  }
}

export const speech = new SpeechBubbles();
