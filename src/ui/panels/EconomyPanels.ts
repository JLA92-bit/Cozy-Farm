import { Panel } from '../Panel';
import { h, icon, itemIcon, button, clear, priceTag, fmt, stableRefresh } from '../dom';
import { ui } from '../UI';
import { BUILDING, ITEMS, ECONOMY } from '../../data';
import { game } from '../../systems/Game';
import { orders, truck, stall, merchant, type MerchantOffer } from '../../systems/Economy';
import { audio, haptics } from '../../systems/Audio';
import { formatTime, isBuilt } from '../../systems/Timers';
import { addBubbleProvider } from '../Bubbles';
import { sourceText } from './InventoryPanel';
import { cosmeticUnlocked } from './CharacterPanel';
import type { PlacedBuilding } from '../../systems/State';

const NPC_ICONS = ['farmer', 'woman_farmer', 'man_farmer', 'chick', 'dog', 'cat', 'rabbit', 'farmer', 'woman_farmer', 'man_farmer', 'bee', 'smile'];

function anchorOf(type: string) {
  const b = game.buildingsOf(type)[0];
  if (!b) return undefined;
  const a = ui.scene.farm.anchor(b.uid);
  return { x: a.x, y: a.y, z: a.z };
}

// ======================================================================== orders
export function openOrders(): void {
  orders.refresh();
  const p = new Panel({ title: 'Order Board', icon: 'clipboard', color: 'orange' });
  let timer = 0;
  const render = () => {
    clear(p.body);
    const now = game.now();
    const grid = h('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fill,minmax(150px,1fr))' });
    for (const o of game.state.orders.list) {
      if (o.readyAt > now) {
        grid.append(h('div', { class: 'card', style: 'opacity:.7;justify-content:center' }, icon('hourglass', 'card-icon'), h('div', { class: 'card-sub' }, 'New order in'), h('div', { class: 'timer-tag outlined' }, formatTime(o.readyAt - now))));
        continue;
      }
      const ok = orders.canComplete(o);
      const lines = h('div', { class: 'col', style: 'gap:4px;width:100%' });
      for (const l of o.lines) {
        const have = game.count(l.item);
        lines.append(h('div', { class: 'row', style: 'justify-content:space-between;width:100%' }, h('span', { class: 'row', style: 'gap:4px' }, itemIcon(l.item), h('span', { class: 'card-sub', style: 'text-align:left' }, ITEMS[l.item].name)),
          h('span', { class: 'pill', style: have >= l.qty ? 'background:#d9f7c0' : 'background:#ffd6d0' }, `${Math.min(have, l.qty)}/${l.qty}`)));
      }
      const card = h('div', { class: `card ${ok ? 'done' : ''}` },
        h('div', { class: 'row', style: 'width:100%;justify-content:space-between' }, icon(NPC_ICONS[o.npc % NPC_ICONS.length], 'icon'),
          h('button', { class: 'opt-btn', style: 'min-width:40px;min-height:36px;padding:2px', title: 'Discard', onclick: () => { orders.discard(o.id); audio.play('close'); render(); } }, icon('cross'))),
        lines,
        h('div', { class: 'chip-row' }, h('span', { class: 'pill' }, icon('coin'), fmt(o.coins)), h('span', { class: 'pill' }, icon('xp'), `${o.xp}`), o.gems ? h('span', { class: 'pill' }, icon('gem'), `${o.gems}`) : null),
        button(ok ? 'Deliver' : 'Need items', () => {
          if (!orders.complete(o.id, anchorOf('order_board'))) {
            const miss = o.lines.filter((l) => game.count(l.item) < l.qty).map((l) => `${ITEMS[l.item].name}: ${sourceText(l.item)}`);
            ui.feedback.toast('Missing items', miss[0], 'cross');
            audio.play('error');
            return;
          }
          haptics.buzz([10, 30, 10]);
          ui.effects.sparkle(ui.scene.farm.anchor(game.buildingsOf('order_board')[0].uid), '#ffe066', 14);
          render();
        }, `small ${ok ? '' : 'disabled'}`),
      );
      grid.append(card);
    }
    p.body.append(grid);
  };
  render();
  timer = window.setInterval(() => { if (!p.overlay.isConnected) clearInterval(timer); else stableRefresh([p.body, p.footer], render); }, 1000);
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
      p.body.append(h('div', { class: 'center', style: 'padding:24px' }, icon('truck', 'card-icon'), h('div', { class: 'card-title' }, 'The truck is on the road'), h('div', { class: 'muted' }, wait ? `Back in ${formatTime(wait)}` : 'Arriving any moment...')));
      return;
    }
    p.body.append(h('div', { class: 'row between', style: 'margin-bottom:8px' }, h('div', { class: 'muted' }, 'Fill each crate for coins. Fill them all for a bonus and a mystery crate!'), h('span', { class: 'timer-tag outlined' }, `Leaves in ${formatTime(t.leavesAt - game.now())}`)));
    const grid = h('div', { class: 'grid tight', style: 'grid-template-columns:repeat(auto-fill,minmax(110px,1fr))' });
    t.crates.forEach((c, i) => {
      const have = game.count(c.item);
      grid.append(h('div', { class: `card ${c.filled ? 'done' : ''}` }, icon(c.filled ? 'check' : 'package', 'icon'), itemIcon(c.item, 'card-icon'),
        h('div', { class: 'card-sub' }, `${ITEMS[c.item].name}`), h('span', { class: 'pill' }, c.filled ? 'Loaded' : `${Math.min(have, c.qty)}/${c.qty}`),
        c.filled ? null : h('div', { class: 'chip-row' }, h('span', { class: 'pill' }, icon('coin'), fmt(c.coins))),
        c.filled ? null : button('Load', () => {
          if (!truck.fill(i, anchorOf('truck_depot'))) { ui.feedback.toast(`Need ${c.qty - have} more ${ITEMS[c.item].name}`, sourceText(c.item), 'cross'); audio.play('error'); return; }
          haptics.buzz(12);
          render();
        }, `small ${have >= c.qty ? '' : 'disabled'}`)));
    });
    p.body.append(grid);
    p.footer.append(button(['Send truck', priceTag(t.bonusCoins), icon('gift')], () => {
      if (!truck.send(anchorOf('truck_depot'))) { ui.feedback.toast('Load every crate first', undefined, 'package'); audio.play('error'); return; }
      ui.feedback.toast('Truck sent!', 'You earned a rare mystery crate', 'gift', 'gold');
      ui.scene.rig.shake(0.15, 0.3);
      p.close();
      ui.open('crates');
    }, truck.complete ? 'yellow' : 'disabled'));
  };
  render();
  timer = window.setInterval(() => { if (!p.overlay.isConnected) clearInterval(timer); else stableRefresh([p.body, p.footer], render); }, 1000);
  p.open();
}

// ======================================================================== stall
export function openStall(): void {
  const p = new Panel({ title: 'Roadside Stall', icon: 'store', color: 'pink' });
  let timer = 0;
  let picking: number | null = null;
  const render = () => {
    clear(p.body);
    clear(p.footer);
    p.footer.style.display = 'none';
    const slots = stall.ensureSlots();
    if (picking !== null) { renderPicker(picking); return; }
    p.body.append(h('div', { class: 'muted', style: 'margin-bottom:8px' }, 'Set your own price. Passers-by buy cheaper things sooner.'));
    const grid = h('div', { class: 'grid tight', style: 'grid-template-columns:repeat(auto-fill,minmax(110px,1fr))' });
    slots.forEach((s, i) => {
      if (!s.item) {
        grid.append(h('div', { class: 'card clickable', style: 'justify-content:center;min-height:130px', onclick: () => { picking = i; render(); } }, h('div', { class: 'card-title', style: 'font-size:34px' }, '+'), h('div', { class: 'card-sub' }, 'Sell something')));
        return;
      }
      const sold = stall.sold(s);
      grid.append(h('div', { class: `card ${sold ? 'done clickable' : ''}`, style: 'min-height:130px', onclick: sold ? () => { stall.collect(i, anchorOf('roadside_stall')); haptics.buzz(10); render(); } : undefined },
        itemIcon(s.item, 'card-icon'), h('div', { class: 'card-sub' }, `${s.qty} x ${ITEMS[s.item].name}`), h('span', { class: 'pill' }, icon('coin'), fmt(s.price)),
        sold ? h('div', { class: 'card-title', style: 'color:#3f8f22' }, 'Sold! Tap') : h('div', { class: 'row' }, h('span', { class: 'timer-tag outlined' }, 'Waiting...'), h('button', { class: 'opt-btn', style: 'min-width:36px;min-height:36px;padding:0', title: 'Take back', onclick: () => { stall.cancel(i); render(); } }, icon('cross')))));
    });
    if (slots.length < ECONOMY.stall.maxSlots) grid.append(h('div', { class: 'card clickable', style: 'justify-content:center;opacity:.8', onclick: () => { if (!stall.buySlot()) { ui.feedback.toast('Not enough gems', undefined, 'gem'); audio.play('error'); } render(); } }, icon('plus', 'icon'), h('div', { class: 'card-sub' }, 'Extra slot'), h('span', { class: 'pill' }, priceTag(0, ECONOMY.stall.slotCostGems))));
    p.body.append(grid);
  };
  const renderPicker = (slot: number) => {
    const items = Object.entries(game.state.inventory).filter(([id, n]) => n > 0 && ITEMS[id]?.sell > 0).sort((a, b) => ITEMS[a[0]].sell - ITEMS[b[0]].sell);
    p.body.append(h('div', { class: 'row between' }, h('div', { class: 'section-title' }, 'Pick an item'), button('Back', () => { picking = null; render(); }, 'small grey')));
    if (!items.length) p.body.append(h('div', { class: 'muted center' }, 'Your barn is empty.'));
    const grid = h('div', { class: 'grid tight' });
    for (const [id, n] of items) {
      grid.append(h('div', { class: 'card clickable', onclick: () => renderPrice(slot, id) }, itemIcon(id, 'card-icon'), h('div', { class: 'card-sub' }, ITEMS[id].name), h('div', { class: 'count-tag outlined' }, `x${n}`)));
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
    const upd = () => {
      const [min, max] = stall.priceRange(item, qty);
      price = Math.max(min, Math.min(max, price));
      qtyEl.textContent = String(qty);
      priceEl.replaceChildren(icon('coin'), fmt(price));
      const t = (price - min) / Math.max(1, max - min);
      hint.textContent = t < 0.35 ? 'Bargain! Sells quickly.' : t < 0.7 ? 'Fair price.' : 'Pricey: may take a while.';
    };
    const step = () => Math.max(1, Math.round(ITEMS[item].sell * qty * 0.05));
    p.body.append(h('div', { class: 'col', style: 'align-items:center;gap:12px;padding:10px' },
      itemIcon(item, 'card-icon'), h('div', { class: 'card-title' }, ITEMS[item].name),
      h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Amount'), button('−', () => { qty = Math.max(1, qty - 1); price = stall.priceRange(item, qty)[2]; upd(); }, 'small grey'), qtyEl, button('+', () => { qty = Math.min(game.count(item), qty + 1); price = stall.priceRange(item, qty)[2]; upd(); }, 'small grey')),
      h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Price'), button('−', () => { price -= step(); upd(); }, 'small grey'), priceEl, button('+', () => { price += step(); upd(); }, 'small grey')),
      hint,
      h('div', { class: 'row' }, button('Back', () => { picking = null; render(); }, 'grey'), button('Put on sale', () => {
        if (!stall.list(slot, item, qty, price)) { audio.play('error'); return; }
        audio.play('purchase');
        picking = null;
        render();
      }, 'yellow'))));
    upd();
  };
  render();
  timer = window.setInterval(() => { if (!p.overlay.isConnected) clearInterval(timer); else if (picking === null) stableRefresh([p.body, p.footer], render); }, 2000);
  p.open();
}

// ======================================================================== merchant
export function openMerchant(): void {
  const v = merchant.visit();
  const p = new Panel({ title: 'Travelling Merchant', icon: 'cart', color: 'purple', size: 'medium' });
  const render = () => {
    clear(p.body);
    if (!merchant.visit().present) {
      p.body.append(h('div', { class: 'center', style: 'padding:20px' }, icon('cart', 'card-icon'), h('div', { class: 'card-title' }, 'The merchant is travelling'), h('div', { class: 'muted' }, `Next visit in ${formatTime(v.nextAt - game.now())}`)));
      return;
    }
    p.body.append(h('div', { class: 'row between', style: 'margin-bottom:8px' }, h('div', { class: 'muted' }, 'Rare goods from far away!'), h('span', { class: 'timer-tag outlined' }, `Leaves in ${formatTime(v.leavesAt - game.now())}`)));
    const grid = h('div', { class: 'grid' });
    for (const o of merchant.stock()) {
      const bought = merchant.bought(o) || (o.kind === 'cosmetic' && game.state.cosmetics.includes(o.id));
      grid.append(h('div', { class: `card ${bought ? 'done' : 'clickable'}`, onclick: bought ? undefined : () => buy(o) },
        offerIcon(o), h('div', { class: 'card-title' }, offerName(o)), h('div', { class: 'card-sub' }, offerSub(o)),
        bought ? h('div', { class: 'pill' }, 'Bought') : h('div', { class: 'pill' }, priceTag(o.price))));
    }
    p.body.append(grid);
  };
  const buy = (o: MerchantOffer) => {
    if (!merchant.buy(o, anchorOfMerchant())) { ui.feedback.toast(game.coins < o.price ? 'Not enough coins' : 'Sold out', undefined, 'cross'); audio.play('error'); return; }
    ui.feedback.toast('Thank you kindly!', offerName(o), 'cart');
    render();
  };
  render();
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
  if (o.kind === 'items') return 'Bulk bargain';
  return 'Shiny!';
}
export function anchorOfMerchant() { const p = merchantSpot(); return { x: p[0] - 24 + 0.5, y: 1.4, z: p[1] - 24 + 0.5 }; }
/** Where the merchant parks: the west end of the farm path. */
export function merchantSpot(): [number, number] {
  const paths = game.state.buildings.filter((b) => b.type === 'path_dirt' || b.type === 'path_stone');
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
