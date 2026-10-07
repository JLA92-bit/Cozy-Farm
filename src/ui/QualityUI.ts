/**
 * 1.8 star quality, the visible side: star badges (always a star AND the word, never colour alone), the pop
 * and sparkle when a silver or gold item is made, and the one-time hints for stars and fertiliser.
 */
import * as THREE from 'three';
import gsap from 'gsap';
import { h, itemIcon } from './dom';
import { ITEMS } from '../data';
import { game } from '../systems/Game';
import { hints } from '../systems/Hints';
import { audio, haptics } from '../systems/Audio';
import { QUALITY_NAME, type Quality } from '../systems/Quality';
import { FERTILISER } from '../systems/Farming';
import type { Feedback } from './Feedback';
import type { Effects } from '../world/Effects';
import './quality.css';

const STAR_PATH = 'm18.7 4.627l2.247 4.31a2.27 2.27 0 0 0 1.686 1.189l4.746.65c2.538.35 3.522 3.479 1.645 5.219l-3.25 2.999a2.23 2.23 0 0 0-.683 2.04l.793 4.398c.441 2.45-2.108 4.36-4.345 3.24l-4.536-2.25a2.28 2.28 0 0 0-2.006 0l-4.536 2.25c-2.238 1.11-4.786-.79-4.345-3.24l.793-4.399c.14-.75-.12-1.52-.682-2.04l-3.251-2.998c-1.877-1.73-.893-4.87 1.645-5.22l4.746-.65a2.23 2.23 0 0 0 1.686-1.189l2.248-4.309c1.144-2.17 4.264-2.17 5.398 0';
export const STAR_COLOUR = ['#ffffff', '#dfe7ef', '#ffcf3f'] as const;

/** A silver or gold star (inline SVG so it can carry a dark outline on any background). */
export function starIcon(q: Quality, cls = 'q-star'): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('class', `${cls} ${q === 2 ? 'gold' : 'silver'}`);
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', STAR_PATH);
  svg.append(p);
  return svg;
}

/** Star plus the word ("Silver" / "Gold"), so quality never relies on colour alone. */
export function starBadge(q: Quality, extra = ''): HTMLElement {
  return h('span', { class: `q-badge ${q === 2 ? 'gold' : 'silver'} ${extra}`, title: `${QUALITY_NAME[q]} quality` }, starIcon(q), QUALITY_NAME[q]);
}

let wired = false;
/** The pop when a star item is made, plus the first-time hints. Called once from the UI manager. */
export function wireQualityFx(fb: Feedback, fx: Effects, screen: (v: { x: number; y: number; z: number }) => { x: number; y: number }, anchor: (uid: number) => THREE.Vector3): void {
  if (wired) return;
  wired = true;
  // a field sown with fertiliser gets a little green puff, so the choice is felt
  game.bus.on('crop:planted', ({ b }) => {
    if (!b.plot?.fert) return;
    const p = anchor(b.uid).setY(0.3);
    fx.sparkle(p, '#9be86a', 8);
    fx.dust(p, 5, 0.6);
  });
  // a silver and a gold from the same field stack up instead of covering each other
  const stacks = new Map<string, { t: number; n: number }>();
  game.bus.on('item', ({ item, delta, at, quality }) => {
    if (delta <= 0) return;
    if (item === FERTILISER && hints.firstTime('intro:fertiliser')) {
      setTimeout(() => game.bus.emit('toast', { title: 'Fertiliser!', sub: 'Turn on Fertiliser in the seed tray when you plant: those fields grow more silver and gold.', icon: 'seedling' }), 700);
    }
    if (!quality) return;
    game.incStat(quality === 2 ? 'gold_items' : 'silver_items', delta);
    if (hints.firstTime('intro:quality')) {
      setTimeout(() => game.bus.emit('toast', { title: `A ${QUALITY_NAME[quality].toLowerCase()} ${ITEMS[item]?.name ?? 'item'}!`, sub: 'Silver and gold items sell for more and villagers love them.', icon: 'star', style: 'gold' }), 900);
    }
    if (!at) return;
    const now = performance.now(), key = `${at.x.toFixed(1)},${at.z.toFixed(1)}`;
    const st = stacks.get(key);
    const n = st && now - st.t < 400 ? Math.min(2, st.n + 1) : 0;
    stacks.set(key, { t: now, n });
    if (stacks.size > 40) stacks.clear();
    const s = screen(at);
    const gold = quality === 2;
    const el = h('div', { class: `float-text outlined q-pop ${gold ? 'gold' : 'silver'}`, style: `left:${s.x + 22}px;top:${s.y - 86 - n * 34}px` },
      starIcon(quality), itemIcon(item), `+${delta} ${QUALITY_NAME[quality]}`);
    fb.floatLayer.append(el);
    gsap.timeline({ delay: 0.1 + n * 0.08, onComplete: () => el.remove() })
      .fromTo(el, { scale: 0.3, opacity: 0 }, { scale: gold ? 1.25 : 1.15, opacity: 1, duration: 0.2, ease: 'back.out(3)' })
      .to(el, { scale: 1, duration: 0.12 })
      .to(el, { y: -40, duration: gold ? 1.4 : 1.1, ease: 'power1.out' }, 0.15)
      .to(el, { opacity: 0, duration: 0.3 }, gold ? 1.3 : 1.0);
    const p = new THREE.Vector3(at.x, at.y + 0.5, at.z);
    if (gold) {
      fx.sparkle(p, '#ffd84a', 16);
      fx.twinkle(p.clone().setY(at.y + 1), '#fff3b0');
      fx.ring(new THREE.Vector3(at.x, 0.15, at.z), 1.4, '#ffe680');
      audio.play('sparkle', { volume: 0.9, rate: 1.15, throttleMs: 120 });
      haptics.play('success');
    } else {
      fx.sparkle(p, '#eef4ff', 7);
      audio.play('sparkle', { volume: 0.45, rate: 1.4, throttleMs: 120 });
    }
  });
}
