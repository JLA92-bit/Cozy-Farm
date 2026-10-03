import { Panel } from '../Panel';
import { h, icon, itemIcon, button, fmt, clear, priceTag } from '../dom';
import { ui } from '../UI';
import { BUILDING, ITEMS, itemSource, RECIPE, TREE, ANIMAL } from '../../data';
import { game } from '../../systems/Game';
import { audio } from '../../systems/Audio';

const CATS = [
  { id: 'all', label: 'All', icon: 'package' },
  { id: 'crop', label: 'Crops', icon: 'wheat' },
  { id: 'animal', label: 'Animal', icon: 'egg' },
  { id: 'goods', label: 'Goods', icon: 'bread' },
  { id: 'stored', label: 'Stored', icon: 'hut' },
];

export function sourceText(item: string): string {
  const s = itemSource(item);
  if (!s) return '';
  if (s.kind === 'crop') return 'Grown in fields';
  if (s.kind === 'tree') return `Picked from ${TREE[s.id].name}s`;
  if (s.kind === 'animal') return `From ${ANIMAL[s.id].name}s`;
  if (s.kind === 'recipe') return `Made at the ${BUILDING[RECIPE[s.id].building].name}`;
  return 'Found during events';
}

export function openInventory(tab = 'all'): void {
  const p = new Panel({ title: 'Barn', icon: 'hut', tabs: CATS, color: 'blue' });
  let selected: string | null = null;
  const render = (t: string) => {
    clear(p.body);
    clear(p.footer);
    p.footer.style.display = 'none';
    if (t === 'stored') { renderStored(p); return; }
    const items = Object.entries(game.state.inventory)
      .filter(([id, n]) => n > 0 && ITEMS[id] && (t === 'all' || ITEMS[id].cat === t || (t === 'crop' && ITEMS[id].cat === 'fruit') || (t === 'goods' && ITEMS[id].cat === 'feed')))
      .sort((a, b) => ITEMS[a[0]].sell - ITEMS[b[0]].sell);
    const total = Object.values(game.state.inventory).reduce((s, n) => s + n, 0);
    p.body.append(h('div', { class: 'muted', style: 'margin-bottom:8px' }, `${fmt(total)} items in your barn. Tap one to sell it.`));
    if (!items.length) p.body.append(h('div', { class: 'center muted', style: 'padding:30px' }, 'Nothing here yet. Grow some crops!'));
    const grid = h('div', { class: 'grid tight' });
    for (const [id, n] of items) {
      const el = h('div', { class: `card clickable ${selected === id ? 'selected' : ''}` }, itemIcon(id, 'card-icon'), h('div', { class: 'card-sub' }, ITEMS[id].name), h('div', { class: 'count-tag outlined' }, `x${fmt(n)}`));
      el.addEventListener('click', () => { selected = id; audio.play('select'); render(t); });
      grid.append(el);
    }
    p.body.append(grid);
    if (selected && game.count(selected) > 0) sellBar(p, selected, () => render(t));
  };
  p.onTab = render;
  p.tab = tab;
  p.open();
}

function sellBar(p: Panel, item: string, rerender: () => void): void {
  const def = ITEMS[item];
  if (def.sell <= 0) return;
  let qty = 1;
  const qtyEl = h('span', { class: 'outlined', style: 'font-size:22px;min-width:40px;text-align:center' }, '1');
  const priceEl = h('span');
  const update = () => { qtyEl.textContent = String(qty); priceEl.replaceChildren(priceTag(def.sell * qty)); };
  update();
  p.footer.style.display = '';
  p.footer.append(
    h('div', { class: 'row', style: 'flex:1 1 100%;justify-content:center' }, itemIcon(item), h('b', null, def.name), h('span', { class: 'muted' }, sourceText(item))),
    button('−', () => { qty = Math.max(1, qty - 1); update(); }, 'small grey'),
    qtyEl,
    button('+', () => { qty = Math.min(game.count(item), qty + 1); update(); }, 'small grey'),
    button('All', () => { qty = game.count(item); update(); }, 'small blue'),
    button(['Sell', priceEl], () => {
      const r = p.footer.getBoundingClientRect();
      const coins = game.sellItem(item, qty);
      if (coins) ui.feedback.fly(r.left + r.width / 2, r.top, 'coin', 'coins', Math.ceil(coins / 20));
      rerender();
    }, 'small yellow'),
  );
}

function renderStored(p: Panel): void {
  const entries = Object.entries(game.state.storage).filter(([, n]) => n > 0);
  p.body.append(h('div', { class: 'muted', style: 'margin-bottom:8px' }, 'Buildings and decorations you put away. Tap to place one.'));
  if (!entries.length) p.body.append(h('div', { class: 'center muted', style: 'padding:30px' }, 'Storage is empty. In Build mode you can store decorations.'));
  const grid = h('div', { class: 'grid' });
  for (const [type, n] of entries) {
    const el = h('div', { class: 'card clickable' }, icon(`building:${type}`, 'card-icon'), h('div', { class: 'card-title' }, BUILDING[type].name), h('div', { class: 'count-tag outlined' }, `x${n}`));
    el.addEventListener('click', () => { p.close(); void ui.interaction.startPlacement(type, true); });
    grid.append(el);
  }
  p.body.append(grid);
}

ui.register('inventory', (tab) => openInventory(tab as string | undefined));
ui.onBuildingTap((b) => { if (b.type !== 'barn') return false; ui.open('inventory'); return true; });
