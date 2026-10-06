import { ITEMS } from '../../src/data';
import { h, field, num } from './ui';

export interface GiftValues { coins: number; gems: number; land: number; items: Record<string, number>; message: string }

/** Coins, gems, land plots, items and a note. `get()` returns the values (or null if empty). */
export function giftForm(defaults: Partial<GiftValues> = {}): { el: HTMLElement; get: () => GiftValues | null } {
  const n = (v: number | undefined, max: number) => h('input', { class: 'input', type: 'number', min: 0, max, step: 1, value: String(v ?? 0), inputMode: 'numeric' }) as HTMLInputElement;
  const coins = n(defaults.coins, 10000000), gems = n(defaults.gems, 100000), land = n(defaults.land, 36);
  const msg = h('input', { class: 'input', maxLength: 200, placeholder: 'e.g. Sorry about your farm! - Josh', value: defaults.message ?? '' }) as HTMLInputElement;
  const listId = `items-${Math.random().toString(36).slice(2)}`;
  const list = h('datalist', { id: listId }, Object.values(ITEMS).map((i) => h('option', { value: i.id }, i.name)));
  const rows = h('div', { class: 'item-rows' });
  const addRow = (id = '', qty = 1) => {
    const it = h('input', { class: 'input', placeholder: 'item id, e.g. cheese', value: id, list: listId }) as HTMLInputElement;
    it.setAttribute('list', listId);
    const q = n(qty, 100000);
    const row = h('div', { class: 'item-row' }, it, q, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remove item', onclick: () => row.remove() }, '×'));
    rows.append(row);
  };
  for (const [k, v] of Object.entries(defaults.items ?? {})) addRow(k, v);
  const hintLand = h('span', { class: 'field-hint' }, 'Land plots open next to their farm for free, like buying them.');
  const el = h('div', { class: 'gift-form' },
    h('div', { class: 'grid-3' }, field('Coins', coins), field('Gems', gems), field('Land plots', land)),
    hintLand,
    field('Items (optional)', h('div', null, rows, list, h('button', { class: 'btn small', type: 'button', onclick: () => addRow() }, '+ Add item'))),
    field('Message they will see', msg),
    h('p', { class: 'muted small' }, 'It arrives by itself the next time they open the game: no code to type.'));
  return {
    el,
    get: () => {
      const items: Record<string, number> = {};
      for (const r of rows.querySelectorAll<HTMLElement>('.item-row')) {
        const [i, q] = r.querySelectorAll('input');
        const id = i.value.trim();
        const qty = Math.floor(Number(q.value));
        if (!id) continue;
        if (!ITEMS[id]) throw new Error(`Unknown item "${id}". Pick one from the list.`);
        if (qty > 0) items[id] = qty;
      }
      const v = { coins: Math.floor(Number(coins.value) || 0), gems: Math.floor(Number(gems.value) || 0), land: Math.floor(Number(land.value) || 0), items, message: msg.value.trim() };
      if (!v.coins && !v.gems && !v.land && !Object.keys(items).length) return null;
      return v;
    },
  };
}

export function describeGift(g: { coins: number; gems: number; land: number; items: Record<string, number> }): string {
  const parts: string[] = [];
  if (g.coins) parts.push(`${num(g.coins)} coins`);
  if (g.gems) parts.push(`${num(g.gems)} gems`);
  if (g.land) parts.push(`${g.land} land ${g.land === 1 ? 'plot' : 'plots'}`);
  for (const [k, v] of Object.entries(g.items ?? {})) parts.push(`${num(v)} ${ITEMS[k]?.name ?? k}`);
  return parts.join(', ') || 'nothing';
}
