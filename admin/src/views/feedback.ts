import { rpc, type Feedback } from '../api';
import { h, date, loading, badge, toast, fail, ago } from '../ui';
import { refreshBadges } from '../main';

const CAT: Record<string, [string, string]> = { bug: ['Problem', 'bad'], idea: ['Idea', 'info'], praise: ['Love it', 'good'], other: ['Other', ''] };
let status: string | null = 'new';

export async function feedbackView(host: HTMLElement): Promise<void> {
  const tabs = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Show' });
  const list = h('div');
  const load = () => loading(list, async () => {
    tabs.replaceChildren(...([['new', 'New'], ['seen', 'Seen'], ['done', 'Done'], [null, 'All']] as [string | null, string][]).map(([v, t]) =>
      h('button', { class: v === status ? 'active' : '', onclick: () => { status = v; void load(); } }, t)));
    const rows = await rpc<Feedback[]>('admin_feedback_list', { p_status: status, p_limit: 500 });
    const set = async (f: Feedback, s: string | null, note?: string) => {
      try { await rpc('admin_feedback_set', { p_id: f.id, p_status: s, p_note: note ?? null }); toast(s ? `Marked ${s}` : 'Note saved'); refreshBadges(); void load(); } catch (e) { fail(e); }
    };
    list.replaceChildren(...(rows.length ? rows.map((f) => {
      const note = h('input', { class: 'input', placeholder: 'Your note (only you see it)', value: f.admin_note ?? '' }) as HTMLInputElement;
      const [label, kind] = CAT[f.category] ?? ['Other', ''];
      return h('article', { class: 'card feedback' },
        h('div', { class: 'card-head' },
          h('div', null, badge(label, kind), ' ', f.user_id ? h('a', { href: `#/player/${f.user_id}` }, f.player_name ?? 'Player') : (f.player_name ?? 'Player'),
            h('span', { class: 'muted small' }, ` - level ${f.level ?? '?'} - ${f.platform ?? '?'} ${f.version ?? ''} - ${ago(f.created_at)}`)),
          badge(f.status, f.status === 'new' ? 'info' : f.status === 'done' ? 'good' : '')),
        h('p', { class: 'feedback-msg' }, f.message),
        f.device ? h('div', { class: 'muted small mono-small' }, f.device) : null,
        h('div', { class: 'row wrap' }, note, h('button', { class: 'btn small', onclick: () => set(f, null, note.value) }, 'Save note'),
          f.status !== 'seen' ? h('button', { class: 'btn small', onclick: () => set(f, 'seen') }, 'Mark seen') : null,
          f.status !== 'done' ? h('button', { class: 'btn small primary', onclick: () => set(f, 'done') }, 'Done') : null),
        h('div', { class: 'muted small' }, date(f.created_at, true)));
    }) : [h('p', { class: 'muted' }, status === 'new' ? 'No new feedback. Players send it from Settings > Send feedback.' : 'Nothing here.')]));
  });
  host.append(h('div', { class: 'page-head' }, h('h1', null, 'Feedback'), tabs), list);
  await load();
}
