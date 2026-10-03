import { Panel } from '../Panel';
import { h, append, icon, itemIcon, button, clear, priceTag, stableRefresh } from '../dom';
import { ui } from '../UI';
import { BUILDING, ITEMS, RECIPE, ANIMALS, TREES, itemSource } from '../../data';
import { game } from '../../systems/Game';
import { production } from '../../systems/Production';
import { buildings } from '../../systems/Buildings';
import { wantedItems } from '../../systems/Economy';
import { audio } from '../../systems/Audio';
import { formatTime, isBuilt, settleProduction } from '../../systems/Timers';
import type { PlacedBuilding } from '../../systems/State';
import { sourceText } from './InventoryPanel';
import './economy.css';

/** How many locked recipes to preview below the unlocked ones. */
const LOCKED_PREVIEW = 2;

/**
 * Point the player at where an item comes from. Opens the production building that makes it when
 * they own one, otherwise explains in a toast what to grow, raise or build.
 */
export function goToSource(item: string): void {
  const s = itemSource(item);
  const name = ITEMS[item]?.name ?? item;
  if (s?.kind === 'recipe') {
    const r = RECIPE[s.id];
    const def = BUILDING[r.building];
    const b = game.buildingsOf(r.building).find((x) => isBuilt(x, game.now()));
    if (b) {
      if (game.level < r.level) { ui.feedback.toast(`${name} unlocks at level ${r.level}`, `Made at the ${def.name}`, ITEMS[item].icon); return; }
      Panel.closeAll();
      openProduction(b);
      ui.feedback.toast(`Make ${name} here`, undefined, ITEMS[item].icon);
      return;
    }
    const built = game.buildingsOf(r.building).length > 0;
    ui.feedback.toast(`${name} is made at the ${def.name}`, built ? 'It is still being built' : game.level >= def.level ? 'Build one from the shop' : `Unlocks at level ${def.level}`, def.icon);
    return;
  }
  if (s?.kind === 'crop') { ui.feedback.toast(`Plant ${name} in a field`, 'Tap an empty field to sow seeds', ITEMS[item].icon); return; }
  if (s?.kind === 'animal') {
    const a = ANIMALS.find((x) => x.id === s.id)!;
    const owned = game.buildingsOf(a.house).some((b) => (b.animals?.length ?? 0) > 0);
    ui.feedback.toast(`${name} comes from ${a.name}s`, owned ? `Feed them ${ITEMS[a.feed]?.name ?? 'feed'} to collect` : `Get some ${a.name}s from the shop`, ITEMS[item].icon);
    return;
  }
  if (s?.kind === 'tree') {
    const t = TREES.find((x) => x.id === s.id)!;
    ui.feedback.toast(`${name} grows on ${t.name}s`, game.buildingsOf(t.id).length ? 'Pick them when ripe' : 'Plant one from the shop', ITEMS[item].icon);
    return;
  }
  ui.feedback.toast(name, sourceText(item) || undefined, ITEMS[item]?.icon ?? 'package');
}

/** Production building: queue slots with timers on top, recipe list below. */
export function openProduction(b: PlacedBuilding): void {
  const def = BUILDING[b.type];
  const p = new Panel({ title: `${def.name} (Lv ${b.level})`, icon: def.icon, color: 'orange' });
  const queueTitle = h('div', { class: 'section-title row between' });
  const queueEl = h('div', { class: 'prod-queue' });
  const detail = h('div', { class: 'muted center prod-detail' });
  const recipesEl = h('div', { class: 'list' });
  p.body.append(queueTitle, queueEl, detail, h('div', { class: 'section-title' }, 'Recipes'), recipesEl);
  let timer = 0;
  let lastSig = '';
  let cancelAt = -1;
  let cancelTimer = 0;

  const renderQueue = () => {
    const now = game.now();
    settleProduction(b, now);
    clear(queueEl);
    clear(queueTitle);
    const slots = buildings.slots(b);
    const q = b.queue ?? [];
    const last = q[q.length - 1];
    append(queueTitle, [h('span', null, `Queue ${q.length}/${slots}`), last ? h('span', { class: 'timer-tag outlined' }, `All done in ${formatTime(last.end - now)}`) : null]);
    // finished goods, grouped per item
    const ready = new Map<string, number>();
    for (const item of b.ready ?? []) ready.set(item, (ready.get(item) ?? 0) + 1);
    for (const [item, n] of ready) {
      queueEl.append(h('div', { class: 'card clickable done prod-slot', onclick: () => collect() }, itemIcon(item, 'icon'),
        n > 1 ? h('div', { class: 'count-tag outlined' }, `x${n}`) : null, h('div', { class: 'card-sub' }, 'Collect')));
    }
    for (let i = 0; i < slots; i++) {
      const e = q[i];
      if (!e) { queueEl.append(h('div', { class: 'card prod-slot empty' }, h('div', { class: 'card-sub' }, 'Free'))); continue; }
      const r = RECIPE[e.recipe];
      const running = e.start <= now;
      const pct = running ? Math.min(100, ((now - e.start) / (e.end - e.start)) * 100) : 0;
      // waiting jobs can be taken back (two taps) in case of a mis-tap
      const confirming = !running && cancelAt === i;
      const slot = h('div', { class: `card prod-slot ${running ? 'running' : 'clickable waiting'} ${confirming ? 'confirm' : ''}` }, itemIcon(r.item, 'icon'),
        r.out > 1 ? h('div', { class: 'count-tag outlined' }, `x${r.out}`) : null,
        confirming ? h('div', { class: 'card-sub prod-cancel' }, 'Cancel?')
          : h('div', { class: 'progress', style: 'width:100%' }, h('div', { class: 'fill', style: `width:${pct}%` }), h('div', { class: 'label' }, running ? formatTime(e.end - now) : 'Next')));
      if (!running) {
        slot.addEventListener('click', () => {
          if (!confirming) { cancelAt = i; clearTimeout(cancelTimer); cancelTimer = window.setTimeout(() => { cancelAt = -1; if (p.overlay.isConnected) renderQueue(); }, 3000); renderQueue(); return; }
          cancelAt = -1;
          if (production.cancel(b, i)) ui.feedback.toast('Job cancelled', 'Ingredients are back in your barn', ITEMS[r.item].icon);
          renderQueue();
        });
      }
      queueEl.append(slot);
    }
    const cost = production.speedupCost(b);
    const btns = h('div', { class: 'col prod-actions' });
    if (ready.size) btns.append(button('Collect all', () => collect(), 'small'));
    if (cost) btns.append(button([priceTag(0, cost), 'Finish'], () => { if (!production.speedup(b)) { ui.feedback.toast('Not enough gems', undefined, 'gem'); audio.play('error'); } renderQueue(); }, 'small purple'));
    if (btns.childElementCount) queueEl.append(btns);
    // live hint line: queue full, or building not ready yet
    if (!isBuilt(b, now)) detail.textContent = 'Still under construction.';
    else if (production.queued(b) >= slots) {
      const up = buildings.upgradeInfo(b);
      detail.textContent = up ? 'Queue is full. Upgrade for an extra slot!' : 'Queue is full.';
    } else if (detail.dataset.sticky !== '1') detail.textContent = '';
    // recipes depend on stock and queue state; re-render them only when those change
    const sig = `${q.length}|${ready.size}|${Object.entries(game.state.inventory).join(',')}|${game.state.orders.list.map((o) => o.id + ':' + (o.readyAt <= now)).join(',')}|${game.state.truck?.crates.map((c) => c.filled).join(',') ?? ''}`;
    if (sig !== lastSig) { lastSig = sig; renderRecipes(); }
  };

  const collect = () => {
    const at = ui.scene.farm.anchor(b.uid);
    production.collect(b, { x: at.x, y: at.y, z: at.z }, ui.scene.env.night > 0.6);
    renderQueue();
  };

  const renderRecipes = () => {
    clear(recipesEl);
    const wanted = wantedItems();
    const full = production.queued(b) >= buildings.slots(b);
    const all = production.recipesFor(b.type);
    const unlocked = all.filter((r) => game.level >= r.level);
    const locked = all.filter((r) => game.level < r.level);
    for (const r of [...unlocked, ...locked.slice(0, LOCKED_PREVIEW)]) {
      const isLocked = game.level < r.level;
      const ingredients = h('div', { class: 'row prod-ings' });
      for (const [item, n] of Object.entries(r.in)) {
        const have = game.count(item);
        const short = have < n && !isLocked;
        ingredients.append(h('span', {
          class: `pill ${short ? 'short clickable' : ''}`,
          title: short ? sourceText(item) : ITEMS[item].name,
          onclick: short ? (e: MouseEvent) => { e.stopPropagation(); goToSource(item); } : undefined,
        }, itemIcon(item), `${have}/${n}`, short ? icon('magnifier', 'icon tiny') : null));
      }
      const check = production.canQueue(b, r.id);
      const make = button(isLocked ? `Lv ${r.level}` : full ? 'Full' : 'Make', () => {
        if (!production.queue(b, r.id)) {
          const c = production.canQueue(b, r.id);
          if (c.reason === 'Missing ingredients') {
            const miss = Object.entries(r.in).filter(([i, n]) => game.count(i) < n).map(([i, n]) => `${n - game.count(i)} ${ITEMS[i].name} (${sourceText(i)})`);
            detail.textContent = `Need ${miss.join(', ')}. Tap a red item to find it.`;
            detail.dataset.sticky = '1';
          }
          ui.feedback.toast(c.reason ?? 'Cannot make', undefined, 'cross');
          audio.play('error');
          return;
        }
        detail.dataset.sticky = '';
        game.bus.emit('tutorial', { signal: `produce:${r.id}` });
        renderQueue();
      }, `small ${isLocked ? 'grey' : check.ok ? '' : 'disabled'}`);
      const ic = itemIcon(r.item, 'icon big');
      if (isLocked) ic.style.filter = 'brightness(0) opacity(.35)';
      const need = wanted.get(r.item) ?? 0;
      const owned = game.count(r.item);
      const tags = h('div', { class: 'row prod-tags' },
        !isLocked && owned ? h('span', { class: 'mini-tag' }, `In barn: ${owned}`) : null,
        !isLocked && need ? h('span', { class: 'mini-tag wanted' }, icon('clipboard', 'icon tiny'), `Wanted x${need}`) : null);
      recipesEl.append(h('div', { class: `list-item ${isLocked ? 'prod-locked' : ''} ${need && !isLocked ? 'prod-wanted' : ''}` },
        ic,
        h('div', { class: 'grow' },
          h('div', { class: 'title' }, `${ITEMS[r.item].name}${r.out > 1 ? ` x${r.out}` : ''}`),
          h('div', { class: 'sub' }, `${formatTime(r.sec * 1000)} · sells ${ITEMS[r.item].sell * r.out} · +${r.xp} XP`),
          tags.childElementCount ? tags : null,
          ingredients),
        make));
    }
    if (locked.length > LOCKED_PREVIEW) recipesEl.append(h('div', { class: 'muted center' }, `${locked.length - LOCKED_PREVIEW} more recipes unlock as you level up.`));
  };

  renderQueue();
  timer = window.setInterval(() => { if (!p.overlay.isConnected) { clearInterval(timer); return; } stableRefresh([queueEl, queueTitle], renderQueue); }, 1000);
  p.footer.append(
    button(['Upgrade', icon('hammer')], () => { p.close(); ui.buildingPopup(b); }, 'small yellow'),
    button('Move', () => { p.close(); void ui.interaction.startMove(b.uid, false); }, 'small blue'),
  );
  p.onClose = () => { clearInterval(timer); clearTimeout(cancelTimer); };
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
