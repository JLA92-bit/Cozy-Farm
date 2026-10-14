import { Panel } from '../Panel';
import { h, icon, button, clear } from '../dom';
import { ui } from '../UI';
import { MANOR, MANOR_WINGS } from '../../data';
import { restoration } from '../../systems/Restoration';
import { game } from '../../systems/Game';
import { currentWing, manorStarted, wingLock, wingsDone } from '../../systems/Manor';
import { openRoom } from './SquarePanel';
import { senderBadge } from './MailPanel';
import './square.css';

/**
 * 1.18 Willowmere Manor: the estate behind the village square. One card per wing, in order: rebuilt, being rebuilt
 * (how far along), or why it is still locked. Tapping a wing opens its bundles in the room screen (SquarePanel).
 */
export function openManor(): void {
  const p = new Panel({ title: MANOR.name, icon: 'crown', color: 'purple', size: 'large', wallet: true });
  const render = () => {
    clear(p.body);
    const done = wingsDone(), now = currentWing();
    p.body.append(h('div', { class: 'sq-intro' }, senderBadge('hazel', 48),
      h('div', { class: 'sq-intro-text' }, manorStarted()
        ? done === MANOR_WINGS.length
          ? 'Willowmere is open, and the whole valley comes to dance in the ballroom. Thank you, Keeper of Willowmere.'
          : `The great house behind the square has stood empty for a hundred years. Rebuild it wing by wing: each one asks a great deal, and each one gives something back to your farm for good. ${done} of ${MANOR_WINGS.length} wings rebuilt.`
        : 'Behind the village square stands Willowmere, the old manor house, shut up for a hundred years. Once every room of the square is rebuilt, the village will start on the manor with you.')));
    MANOR_WINGS.forEach((w, k) => {
      const fin = restoration.isDone(w.id), lock = wingLock(w.id);
      const pct = Math.round(restoration.roomFraction(w.id) * 100);
      const status = fin ? 'Rebuilt' : lock ?? `${pct}% there`;
      p.body.append(h('div', { class: `sq-bundle mn-wing${fin ? ' full' : ''}${lock ? ' locked' : ''}${now?.id === w.id && !lock ? ' current' : ''}`, onclick: () => openRoom(w.id), role: 'button', tabindex: '0', 'aria-label': `${w.name}: ${status}` },
        h('div', { class: 'sq-bundle-head' }, icon(fin ? 'check' : lock ? 'lock' : w.icon),
          h('div', { class: 'grow' }, h('div', { class: 'sq-bundle-name' }, `${k + 1}. ${w.name}`), h('div', { class: 'sq-bundle-sub' }, status))),
        lock || fin ? null : h('div', { class: 'progress' }, h('div', { class: 'fill', style: `width:${pct}%` }), h('div', { class: 'label' }, `${pct}%`)),
        h('div', { class: 'sq-reward-text' }, fin ? w.reward.text : `Reward: ${w.reward.text}`)));
    });
    clear(p.footer);
    p.footer.append(button([icon('house'), 'Back'], () => p.close(), 'green'));
  };
  render();
  // a wing screen gives items on top of this one: keep the list up to date
  const off = game.bus.on('restoration:changed', () => render());
  const off2 = game.bus.on('restoration:room', () => render());
  p.onClose = () => { off(); off2(); };
  p.open();
}

ui.register('manor', () => openManor());
