import gsap from 'gsap';
import { Panel } from '../Panel';
import { h, icon, button } from '../dom';
import type { OfflineSummary } from '../../systems/Offline';
import { game } from '../../systems/Game';
import { audio } from '../../systems/Audio';

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
  const row = (ic: string, text: string, tag?: string) => list.append(h('div', { class: 'list-item' }, icon(ic, 'icon big'), h('div', { class: 'grow title' }, text), tag ? h('span', { class: 'pill' }, tag) : null));
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  if (s.crops) row('wheat', `${plural(s.crops, 'field')} ready to harvest`, 'Swipe!');
  if (s.trees) row('apple', `${plural(s.trees, 'tree')} full of fruit`);
  if (s.animals) row('egg', `${plural(s.animals, 'animal product')} waiting`);
  if (s.goods) row('bread', `${plural(s.goods, 'finished good')} to collect`);
  for (const b of s.built) row('construction', `${b} finished building`, 'Tap it!');
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
