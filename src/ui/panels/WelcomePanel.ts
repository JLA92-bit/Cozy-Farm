import { Panel } from '../Panel';
import { h, icon, button } from '../dom';
import type { OfflineSummary } from '../../systems/Offline';
import { formatTime } from '../../systems/Timers';
import { game } from '../../systems/Game';

/** "Welcome back!" summary of what happened while the game was closed. */
export function openWelcome(s: OfflineSummary, onClose?: () => void): void {
  const p = new Panel({ title: 'Welcome back!', size: 'small', color: 'green', icon: 'sunrise' });
  p.body.append(h('div', { class: 'center', style: 'margin-bottom:10px' }, `You were away for ${formatTime(s.awayMs)}, ${game.state.player.name}. The farm kept busy:`));
  const list = h('div', { class: 'list' });
  const row = (ic: string, text: string) => list.append(h('div', { class: 'list-item' }, icon(ic, 'icon big'), h('div', { class: 'grow title' }, text)));
  if (s.crops) row('wheat', `${s.crops} field${s.crops > 1 ? 's' : ''} ready to harvest`);
  if (s.trees) row('apple', `${s.trees} tree${s.trees > 1 ? 's' : ''} full of fruit`);
  if (s.animals) row('egg', `${s.animals} animal product${s.animals > 1 ? 's' : ''} waiting`);
  if (s.goods) row('bread', `${s.goods} finished good${s.goods > 1 ? 's' : ''} to collect`);
  for (const b of s.built) row('construction', `${b} finished building`);
  if (s.stallSold.length) row('store', `${s.stallSold.length} stall sale${s.stallSold.length > 1 ? 's' : ''} (${s.stallSold.reduce((a, b) => a + b.coins, 0)} coins to collect)`);
  p.body.append(list);
  p.footer.append(button("Let's go!", () => p.close(), 'wide'));
  p.onClose = onClose;
  p.open();
}
