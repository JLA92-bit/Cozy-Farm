import { gameConfig } from '../../online/GameConfig';
import { renderAlmanac } from './AlmanacPage';
import { roomDone } from '../../systems/RestorationEffects';
import { Panel } from '../Panel';
import { h, icon, itemIcon, button, clear } from '../dom';
import { ui } from '../UI';
import { FESTIVALS, ITEMS, VILLAGER, VILLAGERS } from '../../data';
import { cycleOnDay } from '../../systems/FestivalCycle';
import { game } from '../../systems/Game';
import { mail } from '../../systems/Mail';
import { daily18 } from '../../systems/Daily18';
import { WEATHER, dayNumber, weatherOn, weatherToday } from '../../systems/Weather';
import { localDay } from '../../systems/Progression';
import { audio } from '../../systems/Audio';
import { letterRow, lettersNewestFirst, openMail, senderBadge } from './MailPanel';
import './mail.css';

/**
 * 1.8 Book pages next to the collection: the Calendar (birthdays, weather, market day, events), Letters (the
 * mail archive) and the Village Guide (pages from every src/data/guide-*.json, so each 1.8 system explains
 * itself in its own words).
 */

export const BOOK18_TABS = [
  { id: 'Calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'Letters', label: 'Letters', icon: 'mailbox' },
  { id: 'Guide', label: 'Village Guide', icon: 'book' },
  { id: 'Almanac', label: 'Almanac', icon: 'sun' },
];

/** Red dot count for a page's tab. */
export function book18Badge(id: string): number {
  return id === 'Letters' ? mail.letters.filter((l) => !l.read).length : 0;
}

/** Draw one of the 1.8 pages into the Book. False if `id` is not one of them. */
export function renderBook18(id: string, p: Panel): boolean {
  if (id === 'Calendar') { monthShift = 0; renderCalendar(p); return true; }
  if (id === 'Letters') { renderLetters(p); return true; }
  if (id === 'Guide') { renderGuide(p, guideAt); return true; }
  if (id === 'Almanac') { renderAlmanac(p); return true; }
  return false;
}

// ======================================================================== calendar
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
let monthShift = 0;

function renderCalendar(p: Panel): void {
  clear(p.body);
  const now = new Date(game.now());
  const first = new Date(now.getFullYear(), now.getMonth() + monthShift, 1);
  const y = first.getFullYear(), m = first.getMonth();
  const days = new Date(y, m + 1, 0).getDate();
  const todayKey = localDay(game.now());
  const go = (d: number) => { monthShift = Math.max(-11, Math.min(11, monthShift + d)); audio.play('page', { volume: 0.5 }); renderCalendar(p); };
  p.body.append(h('div', { class: 'cal-head' },
    button('<', () => go(-1), 'blue small', { 'aria-label': 'Previous month' }),
    h('div', { class: 'cal-month' }, first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })),
    button('>', () => go(1), 'blue small', { 'aria-label': 'Next month' })));

  const grid = h('div', { class: 'cal-grid', role: 'grid' });
  for (const d of DOW) grid.append(h('div', { class: 'cal-dow' }, d));
  const lead = (first.getDay() + 6) % 7;
  for (let i = 0; i < lead; i++) grid.append(h('div', { class: 'cal-day blank' }));
  // 1.9: the valley's festival days (every 7th day) in this month
  const monthEvents: { day: number; name: string; icon: string }[] = [];
  for (let d = 1; d <= days; d++) { const sn = cycleOnDay(dayNumber(localDay(new Date(y, m, d).getTime()))); if (sn.festival) { const f = FESTIVALS.festivals[sn.slot]; monthEvents.push({ day: d, name: f.name, icon: f.icon }); } }
  for (let d = 1; d <= days; d++) {
    const date = new Date(y, m, d);
    const key = localDay(date.getTime());
    const sat = date.getDay() === (gameConfig.marketDay ?? 6);
    const bday = VILLAGERS.filter((v) => v.birthday[0] === m + 1 && v.birthday[1] === d);
    const ev = monthEvents.find((e) => e.day === d);
    const isToday = key === todayKey;
    const cell = h('div', { class: `cal-day${sat ? ' sat' : ''}${ev ? ' event' : ''}${isToday ? ' today' : ''}`, 'aria-label': `${d}${isToday ? ', today' : ''}${bday.length ? `, ${bday.map((v) => v.name).join(' and ')}'s birthday` : ''}${sat ? ', market day' : ''}` },
      h('span', { class: 'n' }, String(d)));
    if (bday.length) cell.append(senderBadge(bday[0].id, 24));
    else if (isToday) cell.append(icon(WEATHER[weatherToday()].icon, 'mk'));
    else if (sat) cell.append(icon('basket', 'mk'));
    else if (ev) cell.append(icon(ev.icon, 'mk'));
    grid.append(cell);
  }
  p.body.append(grid);
  p.body.append(h('div', { class: 'cal-legend' },
    h('span', null, h('i', { class: 'sw', style: 'border:3px solid var(--btn-red);background:#fff1ef' }), 'Today'),
    h('span', null, icon('basket', 'mk'), roomDone('treasury') ? 'Saturday: village market day, orders and your stall pay 10% more' : 'Saturday: village market day (opens when the Treasury is rebuilt)'),
    monthEvents.length ? h('span', null, h('i', { class: 'sw', style: 'background:#eaf6ff' }), 'Festival day') : null,
    h('span', null, senderBadge('pip', 22), 'Face: a villager\'s birthday')));

  const list = h('div', { class: 'list cal-list' });
  // today (only on this month's page)
  if (monthShift === 0) {
    const w = weatherToday();
    const tomorrow = weatherOn(dayNumber(todayKey) + 1);
    list.append(h('div', { class: 'section-title' }, 'Today'));
    list.append(h('div', { class: 'list-item cal-today' }, icon(WEATHER[w].icon, 'icon big'),
      h('div', { class: 'grow' }, h('div', { class: 'title' }, `${WEATHER[w].name} today`), h('div', { class: 'sub' }, WEATHER[w].text), h('div', { class: 'sub' }, `Tomorrow: ${WEATHER[tomorrow].name.toLowerCase()}`))));
    const t = daily18.today;
    if (t.day === todayKey && VILLAGER[t.visitor]) {
      const v = VILLAGER[t.visitor];
      list.append(h('div', { class: 'list-item' }, senderBadge(v.id, 48),
        h('div', { class: 'grow' }, h('div', { class: 'title' }, `${v.name} visits today`), h('div', { class: 'sub' }, t.visitorDone ? 'You helped today. Thank you!' : 'Waiting by your farmhouse')),
        !t.visitorDone ? button('See', () => { p.close(); ui.open('visit18'); }, 'green small') : icon('check')));
    }
  }
  const bdays = VILLAGERS.filter((v) => v.birthday[0] === m + 1).sort((a, b) => a.birthday[1] - b.birthday[1]);
  list.append(h('div', { class: 'section-title' }, 'Birthdays'));
  if (!bdays.length) list.append(h('div', { class: 'muted' }, 'No birthdays this month.'));
  for (const v of bdays) {
    const loves = v.loves.filter((i) => ITEMS[i]).slice(0, 3);
    list.append(h('div', { class: 'list-item' }, senderBadge(v.id, 48),
      h('div', { class: 'grow' }, h('div', { class: 'title' }, `${v.name}: ${v.birthday[1]} ${first.toLocaleDateString('en-GB', { month: 'long' })}`), h('div', { class: 'sub' }, 'Gifts on a birthday count three times!')),
      h('span', { class: 'row', style: 'gap:2px' }, ...loves.map((i) => itemIcon(i)))));
  }
  if (monthEvents.length) {
    list.append(h('div', { class: 'section-title' }, 'Festivals'));
    for (const e of monthEvents) list.append(h('div', { class: 'list-item' }, icon(e.icon, 'icon big'), h('div', { class: 'grow' }, h('div', { class: 'title' }, e.name), h('div', { class: 'sub' }, `${e.day} ${first.toLocaleDateString('en-GB', { month: 'long' })}`))));
  }
  p.body.append(list);
}

// ======================================================================== letters
function renderLetters(p: Panel): void {
  clear(p.body);
  const list = lettersNewestFirst();
  p.body.append(h('div', { class: 'row between', style: 'margin-bottom:10px;gap:8px' },
    h('div', { class: 'muted', style: 'font-size:15px' }, list.length ? `${list.length} ${list.length === 1 ? 'letter' : 'letters'} kept` : 'Your letters are kept here.'),
    button([icon('mailbox'), 'Open mailbox'], () => { p.close(); openMail(); }, 'blue small')));
  if (!list.length) { p.body.append(h('div', { class: 'empty-state' }, icon('mailbox'), h('div', null, 'No letters yet.'))); return; }
  const box = h('div', { class: 'list' });
  for (const l of list) box.append(letterRow(l, () => { p.close(); openMail({ letter: l.id }); }));
  p.body.append(box);
}

// ======================================================================== village guide
interface GuidePage { id: string; title: string; icon: string; paragraphs: string[]; pictures?: string[] }

/** Order of the guide files in the Book; anything else follows alphabetically. */
const GUIDE_ORDER = ['villagers', 'mail', 'quality', 'help', 'skills', 'restoration'];
const files = import.meta.glob('../../data/guide-*.json', { eager: true, import: 'default' }) as Record<string, { pages?: unknown }>;

/** Every guide page from every guide file, checked, in Book order. Works with any number of files. */
export function guidePages(): GuidePage[] {
  const name = (path: string) => path.replace(/^.*guide-|\.json$/g, '');
  const rank = (n: string) => { const i = GUIDE_ORDER.indexOf(n); return i < 0 ? GUIDE_ORDER.length : i; };
  const out: GuidePage[] = [];
  for (const path of Object.keys(files).sort((a, b) => rank(name(a)) - rank(name(b)) || a.localeCompare(b))) {
    const pages = Array.isArray(files[path]?.pages) ? files[path].pages as unknown[] : [];
    for (const raw of pages) {
      const g = raw as Partial<GuidePage>;
      if (!g || typeof g.title !== 'string' || !Array.isArray(g.paragraphs)) continue;
      out.push({ id: typeof g.id === 'string' ? g.id : g.title, title: g.title, icon: typeof g.icon === 'string' ? g.icon : 'book', paragraphs: g.paragraphs.filter((x): x is string => typeof x === 'string'), pictures: Array.isArray(g.pictures) ? g.pictures.filter((x): x is string => typeof x === 'string') : undefined });
    }
  }
  return out;
}

let guideAt = '';

function renderGuide(p: Panel, at: string): void {
  clear(p.body);
  const pages = guidePages();
  if (!pages.length) { p.body.append(h('div', { class: 'empty-state' }, icon('book'), h('div', null, 'The guide is still being written.'))); return; }
  const i = Math.max(0, pages.findIndex((g) => g.id === at));
  const show = (k: number) => { guideAt = pages[k].id; audio.play('page', { volume: 0.5 }); renderGuide(p, guideAt); p.body.scrollTop = 0; };
  const index = h('div', { class: 'guide-index' });
  pages.forEach((g, k) => index.append(button([icon(g.icon), g.title], () => show(k), `${k === i ? 'active ' : ''}blue small`)));
  const g = pages[i];
  const page = h('div', { class: 'guide-page' }, h('h3', null, icon(g.icon), g.title));
  if (g.pictures?.length) page.append(h('div', { class: 'guide-pics' }, ...g.pictures.map((k) => (VILLAGER[k] ? senderBadge(k, 48) : ITEMS[k] ? itemIcon(k) : icon(k)))));
  for (const t of g.paragraphs) page.append(h('p', null, t));
  const nav = h('div', { class: 'guide-nav' },
    i > 0 ? button(['< ', pages[i - 1].title], () => show(i - 1), 'grey small') : null,
    i < pages.length - 1 ? button([pages[i + 1].title, ' >'], () => show(i + 1), 'green small') : null);
  page.append(nav);
  p.body.append(index, page);
}

/** Open the Book on a 1.8 page ('Calendar', 'Letters', 'Guide'), optionally on one guide page. */
export function openGuide(page?: string): void { if (page) guideAt = page; ui.open('collection', 'Guide'); }
ui.register('guide', (arg) => openGuide(typeof arg === 'string' ? arg : undefined));
