import { Panel } from '../Panel';
import { h, icon, itemIcon, button, clear } from '../dom';
import { ui } from '../UI';
import { BUILDING, ITEMS } from '../../data';
import { game } from '../../systems/Game';
import { audio } from '../../systems/Audio';
import { villageFair, RIBBON_NAME, type Ribbon } from '../../systems/VillageFair';
import { sideEntries } from '../SideBar';
import { starBadge } from '../QualityUI';

/** 1.44 the Village Fair screen: the bake-off and the best-animal show, one entry each per fair. */
export function openFair(): void {
  const p = new Panel({ title: 'The Village Fair', icon: 'medal', color: 'orange', size: 'medium', wallet: true });
  const ribbon = (r: Ribbon) => h('span', { class: `pill fair-${r}` }, icon('medal', 'icon tiny'), RIBBON_NAME[r]);
  const render = () => {
    clear(p.body);
    if (!villageFair.isFairDay()) { p.body.append(h('div', { class: 'muted center' }, 'The Village Fair comes with the Harvest Fair. See you there!')); return; }
    p.body.append(h('div', { class: 'muted', style: 'margin-bottom:8px' }, 'Hazel is judging today. One entry in each contest: every entry gets a rosette for your farm and some gems.'));
    // the bake-off
    p.body.append(h('div', { class: 'section-title' }, 'The bake-off (one gold-star good)'));
    const bake = villageFair.entered('bake');
    if (bake) p.body.append(h('div', { class: 'v-favour done' }, ribbon(bake), h('span', null, ' Entered. Well done!')));
    else {
      const list = villageFair.bakes().slice(0, 8);
      if (!list.length) p.body.append(h('div', { class: 'muted' }, 'Bring a gold-star good from your workshops to enter.'));
      for (const item of list) p.body.append(h('div', { class: 'v-token-row' }, starBadge(2), itemIcon(item, 'icon big'), h('div', { class: 'grow' }, h('b', null, ITEMS[item].name), h('div', { class: 'muted' }, `Likely: ${RIBBON_NAME[villageFair.bakeRibbon(item)]}`)),
        button('Enter', () => { const r = villageFair.enterBake(item); if (!r) { audio.play('error'); return; } audio.play('reward'); ui.feedback.toast(`${RIBBON_NAME[r]}!`, `A rosette for your farm and ${villageFair.gems(r)} gems`, 'medal'); render(); }, 'small yellow')));
    }
    // the show
    p.body.append(h('div', { class: 'section-title' }, 'The best-animal show (one animal home)'));
    const show = villageFair.entered('show');
    if (show) p.body.append(h('div', { class: 'v-favour done' }, ribbon(show), h('span', null, ' Entered. Lovely animals!')));
    else {
      const homes = villageFair.homes().slice(0, 8);
      if (!homes.length) p.body.append(h('div', { class: 'muted' }, 'You need animals to enter.'));
      for (const b of homes) p.body.append(h('div', { class: 'v-token-row' }, icon(BUILDING[b.type].icon ?? 'heart', 'icon big'), h('div', { class: 'grow' }, h('b', null, BUILDING[b.type].name), h('div', { class: 'muted' }, `${villageFair.hearts(b).toFixed(1)} hearts on average. Likely: ${RIBBON_NAME[villageFair.showRibbon(b)]}`)),
        button('Enter', () => { const r = villageFair.enterShow(b.uid); if (!r) { audio.play('error'); return; } audio.play('reward'); ui.feedback.toast(`${RIBBON_NAME[r]}!`, `A rosette for your farm and ${villageFair.gems(r)} gems`, 'medal'); render(); }, 'small yellow')));
    }
    p.body.append(h('div', { class: 'muted', style: 'margin-top:8px' }, 'Rosettes go into your storage. Pat your animals every day for more hearts.'));
  };
  render();
  p.open();
}

ui.register('fair', () => openFair());
sideEntries.push(() => (villageFair.isFairDay() && game.state.tutorial.done ? { id: 'fair', icon: 'medal', label: 'Fair', color: 'yellow', badge: !villageFair.entered('bake') || !villageFair.entered('show') } : null));
