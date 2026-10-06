import { rpc } from '../api';
import { h, num, ago, date, loading, badge, modal, toast, fail, field, confirmAction, copyText } from '../ui';
import { describeGift } from '../giftForm';

interface Reward { code: string; coins: number; gems: number; items: Record<string, number>; message: string | null; note: string | null; created_at: string; expires_at: string; max_claims: number; claims: number; claimers: { id: string; name: string | null; at: string }[] }
interface Transfer { code: string; note: string | null; created_at: string; expires_at: string; claims: number; max_claims: number; claimed_at: string | null; bytes: number }
const fmtCode = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;

export async function codesView(host: HTMLElement): Promise<void> {
  const body = h('div');
  const load = () => loading(body, async () => {
    const c = await rpc<{ reward: Reward[]; transfers: Transfer[] }>('admin_codes');
    const del = async (kind: 'reward' | 'transfer', code: string) => {
      if (!await confirmAction('Delete this code?', `${fmtCode(code)} stops working at once.`)) return;
      try { await rpc('admin_delete_code', { p_kind: kind, p_code: code }); toast('Code deleted'); void load(); } catch (e) { fail(e); }
    };
    const live = (x: { expires_at: string; claims: number; max_claims: number }) => Date.parse(x.expires_at) > Date.now() && x.claims < x.max_claims;
    body.replaceChildren(
      h('section', { class: 'card' }, h('h3', null, 'Reward codes'), h('p', { class: 'muted small' }, 'Players type these in Friends > Gift codes.'),
        c.reward.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' },
          h('thead', null, h('tr', null, ['Code', 'Gives', 'Used', 'Expires', 'Note', ''].map((t) => h('th', null, t)))),
          h('tbody', null, c.reward.map((r) => h('tr', null,
            h('td', null, h('button', { class: 'code-chip', title: 'Copy', onclick: () => copyText(fmtCode(r.code)) }, fmtCode(r.code))),
            h('td', null, describeGift({ ...r, land: 0 }), r.message ? h('div', { class: 'muted small' }, `"${r.message}"`) : null),
            h('td', null, `${r.claims} / ${r.max_claims}`, r.claimers.length ? h('div', { class: 'muted small' }, r.claimers.map((x) => x.name ?? '?').join(', ')) : null),
            h('td', null, live(r) ? `in ${Math.max(0, Math.round((Date.parse(r.expires_at) - Date.now()) / 864e5))} days` : badge('Finished')),
            h('td', null, r.note ?? ''), h('td', { class: 'r' }, h('button', { class: 'btn small', onclick: () => del('reward', r.code) }, 'Delete'))))))) : h('p', { class: 'muted' }, 'No reward codes yet.')),
      h('section', { class: 'card' }, h('h3', null, 'Farm codes'), h('p', { class: 'muted small' }, 'A whole farm behind a short code: Settings > Load a farm. Make one from a player page (Farm backup and restore) or from a farm link below.'),
        c.transfers.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' },
          h('thead', null, h('tr', null, ['Code', 'Note', 'Loaded', 'Made', 'Expires', ''].map((t) => h('th', null, t)))),
          h('tbody', null, c.transfers.map((t) => h('tr', null,
            h('td', null, h('button', { class: 'code-chip', onclick: () => copyText(fmtCode(t.code)) }, fmtCode(t.code))), h('td', null, t.note ?? ''),
            h('td', null, `${t.claims} / ${t.max_claims}`, t.claimed_at ? h('div', { class: 'muted small' }, `last ${ago(t.claimed_at)}`) : null),
            h('td', null, date(t.created_at)), h('td', null, live(t) ? date(t.expires_at) : badge('Finished')),
            h('td', { class: 'r' }, h('button', { class: 'btn small', onclick: () => del('transfer', t.code) }, 'Delete'))))))) : h('p', { class: 'muted' }, 'No farm codes yet.')));
  });

  const n = (v: number) => h('input', { class: 'input', type: 'number', min: 0, value: String(v) }) as HTMLInputElement;
  const coins = n(500), gems = n(0), max = n(1), daysIn = n(30);
  const msg = h('input', { class: 'input', maxLength: 120, placeholder: 'Shown when they open it' }) as HTMLInputElement;
  const note = h('input', { class: 'input', placeholder: 'Only you see this' }) as HTMLInputElement;
  const make = async () => {
    try {
      const code = await rpc<string>('admin_make_reward_code', { p_coins: Number(coins.value) || 0, p_gems: Number(gems.value) || 0, p_message: msg.value || null, p_max_claims: Number(max.value) || 1, p_items: {}, p_note: note.value || null, p_days: Number(daysIn.value) || 30 });
      void load();
      if (await modal('Reward code ready', [h('div', { class: 'big-code' }, code), h('p', { class: 'muted small' }, `Friends > Gift codes, type the code, Open. Works for ${max.value} player(s), ${daysIn.value} days.`)], [{ label: 'Copy code', value: 'copy' }, { label: 'Done', value: 'ok', kind: 'primary' }]) === 'copy') await copyText(code);
    } catch (e) { fail(e); }
  };
  const link = h('textarea', { class: 'input', rows: 3, placeholder: 'https://cozyacres.joshmakesgames.app/play/#farm=z...' }) as HTMLTextAreaElement;
  const linkNote = h('input', { class: 'input', placeholder: 'e.g. Mel restore' }) as HTMLInputElement;
  const fromLink = async () => {
    try {
      const code = await rpc<string>('admin_make_farm_transfer', { p_data: link.value.trim(), p_note: linkNote.value || null });
      link.value = '';
      void load();
      if (await modal('Farm code ready', [h('div', { class: 'big-code' }, code)], [{ label: 'Copy code', value: 'copy' }, { label: 'Done', value: 'ok', kind: 'primary' }]) === 'copy') await copyText(code);
    } catch (e) { fail(e); }
  };
  host.append(h('div', { class: 'page-head' }, h('h1', null, 'Codes')),
    h('div', { class: 'grid-2' },
      h('section', { class: 'card' }, h('h3', null, 'New reward code'),
        h('div', { class: 'grid-2' }, field('Coins', coins), field('Gems', gems), field('How many players can use it', max), field('Days it works', daysIn)),
        field('Message', msg), field('Note', note), h('button', { class: 'btn primary', onclick: make }, 'Make code'),
        h('p', { class: 'muted small' }, `Tip: one code with ${num(15)} uses is handy for thanking all your testers.`)),
      h('section', { class: 'card' }, h('h3', null, 'Farm code from a farm link'), field('Farm link', link), field('Note', linkNote), h('button', { class: 'btn primary', onclick: fromLink }, 'Make farm code'))),
    body);
  await load();
}
