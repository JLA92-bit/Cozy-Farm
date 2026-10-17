import { rpc } from '../api';
import { bars, chartCard, type Point } from '../charts';
import { h, num, pct, ago, bytes, badge, loading } from '../ui';

/** admin_visits_overview (supabase/schema.sql, "1.28.2 visits and help"). */
interface Visits {
  generatedAt: string; days: number;
  sharing: { farms: number; shared24h: number; shared7d: number; avgBytes: number; maxBuildings: number; over1200: number; refused: number };
  stale: { id: string; name: string; level: number; played: string; shared: string | null; reason: string | null; refusedAt: string | null; bytes: number | null; buildings: number | null; times: number | null }[];
  biggest: { id: string; name: string; level: number; buildings: number; bytes: number; shared: string }[];
  help: { helps: number; water: number; feed: number; tend: number; likes: number; helpers: number; farms: number; claimed: number; waiting: number; notes: Record<string, number>; busyDays: number };
  helpDays: { day: string; water: number; feed: number; tend: number; likes: number; helpers: number }[];
  topHelpers: { id: string; name: string; level: number; helps: number }[];
  topFarms: { id: string; name: string; level: number; helps: number; likes: number }[];
  visits: { visits: number; visitors: number; nothing: number; helped: number; liked: number; refusedAlready: number; refusedBusy: number; refusedOffline: number; refusedOther: number; oldPictures: number; avgMins: number };
  visitDays: { day: string; visits: number; helped: number; nothing: number }[];
  problems: { kind: string; reason: string; events: number; players: number }[];
  coop: { open: number; started: number; done: number; expired: number; cancelled: number; hosts: number; gifts: number; givers: number; unclaimed: number; kinds: Record<string, number> };
}

const NOTES: Record<string, string> = { lovely: 'Lovely farm!', flowers: 'Beautiful flowers', thanks: 'Thanks for the help', market: 'Great market', animals: 'Happy animals', cozy: 'So cozy!' };
const PROBLEMS: Record<string, string> = { farm_visit_failed: 'Visit could not open', farm_share_failed: 'Farm could not be shared', farm_share_trimmed: 'Farm shared without some decorations' };
const COOP: Record<string, string> = { footbridge: 'Friendship Footbridge', garden: 'Community Garden', fireworks: 'Fireworks Night' };
/** the most pieces a shared farm can have (publish_farm) */
const SHARE_LIMIT = 3000;

function tile(label: string, value: string, sub = ''): HTMLElement {
  return h('div', { class: 'tile card' }, h('div', { class: 'tile-label' }, label), h('div', { class: 'tile-value' }, value), sub ? h('div', { class: 'tile-sub' }, sub) : null);
}
const who = (id: string, name: string, level?: number) => h('a', { href: `#/player/${id}` }, `${name}${level ? ` (${level})` : ''}`);
const short = (d: string) => d.slice(5);

export async function visitsView(host: HTMLElement): Promise<void> {
  let days = 30;
  const stats = h('div');
  const draw = () => loading(stats, async () => {
    const o = await rpc<Visits>('admin_visits_overview', { p_days: days });
    const range = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Time range' }, [7, 30, 90].map((d) =>
      h('button', { class: d === days ? 'active' : '', onclick: () => { days = d; void draw(); } }, `${d} days`)));
    const v = o.visits, hp = o.help, s = o.sharing;
    const refusedHelp = v.refusedAlready + v.refusedBusy + v.refusedOffline + v.refusedOther;

    const helpPts: Point[] = o.helpDays.map((d) => ({ label: short(d.day), value: d.water + d.feed + d.tend, tip: `${d.water} watered, ${d.feed} fed, ${d.tend} tended or lent a hand, ${d.likes} likes, ${d.helpers} helpers` }));
    const visitPts: Point[] = o.visitDays.map((d) => ({ label: short(d.day), value: d.visits, tip: `${d.visits} visits, ${d.helped} helped, ${d.nothing} with nothing to help` }));

    const stale = o.stale.filter((r) => r.shared || r.reason);
    const never = o.stale.length - stale.length;

    stats.replaceChildren(
      h('div', { class: 'page-head' },
        h('div', null, h('h1', null, 'Visits and help'), h('div', { class: 'muted small' }, `Updated ${ago(o.generatedAt)} - visits are counted from version 1.28.2; help, likes and shared farms from the server`)),
        h('div', { class: 'row' }, range, h('button', { class: 'btn', onclick: () => void draw() }, 'Refresh'))),

      h('div', { class: 'tiles' },
        tile(`Visits (${days} days)`, num(v.visits), `${num(v.visitors)} players, about ${v.avgMins} min each`),
        tile('Visits where they helped', pct(v.helped, v.visits), `${num(v.helped)} of ${num(v.visits)}`),
        tile('Nothing to help with', pct(v.nothing, v.visits), `${num(v.nothing)} visits found every field, tree and home done`),
        tile('Farm picture a day or more old', pct(v.oldPictures, v.visits), 'The owner had not played (or their farm could not be shared)'),
        tile(`Helps (${days} days)`, num(hp.helps), `${num(hp.water)} water, ${num(hp.feed)} feed, ${num(hp.tend)} tend or hand`),
        tile('Likes', num(hp.likes), `${num(hp.helpers)} helpers, ${num(hp.farms)} farms helped`),
        tile('Help used by the owner', pct(hp.claimed, hp.helps), hp.waiting ? `${num(hp.waiting)} waiting more than 3 days (owner away)` : 'Nothing waiting long'),
        tile('Help refused on visits', num(refusedHelp), refusedHelp ? `${v.refusedAlready} already today, ${v.refusedBusy} farm busy, ${v.refusedOffline} offline, ${v.refusedOther} other` : 'None')),

      h('section', { class: 'card' }, h('h3', null, 'Shared farms (what visitors see)'),
        h('p', { class: 'muted small' }, 'Each player\'s game shares a picture of their farm every few minutes while they play. Visitors see that picture, so an old or refused one means visitors cannot help with what is really there.'),
        h('div', { class: 'tiles' },
          tile('Farms shared', num(s.farms), `${num(s.shared24h)} today, ${num(s.shared7d)} this week`),
          tile('Average size', bytes(s.avgBytes), `Biggest: ${num(s.maxBuildings)} of ${num(SHARE_LIMIT)} pieces`),
          tile('Over the old 1,200 limit', num(s.over1200), 'Shared again since 1.28.2'),
          tile('Refused right now', num(s.refused), s.refused ? 'See the list below' : 'None')),
        stale.length ? h('div', null,
          h('h4', null, 'Played lately, but their farm picture is 2+ days old'),
          h('table', { class: 'table compact' },
            h('thead', null, h('tr', null, h('th', null, 'Player'), h('th', null, 'Played'), h('th', null, 'Last shared'), h('th', null, 'Why'))),
            h('tbody', null, stale.map((r) => h('tr', null,
              h('td', null, who(r.id, r.name, r.level)), h('td', null, ago(r.played)), h('td', null, r.shared ? ago(r.shared) : 'Never'),
              h('td', null, r.reason ? h('span', null, badge(r.reason, 'bad'), ` ${num(r.buildings ?? 0)} pieces, ${bytes(r.bytes ?? 0)}, ${num(r.times ?? 0)} times, last ${ago(r.refusedAt)}`) : h('span', { class: 'muted' }, 'No refusal on record: probably an older game version or offline')))))))
          : h('p', { class: 'muted small' }, 'Every player who played lately has a fresh farm picture.'),
        never ? h('p', { class: 'muted small' }, `${num(never)} ${never === 1 ? 'player who' : 'players who'} played in the last 3 days have never shared a farm (usually brand new or offline players).`) : null,
        o.biggest.length ? h('details', null, h('summary', null, 'Biggest farms'),
          h('table', { class: 'table compact' },
            h('thead', null, h('tr', null, h('th', null, 'Player'), h('th', { class: 'r' }, 'Pieces'), h('th', { class: 'r' }, 'Size'), h('th', null, 'Shared'))),
            h('tbody', null, o.biggest.map((b) => h('tr', null, h('td', null, who(b.id, b.name, b.level)),
              h('td', { class: 'r' }, h('span', null, num(b.buildings), b.buildings > SHARE_LIMIT * 0.85 ? h('span', null, ' ', badge('near the limit', 'warn')) : null)),
              h('td', { class: 'r' }, bytes(b.bytes)), h('td', null, ago(b.shared))))))) : null),

      h('div', { class: 'grid-2' },
        chartCard('Visits a day', 'From version 1.28.2', (el) => bars(el, visitPts), visitPts, 'Visits'),
        chartCard('Helps a day', 'Water, feed, tend and a hand at workshops', (el) => bars(el, helpPts), helpPts, 'Helps')),

      h('div', { class: 'grid-2' },
        h('section', { class: 'card' }, h('h3', null, `Most helpful players (${days} days)`),
          o.topHelpers.length ? h('table', { class: 'table compact' }, h('tbody', null, o.topHelpers.map((t) => h('tr', null, h('td', null, who(t.id, t.name, t.level)), h('td', { class: 'r' }, `${num(t.helps)} helps`)))))
            : h('p', { class: 'muted' }, 'Nobody has helped yet.')),
        h('section', { class: 'card' }, h('h3', null, `Most visited farms (${days} days)`),
          o.topFarms.length ? h('table', { class: 'table compact' }, h('tbody', null, o.topFarms.map((t) => h('tr', null, h('td', null, who(t.id, t.name, t.level)), h('td', { class: 'r' }, `${num(t.helps)} helps, ${num(t.likes)} likes`)))))
            : h('p', { class: 'muted' }, 'No farm has had help yet.'))),

      h('div', { class: 'grid-2' },
        h('section', { class: 'card' }, h('h3', null, 'Problems reported by the game'),
          o.problems.length ? h('table', { class: 'table compact' },
            h('thead', null, h('tr', null, h('th', null, 'What'), h('th', null, 'Detail'), h('th', { class: 'r' }, 'Times'), h('th', { class: 'r' }, 'Players'))),
            h('tbody', null, o.problems.map((p) => h('tr', null, h('td', null, PROBLEMS[p.kind] ?? p.kind), h('td', null, p.reason), h('td', { class: 'r' }, num(p.events)), h('td', { class: 'r' }, num(p.players))))))
            : h('p', { class: 'muted' }, 'No problems reported.'),
          hp.busyDays ? h('p', { class: 'small' }, badge('Busy', 'warn'), ` ${num(hp.busyDays)} times a farm reached its 50 helps for the day.`) : null),
        h('section', { class: 'card' }, h('h3', null, 'Guestbook notes'),
          Object.keys(hp.notes).length ? h('table', { class: 'table compact' }, h('tbody', null, Object.entries(hp.notes).sort((a, b) => b[1] - a[1]).map(([k, n]) => h('tr', null, h('td', null, NOTES[k] ?? k), h('td', { class: 'r' }, num(n))))))
            : h('p', { class: 'muted' }, 'No notes left yet.'))),

      h('section', { class: 'card' }, h('h3', null, `Village Projects, 1.28 co-op (${days} days)`),
        h('div', { class: 'tiles' },
          tile('Open now', num(o.coop.open), `${num(o.coop.unclaimed)} rewards or refunds not collected yet`),
          tile('Started', num(o.coop.started), `${num(o.coop.hosts)} hosts`),
          tile('Finished', num(o.coop.done), o.coop.started ? `${pct(o.coop.done, o.coop.started)} of started` : ''),
          tile('Ran out of time / cancelled', `${num(o.coop.expired)} / ${num(o.coop.cancelled)}`, 'Everyone got their goods back'),
          tile('Gifts to projects', num(o.coop.gifts), `${num(o.coop.givers)} players`)),
        Object.keys(o.coop.kinds).length ? h('p', { class: 'small' }, Object.entries(o.coop.kinds).map(([k, n]) => `${COOP[k] ?? k}: ${num(n)}`).join(' - ')) : null));
  });
  host.append(stats);
  await draw();
}

/** admin_player_visits: the Visits card on a player's page. */
interface PlayerVisits {
  farm: { shared: string; bytes: number; buildings: number } | null;
  refusal: { at: string; reason: string; bytes: number; buildings: number; times: number } | null;
  given30: { helps: number; likes: number };
  got30: { helps: number; likes: number; unclaimed: number };
  recent: { at: string; kind: string; what: string | null; note: string | null; dir: 'gave' | 'got'; other: string | null; claimed: boolean }[];
  visits: { at: string; kind: string; detail: Record<string, unknown> }[];
  coop: { kind: string; status: string; created: string; closed: string | null; gifts: number }[];
  coopGiven: number;
}

const KIND: Record<string, string> = { water: 'watered', feed: 'fed', tend: 'tended', like: 'liked' };
/** a building id as words ("apple_tree" -> "apple tree", a field for "plot") */
const thing = (id: string | null, def: string) => (!id ? def : id === 'plot' ? 'field' : id.replace(/_/g, ' '));

export function playerVisitsCard(id: string): HTMLElement {
  const card = h('section', { class: 'card' }, h('h3', null, 'Visits and help'));
  const body = h('div');
  card.append(body);
  void loading(body, async () => {
    const d = await rpc<PlayerVisits>('admin_player_visits', { p_id: id });
    const refusedNow = d.refusal && (!d.farm || d.refusal.at > d.farm.shared);
    body.replaceChildren(h('div', null,
      h('p', { class: 'small' }, d.farm ? `Farm shared ${ago(d.farm.shared)}: ${num(d.farm.buildings)} pieces, ${bytes(d.farm.bytes)}.` : 'No farm shared yet.'),
      refusedNow ? h('p', { class: 'small' }, badge('Not shared', 'bad'), ` ${d.refusal!.reason} (${num(d.refusal!.buildings)} pieces, ${bytes(d.refusal!.bytes)}), ${num(d.refusal!.times)} times, last ${ago(d.refusal!.at)}. Visitors see the older picture.`) : null,
      h('p', { class: 'small' }, `Last 30 days: gave ${num(d.given30.helps)} helps and ${num(d.given30.likes)} likes; got ${num(d.got30.helps)} helps and ${num(d.got30.likes)} likes${d.got30.unclaimed ? ` (${num(d.got30.unclaimed)} not picked up yet)` : ''}. Co-op: ${num(d.coop.length)} ${d.coop.length === 1 ? 'project' : 'projects'} hosted, ${num(d.coopGiven)} gifts given.`),
      d.recent.length ? h('details', null, h('summary', null, `Recent help (${d.recent.length})`), h('table', { class: 'table compact' }, h('tbody', null, d.recent.map((r) => h('tr', null,
        h('td', null, ago(r.at)),
        h('td', null, r.dir === 'gave' ? `They ${KIND[r.kind] ?? r.kind} ${r.other ?? '?'}'s ${thing(r.what, 'farm')}` : `${r.other ?? '?'} ${KIND[r.kind] ?? r.kind} their ${thing(r.what, 'farm')}`),
        h('td', null, r.dir === 'got' && r.kind !== 'like' ? (r.claimed ? 'Used' : 'Waiting') : (r.note ?? '')))))))
        : null,
      d.visits.length ? h('details', null, h('summary', null, `Their visits and sharing (${d.visits.length})`), h('table', { class: 'table compact' }, h('tbody', null, d.visits.map((e) => h('tr', null,
        h('td', null, ago(e.at)), h('td', null, PROBLEMS[e.kind] ?? (e.kind === 'farm_visit' ? 'Visited a farm' : e.kind)),
        h('td', { class: 'small' }, visitDetail(e)))))))
        : null,
      d.coop.length ? h('details', null, h('summary', null, `Village Projects hosted (${d.coop.length})`), h('table', { class: 'table compact' }, h('tbody', null, d.coop.map((c) => h('tr', null,
        h('td', null, ago(c.created)), h('td', null, COOP[c.kind] ?? c.kind), h('td', null, c.status), h('td', { class: 'r' }, `${num(c.gifts)} gifts`))))))
        : null));
  });
  return card;
}

function visitDetail(e: { kind: string; detail: Record<string, unknown> }): string {
  const d = e.detail;
  if (e.kind === 'farm_visit') {
    const bits = [`${d.helpable ?? '?'} things needed help`, d.helped ? 'helped' : d.refused ? `help refused (${String(d.refused)})` : 'did not help', d.liked ? 'liked' : ''];
    if (typeof d.ageH === 'number') bits.push(`picture ${d.ageH} h old`);
    return bits.filter(Boolean).join(', ');
  }
  return Object.entries(d).map(([k, v]) => `${k}: ${String(v)}`).join(', ');
}
