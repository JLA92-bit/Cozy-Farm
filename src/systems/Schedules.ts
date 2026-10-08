/**
 * 1.9 Villager routines: where each villager is right now (schedules.json). The place is fixed by the farm seed, the date
 * and the part of the day, so it is the same on every device and changes through the day; rain keeps people at home.
 * Nothing is saved. The Wild Woods draw whoever is there, and each villager's page says where they are.
 */
import { SCHEDULES, VILLAGERS, type PlaceId } from '../data';
import { game } from './Game';
import { localDay } from './Progression';
import { weatherToday } from './Weather';
import { hashString, rng } from '../world/Procedural';

class Schedules {
  /** Index of the 4-hour part of the day (-1 at night, when everyone is home). */
  private part(now: number): number {
    const hour = new Date(now).getHours();
    const p = SCHEDULES.dayParts;
    for (let i = 0; i < p.length - 1; i++) if (hour >= p[i] && hour < p[i + 1]) return i;
    return -1;
  }

  whereIs(id: string, now = game.now()): PlaceId {
    const part = this.part(now);
    if (part < 0) return 'home';
    const w = { ...(SCHEDULES.villagers[id] ?? { home: 1 }) };
    if (weatherToday(now) === 'rain') w.home = (w.home ?? 0) + SCHEDULES.rainHome;
    const entries = Object.entries(w) as [PlaceId, number][];
    const r = rng(hashString(`${game.state.seed}:sched:${id}:${localDay(now)}:${part}`));
    let x = r() * entries.reduce((a, b) => a + b[1], 0);
    for (const [place, wt] of entries) { x -= wt; if (x <= 0) return place; }
    return 'home';
  }

  text(id: string, now = game.now()): string { return SCHEDULES.places[this.whereIs(id, now)]; }
  /** Who is at a place right now. */
  at(place: PlaceId, now = game.now()): string[] { return VILLAGERS.filter((v) => this.whereIs(v.id, now) === place).map((v) => v.id); }
}

export const schedules = new Schedules();
