import { HalloweenDecor, halloweenOn } from '../world/Halloween';
import { applyFarmLook } from './FarmLookApply';
import type { FarmScene } from './FarmScene';
import { ui } from '../ui/UI';
import { h, icon } from '../ui/dom';

/**
 * 1.20.1 Spooky season: puts the Halloween decor in the scene during October (built the first time it is needed) and
 * takes it away again, checking once a minute so it ends on its own after 31 October. Cosmetic only: nothing is saved.
 */
let scene: FarmScene | null = null;
let decor: HalloweenDecor | null = null;
let building = false;
let was = false;

/** Show or hide the decor and the look for the date and the player's setting. */
export function syncHalloween(): void {
  if (!scene) return;
  const on = halloweenOn();
  if (on && !decor && !building) {
    building = true;
    const d = new HalloweenDecor(scene.renderer.profile.ambientLife);
    d.build().then(() => { decor = d; scene!.scene.add(d.group); d.group.visible = halloweenOn(); scene!.loop.wake(1); })
      .catch((e) => console.warn('[halloween] decor could not be drawn', e))
      .finally(() => { building = false; });
  }
  if (decor) decor.group.visible = on;
  document.documentElement.classList.toggle('halloween', on);
  overlay(on);
  if (on !== was) { was = on; applyFarmLook(scene); }
}

/** Over the game: a soft purple vignette, a spider on its thread and the Happy Halloween ribbon with a countdown. */
let extras: HTMLElement[] = [];
let overlayDay = '';
function overlay(on: boolean): void {
  const key = on ? new Date().toDateString() : '';
  if (key === overlayDay && (extras.length > 0) === on) return;
  overlayDay = key;
  extras.forEach((e) => e.remove());
  extras = [];
  if (!on || !ui.root) return;
  const now = new Date(), days = 31 - now.getDate();
  const ribbon = h('div', { class: 'hw-ribbon', 'aria-hidden': 'true' }, icon('ghost'), 'Happy Halloween!',
    h('span', { class: 'sub' }, days > 0 ? `${days} ${days === 1 ? 'night' : 'nights'} to go` : 'Tonight!'));
  const spider = h('div', { class: 'hw-spider', 'aria-hidden': 'true' }, h('div', { class: 'thread' }), h('div', { class: 'body' }));
  extras = [h('div', { class: 'hw-vignette' }), spider, ribbon];
  ui.root.append(...extras);
}

export function initHalloween(s: FarmScene): void {
  scene = s;
  was = halloweenOn();
  syncHalloween();
  s.onFrame((dt) => decor?.update(dt, s.env.night, s.rig.target));
  window.setInterval(syncHalloween, 60000);
  Object.assign(window as unknown as Record<string, unknown>, { __halloween: { sync: syncHalloween, get decor() { return decor; } } });
}
