import { rpc, type PlayerRow, type PlayerDetail } from '../api';
import { h, num, minutes, ago, date, loading, badge, modal, confirmAction, confirmTyped, toast, fail, download, csv, slug, today, field, copyText, bytes } from '../ui';
import { calendar } from '../charts';
import { giftForm, describeGift } from '../giftForm';
import { saveFromSnapshot, suggestedMoney, farmLinkData, farmMap } from '../restore';
import { refreshBadges } from '../main';

const PLATFORM: Record<string, string> = { android: 'Play app', pwa: 'Web app', web: 'Browser', ios: 'iOS' };
const FILTERS: [string, string][] = [['all', 'Everyone'], ['active7', 'Played this week'], ['new7', 'New this week'], ['inactive14', 'Away 2+ weeks'], ['google', 'Backed up with Google'], ['nobackup', 'No cloud backup'], ['gifts', 'Gift waiting'], ['hidden', 'Hidden from leaderboards']];
const SORTS: [string, string][] = [['last', 'Last seen'], ['level', 'Level'], ['minutes', 'Play time'], ['days', 'Days played'], ['created', 'Newest'], ['charm', 'Charm'], ['name', 'Name']];

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
        h('thead', null, h('tr', null, ['Player', 'Level', 'Last played', 'Days', 'Time', 'Where', 'Backup', ''].map((t, i) => h('th', { class: i >= 1 && i <= 4 ? 'r' : '' }, t)))),
        h('tbody', null, r.rows.map((p) => h('tr', { class: 'click', onclick: () => { location.hash = `#/player/${p.id}`; } },
          h('td', null, h('a', { href: `#/player/${p.id}`, onclick: (e: Event) => e.stopPropagation() }, p.name), h('div', { class: 'muted small' }, `${p.code}${p.farm_name ? ` - ${p.farm_name}` : ''}`)),
          h('td', { class: 'r' }, num(p.level)),
          h('td', { class: 'r' }, ago(p.last_day ?? p.updated_at)),
          h('td', { class: 'r' }, num(p.days)),
          h('td', { class: 'r' }, minutes(p.minutes)),
          h('td', null, p.platform ? PLATFORM[p.platform] ?? p.platform : '-', p.version ? h('span', { class: 'muted small' }, ` ${p.version}`) : null),
          h('td', null, p.cloud_at ? badge('Cloud save', 'good') : p.snap_at ? badge('Layout only', 'warn') : badge('None', 'bad'), p.email ? h('div', { class: 'muted small' }, 'Google') : null),
          h('td', null, p.lb_hidden ? badge('Hidden') : null, p.gifts_pending ? badge('Gift waiting', 'info') : null, p.push ? badge('Notifications') : null)))))) : h('p', { class: 'muted' }, 'No players match.'),
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
      download(`cozy-acres-players-${today()}.csv`, csv(r.rows as unknown as Record<string, unknown>[], ['name', 'code', 'farm_name', 'level', 'total_xp', 'charm', 'farm_value', 'created_at', 'updated_at', 'last_day', 'days', 'minutes', 'platform', 'version', 'email', 'cloud_at', 'snap_at', 'push', 'lb_hidden', 'id']), 'text/csv');
    } catch (e) { fail(e); }
  };
  host.append(
    h('div', { class: 'page-head' }, h('h1', null, 'Players'), h('button', { class: 'btn', onclick: exportCsv }, 'Export CSV')),
    h('div', { class: 'filters' }, search, filter, sort),
    list);
  await load();
}

// ------------------------------------------------------------------------------------ one player

export async function playerView(host: HTMLElement, id: string): Promise<void> {
  const draw = () => loading(host, async () => {
    const d = await rpc<PlayerDetail>('admin_player', { p_id: id });
    host.replaceChildren(...render(d, draw));
  });
  await draw();
}

function render(d: PlayerDetail, redraw: () => Promise<void>): HTMLElement[] {
  const p = d.profile;
  const name = p?.name ?? 'No farmer yet';
  const snapData = d.snapshot?.data;
  const days = new Map(d.days.map((x) => [x.day, { minutes: x.minutes, sessions: x.sessions }]));
  const totalMin = d.days.reduce((a, x) => a + x.minutes, 0);
  const lastDay = d.days[0];

  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast(ok); await redraw(); refreshBadges(); } catch (e) { fail(e); } };

  const give = async () => {
    const f = giftForm();
    const r = await modal(`Gift for ${name}`, f.el, [{ label: 'Cancel', value: 'no' }, { label: 'Send gift', value: 'yes', kind: 'primary' }]);
    if (r !== 'yes') return;
    let v;
    try { v = f.get(); } catch (e) { fail(e); return; }
    if (!v) { toast('The gift is empty', 'info'); return; }
    await act(() => rpc('admin_give', { p_ids: [d.id], p_audience: null, p_coins: v.coins, p_gems: v.gems, p_items: v.items, p_land: v.land, p_message: v.message || null }), `Gift on its way: ${describeGift(v)}`);
  };

  const fileName = (what: string) => `cozy-acres-${slug(name)}-${what}-${today()}.json`;
  const downloadCloud = async () => {
    try { download(fileName('cloud-save'), JSON.stringify(await rpc('admin_cloud_save', { p_id: d.id }), null, 1)); toast('Save file downloaded. They can load it in Settings > Import save.'); } catch (e) { fail(e); }
  };
  const rebuildSave = async (): Promise<string | null> => {
    const sug = suggestedMoney(p?.level ?? 1);
    const coins = h('input', { class: 'input', type: 'number', min: 0, value: String(sug.coins) }) as HTMLInputElement;
    const gems = h('input', { class: 'input', type: 'number', min: 0, value: String(sug.gems) }) as HTMLInputElement;
    const r = await modal('Rebuild from farm layout', [
      h('p', null, `This rebuilds ${name}'s farm from the layout neighbours see: land, buildings, decorations, animals and fields, at level ${p?.level ?? '?'}. Coins, gems and barn items are not in the layout, so choose what to give.`),
      h('div', { class: 'grid-2' }, field('Coins', coins, `Suggested for level ${p?.level}: ${num(sug.coins)}`), field('Gems', gems))],
      [{ label: 'Cancel', value: 'no' }, { label: 'Rebuild', value: 'yes', kind: 'primary' }]);
    if (r !== 'yes') return null;
    return JSON.stringify(saveFromSnapshot(snapData, { coins: Number(coins.value) || 0, gems: Number(gems.value) || 0 }));
  };
  const downloadRebuilt = async () => {
    try { const json = await rebuildSave(); if (json) { download(fileName('rebuilt'), json); toast('Rebuilt save downloaded. They can load it in Settings > Import save.'); } } catch (e) { fail(e); }
  };
  const makeCode = async (source: 'cloud' | 'layout') => {
    try {
      const json = source === 'cloud' ? JSON.stringify(await rpc('admin_cloud_save', { p_id: d.id })) : await rebuildSave();
      if (!json) return;
      const code = await rpc<string>('admin_make_farm_transfer', { p_data: await farmLinkData(json), p_note: `${name} restore (${source})` });
      await modal('Farm code ready', [h('p', null, `Send ${name} this code. In the game: Settings > Load a farm, type the code, Load farm.`), h('div', { class: 'big-code' }, code),
        h('p', { class: 'muted small' }, 'Works for 14 days, up to 5 loads. Their current farm is kept as a backup on their phone.')], [{ label: 'Copy code', value: 'copy' }, { label: 'Done', value: 'ok', kind: 'primary' }])
        .then((v) => { if (v === 'copy') void copyText(code); });
    } catch (e) { fail(e); }
  };
  const backupFile = async (bid: number, source: string) => {
    try {
      const b = await rpc<{ data: unknown; taken_at: string }>('admin_backup_data', { p_backup: bid });
      const json = source === 'cloud' ? JSON.stringify(b.data, null, 1) : JSON.stringify(saveFromSnapshot(b.data, suggestedMoney(p?.level ?? 1)));
      download(`cozy-acres-${slug(name)}-backup-${b.taken_at.slice(0, 10)}.json`, json);
    } catch (e) { fail(e); }
  };
  const addNote = async () => {
    const ta = h('textarea', { class: 'input', rows: 4, maxLength: 2000, placeholder: 'e.g. Restored farm from screenshots, sent 50,000 coins' }) as HTMLTextAreaElement;
    if (await modal('Add a note', ta, [{ label: 'Cancel', value: 'no' }, { label: 'Save note', value: 'yes', kind: 'primary' }]) !== 'yes' || !ta.value.trim()) return;
    await act(() => rpc('admin_add_note', { p_id: d.id, p_note: ta.value.trim() }), 'Note saved');
  };
  const del = async () => {
    if (!await confirmTyped(`Delete ${name}?`, `This removes ${name}'s online account: profile, friend code, cloud save, farm layout, gifts, market listings, backups and stats. The farm on their phone stays, as a new online account. This cannot be undone.`, 'DELETE')) { toast('Not deleted', 'info'); return; }
    try { await rpc('admin_delete_player', { p_id: d.id }); toast(`${name} deleted`); location.hash = '#/players'; } catch (e) { fail(e); }
  };

  const head = h('div', { class: 'page-head' },
    h('div', null, h('a', { href: '#/players', class: 'small' }, '← All players'),
      h('h1', null, name, p?.lb_hidden ? badge('Hidden from leaderboards') : null),
      h('div', { class: 'muted' }, [p?.farm_name, p?.code, d.auth?.email].filter(Boolean).join(' - '))),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn primary', onclick: give }, 'Give a gift'),
      p ? h('button', { class: 'btn', onclick: () => act(() => rpc('admin_set_hidden', { p_id: d.id, p_hidden: !p.lb_hidden }), p.lb_hidden ? 'Back on the leaderboards' : 'Hidden from the leaderboards') }, p.lb_hidden ? 'Show on leaderboards' : 'Hide from leaderboards') : null,
      h('button', { class: 'btn', onclick: addNote }, 'Add note'),
      h('button', { class: 'btn danger', onclick: del }, 'Delete player')));

  const stat = (k: string, v: string) => h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, k), h('div', { class: 'stat-value' }, v));
  const stats = h('div', { class: 'stats card' },
    stat('Level', num(p?.level ?? 0)), stat('Total XP', num(p?.total_xp ?? 0)), stat('Charm', num(p?.charm ?? 0)), stat('Farm value', num(p?.farm_value ?? 0)),
    stat('Days played', num(d.days.length)), stat('Play time', minutes(totalMin)), stat('Last played', ago(lastDay?.day ?? p?.updated_at)), stat('Joined', date(p?.created_at ?? d.auth?.created_at)),
    stat('Where', lastDay?.platform ? PLATFORM[lastDay.platform] ?? lastDay.platform : '-'), stat('Version', lastDay?.version ?? '-'),
    stat('Gifts sent / got', `${num(d.giftsSent)} / ${num(d.giftsReceived)}`), stat('Help given / got', `${num(d.helpGiven)} / ${num(d.helpReceived)}`));

  const backupCard = h('section', { class: 'card' }, h('h3', null, 'Farm backup and restore'),
    h('p', { class: 'small' }, d.cloud ? h('span', null, badge('Cloud save', 'good'), ` saved ${ago(d.cloud.updated_at)}${d.cloud.device ? ` from ${d.cloud.device}` : ''}, level ${d.cloud.level}, ${num(d.cloud.coins)} coins, ${bytes(d.cloud.bytes)}`)
      : h('span', null, badge('No cloud save', 'bad'), ' They have not signed in with Google, so only their farm layout is on the server.')),
    h('p', { class: 'small' }, d.snapshot ? `Farm layout shared ${ago(d.snapshot.updated_at)}.` : 'No farm layout shared yet.'),
    h('div', { class: 'row wrap' },
      d.cloud ? h('button', { class: 'btn', onclick: downloadCloud }, 'Download save file') : null,
      d.cloud ? h('button', { class: 'btn', onclick: () => makeCode('cloud') }, 'Farm code from cloud save') : null,
      snapData ? h('button', { class: 'btn', onclick: downloadRebuilt }, 'Download rebuilt save') : null,
      snapData ? h('button', { class: 'btn', onclick: () => makeCode('layout') }, 'Farm code from layout') : null),
    h('p', { class: 'muted small' }, 'Save files load in the game with Settings > Import save. Farm codes are typed in Settings > Load a farm.'),
    d.backups.length ? h('details', null, h('summary', null, `${d.backups.length} backups`),
      h('table', { class: 'table compact' }, h('tbody', null, d.backups.map((b) => h('tr', null, h('td', null, date(b.taken_at, true)), h('td', null, b.source === 'cloud' ? 'Cloud save' : 'Layout'),
        h('td', { class: 'r' }, b.level ? `Level ${b.level}` : ''), h('td', { class: 'r' }, bytes(b.bytes)),
        h('td', { class: 'r' }, h('button', { class: 'btn small', onclick: () => backupFile(b.id, b.source) }, 'Download'))))))) : h('p', { class: 'muted small' }, 'No backups yet (see Backups).'));

  const accountCard = h('section', { class: 'card' }, h('h3', null, 'Account'),
    h('table', { class: 'table compact' }, h('tbody', null, [
      ['Signed in with', d.auth?.providers.length ? d.auth.providers.join(', ') : 'Nothing (anonymous)'],
      ['Google email', d.auth?.email ?? '-'],
      ['Account created', date(d.auth?.created_at, true)],
      ['Last sign-in', date(d.auth?.last_sign_in_at, true)],
      ['Notifications', d.push.devices ? `${d.push.devices} device(s), last delivered ${ago(d.push.last_ok_at)}` : 'Off'],
      ['Account id', d.id],
    ].map(([k, v]) => h('tr', null, h('th', null, k), h('td', { class: 'mono-small' }, v))))));

  const cal = h('div');
  calendar(cal, days, 120);
  const activity = h('section', { class: 'card' }, h('h3', null, 'Play activity (last 4 months)'), cal,
    d.days.length ? h('details', null, h('summary', null, 'Day by day'), h('table', { class: 'table compact' },
      h('thead', null, h('tr', null, h('th', null, 'Day'), h('th', { class: 'r' }, 'Sessions'), h('th', { class: 'r' }, 'Minutes'), h('th', null, 'Where'), h('th', null, 'Version'))),
      h('tbody', null, d.days.slice(0, 60).map((x) => h('tr', null, h('td', null, date(x.day)), h('td', { class: 'r' }, num(x.sessions)), h('td', { class: 'r' }, num(x.minutes)), h('td', null, PLATFORM[x.platform ?? ''] ?? '-'), h('td', null, x.version ?? '-')))))) : h('p', { class: 'muted small' }, 'No play recorded yet (recorded from version 1.7.0).'));

  const gifts = h('section', { class: 'card' }, h('h3', null, 'Developer gifts'),
    d.adminGifts.length ? h('table', { class: 'table compact' }, h('tbody', null, d.adminGifts.map((g) => h('tr', null,
      h('td', null, date(g.created_at, true)), h('td', null, describeGift(g), g.message ? h('div', { class: 'muted small' }, `"${g.message}"`) : null),
      h('td', null, g.claimed_at ? badge(`Received ${ago(g.claimed_at)}`, 'good') : badge('Waiting', 'info')),
      h('td', { class: 'r' }, g.claimed_at ? null : h('button', { class: 'btn small', onclick: async () => { if (await confirmAction('Cancel this gift?', 'They will not get it.')) await act(() => rpc('admin_cancel_gift', { p_gift: g.id }), 'Gift cancelled'); } }, 'Cancel'))))))
      : h('p', { class: 'muted small' }, 'None yet.'));

  const notes = h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, 'Notes'), h('button', { class: 'btn small', onclick: addNote }, 'Add note')),
    d.notes.length ? h('ul', { class: 'notes' }, d.notes.map((n) => h('li', null, h('div', { class: 'muted small' }, `${date(n.at, true)} - ${n.admin}`), n.note,
      h('button', { class: 'link-btn small', style: { marginLeft: '10px' }, onclick: async () => { if (await confirmAction('Delete note?', n.note)) await act(() => rpc('admin_delete_note', { p_note: n.id }), 'Note deleted'); } }, 'Delete'))))
      : h('p', { class: 'muted small' }, 'Keep track of what you did for this player.'));

  const social = h('section', { class: 'card' }, h('h3', null, 'Gifts and market'),
    d.recentGifts.length ? h('details', null, h('summary', null, `Recent gifts with other players (${d.recentGifts.length})`), h('table', { class: 'table compact' }, h('tbody', null, d.recentGifts.map((g) => h('tr', null,
      h('td', null, date(g.sent_at)), h('td', null, g.from_id === d.id ? `To ${g.to ?? '?'}` : `From ${g.from}`), h('td', null, describeGift({ coins: g.coins, gems: 0, land: 0, items: g.items })), h('td', null, g.claimed ? 'Opened' : 'Not opened')))))) : h('p', { class: 'muted small' }, 'No gifts with other players.'),
    d.listings.length ? h('details', null, h('summary', null, `Market listings (${d.listings.length})`), h('table', { class: 'table compact' }, h('tbody', null, d.listings.map((l) => h('tr', null,
      h('td', null, date(l.listed_at)), h('td', null, `${l.qty} ${l.item}`), h('td', { class: 'r' }, `${num(l.price)} coins`), h('td', null, l.seller_id === d.id ? (l.status === 'sold' ? `Sold to ${l.buyer_name}` : l.status) : `Bought from ${l.seller_name}`)))))) : null,
    d.feedback.length ? h('details', { open: true }, h('summary', null, `Feedback (${d.feedback.length})`), h('ul', { class: 'notes' }, d.feedback.map((f) => h('li', null, h('div', { class: 'muted small' }, `${date(f.created_at, true)} - ${f.category} - ${f.status}`), f.message)))) : null);

  const farm = h('section', { class: 'card' }, h('h3', null, 'Their farm'), snapData ? farmMap(snapData) : h('p', { class: 'muted' }, 'No farm layout shared yet.'));

  return [head, stats, h('div', { class: 'grid-2' }, backupCard, accountCard), h('div', { class: 'grid-2' }, farm, h('div', { class: 'stack' }, activity, gifts)), h('div', { class: 'grid-2' }, notes, social)];
}
