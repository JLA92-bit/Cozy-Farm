import { Panel } from '../Panel';
import { h, icon, button, clear, fmt, priceTag, stableRefresh, append } from '../dom';
import { ui } from '../UI';
import { sideEntries } from '../SideBar';
import { BUILDING, MASTER } from '../../data';
import { game } from '../../systems/Game';
import { master, boutique } from '../../systems/Master';
import { formatTime } from '../../systems/Timers';
import { audio, haptics } from '../../systems/Audio';
import './economy.css';

/**
 * 1.14 The Master board: weekly Master Challenges and the Gem Boutique, for players from level 50. Two tabs in one panel.
 */
const TABS = [
  { id: 'challenges', label: 'Challenges', icon: 'crown' },
  { id: 'boutique', label: 'Boutique', icon: 'gem' },
];

function openMaster(arg?: unknown): void {
  const p = new Panel({ title: 'Master Board', size: 'medium', color: 'purple', icon: 'crown', tabs: TABS, wallet: true });
  if (typeof arg === 'string' && TABS.some((t) => t.id === arg)) p.tab = arg;
  let selected = '';
  let timer = 0;

  const challenges = () => {
    const week = formatTime(master.weekLeftMs());
    const r = master.rewardText();
    p.body.append(h('div', { class: 'row between', style: 'margin-bottom:8px;gap:8px' },
      h('div', { class: 'muted' }, `Three goals each week. Each pays ${fmt(r.coins)} coins and ${r.gems} gems. Finish all three for a bonus and a crate.`),
      h('span', { class: 'timer-tag outlined' }, `New in ${week}`)));
    p.body.append(h('div', { class: 'row', style: 'gap:8px;margin-bottom:10px;flex-wrap:wrap' },
      h('span', { class: 'pill' }, icon('crown'), `Streak: ${master.streak} week${master.streak === 1 ? '' : 's'}`),
      h('span', { class: 'pill' }, icon('medal'), `Best: ${master.best}`),
      master.allClaimed ? h('span', { class: 'pill enough' }, icon('check'), 'All done this week!') : null));
    const list = h('div', { class: 'list' });
    for (const c of master.list()) {
      const pct = Math.round((c.progress / c.target) * 100);
      const btn = c.claimed
        ? h('span', { class: 'pill enough' }, icon('check'), 'Claimed')
        : button(c.done ? 'Claim' : 'Keep going', () => claim(c.id), c.done ? 'green small' : 'disabled small');
      list.append(h('div', { class: `list-item ${c.claimed ? 'done' : ''}` },
        icon(c.icon, 'card-icon'),
        h('div', { class: 'grow' },
          h('div', { class: 'title' }, c.text),
          h('div', { class: 'progress', style: 'margin-top:4px' }, h('div', { class: 'fill', style: `width:${pct}%` }), h('div', { class: 'label' }, `${fmt(c.progress)} / ${fmt(c.target)}`))),
        btn));
    }
    p.body.append(list);
    const next = MASTER.streaks.find((s) => s.weeks > master.streak);
    p.body.append(h('div', { class: 'muted center', style: 'margin-top:10px;font-size:13px' }, next
      ? `Streak prize: a ${BUILDING[next.id]?.name ?? 'trophy'} at ${next.weeks} weeks in a row.`
      : 'You have every streak prize. Wonderful!'));
  };

  const claim = (id: string) => {
    if (!master.claim(id)) { audio.play('error'); return; }
    haptics.buzz(12);
    ui.feedback.toast('Challenge done!', 'Coins and gems are yours', 'crown');
    render();
  };

  const shop = () => {
    p.body.append(h('div', { class: 'muted', style: 'margin-bottom:8px' }, 'Gem-only decorations. Six new things are on offer every Monday, and each can be bought once.'));
    const offers = boutique.offers();
    if (!offers.length) { p.body.append(h('div', { class: 'center muted', style: 'padding:20px' }, 'You own everything in the boutique. Lovely farm!')); return; }
    const grid = h('div', { class: 'grid' });
    for (const o of offers) {
      const def = BUILDING[o.id];
      const owned = boutique.owned(o.id);
      const afford = game.gems >= o.price;
      const sel = selected === o.id && !owned;
      const card = h('div', { class: `card merchant-offer ${owned ? 'done' : 'clickable'} ${sel ? 'selected' : ''}` });
      card.addEventListener('click', () => {
        if (owned) return;
        if (!sel) { selected = o.id; audio.play('select'); render(); return; }
        buy(o.id, o.price);
      });
      append(card, [
        icon(`building:${o.id}`, 'card-icon'), h('div', { class: 'card-title' }, def.name),
        h('div', { class: 'card-sub' }, owned ? 'Owned' : `Charm ${def.charm}`),
        owned ? h('div', { class: 'pill enough' }, 'Owned') : h('div', { class: `pill ${afford ? '' : 'short'}` }, priceTag(0, o.price)),
        sel ? h('div', { class: `btn small ${afford ? 'yellow' : 'disabled'}`, style: 'pointer-events:none' }, afford ? 'Buy' : 'Need more gems') : null]);
      grid.append(card);
    }
    p.body.append(grid);
  };

  const buy = (id: string, price: number) => {
    if (!boutique.buy(id)) {
      ui.feedback.toast('Not enough gems', `You need ${fmt(Math.max(0, price - game.gems))} more`, 'cross');
      audio.play('error');
      return;
    }
    ui.feedback.toast('A fine choice!', `${boutique.name(id)} is in your storage`, 'gem');
    haptics.buzz(12);
    selected = '';
    render();
  };

  const render = () => {
    clear(p.body);
    if (p.tab === 'boutique') shop(); else challenges();
  };
  p.onTab = () => { selected = ''; render(); };
  render();
  timer = window.setInterval(() => { if (!p.overlay.isConnected) clearInterval(timer); else stableRefresh([p.body], render); }, 1000);
  p.onClose = () => clearInterval(timer);
  p.open();
}

ui.register('master', (arg) => openMaster(arg));
sideEntries.push(() => (master.open && game.state.player.created ? { id: 'master', icon: 'crown', label: 'Master', color: 'purple', badge: master.claimable } : null));
