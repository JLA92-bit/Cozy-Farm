import { Panel } from '../Panel';
import { h, icon, button, clear, fmt } from '../dom';
import { ui } from '../UI';
import { FARMHANDS, type ChoreId } from '../../data';
import { game } from '../../systems/Game';
import { farmhands } from '../../systems/Farmhands';
import { audio } from '../../systems/Audio';
import './farmhands.css';

const CHORES: ChoreId[] = ['fields', 'animals', 'workshop'];
const choreText = (c: ChoreId): string => FARMHANDS.chores[c].text.split('{n}').join(String(FARMHANDS.fieldsPerRound));

/**
 * 1.25 Farmhands: hire helpers for one chore each (replant fields, feed one animal home, run one workshop).
 * Opened from the Farmhouse screen.
 */
export function openFarmhands(): void {
  const p = new Panel({ title: 'Farmhands', icon: 'seedling', color: 'green', size: 'medium', wallet: true });
  const render = () => {
    clear(p.body);
    const t = farmhands.today();
    p.body.append(h('div', { class: 'fh-hands-intro' },
      h('div', null, `Each farmhand takes one chore and sees to it every ${FARMHANDS.roundMinutes} minutes while you play. They are paid ${fmt(FARMHANDS.wage)} coins on the days they work, rest on festival days, and never sell or deliver anything for you.`),
      farmhands.resting() ? h('div', { class: 'fh-hands-rest' }, icon('sparkles'), 'It is a festival day: your farmhands are off enjoying it.') : null,
      h('div', { class: 'muted' }, `Today: ${t.planted} fields replanted, ${t.fed} animals fed, ${t.queued} batches started, ${fmt(t.wages)} coins in wages.`),
      game.state.farmhands?.hired.length ? h('div', { class: 'muted' }, `Next round in about ${farmhands.nextRoundIn()} min.`) : null));
    for (const d of farmhands.hands()) {
      const hired = farmhands.hired(d.id), open = farmhands.unlocked(d.id);
      const card = h('div', { class: `card fh-hand${hired ? ' hired' : ''}${open ? '' : ' locked'}` },
        h('div', { class: 'fh-hand-head' }, icon(open ? d.icon : 'lock', 'fh-hand-icon'),
          h('div', { class: 'grow' }, h('div', { class: 'title' }, d.name), h('div', { class: 'sub' }, open ? d.about : `Can be hired from level ${d.level}.`))));
      if (open) {
        if (hired) {
          const c = FARMHANDS.chores[hired.chore];
          const target = hired.chore === 'fields' ? null : game.state.buildings.find((b) => b.uid === hired.target);
          card.append(h('div', { class: 'fh-hand-job' }, icon(c.icon), h('div', null, h('b', null, c.name), target ? `: ${farmhands.targetName(target)}` : '', h('br'), h('small', null, choreText(hired.chore)))));
          const row = h('div', { class: 'fh-hand-row' });
          if (hired.chore !== 'fields') {
            const list = farmhands.targets(hired.chore);
            if (list.length > 1) row.append(button('Next one', () => {
              const i = list.findIndex((b) => b.uid === hired.target);
              farmhands.hire(d.id, hired.chore, list[(i + 1) % list.length].uid);
              audio.play('select'); render();
            }, 'small blue'));
          }
          for (const c2 of CHORES) if (c2 !== hired.chore) row.append(button([icon(FARMHANDS.chores[c2].icon), FARMHANDS.chores[c2].name], () => assign(d.id, c2), 'small'));
          row.append(button('Let go', () => { farmhands.dismiss(d.id); audio.play('close'); render(); }, 'small red'));
          card.append(row);
        } else {
          card.append(h('div', { class: 'fh-hand-row' }, ...CHORES.map((c) => button([icon(FARMHANDS.chores[c].icon), FARMHANDS.chores[c].name], () => assign(d.id, c), 'small green'))));
        }
      }
      p.body.append(card);
    }
  };
  const assign = (id: string, chore: ChoreId) => {
    if (!farmhands.hire(id, chore)) {
      ui.feedback.toast(chore === 'animals' ? 'No animal homes yet' : 'No workshops yet', 'Build one first, then give this chore.', 'cross');
      audio.play('error');
      return;
    }
    audio.play('reward');
    // the hand starts on the next round (every few minutes); a heads-up if the day's wage is not there yet
    if (game.coins < FARMHANDS.wage) ui.feedback.toast('Not enough coins yet', `${FARMHANDS.hands.find((x) => x.id === id)?.name} starts once you can pay the day's wage.`, 'coin');
    render();
  };
  render();
  p.open();
}

ui.register('farmhands', () => openFarmhands());
