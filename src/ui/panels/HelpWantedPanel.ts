import { Panel } from '../Panel';
import { h, icon, itemIcon, clear, fmt } from '../dom';
import { ui } from '../UI';
import { ITEMS, VILLAGER } from '../../data';
import { helpWanted, type HelpRequest } from '../../systems/HelpWanted';
import { game } from '../../systems/Game';
import { audio, haptics } from '../../systems/Audio';
import './woods.css';

/** The Help Wanted board: three villager requests a day. */
export function openHelpWanted(): void {
  if (!helpWanted.unlocked) { ui.feedback.toast('Help Wanted', 'The board opens at level 6.', 'memo'); return; }
  const p = new Panel({ title: 'Help Wanted', icon: 'memo', color: 'pink', size: 'medium', wallet: true });
  const render = () => {
    clear(p.body);
    p.body.append(h('div', { class: 'muted', style: 'margin-bottom:8px' }, 'Three neighbours need a hand every day. New requests arrive tomorrow.'));
    const list = helpWanted.requests();
    if (!list.length) p.body.append(h('div', { class: 'center muted', style: 'padding:20px' }, 'Nothing is wanted today.'));
    for (const r of list) p.body.append(card(r));
  };
  const card = (r: HelpRequest): HTMLElement => {
    const v = VILLAGER[r.who], have = helpWanted.have(r), can = helpWanted.canFill(r);
    return h('div', { class: `card hw-card ${r.done ? 'done' : ''}` },
      icon(v.icon, 'ex-face'),
      h('div', { class: 'grow' },
        h('div', { class: 'card-title' }, `${v.name} would love ${r.star ? 'a gold-star ' : ''}${r.n > 1 ? `${r.n} x ` : ''}${ITEMS[r.item].name}`),
        h('div', { class: 'muted' }, r.done ? 'Done. Thank you!' : `You have ${have}. Reward: ${fmt(r.coins)} coins${r.gems ? `, ${r.gems} gem` : ''} and friendship.`)),
      itemIcon(r.item, 'ex-face'),
      r.done ? icon('check') : h('button', { class: `btn small ${can ? 'yellow' : 'disabled'}`, type: 'button', onclick: () => give(r) }, can ? 'Give' : 'Not yet'));
  };
  const give = (r: HelpRequest) => {
    if (!helpWanted.canFill(r)) { ui.feedback.toast('Not enough yet', `You need ${r.n} ${r.star ? 'gold-star ' : ''}${ITEMS[r.item].name}.`, ITEMS[r.item].icon); audio.play('error'); return; }
    if (!helpWanted.fill(r.i)) return;
    audio.play('reward'); haptics.buzz(15);
    ui.feedback.toast(`${VILLAGER[r.who].name} is delighted!`, `+${fmt(r.coins)} coins`, 'sparkle_heart');
    render();
  };
  render();
  const off = game.bus.on('item', () => { if (p.overlay.isConnected) render(); });
  p.onClose = () => off();
  p.open();
}

ui.register('helpwanted', () => openHelpWanted());
