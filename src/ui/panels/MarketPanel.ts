import { Panel } from '../Panel';
import { h, icon, itemIcon, button, clear, priceTag, fmt } from '../dom';
import { ui } from '../UI';
import { ITEMS } from '../../data';
import { game } from '../../systems/Game';
import { audio, haptics } from '../../systems/Audio';
import { requestedCount } from '../../systems/Economy';
import { extraUnlocks } from '../../systems/Progression';
import { sideEntries } from '../SideBar';
import {
  market, MARKET, tradable, priceRange, gameValue, nextSlotLevel, practiceBuyAt, practiceMaxPrice, type MarketCat,
} from '../../online/Market';
import type { Listing } from '../../online/types';
import './market.css';

const CATS: { id: MarketCat; label: string; icon: string }[] = [
  { id: 'all', label: 'All', icon: 'bags' },
  { id: 'crop', label: 'Crops', icon: 'wheat' },
  { id: 'fruit', label: 'Fruit', icon: 'apple' },
  { id: 'animal', label: 'Animal', icon: 'egg' },
  { id: 'goods', label: 'Goods', icon: 'bread' },
  { id: 'feed', label: 'Feed', icon: 'bucket' },
];

const ago = (t: number): string => {
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const hrs = Math.floor(m / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`;
};
const unit = (l: { price: number; qty: number }) => {
  const u = l.price / Math.max(1, l.qty);
  return u >= 10 || Number.isInteger(u) ? fmt(Math.round(u)) : u.toFixed(1);
};

/** Coins arc out of a panel element into the wallet. */
function flyCoins(el: Element, coins: number): void {
  const b = el.getBoundingClientRect();
  const x = b.left + b.width / 2, y = b.top + b.height / 2;
  ui.feedback.reward(x, y - 10, 'coins', coins);
  ui.feedback.fly(x, y, 'coin', 'coins', Math.min(10, Math.max(2, Math.ceil(coins / 30))));
}
/** Goods arc out of a panel element towards the barn. */
function flyItems(el: Element, item: string, qty: number): void {
  const b = el.getBoundingClientRect();
  const ic = ITEMS[item]?.icon ?? 'package';
  ui.feedback.fly(b.left + b.width / 2, b.top + b.height / 2, ic.startsWith('model:') ? 'package' : ic, 'barn', Math.min(5, Math.max(1, qty)));
}

function practiceNote(): HTMLElement | null {
  if (!market.practice) return null;
  return h('div', { class: 'market-practice' }, icon('info', 'icon'),
    h('span', null, h('b', null, 'Practice mode - demo neighbours. '), 'Trades stay on this device, so you can try the market before real online play.'));
}

// ====================================================================== panel
export function openMarket(tab?: string): void {
  if (!market.unlocked) {
    ui.feedback.toast('Shared Market', `Opens at level ${MARKET.level}. Trade goods with your neighbours!`, 'lock');
    audio.play('error');
    return;
  }
  const p = new Panel({
    title: 'Market', icon: 'bags', color: 'green', wallet: true,
    tabs: [{ id: 'browse', label: 'Browse', icon: 'cart' }, { id: 'sell', label: 'Sell', icon: 'store' }, { id: 'mine', label: 'My listings', icon: 'receipt' }],
  });
  p.panel.classList.add('market-panel');
  let search = '';
  let cat: MarketCat = 'all';
  let selling: { item: string } | null = null;
  let confirmId = '';
  let confirmTimer = 0;
  let busy = false;
  let browseList: HTMLElement | null = null;

  const armConfirm = (id: string) => {
    confirmId = id;
    clearTimeout(confirmTimer);
    confirmTimer = window.setTimeout(() => { confirmId = ''; rerender(); }, 3000);
  };

  const tabBadge = () => {
    const t = p.tabsEl?.querySelector<HTMLElement>('[data-tab="mine"]');
    if (!t) return;
    const n = market.soldCount;
    const dot = t.querySelector('.badge-dot');
    if (!n) { dot?.remove(); return; }
    const text = n > 1 ? String(n) : '';
    if (dot) { if (dot.textContent !== text) dot.textContent = text; return; }
    t.append(h('span', { class: 'badge-dot outlined' }, text));
  };

  const status = (): HTMLElement | null => {
    if (market.failed && !market.browseList && !market.mine) {
      return h('div', { class: 'center market-empty' }, icon('cloud', 'card-icon'), h('div', { class: 'card-title' }, 'The market is quiet'),
        h('div', { class: 'muted' }, 'We could not reach the market. Check your connection and try again.'),
        button('Try again', () => void market.refresh(), 'blue small'));
    }
    return null;
  };

  // ---------------------------------------------------------------- browse
  const renderBrowse = () => {
    const searchIn = h('input', { class: 'name-input market-search', type: 'search', placeholder: 'Search goods...', value: search, 'aria-label': 'Search goods', maxlength: '24' }) as HTMLInputElement;
    searchIn.addEventListener('input', () => { search = searchIn.value; renderBrowseList(); });
    const cats = h('div', { class: 'market-cats', role: 'group', 'aria-label': 'Filter by kind' }, ...CATS.map((c) =>
      h('button', {
        class: `opt-btn ${cat === c.id ? 'selected' : ''}`, type: 'button', 'aria-pressed': String(cat === c.id),
        onclick: () => { cat = c.id; audio.play('select', { volume: 0.5 }); p.body.querySelectorAll('.market-cats .opt-btn').forEach((b, i) => { b.classList.toggle('selected', CATS[i].id === cat); b.setAttribute('aria-pressed', String(CATS[i].id === cat)); }); renderBrowseList(); },
      }, icon(c.icon), c.label)));
    browseList = h('div', { class: 'list market-list' });
    p.body.append(practiceNote() ?? '', h('div', { class: 'row market-searchrow' }, icon('magnifier', 'icon'), searchIn), cats, browseList);
    renderBrowseList();
  };

  const renderBrowseList = () => {
    if (!browseList) return;
    clear(browseList);
    const st = status();
    if (st) { browseList.append(st); return; }
    if (!market.browseList) { browseList.append(h('div', { class: 'muted center market-empty' }, 'Looking at the stalls...')); return; }
    const q = search.trim().toLowerCase();
    const list = market.browseList.filter((l) => (cat === 'all' || ITEMS[l.item]?.cat === cat) && (!q || ITEMS[l.item].name.toLowerCase().includes(q)));
    if (!list.length) {
      browseList.append(h('div', { class: 'center market-empty' }, icon('bags', 'card-icon'),
        h('div', { class: 'card-title' }, market.browseList.length ? 'Nothing matches' : 'Nothing for sale right now'),
        h('div', { class: 'muted' }, market.browseList.length ? 'Try another kind of goods or a different search.' : 'Neighbours restock often. Check back soon!')));
      return;
    }
    for (const l of list) {
      const afford = game.coins >= l.price;
      const asking = confirmId === l.id;
      const barn = gameValue(l.item, l.qty);
      const wanted = requestedCount(l.item) > 0;
      const row = h('div', { class: 'list-item market-row' });
      const buyBtn = button(asking ? ['Buy?', priceTag(l.price)] : priceTag(l.price), () => {
        if (busy) return;
        if (!afford) { ui.feedback.toast('Not enough coins', `You need ${fmt(l.price - game.coins)} more`, 'coin'); audio.play('error'); return; }
        if (!asking) { armConfirm(l.id); audio.play('select', { volume: 0.6 }); renderBrowseList(); return; }
        confirmId = '';
        void doBuy(l, row);
      }, `small market-buy ${asking ? 'yellow' : afford ? '' : 'disabled'}`, { 'aria-label': `Buy ${l.qty} ${ITEMS[l.item].name} for ${l.price} coins` });
      row.append(itemIcon(l.item, 'icon big'),
        h('div', { class: 'grow' },
          h('div', { class: 'title market-title' }, `${l.qty} x ${ITEMS[l.item].name}`,
            wanted ? h('span', { class: 'mini-tag wanted', title: 'An order or the truck wants this' }, icon('clipboard', 'icon tiny')) : null,
            l.price < barn ? h('span', { class: 'mini-tag market-deal' }, 'Deal') : null),
          h('div', { class: 'sub' }, `${unit(l)} each · ${sellerName(l)} · ${ago(l.listedAt)}`)),
        buyBtn);
      browseList.append(row);
    }
  };

  const doBuy = async (l: Listing, row: HTMLElement) => {
    busy = true;
    row.classList.add('busy');
    const r = await market.buy(l);
    busy = false;
    if (typeof r === 'string') {
      ui.feedback.toast(r === 'Someone else was quicker!' ? 'Already sold' : 'Could not buy', r === 'Someone else was quicker!' ? 'Someone else was quicker - your coins are back.' : r, 'bags', 'warn');
      audio.play('error');
    } else {
      flyItems(row, l.item, l.qty);
      audio.play('purchase');
      haptics.play('success');
      ui.feedback.toast('Bought!', `${l.qty} x ${ITEMS[l.item].name} from ${sellerName(l)} went to your barn`, ITEMS[l.item].icon.startsWith('model:') ? 'bags' : ITEMS[l.item].icon);
    }
    rerender();
  };

  // ---------------------------------------------------------------- sell
  const renderSell = () => {
    if (selling) { renderEditor(selling.item); return; }
    const used = market.openCount, slots = market.slots;
    const next = nextSlotLevel(game.level);
    p.body.append(practiceNote() ?? '', h('div', { class: 'econ-intro' }, icon('store', 'icon'),
      h('span', null, `Listings in use: ${used}/${slots}. `, next ? `More at level ${next}. ` : '', 'Goods leave your barn while they are listed.')));
    if (!market.mine && !market.failed) { p.body.append(h('div', { class: 'muted center market-empty' }, 'Opening your stall...')); return; }
    if (used >= slots) {
      p.body.append(h('div', { class: 'center market-empty' }, icon('hourglass', 'card-icon'), h('div', { class: 'card-title' }, 'All your listings are in use'),
        h('div', { class: 'muted' }, 'Wait for something to sell, or take a listing back.'), button('My listings', () => p.setTab('mine'), 'blue small')));
      return;
    }
    const items = Object.entries(game.state.inventory).filter(([id, n]) => n > 0 && tradable(id)).sort((a, b) => ITEMS[a[0]].sell - ITEMS[b[0]].sell);
    p.body.append(h('div', { class: 'section-title' }, 'Pick something to sell'));
    if (!items.length) { p.body.append(h('div', { class: 'muted center market-empty' }, 'Your barn is empty. Harvest or make some goods first!')); return; }
    const grid = h('div', { class: 'grid tight' });
    for (const [id, n] of items) {
      grid.append(h('div', { class: 'card clickable', role: 'button', 'aria-label': `Sell ${ITEMS[id].name}`, onclick: () => { selling = { item: id }; audio.play('select', { volume: 0.6 }); rerender(); } },
        itemIcon(id, 'card-icon'), h('div', { class: 'card-sub' }, ITEMS[id].name),
        requestedCount(id) > 0 ? h('span', { class: 'mini-tag wanted corner', title: 'An order or the truck wants this' }, icon('clipboard', 'icon tiny')) : null,
        h('div', { class: 'count-tag outlined' }, `x${n}`)));
    }
    p.body.append(grid);
  };

  const renderEditor = (item: string) => {
    const have = Math.min(game.count(item), MARKET.maxQty);
    if (have < 1) { selling = null; renderSell(); return; }
    let qty = Math.min(have, Math.max(1, Math.min(10, have)));
    let price = priceRange(item, qty)[2];
    const qtyEl = h('span', { class: 'outlined market-num' });
    const priceEl = h('span', { class: 'outlined market-num wide' });
    const slider = h('input', { type: 'range', class: 'market-slider', 'aria-label': 'Price' }) as HTMLInputElement;
    const eachEl = h('div', { class: 'muted center' });
    const compare = h('div', { class: 'market-compare' });
    const practice = h('div', { class: 'mini-tag market-warn', style: 'display:none' });
    const warn = h('div', { class: 'mini-tag wanted', style: 'display:none' });
    const presets = h('div', { class: 'segmented market-presets' });
    const asked = requestedCount(item);
    const upd = () => {
      const [min, max] = priceRange(item, qty);
      price = Math.max(min, Math.min(max, Math.round(price)));
      slider.min = String(min); slider.max = String(max); slider.step = '1'; slider.value = String(price);
      qtyEl.textContent = String(qty);
      priceEl.replaceChildren(icon('coin'), fmt(price));
      eachEl.textContent = `${unit({ price, qty })} coins each`;
      const g = gameValue(item, qty);
      const diff = price - g;
      compare.replaceChildren(h('span', null, 'Sells to the game for '), priceTag(g),
        h('b', { class: diff > 0 ? 'up' : diff < 0 ? 'down' : '' }, diff > 0 ? ` (+${fmt(diff)})` : diff < 0 ? ` (${fmt(diff)})` : ' (same)'));
      const pmax = practiceMaxPrice(item, qty);
      practice.style.display = market.practice && price > pmax ? '' : 'none';
      practice.textContent = `Demo neighbours only pay up to ${fmt(pmax)} coins`;
      const left = game.count(item) - qty;
      warn.style.display = asked > 0 && left < asked ? '' : 'none';
      warn.replaceChildren(icon('clipboard', 'icon tiny'), `Careful - your orders need ${asked}`);
      const [, , def, quick] = priceRange(item, qty);
      presets.querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('active', Number(b.dataset.price) === price && [quick, def, max].includes(price)));
    };
    const buildPresets = () => {
      const [, max, def, quick] = priceRange(item, qty);
      presets.replaceChildren(
        h('button', { type: 'button', dataset: { price: String(quick) }, onclick: () => { price = quick; upd(); } }, 'Quick sale'),
        h('button', { type: 'button', dataset: { price: String(def) }, onclick: () => { price = def; upd(); } }, 'Fair'),
        h('button', { type: 'button', dataset: { price: String(max) }, onclick: () => { price = max; upd(); } }, 'Top price'));
    };
    const setQty = (n: number) => {
      const ratio = price / Math.max(1, gameValue(item, qty));
      qty = Math.max(1, Math.min(have, n));
      price = gameValue(item, qty) * ratio; // keep the same price per unit
      buildPresets(); upd();
    };
    slider.addEventListener('input', () => { price = Number(slider.value); upd(); });
    const step = () => Math.max(1, Math.round(ITEMS[item].sell * qty * 0.05));
    const fee = MARKET.listingFee;
    const listBtn = button(['List for sale', fee ? priceTag(fee) : null], async () => {
      if (busy) return;
      busy = true;
      listBtn.classList.add('disabled');
      const r = await market.list(item, qty, price);
      busy = false;
      if (typeof r === 'string') { ui.feedback.toast('Could not list', r, 'bags', 'warn'); audio.play('error'); listBtn.classList.remove('disabled'); return; }
      audio.play('purchase');
      haptics.play('success');
      ui.feedback.toast('Listed!', `${qty} x ${ITEMS[item].name} for ${fmt(price)} coins. We will tell you when it sells.`, 'bags');
      selling = null;
      p.setTab('mine');
    }, 'yellow wide');
    p.body.append(h('div', { class: 'col market-editor' },
      h('div', { class: 'row between', style: 'width:100%' }, button('Back', () => { selling = null; rerender(); }, 'small grey'), h('span', { class: 'muted' }, `You have ${game.count(item)}`)),
      itemIcon(item, 'card-icon'), h('div', { class: 'card-title' }, ITEMS[item].name),
      warn,
      h('div', { class: 'row market-stepper' }, h('span', { class: 'muted market-label' }, 'Amount'),
        button('-', () => setQty(qty - 1), 'small grey', { 'aria-label': 'Less' }), qtyEl, button('+', () => setQty(qty + 1), 'small grey', { 'aria-label': 'More' }),
        button(have >= MARKET.maxQty ? `${MARKET.maxQty}` : 'All', () => setQty(have), 'small blue')),
      h('div', { class: 'row market-stepper' }, h('span', { class: 'muted market-label' }, 'Price'),
        button('-', () => { price -= step(); upd(); }, 'small grey', { 'aria-label': 'Cheaper' }), priceEl, button('+', () => { price += step(); upd(); }, 'small grey', { 'aria-label': 'Pricier' })),
      slider, presets, eachEl, compare, practice,
      fee ? h('div', { class: 'muted center' }, `Listing fee: ${fee} coins`) : null,
      listBtn));
    buildPresets();
    upd();
  };

  // ---------------------------------------------------------------- my listings
  const renderMine = () => {
    const st = status();
    if (st) { p.body.append(st); return; }
    if (!market.mine) { p.body.append(h('div', { class: 'muted center market-empty' }, 'Checking your listings...')); return; }
    const sold = market.mine.filter((l) => l.status === 'sold' && !l.collected);
    const open = market.mine.filter((l) => l.status === 'open');
    p.body.append(practiceNote() ?? '');
    if (!sold.length && !open.length) {
      p.body.append(h('div', { class: 'center market-empty' }, icon('receipt', 'card-icon'), h('div', { class: 'card-title' }, 'Nothing listed yet'),
        h('div', { class: 'muted' }, 'Put goods from your barn up for sale. Neighbours can buy them while you farm.'),
        button('Sell something', () => p.setTab('sell'), 'yellow small')));
      return;
    }
    if (sold.length) {
      const total = sold.reduce((s, l) => s + l.price, 0);
      const head = h('div', { class: 'row between section-title' }, h('span', null, 'Sold!'));
      if (sold.length > 1) {
        const all = button(['Collect all', priceTag(total)], async () => {
          if (busy) return;
          busy = true;
          let got = 0;
          for (const l of sold) { const r = await market.collect(l); if (typeof r === 'number') got += r; }
          busy = false;
          if (got) { flyCoins(all, got); audio.play('coins'); haptics.buzz(12); }
          rerender();
        }, 'yellow small');
        head.append(all);
      }
      p.body.append(head);
      const list = h('div', { class: 'list' });
      for (const l of sold) {
        const row = h('div', { class: 'list-item market-row sold' });
        const btn = button(['Collect', priceTag(l.price)], async () => {
          if (busy) return;
          busy = true;
          const r = await market.collect(l);
          busy = false;
          if (typeof r === 'string') { ui.feedback.toast('Could not collect', r, 'bags', 'warn'); audio.play('error'); }
          else { flyCoins(btn, r); audio.play('coins'); haptics.buzz(10); }
          rerender();
        }, 'yellow small market-buy');
        row.append(itemIcon(l.item, 'icon big'),
          h('div', { class: 'grow' }, h('div', { class: 'title' }, `${l.qty} x ${ITEMS[l.item]?.name ?? l.item}`),
            h('div', { class: 'sub' }, `Bought by ${l.buyer ? buyerName(l) : 'a neighbour'}${l.soldAt ? ` · ${ago(l.soldAt)}` : ''}`)),
          btn);
        list.append(row);
      }
      p.body.append(list);
    }
    if (open.length) {
      p.body.append(h('div', { class: 'section-title' }, `On sale (${open.length}/${market.slots})`));
      const list = h('div', { class: 'list' });
      for (const l of open) {
        const asking = confirmId === l.id;
        const row = h('div', { class: 'list-item market-row' });
        let hint = '';
        if (market.practice) {
          const at = practiceBuyAt(l);
          hint = at ? (game.now() >= at - 30000 ? 'A demo neighbour is looking at it' : 'A demo neighbour may buy it soon') : 'Too pricey for demo neighbours';
        }
        const cancel = h('button', {
          class: `opt-btn market-cancel ${asking ? 'confirm' : ''}`, type: 'button', title: 'Take back', 'aria-label': 'Take back',
          onclick: async (e: MouseEvent) => {
            e.stopPropagation();
            if (busy) return;
            if (!asking) { armConfirm(l.id); rerender(); return; }
            confirmId = '';
            busy = true;
            const r = await market.cancel(l);
            busy = false;
            if (r === true) { flyItems(row, l.item, l.qty); audio.play('pop'); }
            else { ui.feedback.toast('Could not take it back', r, 'bags', 'warn'); audio.play('error'); }
            rerender();
          },
        }, asking ? 'Take back?' : icon('cross'));
        row.append(itemIcon(l.item, 'icon big'),
          h('div', { class: 'grow' }, h('div', { class: 'title' }, `${l.qty} x ${ITEMS[l.item]?.name ?? l.item}`),
            h('div', { class: 'sub' }, `${unit(l)} each · listed ${ago(l.listedAt)}`),
            hint ? h('div', { class: 'sub market-hint' }, hint) : null),
          h('span', { class: 'pill' }, priceTag(l.price)), cancel);
        list.append(row);
      }
      p.body.append(list);
    }
    if (open.length < market.slots) p.body.append(h('div', { class: 'center', style: 'margin-top:12px' }, button('Sell something', () => p.setTab('sell'), 'small')));
  };

  // ---------------------------------------------------------------- wiring
  const render = () => {
    clear(p.body);
    browseList = null;
    if (p.tab === 'browse') renderBrowse();
    else if (p.tab === 'sell') renderSell();
    else renderMine();
    tabBadge();
  };
  /** Data changed: redraw without disturbing the search box or the price editor. */
  const rerender = () => {
    if (!p.overlay.isConnected) return;
    tabBadge();
    if (p.tab === 'browse' && browseList) renderBrowseList();
    else if (p.tab === 'sell' && selling) { /* keep the editor steady under the thumb */ }
    else { const top = p.body.scrollTop; render(); p.body.scrollTop = top; }
  };
  p.onTab = (id) => { if (id !== 'sell') selling = null; confirmId = ''; render(); };
  const off = market.onChange(rerender);
  const offCoins = game.bus.on('coins', () => { if (p.tab === 'browse') rerender(); });
  // refresh what is on sale while the panel is open (cheap, and only every pollSec)
  const timer = window.setInterval(() => { if (!document.hidden) void market.refresh(); }, MARKET.pollSec * 1000);
  // relative times ("5m ago") and practice hints tick along
  const tick = window.setInterval(() => { if (p.tab === 'mine' && !busy && !confirmId) rerender(); }, 20000);
  p.onClose = () => { off(); offCoins(); clearInterval(timer); clearInterval(tick); clearTimeout(confirmTimer); };
  if (tab && ['browse', 'sell', 'mine'].includes(tab)) p.tab = tab;
  else if (market.soldCount) p.tab = 'mine';
  p.open(); // opening selects the first tab, which renders
  void market.refresh();
}

function sellerName(l: Listing): string { return l.seller.name || 'A neighbour'; }
function buyerName(l: Listing): string { return l.buyer?.name || 'a neighbour'; }

// ====================================================================== hooks
ui.register('market', (arg) => openMarket(typeof arg === 'string' ? arg : undefined));

extraUnlocks.push((level) => (level === MARKET.level ? [{ kind: 'Feature', id: 'market', name: 'Shared Market', icon: 'bags', level }] : []));

sideEntries.push(() => (market.unlocked && game.state.tutorial.done ? { id: 'market', icon: 'bags', label: 'Market', color: 'green', badge: market.soldCount > 0 } : null));

// start background checks once the market is unlocked (polling is off the frame loop: timers only)
let started = false;
ui.onTick(() => {
  if (started || !market.unlocked || !game.state.tutorial.done) return;
  started = true;
  market.start();
});

market.onSold = (sold, whileAway) => {
  const coins = sold.reduce((s, l) => s + l.price, 0);
  if (sold.length === 1) {
    const l = sold[0];
    ui.feedback.toast(whileAway ? 'Sold while you were away!' : 'Market sale!', `${l.buyer?.name ?? 'A neighbour'} bought ${l.qty} x ${ITEMS[l.item]?.name ?? l.item} for ${fmt(coins)} coins. Tap to collect.`, 'bags', 'gold');
  } else {
    ui.feedback.toast(whileAway ? 'Sold while you were away!' : 'Market sales!', `${sold.length} listings sold for ${fmt(coins)} coins. Tap to collect.`, 'bags', 'gold');
  }
  const el = ui.feedback.toastStack.lastElementChild as HTMLElement | null;
  if (el) {
    el.classList.add('tappable');
    el.addEventListener('click', () => { if (!Panel.stack.some((x) => x.panel.classList.contains('market-panel'))) openMarket('mine'); }, { once: true });
  }
  audio.play('coins', { volume: 0.6 });
  haptics.play('success');
};

/** A small link for the Roadside Stall panel: "Open shared market". */
export function marketLink(close: () => void): HTMLElement | null {
  if (!market.unlocked) return null;
  return h('div', { class: 'econ-intro clickable market-link', role: 'button', onclick: () => { close(); setTimeout(() => openMarket(), 220); } },
    icon('bags', 'icon'), h('span', null, h('b', null, 'Open shared market'), ' - trade goods with neighbours'), h('span', { class: 'market-chev', 'aria-hidden': 'true' }, '›'));
}

Object.assign(window as unknown as Record<string, unknown>, { __market: market });
