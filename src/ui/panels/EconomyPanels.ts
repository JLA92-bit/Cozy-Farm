import { Panel } from '../Panel';
import { h, append, icon, itemIcon, button, clear, priceTag, fmt, stableRefresh } from '../dom';
import { ui } from '../UI';
import { BUILDING, ITEMS, ECONOMY, FRIENDSHIP, VILLAGER } from '../../data';
import { game } from '../../systems/Game';
import { orders, truck, stall, merchant, requestedCount, orderVillager, type MerchantOffer } from '../../systems/Economy';
import type { Order } from '../../systems/State';
import { audio, haptics } from '../../systems/Audio';
import { hints } from '../../systems/Hints';
import { formatTime, isBuilt } from '../../systems/Timers';
import { addBubbleProvider } from '../Bubbles';
import { sourceText } from './InventoryPanel';
import { cosmeticUnlocked } from './CharacterPanel';
import { goToSource } from './ProductionPanel';
import type { PlacedBuilding } from '../../systems/State';
import { marketLink } from './MarketPanel';
import { askButton } from './HelpPanel';
import { hasPerk } from '../../systems/Perks';
import './economy.css';


function anchorOf(type: string) {
  const b = game.buildingsOf(type)[0];
  if (!b) return undefined;
  const a = ui.scene.farm.anchor(b.uid);
  return { x: a.x, y: a.y, z: a.z };
}

/** Floating "+N" numbers and icons that arc from a panel element into the HUD counters. */
function flyFrom(el: Element, r: { coins?: number; xp?: number; gems?: number }): void {
  const b = el.getBoundingClientRect();
  const x = b.left + b.width / 2, y = b.top + b.height / 2;
  if (r.coins) { ui.feedback.reward(x, y - 10, 'coins', r.coins); ui.feedback.fly(x, y, 'coin', 'coins', Math.ceil(r.coins / 15)); }
  if (r.xp) { ui.feedback.reward(x + 26, y - 40, 'xp', r.xp, undefined, 0.08); ui.feedback.fly(x, y, 'xp', 'xp', 1); }
  if (r.gems) { ui.feedback.reward(x - 26, y - 40, 'gems', r.gems, undefined, 0.15); ui.feedback.fly(x, y, 'gem', 'gems', r.gems); }
}

/** A "have/need" pill; when short it becomes a tap target that shows where to get the item. */
function needPill(item: string, have: number, need: number): HTMLElement {
  const ok = have >= need;
  return h('span', {
    class: `pill ${ok ? 'enough' : 'short clickable'}`,
    title: ok ? undefined : sourceText(item),
    onclick: ok ? undefined : (e: MouseEvent) => { e.stopPropagation(); goToSource(item); },
  }, `${Math.min(have, need)}/${need}`, ok ? null : icon('magnifier', 'icon tiny'));
}

// ======================================================================== orders
/** 1.8: every order is signed by a villager: their portrait and "Rosa would like..." (tap to open their page). */
function orderSigner(o: Order): HTMLElement {
  const v = VILLAGER[orderVillager(o)];
  return h('span', { class: 'row order-npc', role: 'button', 'aria-label': `${v.name}'s page`, style: 'gap:6px;min-width:0;cursor:pointer', onclick: (e: MouseEvent) => { e.stopPropagation(); ui.open('village', { villager: v.id }); } },
    h('span', { class: 'order-portrait', style: `--vc:${v.colour}` }, icon(`villager:${v.id}`, 'icon')),
    h('span', { class: 'card-sub order-signer' }, h('b', null, v.name), ' would like...'));
}

export function openOrders(): void {
  orders.refresh();
  const p = new Panel({ title: 'Order Board', icon: 'clipboard', color: 'orange' });
  // how orders work: while still learning, or once for players who skipped the tutorial
  const explain = hints.explain('orders_panel', 'orders');
  let timer = 0;
  let confirmSkip = -1;
  let skipTimer = 0;
  const render = () => {
    clear(p.body);
    const now = game.now();
    const list = game.state.orders.list;
    const readyN = list.filter((o) => orders.canComplete(o)).length;
    if (readyN || explain) p.body.append(h('div', { class: 'econ-intro' }, icon(readyN ? 'check' : 'info', 'icon'),
      h('span', null, readyN ? `${readyN} order${readyN > 1 ? 's' : ''} ready to deliver!` : 'Orders pay much more than selling at the barn. Tap a red number to see where to get it.')));
    const grid = h('div', { class: 'grid order-grid' });
    for (const o of list) {
      if (o.readyAt > now) {
        grid.append(h('div', { class: 'card order-card waiting' }, icon('hourglass', 'card-icon'), h('div', { class: 'card-sub' }, 'New order in'), h('div', { class: 'timer-tag outlined' }, formatTime(o.readyAt - now))));
        continue;
      }
      const ok = orders.canComplete(o);
      const lines = h('div', { class: 'col order-lines' });
      for (const l of o.lines) {
        const have = game.count(l.item);
        lines.append(h('div', { class: 'row between order-line' },
          h('span', { class: 'row', style: 'gap:4px;min-width:0' }, itemIcon(l.item), h('span', { class: 'card-sub order-item-name' }, ITEMS[l.item].name)),
          needPill(l.item, have, l.qty)));
        // 1.8: ask friends for what is missing
        const ask = have < l.qty ? askButton(l.item, l.qty - have, 'order') : null;
        if (ask) lines.append(h('div', { class: 'order-ask' }, ask));
      }
      const skipping = confirmSkip === o.id;
      const skipBtn = h('button', {
        class: `opt-btn order-skip ${skipping ? 'confirm' : ''}`, title: 'Skip this order',
        onclick: (e: MouseEvent) => {
          e.stopPropagation();
          if (!skipping) {
            confirmSkip = o.id;
            clearTimeout(skipTimer);
            skipTimer = window.setTimeout(() => { confirmSkip = -1; if (p.overlay.isConnected) render(); }, 3000);
            render();
            return;
          }
          confirmSkip = -1;
          orders.discard(o.id);
          audio.play('close');
          render();
        },
      }, skipping ? 'Skip?' : icon('cross'));
      const card = h('div', { class: `card order-card ${ok ? 'done' : ''}` },
        h('div', { class: 'row between', style: 'width:100%' },
          orderSigner(o),
          skipBtn),
        lines,
        h('div', { class: 'chip-row' }, h('span', { class: 'pill' }, icon('coin'), fmt(o.coins)), h('span', { class: 'pill' }, icon('xp'), `${o.xp}`), o.gems ? h('span', { class: 'pill' }, icon('gem'), `${o.gems}`) : null),
      );
      card.append(button(ok ? 'Deliver' : 'Need items', () => {
        if (!orders.complete(o.id)) {
          const miss = o.lines.find((l) => game.count(l.item) < l.qty);
          if (miss) goToSource(miss.item);
          audio.play('error');
          return;
        }
        flyFrom(card, { coins: o.coins, xp: o.xp, gems: o.gems });
        const cr = card.getBoundingClientRect();
        ui.feedback.floatText(cr.left + 20, cr.top + 10, `+${FRIENDSHIP.order} ${VILLAGER[orderVillager(o)].name}`, 'heart', '#ffd1dc', 0.25);
        haptics.buzz([10, 30, 10]);
        const board = game.buildingsOf('order_board')[0];
        if (board) ui.effects.sparkle(ui.scene.farm.anchor(board.uid), '#ffe066', 14);
        render();
      }, `small ${ok ? '' : 'disabled'}`));
      grid.append(card);
    }
    p.body.append(grid);
  };
  render();
  timer = window.setInterval(() => { if (!p.overlay.isConnected) clearInterval(timer); else stableRefresh([p.body, p.footer], render); }, 1000);
  p.onClose = () => { clearInterval(timer); clearTimeout(skipTimer); };
  p.open();
}

// ======================================================================== truck
export function openTruck(): void {
  const p = new Panel({ title: 'Delivery Truck', icon: 'truck', color: 'blue' });
  let timer = 0;
  const render = () => {
    clear(p.body);
    clear(p.footer);
    const t = game.state.truck;
    if (!t) {
      const wait = Math.max(0, game.state.truckNextAt - game.now());
      p.body.append(h('div', { class: 'center', style: 'padding:24px' }, icon('truck', 'card-icon'), h('div', { class: 'card-title' }, 'The truck is on the road'),
        h('div', { class: 'muted' }, 'It brings big crate orders for coins, XP and a mystery crate.'),
        h('div', { class: 'timer-tag outlined', style: 'display:inline-block;margin-top:10px' }, wait ? `Back in ${formatTime(wait)}` : 'Arriving any moment...')));
      return;
    }
    const loaded = t.crates.filter((c) => c.filled).length;
    p.body.append(h('div', { class: 'row between', style: 'margin-bottom:8px' }, h('div', { class: 'muted' }, 'Load each crate for coins. Load them all for a bonus and a rare mystery crate!'), h('span', { class: 'timer-tag outlined' }, `Leaves in ${formatTime(t.leavesAt - game.now())}`)));
    p.body.append(h('div', { class: 'truck-progress' },
      h('div', { class: 'progress', style: 'flex:1 1 auto;height:22px' }, h('div', { class: 'fill', style: `width:${(loaded / t.crates.length) * 100}%` }), h('div', { class: 'label' }, `${loaded}/${t.crates.length} crates loaded`)),
      h('span', { class: 'pill' }, icon('coin'), `+${fmt(t.bonusCoins)}`), h('span', { class: 'pill' }, icon('gift'), 'Rare')));
    const grid = h('div', { class: 'grid tight', style: 'grid-template-columns:repeat(auto-fill,minmax(110px,1fr))' });
    t.crates.forEach((c, i) => {
      const have = game.count(c.item);
      const card = h('div', { class: `card truck-crate ${c.filled ? 'done' : ''}` });
      append(card, [icon(c.filled ? 'check' : 'package', 'icon'),
        h('div', { class: c.filled ? '' : 'clickable', onclick: c.filled ? undefined : () => goToSource(c.item) }, itemIcon(c.item, 'card-icon')),
        h('div', { class: 'card-sub' }, `${ITEMS[c.item].name}`),
        c.filled ? h('span', { class: 'pill enough' }, 'Loaded') : h('span', { class: 'row order-need' }, needPill(c.item, have, c.qty), have < c.qty ? askButton(c.item, c.qty - have, 'truck') : null),
        c.filled ? null : h('div', { class: 'chip-row' }, h('span', { class: 'pill' }, icon('coin'), fmt(c.coins)), h('span', { class: 'pill' }, icon('xp'), fmt(c.xp))),
        c.filled ? null : button(have >= c.qty ? 'Load' : `Need ${c.qty - have}`, () => {
          if (!truck.fill(i)) { goToSource(c.item); audio.play('error'); return; }
          flyFrom(card, { coins: c.coins, xp: c.xp });
          haptics.buzz(12);
          render();
        }, `small ${have >= c.qty ? '' : 'disabled'}`)]);
      grid.append(card);
    });
    p.body.append(grid);
    const sendBtn = button(['Send truck', priceTag(t.bonusCoins), icon('gift')], () => {
      if (!truck.send()) { ui.feedback.toast('Load every crate first', `${t.crates.length - loaded} to go`, 'package'); audio.play('error'); return; }
      flyFrom(sendBtn, { coins: t.bonusCoins });
      ui.feedback.toast('Truck sent!', 'You earned a rare mystery crate', 'gift', 'gold');
      ui.scene.rig.shake(0.15, 0.3);
      p.close();
      ui.open('crates');
    }, truck.complete ? 'yellow' : 'disabled');
    p.footer.append(sendBtn);
  };
  render();
  timer = window.setInterval(() => { if (!p.overlay.isConnected) clearInterval(timer); else stableRefresh([p.body, p.footer], render); }, 1000);
  p.open();
}

// ======================================================================== stall
/** Rough time until a listing at this price finds a buyer (the middle of the random range). */
function stallWait(item: string, qty: number, price: number): number {
  const [min, max] = stall.priceRange(item, qty);
  const [lo, hi] = ECONOMY.stall.buyDelaySec;
  const t = (price - min) / Math.max(1, max - min);
  return (lo + (hi - lo) * (0.2 + t * 0.8)) * 1000;
}

export function openStall(): void {
  const p = new Panel({ title: 'Roadside Stall', icon: 'store', color: 'pink' });
  let timer = 0;
  const explainStall = hints.explain('stall_panel', 'stall');
  let picking: number | null = null;
  const render = () => {
    clear(p.body);
    clear(p.footer);
    p.footer.style.display = 'none';
    const slots = stall.ensureSlots();
    if (picking !== null) { renderPicker(picking); return; }
    const sold = stall.soldCount();
    if (sold || explainStall) p.body.append(h('div', { class: 'econ-intro' }, icon(sold ? 'coin' : 'store', 'icon'),
      h('span', null, sold ? `${sold} sold! Tap to collect your coins.` : 'Set your own price. Passers-by buy cheaper things sooner.')));
    const mkt = marketLink(() => p.close());
    if (mkt) p.body.append(mkt);
    const grid = h('div', { class: 'grid tight', style: 'grid-template-columns:repeat(auto-fill,minmax(110px,1fr))' });
    const now = game.now();
    slots.forEach((s, i) => {
      if (!s.item) {
        grid.append(h('div', { class: 'card clickable stall-empty', onclick: () => { picking = i; render(); } }, h('div', { class: 'card-title', style: 'font-size:34px' }, '+'), h('div', { class: 'card-sub' }, 'Sell something')));
        return;
      }
      const isSold = stall.sold(s);
      const card = h('div', { class: `card stall-slot ${isSold ? 'done clickable' : ''}` });
      if (isSold) {
        card.addEventListener('click', () => {
          const coins = stall.collect(i);
          if (!coins) return;
          flyFrom(card, { coins });
          audio.play('coins');
          haptics.buzz(10);
          render();
        });
      }
      const pct = s.buyDelay ? Math.min(100, ((now - s.listedAt) / s.buyDelay) * 100) : 0;
      card.append(itemIcon(s.item, 'card-icon'), h('div', { class: 'card-sub' }, `${s.qty} x ${ITEMS[s.item].name}`), h('span', { class: 'pill' }, icon('coin'), fmt(s.price)),
        isSold ? h('div', { class: 'card-title', style: 'color:#3f8f22' }, 'Sold! Tap')
          : h('div', { class: 'row', style: 'width:100%' },
            h('div', { class: 'progress', style: 'flex:1 1 auto' }, h('div', { class: 'fill', style: `width:${pct}%` }), h('div', { class: 'label' }, 'On sale')),
            h('button', { class: 'opt-btn', style: 'min-width:36px;min-height:36px;padding:0', title: 'Take back', onclick: (e: MouseEvent) => { e.stopPropagation(); stall.cancel(i); render(); } }, icon('cross'))));
      grid.append(card);
    });
    if (slots.length < ECONOMY.stall.maxSlots) grid.append(h('div', { class: 'card clickable stall-empty', style: 'opacity:.8', onclick: () => { if (!stall.buySlot()) { ui.feedback.toast('Not enough gems', undefined, 'gem'); audio.play('error'); } render(); } }, icon('plus', 'icon'), h('div', { class: 'card-sub' }, 'Extra slot'), h('span', { class: 'pill' }, priceTag(0, ECONOMY.stall.slotCostGems))));
    p.body.append(grid);
  };
  const renderPicker = (slot: number) => {
    const items = Object.entries(game.state.inventory).filter(([id, n]) => n > 0 && ITEMS[id]?.sell > 0).sort((a, b) => ITEMS[a[0]].sell - ITEMS[b[0]].sell);
    p.body.append(h('div', { class: 'row between' }, h('div', { class: 'section-title' }, 'Pick an item'), button('Back', () => { picking = null; render(); }, 'small grey')));
    if (!items.length) p.body.append(h('div', { class: 'muted center' }, 'Your barn is empty.'));
    const grid = h('div', { class: 'grid tight' });
    for (const [id, n] of items) {
      const asked = requestedCount(id) > 0;
      grid.append(h('div', { class: 'card clickable', onclick: () => renderPrice(slot, id) }, itemIcon(id, 'card-icon'), h('div', { class: 'card-sub' }, ITEMS[id].name),
        asked ? h('span', { class: 'mini-tag wanted corner', title: 'An order or the truck wants this' }, icon('clipboard', 'icon tiny')) : null,
        h('div', { class: 'count-tag outlined' }, `x${n}`)));
    }
    p.body.append(grid);
  };
  const renderPrice = (slot: number, item: string) => {
    clear(p.body);
    let qty = Math.min(game.count(item), 5);
    let price = stall.priceRange(item, qty)[2];
    const qtyEl = h('span', { class: 'outlined', style: 'font-size:24px;min-width:40px;text-align:center' });
    const priceEl = h('span', { class: 'outlined', style: 'font-size:24px;min-width:70px;text-align:center' });
    const hint = h('div', { class: 'muted center' });
    const compare = h('div', { class: 'muted center' });
    const presets = h('div', { class: 'segmented stall-presets' });
    const asked = requestedCount(item);
    const warn = h('div', { class: 'mini-tag wanted', style: 'display:none' });
    const upd = () => {
      const [min, max] = stall.priceRange(item, qty);
      price = Math.max(min, Math.min(max, price));
      qtyEl.textContent = String(qty);
      priceEl.replaceChildren(icon('coin'), fmt(price));
      const t = (price - min) / Math.max(1, max - min);
      hint.textContent = `${t < 0.35 ? 'Bargain! ' : t < 0.7 ? 'Fair price. ' : 'Pricey. '}Usually sells in about ${formatTime(stallWait(item, qty, price))}.`;
      compare.textContent = `The barn would pay ${fmt(Math.round(ITEMS[item].sell * qty * ECONOMY.barn.sellMult))}.`;
      // only warn when this sale would leave too few for orders and the truck
      const left = game.count(item) - qty;
      warn.style.display = asked > 0 && left < asked ? '' : 'none';
      warn.replaceChildren(icon('clipboard', 'icon tiny'), `Careful - your orders need ${asked}`);
      presets.querySelectorAll('button').forEach((b) => b.classList.toggle('selected', Number(b.dataset.price) === price));
    };
    const setPreset = (k: number) => { const [min, max, def] = stall.priceRange(item, qty); price = k < 0 ? min : k > 0 ? max : def; upd(); };
    const buildPresets = () => {
      const [min, max, def] = stall.priceRange(item, qty);
      presets.replaceChildren(
        h('button', { class: 'opt-btn', dataset: { price: String(min) }, onclick: () => setPreset(-1) }, 'Quick sale'),
        h('button', { class: 'opt-btn', dataset: { price: String(def) }, onclick: () => setPreset(0) }, 'Fair'),
        h('button', { class: 'opt-btn', dataset: { price: String(max) }, onclick: () => setPreset(1) }, 'Top price'));
    };
    const setQty = (n: number) => { qty = Math.max(1, Math.min(game.count(item), n)); price = stall.priceRange(item, qty)[2]; buildPresets(); upd(); };
    const step = () => Math.max(1, Math.round(ITEMS[item].sell * qty * 0.05));
    p.body.append(h('div', { class: 'col', style: 'align-items:center;gap:12px;padding:10px' },
      itemIcon(item, 'card-icon'), h('div', { class: 'card-title' }, ITEMS[item].name),
      warn,
      h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Amount'), button('-', () => setQty(qty - 1), 'small grey'), qtyEl, button('+', () => setQty(qty + 1), 'small grey'), button('All', () => setQty(game.count(item)), 'small blue')),
      h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Price'), button('-', () => { price -= step(); upd(); }, 'small grey'), priceEl, button('+', () => { price += step(); upd(); }, 'small grey')),
      presets,
      hint, compare,
      h('div', { class: 'row' }, button('Back', () => { picking = null; render(); }, 'grey'), button('Put on sale', () => {
        if (!stall.list(slot, item, qty, price)) { audio.play('error'); return; }
        audio.play('purchase');
        picking = null;
        render();
      }, 'yellow'))));
    buildPresets();
    upd();
  };
  render();
  timer = window.setInterval(() => { if (!p.overlay.isConnected) clearInterval(timer); else if (picking === null) stableRefresh([p.body, p.footer], render); }, 1000);
  p.open();
}

// ======================================================================== merchant
export function openMerchant(): void {
  const p = new Panel({ title: 'Travelling Merchant', icon: 'cart', color: 'purple', size: 'medium' });
  let timer = 0;
  let selected = '';
  const render = () => {
    clear(p.body);
    const v = merchant.visit();
    if (!v.present) {
      p.body.append(h('div', { class: 'center', style: 'padding:20px' }, icon('cart', 'card-icon'), h('div', { class: 'card-title' }, 'The merchant is travelling'),
        h('div', { class: 'timer-tag outlined', style: 'display:inline-block;margin-top:8px' }, `Next visit in ${formatTime(v.nextAt - game.now())}`)));
      return;
    }
    p.body.append(h('div', { class: 'row between', style: 'margin-bottom:8px' }, h('div', { class: 'muted' }, 'Rare goods from far away! Tap to look, tap again to buy.'), h('span', { class: 'timer-tag outlined' }, `Leaves in ${formatTime(v.leavesAt - game.now())}`)));
    if (hasPerk('hazel_discount')) p.body.append(h('div', { class: 'econ-intro' }, icon('store', 'icon'), h('span', null, "Hazel's friend discount: 10% off everything")));
    const grid = h('div', { class: 'grid' });
    for (const o of merchant.stock()) {
      const bought = merchant.bought(o) || (o.kind === 'cosmetic' && game.state.cosmetics.includes(o.id));
      const afford = game.coins >= o.price;
      const sel = selected === o.key && !bought;
      const was = 'was' in o ? o.was : 0;
      const card = h('div', { class: `card merchant-offer ${bought ? 'done' : 'clickable'} ${sel ? 'selected' : ''}` });
      card.addEventListener('click', () => {
        if (bought) return;
        if (!sel) { selected = o.key; audio.play('select'); render(); return; }
        buy(o, card);
      });
      append(card, [
        was > o.price ? h('span', { class: 'deal-tag outlined' }, `-${Math.round((1 - o.price / was) * 100)}%`) : null,
        offerIcon(o), h('div', { class: 'card-title' }, offerName(o)), h('div', { class: 'card-sub' }, offerSub(o)),
        bought ? h('div', { class: 'pill enough' }, 'Bought')
          : h('div', { class: 'row', style: 'gap:4px;flex-wrap:wrap;justify-content:center' },
            was > o.price ? h('span', { class: 'was-price' }, fmt(was)) : null,
            h('div', { class: `pill ${afford ? '' : 'short'}` }, priceTag(o.price))),
        sel ? h('div', { class: `btn small ${afford ? 'yellow' : 'disabled'}`, style: 'pointer-events:none' }, afford ? 'Buy' : 'Need more coins') : null]);
      grid.append(card);
    }
    p.body.append(grid);
  };
  const buy = (o: MerchantOffer, card: HTMLElement) => {
    if (!merchant.buy(o)) { ui.feedback.toast(game.coins < o.price ? 'Not enough coins' : 'Sold out', game.coins < o.price ? `You need ${fmt(o.price - game.coins)} more` : undefined, 'cross'); audio.play('error'); return; }
    if (o.kind === 'gems') flyFrom(card, { gems: o.qty });
    ui.feedback.toast('Thank you kindly!', o.kind === 'decor' ? `${offerName(o)} is in your storage` : o.kind === 'items' ? `${offerName(o)} went to your barn` : offerName(o), 'cart');
    haptics.buzz(12);
    selected = '';
    render();
  };
  render();
  timer = window.setInterval(() => { if (!p.overlay.isConnected) clearInterval(timer); else stableRefresh([p.body], render); }, 1000);
  p.onClose = () => clearInterval(timer);
  p.open();
}
function offerIcon(o: MerchantOffer): HTMLElement {
  if (o.kind === 'decor') return icon(`building:${o.id}`, 'card-icon');
  if (o.kind === 'cosmetic') return icon('hat', 'card-icon');
  if (o.kind === 'items') return itemIcon(o.id, 'card-icon');
  return icon('gem', 'card-icon');
}
function offerName(o: MerchantOffer): string {
  if (o.kind === 'decor') return BUILDING[o.id].name;
  if (o.kind === 'cosmetic') return o.name;
  if (o.kind === 'items') return `${o.qty} x ${ITEMS[o.id].name}`;
  return `${o.qty} Gems`;
}
function offerSub(o: MerchantOffer): string {
  if (o.kind === 'decor') return `Decoration · +${BUILDING[o.id].charm} charm`;
  if (o.kind === 'cosmetic') return cosmeticUnlocked(o.id, { crate: 'rare' }) ? 'Already yours' : 'Rare cosmetic';
  if (o.kind === 'items') return requestedCount(o.id) ? 'Your orders want these!' : 'Ready right now';
  return 'Shiny!';
}
export function anchorOfMerchant() { const p = merchantSpot(); return { x: p[0] - 24 + 0.5, y: 1.4, z: p[1] - 24 + 0.5 }; }
/** Where the merchant parks: the west end of the farm path. */
export function merchantSpot(): [number, number] {
  const paths = game.state.buildings.filter((b) => BUILDING[b.type]?.path);
  if (!paths.length) return [16, 20];
  const p = paths.reduce((a, b) => (b.x < a.x ? b : a));
  return [p.x, p.z];
}

// ======================================================================== hooks
ui.register('orders', () => openOrders());
ui.register('truck', () => openTruck());
ui.register('stall', () => openStall());
ui.register('merchant', () => openMerchant());

ui.onBuildingTap((b: PlacedBuilding) => {
  if (!isBuilt(b, game.now())) return false;
  if (b.type === 'order_board') { ui.open('orders'); return true; }
  if (b.type === 'truck_depot') { ui.open('truck'); return true; }
  if (b.type === 'roadside_stall') {
    // collect every sale in one tap, else open the stall
    let coins = 0;
    stall.ensureSlots().forEach((s, i) => { if (stall.sold(s)) coins += stall.collect(i, anchorOf('roadside_stall')); });
    if (!coins) ui.open('stall');
    return true;
  }
  return false;
});

addBubbleProvider((b, now) => {
  if (b.type === 'order_board' && orders.anyCompletable()) return { icon: 'check', version: 'orders' };
  if (b.type === 'roadside_stall' && stall.soldCount()) return { icon: 'coin', version: `stall${stall.soldCount()}` };
  if (b.type === 'truck_depot' && game.state.truck) return { icon: truck.complete ? 'gift' : 'truck', version: truck.complete ? 'tdone' : 'truck' };
  void now;
  return null;
});
