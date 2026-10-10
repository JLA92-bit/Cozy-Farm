import { currentLook } from '../world/FarmLook';
import { woodsView } from './Woods';
import type { FarmScene } from './FarmScene';

/** Show the farm look chosen in Settings (or none): the sky, the grass of the farm and the woods, then repaint the ground. */
export function applyFarmLook(scene: FarmScene): void {
  const look = currentLook();
  scene.env.setLook(look);
  scene.farm.terrain.setLook(look);
  scene.farm.refreshLand();
  woodsView()?.setLook(look);
}
