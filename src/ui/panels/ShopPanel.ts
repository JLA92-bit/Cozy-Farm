import { Panel } from '../Panel';
import { h, icon, priceTag, fmt, clear } from '../dom';
import { ui } from '../UI';
import { BUILDINGS, type BuildingDef, ANIMALS } from '../../data';
import { game } from '../../systems/Game';
import { buildings, eventCostOf } from '../../systems/Buildings';
import { audio } from '../../systems/Audio';
import { animals } from '../../systems/Animals';
import { eventTokenItem } from '../../systems/Farming';
import { ITEMS } from '../../data';

const TABS = [
  { id: 'farm', label: 'Farm', icon: 'seedling' },
  { id: 'animal', label: 'Animals', icon: 'chicken' },
  { id: 'production', label: 'Make', icon: 'hammer_wrench' },
  { id: 'decor', label: 'Decor', icon: 'sparkles' },
  { id: 'special', label: 'Special', icon: 'store' },
];

export function openShop(tab?: string): void {
  const tabs = [...TABS];
  if (game.state.event) tabs.push({ id: 'event', label: 'Event', icon: ITEMS[eventTokenItem(game.state.event.id)]?.icon ?? 'party' });
  const p = new Panel({ title: 'Shop', icon: 'cart', tabs, color: 'green' });
  p.onTab = (id) => render(p, id);
  if (tab) p.tab = tab;
  p.open();
}

function render(p: Panel, tab: string): void {
  clear(p.body);
  if (tab === 'animal') { renderAnimals(p); return; }
  const list = BUILDINGS.filter((b) => {
    if (tab === 'event') return b.event === game.state.event?.id;
    if (b.event) return false;
    if (b.cat !== tab) return false;
    if (b.cat === 'special' && !b.max) return false;
    return true;
  }).sort((a, b) => a.level - b.level);
  const grid = h('div', { class: 'grid' });
  for (const def of list) grid.append(card(p, def));
  if (tab === 'event' && game.state.event) {
    p.body.append(h('div', { class: 'section-title' }, `You have ${game.state.event.tokens} `, icon(ITEMS[eventTokenItem(game.state.event.id)].icon)));
  }
  p.body.append(grid);
}

function card(p: Panel, def: BuildingDef): HTMLElement {
  const locked = !def.event && game.level < def.level;
  const cap = game.capFor(def);
  const used = game.capUsage(def);
  const check = buildings.canBuy(def.id);
  const stored = game.state.storage[def.id] ?? 0;
  const thumb = icon(`building:${def.id}`, 'card-icon');
  const price = def.event
    ? priceTag(0, 0, { n: eventCostOf(def), icon: ITEMS[eventTokenItem(def.event)].icon })
    : priceTag(game.priceOf(def));
  const sub: (HTMLElement | string)[] = [];
  if (locked) sub.push(`Level ${def.level}`);
  else if (cap !== Infinity) sub.push(`${used}/${cap}`);
  if (def.charm && def.cat === 'decor') sub.push(`+${def.charm} charm`);
  const el = h('div', { class: `card clickable ${locked ? 'locked' : ''}` },
    locked ? h('div', { class: 'lock-tag' }, `Lv ${def.level}`) : null,
    thumb,
    h('div', { class: 'card-title' }, def.name),
    h('div', { class: 'card-sub' }, sub.join(' · ')),
    h('div', { class: 'pill' }, price),
    stored ? h('div', { class: 'card-sub' }, `${stored} in storage`) : null,
  );
  el.addEventListener('click', () => {
    if (stored > 0) { p.close(); void ui.interaction.startPlacement(def.id, true); return; }
    if (!check.ok) { ui.feedback.toast(check.reason, def.name, locked ? 'lock' : 'cross'); audio.play('error'); return; }
    audio.play('select');
    p.close();
    void ui.interaction.startPlacement(def.id);
  });
  return el;
}

function renderAnimals(p: Panel): void {
  p.body.append(h('div', { class: 'section-title' }, 'Animal homes'));
  const grid = h('div', { class: 'grid' });
  for (const def of BUILDINGS.filter((b) => b.cat === 'animal').sort((a, b) => a.level - b.level)) grid.append(card(p, def));
  p.body.append(grid);
  p.body.append(h('div', { class: 'section-title' }, 'Animals'));
  const g2 = h('div', { class: 'grid' });
  for (const a of ANIMALS) {
    const locked = game.level < a.level;
    const cost = animals.price(a.id);
    const home = animals.homeWithSpace(a.id);
    const el = h('div', { class: `card clickable ${locked ? 'locked' : ''}` },
      locked ? h('div', { class: 'lock-tag' }, `Lv ${a.level}`) : null,
      icon(`model:${a.model}`, 'card-icon'),
      h('div', { class: 'card-title' }, a.name),
      h('div', { class: 'card-sub' }, locked ? `Level ${a.level}` : home ? `Gives ${ITEMS[a.product].name}` : `Needs a ${BUILDINGS.find((b) => b.id === a.house)?.name}`),
      h('div', { class: 'pill' }, priceTag(cost)),
    );
    el.addEventListener('click', () => {
      if (locked) { ui.feedback.toast(`${a.name} unlocks at level ${a.level}`, undefined, 'lock'); audio.play('error'); return; }
      const r = animals.buy(a.id);
      if (!r.ok) { ui.feedback.toast(r.reason ?? 'Cannot buy', undefined, 'cross'); audio.play('error'); return; }
      p.close();
      ui.scene.rig.focus(ui.scene.farm.anchor(r.home!.uid).x, ui.scene.farm.anchor(r.home!.uid).z);
    });
    g2.append(el);
  }
  p.body.append(g2);
  p.body.append(h('div', { class: 'muted center', style: 'margin-top:10px' }, `Coins: ${fmt(game.coins)}`));
}

ui.register('shop', (tab) => openShop(tab as string | undefined));
