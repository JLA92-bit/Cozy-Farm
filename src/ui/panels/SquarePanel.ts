import { Panel } from '../Panel';
import { h, icon, itemIcon, button, clear, fmt, priceTag } from '../dom';
import { ui } from '../UI';
import { ITEMS, RESTORATION, ROOM, type BundleDef, type RoomDef } from '../../data';
import { game } from '../../systems/Game';
import { restoration } from '../../systems/Restoration';
import { isMarketDay } from '../../systems/RestorationEffects';
import { audio, haptics } from '../../systems/Audio';
import { enterSquare, refreshSquare } from '../../scenes/Square';
import { askButton } from './HelpPanel';
import { senderBadge } from './MailPanel';
import './square.css';

const PANEL_COLOR: Record<string, 'orange' | 'green' | 'blue' | 'purple' | 'pink'> = { pink: 'pink', yellow: 'orange', blue: 'blue', grey: 'purple', green: 'green' };

let current: Panel | null = null;

const nameOf = (item: string): string => (item === 'coins' ? 'Coins' : ITEMS[item]?.name ?? item);
const iconOf = (item: string): HTMLElement => (item === 'coins' ? icon('coin') : itemIcon(item));

/** One shopping list: what is wanted, what is given, buttons to give and to ask friends. */
function bundleCard(room: RoomDef, b: BundleDef, interactive: boolean, rerender: () => void): HTMLElement {
  const full = restoration.bundleDone(room.id, b.id);
  const lines = restoration.lines(room.id, b.id);
  const pct = Math.round(restoration.bundleFraction(room.id, b.id) * 100);
  const card = h('div', { class: `sq-bundle${full ? ' full' : ''}` },
    h('div', { class: 'sq-bundle-head' }, icon(b.icon),
      h('div', { class: 'grow' }, h('div', { class: 'sq-bundle-name' }, b.name),
        h('div', { class: 'sq-bundle-sub' }, full ? 'Full' : `${pct}% there${b.minStar ? `, ${b.minStar === 2 ? 'gold' : 'silver'} or better` : ''}`))),
    h('div', { class: 'progress' }, h('div', { class: 'fill', style: `width:${pct}%` }), h('div', { class: 'label' }, `${pct}%`)));
  for (const l of lines) {
    const row = h('div', { class: 'sq-line' }, iconOf(l.item),
      h('div', { class: 'grow' }, h('div', { class: 'sq-line-name' }, nameOf(l.item)), h('div', { class: 'sq-line-count' }, `${fmt(l.given)} of ${fmt(l.need)}`)));
    const actions = h('div', { class: 'sq-line-actions' });
    if (l.left <= 0) actions.append(h('span', { class: 'sq-full-tag' }, icon('check'), 'Done'));
    else if (interactive) {
      const can = restoration.canGive(room.id, b.id, l.item);
      const give = (n?: number) => {
        const k = restoration.give(room.id, b.id, l.item, n);
        if (k > 0) { haptics.play('light'); audio.play('select', { volume: 0.7 }); refreshSquare(); }
        rerender();
      };
      if (l.item === 'coins' && l.left > 1000 && can >= 1000) actions.append(button(['Give 1,000'], () => give(1000), 'small green'));
      actions.append(button([can > 0 ? `Give ${fmt(can)}` : 'Give'], () => give(), can > 0 ? 'small green' : 'small grey', can > 0 ? {} : { disabled: true }));
      if (l.item !== 'coins') {
        const have = restoration.held(room.id, b.id, l.item);
        if (have < l.left) { const ask = askButton(l.item, l.left - have, 'bundle', false); if (ask) actions.append(ask); }
      }
    }
    row.append(actions);
    card.append(row);
  }
  return card;
}

/** Rosa's stall, once the Pantry is rebuilt. */
function seedStall(rerender: () => void): HTMLElement {
  const left = restoration.seedsLeftToday(), price = RESTORATION.rewards.rareSeedPrice;
  const buy = button([icon('seedling'), priceTag(price)], () => {
    if (!ui.needCoins(price)) return;
    if (restoration.buyRareSeed()) { ui.feedback.toast('+1 Rare Seeds', 'Switch them on in the seed tray when you plant', 'seedling'); rerender(); }
  }, left > 0 ? 'small green' : 'small grey', left > 0 ? { 'aria-label': 'Buy rare seeds' } : { disabled: true });
  return h('div', { class: 'sq-stall' }, senderBadge('rosa', 44),
    h('div', { class: 'grow' }, h('div', { class: 'sq-bundle-name' }, "Rosa's seed stall"),
      h('div', { class: 'sq-bundle-sub' }, `Rare seeds: a much better chance of silver and gold. ${left} left today, ${fmt(game.count('rare_seed'))} in your barn.`)),
    buy);
}

export function openRoom(roomId: string): void {
  const room = ROOM[roomId];
  if (!room) return;
  current?.close();
  const p = new Panel({ title: room.name, icon: room.icon, color: PANEL_COLOR[room.color] ?? 'orange', size: 'large', wallet: true });
  current = p;
  const render = () => {
    clear(p.body);
    clear(p.footer);
    const fin = restoration.isDone(room.id), open = restoration.isOpen(room.id);
    p.body.append(h('div', { class: 'sq-intro' }, senderBadge(room.villager, 48), h('div', { class: 'sq-intro-text' }, room.about)));
    p.body.append(h('div', { class: `sq-reward${fin ? ' on' : ''}` }, icon(fin ? 'sparkles' : 'lock'),
      h('div', { class: 'grow' }, h('div', { class: 'sq-reward-title' }, fin ? 'Rebuilt: the village thanks you' : `When it is rebuilt: ${room.rebuilds}`), h('div', { class: 'sq-reward-text' }, room.reward.text))));
    if (fin && room.id === 'pantry') p.body.append(seedStall(render));
    if (fin && room.id === 'treasury') {
      p.body.append(h('div', { class: 'sq-reward on' }, icon('calendar'), h('div', { class: 'grow' },
        h('div', { class: 'sq-reward-title' }, isMarketDay() ? 'It is market day!' : 'Market day is every Saturday'),
        h('div', { class: 'sq-reward-text' }, 'Orders and your roadside stall pay 10% more, and the trucks always pay 15% more.'))));
    }
    if (room.soon) {
      p.body.append(h('div', { class: 'empty-state' }, icon('hourglass'), h('div', null, 'This room opens in a later update.'), h('div', { class: 'muted' }, 'Keep filling the other rooms. Your village is growing.')));
      return;
    }
    if (!open && !fin) {
      p.body.append(h('div', { class: 'empty-state' }, icon('lock'), h('div', null, `This room opens at level ${room.opensAt}.`), h('div', { class: 'muted' }, 'Here is what it will want.')));
    }
    for (const b of room.bundles) p.body.append(bundleCard(room, b, open && !fin, render));
    if (fin) p.footer.append(button([icon('check'), 'Back to the square'], () => p.close(), 'green'));
    p.footer.style.display = fin ? '' : 'none';
  };
  p.onClose = () => { if (current === p) current = null; };
  render();
  p.open();
}

ui.register('square', () => void enterSquare());
ui.register('square-room', (arg) => { const a = arg as { room?: string } | undefined; if (a?.room) openRoom(a.room); });
