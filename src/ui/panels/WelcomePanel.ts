import gsap from 'gsap';
import { Panel } from '../Panel';
import { h, icon, button } from '../dom';
import type { OfflineSummary } from '../../systems/Offline';
import { game } from '../../systems/Game';
import { audio } from '../../systems/Audio';
import { hints } from '../../systems/Hints';
import { ui } from '../UI';
import { mail } from '../../systems/Mail';
import { fishNet } from '../../systems/FishNet';
import { orders } from '../../systems/Economy';
import { BUILDING } from '../../data';

/** "about 3 hours" style wording, kinder than an exact timer. */
function awayText(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${Math.max(2, min)} minutes`;
  const hr = Math.round(min / 60);
  if (hr < 24) return hr === 1 ? 'about an hour' : `about ${hr} hours`;
  const d = Math.round(hr / 24);
  return d === 1 ? 'a whole day' : `${d} days`;
}

function greeting(): string {
  const hr = new Date().getHours();
  if (hr < 5) return 'Hello, night owl';
  if (hr < 12) return 'Good morning';
  if (hr < 18) return 'Good afternoon';
  return 'Good evening';
}

/** "Welcome back!" summary of what happened while the game was closed. */
export function openWelcome(s: OfflineSummary, onClose?: () => void): void {
  const p = new Panel({ title: 'Welcome back!', size: 'small', color: 'green', icon: 'sunrise' });
  p.body.append(h('div', { class: 'center welcome-intro' },
    h('div', { class: 'welcome-hello outlined' }, `${greeting()}, ${game.state.player.name}!`),
    h('div', null, `You were away for ${awayText(s.awayMs)}. The farm kept busy:`)));
  const list = h('div', { class: 'list' });
  const row = (ic: string, text: string, tag?: string, go?: () => void) => list.append(h('div', { class: 'list-item' }, icon(ic, 'icon big'), h('div', { class: 'grow title' }, text),
    go ? button(tag ?? 'Go', () => { p.close(); go(); }, 'small blue') : tag ? h('span', { class: 'pill' }, tag) : null));
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  if (s.crops) row('wheat', `${plural(s.crops, 'field')} ready to harvest`, hints.coach('swipe') ? 'Swipe!' : undefined);
  if (s.trees) row('apple', `${plural(s.trees, 'tree')} full of fruit`);
  // 1.34.3: with more than a couple of homes or workshops to visit, collecting is one button
  const collectAll = s.animals + s.goods >= 2 && game.state.tutorial.done ? () => ui.open('collect_all') : undefined;
  if (s.animals) row('egg', `${plural(s.animals, 'animal product')} waiting`, collectAll && !s.goods ? 'Collect all' : undefined, collectAll && !s.goods ? collectAll : undefined);
  if (s.goods) row('bread', `${plural(s.goods, 'finished good')} to collect`, collectAll ? 'Collect all' : undefined, collectAll);
  const now = game.now();
  const idle = game.state.buildings.filter((b) => BUILDING[b.type]?.cat === 'production' && !(b.buildEnd && b.buildEnd > now) && !(b.queue ?? []).some((q) => q.end > now)).length;
  if (idle >= 2) row('hammer', `${plural(idle, 'workshop')} with nothing cooking`, 'See', () => ui.open('workshops'));
  const deliverable = game.state.orders.list.filter((o) => orders.canComplete(o)).length;
  if (deliverable) row('clipboard', `${plural(deliverable, 'order')} you can deliver now`, 'Orders', () => ui.open('orders'));
  if (fishNet.full()) row('fish_net', 'Your fishing net is full', 'Haul', () => ui.open('net'));
  const letters = mail.unread();
  if (letters) row('mailbox', `${plural(letters, 'letter')} in the mailbox`, 'Read', () => ui.open('mail'));
  for (const b of s.built) row('construction', `${b} finished building`, hints.coach('build') ? 'Tap it!' : undefined);
  if (s.stallSold.length) row('store', `${plural(s.stallSold.length, 'stall sale')} (${s.stallSold.reduce((a, b) => a + b.coins, 0)} coins to collect)`);
  p.body.append(list);
  p.footer.append(button("Let's go!", () => p.close(), 'wide'));
  p.onClose = onClose;
  p.open();
  // rows pop in one after another, with a soft tick each
  const items = [...list.children] as HTMLElement[];
  gsap.fromTo(items, { opacity: 0, x: -24 }, {
    opacity: 1, x: 0, duration: 0.3, ease: 'back.out(2)', delay: 0.25, stagger: 0.12,
    onStart: () => audio.play('pop', { volume: 0.4 }),
  });
}
