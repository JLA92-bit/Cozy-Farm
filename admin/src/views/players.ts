import { rpc, type PlayerRow } from '../api';
import { h, num, minutes, ago, loading, badge, fail, download, csv, today } from '../ui';

const PLATFORM: Record<string, string> = { android: 'Play app', pwa: 'Web app', web: 'Browser', ios: 'iOS' };
const FILTERS: [string, string][] = [['all', 'Everyone'], ['online', 'Playing right now'], ['today', 'Played today'], ['active7', 'Played this week'], ['new7', 'New this week'], ['regulars', 'Regulars (30+ days)'], ['drifting', 'Drifting away (gone 1-4 weeks)'], ['inactive14', 'Away 2+ weeks'], ['level60', 'Level 60 and up'], ['google', 'Backed up with Google'], ['nobackup', 'No cloud backup'], ['push', 'Notifications on'], ['feedback', 'New feedback'], ['gifts', 'Gift waiting'], ['notes', 'Has notes'], ['locked', 'Locked accounts'], ['flagged', 'Leaderboard flag'], ['hidden', 'Hidden from leaderboards']];
const SORTS: [string, string][] = [['last', 'Last seen'], ['level', 'Level'], ['xp', 'Total XP'], ['value', 'Farm value'], ['charm', 'Charm'], ['week', 'XP this week'], ['min7', 'Play time this week'], ['minutes', 'Play time'], ['days', 'Days played'], ['sessions', 'Sessions'], ['created', 'Newest'], ['name', 'Name']];

let state = { q: '', filter: 'all', sort: 'last', page: 0 };
const PAGE = 50;

export async function playersView(host: HTMLElement): Promise<void> {
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Name, farm, friend code, email or id', value: state.q, 'aria-label': 'Search players' }) as HTMLInputElement;
  const filter = h('select', { class: 'input', 'aria-label': 'Filter' }, FILTERS.map(([v, t]) => h('option', { value: v, selected: v === state.filter }, t))) as HTMLSelectElement;
  const sort = h('select', { class: 'input', 'aria-label': 'Sort by' }, SORTS.map(([v, t]) => h('option', { value: v, selected: v === state.sort }, `Sort: ${t}`))) as HTMLSelectElement;
  const list = h('div');
  const load = () => loading(list, async () => {
    const r = await rpc<{ total: number; rows: PlayerRow[] }>('admin_players', { p_search: state.q || null, p_filter: state.filter, p_sort: state.sort, p_limit: PAGE, p_offset: state.page * PAGE });
    list.replaceChildren(
      h('div', { class: 'muted small', style: { margin: '4px 0 8px' } }, `${num(r.total)} players`),
      r.rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table players' },
        h('thead', null, h('tr', null, ['Player', 'Level', 'Last played', 'This week', 'Days', 'Time', 'Where', 'Backup', ''].map((t, i) => h('th', { class: i >= 1 && i <= 5 ? 'r' : '' }, t)))),
        h('tbody', null, r.rows.map((p) => h('tr', { class: 'click', onclick: () => { location.hash = `#/player/${p.id}`; } },
          h('td', null, h('a', { href: `#/player/${p.id}`, onclick: (e: Event) => e.stopPropagation() }, p.name), h('div', { class: 'muted small' }, `${p.code}${p.farm_name ? ` - ${p.farm_name}` : ''}`)),
          h('td', { class: 'r' }, num(p.level)),
          h('td', { class: 'r' }, Date.now() - new Date(p.updated_at).getTime() < 180000 ? badge('Now', 'good') : ago(p.last_day ?? p.updated_at)),
          h('td', { class: 'r' }, p.min7 ? minutes(p.min7) : '-'),
          h('td', { class: 'r' }, num(p.days)),
          h('td', { class: 'r' }, minutes(p.minutes)),
          h('td', null, p.platform ? PLATFORM[p.platform] ?? p.platform : '-', p.version ? h('span', { class: 'muted small' }, ` ${p.version}`) : null),
          h('td', null, p.cloud_at ? badge('Cloud save', 'good') : p.snap_at ? badge('Layout only', 'warn') : badge('None', 'bad'), p.email ? h('div', { class: 'muted small' }, 'Google') : null),
          h('td', null, p.locked ? badge(p.locked_until ? `Locked until ${new Date(p.locked_until).toLocaleDateString()}` : 'Locked', 'bad') : null, p.lb_flag ? badge('Flag', 'bad') : null, p.lb_hidden ? badge('Hidden') : null, p.feedback_new ? badge('Feedback', 'warn') : null, p.gifts_pending ? badge('Gift waiting', 'info') : null, p.notes ? badge(`${p.notes} notes`) : null, p.push ? badge('Notifications') : null)))))) : h('p', { class: 'muted' }, 'No players match.'),
      h('div', { class: 'row pager' },
        h('button', { class: 'btn small', disabled: state.page === 0, onclick: () => { state.page--; void load(); } }, 'Previous'),
        h('span', { class: 'muted small' }, `Page ${state.page + 1} of ${Math.max(1, Math.ceil(r.total / PAGE))}`),
        h('button', { class: 'btn small', disabled: (state.page + 1) * PAGE >= r.total, onclick: () => { state.page++; void load(); } }, 'Next')));
  });
  let timer = 0;
  search.addEventListener('input', () => { clearTimeout(timer); timer = window.setTimeout(() => { state = { ...state, q: search.value.trim(), page: 0 }; void load(); }, 300); });
  filter.addEventListener('change', () => { state = { ...state, filter: filter.value, page: 0 }; void load(); });
  sort.addEventListener('change', () => { state = { ...state, sort: sort.value, page: 0 }; void load(); });
  const exportCsv = async () => {
    try {
      const r = await rpc<{ rows: PlayerRow[] }>('admin_players', { p_search: state.q || null, p_filter: state.filter, p_sort: state.sort, p_limit: 5000, p_offset: 0 });
      download(`cozy-acres-players-${today()}.csv`, csv(r.rows as unknown as Record<string, unknown>[], ['name', 'code', 'farm_name', 'level', 'total_xp', 'weekly_xp', 'charm', 'farm_value', 'created_at', 'updated_at', 'last_day', 'days', 'sessions', 'minutes', 'min7', 'platform', 'version', 'email', 'cloud_at', 'snap_at', 'push', 'lb_hidden', 'lb_flag', 'feedback_new', 'notes', 'id']), 'text/csv');
    } catch (e) { fail(e); }
  };
  host.append(
    h('div', { class: 'page-head' }, h('h1', null, 'Players'), h('button', { class: 'btn', onclick: exportCsv }, 'Export CSV')),
    h('div', { class: 'filters' }, search, filter, sort),
    list);
  await load();
}
