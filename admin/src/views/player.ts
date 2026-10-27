import { playerReportsCard } from './reports';
import { playerVisitsCard } from './visits';
import { rpc, type PlayerDetail } from '../api';
import { h, num, minutes, ago, date, loading, badge, modal, confirmAction, confirmTyped, toast, fail, download, slug, today, field, copyText, bytes, compact, pct } from '../ui';
import { calendar, bars, chartCard, type Point } from '../charts';
import { giftForm, describeGift } from '../giftForm';
import { needsTab, type NeedsSave } from './needs';
import { saveFromSnapshot, suggestedMoney, farmLinkData, farmMap } from '../restore';
import { refreshBadges } from '../main';
import {
  ACHIEVEMENTS, BUILDING, FARMHANDS, ITEMS, LATEST_VERSION, MUSEUM, PROJECT_GROUPS, SKILLS, VILLAGERS, WILDLIFE,
  iconUrl, nameOf, skillLevel, xpToNext,
} from '../gamedata';

/**
 * One player, everything we know (ADMIN.md "Player page"): their profile and account, their full cloud save read
 * into tabs (farm, barn, progress, lifetime stats), when and how they play, who they play with, and every support
 * action in one toolbar. Data: admin_player, admin_player_deep and admin_player_save (supabase/schema.sql).
 */

const PLATFORM: Record<string, string> = { android: 'Play app', pwa: 'Web app', web: 'Browser', ios: 'iOS' };
const TABS = [
  ['overview', 'Overview'], ['farm', 'Farm'], ['barn', 'Barn and items'], ['progress', 'Progress'], ['needs', 'Needs'], ['stats', 'Lifetime stats'],
  ['activity', 'Activity'], ['social', 'Friends and social'], ['support', 'Support'], ['raw', 'Raw data'],
] as const;
type Tab = typeof TABS[number][0];
const TAB_KEY = 'cozy-admin-player-tab';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface Deep {
  events: { at: string; kind: string; detail: Record<string, unknown> }[];
  eventKinds: Record<string, number>;
  hours: number[]; weekdays: number[];
  ranks: { players: number; level: number; xp: number; value: number; charm: number; weekly: number; minutesPct: number; medianLevel: number | null; medianMinutes: number | null } | null;
  contacts: { id: string; name: string; level: number; giftsOut: number; giftsIn: number; helpOut: number; helpIn: number; coop: number }[];
  askHelp: { at: string; item: string; qty: number; filled: number; reason: string; closed: string | null }[];
  askFilled: number;
  letters: { title: string; audience: string; sent: string; delivered: string | null }[];
  pushQueue: { kind: string; title: string; body: string; fire: string; sent: string | null; status: string | null }[];
  codes: { code: string; at: string }[];
  adminLog: { at: string; admin: string; action: string; detail: Record<string, unknown> | null }[];
  coopGifts: { at: string; item: string; qty: number; kind: string; host: string }[];
  refusal: { at: string; reason: string; bytes: number; buildings: number; times: number } | null;
  saveAt: string | null;
}

interface Building { uid: number; type: string; x: number; z: number; level: number; buildEnd?: number; wear?: number; plot?: { crop: string; plantedAt: number; growSec: number } | null; tree?: { readyAt: number }; animals?: { fedAt: number | null; name?: string; love?: number; sickAt?: number }[]; queue?: { recipe: string; end: number }[]; ready?: string[] }
interface Save {
  version?: number; createdAt?: number; lastSeen?: number; lastSeenVersion?: string;
  player?: { name: string; level: number; xp: number; coins: number; gems: number; look?: Record<string, string> };
  inventory?: Record<string, number>; storage?: Record<string, number>; quality?: Record<string, [number, number]>;
  buildings?: Building[]; obstacles?: unknown[]; land?: { unlocked: string[]; bought: number };
  stats?: Record<string, number>; achievements?: Record<string, number>; collection?: Record<string, number>; cosmetics?: string[];
  daily?: { streak: number; best: number; lastDay: string };
  quests?: { daily?: { text: string; claimed: boolean }[]; weekly?: { text: string; claimed: boolean }[] };
  village?: { friends?: Record<string, { points: number; gifts: number; stories?: number[] }> };
  skills?: { xp?: Record<string, number>; perks?: Record<string, string[]> };
  restoration?: { done?: string[]; given?: Record<string, Record<string, Record<string, number>>>; festival?: number; manor?: number };
  wildlife?: { photos?: Record<string, { first: number; n: number }>; sets?: string[] };
  museum?: { donated?: Record<string, string[]>; done?: string[]; curator?: boolean };
  mastery?: { done?: string[]; picks?: Record<string, string> };
  farmhands?: { hired?: { id: string; chore: string }[] };
  coop?: { plaques?: { kind: string; host: string; names: string[]; at: number }[] };
  master?: { streak?: number; best?: number; week?: string };
  festivals?: { best?: Record<string, number>; done?: Record<string, number> };
  fishing?: { caught?: Record<string, number>; casts?: number };
  woods?: { critters?: Record<string, { visits: number }>; notesDone?: number };
  social?: { friends?: { id: string; name: string; code: string; addedAt: number }[] };
  mail?: { letters?: { id: number; at: number; from: string; title?: string; read?: boolean }[] };
  weeklyXp?: { week: string; xp: number };
  tutorial?: { done: boolean };
  endless?: { marker: number };
}

// ------------------------------------------------------------------------------------------- page

export async function playerView(host: HTMLElement, id: string): Promise<void> {
  let tab: Tab = 'overview';
  try { const t = localStorage.getItem(TAB_KEY); if (TABS.some(([k]) => k === t)) tab = t as Tab; } catch { /* blocked */ }
  const draw = () => loading(host, async () => {
    const [d, deep, locks] = await Promise.all([rpc<PlayerDetail>('admin_player', { p_id: id }), rpc<Deep>('admin_player_deep', { p_id: id }).catch(() => null),
      rpc<Lock[]>('admin_player_locks', { p_id: id }).catch(() => [] as Lock[])]);
    // the save is only fetched for Google players (and logged); everyone else has the farm layout only
    const save = d.cloud ? await rpc<Save | null>('admin_player_save', { p_id: id }).catch(() => null) : null;
    const ctx: Ctx = { d, deep, save, locks, redraw: draw };
    const body = h('div');
    const tabBar = h('div', { class: 'ptabs', role: 'tablist' });
    const show = (t: Tab) => {
      tab = t;
      try { localStorage.setItem(TAB_KEY, t); } catch { /* blocked */ }
      tabBar.replaceChildren(...TABS.map(([k, label]) => h('button', { class: k === t ? 'active' : '', role: 'tab', 'aria-selected': String(k === t), onclick: () => show(k) }, label)));
      body.replaceChildren(...tabContent(t, ctx));
    };
    host.replaceChildren(header(ctx), toolbar(ctx), tabBar, body);
    show(tab);
  });
  await draw();
}

interface Ctx { d: PlayerDetail; deep: Deep | null; save: Save | null; locks: Lock[]; redraw: () => Promise<void> }
/** admin_player_locks: every lock this player has had (supabase/schema.sql "account locks"). */
interface Lock { id: number; lockedAt: string; until: string | null; reason: string; by: string | null; liftedAt: string | null; liftedBy: string | null; active: boolean }

const activeLock = (c: Ctx): Lock | undefined => c.locks.find((l) => l.active && (!l.until || new Date(l.until).getTime() > Date.now()));

/** "2 days 03:14:22" until `iso`, updated every second while the element is on the page. */
function liveCountdown(iso: string | null): HTMLElement {
  const el = h('span', { class: 'mono-small' });
  if (!iso) { el.textContent = 'no end date'; return el; }
  const end = new Date(iso).getTime();
  const two = (n: number) => String(n).padStart(2, '0');
  const draw = () => {
    const s = Math.max(0, Math.floor((end - Date.now()) / 1000));
    const d = Math.floor(s / 86400);
    el.textContent = `${d ? `${d} day${d === 1 ? '' : 's'} ` : ''}${two(Math.floor((s % 86400) / 3600))}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)} left`;
  };
  draw();
  // stops once the element has been on the page and is gone again (the page was redrawn or left)
  const t = window.setInterval(() => {
    if (el.isConnected) el.dataset.shown = '1';
    else if (el.dataset.shown) { window.clearInterval(t); return; }
    draw();
  }, 1000);
  return el;
}

/** What the locked player reads on their lock screen (src/online/Lock.ts), for the preview. */
function lockSentence(until: Date | null): string {
  return until ? `You have been locked out of Cozy Acres until ${until.toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })}.` : 'You have been locked out of Cozy Acres.';
}

async function lockDialog(c: Ctx): Promise<void> {
  const name = nameOfPlayer(c), cur = activeLock(c);
  const DURATIONS: [string, string, number | null][] = [['1h', '1 hour', 3600e3], ['6h', '6 hours', 6 * 3600e3], ['1d', '1 day', 86400e3], ['3d', '3 days', 3 * 86400e3],
    ['7d', '1 week', 7 * 86400e3], ['14d', '2 weeks', 14 * 86400e3], ['30d', '30 days', 30 * 86400e3], ['custom', 'Pick a date and time', null], ['forever', 'No end date (until I unlock it)', null]];
  const sel = h('select', { class: 'input' }, DURATIONS.map(([v, t]) => h('option', { value: v, selected: v === '1d' }, t))) as HTMLSelectElement;
  const pad = (n: number) => String(n).padStart(2, '0');
  const local = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const custom = h('input', { class: 'input', type: 'datetime-local', min: local(new Date(Date.now() + 60000)), value: local(new Date(Date.now() + 86400e3)) }) as HTMLInputElement;
  const reason = h('textarea', { class: 'input', rows: 4, maxLength: 500, placeholder: 'e.g. Unkind gift notes to other players. Please be kind to everyone in the village.' }) as HTMLTextAreaElement;
  if (cur) reason.value = cur.reason;
  const customRow = h('div', null, field('Locked until', custom, 'In your own time zone.'));
  const preview = h('div', { class: 'lock-preview' });
  const until = (): Date | null | undefined => {
    const v = sel.value;
    if (v === 'forever') return null;
    if (v === 'custom') { const t = new Date(custom.value); return Number.isFinite(t.getTime()) ? t : undefined; }
    const ms = DURATIONS.find(([k]) => k === v)?.[2];
    return ms ? new Date(Date.now() + ms) : undefined;
  };
  const draw = () => {
    customRow.style.display = sel.value === 'custom' ? '' : 'none';
    const u = until();
    preview.replaceChildren(h('div', { class: 'lock-preview-title' }, 'Your account is locked'), h('p', null, u === undefined ? 'Pick a time in the future.' : lockSentence(u)),
      h('div', { class: 'muted small' }, 'Reason'), h('p', { class: 'lock-preview-reason' }, reason.value.trim() || '(your reason appears here)'),
      h('div', { class: 'muted small' }, 'Time remaining'), h('p', { class: 'lock-preview-count' }, u ? '(a live countdown)' : u === null ? 'No end date' : '-'));
  };
  for (const x of [sel, custom, reason]) x.addEventListener('input', draw);
  sel.addEventListener('change', draw);
  draw();
  const r = await modal(cur ? `Change ${name}'s lock` : `Lock ${name}'s account`, [
    h('p', { class: 'small' }, `While locked, ${name} sees the notice below over the game and cannot play. The server also refuses their gifts, market, help and likes, Ask a friend, Village Projects, farm sharing and reward codes, and they are hidden from the leaderboards. Their farm is kept as it is.`),
    field('How long', sel), customRow,
    field('Reason (they will see this)', reason, 'Up to 500 characters. Keep it calm and clear.'),
    h('div', { class: 'muted small' }, 'What they will see:'), preview,
  ], [{ label: 'Cancel', value: 'no' }, { label: cur ? 'Update lock' : 'Lock account', value: 'yes', kind: 'danger' }], true);
  if (r !== 'yes') return;
  const u = until();
  if (u === undefined || (u && u.getTime() <= Date.now())) { toast('Pick a time in the future', 'info'); return; }
  if (!reason.value.trim()) { toast('Write the reason they will see', 'info'); return; }
  try {
    await rpc('admin_lock_player', { p_id: c.d.id, p_until: u ? u.toISOString() : null, p_reason: reason.value.trim() });
    toast(u ? `${name} is locked until ${u.toLocaleString()}` : `${name} is locked with no end date`);
    await c.redraw();
  } catch (e) { fail(e); }
}

function tabContent(t: Tab, c: Ctx): HTMLElement[] {
  try {
    switch (t) {
      case 'overview': return overviewTab(c);
      case 'farm': return farmTab(c);
      case 'barn': return barnTab(c);
      case 'progress': return progressTab(c);
      case 'needs': return needsFor(c);
      case 'stats': return statsTab(c);
      case 'activity': return activityTab(c);
      case 'social': return socialTab(c);
      case 'support': return supportTab(c);
      case 'raw': return rawTab(c);
    }
  } catch (e) {
    console.error(e);
    return [h('section', { class: 'card' }, h('p', { class: 'error-box' }, `This tab could not be drawn: ${(e as Error).message}`))];
  }
}

// ------------------------------------------------------------------------------------------- helpers

const nameOfPlayer = (c: Ctx) => c.d.profile?.name ?? c.save?.player?.name ?? 'No farmer yet';
const stat = (k: string, v: string | HTMLElement, sub?: string) => h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, k), h('div', { class: 'stat-value' }, v), sub ? h('div', { class: 'muted small' }, sub) : null);
const tile = (label: string, value: string, sub = '') => h('div', { class: 'tile card' }, h('div', { class: 'tile-label' }, label), h('div', { class: 'tile-value' }, value), sub ? h('div', { class: 'tile-sub' }, sub) : null);
const card = (title: string, ...kids: (HTMLElement | string | null | false | undefined)[]) => h('section', { class: 'card' }, h('h3', null, title), ...kids.filter((k): k is HTMLElement | string => !!k));
const ico = (id: string) => h('img', { class: 'item-ico', src: iconUrl(id), alt: '', loading: 'lazy', onerror: (e: Event) => { (e.target as HTMLElement).style.visibility = 'hidden'; } });
const bar = (frac: number, kind = '') => h('div', { class: `progress ${kind}` }, h('span', { style: { width: `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%` } }));
const ms = (t: number | undefined) => (t ? new Date(t).toISOString() : null);
const kv = (rows: [string, string | HTMLElement | null][]) => h('table', { class: 'table compact' }, h('tbody', null, rows.map(([k, v]) => h('tr', null, h('th', null, k), h('td', null, v ?? '-')))));
const ord = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : Math.min(n % 10, 4) % 4] ?? 'th'}`;

function daysFrom(c: Ctx) {
  const ds = c.d.days;
  const todayUtc = new Date().toISOString().slice(0, 10);
  const back = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const inRange = (from: number, to: number) => ds.filter((x) => x.day > back(from) && x.day <= back(to));
  const last7 = inRange(7, 0), prev7 = inRange(14, 7), last30 = inRange(30, 0);
  const sum = (a: typeof ds) => a.reduce((s, x) => s + x.minutes, 0);
  // the current run of days in a row (today or yesterday counts as still going)
  const have = new Set(ds.map((x) => x.day));
  let streak = 0;
  for (let i = have.has(todayUtc) ? 0 : 1; have.has(back(i)); i++) streak++;
  const totalMin = sum(ds), sessions = ds.reduce((s, x) => s + x.sessions, 0);
  return { last7, prev7, last30, min7: sum(last7), minPrev7: sum(prev7), min30: sum(last30), streak, totalMin, sessions, todayUtc };
}

function playingNow(c: Ctx): boolean {
  const u = c.d.profile?.updated_at;
  return !!u && Date.now() - new Date(u).getTime() < 3 * 60000;
}

// ------------------------------------------------------------------------------------------- header and toolbar

function header(c: Ctx): HTMLElement {
  const p = c.d.profile, s = c.save, name = nameOfPlayer(c);
  const dd = daysFrom(c);
  const lastDay = c.d.days[0];
  const version = lastDay?.version ?? s?.lastSeenVersion ?? null;
  const lock = activeLock(c);
  const badges = [
    lock ? h('span', null, badge(lock.until ? `Locked until ${date(lock.until, true)}` : 'Locked, no end date', 'bad'), ' ', liveCountdown(lock.until)) : null,
    playingNow(c) ? badge('Playing now', 'good') : null,
    c.d.auth?.email ? badge('Google', 'info') : badge('Anonymous'),
    c.d.cloud ? badge('Cloud save', 'good') : badge('No cloud save', 'warn'),
    c.d.push.devices ? badge(`Notifications on (${c.d.push.devices})`, 'info') : null,
    p?.lb_hidden ? badge('Hidden from leaderboards', 'warn') : null,
    (p as unknown as { lb_flag?: string })?.lb_flag ? badge('Leaderboard flag', 'bad') : null,
    version && LATEST_VERSION && version !== LATEST_VERSION ? badge(`Old version ${version}`, 'warn') : version ? badge(`Version ${version}`) : null,
    dd.min7 === 0 && c.d.days.length ? badge('Not played this week', 'warn') : null,
    c.d.days.length && new Date(c.d.days[c.d.days.length - 1].day).getTime() > Date.now() - 7 * 86400000 ? badge('New this week', 'info') : null,
  ];
  const look = (p?.look ?? s?.player?.look ?? {}) as Record<string, string>;
  const swatch = (col?: string) => col && /^#[0-9a-f]{6}$/i.test(col) ? h('span', { class: 'swatch', style: { background: col }, title: col }) : null;
  return h('div', { class: 'phead card' },
    h('div', { class: 'phead-main' },
      h('a', { href: '#/players', class: 'small' }, '← All players'),
      h('h1', null, name),
      h('div', { class: 'muted' }, [p?.farm_name, p?.code, c.d.auth?.email].filter(Boolean).join(' - ')),
      h('div', { class: 'row wrap', style: { marginTop: '6px' } }, ...badges.filter((b): b is HTMLElement => !!b)),
      h('div', { class: 'row wrap small muted', style: { marginTop: '6px' } }, 'Look:', swatch(look.skin), swatch(look.hair), swatch(look.top), swatch(look.bottom),
        [look.body, look.hat !== 'none' ? look.hat : '', look.accessory !== 'none' ? look.accessory : '', look.pet && look.pet !== 'none' ? `pet ${look.pet}` : ''].filter(Boolean).join(', '))),
    h('div', { class: 'phead-nums' },
      stat('Level', num(p?.level ?? s?.player?.level ?? 0)),
      stat('Coins', s?.player ? compact(s.player.coins) : '-'),
      stat('Gems', s?.player ? num(s.player.gems) : '-'),
      stat('Days played', num(c.d.days.length)),
      stat('Play time', minutes(dd.totalMin)),
      stat('Last played', playingNow(c) ? 'Now' : ago(lastDay?.last_at ?? lastDay?.day ?? p?.updated_at))));
}

function toolbar(c: Ctx): HTMLElement {
  const { d } = c;
  const p = d.profile, name = nameOfPlayer(c);
  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast(ok); await c.redraw(); refreshBadges(); } catch (e) { fail(e); } };
  const give = async () => {
    const f = giftForm();
    if (await modal(`Gift for ${name}`, f.el, [{ label: 'Cancel', value: 'no' }, { label: 'Send gift', value: 'yes', kind: 'primary' }]) !== 'yes') return;
    let v;
    try { v = f.get(); } catch (e) { fail(e); return; }
    if (!v) { toast('The gift is empty', 'info'); return; }
    await act(() => rpc('admin_give', { p_ids: [d.id], p_audience: null, p_coins: v.coins, p_gems: v.gems, p_items: v.items, p_land: v.land, p_message: v.message || null }), `Gift on its way: ${describeGift(v)}`);
  };
  const compose = async (title: string, what: string, maxBody: number, fn: (t: string, b: string) => Promise<unknown>, ok: string, hint: string) => {
    const t = h('input', { class: 'input', maxLength: 80, placeholder: 'Title' }) as HTMLInputElement;
    const b = h('textarea', { class: 'input', rows: maxBody > 300 ? 6 : 3, maxLength: maxBody, placeholder: what }) as HTMLTextAreaElement;
    if (await modal(title, [field('Title', t), field('Message', b, hint)], [{ label: 'Cancel', value: 'no' }, { label: 'Send', value: 'yes', kind: 'primary' }]) !== 'yes') return;
    if (!t.value.trim() || !b.value.trim()) { toast('Write a title and a message first', 'info'); return; }
    await act(() => fn(t.value.trim(), b.value.trim()), ok);
  };
  const letter = () => compose(`Letter to ${name}`, `Dear ${name}, ...`, 2000, (t, b) => rpc('admin_letter_to', { p_id: d.id, p_title: t, p_body: b }),
    'Letter sent. It arrives in their mailbox the next time they play.', 'Signed from the Cozy Acres team. Up to 2,000 characters.');
  const push = () => compose(`Notification to ${name}`, 'Short and friendly', 200, (t, b) => rpc('admin_push_to', { p_id: d.id, p_title: t, p_body: b }),
    'Notification queued. It goes out within 5 minutes.', `Goes to their ${d.push.devices} device(s) within 5 minutes. Up to 200 characters.`);
  const addNote = async () => {
    const ta = h('textarea', { class: 'input', rows: 4, maxLength: 2000, placeholder: 'e.g. Restored farm from screenshots, sent 50,000 coins' }) as HTMLTextAreaElement;
    if (await modal('Add a note', ta, [{ label: 'Cancel', value: 'no' }, { label: 'Save note', value: 'yes', kind: 'primary' }]) !== 'yes' || !ta.value.trim()) return;
    await act(() => rpc('admin_add_note', { p_id: d.id, p_note: ta.value.trim() }), 'Note saved');
  };
  const del = async () => {
    if (!await confirmTyped(`Delete ${name}?`, `This removes ${name}'s online account: profile, friend code, cloud save, farm layout, gifts, market listings, backups and stats. The farm on their phone stays, as a new online account. This cannot be undone.`, 'DELETE')) { toast('Not deleted', 'info'); return; }
    try { await rpc('admin_delete_player', { p_id: d.id }); toast(`${name} deleted`); location.hash = '#/players'; } catch (e) { fail(e); }
  };
  const exportAll = () => download(`cozy-acres-${slug(name)}-everything-${today()}.json`, JSON.stringify({ exported: new Date().toISOString(), detail: d, deep: c.deep, save: c.save }, null, 1));
  const summary = () => {
    const s = c.save, dd = daysFrom(c);
    const lines = [
      `${name} (${p?.code ?? '?'}), level ${p?.level ?? s?.player?.level ?? '?'}`,
      `Account ${d.id}${d.auth?.email ? `, Google ${d.auth.email}` : ', anonymous'}`,
      `Joined ${date(p?.created_at ?? d.auth?.created_at)}, last played ${ago(d.days[0]?.day ?? p?.updated_at)}, ${d.days.length} days, ${minutes(dd.totalMin)}`,
      s?.player ? `${num(s.player.coins)} coins, ${num(s.player.gems)} gems, ${(s.buildings ?? []).length} buildings` : 'No cloud save',
      `Version ${d.days[0]?.version ?? '?'} on ${PLATFORM[d.days[0]?.platform ?? ''] ?? '?'}`,
    ];
    void copyText(lines.join('\n')).then(() => toast('Summary copied'));
  };
  const lbFlag = (p as unknown as { lb_flag?: string } | null)?.lb_flag;
  const btn = (label: string, fn: () => unknown, kind = '', disabled = false, title = '') => h('button', { class: `btn small ${kind}`, onclick: fn, disabled, title }, label);
  return h('div', { class: 'ptoolbar card' },
    h('div', { class: 'tb-group' }, h('span', { class: 'tb-label' }, 'Give'),
      btn('Gift', give, 'primary'),
      btn('Letter', letter),
      btn('Notification', push, '', !d.push.devices, d.push.devices ? '' : 'Notifications are off for this player')),
    h('div', { class: 'tb-group' }, h('span', { class: 'tb-label' }, 'Restore'),
      btn('Download save', async () => { try { download(`cozy-acres-${slug(name)}-cloud-save-${today()}.json`, JSON.stringify(await rpc('admin_cloud_save', { p_id: d.id }), null, 1)); } catch (e) { fail(e); } }, '', !d.cloud),
      btn('Farm code', () => makeCode(c, 'cloud'), '', !d.cloud, 'A code they type in Settings > Load a farm'),
      btn('Rebuild from layout', () => makeCode(c, 'layout'), '', !d.snapshot)),
    h('div', { class: 'tb-group' }, h('span', { class: 'tb-label' }, 'Lock'),
      activeLock(c) ? btn('Change lock', () => lockDialog(c), 'danger') : btn('Lock account', () => lockDialog(c), 'danger'),
      activeLock(c) ? btn('Unlock now', async () => { if (await confirmAction(`Unlock ${name}?`, 'They can play again the next time they open the game (or within 5 minutes if it is open).', 'Unlock', 'primary')) await act(() => rpc('admin_unlock_player', { p_id: d.id }), `${name} is unlocked`); }) : null),
    h('div', { class: 'tb-group' }, h('span', { class: 'tb-label' }, 'Leaderboards'),
      p ? btn(p.lb_hidden ? 'Show' : 'Hide', () => act(() => rpc('admin_set_hidden', { p_id: d.id, p_hidden: !p.lb_hidden }), p.lb_hidden ? 'Back on the leaderboards' : 'Hidden from the leaderboards')) : null,
      btn('Clear flag', () => act(() => rpc('admin_clear_lb_flag', { p_id: d.id }), 'Flag cleared'), '', !lbFlag, lbFlag ?? 'No flag')),
    h('div', { class: 'tb-group' }, h('span', { class: 'tb-label' }, 'Copy'),
      btn('Id', () => copyText(d.id).then(() => toast('Id copied'))),
      btn('Friend code', () => copyText(p?.code ?? '').then(() => toast('Friend code copied')), '', !p?.code),
      btn('Summary', summary)),
    h('div', { class: 'tb-group' }, h('span', { class: 'tb-label' }, 'More'),
      btn('Note', addNote),
      btn('Export all', exportAll),
      btn('Refresh', () => void c.redraw()),
      btn('Delete', del, 'danger')));
}

async function makeCode(c: Ctx, source: 'cloud' | 'layout'): Promise<void> {
  const { d } = c;
  const p = d.profile, name = nameOfPlayer(c);
  try {
    let json: string | null;
    if (source === 'cloud') json = JSON.stringify(await rpc('admin_cloud_save', { p_id: d.id }));
    else {
      const sug = suggestedMoney(p?.level ?? 1);
      const coins = h('input', { class: 'input', type: 'number', min: 0, value: String(sug.coins) }) as HTMLInputElement;
      const gems = h('input', { class: 'input', type: 'number', min: 0, value: String(sug.gems) }) as HTMLInputElement;
      const r = await modal('Rebuild from farm layout', [
        h('p', null, `This rebuilds ${name}'s farm from the layout neighbours see: land, buildings, decorations, animals and fields, at level ${p?.level ?? '?'}. Coins, gems and barn items are not in the layout, so choose what to give.`),
        h('div', { class: 'grid-2' }, field('Coins', coins, `Suggested for level ${p?.level}: ${num(sug.coins)}`), field('Gems', gems))],
        [{ label: 'Cancel', value: 'no' }, { label: 'Download file', value: 'file' }, { label: 'Make farm code', value: 'code', kind: 'primary' }]);
      if (r !== 'file' && r !== 'code') return;
      json = JSON.stringify(saveFromSnapshot(d.snapshot?.data, { coins: Number(coins.value) || 0, gems: Number(gems.value) || 0 }));
      if (r === 'file') { download(`cozy-acres-${slug(name)}-rebuilt-${today()}.json`, json); toast('Rebuilt save downloaded. They can load it in Settings > Import save.'); return; }
    }
    const code = await rpc<string>('admin_make_farm_transfer', { p_data: await farmLinkData(json), p_note: `${name} restore (${source})` });
    const v = await modal('Farm code ready', [h('p', null, `Send ${name} this code. In the game: Settings > Load a farm, type the code, Load farm.`), h('div', { class: 'big-code' }, code),
      h('p', { class: 'muted small' }, 'Works for 14 days, up to 5 loads. Their current farm is kept as a backup on their phone.')], [{ label: 'Copy code', value: 'copy' }, { label: 'Done', value: 'ok', kind: 'primary' }]);
    if (v === 'copy') void copyText(code);
  } catch (e) { fail(e); }
}

// ------------------------------------------------------------------------------------------- overview

function story(c: Ctx): string[] {
  const { d, deep, save: s } = c;
  const p = d.profile, dd = daysFrom(c), out: string[] = [];
  const joined = p?.created_at ?? d.auth?.created_at;
  if (joined) out.push(`Joined ${date(joined)} (${num(Math.floor((Date.now() - new Date(joined).getTime()) / 86400000))} days ago) and has played on ${num(d.days.length)} days, ${minutes(dd.totalMin)} in all, over ${num(dd.sessions)} sessions${dd.sessions ? ` (about ${minutes(dd.totalMin / dd.sessions)} a session)` : ''}.`);
  out.push(`Played ${dd.last30.length} of the last 30 days; ${minutes(dd.min7)} this week${dd.minPrev7 ? ` against ${minutes(dd.minPrev7)} the week before (${dd.min7 >= dd.minPrev7 ? 'up' : 'down'} ${pct(Math.abs(dd.min7 - dd.minPrev7), dd.minPrev7)})` : ''}.`);
  if (dd.streak > 1) out.push(`On a run of ${dd.streak} days in a row.`);
  if (s?.daily?.best) out.push(`Daily reward streak ${s.daily.streak} (best ${s.daily.best}).`);
  if (deep?.hours?.some((n) => n > 0)) {
    const top = deep.hours.indexOf(Math.max(...deep.hours));
    out.push(`Usually plays around ${String(top).padStart(2, '0')}:00 UTC${deep.weekdays.some((n) => n > 0) ? `, most on ${DAY_NAMES[deep.weekdays.indexOf(Math.max(...deep.weekdays))]}s` : ''}.`);
  }
  const st = s?.stats ?? {};
  const fav = (prefix: string) => Object.entries(st).filter(([k]) => k.startsWith(prefix)).sort((a, b) => b[1] - a[1])[0];
  const crop = fav('harvest_'), shop = fav('made_'), fish = fav('catch_'), prod = fav('collect_');
  if (crop) out.push(`Favourite crop: ${nameOf(crop[0].slice(8))} (${num(crop[1])} harvested).`);
  if (shop) out.push(`Busiest workshop: ${nameOf(shop[0].slice(5))} (${num(shop[1])} goods made).`);
  if (prod) out.push(`Top animal product: ${nameOf(prod[0].slice(8))} (${num(prod[1])}).`);
  if (fish) out.push(`Most caught fish: ${nameOf(fish[0].slice(6))} (${num(fish[1])}).`);
  const fr = s?.village?.friends ?? {};
  const bestFriend = Object.entries(fr).sort((a, b) => b[1].points - a[1].points)[0];
  if (bestFriend && bestFriend[1].points > 0) out.push(`Best villager friend: ${nameOf(bestFriend[0])} with ${Math.floor(bestFriend[1].points / VILLAGERS.friendship.pointsPerHeart)} hearts.`);
  if (deep?.contacts?.[0]) out.push(`Plays most with ${deep.contacts[0].name} (level ${deep.contacts[0].level}).`);
  if (deep?.ranks && p && !p.lb_hidden) out.push(`${ord(deep.ranks.level)} of ${num(deep.ranks.players)} by level, ${ord(deep.ranks.value)} by farm value, ${ord(deep.ranks.charm)} by charm; plays more than ${deep.ranks.minutesPct}% of players.`);
  if (s?.buildings) out.push(`Farm: ${num(s.buildings.length)} things placed on ${num(s.land?.unlocked.length ?? 0)} land plots.`);
  return out;
}

function overviewTab(c: Ctx): HTMLElement[] {
  const { d, deep, save: s } = c;
  const p = d.profile, dd = daysFrom(c);
  const lvl = s?.player?.level ?? p?.level ?? 1, xp = s?.player?.xp ?? 0, need = xpToNext(lvl);
  const warnings: HTMLElement[] = [];
  const lk = activeLock(c);
  if (lk) warnings.push(h('li', null, badge('Locked', 'bad'), ` ${lk.until ? `until ${date(lk.until, true)} (` : '(no end date, '}`, liveCountdown(lk.until), `): "${lk.reason}"`));
  const lbFlag = (p as unknown as { lb_flag?: string; lb_flagged_at?: string } | null);
  if (lbFlag?.lb_flag) warnings.push(h('li', null, badge('Leaderboard', 'bad'), ` ${lbFlag.lb_flag} (${ago(lbFlag.lb_flagged_at)})`));
  if (deep?.refusal && (!d.snapshot || deep.refusal.at > d.snapshot.updated_at)) warnings.push(h('li', null, badge('Farm not shared', 'bad'), ` ${deep.refusal.reason}: visitors see an old farm (${ago(deep.refusal.at)}).`));
  const ver = d.days[0]?.version;
  if (ver && LATEST_VERSION && ver !== LATEST_VERSION) warnings.push(h('li', null, badge('Old version', 'warn'), ` Last played on ${ver}; the newest is ${LATEST_VERSION}. They may need to close and reopen the app.`));
  if (!d.cloud && d.days.length > 7) warnings.push(h('li', null, badge('No backup', 'warn'), ' Plays a lot but has no Google cloud save: if they lose their phone, only the farm layout can be restored.'));
  const pendingGifts = d.adminGifts.filter((g) => !g.claimed_at).length;
  if (pendingGifts) warnings.push(h('li', null, badge('Gift waiting', 'info'), ` ${pendingGifts} developer gift(s) not opened yet.`));
  if (d.feedback.some((f) => f.status === 'new')) warnings.push(h('li', null, badge('Feedback', 'info'), ' Has new feedback waiting (Support tab).'));
  const sick = (s?.buildings ?? []).reduce((n, b) => n + (b.animals ?? []).filter((a) => a.sickAt).length, 0);
  if (sick) warnings.push(h('li', null, badge('Animals unwell', 'warn'), ` ${sick} animal(s) unwell on their farm.`));

  const r = deep?.ranks;
  return [
    h('div', { class: 'grid-2' },
      card('Their story', h('ul', { class: 'plain story' }, story(c).map((t) => h('li', null, t)))),
      card('Things to look at', warnings.length ? h('ul', { class: 'plain' }, warnings) : h('p', { class: 'muted' }, 'Nothing needs attention.'),
        h('h4', null, `Level ${lvl}`), bar(need ? xp / need : 1), h('div', { class: 'muted small' }, need ? `${num(xp)} of ${num(need)} XP to level ${lvl + 1}` : 'XP unknown'))),
    h('div', { class: 'tiles' },
      tile('Played this week', minutes(dd.min7), `${dd.last7.length} days, ${minutes(dd.minPrev7)} the week before`),
      tile('This month', minutes(dd.min30), `${dd.last30.length} of 30 days`),
      tile('Total XP', compact(p?.total_xp ?? 0), r ? `${ord(r.xp)} of ${num(r.players)}` : ''),
      tile('Farm value', compact(p?.farm_value ?? 0), r ? `${ord(r.value)} of ${num(r.players)}` : ''),
      tile('Charm', num(p?.charm ?? 0), r ? `${ord(r.charm)} of ${num(r.players)}` : ''),
      tile('This week XP', num(p?.weekly_xp ?? 0), r ? `${ord(r.weekly)} this week` : ''),
      tile('Gifts sent / got', `${num(d.giftsSent)} / ${num(d.giftsReceived)}`),
      tile('Help given / got', `${num(d.helpGiven)} / ${num(d.helpReceived)}`),
      tile('Versus everyone', r ? `${r.minutesPct}%` : '-', r ? `plays more than this share of players; median level ${num(r.medianLevel ?? 0)}` : '')),
    h('div', { class: 'grid-2' },
      activityCalendar(c),
      card('Latest from the game', deep?.events.length ? eventTable(deep.events.slice(0, 12)) : h('p', { class: 'muted small' }, 'No game events yet (sent from version 1.8, only when online).'))),
  ];
}

// ------------------------------------------------------------------------------------------- farm

function farmTab(c: Ctx): HTMLElement[] {
  const { d, save: s } = c;
  const map = card('Their farm (as neighbours see it)', d.snapshot?.data ? farmMap(d.snapshot.data) : h('p', { class: 'muted' }, 'No farm layout shared yet.'),
    d.snapshot ? h('p', { class: 'muted small' }, `Shared ${ago(d.snapshot.updated_at)}.`) : null);
  if (!s?.buildings) return [h('div', { class: 'grid-2' }, map, card('From their save', h('p', { class: 'muted' }, 'No cloud save (they have not signed in with Google), so only the layout is known.'))), playerVisitsCard(d.id)];
  const now = Date.now();
  const bs = s.buildings;
  const by = (cat: string) => bs.filter((b) => BUILDING.get(b.type)?.cat === cat);
  const plots = bs.filter((b) => b.type === 'plot'), trees = bs.filter((b) => BUILDING.get(b.type)?.tree);
  const growing = plots.filter((b) => b.plot && b.plot.plantedAt + b.plot.growSec * 1000 > now).length;
  const ripe = plots.filter((b) => b.plot && b.plot.plantedAt + b.plot.growSec * 1000 <= now).length;
  const empty = plots.filter((b) => !b.plot).length;
  const crops = new Map<string, number>();
  for (const b of plots) if (b.plot) crops.set(b.plot.crop, (crops.get(b.plot.crop) ?? 0) + 1);
  const workshops = by('production'), homes = by('animal');
  const decor = by('decor');
  const decorKinds = new Map<string, number>();
  for (const b of decor) decorKinds.set(b.type, (decorKinds.get(b.type) ?? 0) + 1);
  const animalsAll = homes.flatMap((b) => (b.animals ?? []).map((a) => ({ ...a, home: b.type })));
  const fh = bs.find((b) => b.type === 'farmhouse');

  return [
    h('div', { class: 'tiles' },
      tile('Land plots', num(s.land?.unlocked.length ?? 0), `${num(s.land?.bought ?? 0)} bought`),
      tile('Farmhouse', `Level ${fh?.level ?? 1}`),
      tile('Fields', num(plots.length), `${growing} growing, ${ripe} ready, ${empty} empty`),
      tile('Fruit trees', num(trees.length), `${trees.filter((t) => t.tree && t.tree.readyAt <= now).length} ready to pick`),
      tile('Workshops', num(workshops.length), `${workshops.filter((b) => (b.queue ?? []).some((q) => q.end > now)).length} busy`),
      tile('Animals', num(animalsAll.length), `${homes.length} homes, ${animalsAll.filter((a) => a.sickAt).length} unwell`),
      tile('Decorations', num(decor.length), `${decorKinds.size} kinds`),
      tile('Wild plants left', num((s.obstacles ?? []).length))),
    h('div', { class: 'grid-2' }, map,
      card('Fields right now', crops.size ? h('div', { class: 'chips' }, [...crops].sort((a, b) => b[1] - a[1]).map(([k, n]) => h('span', { class: 'chip' }, ico(k), `${nameOf(k)} x${n}`))) : h('p', { class: 'muted small' }, 'Nothing planted.'),
        h('h4', null, 'Workshops'),
        workshops.length ? h('table', { class: 'table compact' }, h('thead', null, h('tr', null, h('th', null, 'Workshop'), h('th', { class: 'r' }, 'Level'), h('th', { class: 'r' }, 'Wear'), h('th', null, 'Making'))),
          h('tbody', null, workshops.map((b) => {
            const q = (b.queue ?? []).filter((x) => x.end > now);
            return h('tr', null, h('td', null, ico(b.type), ' ', nameOf(b.type)), h('td', { class: 'r' }, num(b.level)), h('td', { class: 'r' }, b.wear !== undefined ? `${Math.round(b.wear)}%` : '-'),
              h('td', { class: 'small' }, q.length ? `${q.map((x) => nameOf(x.recipe)).join(', ')} (done ${ago(new Date(q[q.length - 1].end).toISOString()).replace(' ago', '')})` : (b.ready?.length ? `${b.ready.length} ready to collect` : 'Idle')));
          }))) : h('p', { class: 'muted small' }, 'No workshops yet.'))),
    h('div', { class: 'grid-2' },
      card(`Animals (${animalsAll.length})`, animalsAll.length ? h('table', { class: 'table compact' }, h('thead', null, h('tr', null, h('th', null, 'Name'), h('th', null, 'Home'), h('th', { class: 'r' }, 'Love'), h('th', null, 'State'))),
        h('tbody', null, animalsAll.slice(0, 80).map((a) => h('tr', null, h('td', null, a.name ?? '-'), h('td', null, nameOf(a.home)), h('td', { class: 'r' }, num(a.love ?? 0)),
          h('td', null, a.sickAt ? badge('Unwell', 'warn') : a.fedAt === null ? badge('Hungry', 'info') : badge('Happy', 'good')))))) : h('p', { class: 'muted small' }, 'No animals yet.')),
      card(`Decorations (${decor.length})`, decorKinds.size ? h('div', { class: 'chips' }, [...decorKinds].sort((a, b) => b[1] - a[1]).map(([k, n]) => h('span', { class: 'chip' }, ico(k), `${nameOf(k)} x${n}`))) : h('p', { class: 'muted small' }, 'No decorations yet.'))),
    playerVisitsCard(d.id),
  ];
}

// ------------------------------------------------------------------------------------------- barn

function barnTab(c: Ctx): HTMLElement[] {
  const s = c.save;
  if (!s?.inventory) return [card('Barn and items', h('p', { class: 'muted' }, 'No cloud save, so their barn is not known.'))];
  const q = s.quality ?? {};
  const rows = Object.entries({ ...s.inventory }).filter(([, n]) => n > 0).map(([id, n]) => ({ id, n, name: nameOf(id), cat: ITEMS[id]?.cat ?? '-', value: (ITEMS[id]?.sell ?? 0) * n, silver: q[id]?.[0] ?? 0, gold: q[id]?.[1] ?? 0 }));
  const storage = Object.entries(s.storage ?? {}).filter(([, n]) => n > 0);
  const total = rows.reduce((a, r) => a + r.value, 0), count = rows.reduce((a, r) => a + r.n, 0);
  let sort: 'n' | 'value' | 'name' | 'cat' = 'n';
  let filter = '';
  const list = h('div');
  const draw = () => {
    const shown = rows.filter((r) => !filter || r.name.toLowerCase().includes(filter) || r.cat.includes(filter))
      .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'cat' ? a.cat.localeCompare(b.cat) || b.n - a.n : (b[sort] as number) - (a[sort] as number));
    list.replaceChildren(h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' },
      h('thead', null, h('tr', null, h('th', null, 'Item'), h('th', null, 'Kind'), h('th', { class: 'r' }, 'Amount'), h('th', { class: 'r' }, 'Silver / gold'), h('th', { class: 'r' }, 'Worth'))),
      h('tbody', null, shown.map((r) => h('tr', null, h('td', null, ico(r.id), ' ', r.name, h('span', { class: 'muted small' }, ` ${r.id}`)), h('td', null, r.cat), h('td', { class: 'r' }, num(r.n)),
        h('td', { class: 'r' }, r.silver || r.gold ? `${num(r.silver)} / ${num(r.gold)}` : ''), h('td', { class: 'r' }, num(r.value))))))));
  };
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Filter items or kinds', oninput: (e: Event) => { filter = (e.target as HTMLInputElement).value.toLowerCase().trim(); draw(); } });
  const sorter = h('div', { class: 'segmented' }, ([['n', 'Amount'], ['value', 'Worth'], ['name', 'Name'], ['cat', 'Kind']] as const).map(([k, l]) =>
    h('button', { class: k === sort ? 'active' : '', onclick: (e: Event) => { sort = k; (e.currentTarget as HTMLElement).parentElement!.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.currentTarget)); draw(); } }, l)));
  draw();
  const cats = new Map<string, number>();
  for (const r of rows) cats.set(r.cat, (cats.get(r.cat) ?? 0) + r.n);
  return [
    h('div', { class: 'tiles' },
      tile('Items in the barn', num(count), `${rows.length} different`),
      tile('Barn worth', compact(total), 'at plain sell prices'),
      tile('Coins', s.player ? num(s.player.coins) : '-'),
      tile('Gems', s.player ? num(s.player.gems) : '-'),
      tile('Silver / gold stars', `${num(rows.reduce((a, r) => a + r.silver, 0))} / ${num(rows.reduce((a, r) => a + r.gold, 0))}`),
      tile('Collection Book', num(Object.keys(s.collection ?? {}).length), 'things discovered'),
      tile('Cosmetics', num((s.cosmetics ?? []).length))),
    card('By kind', h('div', { class: 'chips' }, [...cats].sort((a, b) => b[1] - a[1]).map(([k, n]) => h('span', { class: 'chip' }, `${k}: ${num(n)}`)))),
    h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, 'Barn'), sorter), search, list),
    storage.length ? card('Stored buildings and decorations', h('div', { class: 'chips' }, storage.map(([k, n]) => h('span', { class: 'chip' }, ico(k), `${nameOf(k)} x${n}`)))) : null,
  ].filter((x): x is HTMLElement => !!x);
}

// ------------------------------------------------------------------------------------------- progress

/** The Needs tab (views/needs.ts): what the player is working towards, gifted in one press as a developer gift. */
function needsFor(c: Ctx): HTMLElement[] {
  const { d } = c;
  const days = [...d.days].sort((a, b) => (a.last_at < b.last_at ? 1 : -1));
  return needsTab(c.save as NeedsSave | null, {
    name: nameOfPlayer(c),
    savedAt: d.cloud?.updated_at ?? null,
    // the version their game reported when they last played (lastSeenVersion only moves when What's new is read)
    version: days[0]?.version ?? c.save?.lastSeenVersion ?? null,
    pendingGifts: d.adminGifts.filter((g) => !g.claimed_at).length,
    give: async (items, coins, message) => {
      try {
        await rpc('admin_give', { p_ids: [d.id], p_audience: null, p_coins: coins, p_gems: 0, p_items: items, p_land: 0, p_message: message || null });
        toast(`Gift on its way: ${describeGift({ coins, gems: 0, land: 0, items })}`);
        await c.redraw();
        refreshBadges();
        return true;
      } catch (e) { fail(e); return false; }
    },
  });
}

function progressTab(c: Ctx): HTMLElement[] {
  const s = c.save;
  if (!s) return [card('Progress', h('p', { class: 'muted' }, 'No cloud save, so their progress is not known. Level, XP and charm are on the Overview.'))];
  const ph = VILLAGERS.friendship.pointsPerHeart, maxH = VILLAGERS.friendship.maxHearts;
  const friends = s.village?.friends ?? {};
  const villagers = card('Villager friendships', h('table', { class: 'table compact' }, h('thead', null, h('tr', null, h('th', null, 'Villager'), h('th', null, 'Hearts'), h('th', { class: 'r' }, 'Gifts'), h('th', { class: 'r' }, 'Stories'))),
    h('tbody', null, VILLAGERS.villagers.map((v) => {
      const f = friends[v.id], hearts = Math.min(maxH, Math.floor((f?.points ?? 0) / ph));
      return h('tr', null, h('td', null, v.name, h('div', { class: 'muted small' }, v.role)), h('td', null, h('span', { class: 'hearts' }, '♥'.repeat(hearts), h('span', { class: 'muted' }, '♡'.repeat(maxH - hearts)))),
        h('td', { class: 'r' }, num(f?.gifts ?? 0)), h('td', { class: 'r' }, num(f?.stories?.length ?? 0)));
    }))));
  const sx = s.skills?.xp ?? {};
  const skills = card('Skills', h('table', { class: 'table compact' }, h('tbody', null, SKILLS.skills.map((sk) => {
    const xp = sx[sk.id] ?? 0, lvl = skillLevel(xp);
    return h('tr', null, h('td', null, sk.name), h('td', { style: { width: '45%' } }, bar(lvl / 10)), h('td', { class: 'r' }, `Level ${lvl}`), h('td', { class: 'r muted small' }, `${num(xp)} XP`),
      h('td', { class: 'small' }, (s.skills?.perks?.[sk.id] ?? []).map(nameOf).join(', ')));
  }))));
  const done = new Set(s.restoration?.done ?? []);
  const given = s.restoration?.given ?? {};
  const projects = card('Building projects', ...PROJECT_GROUPS.map((g) => {
    const n = g.rooms.filter((r) => done.has(r.id)).length;
    return h('details', { open: n > 0 && n < g.rooms.length }, h('summary', null, `${g.name}: ${n} of ${g.rooms.length}`, n === g.rooms.length ? badge('Done', 'good') : null),
      bar(n / Math.max(1, g.rooms.length)),
      h('table', { class: 'table compact' }, h('tbody', null, g.rooms.map((r) => {
        const wants = (r.bundles ?? []).reduce((a, b) => a + Object.values(b.wants).reduce((x, y) => x + y, 0), 0);
        const got = Object.values(given[r.id] ?? {}).reduce((a, b) => a + Object.values(b).reduce((x, y) => x + y, 0), 0);
        return h('tr', null, h('td', null, r.name), h('td', { class: 'r small muted' }, r.opensAt ? `level ${r.opensAt}` : ''),
          h('td', { class: 'r' }, done.has(r.id) ? badge('Done', 'good') : got ? `${pct(got, wants)} given` : h('span', { class: 'muted' }, 'Not started')));
      }))));
  }), h('p', { class: 'muted small' }, [s.restoration?.festival ? `Village festival ${date(ms(s.restoration.festival))}.` : '', s.restoration?.manor ? ` Manor opened ${date(ms(s.restoration.manor))}.` : ''].join('')));
  const ach = s.achievements ?? {};
  const achDone = ACHIEVEMENTS.filter((a) => (ach[a.id] ?? 0) > 0);
  const achievements = card(`Achievements (${achDone.length} of ${ACHIEVEMENTS.length} started)`, h('div', { class: 'chips' }, ACHIEVEMENTS.map((a) => {
    const t = ach[a.id] ?? 0;
    return h('span', { class: `chip ${t ? '' : 'dim'}`, title: a.desc.replace('{n}', String(a.tiers[Math.min(t, a.tiers.length - 1)])) }, `${a.name} ${'★'.repeat(t)}${'☆'.repeat(Math.max(0, a.tiers.length - t))}`);
  })));
  const photos = s.wildlife?.photos ?? {};
  const wildlife = card(`Wildlife Album (${Object.keys(photos).length} of ${WILDLIFE.species.length})`, h('div', { class: 'chips' }, WILDLIFE.species.map((sp) => h('span', { class: `chip ${photos[sp.id] ? '' : 'dim'}` }, `${sp.name}${photos[sp.id] ? ` x${photos[sp.id].n}` : ''}`))),
    h('p', { class: 'small' }, `Sets done: ${(s.wildlife?.sets ?? []).map(nameOf).join(', ') || 'none'}`));
  const donated = s.museum?.donated ?? {};
  const museum = card(`Museum${s.museum?.curator ? ' (Curator)' : ''}`, h('table', { class: 'table compact' }, h('tbody', null, MUSEUM.map((m) => {
    const n = (donated[m.id] ?? []).length;
    const of = (m.items ?? []).length;
    return h('tr', null, h('td', null, m.name), h('td', { style: { width: '45%' } }, bar(of ? n / of : 0)), h('td', { class: 'r' }, of ? `${n} / ${of}` : num(n)));
  }))));
  const hired = s.farmhands?.hired ?? [];
  const misc = card('Everything else', kv([
    ['Mastery', `${num(s.mastery?.done?.length ?? 0)} mastered${Object.keys(s.mastery?.picks ?? {}).length ? `; lines: ${Object.entries(s.mastery?.picks ?? {}).map(([k, v]) => `${nameOf(k)} ${v}`).join(', ')}` : ''}`],
    ['Farmhands', hired.length ? hired.map((x) => `${FARMHANDS.find((f) => f.id === x.id)?.name ?? x.id} (${x.chore})`).join(', ') : 'None hired'],
    ['Master Board', s.master ? `streak ${s.master.streak ?? 0}, best ${s.master.best ?? 0}` : '-'],
    ['Daily rewards', s.daily ? `streak ${s.daily.streak}, best ${s.daily.best}, last ${s.daily.lastDay}` : '-'],
    ['Festivals', Object.entries(s.festivals?.best ?? {}).map(([k, v]) => `${nameOf(k)} ${num(v)}`).join(', ') || '-'],
    ['Fishing', s.fishing ? `${num(Object.values(s.fishing.caught ?? {}).reduce((a, b) => a + b, 0))} caught, ${Object.keys(s.fishing.caught ?? {}).length} kinds, ${num(s.fishing.casts ?? 0)} casts` : '-'],
    ['Woodland critters', Object.entries(s.woods?.critters ?? {}).map(([k, v]) => `${nameOf(k)} ${v.visits}`).join(', ') || '-'],
    ['Wren field notes', num(s.woods?.notesDone ?? 0)],
    ['Village Projects plaques', (s.coop?.plaques ?? []).map((p) => `${nameOf(p.kind)} with ${p.names.length}`).join(', ') || 'None'],
    ['Level Markers', s.endless?.marker ? `up to ${s.endless.marker}` : '-'],
    ['Tutorial', s.tutorial?.done ? 'Done' : 'Not finished'],
    ['Save made', date(ms(s.createdAt), true)],
    ['Save last played', date(ms(s.lastSeen), true)],
  ]));
  const quests = s.quests ? card('Quests right now', h('ul', { class: 'plain' }, [...(s.quests.daily ?? []), ...(s.quests.weekly ?? [])].map((q) => h('li', null, q.claimed ? badge('Done', 'good') : badge('Open'), ` ${q.text}`)))) : null;
  return [h('div', { class: 'grid-2' }, villagers, skills), projects, h('div', { class: 'grid-2' }, museum, wildlife), h('div', { class: 'grid-2' }, misc, quests ?? h('div')), achievements];
}

// ------------------------------------------------------------------------------------------- stats

function statsTab(c: Ctx): HTMLElement[] {
  const st = c.save?.stats;
  if (!st) return [card('Lifetime stats', h('p', { class: 'muted' }, 'No cloud save, so their lifetime stats are not known.'))];
  const groups: [string, string, string][] = [['harvest_', 'Harvested', 'crops and fruit'], ['made_', 'Made in', 'workshops'], ['collect_', 'Collected', 'from animals'], ['catch_', 'Caught', 'fish'], ['gold_', 'Gold stars', 'items']];
  const top = (prefix: string) => Object.entries(st).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => ({ label: nameOf(k.slice(prefix.length)), value: v })).sort((a, b) => b.value - a.value).slice(0, 12);
  const charts = groups.map(([prefix, title, sub]) => {
    const pts: Point[] = top(prefix);
    return pts.length ? chartCard(`${title} (${sub})`, 'Top 12, all time', (el) => hbarsLocal(el, pts), pts, 'Amount') : null;
  }).filter((x): x is HTMLElement => !!x);
  const plain = Object.entries(st).filter(([k]) => !groups.some(([p]) => k.startsWith(p)));
  let q = '';
  const list = h('div');
  const draw = () => list.replaceChildren(h('table', { class: 'table compact' }, h('tbody', null, plain.filter(([k]) => !q || k.includes(q)).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
    h('tr', null, h('td', null, k.replace(/_/g, ' ')), h('td', { class: 'r' }, num(v)))))));
  draw();
  return [
    h('div', { class: 'tiles' },
      ...['plants_planted', 'crops_harvested', 'items_produced', 'orders_completed', 'trucks_completed', 'coins_earned', 'gems_earned', 'animal_products', 'fish_caught', 'gifts_sent', 'neighbours_helped', 'login_days']
        .filter((k) => st[k] !== undefined).map((k) => tile(k.replace(/_/g, ' '), compact(st[k])))),
    h('div', { class: 'grid-2' }, ...charts),
    h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, `Every counter (${plain.length})`),
      h('input', { class: 'input', style: { maxWidth: '260px' }, type: 'search', placeholder: 'Filter', oninput: (e: Event) => { q = (e.target as HTMLInputElement).value.toLowerCase().replace(/ /g, '_'); draw(); } })), list),
  ];
}

function hbarsLocal(el: HTMLElement, pts: Point[]): void {
  const max = Math.max(1, ...pts.map((p) => p.value));
  el.replaceChildren(h('table', { class: 'table compact' }, h('tbody', null, pts.map((p) => h('tr', null, h('td', null, p.label),
    h('td', { style: { width: '50%' } }, h('span', { class: 'mini-bar', style: { width: `${Math.max(2, (p.value / max) * 100)}%` } })), h('td', { class: 'r' }, num(p.value)))))));
}

// ------------------------------------------------------------------------------------------- activity

function activityCalendar(c: Ctx): HTMLElement {
  const days = new Map(c.d.days.map((x) => [x.day, { minutes: x.minutes, sessions: x.sessions }]));
  const cal = h('div');
  calendar(cal, days, 120);
  return card('Play calendar (last 4 months)', cal);
}

function eventTable(events: Deep['events']): HTMLElement {
  return h('table', { class: 'table compact' }, h('tbody', null, events.map((e) => h('tr', null, h('td', { class: 'small muted', style: { whiteSpace: 'nowrap' } }, date(e.at, true)), h('td', null, badge(e.kind)),
    h('td', { class: 'small' }, Object.entries(e.detail ?? {}).map(([k, v]) => `${k}: ${typeof v === 'string' ? nameOf(v) : String(v)}`).join(', '))))));
}

function activityTab(c: Ctx): HTMLElement[] {
  const { d, deep } = c;
  const recent = [...d.days].slice(0, 60).reverse();
  const minPts: Point[] = recent.map((x) => ({ label: x.day.slice(5), value: x.minutes, tip: `${x.minutes} min, ${x.sessions} sessions, ${PLATFORM[x.platform ?? ''] ?? '-'} ${x.version ?? ''}` }));
  const hourPts: Point[] = (deep?.hours ?? []).map((n, i) => ({ label: String(i).padStart(2, '0'), value: n }));
  const dayPts: Point[] = (deep?.weekdays ?? []).map((n, i) => ({ label: DAYS[i], value: n, tip: `${n} min all time` }));
  const versions = new Map<string, { first: string; last: string; days: number }>();
  const platforms = new Map<string, number>();
  for (const x of d.days) {
    if (x.version) { const v = versions.get(x.version); versions.set(x.version, v ? { first: x.day < v.first ? x.day : v.first, last: x.day > v.last ? x.day : v.last, days: v.days + 1 } : { first: x.day, last: x.day, days: 1 }); }
    if (x.platform) platforms.set(x.platform, (platforms.get(x.platform) ?? 0) + 1);
  }
  let kind = '';
  const evHost = h('div');
  const kinds = Object.entries(deep?.eventKinds ?? {}).sort((a, b) => b[1] - a[1]);
  const drawEv = () => evHost.replaceChildren(eventTable((deep?.events ?? []).filter((e) => !kind || e.kind === kind).slice(0, 200)));
  drawEv();
  const kindSel = h('select', { class: 'input', style: { maxWidth: '260px' }, onchange: (e: Event) => { kind = (e.target as HTMLSelectElement).value; drawEv(); } },
    h('option', { value: '' }, `All kinds (${kinds.reduce((a, [, n]) => a + n, 0)})`), kinds.map(([k, n]) => h('option', { value: k }, `${k} (${n})`)));
  return [
    activityCalendar(c),
    h('div', { class: 'grid-2' },
      chartCard('Minutes a day', 'Last 60 days played', (el) => bars(el, minPts, { fmt: (n) => `${n}` }), minPts, 'Minutes'),
      chartCard('When they play', 'Hour of day (UTC), last 90 days', (el) => bars(el, hourPts, { every: 3 }), hourPts, 'Moments')),
    h('div', { class: 'grid-2' },
      chartCard('Which days', 'Minutes by weekday, all time', (el) => bars(el, dayPts), dayPts, 'Minutes'),
      card('Devices and versions', h('div', { class: 'chips' }, [...platforms].map(([k, n]) => h('span', { class: 'chip' }, `${PLATFORM[k] ?? k}: ${n} days`))),
        h('table', { class: 'table compact' }, h('thead', null, h('tr', null, h('th', null, 'Version'), h('th', null, 'First'), h('th', null, 'Last'), h('th', { class: 'r' }, 'Days'))),
          h('tbody', null, [...versions].sort((a, b) => b[1].last.localeCompare(a[1].last)).map(([v, x]) => h('tr', null, h('td', null, v), h('td', null, date(x.first)), h('td', null, date(x.last)), h('td', { class: 'r' }, num(x.days)))))))),
    h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, 'Game events'), kindSel), evHost),
    card('Day by day', h('details', null, h('summary', null, `Show ${Math.min(120, d.days.length)} days`), h('table', { class: 'table compact' },
      h('thead', null, h('tr', null, h('th', null, 'Day'), h('th', null, 'From'), h('th', null, 'To'), h('th', { class: 'r' }, 'Sessions'), h('th', { class: 'r' }, 'Minutes'), h('th', null, 'Where'), h('th', null, 'Version'))),
      h('tbody', null, d.days.slice(0, 120).map((x) => h('tr', null, h('td', null, date(x.day)), h('td', { class: 'small' }, x.first_at?.slice(11, 16) ?? ''), h('td', { class: 'small' }, x.last_at?.slice(11, 16) ?? ''),
        h('td', { class: 'r' }, num(x.sessions)), h('td', { class: 'r' }, num(x.minutes)), h('td', null, PLATFORM[x.platform ?? ''] ?? '-'), h('td', null, x.version ?? '-'))))))),
  ];
}

// ------------------------------------------------------------------------------------------- social

function socialTab(c: Ctx): HTMLElement[] {
  const { d, deep, save: s } = c;
  const friends = s?.social?.friends ?? [];
  const contacts = deep?.contacts ?? [];
  return [
    h('div', { class: 'grid-2' },
      card(`Friends list (${friends.length})`, friends.length ? h('table', { class: 'table compact' }, h('tbody', null, friends.map((f) => h('tr', null,
        h('td', null, f.id ? h('a', { href: `#/player/${f.id}` }, f.name) : f.name), h('td', { class: 'mono-small' }, f.code), h('td', { class: 'small muted' }, `added ${ago(ms(f.addedAt))}`)))))
        : h('p', { class: 'muted small' }, s ? 'No friends added.' : 'Their friends list is in the cloud save, which they do not have.')),
      card('Who they play with most', contacts.length ? h('table', { class: 'table compact' },
        h('thead', null, h('tr', null, h('th', null, 'Player'), h('th', { class: 'r' }, 'Gifts out / in'), h('th', { class: 'r' }, 'Help out / in'), h('th', { class: 'r' }, 'Co-op'))),
        h('tbody', null, contacts.map((x) => h('tr', null, h('td', null, h('a', { href: `#/player/${x.id}` }, x.name), h('span', { class: 'muted small' }, ` level ${x.level}`)),
          h('td', { class: 'r' }, `${x.giftsOut} / ${x.giftsIn}`), h('td', { class: 'r' }, `${x.helpOut} / ${x.helpIn}`), h('td', { class: 'r' }, num(x.coop))))))
        : h('p', { class: 'muted small' }, 'No gifts, help or co-op with anyone yet.'))),
    h('div', { class: 'grid-2' },
      card('Gifts with other players', d.recentGifts.length ? h('table', { class: 'table compact' }, h('tbody', null, d.recentGifts.map((g) => h('tr', null,
        h('td', null, date(g.sent_at)), h('td', null, g.from_id === d.id ? h('span', null, 'To ', h('a', { href: `#/player/${g.to_id}` }, g.to ?? '?')) : h('span', null, 'From ', h('a', { href: `#/player/${g.from_id}` }, g.from))),
        h('td', null, describeGift({ coins: g.coins, gems: 0, land: 0, items: g.items }), g.message ? h('div', { class: 'muted small' }, `"${g.message}"`) : null), h('td', null, g.claimed ? 'Opened' : 'Not opened')))))
        : h('p', { class: 'muted small' }, 'No gifts with other players.')),
      card('Shared Market', d.listings.length ? h('table', { class: 'table compact' }, h('tbody', null, d.listings.map((l) => h('tr', null,
        h('td', null, date(l.listed_at)), h('td', null, ico(l.item), ` ${l.qty} ${nameOf(l.item)}`), h('td', { class: 'r' }, `${num(l.price)} coins`),
        h('td', null, l.seller_id === d.id ? (l.status === 'sold' ? `Sold to ${l.buyer_name}` : l.status) : `Bought from ${l.seller_name}`)))))
        : h('p', { class: 'muted small' }, 'No market activity.'))),
    h('div', { class: 'grid-2' },
      card(`Ask a friend (${deep?.askHelp.length ?? 0} asked, ${num(deep?.askFilled ?? 0)} filled for others)`, deep?.askHelp.length ? h('table', { class: 'table compact' }, h('tbody', null, deep.askHelp.map((r) => h('tr', null,
        h('td', null, date(r.at)), h('td', null, ico(r.item), ` ${r.qty} ${nameOf(r.item)}`), h('td', null, r.reason), h('td', { class: 'r' }, `${r.filled} / ${r.qty}`)))))
        : h('p', { class: 'muted small' }, 'Has not asked friends for anything.')),
      card('Village Projects (co-op)', deep?.coopGifts.length ? h('table', { class: 'table compact' }, h('tbody', null, deep.coopGifts.map((g) => h('tr', null,
        h('td', null, date(g.at)), h('td', null, `${g.qty} ${nameOf(g.item)}`), h('td', null, `${nameOf(g.kind)} hosted by ${g.host}`)))))
        : h('p', { class: 'muted small' }, 'Has not given to a Village Project.'),
        (s?.coop?.plaques ?? []).length ? h('p', { class: 'small' }, `Plaques: ${(s?.coop?.plaques ?? []).map((p) => `${nameOf(p.kind)} (${p.names.join(', ')})`).join('; ')}`) : null)),
    playerVisitsCard(d.id),
  ];
}

// ------------------------------------------------------------------------------------------- support

function supportTab(c: Ctx): HTMLElement[] {
  const { d, deep, save: s } = c;
  const p = d.profile;
  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast(ok); await c.redraw(); refreshBadges(); } catch (e) { fail(e); } };
  const name = nameOfPlayer(c);
  const backupFile = async (bid: number, source: string) => {
    try {
      const b = await rpc<{ data: unknown; taken_at: string }>('admin_backup_data', { p_backup: bid });
      const json = source !== 'snapshot' ? JSON.stringify(b.data, null, 1) : JSON.stringify(saveFromSnapshot(b.data, suggestedMoney(p?.level ?? 1)));
      download(`cozy-acres-${slug(name)}-backup-${b.taken_at.slice(0, 10)}.json`, json);
    } catch (e) { fail(e); }
  };
  const flags = p as unknown as { lb_flag?: string; lb_flagged_at?: string; lb_xp_budget?: number; lb_value_budget?: number; lb_charm_budget?: number; lb_value_max?: number; lb_charm_max?: number } | null;
  return [
    h('div', { class: 'grid-2' },
      card('Account', kv([
        ['Signed in with', d.auth?.providers.length ? d.auth.providers.join(', ') : 'Nothing (anonymous)'],
        ['Google email', d.auth?.email ?? '-'],
        ['Account created', date(d.auth?.created_at, true)],
        ['Last sign-in', date(d.auth?.last_sign_in_at, true)],
        ['Profile updated', `${date(p?.updated_at, true)} (${ago(p?.updated_at)})`],
        ['Notifications', d.push.devices ? `${d.push.devices} device(s), last delivered ${ago(d.push.last_ok_at)}` : 'Off'],
        ['Friend code', p?.code ?? '-'],
        ['Account id', h('span', { class: 'mono-small' }, d.id)],
      ])),
      card('Save and backups',
        h('p', { class: 'small' }, d.cloud ? h('span', null, badge('Cloud save', 'good'), ` saved ${ago(d.cloud.updated_at)}${d.cloud.device ? ` from ${d.cloud.device}` : ''}, level ${d.cloud.level}, ${num(d.cloud.coins)} coins, ${bytes(d.cloud.bytes)}, save version ${d.cloud.save_version}`)
          : h('span', null, badge('No cloud save', 'bad'), ' They have not signed in with Google, so only their farm layout is on the server.')),
        h('p', { class: 'small' }, d.snapshot ? `Farm layout shared ${ago(d.snapshot.updated_at)}.` : 'No farm layout shared yet.'),
        s ? h('p', { class: 'small' }, `In the save: version ${s.version ?? '?'}, last game version ${s.lastSeenVersion ?? '?'}, last played ${ago(ms(s.lastSeen))}.`) : null,
        d.backups.length ? h('table', { class: 'table compact' }, h('tbody', null, d.backups.map((b) => h('tr', null, h('td', null, date(b.taken_at, true)), h('td', null, b.source === 'cloud' ? 'Cloud save' : b.source === 'device' ? 'Daily copy' : 'Layout'),
          h('td', { class: 'r' }, b.level ? `Level ${b.level}` : ''), h('td', { class: 'r' }, bytes(b.bytes)), h('td', { class: 'r' }, h('button', { class: 'btn small', onclick: () => backupFile(b.id, b.source) }, 'Download'))))))
          : h('p', { class: 'muted small' }, 'No backups yet (see Backups).'),
        h('p', { class: 'muted small' }, 'Save files load in the game with Settings > Import save. Farm codes are typed in Settings > Load a farm.'))),
    h('div', { class: 'grid-2' },
      card('Developer gifts', d.adminGifts.length ? h('table', { class: 'table compact' }, h('tbody', null, d.adminGifts.map((g) => h('tr', null,
        h('td', null, date(g.created_at, true)), h('td', null, describeGift(g), g.message ? h('div', { class: 'muted small' }, `"${g.message}"`) : null),
        h('td', null, g.claimed_at ? badge(`Received ${ago(g.claimed_at)}`, 'good') : badge('Waiting', 'info')),
        h('td', { class: 'r' }, g.claimed_at ? null : h('button', { class: 'btn small', onclick: async () => { if (await confirmAction('Cancel this gift?', 'They will not get it.')) await act(() => rpc('admin_cancel_gift', { p_gift: g.id }), 'Gift cancelled'); } }, 'Cancel'))))))
        : h('p', { class: 'muted small' }, 'None yet.')),
      card('Letters from you', deep?.letters.length ? h('table', { class: 'table compact' }, h('tbody', null, deep.letters.map((l) => h('tr', null,
        h('td', null, date(l.sent)), h('td', null, l.title, h('div', { class: 'muted small' }, l.audience === 'player' ? 'Just to them' : `To ${l.audience}`)),
        h('td', null, l.delivered ? badge(`Read ${ago(l.delivered)}`, 'good') : badge('In the post', 'info'))))))
        : h('p', { class: 'muted small' }, 'No letters yet.'))),
    h('div', { class: 'grid-2' },
      card('Phone notifications', deep?.pushQueue.length ? h('table', { class: 'table compact' }, h('tbody', null, deep.pushQueue.map((n) => h('tr', null,
        h('td', { class: 'small' }, date(n.fire, true)), h('td', null, badge(n.kind)), h('td', null, n.title, h('div', { class: 'muted small' }, n.body)), h('td', null, n.status ?? (n.sent ? 'sent' : 'waiting'))))))
        : h('p', { class: 'muted small' }, 'Nothing sent lately.')),
      card('Leaderboard fair play', kv([
        ['Flag', flags?.lb_flag ? h('span', null, badge(flags.lb_flag, 'bad'), ` ${ago(flags.lb_flagged_at)}`) : 'None'],
        ['Hidden', p?.lb_hidden ? 'Yes' : 'No'],
        ['XP allowance left', flags?.lb_xp_budget !== undefined && flags?.lb_xp_budget !== null ? num(flags.lb_xp_budget) : '-'],
        ['Farm value allowance left', flags?.lb_value_budget !== undefined && flags?.lb_value_budget !== null ? num(flags.lb_value_budget) : '-'],
        ['Charm allowance left', flags?.lb_charm_budget !== undefined && flags?.lb_charm_budget !== null ? num(flags.lb_charm_budget) : '-'],
        ['Highest farm value / charm', `${num(flags?.lb_value_max ?? 0)} / ${num(flags?.lb_charm_max ?? 0)}`],
        ['Reward codes used', (deep?.codes ?? []).map((x) => `${x.code} (${date(x.at)})`).join(', ') || 'None'],
      ]))),
    h('div', { class: 'grid-2' },
      h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, 'Notes'), h('button', { class: 'btn small', onclick: async () => {
        const ta = h('textarea', { class: 'input', rows: 4, maxLength: 2000 }) as HTMLTextAreaElement;
        if (await modal('Add a note', ta, [{ label: 'Cancel', value: 'no' }, { label: 'Save note', value: 'yes', kind: 'primary' }]) !== 'yes' || !ta.value.trim()) return;
        await act(() => rpc('admin_add_note', { p_id: d.id, p_note: ta.value.trim() }), 'Note saved');
      } }, 'Add note')),
      d.notes.length ? h('ul', { class: 'notes' }, d.notes.map((n) => h('li', null, h('div', { class: 'muted small' }, `${date(n.at, true)} - ${n.admin}`), n.note,
        h('button', { class: 'link-btn small', style: { marginLeft: '10px' }, onclick: async () => { if (await confirmAction('Delete note?', n.note)) await act(() => rpc('admin_delete_note', { p_note: n.id }), 'Note deleted'); } }, 'Delete'))))
        : h('p', { class: 'muted small' }, 'Keep track of what you did for this player.')),
      card(`Their feedback (${d.feedback.length})`, d.feedback.length ? h('ul', { class: 'notes' }, d.feedback.map((f) => h('li', null, h('div', { class: 'muted small' }, `${date(f.created_at, true)} - ${f.category} - ${f.status}${f.version ? ` - ${f.version}` : ''}${f.device ? ` - ${f.device}` : ''}`), f.message,
        f.admin_note ? h('div', { class: 'muted small' }, `Your note: ${f.admin_note}`) : null))) : h('p', { class: 'muted small' }, 'No feedback from them.'))),
    card(`Account locks (${c.locks.length})`, c.locks.length ? h('table', { class: 'table compact' },
      h('thead', null, h('tr', null, h('th', null, 'Locked'), h('th', null, 'Until'), h('th', null, 'Reason'), h('th', null, 'Status'))),
      h('tbody', null, c.locks.map((l) => h('tr', null, h('td', { class: 'small' }, date(l.lockedAt, true), h('div', { class: 'muted small' }, l.by ?? '')),
        h('td', { class: 'small' }, l.until ? date(l.until, true) : 'No end date'), h('td', null, l.reason),
        h('td', null, l.active ? h('span', null, badge('In force', 'bad'), ' ', liveCountdown(l.until)) : l.liftedBy === 'expired' ? badge('Ran out', 'good') : badge(`Lifted ${l.liftedAt ? ago(l.liftedAt) : ''}${l.liftedBy ? ` by ${l.liftedBy}` : ''}`, 'good'))))))
      : h('p', { class: 'muted small' }, 'Never locked.')),
    playerReportsCard(d.id),
    cloudCopiesCard(d.id, name),
    card('What admins did for this player', deep?.adminLog.length ? h('table', { class: 'table compact' }, h('tbody', null, deep.adminLog.map((l) => h('tr', null,
      h('td', { class: 'small' }, date(l.at, true)), h('td', null, l.action), h('td', { class: 'small muted' }, l.admin), h('td', { class: 'small' }, l.detail ? Object.entries(l.detail).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(', ') : '')))))
      : h('p', { class: 'muted small' }, 'Nothing logged yet.')),
  ];
}

// ------------------------------------------------------------------------------------------- raw

function rawTab(c: Ctx): HTMLElement[] {
  const sections: [string, unknown][] = [['Profile', c.d.profile], ['Account', c.d.auth], ['Cloud save summary', c.d.cloud], ['Deep data', c.deep],
    ...(c.save ? Object.entries(c.save).map(([k, v]) => [`Save: ${k}`, v] as [string, unknown]) : []), ['Farm layout', c.d.snapshot?.data]];
  let q = '';
  const host = h('div');
  const draw = () => host.replaceChildren(...sections.filter(([k, v]) => !q || k.toLowerCase().includes(q) || JSON.stringify(v ?? null).toLowerCase().includes(q)).map(([k, v]) => {
    const text = JSON.stringify(v ?? null, null, 1) ?? 'null';
    return h('details', { class: 'raw' }, h('summary', null, k, h('span', { class: 'muted small' }, ` ${bytes(text.length)}`)), h('pre', { class: 'json' }, text.length > 200000 ? `${text.slice(0, 200000)}\n...` : text));
  }));
  draw();
  return [h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, 'Raw data'),
    h('input', { class: 'input', style: { maxWidth: '300px' }, type: 'search', placeholder: 'Search keys and values', oninput: (e: Event) => { q = (e.target as HTMLInputElement).value.toLowerCase().trim(); draw(); } })),
  h('p', { class: 'muted small' }, 'Everything the server holds for this player, as stored. For support only: never share it.'), host)];
}

/** 1.33.5 the Support tab: cloud farms the server kept when this player's cloud farm was replaced (cloud_save_history). */
function cloudCopiesCard(id: string, name: string): HTMLElement {
  const body = h('div');
  const box = card('Earlier cloud farms', h('p', { class: 'muted small' }, 'Kept when their cloud farm was replaced by another farm or a smaller one (last 5, 180 days). They can bring one back themselves in Settings > Your farm > Earlier cloud farms.'), body);
  void loading(body, async () => {
    const rows = await rpc<{ id: number; name: string | null; level: number; device: string | null; saved_at: string; kept_at: string; reason: string }[]>('admin_cloud_copies', { p_id: id });
    const get = async (cid: number, at: string) => {
      try { const x = await rpc<{ data: unknown }>('admin_cloud_copy', { p_copy: cid }); download(`cozy-acres-${slug(name)}-earlier-${at.slice(0, 10)}.json`, JSON.stringify(x.data, null, 1)); } catch (e) { fail(e); }
    };
    body.replaceChildren(rows.length ? h('table', { class: 'table compact' }, h('tbody', null, rows.map((r) => h('tr', null,
      h('td', { class: 'small' }, date(r.saved_at, true)), h('td', null, `${r.name ?? 'Farmer'}, level ${r.level}`), h('td', { class: 'small muted' }, `replaced ${ago(r.kept_at)} (${r.reason})`),
      h('td', { class: 'r' }, h('button', { class: 'btn small', onclick: () => get(r.id, r.saved_at) }, 'Download'))))))
      : h('p', { class: 'muted small' }, 'None: their cloud farm has never been replaced.'));
  });
  return box;
}
