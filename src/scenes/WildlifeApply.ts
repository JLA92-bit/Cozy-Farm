import { FarmWildlife } from '../world/Wild';
import { ui } from '../ui/UI';
import { takePhoto } from '../ui/Photo';
import { wildlife } from '../systems/Wildlife';
import type { FarmScene } from './FarmScene';

/** 1.27 the farm-edge wildlife: built once at boot, looked at again every half minute, tapped for a photo. */
export function initWildlife(scene: FarmScene): void {
  const farm = new FarmWildlife();
  farm.build().then(() => { scene.scene.add(farm.group); scene.loop.wake(1); }).catch((e) => console.warn('[wildlife] farm visitors could not be drawn', e));
  scene.onFrame((dt) => farm.update(dt));
  window.setInterval(() => farm.refresh(), 30000);
  const prev = ui.extraPick;
  ui.extraPick = (ray) => {
    const id = farm.pick(ray);
    return id ? () => takePhoto(id, farm.at(id)) : prev?.(ray) ?? null;
  };
  Object.assign(window as unknown as Record<string, unknown>, { __wildlife: { sys: wildlife, farm } });
}
