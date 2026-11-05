import { Panel } from '../Panel';
import { h, icon, itemIcon, button, clear } from '../dom';
import { ui } from '../UI';
import { BUILDING, ITEMS, PARCELS, VILLAGER } from '../../data';
import { game } from '../../systems/Game';
import { audio } from '../../systems/Audio';
import { parcels } from '../../systems/Parcels';
import { sideEntries } from '../SideBar';
import { starBadge } from '../QualityUI';
import type { ParcelCard } from '../../systems/State';
import './parcels.css';

const coins = (n: number) => n.toLocaleString('en-US');

/** 1.45 Thoughtful Parcels: pick one of three cards, and pin the goal parcels should help with. */
export function openParcels(): void {
  const p = new Panel({ title: 'Parcels', icon: 'package', color: 'green', size: 'medium', wallet: true });

  const cardEl = (c: ParcelCard, i: number): HTMLElement => {
    const what = c.item ? h('div', { class: 'pc-what' }, c.star ? starBadge(c.star) : null, itemIcon(c.item, 'icon big'), h('b', null, `${c.qty} ${ITEMS[c.item].name}`))
      : c.decor ? h('div', { class: 'pc-what' }, icon(`building:${c.decor}`, 'icon big'), h('b', null, BUILDING[c.decor].name))
        : h('div', { class: 'pc-what' }, icon('coin', 'icon big'), h('b', null, `${coins(c.coins)} coins`));
    return h('div', { class: 'pc-card' }, what,
      (c.item || c.decor) && c.coins ? h('div', { class: 'pc-extra' }, icon('coin', 'icon tiny'), ` and ${coins(c.coins)} coins`) : null,
      h('div', { class: 'muted pc-why' }, c.why),
      h('div', { class: 'pc-from' }, icon(`villager:${c.from}`, 'icon tiny'), ` From ${VILLAGER[c.from]?.name ?? 'the village'}`),
      button('Choose', () => {
        const got = parcels.pick(i);
        if (!got) { audio.play('error'); return; }
        audio.play('reward');
        ui.feedback.toast('Thank you!', `From ${VILLAGER[got.from]?.name ?? 'the village'}`, 'package');
        render();
      }, 'btn green pc-pick'));
  };

  const render = () => {
    clear(p.body);
    const offer = parcels.offer();
    if (offer) {
      const more = parcels.waiting() - 1;
      p.body.append(h('div', { class: 'muted', style: 'margin-bottom:8px' }, `Choose one.${more > 0 ? ` ${more} more waiting after this.` : ''}`));
      p.body.append(h('div', { class: 'pc-cards' }, ...offer.cards.map(cardEl)));
    } else {
      p.body.append(h('div', { class: 'muted center' }, game.level >= PARCELS.level ? 'No parcels right now. You get one each time you go up a level.' : `Parcels start at level ${PARCELS.level}.`));
    }
    const goals = parcels.goals();
    p.body.append(h('div', { class: 'section-title' }, 'Pin a goal'));
    if (!goals.length) { p.body.append(h('div', { class: 'muted' }, 'Nothing is short right now.')); return; }
    p.body.append(h('div', { class: 'muted', style: 'margin-bottom:6px' }, 'Pin what you are working towards and the next parcels will offer it first.'));
    const pin = game.state.parcels?.pin;
    const sorted = [...goals.filter((g) => g.id === pin), ...goals.filter((g) => g.id !== pin)].slice(0, 12);
    for (const g of sorted) {
      const on = g.id === pin;
      p.body.append(h('div', { class: `pc-goal${on ? ' on' : ''}` }, g.item === 'coins' ? icon('coin', 'icon') : itemIcon(g.item, 'icon'),
        h('div', { class: 'grow' }, h('b', null, parcels.needName(g)), h('div', { class: 'muted' }, g.why)),
        button(on ? 'Unpin' : 'Pin', () => { parcels.togglePin(g.id); audio.play('select'); render(); }, `btn small ${on ? 'orange' : 'blue'}`)));
    }
  };
  render();
  p.open();
}

ui.register('parcels', () => openParcels());
sideEntries.push(() => (parcels.waiting() && game.state.tutorial.done ? { id: 'parcels', icon: 'package', label: 'Parcel', color: 'green', badge: true } : null));
