import { FarmWildlife } from '../world/Wild';
import { ui } from '../ui/UI';
import { takePhoto } from '../ui/Photo';
import { wildlife } from '../systems/Wildlife';
import { game } from '../systems/Game';
import type { FarmScene } from './FarmScene';

/** 1.27 the farm-edge wildlife: built once at boot, looked at again every half minute, tapped for a photo. */
export function initWildlife(scene: FarmScene): void {
  const farm = new FarmWildlife();
  farm.build().then(() => { scene.scene.add(farm.group); scene.loop.wake(1); }).catch((e) => console.warn('[wildlife] farm visitors could not be drawn', e));
  scene.onFrame((dt) => farm.update(dt));
  window.setInterval(() => { farm.refresh(); hint(); }, 30000);
  // a small hint when a visitor turns up at the farm's edge (each species once a day, at most 3 a day)
  const told = new Map<string, string>();
  const hint = () => {
    if (!wildlife.open || document.hidden) return;
    const day = new Date().toDateString();
    if ([...told.values()].filter((d) => d === day).length >= 3) return;
    const s = wildlife.species().find((x) => x.place === 'farm' && told.get(x.id) !== day && wildlife.present(x.id) && !wildlife.shotToday(x.id));
    if (!s) return;
    told.set(s.id, day);
    game.bus.emit('toast', { title: wildlife.photographed(s.id) ? `${s.name} nearby` : 'A wild visitor!', sub: `${wildlife.photographed(s.id) ? s.name : 'Something'} is at the edge of your farm. Tap it to take a photo for your album.`, icon: wildlife.photographed(s.id) ? `wild_${s.id}` : 'camera' });
  };
  const prev = ui.extraPick;
  ui.extraPick = (ray) => {
    const id = farm.pick(ray);
    return id ? () => takePhoto(id, farm.at(id)) : prev?.(ray) ?? null;
  };
  Object.assign(window as unknown as Record<string, unknown>, { __wildlife: { sys: wildlife, farm } });
}
