import { Panel } from '../Panel';
import { h, icon, itemIcon, button, clear, priceTag } from '../dom';
import { ui } from '../UI';
import { BUILDING, ITEMS, RECIPE } from '../../data';
import { game } from '../../systems/Game';
import { production } from '../../systems/Production';
import { buildings } from '../../systems/Buildings';
import { audio } from '../../systems/Audio';
import { formatTime, isBuilt, settleProduction } from '../../systems/Timers';
import type { PlacedBuilding } from '../../systems/State';
import { sourceText } from './InventoryPanel';

/** Production building: recipe list on top, queue slots with timers below. */
export function openProduction(b: PlacedBuilding): void {
  const def = BUILDING[b.type];
  const p = new Panel({ title: `${def.name} (Lv ${b.level})`, icon: def.icon, color: 'orange' });
  const queueEl = h('div', { class: 'row', style: 'flex-wrap:wrap;gap:8px;margin-bottom:10px' });
  const recipesEl = h('div', { class: 'list' });
  const detail = h('div', { class: 'muted center', style: 'min-height:20px;margin:6px 0' });
  p.body.append(h('div', { class: 'section-title' }, 'Queue'), queueEl, detail, h('div', { class: 'section-title' }, 'Recipes'), recipesEl);
  let timer = 0;

  const renderQueue = () => {
    const now = game.now();
    settleProduction(b, now);
    clear(queueEl);
    const slots = buildings.slots(b);
    for (const item of b.ready ?? []) {
      queueEl.append(h('div', { class: 'card clickable done', style: 'width:72px;min-height:72px', onclick: () => collect() }, itemIcon(item, 'icon'), h('div', { class: 'card-sub' }, 'Ready!')));
    }
    const q = b.queue ?? [];
    for (let i = 0; i < slots; i++) {
      const e = q[i];
      if (!e) { queueEl.append(h('div', { class: 'card', style: 'width:72px;min-height:72px;opacity:.55' }, h('div', { class: 'card-sub', style: 'margin:auto' }, 'Empty'))); continue; }
      const r = RECIPE[e.recipe];
      const running = e.start <= now;
      const pct = running ? Math.min(100, ((now - e.start) / (e.end - e.start)) * 100) : 0;
      queueEl.append(h('div', { class: 'card', style: 'width:72px;min-height:72px' }, itemIcon(r.item, 'icon'),
        h('div', { class: 'progress', style: 'width:100%' }, h('div', { class: 'fill', style: `width:${pct}%` }), h('div', { class: 'label' }, running ? formatTime(e.end - now) : 'Waiting'))));
    }
    const cost = production.speedupCost(b);
    if (cost) queueEl.append(button([priceTag(0, cost), 'Finish'], () => { if (!production.speedup(b)) { ui.feedback.toast('Not enough gems', undefined, 'gem'); audio.play('error'); } renderQueue(); }, 'small purple'));
    if ((b.ready ?? []).length) queueEl.append(button('Collect all', () => collect(), 'small'));
  };

  const collect = () => {
    const at = ui.scene.farm.anchor(b.uid);
    production.collect(b, { x: at.x, y: at.y, z: at.z }, ui.scene.env.night > 0.6);
    renderQueue();
    renderRecipes();
  };

  const renderRecipes = () => {
    clear(recipesEl);
    for (const r of production.recipesFor(b.type)) {
      const locked = game.level < r.level;
      const ingredients = h('div', { class: 'row', style: 'flex-wrap:wrap;gap:4px' });
      for (const [item, n] of Object.entries(r.in)) {
        const have = game.count(item);
        ingredients.append(h('span', { class: 'pill', style: have < n ? 'background:#ffd6d0' : '' }, itemIcon(item), `${have}/${n}`));
      }
      const check = production.canQueue(b, r.id);
      const make = button(locked ? `Lv ${r.level}` : 'Make', () => {
        if (!production.queue(b, r.id)) {
          const c = production.canQueue(b, r.id);
          if (c.reason === 'Missing ingredients') {
            const miss = Object.entries(r.in).filter(([i, n]) => game.count(i) < n).map(([i]) => `${ITEMS[i].name} (${sourceText(i)})`);
            detail.textContent = `Need: ${miss.join(', ')}`;
          }
          ui.feedback.toast(c.reason ?? 'Cannot make', undefined, 'cross');
          audio.play('error');
          return;
        }
        game.bus.emit('tutorial', { signal: `produce:${r.id}` });
        renderQueue();
        renderRecipes();
      }, `small ${locked ? 'grey' : check.ok ? '' : 'disabled'}`);
      const ic = itemIcon(r.item, 'icon big');
      if (locked) ic.style.filter = 'brightness(0) opacity(.35)';
      recipesEl.append(h('div', { class: 'list-item', style: locked ? 'opacity:.6' : '' },
        ic,
        h('div', { class: 'grow' },
          h('div', { class: 'title' }, `${ITEMS[r.item].name}${r.out > 1 ? ` x${r.out}` : ''}`),
          h('div', { class: 'sub' }, `${formatTime(r.sec * 1000)} · sells ${ITEMS[r.item].sell} · +${r.xp} XP`),
          ingredients),
        make));
    }
  };

  if (!isBuilt(b, game.now())) detail.textContent = 'Still under construction.';
  renderQueue();
  renderRecipes();
  timer = window.setInterval(() => { if (!p.overlay.isConnected) { clearInterval(timer); return; } renderQueue(); }, 1000);
  p.footer.append(
    button(['Upgrade', icon('hammer')], () => { p.close(); ui.buildingPopup(b); }, 'small yellow'),
    button('Move', () => { p.close(); void ui.interaction.startMove(b.uid, false); }, 'small blue'),
  );
  p.onClose = () => clearInterval(timer);
  p.open();
}

ui.onBuildingTap((b) => {
  if (BUILDING[b.type].cat !== 'production') return false;
  if (!isBuilt(b, game.now())) { ui.buildingPopup(b); return true; }
  settleProduction(b, game.now());
  if ((b.ready ?? []).length) {
    const at = ui.scene.farm.anchor(b.uid);
    production.collect(b, { x: at.x, y: at.y, z: at.z }, ui.scene.env.night > 0.6);
    ui.effects.sparkle(at, '#fff6a0', 8);
    return true;
  }
  openProduction(b);
  return true;
});
