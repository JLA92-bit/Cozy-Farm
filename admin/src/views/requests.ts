import { rpc } from '../api';
import { h, num, pct, ago, loading } from '../ui';
import { ITEMS } from '../../../src/data';
import { chartCard, bars, hbars, type Point } from '../charts';

/** admin_help_overview() (supabase/schema.sql, 1.8 help). */
interface HelpOverview {
  days: number;
  totals: { asked: number; filled: number; partly: number; expired: number; cancelled: number; hazel: number; open: number; unitsAsked: number; unitsGiven: number; askers: number; avgFillMin: number; medianFillMin: number };
  fills: { n: number; units: number; auto: number; helpers: number; unclaimed: number };
  items: { item: string; asked: number; units: number; given: number; filled: number; players: number; reasons: Record<string, number> }[];
  reasons: Record<string, number>;
  helpers: { id: string; name: string; fills: number; units: number; auto: number; friends: number }[];
  daily: { day: string; asked: number; filled: number; fills: number }[];
  open: { id: string; requester: string; requester_name: string; item: string; qty: number; filled: number; reason: string; created_at: string; expires_at: string; friends: number; fills: number }[];
}

const REASON: Record<string, string> = { order: 'Orders', recipe: 'Workshop', truck: 'Truck', visit: 'Visitors', bundle: 'Bundles', other: 'Other' };
const name = (item: string) => ITEMS[item]?.name ?? item;
const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const mins = (m: number) => (m >= 120 ? `${(m / 60).toFixed(1)} h` : `${Math.round(m)} min`);

function tile(label: string, value: string, sub = ''): HTMLElement {
  return h('div', { class: 'tile card' }, h('div', { class: 'tile-label' }, label), h('div', { class: 'tile-value' }, value), sub ? h('div', { class: 'tile-sub' }, sub) : null);
}

/** Ask a friend (1.8): what players ask for, how often friends answer and who helps most. */
export async function requestsView(host: HTMLElement): Promise<void> {
  let days = 30;
  const draw = () => loading(host, async () => {
    const o = await rpc<HelpOverview>('admin_help_overview', { p_days: days });
    const t = o.totals;
    host.replaceChildren();
    const range = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Time range' }, [7, 30, 90].map((d) =>
      h('button', { class: d === days ? 'active' : '', onclick: () => { days = d; void draw(); } }, `${d} days`)));
    host.append(h('div', { class: 'page-head' },
      h('div', null, h('h1', null, 'Requests'), h('div', { class: 'muted small' }, 'Ask a friend: players asking their friends for items. Times in UTC.')),
      h('div', { class: 'row' }, range, h('button', { class: 'btn', onclick: () => void draw() }, 'Refresh'))));

    host.append(h('div', { class: 'tiles' },
      tile('Requests', num(t.asked), `${num(t.askers)} players asked, ${num(t.open)} open now`),
      tile('Filled by friends', pct(t.filled, t.asked), `${num(t.filled)} complete, ${num(t.partly)} partly`),
      tile('Time to fill', t.filled ? mins(t.medianFillMin) : '-', t.filled ? `median (average ${mins(t.avgFillMin)})` : 'no filled requests yet'),
      tile('Items given', num(t.unitsGiven), `of ${num(t.unitsAsked)} asked for (${pct(t.unitsGiven, t.unitsAsked)})`),
      tile('Sends', num(o.fills.n), `${num(o.fills.helpers)} helpers, ${pct(o.fills.auto, o.fills.n)} by Auto-help`),
      tile('Hazel finished', num(t.hazel), `${num(t.expired)} expired, ${num(t.cancelled)} taken back`),
    ));

    const daily: Point[] = o.daily.map((d) => ({ label: short(d.day), value: d.asked, tip: `${d.asked} asked, ${d.filled} filled, ${d.fills} sends` }));
    const items: Point[] = o.items.slice(0, 15).map((i) => ({ label: name(i.item), value: i.asked, tip: `${i.asked} requests by ${i.players} players, ${i.units} wanted, ${i.given} given (${pct(i.filled, i.asked)} filled)` }));
    const reasons: Point[] = Object.entries(o.reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: REASON[k] ?? k, value: v }));
    host.append(h('div', { class: 'grid-2' },
      chartCard('Most asked for', 'A strong balance hint: these are hard to get', (el) => hbars(el, items), items, 'Requests'),
      chartCard('Requests each day', `Last ${Math.min(days, 60)} days`, (el) => bars(el, daily), daily, 'Requests'),
      chartCard('What players ask for', 'The reason picked in the Ask sheet', (el) => hbars(el, reasons), reasons, 'Requests'),
      h('section', { class: 'card' }, h('h3', null, 'Most helpful players'),
        o.helpers.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' },
          h('thead', null, h('tr', null, ['Player', 'Sends', 'Items', 'Auto', 'Friends helped'].map((x, i) => h('th', { class: i ? 'r' : '' }, x)))),
          h('tbody', null, o.helpers.map((p) => h('tr', null, h('td', null, h('a', { href: `#/player/${p.id}` }, p.name)),
            h('td', { class: 'r' }, num(p.fills)), h('td', { class: 'r' }, num(p.units)), h('td', { class: 'r' }, num(p.auto)), h('td', { class: 'r' }, num(p.friends)))))))
          : h('p', { class: 'muted' }, 'Nobody has helped yet.')),
    ));

    host.append(h('section', { class: 'card' }, h('h3', null, `Open requests (${o.open.length})`),
      o.open.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' },
        h('thead', null, h('tr', null, ['Player', 'Item', 'Arrived', 'For', 'Friends', 'Asked', 'Closes'].map((x, i) => h('th', { class: i === 2 || i === 4 ? 'r' : '' }, x)))),
        h('tbody', null, o.open.map((r) => h('tr', null,
          h('td', null, h('a', { href: `#/player/${r.requester}` }, r.requester_name)),
          h('td', null, `${r.qty} ${name(r.item)}`),
          h('td', { class: 'r' }, `${r.filled}/${r.qty}`),
          h('td', null, REASON[r.reason] ?? r.reason),
          h('td', { class: 'r' }, num(r.friends)),
          h('td', null, ago(r.created_at)),
          h('td', null, new Date(r.expires_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })))))))
        : h('p', { class: 'muted' }, 'No open requests right now.')));

    if (o.fills.unclaimed) host.append(h('p', { class: 'muted small' }, `${num(o.fills.unclaimed)} sends have not reached the asker yet (they arrive the next time that player opens the game).`));
  });
  await draw();
}
