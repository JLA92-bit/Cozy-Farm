import { Panel } from '../Panel';
import { h, append, itemIcon, clear, priceTag, fmt, stableRefresh } from '../dom';
import { ui } from '../UI';
import { ITEMS } from '../../data';
import { game } from '../../systems/Game';
import { fishstall, type FishOffer } from '../../systems/FishStall';
import { formatTime } from '../../systems/Timers';
import { requestedCount } from '../../systems/Economy';
import { audio, haptics } from '../../systems/Audio';
import './economy.css';

const RARITY: Record<FishOffer['rarity'], string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare' };

/** Marlow Pike's fish stall: steep prices, small stock, fresh every morning. */
export function openFishStall(): void {
  const p = new Panel({ title: fishstall.shop, icon: 'fish', color: 'blue', size: 'medium', wallet: true });
  let selected = '';
  let timer = 0;
  const render = () => {
    clear(p.body);
    const offers = fishstall.offers();
    const open = fishstall.isOpen();
    p.body.append(h('div', { class: 'row between', style: 'margin-bottom:8px;gap:8px' },
      h('div', { class: 'muted' }, open
        ? `${fishstall.name} says: "Fresh off the boat. You skipped the fishing, so you pay for it. Dear? Aye, ridiculously."`
        : `${fishstall.name} has gone home for the day. He trades ${fishstall.hoursText}.`),
      h('span', { class: 'timer-tag outlined' }, open ? `New catch in ${formatTime(fishstall.restockIn())}` : `Opens in ${formatTime(fishstall.opensIn())}`)));
    if (!offers.length) { p.body.append(h('div', { class: 'center muted', style: 'padding:20px' }, 'Nothing on the slab today. Come back tomorrow.')); return; }
    const grid = h('div', { class: 'grid' });
    for (const o of offers) {
      const closed = !open;
      const sold = o.left <= 0;
      const afford = game.coins >= o.price;
      const sel = selected === o.id && !sold && !closed;
      const card = h('div', { class: `card merchant-offer ${sold || closed ? 'done' : 'clickable'} ${sel ? 'selected' : ''}` });
      card.addEventListener('click', () => {
        if (sold || closed) return;
        if (!sel) { selected = o.id; audio.play('select'); render(); return; }
        buy(o);
      });
      append(card, [
        itemIcon(o.id, 'card-icon'), h('div', { class: 'card-title' }, ITEMS[o.id].name),
        h('div', { class: 'card-sub' }, sold ? 'Sold out' : closed ? `${RARITY[o.rarity]} - closed` : `${RARITY[o.rarity]} - ${o.left} left`),
        requestedCount(o.id) ? h('div', { class: 'card-sub' }, 'Your orders want these!') : null,
        sold ? h('div', { class: 'pill enough' }, 'Sold out') : closed ? h('div', { class: 'pill short' }, priceTag(o.price)) : h('div', { class: `pill ${afford ? '' : 'short'}` }, priceTag(o.price)),
        sel ? h('div', { class: `btn small ${afford ? 'yellow' : 'disabled'}`, style: 'pointer-events:none' }, afford ? 'Buy' : 'Need more coins') : null]);
      grid.append(card);
    }
    p.body.append(grid);
    p.body.append(h('div', { class: 'muted center', style: 'margin-top:8px;font-size:13px' }, 'Ridiculously dear: you will always do far better fishing it yourself. Legendary fish never reach the stall.'));
  };
  const buy = (o: FishOffer) => {
    if (!fishstall.buy(o.id)) {
      ui.feedback.toast(game.coins < o.price ? 'Not enough coins' : 'Sold out', game.coins < o.price ? `You need ${fmt(o.price - game.coins)} more` : undefined, 'cross');
      audio.play('error');
      return;
    }
    ui.feedback.toast('A fine choice!', `${ITEMS[o.id].name} went to your barn`, 'fish');
    haptics.buzz(12);
    selected = '';
    render();
  };
  render();
  timer = window.setInterval(() => { if (!p.overlay.isConnected) clearInterval(timer); else stableRefresh([p.body], render); }, 1000);
  p.onClose = () => clearInterval(timer);
  p.open();
}

ui.register('fishstall', () => openFishStall());
