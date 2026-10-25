import { rpc } from '../api';
import { h, date, loading, badge, toast, fail, ago } from '../ui';
import { refreshBadges } from '../main';

/**
 * Reports page (ADMIN.md "Reports"): players reporting other players from the game (player cards, gifts, visits).
 * Server: supabase/schema.sql section "reports and blocks". Read each within a day; lock the account from the
 * player page when needed, then mark the report Actioned (or Dismissed).
 */

export interface Report {
  id: string; reporter: string; reported: string; reason: string; note: string | null; place: string;
  name: string | null; farm_name: string | null; gift_message: string | null; created_at: string;
  status: 'open' | 'actioned' | 'dismissed'; admin_note: string | null; reviewed_at: string | null; reviewed_by: string | null;
  reporter_name?: string | null; reported_name_now?: string | null; reported_farm_now?: string | null;
  reported_count?: number; reporters?: number; locked?: boolean;
}

const REASON: Record<string, string> = {
  name: 'Rude name', message: 'Unkind gift note', farm: 'Rude farm or home', cheating: 'Cheating', other: 'Something else',
};
const PLACE: Record<string, string> = {
  card: 'player card', gift: 'a gift', visit: 'a farm visit', home: 'a home visit', friends: 'friends', leaderboard: 'leaderboards', market: 'the market',
};
let status: string | null = 'open';

/** One report as a card (also used on the player page). */
export function reportCard(r: Report, onSet: (s: string | null, note?: string) => void, withReported = true): HTMLElement {
  const note = h('input', { class: 'input', placeholder: 'Your note (only you see it)', value: r.admin_note ?? '' }) as HTMLInputElement;
  const renamed = r.reported_name_now && r.name && r.reported_name_now !== r.name;
  return h('article', { class: 'card feedback' },
    h('div', { class: 'card-head' },
      h('div', null, badge(REASON[r.reason] ?? r.reason, 'bad'), ' ',
        withReported ? h('a', { href: `#/player/${r.reported}` }, r.name ?? 'Player') : null,
        withReported && renamed ? h('span', { class: 'muted small' }, ` (now ${r.reported_name_now})`) : null,
        h('span', { class: 'muted small' }, ` - from ${PLACE[r.place] ?? r.place} - ${ago(r.created_at)}`)),
      h('div', null, r.locked ? badge('Locked', 'bad') : null, ' ', badge(r.status, r.status === 'open' ? 'info' : r.status === 'actioned' ? 'good' : ''))),
    r.farm_name ? h('div', { class: 'small' }, `Farm name: ${r.farm_name}`) : null,
    r.gift_message ? h('p', { class: 'feedback-msg' }, `Gift note: "${r.gift_message}"`) : null,
    r.note ? h('p', { class: 'feedback-msg' }, r.note) : h('p', { class: 'muted small' }, 'No note from the reporter.'),
    h('div', { class: 'muted small' }, 'Reported by ', h('a', { href: `#/player/${r.reporter}` }, r.reporter_name ?? 'a player'),
      withReported && r.reported_count && r.reported_count > 1 ? ` - reported ${r.reported_count} times by ${r.reporters} players` : ''),
    h('div', { class: 'row wrap' }, note, h('button', { class: 'btn small', onclick: () => onSet(null, note.value) }, 'Save note'),
      r.status !== 'open' ? h('button', { class: 'btn small', onclick: () => onSet('open', note.value) }, 'Reopen') : null,
      r.status !== 'dismissed' ? h('button', { class: 'btn small', onclick: () => onSet('dismissed', note.value) }, 'Dismiss') : null,
      r.status !== 'actioned' ? h('button', { class: 'btn small primary', onclick: () => onSet('actioned', note.value) }, 'Actioned') : null),
    h('div', { class: 'muted small' }, date(r.created_at, true), r.reviewed_at ? ` - reviewed ${ago(r.reviewed_at)}${r.reviewed_by ? ` by ${r.reviewed_by}` : ''}` : ''));
}

export async function setReport(r: Report, s: string | null, note?: string): Promise<boolean> {
  try {
    await rpc('admin_report_set', { p_id: r.id, p_status: s, p_note: note ?? null });
    toast(s ? `Marked ${s}` : 'Note saved');
    refreshBadges();
    return true;
  } catch (e) { fail(e); return false; }
}

export async function reportsView(host: HTMLElement): Promise<void> {
  const tabs = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Show' });
  const list = h('div');
  const load = () => loading(list, async () => {
    tabs.replaceChildren(...([['open', 'Open'], ['actioned', 'Actioned'], ['dismissed', 'Dismissed'], [null, 'All']] as [string | null, string][]).map(([v, t]) =>
      h('button', { class: v === status ? 'active' : '', onclick: () => { status = v; void load(); } }, t)));
    const rows = await rpc<Report[]>('admin_reports', { p_status: status, p_limit: 500 });
    list.replaceChildren(...(rows.length
      ? rows.map((r) => reportCard(r, async (s, note) => { if (await setReport(r, s, note)) void load(); }))
      : [h('p', { class: 'muted' }, status === 'open' ? 'No open reports. Players report from a player card, a gift or a farm visit.' : 'Nothing here.')]));
  });
  host.append(h('div', { class: 'page-head' }, h('h1', null, 'Reports'), tabs),
    h('p', { class: 'muted small' }, 'Read every report within a day (App Store rule). To act, open the player and lock the account (Support tab), then mark the report Actioned.'),
    list);
  await load();
}

/** The player page's Support tab: reports about this player and by them, and how many block them. */
export function playerReportsCard(id: string): HTMLElement {
  const box = h('section', { class: 'card' }, h('h3', null, 'Reports and blocks'));
  const body = h('div');
  box.append(body);
  const load = () => loading(body, async () => {
    const d = await rpc<{ about: Report[]; made: Report[]; blockedBy: number; blocks: number }>('admin_player_reports', { p_id: id });
    body.replaceChildren(
      h('p', { class: 'small' }, `Blocked by ${d.blockedBy} player(s). Blocks ${d.blocks} player(s). Reported ${d.about.length} time(s), made ${d.made.length} report(s).`),
      ...d.about.map((r) => reportCard(r, async (s, note) => { if (await setReport(r, s, note)) void load(); }, false)),
      d.made.length ? h('details', null, h('summary', null, `Reports they made (${d.made.length})`),
        h('ul', { class: 'notes' }, d.made.map((r) => h('li', null, h('a', { href: `#/player/${r.reported}` }, r.name ?? 'Player'), ` - ${REASON[r.reason] ?? r.reason} - ${r.status} - ${ago(r.created_at)}`)))) : '');
  });
  void load();
  return box;
}
