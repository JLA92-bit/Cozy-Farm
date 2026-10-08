import { Panel } from '../Panel';
import { h, icon, itemIcon, clear, stableRefresh } from '../dom';
import { ui } from '../UI';
import { EXPEDITIONS, ITEMS, VILLAGERS, VILLAGER } from '../../data';
import { expeditions } from '../../systems/Expeditions';
import { village } from '../../systems/Village';
import { formatTime } from '../../systems/Timers';
import { game } from '../../systems/Game';
import { audio, haptics } from '../../systems/Audio';
import './woods.css';

const hoursText = (h: number): string => (h < 1 ? `${Math.round(h * 60)} min` : `${Math.round(h * 10) / 10} h`);

/** The expedition board at the Wild Woods: send villagers out and collect what they find. */
export function openExpeditions(): void {
  if (!expeditions.unlocked) { ui.feedback.toast('The expedition board', `Opens at level ${EXPEDITIONS.level}.`, 'compass'); return; }
  const p = new Panel({ title: 'Expedition board', icon: 'compass', color: 'blue', size: 'medium', wallet: true });
  let timer = 0;
  const render = () => {
    clear(p.body);
    const now = game.now();
    p.body.append(h('div', { class: 'muted', style: 'margin-bottom:8px' }, `Send a villager out to look for finds. ${expeditions.freeSlots()} of ${expeditions.slots()} places free. A friend comes home sooner.`));
    const act = expeditions.active();
    act.forEach((t, i) => {
      const v = VILLAGER[t.who], done = expeditions.ready(t, now);
      p.body.append(h('div', { class: `card ex-trip ${done ? 'ready' : ''}` },
        icon(v.icon, 'ex-face'),
        h('div', { class: 'grow' }, h('div', { class: 'card-title' }, `${v.name}: ${EXPEDITIONS.trips.find((x) => x.id === t.trip)?.name ?? ''}`),
          h('div', { class: 'muted' }, done ? 'Back from the trip!' : `Home in ${formatTime(t.end - now)}`)),
        done ? h('button', { class: 'btn yellow small', type: 'button', onclick: () => collect(i) }, 'Collect') : null));
    });
    for (const v of VILLAGERS) {
      if (expeditions.isOut(v.id)) continue;
      const fav = EXPEDITIONS.favour[v.id];
      p.body.append(h('div', { class: 'card ex-villager' },
        h('div', { class: 'row' }, icon(v.icon, 'ex-face'), h('div', { class: 'grow' }, h('div', { class: 'card-title' }, v.name), h('div', { class: 'muted' }, fav?.text ?? ''), h('div', { class: 'muted' }, `${village.hearts(v.id)} hearts`))),
        h('div', { class: 'ex-btns' }, ...EXPEDITIONS.trips.map((t) =>
          h('button', { class: `btn small ${expeditions.freeSlots() > 0 ? 'green' : 'disabled'}`, type: 'button', onclick: () => send(v.id, t.id) }, `${hoursText(expeditions.hours(v.id, t.id))}`)))));
    }
  };
  const send = (who: string, trip: string) => {
    if (!expeditions.send(who, trip)) { ui.feedback.toast('No free place', 'Wait for a trip to come home first.', 'compass'); return; }
    audio.play('select');
    ui.feedback.toast(`${VILLAGER[who].name} sets off!`, undefined, 'compass');
    render();
  };
  const collect = (i: number) => {
    const loot = expeditions.collect(i);
    if (!loot) return;
    audio.play('reward'); haptics.buzz(20);
    clear(p.body);
    p.body.append(h('div', { class: 'ex-loot' }, h('div', { class: 'card-title' }, 'They found:'),
      h('div', { class: 'ex-loot-grid' }, ...loot.map((l) => h('div', { class: 'ex-piece' }, itemIcon(l.item), h('div', null, `${ITEMS[l.item].name} x${l.n}`)))),
      h('button', { class: 'btn green', type: 'button', onclick: render }, 'Lovely!')));
  };
  render();
  timer = window.setInterval(() => { if (!p.overlay.isConnected) clearInterval(timer); else if (!p.body.querySelector('.ex-loot')) stableRefresh([p.body], render); }, 1000);
  p.onClose = () => clearInterval(timer);
  p.open();
}

ui.register('expeditions', () => openExpeditions());
