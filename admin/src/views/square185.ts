import { rpc } from '../api';
import { h, num, ago, loading } from '../ui';
import { chartCard, hbars, type Point } from '../charts';

/** admin_v185_overview (supabase/schema.sql, "1.8.5 skills and village restoration"). */
interface V185 {
  generatedAt: string; days: number;
  rooms: { room: string; players: number }[];
  bundles: { room: string; bundle: string; players: number }[];
  bundlePlayers: number;
  skills: { skill: string; players: number; level5: number; level10: number; top: number }[];
  perks: { skill: string; perk: string; players: number }[];
  headStart: number;
  recent: { roomsDone: number; bundlesDone: number; levelUps: number; players: number };
}

const ROOMS: Record<string, string> = { pantry: 'The Pantry', barn: 'The Barn Room', pier: 'The Pier', kitchen: 'The Kitchen', workshop: 'The Workshop', treasury: 'The Treasury' };
const SKILLS: Record<string, string> = { farming: 'Farming', animals: 'Animals', fishing: 'Fishing', cooking: 'Cooking', crafting: 'Crafting' };
const PERKS: Record<string, string> = {
  quick_grower: 'Quick Grower', big_harvest: 'Big Harvest', master_farmer: 'Master Farmer', seed_saver: 'Seed Saver',
  happy_herd: 'Happy Herd', prize_animals: 'Prize Animals', shepherd: 'Shepherd', breeder: 'Breeder',
  patient_angler: 'Patient Angler', quick_cast: 'Quick Cast', legend_hunter: 'Legend Hunter', fishmonger: 'Fishmonger',
  batch_cook: 'Batch Cook', chef: 'Chef', head_chef: 'Head Chef', gourmet: 'Gourmet',
  thrifty_smith: 'Thrifty Smith', sturdy_tools: 'Sturdy Tools', golden_touch: 'Golden Touch', tinkerer: 'Tinkerer',
};

function tile(label: string, value: string, sub = ''): HTMLElement {
  return h('div', { class: 'tile card' }, h('div', { class: 'tile-label' }, label), h('div', { class: 'tile-value' }, value), sub ? h('div', { class: 'tile-sub' }, sub) : null);
}

export async function square185View(host: HTMLElement): Promise<void> {
  let days = 30;
  const stats = h('div');
  const draw = () => loading(stats, async () => {
    const o = await rpc<V185>('admin_v185_overview', { p_days: days });
    const range = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Time range' }, [7, 30, 90].map((d) =>
      h('button', { class: d === days ? 'active' : '', onclick: () => { days = d; void draw(); } }, `${d} days`)));
    const roomPts: Point[] = o.rooms.map((r) => ({ label: ROOMS[r.room] ?? r.room, value: r.players, tip: `${r.players} players rebuilt it` }));
    const perkPts: Point[] = o.perks.map((p) => ({ label: `${SKILLS[p.skill] ?? p.skill}: ${PERKS[p.perk] ?? p.perk}`, value: p.players, tip: `${p.players} players chose it` })).sort((a, b) => b.value - a.value);
    const topRoom = o.rooms[0];
    stats.replaceChildren(
      h('div', { class: 'page-head' },
        h('div', null, h('h1', null, '1.8.5 Square and Skills'), h('div', { class: 'muted small' }, `Updated ${ago(o.generatedAt)} - from game events (version 1.8.5 and later)`)),
        h('div', { class: 'row' }, range, h('button', { class: 'btn', onclick: () => void draw() }, 'Refresh'))),
      h('div', { class: 'tiles' },
        tile('Players who filled a bundle', num(o.bundlePlayers), 'all time'),
        tile('Rooms rebuilt', num(o.rooms.reduce((a, r) => a + r.players, 0)), topRoom ? `most: ${ROOMS[topRoom.room] ?? topRoom.room} (${num(topRoom.players)} players)` : 'none yet'),
        tile(`Bundles filled (${days} days)`, num(o.recent.bundlesDone), `${num(o.recent.roomsDone)} rooms rebuilt`),
        tile(`Skill level-ups (${days} days)`, num(o.recent.levelUps), `${num(o.recent.players)} players with square or skill events`),
        tile('Skills head start given', num(o.headStart), 'farms from before 1.8.5')),
      h('div', { class: 'grid-2' },
        chartCard('Rooms rebuilt', 'Players who finished each room (all time)', (el) => hbars(el, roomPts), roomPts, 'Players'),
        h('section', { class: 'card' }, h('h3', null, 'Bundles filled'),
          o.bundles.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' },
            h('thead', null, h('tr', null, h('th', null, 'Room'), h('th', null, 'Bundle'), h('th', { class: 'r' }, 'Players'))),
            h('tbody', null, o.bundles.map((b) => h('tr', null, h('td', null, ROOMS[b.room] ?? b.room), h('td', null, b.bundle), h('td', { class: 'r' }, num(b.players)))))))
            : h('p', { class: 'muted' }, 'No bundles filled yet.'))),
      h('div', { class: 'grid-2' },
        h('section', { class: 'card' }, h('h3', null, 'Skills'),
          o.skills.length ? h('table', { class: 'table compact' },
            h('thead', null, h('tr', null, h('th', null, 'Skill'), h('th', { class: 'r' }, 'Players'), h('th', { class: 'r' }, 'Level 5+'), h('th', { class: 'r' }, 'Level 10'), h('th', { class: 'r' }, 'Highest'))),
            h('tbody', null, o.skills.map((s) => h('tr', null, h('td', null, SKILLS[s.skill] ?? s.skill), h('td', { class: 'r' }, num(s.players)), h('td', { class: 'r' }, num(s.level5)), h('td', { class: 'r' }, num(s.level10)), h('td', { class: 'r' }, num(s.top))))))
            : h('p', { class: 'muted' }, 'No skill level-ups yet. Players who levelled before 1.8.5 started with a head start and are not counted here.')),
        chartCard('Perks chosen', 'Players per perk (all time)', (el) => hbars(el, perkPts), perkPts, 'Players')));
  });
  host.append(stats);
  await draw();
}
