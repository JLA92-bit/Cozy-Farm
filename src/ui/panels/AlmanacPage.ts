import { h, icon, itemIcon, clear } from '../dom';
import type { Panel } from '../Panel';
import { CROP, FESTIVALS, FISHING, SEASONS, WOODS, type SeasonId } from '../../data';
import { game } from '../../systems/Game';
import { seasons } from '../../systems/Seasons';
import './woods.css';

/** The Almanac (1.9): the year on one page. Four season cards and the ribbon wall. */
export function renderAlmanac(p: Panel): void {
  clear(p.body);
  const now = seasons.now();
  p.body.append(h('div', { class: 'al-head' }, icon(now.def.icon, 'al-icon'),
    h('div', null, h('div', { class: 'al-title' }, `${now.def.name}, day ${now.day} of ${SEASONS.daysPerSeason}`),
      h('div', { class: 'muted' }, `The valley's year has ${SEASONS.order.length * SEASONS.daysPerSeason} days. The last day of every season is a festival, and Saturday is market day.`))));
  for (const sid of SEASONS.order) p.body.append(card(sid, sid === now.id));
  // the ribbon wall
  const wall = h('div', { class: 'al-ribbons' });
  SEASONS.order.forEach((sid, i) => {
    const f = FESTIVALS.festivals[sid];
    const got = Object.keys(game.state.festivals?.done ?? {}).filter((k) => Number(k.split(':')[1]) === i && (game.state.festivals!.done[k] ?? 0) > 0).length;
    wall.append(h('div', { class: `al-ribbon ${got ? 'got' : ''}` }, icon('ribbon'), h('div', null, f.ribbon), h('div', { class: 'muted' }, got ? `x${got}` : 'not yet')));
  });
  p.body.append(h('div', { class: 'section-title' }, 'Ribbon wall'), wall);
}

function card(sid: SeasonId, current: boolean): HTMLElement {
  const def = SEASONS.seasons[sid];
  const crops = Object.keys(CROP).filter((c) => !SEASONS.yearRound.includes(c) && (SEASONS.crops[c] ?? []).includes(sid) && CROP[c].level <= game.level);
  const fish = FISHING.species.filter((f) => f.season === sid).map((f) => f.id);
  const forage = WOODS.foragedBySeason[sid].map((e) => e.id);
  const found = [...fish, ...forage].filter((i) => game.state.collection[`item:${i}`]).length;
  const f = FESTIVALS.festivals[sid];
  const row = (label: string, ids: string[]) => ids.length ? h('div', { class: 'al-row' }, h('span', { class: 'al-label' }, label), ...ids.map((i) => itemIcon(i, 'al-item'))) : null;
  return h('div', { class: `card al-season ${current ? 'now' : ''}`, style: `--sc:${def.color}` },
    h('div', { class: 'row between' }, h('div', { class: 'al-name' }, icon(def.icon, 'al-icon'), def.name, current ? h('span', { class: 'al-now' }, 'Now') : null), h('div', { class: 'muted' }, `${found}/${fish.length + forage.length} finds`)),
    h('div', { class: 'muted' }, def.blurb),
    row('Crops', crops), row('Fish', fish), row('Forage', forage),
    h('div', { class: 'al-row' }, icon(f.icon, 'al-item'), h('span', null, `${f.name} on day ${SEASONS.daysPerSeason}`)));
}
