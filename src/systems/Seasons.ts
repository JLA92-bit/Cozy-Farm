/**
 * 1.9 Seasons: a shared 28-day year (seasons.json). The season comes from the calendar date alone (counted from a
 * fixed Monday), so every player sees the same season on the same day and nothing about it is saved except which
 * season letter has been sent. Seasonal crops can only be planted in their seasons; planted in season they grow a
 * little faster and give a little more silver and gold. A crop already planted keeps growing when the season ends.
 */
import { CROP, SEASONS, type SeasonDef, type SeasonId } from '../data';
import { game } from './Game';
import { localDay } from './Progression';
import { dayNumber } from './Weather';
import { mail } from './Mail';
import { saves } from './Save';
import { hints } from './Hints';

const EPOCH = dayNumber(SEASONS.epoch);
const YEAR = SEASONS.order.length * SEASONS.daysPerSeason;

export interface SeasonNow { id: SeasonId; def: SeasonDef; index: number; day: number; daysLeft: number; year: number; festival: boolean }

/** Which season a calendar date falls in (day 1-7 of that season). */
export function seasonOnDay(n: number): SeasonNow {
  const rel = n - EPOCH;
  const inYear = ((rel % YEAR) + YEAR) % YEAR;
  const index = Math.floor(inYear / SEASONS.daysPerSeason);
  const day = (inYear % SEASONS.daysPerSeason) + 1;
  const id = SEASONS.order[index];
  return { id, def: SEASONS.seasons[id], index, day, daysLeft: SEASONS.daysPerSeason - day, year: Math.floor(rel / YEAR), festival: day === SEASONS.daysPerSeason };
}

class SeasonSystem {
  /** The season today (local date). */
  now(t = game.now()): SeasonNow { return seasonOnDay(dayNumber(localDay(t))); }
  get id(): SeasonId { return this.now().id; }

  /** Can this crop be planted in that season? Year-round crops always can. */
  open(crop: string, season: SeasonId = this.id): boolean {
    if (SEASONS.yearRound.includes(crop)) return true;
    return (SEASONS.crops[crop] ?? SEASONS.order).includes(season);
  }
  /** Seasonal crops get the in-season bonus; year-round ones do not. */
  seasonal(crop: string): boolean { return !SEASONS.yearRound.includes(crop) && !!SEASONS.crops[crop]; }
  /** Planted right now, is this crop getting the in-season bonus? */
  bonus(crop: string): boolean { return this.seasonal(crop) && this.open(crop); }

  /** Crops open to plant this season (all of them, level aside). */
  cropsIn(season: SeasonId = this.id): string[] { return Object.keys(CROP).filter((c) => this.open(c, season)); }

  /** Days until a crop can be planted again (0 when open now). */
  daysUntil(crop: string, t = game.now()): number {
    const here = this.now(t);
    for (let d = 0; d <= YEAR; d++) if (this.open(crop, seasonOnDay(dayNumber(localDay(t)) + d).id)) return d;
    void here;
    return 0;
  }
  /** Which season brings the crop back next, and in how many days. */
  nextSeasonFor(crop: string): { season: SeasonId; days: number } | null {
    const n = dayNumber(localDay(game.now()));
    for (let d = 1; d <= YEAR; d++) { const s = seasonOnDay(n + d); if (this.open(crop, s.id)) return { season: s.id, days: d }; }
    return null;
  }

  /** On the first day of a season (or the first time the game is opened in it): a toast and one letter from Hazel. */
  announce(): void {
    if (!game.state.player.created || !game.state.tutorial.done) return;
    const s = this.now();
    const key = `${s.year}:${s.index}`;
    const st = (game.state.seasons ??= { letter: '' });
    if (st.letter === key) return;
    const first = st.letter === '';
    st.letter = key;
    const list = this.cropsIn(s.id).filter((c) => !SEASONS.yearRound.includes(c)).map((c) => CROP[c].name);
    const farmer = game.state.player.name;
    mail.send('hazel', `${s.def.name} has come to the valley`,
      `Dear ${farmer},\n\n${s.def.blurb}\n\nThis season you can plant: ${list.join(', ')}, as well as wheat, corn, carrots and turnips, which grow all year. Crops planted in their own season grow faster and are more likely to come out silver or gold.\n\nA crop you have already planted keeps growing when the season changes, so there is no need to rush.\n\nWith love,\nHazel`);
    game.bus.emit('toast', { title: `It is ${s.def.name}!`, sub: first && hints.firstTime('intro:seasons') ? 'Seasonal crops grow faster in their own season. Tap the season on the top bar to see what is open.' : `Day ${s.day} of ${SEASONS.daysPerSeason}`, icon: s.def.icon });
    saves.save();
  }

  /** The line for the top-bar season pill and its tap card. */
  describe(): string {
    const s = this.now();
    return `${s.def.name}, day ${s.day} of ${SEASONS.daysPerSeason}. ${s.daysLeft ? `${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'} left.` : 'The last day of the season.'}`;
  }
}

export const seasons = new SeasonSystem();
