import { rpc, type Overview } from '../api';
import { h, num, pct, minutes, ago, date, loading, compact } from '../ui';
import { chartCard, bars, line, hbars, seq, type Point } from '../charts';

const DOW = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PLATFORM: Record<string, string> = { android: 'Play Store app', pwa: 'Installed web app', web: 'Browser', ios: 'iPhone / iPad app', unknown: 'Not known yet' };
const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function tile(label: string, value: string, sub = '', href = ''): HTMLElement {
  const body = [h('div', { class: 'tile-label' }, label), h('div', { class: 'tile-value' }, value), sub ? h('div', { class: 'tile-sub' }, sub) : null];
  return href ? h('a', { class: 'tile card', href }, body) : h('div', { class: 'tile card' }, body);
}

export async function overviewView(host: HTMLElement): Promise<void> {
  let days = 30;
  let showAll = false;
  const draw = async () => loading(host, async () => {
    const o = await rpc<Overview>('admin_overview', { p_days: Math.max(days, 14) });
    host.replaceChildren();
    const range = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Time range' }, [14, 30, 90, 180].map((d) =>
      h('button', { class: d === days ? 'active' : '', onclick: () => { days = d; void draw(); } }, `${d} days`)));
    host.append(h('div', { class: 'page-head' },
      h('div', null, h('h1', null, 'Overview'), h('div', { class: 'muted small' }, `Updated ${ago(o.generatedAt)} - times in UTC`)),
      h('div', { class: 'row' }, range, h('button', { class: 'btn', onclick: () => void draw() }, 'Refresh'))));

    const g = o.players ? Math.round((o.google / o.players) * 100) : 0;
    host.append(h('div', { class: 'tiles' },
      tile('Players', num(o.players), `${num(o.new7)} new this week`, '#/players'),
      tile('Played in the last 24 hours', o.active24 === undefined ? '-' : num(o.active24), o.active24 === undefined ? 'run the latest supabase/schema.sql to turn this on' : 'rolling, any time of day'),
      tile('Played today', num(o.active1), `${num(o.active7)} this week, ${num(o.active30)} this month`),
      tile('Play time today', minutes(o.minutes1), `${minutes(o.minutes7)} this week`),
      tile('Avg per player (7 days)', o.active7 ? minutes(o.minutes7 / o.active7) : '-', `${num(o.sessions7)} sessions`),
      tile('Backed up with Google', `${g}%`, `${num(o.google)} of ${num(o.players)} players`, '#/players'),
      tile('Notifications on', num(o.pushPlayers), `${num(o.pushDevices)} devices`, '#/notify'),
      tile('New feedback', num(o.feedbackNew), 'waiting to be read', '#/feedback'),
      tile('Last backup', o.lastBackup ? ago(o.lastBackup) : 'never', `${num(o.backups)} saved`, '#/backups'),
    ));

    const daily = o.daily.slice(-days);
    const pts = (k: 'active' | 'new' | 'minutes' | 'sessions', fmt: (n: number) => string = num): Point[] =>
      daily.map((d) => ({ label: short(d.day), value: d[k], tip: `${fmt(d[k])}` }));
    const grid = h('div', { class: 'grid-2' });
    grid.append(
      chartCard('Players each day', `Daily active players, last ${days} days`, (el) => line(el, pts('active')), pts('active'), 'Players'),
      chartCard('New players each day', 'Farmers created', (el) => bars(el, pts('new')), pts('new'), 'New'),
      chartCard('Minutes played each day', 'All players together', (el) => bars(el, pts('minutes', minutes), { fmt: compact }), pts('minutes'), 'Minutes'),
      chartCard('Sessions each day', 'Times the game was opened', (el) => bars(el, pts('sessions')), pts('sessions'), 'Sessions'),
    );
    host.append(grid);

    // closed test tracker: Google needs 12+ testers opted in for 14 days in a row
    const testers = o.tester14;
    const t12 = testers.filter((t) => t.days >= 1).length;
    host.append(h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('div', null, h('h3', null, 'Closed test: last 14 days'),
        h('div', { class: 'muted small' }, 'Google asks for at least 12 testers opted in for 14 days in a row. Opt-ins are in Play Console; this shows who actually played.')),
        h('div', { class: 'tile-value small-value' }, `${t12} / 12`)),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 12, 'aria-valuenow': t12 }, h('span', { style: { width: `${Math.min(100, (t12 / 12) * 100)}%` } })),
      testers.length ? h('table', { class: 'table compact' },
        h('thead', null, h('tr', null, h('th', null, 'Player'), h('th', { class: 'r' }, 'Days played (of 14)'), h('th', { class: 'r' }, 'Time'), h('th', null, 'Last played'), h('th', null, 'Where'))),
        h('tbody', null, testers.slice(0, showAll ? testers.length : 15).map((t) => h('tr', null,
          h('td', null, h('a', { href: `#/player/${t.id}` }, t.name), h('span', { class: 'muted small' }, ` ${t.code}`)),
          h('td', { class: 'r' }, h('span', { class: 'mini-bar', style: { width: `${(t.days / 14) * 60}px` } }), ` ${t.days}`),
          h('td', { class: 'r' }, minutes(t.minutes)), h('td', null, ago(t.last)), h('td', null, PLATFORM[t.platform ?? 'unknown'] ?? t.platform)))))
        : h('p', { class: 'muted' }, 'No play recorded in the last 14 days yet. Play time is recorded from version 1.7.0.'),
      testers.length > 15 ? h('button', { class: 'link-btn', onclick: () => { showAll = !showAll; void draw(); } }, showAll ? 'Show fewer' : `Show all ${testers.length}`) : null));

    // retention cohorts
    const cell = (n: number, of: number, size: number) => {
      if (!of) return h('td', { class: 'r muted' }, '-');
      const f = n / Math.max(1, size);
      return h('td', { class: 'r heat', style: { background: seq(f), color: f > 0.5 ? 'var(--on-strong)' : 'var(--text-primary)' }, title: `${n} of ${size}` }, pct(n, size));
    };
    host.append(h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('div', null, h('h3', null, 'Do players come back?'),
        h('div', { class: 'muted small' }, 'Players grouped by the week they started. Day 1 = played the next day; week 2 = played in their second week; later = played again after 2 weeks.'))),
      o.cohorts.length ? h('table', { class: 'table compact' },
        h('thead', null, h('tr', null, h('th', null, 'Started week of'), h('th', { class: 'r' }, 'Players'), h('th', { class: 'r' }, 'Day 1'), h('th', { class: 'r' }, 'Week 2'), h('th', { class: 'r' }, 'Later'))),
        h('tbody', null, o.cohorts.map((c) => h('tr', null, h('td', null, date(c.week)), h('td', { class: 'r' }, num(c.size)),
          cell(c.d1, c.eligible1, c.size), cell(c.d7, c.eligible7, c.size), cell(c.d14, c.eligible14, c.size))))) : h('p', { class: 'muted' }, 'No players in the last 12 weeks.')));

    const levelPts: Point[] = o.levels.map((l) => ({ label: String(l.level), value: l.n, tip: `${l.n} players at level ${l.level}` }));
    const platPts: Point[] = o.platforms.map((p) => ({ label: PLATFORM[p.platform] ?? p.platform, value: p.n }));
    const verPts: Point[] = o.versions.map((v) => ({ label: v.version, value: v.n }));
    const dowPts: Point[] = [1, 2, 3, 4, 5, 6, 7].map((d) => { const w = o.weekdays.find((x) => x.dow === d); return { label: DOW[d], value: w?.active ?? 0, tip: `${w?.active ?? 0} player-days, ${minutes(w?.minutes ?? 0)}` }; });
    const grid2 = h('div', { class: 'grid-2' });
    grid2.append(
      chartCard('Players by level', 'Everyone with a farmer', (el) => bars(el, levelPts, { height: 170 }), levelPts, 'Players'),
      chartCard('Busiest days of the week', 'Last 8 weeks, player-days', (el) => bars(el, dowPts, { height: 170 }), dowPts, 'Player-days'),
      chartCard('Where they play', 'Last 30 days', (el) => hbars(el, platPts), platPts, 'Players'),
      chartCard('Game version in use', 'Last 7 days', (el) => hbars(el, verPts), verPts, 'Players'),
    );
    host.append(grid2);

    host.append(h('div', { class: 'grid-2' },
      h('section', { class: 'card' }, h('h3', null, 'Most played (30 days)'),
        o.top.length ? h('table', { class: 'table compact' }, h('tbody', null, o.top.map((t, i) => h('tr', null,
          h('td', { class: 'muted' }, `${i + 1}`), h('td', null, h('a', { href: `#/player/${t.id}` }, t.name)), h('td', { class: 'r' }, `Level ${t.level}`), h('td', { class: 'r' }, minutes(t.minutes))))))
          : h('p', { class: 'muted' }, 'Nothing recorded yet.')),
      h('section', { class: 'card' }, h('h3', null, 'Community (7 days)'),
        h('table', { class: 'table compact' }, h('tbody', null,
          [['Gifts between players', o.gifts7], ['Market sales', o.sales7], ['Open market listings', o.listingsOpen], ['Neighbour help', o.helps7], ['Farm likes', o.likes7],
            ['Developer gifts not picked up yet', o.giftsPending], ['Hidden from leaderboards', o.hidden], ['Online accounts', o.accounts], ['Accounts that never made a farmer', o.anonymousNoFarm]]
            .map(([k, v]) => h('tr', null, h('td', null, String(k)), h('td', { class: 'r' }, num(Number(v))))))))));
  });
  await draw();
}
