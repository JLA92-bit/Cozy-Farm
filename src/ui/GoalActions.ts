import * as THREE from 'three';
import { ui } from './UI';
import { Panel } from './Panel';
import { game } from '../systems/Game';
import type { GoalAction } from '../systems/Goals';
import { Terrain } from '../world/Terrain';

/** Carry out a goal / quest "Go" action: open a panel or fly the camera to the right spot. */
export function runGoalAction(a: GoalAction | undefined, closePanels = false): boolean {
  if (!a) return false;
  if (closePanels) Panel.closeAll();
  const scene = ui.scene;
  if (a.panel) {
    // let a closing panel finish its animation first so the new one stacks cleanly
    if (closePanels) setTimeout(() => ui.open(a.panel!, a.arg), 220); else ui.open(a.panel, a.arg);
    return true;
  }
  if (a.focusUid) {
    const at = scene.farm.anchor(a.focusUid);
    scene.rig.focus(at.x, at.z);
    const v = scene.farm.views.get(a.focusUid);
    if (v) setTimeout(() => scene.farm.bounce(v), closePanels ? 250 : 0);
    ui.effects.sparkle(at.clone().setY(at.y + 0.4), '#fff6a0', 10);
    return true;
  }
  if (a.chunk) {
    const c = Terrain.chunkCenter(a.chunk);
    scene.rig.focus(c.x, c.z);
    setTimeout(() => ui.expansionPopup(a.chunk!), 650);
    return true;
  }
  if (a.obstacle !== undefined) {
    const o = game.state.obstacles.find((x) => x.id === a.obstacle);
    if (!o) return false;
    const p = new THREE.Vector3(o.x - 24 + 0.5, scene.farm.obstacleHeight(o) + 0.2, o.z - 24 + 0.5);
    scene.rig.focus(p.x, p.z);
    setTimeout(() => ui.obstaclePopup(o, p), 650);
    return true;
  }
  return false;
}
