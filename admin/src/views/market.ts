import { rpc, type Listing } from '../api';
import { h, num, ago, loading, toast, fail, modal, field } from '../ui';
import { ITEMS } from '../../../src/data';
import { chartCard, hbars, type Point } from '../charts';

export async function marketView(host: HTMLElement): Promise<void> {
  const body = h('div');
  const load = () => loading(body, async () => {
    const r = await rpc<{ rows: Listing[]; items: { item: string; sold: number; qty: number; coins: number; avg: number }[] }>('admin_listings', { p_status: 'open', p_limit: 500 });
    const remove = async (l: Listing) => {
      const reason = h('input', { class: 'input', placeholder: 'e.g. price far too high' }) as HTMLInputElement;
      if (await modal('Take this listing down?', [h('p', null, `${l.qty} ${ITEMS[l.item]?.name ?? l.item} for ${num(l.price)} coins by ${l.seller_name}. They get the items back as a gift with your reason.`), field('Reason (they will see it)', reason)],
        [{ label: 'Cancel', value: 'no' }, { label: 'Take down', value: 'yes', kind: 'danger' }]) !== 'yes') return;
      try { await rpc('admin_remove_listing', { p_id: l.id, p_reason: reason.value }); toast('Listing taken down, items returned'); void load(); } catch (e) { fail(e); }
    };
    const pts: Point[] = r.items.slice(0, 12).map((i) => ({ label: ITEMS[i.item]?.name ?? i.item, value: i.coins, tip: `${i.sold} sales, ${num(i.qty)} items, about ${i.avg} coins each` }));
    body.replaceChildren(
      chartCard('Best sellers (30 days)', 'Coins spent on each item in the Shared Market', (el) => hbars(el, pts), pts, 'Coins'),
      h('section', { class: 'card' }, h('h3', null, `Open listings (${r.rows.length})`),
        r.rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' },
          h('thead', null, h('tr', null, ['Item', 'Price', 'Each', 'Seller', 'Listed', ''].map((t, i) => h('th', { class: i === 1 || i === 2 ? 'r' : '' }, t)))),
          h('tbody', null, r.rows.map((l) => h('tr', null, h('td', null, `${l.qty} ${ITEMS[l.item]?.name ?? l.item}`), h('td', { class: 'r' }, num(l.price)), h('td', { class: 'r' }, (l.price / l.qty).toFixed(1)),
            h('td', null, h('a', { href: `#/player/${l.seller_id}` }, l.seller_name)), h('td', null, ago(l.listed_at)),
            h('td', { class: 'r' }, h('button', { class: 'btn small', onclick: () => remove(l) }, 'Take down'))))))) : h('p', { class: 'muted' }, 'Nothing for sale right now.')));
  });
  host.append(h('div', { class: 'page-head' }, h('h1', null, 'Market')), body);
  await load();
}
