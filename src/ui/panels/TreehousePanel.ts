import { Panel } from '../Panel';
import { h, icon, button, clear } from '../dom';
import { ui } from '../UI';
import { TREEHOUSE, type RoomDef } from '../../data';
import { restoration } from '../../systems/Restoration';
import { game } from '../../systems/Game';
import { furnished, treehouseLock, treehouseStage } from '../../systems/Treehouse';
import { openRoom } from './SquarePanel';
import { senderBadge } from './MailPanel';
import './square.css';

/** 1.27 The Treehouse: its three build stages, then six furnishings, each opening its bundles in the room screen. */
export function openTreehouse(): void {
  const p = new Panel({ title: 'The Treehouse', icon: 'house', color: 'green', size: 'large', wallet: true });
  const card = (r: RoomDef, k: number) => {
    const fin = restoration.isDone(r.id), lock = treehouseLock(r.id);
    const pct = Math.round(restoration.roomFraction(r.id) * 100);
    const status = fin ? 'Done' : lock ?? `${pct}% there`;
    return h('div', { class: `sq-bundle mn-wing${fin ? ' full' : ''}${lock ? ' locked' : ''}`, onclick: () => openRoom(r.id), role: 'button', tabindex: '0', 'aria-label': `${r.name}: ${status}` },
      h('div', { class: 'sq-bundle-head' }, icon(fin ? 'check' : lock ? 'lock' : r.icon),
        h('div', { class: 'grow' }, h('div', { class: 'sq-bundle-name' }, `${k + 1}. ${r.name}`), h('div', { class: 'sq-bundle-sub' }, status))),
      lock || fin ? null : h('div', { class: 'progress' }, h('div', { class: 'fill', style: `width:${pct}%` }), h('div', { class: 'label' }, `${pct}%`)),
      h('div', { class: 'sq-reward-text' }, r.reward.text));
  };
  const render = () => {
    clear(p.body);
    p.body.append(h('div', { class: 'sq-intro' }, senderBadge('juniper', 48), h('div', { class: 'sq-intro-text' },
      'A treehouse in the biggest pine in Whispering Pines: a cosy spot of your own in the woods. Build it, then furnish it.')));
    p.body.append(h('div', { class: 'section-title' }, `Building: ${treehouseStage()} of ${TREEHOUSE.stages.length}`));
    TREEHOUSE.stages.forEach((s, k) => p.body.append(card(s, k)));
    p.body.append(h('div', { class: 'section-title' }, `Furnishings: ${furnished()} of ${TREEHOUSE.furnishings.length}`));
    TREEHOUSE.furnishings.forEach((f, k) => p.body.append(card(f, k)));
    clear(p.footer);
    p.footer.append(button([icon('house'), 'Back'], () => p.close(), 'green'));
  };
  render();
  const off = game.bus.on('restoration:changed', () => render());
  const off2 = game.bus.on('restoration:room', () => render());
  p.onClose = () => { off(); off2(); };
  p.open();
}

ui.register('treehouse', () => openTreehouse());
