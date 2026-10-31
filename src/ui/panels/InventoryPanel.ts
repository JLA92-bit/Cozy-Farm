import { Panel } from '../Panel';
import { h, icon, itemIcon, button, fmt, clear, priceTag, tooSoon, CONFIRM_MS } from '../dom';
import { ui } from '../UI';
import { BUILDING, ITEMS, itemSource, RECIPE, TREE, ANIMAL, WOODS, EXPEDITIONS, MINE } from '../../data';
import { game } from '../../systems/Game';
import { audio } from '../../systems/Audio';
import { QUALITY_NAME, qualityPrice, rollsQuality, type Quality } from '../../systems/Quality';
import { starBadge, starIcon } from '../QualityUI';
import { itemNeeded, itemUses } from '../../systems/ItemUses';

const CATS = [
  { id: 'all', label: 'All', icon: 'package' },
  { id: 'crop', label: 'Crops', icon: 'wheat' },
  { id: 'animal', label: 'Animal', icon: 'egg' },
  { id: 'goods', label: 'Goods', icon: 'bread' },
  { id: 'fish', label: 'Fish', icon: 'fish' },
  { id: 'finds', label: 'Finds', icon: 'mushroom' },
  { id: 'stored', label: 'Stored', icon: 'hut' },
];

/** Every item named in the woods' or the mine's data (worked out once): where a find can turn up. */
let finds: { woods: string; mine: string } | null = null;
const namedIn = (where: 'woods' | 'mine', item: string): boolean => {
  finds ??= { woods: JSON.stringify([WOODS, EXPEDITIONS]), mine: JSON.stringify(MINE) };
  return finds[where].includes(`"${item}"`);
};

export function sourceText(item: string): string {
  const s = itemSource(item);
  if (!s) return '';
  if (s.kind === 'crop') return 'Grown in fields';
  if (s.kind === 'tree') return `Picked from ${TREE[s.id].name}s`;
  if (s.kind === 'animal') return `From ${ANIMAL[s.id].name}s`;
  if (s.kind === 'recipe') return `Made at the ${BUILDING[RECIPE[s.id].building].name}`;
  if (s.kind === 'fish') return 'Caught at the dock';
  if (['forage', 'mineral', 'fossil', 'artifact'].includes(ITEMS[item]?.cat ?? '')) {
    const inMine = namedIn('mine', item), inWoods = namedIn('woods', item);
    if (inMine && inWoods) return 'Found in the Wild Woods and the Old Mine';
    if (inMine) return 'Found in the Old Mine';
    return 'Found in the Wild Woods';
  }
  // 1.8 daily finds turn up on the farm too
  return ['seashell', 'petal', 'acorn'].includes(item) ? 'Found on your farm and during events' : 'Found during events';
}

const EMPTY: Record<string, string> = {
  all: 'Your barn is empty. Grow some crops!',
  crop: 'No crops yet. Plant seeds in your fields!',
  animal: 'No animal goods yet. Feed your animals!',
  goods: 'No goods yet. Make some in your workshops!',
  fish: 'No fish yet. Try fishing at the dock!',
  finds: 'Nothing found yet. Row over to the Wild Woods or the Old Mine!',
};

const inCat = (id: string, t: string): boolean => {
  const c = ITEMS[id]?.cat;
  return t === 'all' || c === t || (t === 'crop' && c === 'fruit') || (t === 'goods' && c === 'feed') || (t === 'fish' && (id === 'bait' || id === 'lucky_bait')) || (t === 'finds' && ['forage', 'mineral', 'fossil', 'artifact'].includes(c ?? ''));
};

type SortId = 'value' | 'count' | 'name' | 'needed';
const SORTS: { id: SortId; label: string }[] = [
  { id: 'value', label: 'Value' }, { id: 'count', label: 'Most' }, { id: 'name', label: 'A-Z' }, { id: 'needed', label: 'Needed' },
];
const SORT_KEY = 'cozy-acres-barn-sort';
const readSort = (): SortId => { try { const v = localStorage.getItem(SORT_KEY); return SORTS.some((x) => x.id === v) ? v as SortId : 'value'; } catch { return 'value'; } };

/** 1.34.3 Keep for later: starred items are never sold by Sell extras, and Sell asks twice. */
export const kept = (item: string): boolean => !!game.state.keep?.includes(item);
function toggleKeep(item: string): void {
  const k = (game.state.keep ??= []);
  const i = k.indexOf(item);
  if (i >= 0) k.splice(i, 1); else k.push(item);
}

export function openInventory(tab = 'all'): void {
  const p = new Panel({ title: 'Barn', icon: 'hut', tabs: CATS, color: 'blue', wallet: true });
  let selected: string | null = null;
  let query = '';
  let sort: SortId = readSort();
  let cur = tab;
  // the search box stays in the page while typing, only the list below redraws (the phone keyboard stays up)
  const search = h('input', { type: 'search', class: 'barn-search', placeholder: 'Find an item', 'aria-label': 'Find an item', oninput: (e: Event) => { query = (e.target as HTMLInputElement).value.trim().toLowerCase(); render(cur); } }) as HTMLInputElement;
  const sortSeg = h('div', { class: 'segmented barn-sort', role: 'group', 'aria-label': 'Sort' });
  const drawSort = () => sortSeg.replaceChildren(...SORTS.map((o) => h('button', { class: sort === o.id ? 'active' : '', 'aria-pressed': String(sort === o.id), onclick: () => { sort = o.id; try { localStorage.setItem(SORT_KEY, sort); } catch { /* private mode */ } drawSort(); render(cur); } }, o.label)));
  drawSort();
  const head = h('div', { class: 'barn-head' }, search, sortSeg);
  const content = h('div');
  const render = (t: string) => {
    cur = t;
    clear(p.footer);
    p.footer.style.display = 'none';
    if (t === 'stored') { head.remove(); clear(content); if (!content.isConnected) p.body.append(content); renderStored(content); return; }
    if (!head.isConnected) p.body.prepend(head);
    if (!content.isConnected) p.body.append(content);
    clear(content);
    const needed = new Map<string, number>();
    const need = (id: string): number => { if (!needed.has(id)) needed.set(id, itemNeeded(id)); return needed.get(id)!; };
    const ids = Object.entries(game.state.inventory)
      .filter(([id, n]) => n > 0 && ITEMS[id] && inCat(id, t) && (!query || ITEMS[id].name.toLowerCase().includes(query)))
      .map(([id]) => id)
      .sort((a, b) => {
        const byName = ITEMS[a].name.localeCompare(ITEMS[b].name);
        if (sort === 'name') return byName;
        if (sort === 'count') return game.count(b) - game.count(a) || byName;
        if (sort === 'needed') return need(b) - need(a) || byName;
        return ITEMS[a].sell - ITEMS[b].sell || byName;
      });
    // 1.8: silver and gold get their own tile right after the normal one
    const items: { id: string; q: Quality; n: number; key: string }[] = [];
    for (const id of ids) game.qualityCounts(id).forEach((n, q) => { if (n > 0) items.push({ id, q: q as Quality, n, key: `${id}|${q}` }); });
    if (selected && !items.some((it) => it.key === selected)) selected = null;
    const total = Object.values(game.state.inventory).reduce((s, n) => s + n, 0);
    const worth = Object.keys(game.state.inventory).reduce((s, id) => s + (ITEMS[id] ? game.qualityCounts(id).reduce((v, n, q) => v + (n > 0 ? qualityPrice(id, q as Quality, n) : 0), 0) : 0), 0);
    const extras = sellExtrasPlan(ids);
    content.append(h('div', { class: 'barn-summary' },
      h('span', { class: 'pill' }, icon('package'), `${fmt(total)} items`),
      worth ? h('span', { class: 'pill' }, 'Worth ', icon('coin'), fmt(worth)) : null,
      extras.coins > 0 ? sellExtrasButton(extras, () => render(cur)) : h('span', { class: 'muted' }, items.length ? 'Tap an item to sell it' : ''),
    ));
    if (!items.length) content.append(h('div', { class: 'empty-state' }, icon(query ? 'magnifier' : CATS.find((c) => c.id === t)?.icon ?? 'package'), h('div', null, query ? `Nothing called "${query}" here` : EMPTY[t] ?? EMPTY.all)));
    const grid = h('div', { class: 'grid tight' });
    for (const { id, q, n, key } of items) {
      const el = h('div', { class: `card clickable item-card ${q ? `q-${q === 2 ? 'gold' : 'silver'}` : ''} ${selected === key ? 'selected' : ''}`, 'aria-label': `${q ? `${QUALITY_NAME[q]} ` : ''}${ITEMS[id].name}, ${n}` },
        q ? starBadge(q) : null, kept(id) && !q ? h('span', { class: 'keep-badge', title: 'Kept for later' }, icon('lock', 'icon tiny')) : null,
        itemIcon(id, 'card-icon'), h('div', { class: 'card-sub' }, ITEMS[id].name), h('div', { class: 'count-tag outlined' }, `x${fmt(n)}`));
      el.addEventListener('click', () => { selected = selected === key ? null : key; audio.play('select'); render(t); });
      grid.append(el);
    }
    content.append(grid);
    const sel = items.find((it) => it.key === selected);
    if (sel) sellBar(p, sel.id, sel.q, () => render(cur));
  };
  p.onTab = render;
  p.tab = tab;
  p.open();
}

/** Below this many, Sell extras leaves an ingredient or feed alone (players cook and feed from the barn). */
export const EXTRAS_RESERVE = 20;

/**
 * 1.34.3 Sell extras: normal-quality items above what anything still asks for. Kept items, stars, feed, bait,
 * fertiliser and anything the game spends itself are never sold; ingredients and feed keep a reserve too.
 */
export function sellExtrasPlan(ids: string[]): { lines: { id: string; n: number }[]; coins: number } {
  const lines: { id: string; n: number }[] = [];
  let coins = 0;
  for (const id of ids) {
    const def = ITEMS[id];
    if (!def || def.sell <= 0 || kept(id) || ['feed', 'event'].includes(def.cat ?? '') || NEVER_EXTRA.has(id)) continue;
    const have = game.qualityCounts(id)[0];
    const uses = itemUses(id);
    const reserve = uses.some((u) => u.kind === 'recipe' || u.kind === 'feed' || u.kind === 'craft' || u.kind === 'treat') ? EXTRAS_RESERVE : 0;
    const n = have - Math.max(reserve, uses.reduce((s, u) => s + (u.need ?? 0), 0));
    if (n <= 0) continue;
    lines.push({ id, n });
    coins += sellValue(id, n, 0);
  }
  return { lines, coins };
}
const NEVER_EXTRA = new Set(['bait', 'lucky_bait', 'fertiliser', 'quality_fertiliser', 'rare_seed', 'geode']);

function sellExtrasButton(plan: { lines: { id: string; n: number }[]; coins: number }, rerender: () => void): HTMLElement {
  let armedAt = 0;
  const b = button(['Sell extras', priceTag(plan.coins)], () => {
    if (!armedAt || performance.now() - armedAt > CONFIRM_MS) {
      armedAt = performance.now();
      const n = plan.lines.reduce((s, l) => s + l.n, 0);
      b.replaceChildren(`Sell ${fmt(n)}? Tap again`);
      b.classList.add('gem-armed');
      ui.feedback.toast(`Sells ${fmt(n)} items`, `Keeps what orders, projects and recipes need (${EXTRAS_RESERVE} of each ingredient). Lock an item to keep it all.`, 'coin');
      window.setTimeout(() => { if (b.isConnected && armedAt) rerender(); }, CONFIRM_MS + 50);
      return;
    }
    if (tooSoon(armedAt)) return;
    armedAt = 0;
    let coins = 0;
    for (const l of plan.lines) coins += game.sellItem(l.id, l.n, undefined, 0);
    const r = b.getBoundingClientRect();
    if (coins) ui.feedback.fly(r.left + r.width / 2, r.top, 'coin', 'coins', Math.min(20, Math.ceil(coins / 50)));
    rerender();
  }, 'small yellow');
  return b;
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
  let keepAsk = 0;
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
      rollsQuality(item) ? priceLine(item, quality) : null,
      usedFor(item))),
    h('div', { class: 'qty-stepper' }, minus, qtyEl, plus),
    all,
    ...(quality ? [] : [button([icon(kept(item) ? 'lock' : 'unlock', 'icon'), kept(item) ? 'Kept' : 'Keep'], () => { toggleKeep(item); rerender(); }, `small ${kept(item) ? 'blue' : 'grey'} keep-btn`, { 'aria-pressed': String(kept(item)), title: 'Keep for later: Sell extras leaves it alone' })]),
    button(['Sell', priceEl], () => {
      if (kept(item) && !quality && (!keepAsk || performance.now() - keepAsk > CONFIRM_MS)) { keepAsk = performance.now(); ui.feedback.toast('Kept for later', 'Tap Sell again to sell it anyway', 'lock'); return; }
      if (keepAsk && tooSoon(keepAsk)) return;
      keepAsk = 0;
      const r = p.footer.getBoundingClientRect();
      const coins = game.sellItem(item, qty, undefined, quality);
      if (coins) ui.feedback.fly(r.left + r.width / 2, r.top, 'coin', 'coins', Math.ceil(coins / 20));
      rerender();
    }, 'small yellow sell-btn'),
  );
}

/** What wants this item: a few short lines under the sell bar's name. */
function usedFor(item: string): HTMLElement | null {
  const uses = itemUses(item);
  if (!uses.length) return null;
  const shown = uses.slice(0, 4);
  return h('div', { class: 'used-for' }, h('div', { class: 'used-for-title' }, 'Used for'),
    ...shown.map((u) => h('div', { class: `used-line ${u.need ? 'need' : ''}` }, icon(u.icon, 'icon tiny'), u.text, u.need && u.kind !== 'wanted' ? h('b', null, ` (needs ${u.need})`) : null)),
    uses.length > shown.length ? h('div', { class: 'muted' }, `and ${uses.length - shown.length} more`) : null);
}

function renderStored(p: HTMLElement): void {
  const entries = Object.entries(game.state.storage).filter(([, n]) => n > 0);
  p.append(h('div', { class: 'muted', style: 'margin-bottom:8px' }, 'Buildings and decorations you put away. Tap to place one.'));
  if (!entries.length) p.append(h('div', { class: 'empty-state' }, icon('hut'), h('div', null, 'Storage is empty. In Build mode you can store decorations.')));
  const grid = h('div', { class: 'grid' });
  for (const [type, n] of entries) {
    const el = h('div', { class: 'card clickable' }, icon(`building:${type}`, 'card-icon'), h('div', { class: 'card-title' }, BUILDING[type].name), h('div', { class: 'count-tag outlined' }, `x${n}`));
    el.addEventListener('click', () => { Panel.closeAll(); void ui.interaction.startPlacement(type, true); });
    grid.append(el);
  }
  p.append(grid);
}

ui.register('inventory', (tab) => openInventory((tab as string | null) ?? undefined));
ui.onBuildingTap((b) => { if (b.type !== 'barn') return false; ui.open('inventory'); return true; });
