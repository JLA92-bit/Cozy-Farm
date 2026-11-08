import { h, num, date, loading, download, csv } from '../ui';
import { rpc } from '../api';
import { ITEMS, iconUrl, nameOf } from '../gamedata';

/**
 * The player page's Item history tab (ADMIN.md "Item history"): every change to the player's barn from game
 * 1.46.1, with what caused it and how many were left after (item_log, admin_player_items, kept 120 days). Pick an
 * item to see its story; "Loaded" lines are counts that changed outside the game (a cloud farm, an import or
 * another device). Changes close together for the same reason are one line.
 */

/** What each reason means, in plain words. Reasons not here are shown as they are. */
const WHY: Record<string, string> = {
  harvest: 'Harvested', tree: 'Picked from a tree', animal: 'Collected from animals', animal_feed: 'Fed to animals',
  workshop_start: 'Used in a workshop recipe', workshop: 'Made in a workshop', workshop_cancel: 'Workshop job cancelled (returned)',
  production: 'Made in a workshop', crop: 'Harvested', fish: 'Caught',
  order: 'Delivered to an order', truck: 'Loaded on the truck', stall_list: 'Put on the roadside stall', stall_back: 'Taken back from the stall',
  barn_sell: 'Sold from the barn', sell_extras: 'Sold with Sell extras (barn)', merchant: 'Bought from the merchant',
  market_list: 'Listed on the market', market_back: 'Market listing failed (returned)', market: 'Bought on the market', market_cancel: 'Market listing taken back',
  gift_send: 'Sent as a gift to a friend', gift_back: 'Gift returned', gift: 'Gift received', reward_code: 'Reward code', dev_gift: 'Developer gift',
  ask_friend: 'Ask a friend: received', ask_friend_fill: 'Ask a friend: given to a friend', ask_friend_back: 'Ask a friend: returned', hazel_help: 'Bought through Hazel',
  boat: 'Given to a boat visitor', villager_gift: 'Gift to a villager', villager_request: 'Villager request', daily_find: 'Daily find', help_wanted: 'Help Wanted',
  favour: 'Villager favour', museum: 'Given to the Museum', fair: 'Village Fair entry', festival: 'Festival game', festival_prize: 'Festival prize',
  estate_gift: 'Estate gift', upgrade: 'Building upgrade', forge: "Bram's forge", home_craft: 'Furniture made at the Carpenter',
  level_up: 'Level-up reward', crate: 'Crate', quest: 'Quest reward', achievement: 'Achievement', mail: 'Mail', welcome: 'Welcome basket',
  parcel: 'Thoughtful parcel', pet_find: 'Pet find', rare_seed: "Rosa's rare seeds", rare_seed_plant: 'Planted a rare seed', fertiliser: 'Fertiliser used',
  fishing: 'Fishing', bait_buy: 'Bought bait', lucky_bait: 'Lucky bait', net_set: 'Set the fishing net', net_haul: 'Hauled the fishing net', fish_stall: 'Fish stall',
  forage: 'Foraged', dig: 'Dug up', pan: 'Panned', tap: 'Tapped a pine', fireflies: 'Caught fireflies', camp: 'Camping finds', expedition: 'Expedition',
  critter_treat: 'Fed to a critter', critter_gift: 'Critter gift', field_note: "Wren's field note",
  mine_rock: 'Mine: broke a rock', mine_cart: 'Mine: cart', mine_pool: 'Mine: pool', mine_chest: 'Mine: chest', geode: 'Geode opened', pickaxe: 'Pickaxe made',
  coop_refund: 'Co-op project refund', project: 'Given to a project', loaded: 'Changed outside this game (cloud farm, import or another device)',
  debug: 'Debug panel', other: 'Other (no reason recorded)',
};

export function whyText(w: string): string {
  const [a, b] = w.includes(':') ? [w.slice(0, w.indexOf(':')), w.slice(w.indexOf(':') + 1)] : [w, ''];
  if (a === 'farmhand') return `Farmhand: ${whyText(b || 'other')}`;
  if (a === 'project') return `Given to a project (${b.replace(/_/g, ' ')})`;
  return WHY[w] ?? WHY[a] ?? w.replace(/_/g, ' ');
}

interface Row { at: string; item: string; d: number; q: number; why: string; bal: number }
interface Result { rows: Row[]; items: { item: string; in: number; out: number; lines: number }[]; byWhy: { why: string; in: number; out: number }[]; first: string | null }

const STAR = ['', ' (silver)', ' (gold)'];
const itemCell = (id: string) => h('span', { class: 'row' }, h('img', { src: iconUrl(id), width: 20, height: 20, alt: '' }), nameOf(id));

export function itemsTab(id: string, name: string): HTMLElement[] {
  const pick = h('input', { class: 'input', list: 'item-log-items', placeholder: 'All items (type to pick one, e.g. Wheat)' }) as HTMLInputElement;
  const options = h('datalist', { id: 'item-log-items' }, Object.keys(ITEMS).map((k) => h('option', { value: nameOf(k) })));
  const days = h('select', { class: 'input' }, [7, 30, 60, 120].map((d) => h('option', { value: String(d), selected: d === 30 }, `Last ${d} days`))) as HTMLSelectElement;
  const body = h('div');
  const itemId = () => {
    const v = pick.value.trim().toLowerCase();
    if (!v) return null;
    return Object.keys(ITEMS).find((k) => nameOf(k).toLowerCase() === v || k === v) ?? v.replace(/\s+/g, '_');
  };
  let last: Result | null = null;
  const show = () => void loading(body, async () => {
    const item = itemId();
    const r = await rpc<Result>('admin_player_items', { p_id: id, p_item: item, p_days: Number(days.value), p_why: null });
    last = r;
    if (!r.first) {
      body.replaceChildren(h('p', { class: 'muted' }, 'Nothing recorded yet. The item log starts with game version 1.46.1, and only while the player plays signed in online.'));
      return;
    }
    const table = (head: HTMLElement, rows: HTMLElement[]) => h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' }, h('thead', null, head), h('tbody', null, rows)));
    const historyBtn = (it: string) => h('button', { class: 'btn small', onclick: () => { pick.value = nameOf(it); show(); } }, 'History');
    const summary = item
      ? table(h('tr', null, h('th', null, `${nameOf(item)}: why it changed`), h('th', { class: 'r' }, 'In'), h('th', { class: 'r' }, 'Out')),
          r.byWhy.map((w) => h('tr', null, h('td', null, whyText(w.why)), h('td', { class: 'r' }, w.in ? `+${num(w.in)}` : ''), h('td', { class: 'r' }, w.out ? `-${num(w.out)}` : ''))))
      : table(h('tr', null, h('th', null, 'Item'), h('th', { class: 'r' }, 'In'), h('th', { class: 'r' }, 'Out'), h('th', null, '')),
          r.items.slice(0, 60).map((x) => h('tr', null, h('td', null, itemCell(x.item)), h('td', { class: 'r' }, num(x.in)), h('td', { class: 'r' }, num(x.out)), h('td', { class: 'r' }, historyBtn(x.item)))));
    const lines = table(
      h('tr', null, h('th', null, 'When'), item ? '' : h('th', null, 'Item'), h('th', { class: 'r' }, 'Change'), h('th', null, 'Why'), h('th', { class: 'r' }, 'Left after')),
      r.rows.map((x) => h('tr', null,
        h('td', { class: 'small' }, date(x.at, true)),
        item ? '' : h('td', null, itemCell(x.item)),
        h('td', { class: 'r', style: { color: x.d < 0 ? 'var(--bad-ink)' : 'var(--good-ink)' } }, `${x.d > 0 ? '+' : ''}${num(x.d)}${STAR[x.q] ?? ''}`),
        h('td', null, whyText(x.why)),
        h('td', { class: 'r' }, num(x.bal)))));
    body.replaceChildren(
      h('p', { class: 'small muted' }, `Recorded since ${date(r.first, true)}. Newest first, up to 2,000 lines. "Left after" is the count of that item in the barn just after the change (all qualities).`),
      summary,
      h('h4', null, item ? `Every change to ${nameOf(item)}` : 'Every change'),
      r.rows.length ? lines : h('p', { class: 'muted' }, 'No changes in this time.'));
  });
  pick.addEventListener('change', show);
  days.addEventListener('change', show);
  const csvBtn = h('button', { class: 'btn small', onclick: () => {
    if (!last) return;
    download(`items-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'player'}.csv`,
      csv(last.rows.map((x) => ({ at: x.at, item: x.item, change: x.d, quality: x.q, why: x.why, meaning: whyText(x.why), left: x.bal })), ['at', 'item', 'change', 'quality', 'why', 'meaning', 'left']), 'text/csv');
  } }, 'Download CSV');
  const clearBtn = h('button', { class: 'btn small', onclick: () => { pick.value = ''; show(); } }, 'All items');
  show();
  return [h('section', { class: 'card' },
    h('h3', null, 'Item history'),
    h('p', { class: 'small' }, 'Every change to this player\'s barn and what caused it. Pick an item to see where it went.'),
    h('div', { class: 'row wrap' }, h('div', { style: 'flex: 1 1 240px' }, pick), options, days, clearBtn, csvBtn),
    body)];
}
