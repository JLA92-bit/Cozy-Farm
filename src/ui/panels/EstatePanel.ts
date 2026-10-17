import { Panel } from '../Panel';
import { h, icon, button, clear } from '../dom';
import { ui } from '../UI';
import { ESTATE } from '../../data';
import { restoration } from '../../systems/Restoration';
import { game } from '../../systems/Game';
import { currentStageOf, estateLock, estateStarted, stagesDoneOf } from '../../systems/Estate';
import { openRoom } from './SquarePanel';
import { senderBadge } from './MailPanel';
import './square.css';

/**
 * 1.26 Estate Projects: the Clock Tower and the Lighthouse. One section per project with a card per stage (built,
 * being built, or why it is locked), like the Manor screen. Tapping a stage opens its bundles in the room screen.
 */
export function openEstate(): void {
  const p = new Panel({ title: 'Estate Projects', icon: 'hourglass', color: 'blue', size: 'large', wallet: true });
  const render = () => {
    clear(p.body);
    if (!estateStarted()) p.body.append(h('div', { class: 'sq-intro' }, senderBadge('hazel', 48), h('div', { class: 'sq-intro-text' }, 'Once every room of the village square is rebuilt, the village has two big projects in mind, and they will need your help.')));
    for (const pr of ESTATE) {
      const done = stagesDoneOf(pr), now = currentStageOf(pr);
      p.body.append(h('div', { class: 'section-title' }, `${pr.name}: ${done} of ${pr.stages.length}`));
      p.body.append(h('div', { class: 'sq-intro' }, senderBadge(pr.villager, 40), h('div', { class: 'sq-intro-text' }, pr.about)));
      pr.stages.forEach((s, k) => {
        const fin = restoration.isDone(s.id), lock = estateLock(s.id);
        const pct = Math.round(restoration.roomFraction(s.id) * 100);
        const status = fin ? 'Built' : lock ?? `${pct}% there`;
        p.body.append(h('div', { class: `sq-bundle mn-wing${fin ? ' full' : ''}${lock ? ' locked' : ''}${now?.id === s.id && !lock ? ' current' : ''}`, onclick: () => openRoom(s.id), role: 'button', tabindex: '0', 'aria-label': `${s.name}: ${status}` },
          h('div', { class: 'sq-bundle-head' }, icon(fin ? 'check' : lock ? 'lock' : s.icon),
            h('div', { class: 'grow' }, h('div', { class: 'sq-bundle-name' }, `${k + 1}. ${s.name}`), h('div', { class: 'sq-bundle-sub' }, status))),
          lock || fin ? null : h('div', { class: 'progress' }, h('div', { class: 'fill', style: `width:${pct}%` }), h('div', { class: 'label' }, `${pct}%`)),
          h('div', { class: 'sq-reward-text' }, s.reward.text)));
      });
    }
    clear(p.footer);
    p.footer.append(button([icon('house'), 'Back'], () => p.close(), 'green'));
  };
  render();
  const off = game.bus.on('restoration:changed', () => render());
  const off2 = game.bus.on('restoration:room', () => render());
  p.onClose = () => { off(); off2(); };
  p.open();
}

ui.register('estate', () => openEstate());
