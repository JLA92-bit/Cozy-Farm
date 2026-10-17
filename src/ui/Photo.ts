import type * as THREE from 'three';
import { ui } from './UI';
import { wildlife } from '../systems/Wildlife';
import { audio } from '../systems/Audio';

/**
 * 1.27 taking a wildlife photo: a camera click, a white flash over the screen and a toast. Shared by the farm-edge
 * visitors and the Wild Woods.
 */
export function takePhoto(id: string, at: THREE.Vector3 | null): void {
  const s = wildlife.def(id);
  if (!s) return;
  if (wildlife.shotToday(id)) { ui.feedback.toast(`${s.name}`, "You've photographed this one today. Come back tomorrow for another.", `wild_${id}`); return; }
  const r = wildlife.photograph(id, at ?? undefined);
  if (!r) return;
  audio.play('snap');
  const flash = document.createElement('div');
  flash.className = 'photo-flash';
  flash.setAttribute('aria-hidden', 'true');
  flash.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:.85;pointer-events:none;z-index:9999;transition:opacity .45s ease-out';
  document.body.append(flash);
  requestAnimationFrame(() => { flash.style.opacity = '0'; });
  window.setTimeout(() => flash.remove(), 600);
  if (at) ui.effects.burst(at, '#ffffff', 14);
  ui.feedback.toast(r.first ? `New in your album: ${s.name}!` : `Snap! ${s.name}`, r.complete ? 'Your Wildlife Album is complete! Juniper has written to you.' : r.set ? `The ${r.set} set is complete: a reward is yours.` : s.about, `wild_${id}`);
  if (r.set || r.complete) audio.play('reward');
}
