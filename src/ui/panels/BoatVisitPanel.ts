import { Panel } from '../Panel';
import { h, append, itemIcon, clear, priceTag, fmt, stableRefresh, icon } from '../dom';
import { ui } from '../UI';
import { sideEntries } from '../SideBar';
import { ITEMS } from '../../data';
import { game } from '../../systems/Game';
import { boatvisit } from '../../systems/BoatVisit';
import { formatTime } from '../../systems/Timers';
import { audio, haptics } from '../../systems/Audio';
import './economy.css';

/** The visiting boat: what the visitor wants today, and a Deliver button. */
export function openBoatVisit(): void {
  const theme = boatvisit.theme();
  const p = new Panel({ title: theme.name, icon: theme.icon, color: 'blue', size: 'medium', wallet: true });
  let timer = 0;
  const render = () => {
    clear(p.body);
    const here = boatvisit.here();
    p.body.append(h('div', { class: 'row between', style: 'margin-bottom:8px;gap:8px' },
      h('div', { class: 'muted' }, here ? `"${theme.greeting}"` : 'The boat has sailed. Boats call two days a week, between ' + boatvisit.hoursText + '.'),
      here ? h('span', { class: 'timer-tag outlined' }, `Leaves in ${formatTime(boatvisit.closesIn())}`) : null));
    const want = boatvisit.want();
    const ids = Object.keys(want);
    if (!ids.length) { p.body.append(h('div', { class: 'center muted', style: 'padding:20px' }, 'They are after goods you cannot make yet. Come back when your farm grows.')); return; }
    const grid = h('div', { class: 'grid' });
    for (const id of ids) {
      const have = game.count(id), need = want[id];
      const card = h('div', { class: `card ${have >= need ? 'done' : ''}` });
      append(card, [itemIcon(id, 'card-icon'), h('div', { class: 'card-title' }, ITEMS[id].name), h('div', { class: `pill ${have >= need ? 'enough' : 'short'}` }, `${have} / ${need}`)]);
      grid.append(card);
    }
    p.body.append(grid);
    const r = boatvisit.reward(want);
    p.body.append(h('div', { class: 'row center', style: 'margin-top:10px;gap:10px' }, h('span', null, 'They pay: '), r.coins ? priceTag(r.coins) : null, r.gems ? h('span', { class: 'row' }, icon('gem'), `${r.gems}`) : null));
    const done = boatvisit.done;
    const ok = boatvisit.canDeliver();
    const btn = h('button', { class: `btn ${ok ? 'green' : 'disabled'}`, style: 'margin-top:10px;width:100%' }, done ? 'Delivered today. Thank you!' : ok ? 'Deliver' : here ? 'Not enough yet' : 'Gone');
    btn.addEventListener('click', () => {
      if (!boatvisit.deliver()) { audio.play('error'); return; }
      ui.feedback.toast('Delivered!', `+${fmt(r.coins)} coins${r.gems ? ` and ${r.gems} gems` : ''}`, theme.icon);
      haptics.buzz(12);
      render();
    });
    p.body.append(btn);
  };
  render();
  timer = window.setInterval(() => { if (!p.overlay.isConnected) clearInterval(timer); else stableRefresh([p.body], render); }, 1000);
  p.onClose = () => clearInterval(timer);
  p.open();
}

ui.register('boatvisit', () => openBoatVisit());
sideEntries.push(() => (boatvisit.here() && !boatvisit.done ? { id: 'boatvisit', icon: boatvisit.theme().icon, label: 'Boat', color: 'blue', badge: boatvisit.canDeliver() } : null));
