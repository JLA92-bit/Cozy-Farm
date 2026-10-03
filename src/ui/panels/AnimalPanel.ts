import { Panel } from '../Panel';
import { h, icon, itemIcon, button, clear, priceTag, stableRefresh } from '../dom';
import { ui } from '../UI';
import { ANIMAL, BUILDING, ITEMS } from '../../data';
import { game } from '../../systems/Game';
import { animals } from '../../systems/Animals';
import { buildings } from '../../systems/Buildings';
import { audio, haptics } from '../../systems/Audio';
import { animalReadyAt, animalState, formatTime, isBuilt } from '../../systems/Timers';
import type { PlacedBuilding } from '../../systems/State';
import { sourceText } from './InventoryPanel';

export function openAnimalHome(b: PlacedBuilding): void {
  const def = BUILDING[b.type];
  const a = ANIMAL[def.animal!];
  const p = new Panel({ title: `${def.name} (Lv ${b.level})`, icon: def.icon, color: 'green', size: 'medium' });
  const render = () => {
    clear(p.body);
    clear(p.footer);
    const cap = buildings.capacity(b);
    const list = b.animals ?? [];
    const now = game.now();
    p.body.append(h('div', { class: 'row between', style: 'margin-bottom:8px' },
      h('div', null, h('b', null, `${list.length}/${cap} ${a.name}s`), h('div', { class: 'muted' }, `Eat ${ITEMS[a.feed].name}, give ${ITEMS[a.product].name} every ${formatTime(a.produceSec * 1000)}`)),
      h('span', { class: 'pill' }, itemIcon(a.feed), `${game.count(a.feed)}`)));
    const grid = h('div', { class: 'grid tight' });
    list.forEach((_, i) => {
      const st = animalState(b, i, now);
      const label = st === 'hungry' ? 'Hungry' : st === 'ready' ? 'Ready!' : formatTime(animalReadyAt(b, i) - now);
      grid.append(h('div', { class: `card ${st === 'ready' ? 'done' : ''}` }, icon(`model:${a.model}`, 'card-icon'), h('div', { class: 'card-sub live' }, label),
        st === 'ready' ? itemIcon(a.product) : st === 'hungry' ? itemIcon(a.feed) : null));
    });
    for (let i = list.length; i < cap; i++) {
      grid.append(h('div', { class: 'card clickable', style: 'opacity:.8', onclick: () => buy() }, h('div', { class: 'card-title', style: 'font-size:30px;margin:8px' }, '+'), h('div', { class: 'card-sub' }, 'Buy'), h('div', { class: 'pill' }, priceTag(animals.price(a.id)))));
    }
    p.body.append(grid);
    if (game.count(a.feed) === 0 && list.some((_, i) => animalState(b, i, now) === 'hungry')) {
      p.body.append(h('div', { class: 'muted center', style: 'margin-top:8px' }, `Out of ${ITEMS[a.feed].name}. ${sourceText(a.feed)}.`));
    }
    const c = animals.counts(b);
    if (c.ready) p.footer.append(button(['Collect', itemIcon(a.product)], () => { collect(b); render(); }, ''));
    if (c.hungry) p.footer.append(button(['Feed all', itemIcon(a.feed)], () => { feed(b); render(); }, game.count(a.feed) ? 'yellow' : 'disabled'));
    if (list.length < cap) p.footer.append(button(['Buy', priceTag(animals.price(a.id))], () => buy(), 'blue'));
    p.footer.append(button('Upgrade', () => { p.close(); ui.buildingPopup(b); }, 'small grey'));
  };
  const buy = () => {
    const r = animals.buy(a.id, b);
    if (!r.ok) { ui.feedback.toast(r.reason ?? 'Cannot buy', undefined, 'cross'); audio.play('error'); return; }
    ui.effects.hearts(ui.scene.farm.anchor(b.uid));
    render();
  };
  render();
  const timer = window.setInterval(() => { if (!p.overlay.isConnected) clearInterval(timer); else stableRefresh([p.body, p.footer], render); }, 1000);
  p.open();
}

function feed(b: PlacedBuilding): number {
  const n = animals.feedAll(b);
  if (n) {
    const at = ui.scene.farm.anchor(b.uid);
    ui.effects.hearts(at);
    ui.effects.leaves(at.clone().setY(0.4), '#f0c75a', 8);
    haptics.buzz(8);
  } else {
    const a = ANIMAL[BUILDING[b.type].animal!];
    ui.feedback.toast(`No ${ITEMS[a.feed].name}`, sourceText(a.feed), 'cross');
    audio.play('error');
  }
  return n;
}

function collect(b: PlacedBuilding): number {
  const at = ui.scene.farm.anchor(b.uid);
  const n = animals.collectAll(b, { x: at.x, y: at.y, z: at.z });
  if (n) {
    ui.effects.sparkle(at, '#fff6a0', 10);
    void ui.effects.pop(at.clone().setY(0.6), modelFor(ANIMAL[BUILDING[b.type].animal!].product), 0.4);
    haptics.buzz(12);
    if (ui.scene.env.night > 0.6) game.incStat('night_collects', n);
  }
  return n;
}

function modelFor(item: string): string {
  const icon = ITEMS[item].icon;
  if (icon.startsWith('model:')) return icon.slice(6);
  return ({ egg: 'food/egg', milk: 'food/carton', truffle: 'food/mushroom' } as Record<string, string>)[item] ?? 'food/bag';
}

ui.onBuildingTap((b) => {
  const def = BUILDING[b.type];
  if (def.cat !== 'animal') return false;
  if (!isBuilt(b, game.now())) { ui.buildingPopup(b); return true; }
  if (!(b.animals ?? []).length) { openAnimalHome(b); return true; }
  const c = animals.counts(b);
  if (c.ready && collect(b)) return true;
  if (c.hungry && game.count(ANIMAL[def.animal!].feed) > 0 && feed(b)) return true;
  // nothing to do: give them a pat and show the home
  animals.pet(b);
  ui.effects.hearts(ui.scene.farm.anchor(b.uid));
  openAnimalHome(b);
  return true;
});
