import { Panel } from '../Panel';
import { h, icon, button, clear, priceTag, stableRefresh } from '../dom';
import { ui } from '../UI';
import { ANIMAL, BUILDING } from '../../data';
import { game } from '../../systems/Game';
import { animals } from '../../systems/Animals';
import { upkeep } from '../../systems/Upkeep';
import { audio } from '../../systems/Audio';
import { isBuilt } from '../../systems/Timers';
import { addBubbleProvider } from '../Bubbles';
import type { PlacedBuilding } from '../../systems/State';
import './upkeep.css';

const STAGE = { fine: 'Good as new', weathered: 'Weathered', worn: 'Worn', broken: 'Broken down' } as const;

/** The Vet's Cottage and the Carpenter's Workshop: one list of what needs looking after, with a button for each. */
export function openCare(kind: 'vet' | 'carpenter'): void {
  const vet = kind === 'vet';
  const p = new Panel({ title: vet ? "The Vet's Cottage" : "The Carpenter's Workshop", icon: vet ? 'heart' : 'hammer', color: vet ? 'pink' : 'green', size: 'medium', wallet: true });
  const render = () => {
    clear(p.body);
    p.body.append(h('div', { class: 'muted', style: 'margin-bottom:8px' }, vet
      ? 'Bring me any animal that is off its food. A few coins and a good rest, and they are right as rain. Leave it too long and they go wandering.'
      : 'Worn workshops run slow and broken ones stop altogether. I can set them right again for the price of the timber and a bit of my time.'));
    const list = h('div', { class: 'col', style: 'gap:8px' });
    if (vet) {
      const sick = upkeep.sickList();
      for (const { b, i } of sick) {
        const a = b.animals![i];
        const def = ANIMAL[BUILDING[b.type].animal!];
        const cost = upkeep.treatCost(def.id);
        const days = Math.max(1, Math.ceil(upkeep.wanderDays - (a.sickDays ?? 0)));
        list.append(h('div', { class: 'list-item' }, icon(`model:${def.model}`, 'icon big'),
          h('div', { class: 'grow' }, h('div', { class: 'title' }, `${animals.nameOf(b, i)} the ${def.name.toLowerCase()}`), h('div', { class: 'sub' }, `Unwell: ${days} ${days === 1 ? 'day' : 'days'} before wandering off`)),
          button(['Treat', priceTag(cost)], () => {
            if (!upkeep.treat(b, i)) { ui.feedback.toast('Not enough coins', undefined, 'cross'); audio.play('error'); return; }
            ui.effects.hearts(ui.scene.farm.anchor(b.uid));
            render();
          }, `small ${game.coins >= cost ? 'yellow' : 'disabled'}`)));
      }
      if (!sick.length) list.append(h('div', { class: 'center muted', style: 'padding:16px' }, 'Everyone is healthy. Keep up the pats and a tidy home!'));
      for (const l of upkeep.lost()) {
        const def = ANIMAL[l.animal];
        const k = upkeep.lost().indexOf(l);
        list.append(h('div', { class: 'list-item' }, icon(`model:${def.model}`, 'icon big'),
          h('div', { class: 'grow' }, h('div', { class: 'title' }, `${l.name ?? def.name} wandered off`), h('div', { class: 'sub' }, `${Math.ceil(l.left)} days left to bring them back`)),
          button(['Bring back', priceTag(upkeep.finderFee(l.animal))], () => {
            const r = upkeep.retrieve(k);
            if (!r.ok) { ui.feedback.toast(r.reason ?? 'Cannot', undefined, 'cross'); audio.play('error'); return; }
            render();
          }, 'small blue')));
      }
    } else {
      const need = upkeep.repairList();
      for (const b of need) {
        const def = BUILDING[b.type];
        const cost = upkeep.repairCost(b);
        list.append(h('div', { class: 'list-item' }, icon(def.icon ? `building:${def.id}` : 'hammer', 'icon big'),
          h('div', { class: 'grow' }, h('div', { class: 'title' }, `${def.name} (Lv ${b.level})`), h('div', { class: 'sub' }, `${STAGE[upkeep.stage(b)]}: condition ${Math.round(100 - upkeep.wearOf(b))}%`)),
          button(['Repair', priceTag(cost)], () => {
            if (!upkeep.repair(b)) { ui.feedback.toast('Not enough coins', undefined, 'cross'); audio.play('error'); return; }
            ui.effects.sparkle(ui.scene.farm.anchor(b.uid), '#fff6a0', 12);
            render();
          }, `small ${game.coins >= cost ? 'yellow' : 'disabled'}`)));
      }
      if (!need.length) list.append(h('div', { class: 'center muted', style: 'padding:16px' }, 'Everything is in good shape. Come back when the paint starts to peel!'));
    }
    p.body.append(list);
  };
  render();
  const timer = window.setInterval(() => { if (!p.overlay.isConnected) clearInterval(timer); else stableRefresh([p.body], render); }, 1500);
  p.open();
}

ui.onBuildingTap((b: PlacedBuilding) => {
  if (!isBuilt(b, game.now())) return false;
  if (b.type === 'vet_cottage') { openCare('vet'); return true; }
  if (b.type === 'carpenter') { openCare('carpenter'); return true; }
  return false;
});

addBubbleProvider((b) => {
  if (!upkeep.on) return null;
  if (b.type === 'vet_cottage') { const n = upkeep.sickList().length + upkeep.lost().length; return n ? { icon: 'heart', version: `vet${n}` } : null; }
  if (b.type === 'carpenter') { const n = upkeep.repairList().filter((x) => upkeep.stage(x) !== 'weathered').length; return n ? { icon: 'hammer', version: `car${n}` } : null; }
  return null;
});
