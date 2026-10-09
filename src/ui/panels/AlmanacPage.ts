import { h, icon, clear } from '../dom';
import type { Panel } from '../Panel';
import { CYCLE, FESTIVALS, type FestivalSlot } from '../../data';
import { game } from '../../systems/Game';
import { cycleNow, cycleOnDay } from '../../systems/FestivalCycle';
import { roomDone } from '../../systems/RestorationEffects';
import { gameConfig } from '../../online/GameConfig';
import { dayNumber } from '../../systems/Weather';
import { localDay } from '../../systems/Progression';
import './woods.css';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Days from today until a festival slot next falls (0 = today). */
function daysUntil(slot: FestivalSlot): number {
  const today = dayNumber(localDay(game.now()));
  for (let d = 0; d < CYCLE.slots.length * CYCLE.festivalEvery; d++) { const c = cycleOnDay(today + d); if (c.festival && c.slot === slot) return d; }
  return 0;
}

/** The Almanac (1.9): the festival calendar and the ribbon wall. */
export function renderAlmanac(p: Panel): void {
  clear(p.body);
  const now = cycleNow();
  p.body.append(h('div', { class: 'al-head' }, icon('ribbon', 'al-icon'),
    h('div', null, h('div', { class: 'al-title' }, now.festival ? `${FESTIVALS.festivals[now.slot].name} is today!` : `Next festival in ${now.daysLeft} ${now.daysLeft === 1 ? 'day' : 'days'}`),
      h('div', { class: 'muted' }, `A festival comes round every ${CYCLE.festivalEvery} days, one of four in turn.${roomDone('treasury') ? ` Market day is ${WEEKDAYS[gameConfig.marketDay ?? 6]}.` : ''}`))));
  for (const slot of [...CYCLE.slots].sort((a, b) => daysUntil(a) - daysUntil(b))) {
    const f = FESTIVALS.festivals[slot], d = daysUntil(slot);
    const got = Object.keys(game.state.festivals?.done ?? {}).filter((k) => CYCLE.slots[Number(k.split(':')[1])] === slot && (game.state.festivals!.done[k] ?? 0) > 0).length;
    p.body.append(h('div', { class: `card al-season ${d === 0 ? 'now' : ''}`, style: '--sc:#e8833a' },
      h('div', { class: 'row between' }, h('div', { class: 'al-name' }, icon(f.icon, 'al-icon'), f.name, d === 0 ? h('span', { class: 'al-now' }, 'Today') : null), h('div', { class: 'muted' }, d === 0 ? '' : `in ${d} ${d === 1 ? 'day' : 'days'}`)),
      h('div', { class: 'muted' }, f.blurb),
      h('div', { class: 'al-row' }, icon('ribbon', 'al-item'), h('span', null, got ? `${f.ribbon} won ${got > 1 ? `x${got}` : ''}` : `${f.ribbon}: not won yet`))));
  }
}
