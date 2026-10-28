import { Panel } from '../Panel';
import { h, icon, itemIcon, button, clear, priceTag, stableRefresh, tooSoon } from '../dom';
import { ui } from '../UI';
import { FISH, FISHING, ITEMS } from '../../data';
import { game } from '../../systems/Game';
import { fishing, RARITY_LABEL } from '../../systems/Fishing';
import { fishNet } from '../../systems/FishNet';
import { formatTime } from '../../systems/Timers';
import { requestedCount } from '../../systems/Economy';
import { audio, haptics } from '../../systems/Audio';
import './economy.css';

/**
 * 1.34 The fishing net (systems/FishNet.ts): set it with bait, watch it fill, then pick which fish to keep.
 * Picking starts from the net's own suggestion (what orders need, then the most valuable).
 */
export function openFishNet(): void {
  const NET = FISHING.net;
  const p = new Panel({ title: 'Fishing Net', icon: 'fish_net', color: 'blue', size: 'medium' });
  let timer = 0;
  /** the haul being picked through (indexes into the net), or null while it soaks */
  let picking: Set<number> | null = null;
  /** each step puts a new button where the last one was: a phone's late double click must not press it too */
  let actedAt = 0;
  const act = (fn: () => void) => () => { if (tooSoon(actedAt)) return; actedAt = performance.now(); fn(); };

  const tierLine = (): HTMLElement => {
    const t = fishNet.tier(), next = fishNet.nextTier();
    return h('div', { class: 'muted center', style: 'margin-top:8px;font-size:13px' },
      `${t.name}: holds ${t.holds}, keep ${t.keep}, full in ${t.hours} hours.${next && !fishNet.set ? ` Fishing skill ${next.skill}: ${next.name} (holds ${next.holds}, keep ${next.keep}).` : ''}`);
  };

  const render = () => {
    clear(p.body);
    clear(p.footer);
    if (!fishNet.unlocked) {
      p.body.append(h('div', { class: 'center', style: 'padding:16px' }, icon('fish_net', 'card-icon'),
        h('p', null, `Reach Fishing skill ${NET.tiers[0].skill} to set a net at the dock. Fish swim in while you do other things, and you pick which to keep.`)));
      p.footer.append(button('OK', () => p.close(), 'green'));
      return;
    }
    const s = fishNet.set;
    if (!s) return renderIdle();
    if (picking) return renderPick();
    renderSoak();
  };

  const renderIdle = () => {
    const why = fishNet.cannotSet();
    p.body.append(h('div', { class: 'econ-intro' }, icon('fish_net', 'icon'),
      h('span', null, `Set the net with ${NET.bait} bait. Fish you have caught before swim in one at a time, and it is full after ${fishNet.tier().hours} hours. Haul it any time and keep the best ${fishNet.tier().keep}.`)));
    p.body.append(h('div', { class: 'row center', style: 'gap:8px;margin-top:10px' },
      h('span', { class: 'pill' }, icon('worm'), `${fishing.bait} bait`)));
    p.body.append(tierLine());
    const set = button([icon('fish_net'), `Set the net (${NET.bait} bait)`], act(() => {
      if (!fishNet.setNet()) { ui.feedback.toast('Not set', fishNet.cannotSet() ?? undefined, 'cross'); audio.play('error'); return; }
      ui.feedback.toast('The net is out', `Full in ${fishNet.tier().hours} hours. Come back any time.`, 'fish_net');
      haptics.buzz(12);
      render();
    }), why ? 'green disabled' : 'green');
    if (why) p.body.append(h('div', { class: 'muted center', style: 'margin-top:6px' }, why));
    if (fishing.bait < NET.bait) {
      p.footer.append(button([icon('worm'), `Buy ${FISHING.baitShop.qty} bait`, priceTag(FISHING.baitShop.coins)], () => {
        if (!fishing.buyBait()) { ui.feedback.toast('Not enough coins', undefined, 'cross'); audio.play('error'); return; }
        render();
      }, 'yellow'));
    }
    p.footer.append(set);
  };

  const fishCard = (id: string, sel: boolean | null, onTap?: () => void): HTMLElement => {
    const want = requestedCount(id) > game.count(id);
    const card = h('div', { class: `card ${onTap ? 'clickable' : ''} ${sel ? 'selected' : ''}` },
      itemIcon(id, 'card-icon'), h('div', { class: 'card-title' }, ITEMS[id]?.name ?? id),
      h('div', { class: 'card-sub' }, RARITY_LABEL[FISH[id]?.rarity ?? 'common']),
      want ? h('div', { class: 'card-sub' }, 'Your orders want this!') : null,
      h('div', { class: 'pill' }, priceTag(ITEMS[id]?.sell ?? 0)));
    if (onTap) card.addEventListener('click', onTap);
    return card;
  };

  const renderSoak = () => {
    const fish = fishNet.inNet(), t = fishNet.tier(), s = fishNet.set!;
    const full = fishNet.full();
    const pct = Math.round((fish.length / s.fish.length) * 100);
    p.body.append(h('div', { class: 'row between', style: 'gap:8px;margin-bottom:8px' },
      h('div', { class: 'title' }, `${fish.length} of ${s.fish.length} fish`),
      h('span', { class: 'timer-tag outlined' }, full ? 'Full!' : `Full in ${formatTime(fishNet.fullIn())}`)));
    p.body.append(h('div', { class: 'progress', style: 'width:100%;margin-bottom:10px' }, h('div', { class: 'fill', style: `width:${pct}%` }),
      h('div', { class: 'label' }, full ? 'Full' : `Next fish in ${formatTime(fishNet.nextIn())}`)));
    if (fish.length) {
      const grid = h('div', { class: 'grid tight' });
      for (const id of fish) grid.append(fishCard(id, null));
      p.body.append(grid);
    } else p.body.append(h('div', { class: 'center muted', style: 'padding:16px' }, 'Nothing yet. The first fish swims in soon.'));
    p.body.append(h('div', { class: 'muted center', style: 'margin-top:8px;font-size:13px' }, `You keep up to ${t.keep}; the rest swim away. Net fish are plain and give no XP: the rod is still the way to rare fish and records.`));
    p.footer.append(button('Later', () => p.close(), 'grey'),
      button([icon('fish_net'), fish.length ? 'Haul it in' : 'Take it in'], act(() => {
        if (!fish.length) { fishNet.haul([]); ui.feedback.toast('Net taken in', 'The bait is gone, but the net is ready to set again.', 'fish_net'); render(); return; }
        picking = new Set(fishNet.suggested());
        audio.play('select');
        render();
      }), fish.length ? 'green' : 'blue'));
  };

  const renderPick = () => {
    const fish = fishNet.inNet(), keep = fishNet.tier().keep, sel = picking!;
    p.body.append(h('div', { class: 'econ-intro' }, icon('fish', 'icon'),
      h('span', null, `Pick up to ${keep} to keep (${sel.size} picked). The rest swim back to sea.`)));
    const grid = h('div', { class: 'grid tight' });
    fish.forEach((id, i) => grid.append(fishCard(id, sel.has(i), () => {
      if (sel.has(i)) sel.delete(i);
      else if (sel.size >= keep) { ui.feedback.toast(`Only ${keep} can be kept`, 'Tap a picked fish to put it back first', 'fish_net'); audio.play('error'); return; }
      else sel.add(i);
      audio.play('select', { volume: 0.6 });
      render();
    })));
    p.body.append(grid);
    const keepBtn = button(sel.size ? `Keep ${sel.size}` : 'Let them all go', act(() => {
      const kept = fishNet.haul([...sel]) ?? [];
      picking = null;
      haptics.buzz(12);
      if (kept.length) ui.feedback.toast(`${kept.length} fish to the barn`, kept.map((id) => ITEMS[id]?.name ?? id).join(', '), 'fish');
      else ui.feedback.toast('All swam away', undefined, 'fish_net');
      render();
    }), sel.size ? 'green' : 'blue');
    p.footer.append(button('Back', () => { picking = null; render(); }, 'grey'), keepBtn);
  };

  timer = window.setInterval(() => { if (!p.overlay.isConnected) clearInterval(timer); else if (fishNet.set && !picking) stableRefresh([p.body, p.footer], render); }, 1000);
  p.onClose = () => clearInterval(timer);
  render();
  p.open();
}

ui.register('net', () => openFishNet());
