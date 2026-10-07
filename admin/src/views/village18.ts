import { rpc } from '../api';
import { h, num, pct, ago, date, loading, toast, fail, field, modal, badge } from '../ui';
import { chartCard, bars, hbars, type Point } from '../charts';

/** admin_v18_overview (supabase/schema.sql, "1.8 welcome"). */
interface V18 {
  generatedAt: string; days: number; playersWithEvents: number; events: number;
  funnel: { variant: 'full' | 'short'; step: string; players: number }[];
  later: number; skippedGift: number;
  headStart: { players: number; avgHearts: number };
  villagers: { villager: string; gifts: number; givers: number; loved: number; liked: number; disliked: number; hearts: number; friends: number }[];
  visits: { day: string; done: number; active: number }[];
  activity: { kind: string; n: number; players: number }[];
  letters: { id: string; title: string; body: string; audience: string; recipients: number; delivered: number; created_at: string; created_by: string | null }[];
}

const STEPS: Record<'full' | 'short', [string, string][]> = {
  full: [['start', 'Saw Hazel\'s letter'], ['villagers', 'Met the villagers'], ['news_village', 'Village Friends card'], ['news_quality', 'Star quality card'],
    ['news_mail', 'Mailbox card'], ['news_help', 'Ask a friend card'], ['gift', 'Reached the first gift'], ['gift_given', 'Gave Rosa a gift'], ['summary', 'Saw "Your farm in 1.8"'], ['done', 'Finished']],
  short: [['start', 'Saw Hazel\'s letter (level 3)'], ['villagers', 'Met the villagers'], ['gift', 'Reached the first gift'], ['gift_given', 'Gave Rosa a gift'], ['done', 'Finished']],
};
const NAMES: Record<string, string> = { rosa: 'Rosa', tom: 'Old Tom', juniper: 'Juniper', pip: 'Pip', hazel: 'Hazel', bram: 'Bram' };
const ACTIVITY: Record<string, string> = {
  help_ask: 'Asked friends for something', help_send: 'Sent something to a friend who asked', help_arrived: 'Help arrived (includes neighbour help)',
  help_hazel: 'Hazel stepped in', visit_give: 'Gave the visiting villager their wish', find_collect: 'Picked up a daily find', find_return: 'Returned a lost item',
};
const AUD: [string, string][] = [['all', 'Every player'], ['active7', 'Played this week'], ['active14', 'Played in the last 2 weeks'], ['active30', 'Played this month'], ['google', 'Backed up with Google']];
const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function tile(label: string, value: string, sub = ''): HTMLElement {
  return h('div', { class: 'tile card' }, h('div', { class: 'tile-label' }, label), h('div', { class: 'tile-value' }, value), sub ? h('div', { class: 'tile-sub' }, sub) : null);
}

/** The letter as players will see it in the mailbox (a cozy paper card). */
function letterPreview(title: string, body: string): HTMLElement {
  return h('div', { class: 'letter-preview' },
    h('div', { class: 'lp-from muted small' }, 'A letter from the Cozy Acres team'),
    h('div', { class: 'lp-title' }, title || 'Title'),
    h('div', { class: 'lp-body' }, (body || 'Your message to every farmer.').split(/\n{2,}/).map((p) => h('p', null, p))));
}

export async function village18View(host: HTMLElement): Promise<void> {
  let days = 30;
  const stats = h('div');
  const draw = () => loading(stats, async () => {
    const o = await rpc<V18>('admin_v18_overview', { p_days: days });
    const range = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Time range' }, [7, 30, 90].map((d) =>
      h('button', { class: d === days ? 'active' : '', onclick: () => { days = d; void draw(); } }, `${d} days`)));
    const full = (k: string) => o.funnel.find((f) => f.variant === 'full' && f.step === k)?.players ?? 0;
    const gifts = o.villagers.reduce((a, v) => a + v.gifts, 0);
    const visitDone = o.visits.reduce((a, v) => a + v.done, 0), visitActive = o.visits.reduce((a, v) => a + v.active, 0);
    stats.replaceChildren(
      h('div', { class: 'page-head' },
        h('div', null, h('h1', null, '1.8 Village'), h('div', { class: 'muted small' }, `Updated ${ago(o.generatedAt)} - from game events (version 1.8.0 and later)`)),
        h('div', { class: 'row' }, range, h('button', { class: 'btn', onclick: () => void draw() }, 'Refresh'))),
      h('div', { class: 'tiles' },
        tile('Started the 1.8 welcome', num(full('start')), `${num(o.later)} tapped Later at least once`),
        tile('Finished it', num(full('done')), full('start') ? `${pct(full('done'), full('start'))} of those who started` : ''),
        tile('Head start given', num(o.headStart.players), `about ${o.headStart.avgHearts} hearts with each villager`),
        tile(`Gifts to villagers (${days} days)`, num(gifts), `${num(o.villagers.reduce((a, v) => a + v.givers, 0))} giver-villager pairs`),
        tile(`Daily visits done (${days} days)`, num(visitDone), visitActive ? `${pct(visitDone, visitActive)} of player-days` : ''),
        tile('Players with events', num(o.playersWithEvents), `${num(o.events)} events in ${days} days`)));

    // funnels: one row per step, the share of the first step
    const funnel = (variant: 'full' | 'short', title: string, sub: string) => {
      const pts: Point[] = STEPS[variant].map(([k, label]) => {
        const n = o.funnel.find((f) => f.variant === variant && f.step === k)?.players ?? 0;
        return { label, value: n };
      });
      return chartCard(title, sub, (el) => hbars(el, pts), pts, 'Players');
    };
    const vPts: Point[] = o.villagers.map((v) => ({ label: NAMES[v.villager] ?? v.villager, value: v.gifts, tip: `${v.gifts} gifts (${v.loved} loved, ${v.liked} liked, ${v.disliked} disliked) from ${v.givers} players` }));
    const hPts: Point[] = o.villagers.map((v) => ({ label: NAMES[v.villager] ?? v.villager, value: v.hearts, tip: `${v.hearts} hearts in all, ${v.friends} players with at least 1 heart` })).sort((a, b) => b.value - a.value);
    const visitPts: Point[] = o.visits.map((d) => ({ label: short(d.day), value: d.active ? Math.round((d.done / d.active) * 100) : 0, tip: `${d.done} of ${d.active} players who played that day (${pct(d.done, d.active)})` }));
    stats.append(
      h('div', { class: 'grid-2' },
        funnel('full', 'Welcome for players from before 1.8', 'Players who reached each step (all time)'),
        funnel('short', 'Village intro for new farms', 'Shown at level 3 (all time)')),
      h('div', { class: 'grid-2' },
        chartCard('Gifts per villager', `Last ${days} days`, (el) => hbars(el, vPts), vPts, 'Gifts'),
        chartCard('Hearts per villager', 'Each player\'s best heart count, added up (all time)', (el) => hbars(el, hPts), hPts, 'Hearts')),
      h('div', { class: 'grid-2' },
        chartCard('Daily villager visit done', '% of players who played that day', (el) => bars(el, visitPts, { fmt: (n) => `${n}%` }), visitPts, '% done'),
        h('section', { class: 'card' }, h('h3', null, 'Gift reactions'),
          o.villagers.length ? h('table', { class: 'table compact' },
            h('thead', null, h('tr', null, h('th', null, 'Villager'), h('th', { class: 'r' }, 'Loved'), h('th', { class: 'r' }, 'Liked'), h('th', { class: 'r' }, 'Disliked'), h('th', { class: 'r' }, 'Givers'))),
            h('tbody', null, o.villagers.map((v) => h('tr', null, h('td', null, NAMES[v.villager] ?? v.villager), h('td', { class: 'r' }, num(v.loved)), h('td', { class: 'r' }, num(v.liked)), h('td', { class: 'r' }, num(v.disliked)), h('td', { class: 'r' }, num(v.givers))))))
            : h('p', { class: 'muted' }, 'No gifts yet.'),
          h('h3', { style: { marginTop: '16px' } }, 'Ask a friend and mailbox'),
          o.activity.length ? h('table', { class: 'table compact' }, h('tbody', null, o.activity.map((a) => h('tr', null,
            h('td', null, ACTIVITY[a.kind] ?? a.kind), h('td', { class: 'r' }, num(a.n)), h('td', { class: 'r muted' }, `${num(a.players)} players`)))))
            : h('p', { class: 'muted' }, 'Nothing yet.'))),
      h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, 'Letters sent to everyone'), h('span', { class: 'muted small' }, 'Delivered = picked up by the game')),
        o.letters.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' },
          h('thead', null, h('tr', null, h('th', null, 'Sent'), h('th', null, 'Letter'), h('th', null, 'To'), h('th', { class: 'r' }, 'Delivered'))),
          h('tbody', null, o.letters.map((l) => h('tr', null, h('td', null, date(l.created_at, true)),
            h('td', null, h('b', null, l.title), h('div', { class: 'muted small' }, l.body.length > 120 ? `${l.body.slice(0, 120)}...` : l.body)),
            h('td', null, AUD.find(([k]) => k === l.audience)?.[1] ?? l.audience),
            h('td', { class: 'r' }, badge(`${num(l.delivered)} / ${num(l.recipients)}`, l.delivered >= l.recipients && l.recipients ? 'good' : 'info')))))))
          : h('p', { class: 'muted' }, 'No letters sent yet.')));
  });

  // "Send a letter to everyone"
  const title = h('input', { class: 'input', maxLength: 80, placeholder: 'e.g. Thank you, farmers!' }) as HTMLInputElement;
  const body = h('textarea', { class: 'input', rows: 6, maxLength: 2000, placeholder: 'Dear farmer,\n\nA short, warm note...\n\nThe Cozy Acres team' }) as HTMLTextAreaElement;
  const aud = h('select', { class: 'input' }, AUD.map(([v, t]) => h('option', { value: v }, t))) as HTMLSelectElement;
  const preview = h('div');
  const count = h('span', { class: 'muted small' });
  const upd = () => { preview.replaceChildren(letterPreview(title.value.trim(), body.value.trim())); count.textContent = `${body.value.length} / 2000`; };
  title.addEventListener('input', upd); body.addEventListener('input', upd);
  upd();
  const send = async () => {
    if (!title.value.trim() || !body.value.trim()) { toast('Write a title and a letter', 'info'); return; }
    if (/—/.test(title.value + body.value)) { toast('Use " - " instead of a long dash, like the rest of the game', 'info'); return; }
    const who = AUD.find(([k]) => k === aud.value)![1];
    if (await modal('Send this letter?', [letterPreview(title.value.trim(), body.value.trim()), h('p', null, `To: ${who}. It arrives in each mailbox the next time the game is opened, once per player, and cannot be taken back.`)],
      [{ label: 'Cancel', value: 'no' }, { label: 'Send letter', value: 'yes', kind: 'primary' }], true) !== 'yes') return;
    try {
      const n = await rpc<number>('admin_letter_all', { p_title: title.value, p_body: body.value, p_audience: aud.value });
      toast(`Letter on its way to ${num(n)} players`);
      title.value = ''; body.value = ''; upd(); void draw();
    } catch (e) { fail(e); }
  };
  host.append(stats, h('div', { class: 'grid-2' },
    h('section', { class: 'card' }, h('h3', null, 'Send a letter to everyone'),
      h('p', { class: 'muted small' }, 'It lands in the in-game mailbox, signed by the Cozy Acres team. Good for thank-yous, news and events. Keep it short and warm.'),
      field('Title', title, 'Up to 80 characters'), field('Letter', body, 'Up to 2000 characters. A blank line starts a new paragraph.'), count, field('Who', aud),
      h('button', { class: 'btn primary', onclick: send }, 'Preview and send')),
    h('section', { class: 'card' }, h('h3', null, 'Preview'), preview)));
  await draw();
}
