import { rpc } from '../api';
import { h, num, loading, toast, fail, field, modal } from '../ui';

const AUD: [string, string][] = [['all', 'Everyone with notifications on'], ['active7', 'Played this week'], ['active14', 'Played in the last 2 weeks'], ['active30', 'Played this month']];
const STATUS: Record<string, string> = { sent: 'Delivered to the sender', skipped: 'Skipped (daily limit)', stale: 'Too late, dropped', failed: 'No device took it', waiting: 'Waiting' };

export async function notifyView(host: HTMLElement): Promise<void> {
  const stats = h('div');
  const load = () => loading(stats, async () => {
    const s = await rpc<{ devices: number; players: number; workingDevices: number; byStatus: { kind: string; status: string; n: number }[] }>('admin_push_stats');
    stats.replaceChildren(h('section', { class: 'card' }, h('h3', null, 'Last 3 days'),
      h('p', null, `${num(s.players)} players, ${num(s.devices)} devices (${num(s.workingDevices)} delivered in the last 2 weeks).`),
      s.byStatus.length ? h('table', { class: 'table compact' }, h('thead', null, h('tr', null, h('th', null, 'Kind'), h('th', null, 'Result'), h('th', { class: 'r' }, 'Count'))),
        h('tbody', null, s.byStatus.map((b) => h('tr', null, h('td', null, b.kind), h('td', null, STATUS[b.status] ?? b.status), h('td', { class: 'r' }, num(b.n)))))) : h('p', { class: 'muted' }, 'Nothing sent recently.')));
  });
  const title = h('input', { class: 'input', maxLength: 80, placeholder: 'e.g. New update: Pretty Farms!' }) as HTMLInputElement;
  const body = h('textarea', { class: 'input', rows: 3, maxLength: 200, placeholder: 'e.g. 13 new paths and gates for every fence. Come and see!' }) as HTMLTextAreaElement;
  const aud = h('select', { class: 'input' }, AUD.map(([v, t]) => h('option', { value: v }, t))) as HTMLSelectElement;
  const preview = h('div', { class: 'push-preview' }, h('b', null, 'Cozy Acres'), h('div', { class: 'pp-title' }, 'Title'), h('div', { class: 'pp-body muted' }, 'Message'));
  const upd = () => { preview.querySelector('.pp-title')!.textContent = title.value || 'Title'; preview.querySelector('.pp-body')!.textContent = body.value || 'Message'; };
  title.addEventListener('input', upd); body.addEventListener('input', upd);
  const send = async () => {
    if (!title.value.trim() || !body.value.trim()) { toast('Write a title and a message', 'info'); return; }
    if (await modal('Send this notification?', [preview.cloneNode(true) as HTMLElement, h('p', null, `To: ${AUD.find(([k]) => k === aud.value)![1]}. It goes out within 5 minutes and cannot be taken back.`)],
      [{ label: 'Cancel', value: 'no' }, { label: 'Send', value: 'yes', kind: 'primary' }]) !== 'yes') return;
    try { const n = await rpc<number>('admin_push_all', { p_title: title.value, p_body: body.value, p_audience: aud.value }); toast(`Sending to ${num(n)} players`); title.value = ''; body.value = ''; upd(); void load(); } catch (e) { fail(e); }
  };
  host.append(h('div', { class: 'page-head' }, h('h1', null, 'Notifications')),
    h('div', { class: 'grid-2' },
      h('section', { class: 'card' }, h('h3', null, 'Send to players\' phones'), field('Title', title, 'Up to 80 characters'), field('Message', body, 'Up to 200 characters'), field('Who', aud),
        preview, h('button', { class: 'btn primary', onclick: send }, 'Send notification'),
        h('p', { class: 'muted small' }, 'Use sparingly: big updates, events, a thank-you. Each phone gets at most 10 notifications a day from Cozy Acres.')),
      stats));
  await load();
}
