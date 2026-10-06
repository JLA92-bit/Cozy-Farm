import { rpc } from '../api';
import { h, num, ago, date, loading, toast, fail, download, bytes, slug, today } from '../ui';
import { saveFromSnapshot, suggestedMoney } from '../restore';

interface Row { id: number; user_id: string; name: string | null; source: 'cloud' | 'snapshot'; level: number | null; taken_at: string; bytes: number }

export async function backupsView(host: HTMLElement): Promise<void> {
  const body = h('div');
  const load = () => loading(body, async () => {
    const b = await rpc<{ count: number; players: number; bytes: number; last: string | null; rows: Row[] }>('admin_backups', { p_limit: 300 });
    const file = async (r: Row) => {
      try {
        const x = await rpc<{ data: unknown }>('admin_backup_data', { p_backup: r.id });
        const json = r.source === 'cloud' ? JSON.stringify(x.data, null, 1) : JSON.stringify(saveFromSnapshot(x.data, suggestedMoney(r.level ?? 1)));
        download(`cozy-acres-${slug(r.name ?? 'farm')}-backup-${r.taken_at.slice(0, 10)}.json`, json);
      } catch (e) { fail(e); }
    };
    body.replaceChildren(
      h('div', { class: 'tiles' },
        h('div', { class: 'tile card' }, h('div', { class: 'tile-label' }, 'Last backup'), h('div', { class: 'tile-value' }, b.last ? ago(b.last) : 'never'), h('div', { class: 'tile-sub' }, b.last ? date(b.last, true) : 'Press Back up now')),
        h('div', { class: 'tile card' }, h('div', { class: 'tile-label' }, 'Farms backed up'), h('div', { class: 'tile-value' }, num(b.players)), h('div', { class: 'tile-sub' }, `${num(b.count)} backups kept`)),
        h('div', { class: 'tile card' }, h('div', { class: 'tile-label' }, 'Space used'), h('div', { class: 'tile-value' }, bytes(b.bytes)), h('div', { class: 'tile-sub' }, 'Kept 60 days (newest always kept)'))),
      h('section', { class: 'card' }, h('h3', null, 'Recent backups'),
        b.rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' },
          h('thead', null, h('tr', null, ['Taken', 'Player', 'From', 'Level', 'Size', ''].map((t) => h('th', null, t)))),
          h('tbody', null, b.rows.map((r) => h('tr', null, h('td', null, date(r.taken_at, true)), h('td', null, h('a', { href: `#/player/${r.user_id}` }, r.name ?? 'Player')),
            h('td', null, r.source === 'cloud' ? 'Cloud save (everything)' : 'Farm layout'), h('td', null, r.level ? String(r.level) : '-'), h('td', null, bytes(r.bytes)),
            h('td', { class: 'r' }, h('button', { class: 'btn small', onclick: () => file(r) }, 'Download save file'))))))) : h('p', { class: 'muted' }, 'No backups yet.')));
  });
  const now = async () => { try { const n = await rpc<number>('admin_backup_now'); toast(n ? `${num(n)} farms backed up` : 'Nothing changed since the last backup'); void load(); } catch (e) { fail(e); } };
  const all = async () => {
    try {
      const rows = await rpc<unknown[]>('admin_backup_bundle');
      download(`cozy-acres-all-farms-${today()}.json`, JSON.stringify({ kind: 'cozy-acres-backup', made: new Date().toISOString(), farms: rows }));
      toast(`${num(rows.length)} farms in the file. Keep it somewhere safe and private.`);
    } catch (e) { fail(e); }
  };
  host.append(h('div', { class: 'page-head' }, h('h1', null, 'Backups'), h('div', { class: 'row' }, h('button', { class: 'btn', onclick: all }, 'Download everything'), h('button', { class: 'btn primary', onclick: now }, 'Back up all farms now'))),
    h('section', { class: 'card' }, h('ul', { class: 'plain' },
      h('li', null, 'Every farm is copied once a day at 03:17 UTC (when pg_cron is on in Supabase), and whenever you press Back up now. Farms that did not change are skipped.'),
      h('li', null, 'Google players: the whole save (coins, items, everything). Others: their farm layout, rebuilt into a playable save when you download it, with coins for their level.'),
      h('li', null, 'Send a player their file: in the game, Settings > Import save. Or make a short farm code from their player page.'),
      h('li', null, 'Download everything gives one file with every farm\'s newest backup. It holds player data: keep it private.'))),
    body);
  await load();
}
