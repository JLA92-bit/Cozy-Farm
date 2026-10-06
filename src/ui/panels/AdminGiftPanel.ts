import { Panel } from '../Panel';
import { h, icon, itemIcon, button, fmt } from '../dom';
import { ui } from '../UI';
import { audio } from '../../systems/Audio';
import { adminGiftHooks } from '../../online/Activity';
import type { AdminGift } from '../../online/types';
import { ITEMS } from '../../data';
import './friends.css';

/** "A gift from Cozy Acres": a developer gift that has already been added to the farm. Resolves when closed. */
function showAdminGift(g: AdminGift): Promise<void> {
  return new Promise((resolve) => {
    const p = new Panel({ title: 'A gift for you!', icon: 'gift', color: 'pink', size: 'small' });
    const row = h('div', { class: 'gift-contents', style: 'justify-content:center;margin:10px 0' });
    if (g.coins) row.append(h('span', { class: 'gift-chip' }, icon('coin'), fmt(g.coins)));
    if (g.gems) row.append(h('span', { class: 'gift-chip' }, icon('gem'), fmt(g.gems)));
    for (const [k, n] of Object.entries(g.items ?? {})) if (ITEMS[k]) row.append(h('span', { class: 'gift-chip' }, itemIcon(k), `x${fmt(n)}`));
    if (g.land) row.append(h('span', { class: 'gift-chip' }, icon('map'), `${g.land} land ${g.land === 1 ? 'plot' : 'plots'}`));
    p.body.append(h('div', { class: 'center', style: 'font-size:18px' }, 'From the Cozy Acres team'));
    if (g.message) p.body.append(h('div', { class: 'gift-msg center', style: 'margin-top:8px' }, `"${g.message}"`));
    p.body.append(
      row,
      h('div', { class: 'muted center' }, g.land ? 'Everything is on your farm already. Your new land is next to your farm.' : 'Everything is on your farm already.'),
    );
    p.onClose = () => resolve();
    p.footer.append(button('Thank you!', () => p.close(), 'green'));
    p.open();
    audio.play('jingle');
    ui.feedback.toast('A gift for you!', 'From the Cozy Acres team', 'gift');
  });
}

adminGiftHooks.show = showAdminGift;
