import * as THREE from 'three';
import { h, icon, itemIcon } from './dom';
import { ui } from './UI';
import { ANIMAL, BUILDING } from '../data';
import { game } from '../systems/Game';
import { animals } from '../systems/Animals';
import { formatTime, isBuilt, isUpgrading, settleProduction } from '../systems/Timers';
import type { PlacedBuilding } from '../systems/State';

/** Extra bubble providers registered by other systems (orders, stall, truck...). */
export type BubbleProvider = (b: PlacedBuilding, now: number) => { icon: string; item?: boolean; version: string } | null;
const providers: BubbleProvider[] = [];
export function addBubbleProvider(fn: BubbleProvider): void { providers.push(fn); }

/** Status bubbles over buildings: ready goods, hungry animals, construction timers. */
export function updateBubbles(now: number): void {
  const seen = new Set<string>();
  for (const b of game.state.buildings) {
    const def = BUILDING[b.type];
    if (def.cat === 'decor' || def.cat === 'farm') continue;
    const key = `b${b.uid}`;
    const pos = (): THREE.Vector3 => ui.scene.farm.anchor(b.uid);
    let spec: { icon: string; item?: boolean; version: string; timer?: string; need?: boolean } | null = null;
    if (!isBuilt(b, now)) spec = { icon: 'construction', version: 'build', timer: formatTime(b.buildEnd! - now) };
    else if (isUpgrading(b, now)) spec = { icon: 'hammer', version: 'upgrade', timer: formatTime(b.upgradeEnd! - now) };
    else if (def.cat === 'production') {
      settleProduction(b, now);
      if (b.ready?.length) spec = { icon: b.ready[b.ready.length - 1], item: true, version: `r${b.ready[b.ready.length - 1]}` };
    } else if (def.cat === 'animal' && b.animals?.length) {
      const c = animals.counts(b);
      const a = ANIMAL[def.animal!];
      if (c.ready) spec = { icon: a.product, item: true, version: `ready${a.product}` };
      else if (c.hungry && game.count(a.feed) > 0) spec = { icon: a.feed, item: true, version: 'hungry' };
      // hungry but no feed in the barn: a quiet greyed bubble so the home doesn't look idle for no reason
      else if (c.hungry && !c.producing) spec = { icon: a.feed, item: true, version: 'nofeed', need: true };
    }
    if (!spec) for (const p of providers) { spec = p(b, now); if (spec) break; }
    if (!spec) continue;
    seen.add(key);
    const s = spec;
    const el = ui.world.setBubble(key, pos(), () => {
      const el = h('div', { class: `bubble${s.need ? ' need' : ''}`, onclick: (e: MouseEvent) => { e.stopPropagation(); ui.tapBuilding(b, { x: 0, y: 0 }); } }, s.item ? itemIcon(s.icon) : icon(s.icon));
      if (s.need) el.append(h('div', { class: 'need-badge outlined' }, '!'));
      if (s.timer !== undefined) {
        const wrap = h('div', { class: 'col', style: 'align-items:center;gap:2px' }, el, h('div', { class: 'timer-tag outlined' }, s.timer));
        el.style.animation = 'none';
        el.style.width = '40px'; el.style.height = '40px';
        return wrap;
      }
      return el;
    }, s.version);
    // keep timers ticking without rebuilding the bubble
    if (s.timer !== undefined) { const tag = el?.querySelector('.timer-tag'); if (tag) tag.textContent = s.timer; }
  }
  for (const k of ui.world.bubbleKeys()) if (k.startsWith('b') && !seen.has(k)) ui.world.setBubble(k, null, () => h('div'));
}
