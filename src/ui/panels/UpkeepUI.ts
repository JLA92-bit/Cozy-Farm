import { h, button, priceTag } from '../dom';
import { ui } from '../UI';
import { BUILDING } from '../../data';
import { game } from '../../systems/Game';
import { upkeep } from '../../systems/Upkeep';
import { audio } from '../../systems/Audio';
import type { PlacedBuilding } from '../../systems/State';
import './upkeep.css';

const LABEL = { fine: 'Good as new', weathered: 'A little weathered', worn: 'Worn: jobs take longer', broken: 'Broken down: repair it to work' } as const;
const LABEL_HOME = { fine: 'Good as new', weathered: 'A little weathered', worn: 'Worn: animals fall unwell more easily', broken: 'Broken down: animals fall unwell much more easily' } as const;

/** 1.15 upkeep: a building's condition and a Repair button (null while it is hardly worn or upkeep is off). */
export function wearRow(b: PlacedBuilding, refresh: () => void): HTMLElement | null {
  if (!upkeep.on || !upkeep.wears(b)) return null;
  const stage = upkeep.stage(b);
  const left = 100 - upkeep.wearOf(b);
  if (stage === 'fine' && !upkeep.canRepair(b)) return null;
  const row = h('div', { class: `wear-row wear-${stage}` },
    h('div', { class: 'grow' },
      h('div', { class: 'wear-title' }, (BUILDING[b.type].cat === 'animal' ? LABEL_HOME : LABEL)[stage]),
      h('div', { class: 'progress wear-bar' }, h('div', { class: 'fill', style: `width:${Math.max(3, Math.round(left))}%` }), h('div', { class: 'label' }, `Condition ${Math.round(left)}%`))));
  if (upkeep.canRepair(b) && !upkeep.hasCarpenter()) {
    row.append(h('div', { class: 'card-sub', style: 'max-width:42%' }, game.level >= BUILDING.carpenter.level ? "Build the Carpenter's Workshop to repair" : `Carpenter's Workshop unlocks at level ${BUILDING.carpenter.level}`));
  } else if (upkeep.canRepair(b)) {
    const cost = upkeep.repairCost(b);
    row.append(button(['Repair', priceTag(cost)], () => {
      if (!upkeep.repair(b)) { ui.feedback.toast('Not enough coins', undefined, 'cross'); audio.play('error'); return; }
      ui.feedback.toast('All repaired!', 'Good as new', 'hammer');
      ui.effects.sparkle(ui.scene.farm.anchor(b.uid), '#fff6a0', 12);
      refresh();
    }, `small ${game.coins >= cost ? 'yellow' : 'disabled'}`));
  }
  return row;
}
