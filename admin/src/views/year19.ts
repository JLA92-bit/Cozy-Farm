import { rpc } from '../api';
import { h, num, ago, loading, toast, fail, field } from '../ui';

/** admin_v19_overview, get_game_config and admin_set_game_config (supabase/schema.sql, "1.9 a year in the valley"). */
interface V19 {
  generatedAt: string; days: number;
  config: { market_day?: number; weather?: { date: string; kind: string } };
  festivals: { festival: string; plays: number; players: number; collected: number; threeStar: number }[];
  woods: { visitors: number; foragers: number; forages: number; diggers: number; digs: number; expeditions: number; expeditionsDone: number };
  museum: { givers: number; pieces: number; curators: number; shelves: { shelf: string; players: number }[] };
  helpWanted: { players: number; filled: number };
}

const FESTIVALS: Record<string, string> = { egg_hunt: 'Egg Hunt (spring)', fishing_derby: 'Fishing Derby (summer)', harvest_fair: 'Harvest Fair (autumn)', feast_of_lights: 'Feast of Lights (winter)' };
const SHELVES: Record<string, string> = { minerals: 'Minerals', fossils: 'Fossils', artifacts: 'Old Artifacts', forage: "Forager's Cabinet", fish: 'Great Catches', gold: 'Gold Star Case' };
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function tile(label: string, value: string, sub = ''): HTMLElement {
  return h('div', { class: 'tile card' }, h('div', { class: 'tile-label' }, label), h('div', { class: 'tile-value' }, value), sub ? h('div', { class: 'tile-sub' }, sub) : null);
}

export async function year19View(host: HTMLElement): Promise<void> {
  let days = 30;
  const stats = h('div');
  const set = async (key: string, value: unknown) => {
    try { await rpc('admin_set_game_config', { p_key: key, p_value: value }); toast('Saved. Players get it the next time they open the game.'); void draw(); } catch (e) { fail(e); }
  };
  const draw = () => loading(stats, async () => {
    const o = await rpc<V19>('admin_v19_overview', { p_days: days });
    const range = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Time range' }, [7, 30, 90].map((d) =>
      h('button', { class: d === days ? 'active' : '', onclick: () => { days = d; void draw(); } }, `${d} days`)));
    const marketSel = h('select', null, h('option', { value: '' }, 'Default (Saturday)'), DAYS.map((d, i) => h('option', { value: String(i), selected: o.config.market_day === i }, d)));
    const wDate = h('input', { type: 'date', value: o.config.weather?.date ?? '' });
    const wKind = h('select', null, ['sunny', 'rain', 'mist'].map((k) => h('option', { value: k, selected: o.config.weather?.kind === k }, k)));
    stats.replaceChildren(
      h('div', { class: 'page-head' },
        h('div', null, h('h1', null, '1.9 A Year in the Valley'), h('div', { class: 'muted small' }, `Updated ${ago(o.generatedAt)} - from game events (version 1.9 and later)`)),
        h('div', { class: 'row' }, range, h('button', { class: 'btn', onclick: () => void draw() }, 'Refresh'))),
      h('section', { class: 'card' }, h('h3', null, 'Game settings'),
        h('p', { class: 'muted' }, 'Change these without a new release. Players pick them up the next time they open the game (the game keeps working with its normal defaults if this is empty).'),
        h('div', { class: 'grid-2' },
          h('div', null, field('Market day', marketSel, 'Which weekday the village market runs (needs the Treasury rebuilt).'),
            h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => void set('market_day', marketSel.value === '' ? null : Number(marketSel.value)) }, 'Save market day'))),
          h('div', null, field('Weather for one day', h('div', { class: 'row' }, wDate, wKind), 'Forces the weather on that date for every player. Clear it to go back to normal.'),
            h('div', { class: 'row' },
              h('button', { class: 'btn', onclick: () => { if (!wDate.value) { fail(new Error('Pick a date first')); return; } void set('weather', { date: wDate.value, kind: wKind.value }); } }, 'Save weather'),
              h('button', { class: 'btn', onclick: () => void set('weather', null) }, 'Clear'))))),
      h('div', { class: 'tiles' },
        tile('Woods visitors', num(o.woods.visitors), 'all time'),
        tile('Forage picked', num(o.woods.forages), `${num(o.woods.foragers)} players`),
        tile('Digs', num(o.woods.digs), `${num(o.woods.diggers)} players`),
        tile('Expeditions sent', num(o.woods.expeditions), `${num(o.woods.expeditionsDone)} came home`),
        tile('Museum pieces given', num(o.museum.pieces), `${num(o.museum.givers)} players, ${num(o.museum.curators)} Curators`),
        tile(`Help Wanted filled (${days} days)`, num(o.helpWanted.filled), `${num(o.helpWanted.players)} players`)),
      h('div', { class: 'grid-2' },
        h('section', { class: 'card' }, h('h3', null, `Festivals (${days} days)`),
          o.festivals.length ? h('table', { class: 'table compact' },
            h('thead', null, h('tr', null, h('th', null, 'Festival'), h('th', { class: 'r' }, 'Players'), h('th', { class: 'r' }, 'Plays'), h('th', { class: 'r' }, 'Prizes'), h('th', { class: 'r' }, '3 stars'))),
            h('tbody', null, o.festivals.map((f) => h('tr', null, h('td', null, FESTIVALS[f.festival] ?? f.festival), h('td', { class: 'r' }, num(f.players)), h('td', { class: 'r' }, num(f.plays)), h('td', { class: 'r' }, num(f.collected)), h('td', { class: 'r' }, num(f.threeStar))))))
            : h('p', { class: 'muted' }, 'No festival played yet. Festivals fall on the last day of each season.')),
        h('section', { class: 'card' }, h('h3', null, 'Museum shelves completed'),
          o.museum.shelves.length ? h('table', { class: 'table compact' },
            h('thead', null, h('tr', null, h('th', null, 'Shelf'), h('th', { class: 'r' }, 'Players'))),
            h('tbody', null, o.museum.shelves.map((s) => h('tr', null, h('td', null, SHELVES[s.shelf] ?? s.shelf), h('td', { class: 'r' }, num(s.players))))))
            : h('p', { class: 'muted' }, 'No shelf is full yet.'))));
  });
  host.append(stats);
  await draw();
}
