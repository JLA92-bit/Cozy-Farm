import { rpc, type AdminGift } from '../api';
import { h, num, ago, date, loading, badge, modal, toast, fail, field, confirmAction } from '../ui';
import { giftForm, describeGift } from '../giftForm';

const AUDIENCES: [string, string][] = [['active7', 'Everyone who played this week'], ['active14', 'Everyone who played in the last 2 weeks'], ['active30', 'Everyone who played this month'], ['google', 'Everyone backed up with Google'], ['all', 'Every player']];

export async function giftsView(host: HTMLElement): Promise<void> {
  const list = h('div');
  const load = () => loading(list, async () => {
    const rows = await rpc<AdminGift[]>('admin_gifts_list', { p_limit: 300 });
    const waiting = rows.filter((g) => !g.claimed_at).length;
    list.replaceChildren(h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, 'Recent gifts'), h('span', { class: 'muted small' }, `${num(waiting)} waiting to be picked up`)),
      rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' },
        h('thead', null, h('tr', null, h('th', null, 'Sent'), h('th', null, 'Player'), h('th', null, 'Gift'), h('th', null, 'Status'), h('th', null, ''))),
        h('tbody', null, rows.map((g) => h('tr', null, h('td', null, date(g.created_at, true)), h('td', null, h('a', { href: `#/player/${g.user_id}` }, g.name ?? 'Player')),
          h('td', null, describeGift(g), g.message ? h('div', { class: 'muted small' }, `"${g.message}"`) : null),
          h('td', null, g.claimed_at ? badge(`Received ${ago(g.claimed_at)}`, 'good') : badge('Waiting', 'info')),
          h('td', { class: 'r' }, g.claimed_at ? null : h('button', { class: 'btn small', onclick: async () => {
            if (!await confirmAction('Cancel this gift?', 'They will not get it.')) return;
            try { await rpc('admin_cancel_gift', { p_gift: g.id }); toast('Gift cancelled'); void load(); } catch (e) { fail(e); }
          } }, 'Cancel'))))))) : h('p', { class: 'muted' }, 'No gifts sent yet.')));
  });
  const f = giftForm();
  const aud = h('select', { class: 'input' }, AUDIENCES.map(([v, t]) => h('option', { value: v }, t))) as HTMLSelectElement;
  const send = async () => {
    let v;
    try { v = f.get(); } catch (e) { fail(e); return; }
    if (!v) { toast('The gift is empty', 'info'); return; }
    const label = AUDIENCES.find(([k]) => k === aud.value)![1];
    if (await modal('Send to many players?', h('p', null, `${label} gets: ${describeGift(v)}.`), [{ label: 'Cancel', value: 'no' }, { label: 'Send', value: 'yes', kind: 'primary' }]) !== 'yes') return;
    try { const n = await rpc<number>('admin_give', { p_ids: null, p_audience: aud.value, p_coins: v.coins, p_gems: v.gems, p_items: v.items, p_land: v.land, p_message: v.message || null }); toast(`Gift sent to ${num(n)} players`); void load(); } catch (e) { fail(e); }
  };
  host.append(h('div', { class: 'page-head' }, h('h1', null, 'Gifts')),
    h('div', { class: 'grid-2' },
      h('section', { class: 'card' }, h('h3', null, 'Gift a group of players'), h('p', { class: 'muted small' }, 'To gift one player, open them from Players.'), field('Who', aud), f.el,
        h('button', { class: 'btn primary', onclick: send }, 'Send gift')),
      h('section', { class: 'card' }, h('h3', null, 'How gifts work'), h('ul', { class: 'plain' },
        h('li', null, 'The game checks for gifts when it opens and every few minutes. Players see "A gift for you!" with your message.'),
        h('li', null, 'Land plots open next to their farm for free, and later plots cost the same as if they had bought them.'),
        h('li', null, 'Each gift is received once. You can cancel it until it is picked up.'),
        h('li', null, 'Group gifts only go to players who already have a farmer.')))),
    list);
  await load();
}
