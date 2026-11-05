import { Panel } from '../Panel';
import { h, icon, button, clear, fmt } from '../dom';
import { ui } from '../UI';
import { BUILDING, PARCELS, PIECE } from '../../data';
import { game } from '../../systems/Game';
import { audio } from '../../systems/Audio';
import { titles, TITLES } from '../../systems/Titles';
import { sideEntries } from '../SideBar';
import './records.css';

/** 1.43 Me > Records: the title shown on the Me screen, the farm's records and how to earn more titles. */
export function renderRecords(into: HTMLElement, redraw: () => void): void {
  clear(into);
  const cur = titles.current();
  into.append(h('div', { class: 'rc-head' }, icon('medal', 'rc-head-icon'), h('div', null,
    h('div', { class: 'rc-name' }, game.state.player.name), h('div', { class: 'rc-title' }, cur ? cur.name : 'No title yet'))));
  if (game.level >= PARCELS.level) into.append(button([icon('package'), ' Pin a goal for your parcels'], () => ui.open('parcels'), 'btn blue'));
  into.append(h('div', { class: 'section-title' }, 'Titles'));
  const list = h('div', { class: 'rc-titles' });
  for (const t of TITLES) {
    const got = t.earned(), on = cur?.id === t.id;
    list.append(h('div', { class: `rc-t${got ? '' : ' locked'}${on ? ' on' : ''}` }, icon(got ? 'medal' : 'lock', 'icon'),
      h('div', { class: 'grow' }, h('b', null, t.name), h('div', { class: 'muted' }, t.how)),
      got ? button(on ? 'Shown' : 'Show', () => { titles.choose(on ? null : t.id); audio.play('select'); redraw(); }, `small ${on ? 'blue' : 'green'}`) : null));
  }
  into.append(list);
  const recs = titles.records();
  if (recs.length) {
    into.append(h('div', { class: 'section-title' }, 'Farm records'));
    into.append(h('div', { class: 'rc-records' }, ...recs.map(([k, v]) => h('div', { class: 'rc-rec' }, h('span', null, k), h('b', null, fmt(v))))));
  }
}

/** 1.43 the milestone gift: pick one of three at level 80, 90, 100... */
export function openMilestone(): void {
  const lvl = titles.pendingMilestone();
  if (lvl === null) return;
  const o = titles.offers(lvl);
  const p = new Panel({ title: `Level ${lvl}!`, icon: 'gift', color: 'purple', size: 'small' });
  p.body.append(h('div', { class: 'center', style: 'margin-bottom:8px' }, 'The whole village chipped in for a present. Pick one:'));
  const pick = (k: 'gems' | 'decor' | 'piece', label: string) => () => {
    if (!titles.claim(lvl, k)) return;
    audio.play('reward');
    ui.feedback.toast(`Level ${lvl} gift`, label, 'gift');
    p.close();
  };
  const opts = h('div', { class: 'rc-gifts' },
    button([icon('gem', 'icon big'), h('span', null, `${o.gems} gems`)], pick('gems', `${o.gems} gems`), 'rc-gift'),
    o.decor ? button([icon(`building:${o.decor}`, 'icon big'), h('span', null, BUILDING[o.decor].name)], pick('decor', `${BUILDING[o.decor].name} is in your storage`), 'rc-gift') : null,
    o.piece ? button([icon(`piece:${o.piece}`, 'icon big'), h('span', null, PIECE[o.piece].name)], pick('piece', `${PIECE[o.piece].name} is in your home storage`), 'rc-gift') : null);
  p.body.append(opts);
  p.open();
}

ui.register('milestone', () => openMilestone());
sideEntries.push(() => (game.state.tutorial.done && titles.pendingMilestone() !== null ? { id: 'milestone', icon: 'gift', label: 'Gift', color: 'purple', badge: true } : null));
