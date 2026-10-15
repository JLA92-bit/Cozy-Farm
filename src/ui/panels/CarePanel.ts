import { Panel } from '../Panel';
import { h, icon, button, clear, priceTag, stableRefresh } from '../dom';
import { ui } from '../UI';
import { ANIMAL, BUILDING } from '../../data';
import { game } from '../../systems/Game';
import { animals } from '../../systems/Animals';
import { upkeep } from '../../systems/Upkeep';
import { audio } from '../../systems/Audio';
import { formatTime, isBuilt, isUpgrading } from '../../systems/Timers';
import { buildings } from '../../systems/Buildings';
import { UPKEEP } from '../../data';
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
          h('div', { class: 'grow' }, h('div', { class: 'title' }, `${def.name} (Lv ${b.level})`), h('div', { class: 'sub' }, `${STAGE[upkeep.stage(b)]}: condition ${Math.round(100 - upkeep.wearOf(b))}%${upkeep.freshPaint(b) ? ', fresh paint' : ''}`)),
          button(['Repair', priceTag(cost)], () => {
            if (!upkeep.repair(b)) { ui.feedback.toast('Not enough coins', undefined, 'cross'); audio.play('error'); return; }
            ui.effects.sparkle(ui.scene.farm.anchor(b.uid), '#fff6a0', 12);
            render();
          }, `small ${game.coins >= cost ? 'yellow' : 'disabled'}`)));
      }
      if (!need.length) list.append(h('div', { class: 'center muted', style: 'padding:16px' }, 'Everything is in good shape. Come back when the paint starts to peel!'));
    }
    p.body.append(list);
    if (vet) p.body.append(checkups(render));
    const home = game.buildingsOf(vet ? 'vet_cottage' : 'carpenter')[0];
    if (home) p.body.append(levelCard(home, vet, render));
  };
  render();
  const timer = window.setInterval(() => { if (!p.overlay.isConnected) clearInterval(timer); else stableRefresh([p.body], render); }, 1500);
  p.open();
}

const DAY = 86400000;

/** 1.21 Vet level 2+: a check-up keeps one home's animals well for a few days. */
function checkups(render: () => void): HTMLElement {
  const box = h('div', { class: 'col', style: 'gap:8px;margin-top:10px' });
  box.append(h('div', { class: 'section-title' }, 'Check-ups'));
  if (upkeep.vetLevel() < 2) {
    box.append(h('div', { class: 'muted' }, `At level 2 the vet gives a daily check-up: every animal in one home stays well for ${UPKEEP.care.checkup.days} days.`));
    return box;
  }
  const left = upkeep.checkupsLeft();
  box.append(h('div', { class: 'muted' }, left ? `${left} ${left === 1 ? 'check-up' : 'check-ups'} left today. Every animal in the home stays well for ${UPKEEP.care.checkup.days} days.` : 'No more check-ups today. Come back tomorrow.'));
  const homes = game.state.buildings.filter((b) => BUILDING[b.type]?.cat === 'animal' && (b.animals?.length ?? 0) > 0 && isBuilt(b, game.now()));
  for (const b of homes) {
    const def = BUILDING[b.type];
    const days = upkeep.underCheckup(b) ? Math.max(1, Math.ceil(((b.checkupUntil ?? 0) - game.now()) / DAY)) : 0;
    box.append(h('div', { class: 'list-item' }, icon(`building:${def.id}`, 'icon big'),
      h('div', { class: 'grow' }, h('div', { class: 'title' }, `${def.name} (${b.animals!.length} ${b.animals!.length === 1 ? 'animal' : 'animals'})`), h('div', { class: 'sub' }, days ? `Checked: well for ${days} more ${days === 1 ? 'day' : 'days'}` : 'Not checked')),
      days ? icon('check', 'icon') : button('Check-up', () => {
        if (!upkeep.checkup(b)) { ui.feedback.toast('No check-ups left today', undefined, 'heart'); audio.play('error'); return; }
        ui.effects.hearts(ui.scene.farm.anchor(b.uid));
        render();
      }, `small ${left ? 'green' : 'disabled'}`)));
  }
  return box;
}

/** 1.21 the building's level and its next upgrade. */
function levelCard(b: PlacedBuilding, vet: boolean, render: () => void): HTMLElement {
  const card = h('div', { class: 'card care-level' });
  const now = game.now();
  card.append(h('div', { class: 'title' }, `${vet ? "Vet's Cottage" : "Carpenter's Workshop"}: level ${b.level}`));
  if (isUpgrading(b, now)) {
    card.append(h('div', { class: 'sub' }, `Upgrading: ${formatTime((b.upgradeEnd ?? now) - now)} left`));
    return card;
  }
  const up = buildings.upgradeInfo(b);
  if (!up) { card.append(h('div', { class: 'sub' }, 'Fully upgraded.')); return card; }
  const check = buildings.canUpgrade(b);
  card.append(h('div', { class: 'sub' }, `Level ${up.next}: ${up.label}.${check.ok ? '' : ` ${(check as { reason: string }).reason}.`}`));
  card.append(button(['Upgrade', priceTag(up.cost)], () => {
    if (!buildings.upgrade(b)) { ui.feedback.toast((buildings.canUpgrade(b) as { reason?: string }).reason ?? 'Cannot upgrade', undefined, 'lock'); audio.play('error'); return; }
    render();
  }, `small ${check.ok ? 'yellow' : 'disabled'}`));
  return card;
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
