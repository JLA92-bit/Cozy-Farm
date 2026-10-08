import { h, icon, itemIcon, clear } from '../dom';
import { MASTERY } from '../../data';
import { game } from '../../systems/Game';
import { mastery, type MasteryEntry } from '../../systems/Mastery';
import './mastery.css';

function row(e: MasteryEntry): HTMLElement {
  const done = mastery.isDone(e.id), have = mastery.progress(e), pct = Math.round((have / e.target) * 100);
  const pic = e.kind === 'crop' ? itemIcon(e.icon) : icon(e.icon);
  return h('div', { class: `ms-row${done ? ' done' : ''}` }, h('div', { class: 'ms-pic' }, pic),
    h('div', { class: 'grow' },
      h('div', { class: 'ms-name' }, e.name, done ? h('span', { class: 'ms-tag' }, icon('trophy'), 'Mastered') : null),
      h('div', { class: 'ms-sub' }, e.kind === 'crop' ? `Grow ${e.target} gold ${e.name.toLowerCase()}` : `Make ${e.target} gold goods here`),
      h('div', { class: 'progress ms-bar' }, h('div', { class: 'fill', style: `width:${pct}%` }), h('div', { class: 'label' }, done ? 'Done' : `${have} / ${e.target}`))));
}

/** The Mastery tab of the Me screen: gold-star challenges for every crop and workshop. */
export function renderMastery(into: HTMLElement): void {
  clear(into);
  const open = mastery.isOpen();
  into.append(h('div', { class: 'ms-intro' }, icon('trophy', 'ms-intro-icon'),
    h('div', null, h('div', { class: 'ms-title' }, 'Mastery'),
      h('div', { class: 'ms-text' }, open
        ? `Grow gold crops and make gold goods to master them. Each one gives ${MASTERY.reward.coins} coins, ${MASTERY.reward.gems} gems and a Mastery Plaque. ${mastery.doneCount()} of ${mastery.entries.length} done.`
        : `Mastery opens at level ${MASTERY.unlockLevel}. You are level ${game.level}. Gold items you make before then still count.`))));
  for (const [kind, title] of [['crop', 'Crops'], ['workshop', 'Workshops']] as const) {
    into.append(h('div', { class: 'section-title' }, title));
    for (const e of mastery.entries.filter((x) => x.kind === kind)) into.append(row(e));
  }
}
