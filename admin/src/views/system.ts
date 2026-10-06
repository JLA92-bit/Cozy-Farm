import { rpc } from '../api';
import { h, num, bytes, loading, date, toast, fail, confirmAction } from '../ui';

interface Health { dbBytes: number; tables: { table: string; rows: number; bytes: number }[]; cron: { name: string; schedule: string; active: boolean }[]; cronFailures: { job: string; status: string; start: string; message: string }[]; users: number; anonymousNoFarm: number; emptyOld: number }
interface Log { id: number; at: string; admin: string; action: string; target: string | null; name: string | null; detail: Record<string, unknown> | null }

export async function systemView(host: HTMLElement): Promise<void> {
  const body = h('div');
  const load = () => loading(body, async () => {
    const [hl, log] = await Promise.all([rpc<Health>('admin_health'), rpc<Log[]>('admin_log_list', { p_limit: 300 })]);
    const LIMIT = 500 * 1048576;
    const cleanup = async () => {
      if (!await confirmAction('Remove empty accounts?', `${num(hl.emptyOld)} online accounts were made over 30 days ago and never created a farmer (someone opened the game and left). Remove them?`, 'Remove')) return;
      try { const n = await rpc<number>('admin_cleanup_accounts', { p_days: 30, p_dry_run: false }); toast(`${num(n)} empty accounts removed`); void load(); } catch (e) { fail(e); }
    };
    body.replaceChildren(
      h('div', { class: 'grid-2' },
        h('section', { class: 'card' }, h('h3', null, 'Database'),
          h('p', null, `${bytes(hl.dbBytes)} used of the 500 MB free plan (${Math.round((hl.dbBytes / LIMIT) * 100)}%).`),
          h('div', { class: 'progress' }, h('span', { style: { width: `${Math.min(100, (hl.dbBytes / LIMIT) * 100)}%` } })),
          h('table', { class: 'table compact' }, h('thead', null, h('tr', null, h('th', null, 'Table'), h('th', { class: 'r' }, 'Rows (about)'), h('th', { class: 'r' }, 'Size'))),
            h('tbody', null, hl.tables.map((t) => h('tr', null, h('td', { class: 'mono-small' }, t.table), h('td', { class: 'r' }, t.rows < 0 ? '-' : num(t.rows)), h('td', { class: 'r' }, bytes(t.bytes))))))),
        h('div', { class: 'stack' },
          h('section', { class: 'card' }, h('h3', null, 'Scheduled jobs'),
            hl.cron.length ? h('table', { class: 'table compact' }, h('tbody', null, hl.cron.map((c) => h('tr', null, h('td', null, c.name), h('td', { class: 'mono-small' }, c.schedule), h('td', null, c.active ? 'On' : 'Off')))))
              : h('p', { class: 'muted' }, 'pg_cron is not enabled: no automatic notifications or daily backups. See ONLINE.md.'),
            hl.cronFailures.length ? h('div', { class: 'error-box' }, h('b', null, 'Recent job failures'), h('ul', null, hl.cronFailures.map((f) => h('li', null, `${date(f.start, true)} ${f.job}: ${f.message}`)))) : h('p', { class: 'muted small' }, 'No job failures in the last 2 days.')),
          h('section', { class: 'card' }, h('h3', null, 'Accounts'),
            h('p', null, `${num(hl.users)} online accounts, ${num(hl.anonymousNoFarm)} never made a farmer (${num(hl.emptyOld)} of them older than 30 days).`),
            h('button', { class: 'btn', disabled: !hl.emptyOld, onclick: cleanup }, 'Remove old empty accounts')))),
      h('section', { class: 'card' }, h('h3', null, 'Admin log'), h('p', { class: 'muted small' }, 'Everything done from this dashboard.'),
        log.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' }, h('thead', null, h('tr', null, h('th', null, 'When'), h('th', null, 'What'), h('th', null, 'Player'), h('th', null, 'Details'))),
          h('tbody', null, log.map((l) => h('tr', null, h('td', null, date(l.at, true)), h('td', null, l.action), h('td', null, l.target ? h('a', { href: `#/player/${l.target}` }, l.name ?? 'player') : '-'),
            h('td', { class: 'mono-small' }, l.detail ? Object.entries(l.detail).filter(([, v]) => v !== null && v !== '' && !(typeof v === 'object' && !Object.keys(v as object).length)).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ') : '')))))) : h('p', { class: 'muted' }, 'Nothing yet.')));
  });
  host.append(h('div', { class: 'page-head' }, h('h1', null, 'System & log'), h('button', { class: 'btn', onclick: () => void load() }, 'Refresh')), body);
  await load();
}
