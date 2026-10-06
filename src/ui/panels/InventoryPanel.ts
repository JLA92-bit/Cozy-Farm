import { Panel } from '../Panel';
import { h, icon, itemIcon, button, fmt, clear, priceTag } from '../dom';
import { ui } from '../UI';
import { BUILDING, ITEMS, itemSource, RECIPE, TREE, ANIMAL } from '../../data';
import { game } from '../../systems/Game';
import { audio } from '../../systems/Audio';
import { QUALITY_NAME, qualityPrice, rollsQuality, type Quality } from '../../systems/Quality';
import { starBadge, starIcon } from '../QualityUI';

const CATS = [
  { id: 'all', label: 'All', icon: 'package' },
  { id: 'crop', label: 'Crops', icon: 'wheat' },
  { id: 'animal', label: 'Animal', icon: 'egg' },
  { id: 'goods', label: 'Goods', icon: 'bread' },
  { id: 'fish', label: 'Fish', icon: 'fish' },
  { id: 'stored', label: 'Stored', icon: 'hut' },
];

export function sourceText(item: string): string {
  const s = itemSource(item);
  if (!s) return '';
  if (s.kind === 'crop') return 'Grown in fields';
  if (s.kind === 'tree') return `Picked from ${TREE[s.id].name}s`;
  if (s.kind === 'animal') return `From ${ANIMAL[s.id].name}s`;
  if (s.kind === 'recipe') return `Made at the ${BUILDING[RECIPE[s.id].building].name}`;
  if (s.kind === 'fish') return 'Caught at the dock';
  return 'Found during events';
}

const EMPTY: Record<string, string> = {
  all: 'Your barn is empty. Grow some crops!',
  crop: 'No crops yet. Plant seeds in your fields!',
  animal: 'No animal goods yet. Feed your animals!',
  goods: 'No goods yet. Make some in your workshops!',
  fish: 'No fish yet. Try fishing at the dock!',
};

const inCat = (id: string, t: string): boolean => {
  const c = ITEMS[id]?.cat;
  return t === 'all' || c === t || (t === 'crop' && c === 'fruit') || (t === 'goods' && c === 'feed') || (t === 'fish' && id === 'bait');
};

export function openInventory(tab = 'all'): void {
  const p = new Panel({ title: 'Barn', icon: 'hut', tabs: CATS, color: 'blue', wallet: true });
  let selected: string | null = null;
  const render = (t: string) => {
    clear(p.body);
    clear(p.footer);
    p.footer.style.display = 'none';
    if (t === 'stored') { renderStored(p); return; }
    const ids = Object.entries(game.state.inventory)
      .filter(([id, n]) => n > 0 && ITEMS[id] && inCat(id, t))
      .map(([id]) => id)
      .sort((a, b) => ITEMS[a].sell - ITEMS[b].sell || ITEMS[a].name.localeCompare(ITEMS[b].name));
    // 1.8: silver and gold get their own tile right after the normal one
    const items: { id: string; q: Quality; n: number; key: string }[] = [];
    for (const id of ids) game.qualityCounts(id).forEach((n, q) => { if (n > 0) items.push({ id, q: q as Quality, n, key: `${id}|${q}` }); });
    if (selected && !items.some((it) => it.key === selected)) selected = null;
    const total = Object.values(game.state.inventory).reduce((s, n) => s + n, 0);
    const worth = Object.keys(game.state.inventory).reduce((s, id) => s + (ITEMS[id] ? game.qualityCounts(id).reduce((v, n, q) => v + (n > 0 ? qualityPrice(id, q as Quality, n) : 0), 0) : 0), 0);
    p.body.append(h('div', { class: 'barn-summary' },
      h('span', { class: 'pill' }, icon('package'), `${fmt(total)} items`),
      worth ? h('span', { class: 'pill' }, 'Worth ', icon('coin'), fmt(worth)) : null,
      h('span', { class: 'muted' }, items.length ? 'Tap an item to sell it' : ''),
    ));
    if (!items.length) p.body.append(h('div', { class: 'empty-state' }, icon(CATS.find((c) => c.id === t)?.icon ?? 'package'), h('div', null, EMPTY[t] ?? EMPTY.all)));
    const grid = h('div', { class: 'grid tight' });
    for (const { id, q, n, key } of items) {
      const el = h('div', { class: `card clickable item-card ${q ? `q-${q === 2 ? 'gold' : 'silver'}` : ''} ${selected === key ? 'selected' : ''}`, 'aria-label': `${q ? `${QUALITY_NAME[q]} ` : ''}${ITEMS[id].name}, ${n}` },
        q ? starBadge(q) : null, itemIcon(id, 'card-icon'), h('div', { class: 'card-sub' }, ITEMS[id].name), h('div', { class: 'count-tag outlined' }, `x${fmt(n)}`));
      el.addEventListener('click', () => { selected = selected === key ? null : key; audio.play('select'); render(t); });
      grid.append(el);
    }
    p.body.append(grid);
    const sel = items.find((it) => it.key === selected);
    if (sel) sellBar(p, sel.id, sel.q, () => render(t));
  };
  p.onTab = render;
  p.tab = tab;
  p.open();
}

/** Press-and-hold on a +/- button keeps stepping, speeding up the longer you hold. */
function holdRepeat(b: HTMLButtonElement, step: () => void): void {
  let t = 0, held = false;
  const stop = () => { clearTimeout(t); t = 0; };
  const tick = (delay: number) => { t = window.setTimeout(() => { held = true; step(); tick(Math.max(40, delay * 0.82)); }, delay); };
  b.addEventListener('pointerdown', () => { held = false; stop(); tick(380); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
  // the click after a hold should not add one more step
  b.addEventListener('click', (e) => { if (held) { e.stopImmediatePropagation(); held = false; } }, { capture: true });
}

/** What the barn pays for n of an item at a quality (same formula as Game.sellItem). */
const sellValue = (item: string, n: number, q: Quality = 0): number => qualityPrice(item, q, n);

/** "Normal 10 · Silver 13 · Gold 15", the one being sold outlined. */
function priceLine(item: string, q: Quality): HTMLElement {
  return h('div', { class: 'q-prices' }, ...([0, 1, 2] as Quality[]).map((k) => h('span', { class: k === q ? 'on' : '' },
    k ? starIcon(k) : null, `${QUALITY_NAME[k]} `, icon('coin'), fmt(sellValue(item, 1, k)))));
}

function sellBar(p: Panel, item: string, quality: Quality, rerender: () => void): void {
  const def = ITEMS[item];
  if (def.sell <= 0) return;
  const have = () => game.qualityCounts(item)[quality];
  const max = () => Math.max(1, have());
  let qty = 1;
  const qtyEl = h('span', { class: 'qty-val outlined' }, '1');
  const priceEl = h('span');
  const minus = button('-', () => { qty = Math.max(1, qty - 1); update(); }, 'small grey qty-btn', { 'aria-label': 'One less' });
  const plus = button('+', () => { qty = Math.min(max(), qty + 1); update(); }, 'small grey qty-btn', { 'aria-label': 'One more' });
  const all = button('All', () => { qty = qty === max() ? 1 : max(); update(); }, 'small blue');
  const update = () => {
    qtyEl.textContent = String(qty);
    priceEl.replaceChildren(priceTag(sellValue(item, qty, quality)));
    minus.classList.toggle('disabled', qty <= 1);
    plus.classList.toggle('disabled', qty >= max());
    all.textContent = qty === max() && max() > 1 ? 'One' : 'All';
  };
  holdRepeat(minus, () => { qty = Math.max(1, qty - 1); update(); });
  holdRepeat(plus, () => { qty = Math.min(max(), qty + 1); update(); });
  update();
  p.footer.style.display = '';
  p.footer.append(
    h('div', { class: 'sell-info' }, itemIcon(item, 'icon big'), h('div', { class: 'grow' },
      h('div', { class: 'title' }, def.name, quality ? starBadge(quality) : null, h('span', { class: 'muted' }, `  x${fmt(have())}`)),
      h('div', { class: 'muted' }, `${sourceText(item)}${sourceText(item) ? ' · ' : ''}`, icon('coin'), `${fmt(sellValue(item, 1, quality))} each`),
      rollsQuality(item) ? priceLine(item, quality) : null)),
    h('div', { class: 'qty-stepper' }, minus, qtyEl, plus),
    all,
    button(['Sell', priceEl], () => {
      const r = p.footer.getBoundingClientRect();
      const coins = game.sellItem(item, qty, undefined, quality);
      if (coins) ui.feedback.fly(r.left + r.width / 2, r.top, 'coin', 'coins', Math.ceil(coins / 20));
      rerender();
    }, 'small yellow sell-btn'),
  );
}

function renderStored(p: Panel): void {
  const entries = Object.entries(game.state.storage).filter(([, n]) => n > 0);
  p.body.append(h('div', { class: 'muted', style: 'margin-bottom:8px' }, 'Buildings and decorations you put away. Tap to place one.'));
  if (!entries.length) p.body.append(h('div', { class: 'empty-state' }, icon('hut'), h('div', null, 'Storage is empty. In Build mode you can store decorations.')));
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
