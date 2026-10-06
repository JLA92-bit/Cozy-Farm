import { rpc } from '../api';
import { h, num, loading, badge, toast, fail } from '../ui';

interface Row { id: string; name: string; code: string; level: number; total_xp: number; farm_value: number; charm: number; weekly_xp: number; lb_hidden: boolean }
const KINDS: [string, string, (r: Row) => string][] = [
  ['level', 'Level', (r) => `Level ${r.level} - ${num(r.total_xp)} XP`], ['weekly', 'This week', (r) => `${num(r.weekly_xp)} XP`],
  ['farmValue', 'Farm value', (r) => num(r.farm_value)], ['charm', 'Charm', (r) => `${num(r.charm)} charm`]];
let kind = 'level';

export async function leaderboardsView(host: HTMLElement): Promise<void> {
  const tabs = h('div', { class: 'segmented', role: 'group' });
  const list = h('div');
  const load = () => loading(list, async () => {
    tabs.replaceChildren(...KINDS.map(([k, t]) => h('button', { class: k === kind ? 'active' : '', onclick: () => { kind = k; void load(); } }, t)));
    const rows = await rpc<Row[]>('admin_leaderboard', { p_kind: kind, p_limit: 100 });
    const show = KINDS.find(([k]) => k === kind)![2];
    let rank = 0;
    list.replaceChildren(h('section', { class: 'card' }, h('p', { class: 'muted small' }, 'Hidden players are left out of the leaderboards players see (they still play normally, and keep their friends). Ranks below skip them.'),
      h('table', { class: 'table compact' }, h('tbody', null, rows.map((r) => h('tr', { class: r.lb_hidden ? 'dim' : '' },
        h('td', { class: 'r muted' }, r.lb_hidden ? '-' : String(++rank)), h('td', null, h('a', { href: `#/player/${r.id}` }, r.name), h('span', { class: 'muted small' }, ` ${r.code}`), r.lb_hidden ? badge('Hidden') : null),
        h('td', { class: 'r' }, show(r)),
        h('td', { class: 'r' }, h('button', { class: 'btn small', onclick: async () => {
          try { await rpc('admin_set_hidden', { p_id: r.id, p_hidden: !r.lb_hidden }); toast(r.lb_hidden ? `${r.name} is back on the leaderboards` : `${r.name} hidden from the leaderboards`); void load(); } catch (e) { fail(e); }
        } }, r.lb_hidden ? 'Show' : 'Hide'))))))));
  });
  host.append(h('div', { class: 'page-head' }, h('h1', null, 'Leaderboards'), tabs), list);
  await load();
}
