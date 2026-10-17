/**
 * 1.27 Wildlife Album: wild animals visit the Wild Woods and the edge of the farm (wildlife.json). Whether a species
 * is out today, and where it stands, comes from the farm seed and the date, so every device agrees; it shows during
 * its hours (and weather, and festival days for the rare boat visitors). Tap one to photograph it: the first photo
 * puts it in the album (a Collection Book page), and every full set pays its reward once. Nothing is caught.
 */
import { WILDLIFE, type WildSpecies } from '../data';
import { game, type Vec } from './Game';
import { saves } from './Save';
import { localDay } from './Progression';
import { weatherToday } from './Weather';
import { cycleNow } from './FestivalCycle';
import { woods } from './Woods';
import { mail } from './Mail';
import { logEvent } from '../online/Events';
import { hashString, rng } from '../world/Procedural';

type St = NonNullable<import('./State').SaveData['wildlife']>;
export interface PhotoResult { species: WildSpecies; first: boolean; set?: string; complete: boolean }

class WildlifeSystem {
  get st(): St { return (game.state.wildlife ??= { photos: {}, sets: [] }); }
  get open(): boolean { return game.state.tutorial.done && game.level >= WILDLIFE.level; }
  species(): WildSpecies[] { return WILDLIFE.species; }
  def(id: string): WildSpecies | undefined { return WILDLIFE.species.find((s) => s.id === id); }

  /** The place can be visited: the farm always, the glade once the woods are open, a region once its trail is restored. */
  placeOpen(place: string): boolean {
    if (place === 'farm') return true;
    if (place === 'glade') return woods.unlocked;
    return woods.regionOpen(place);
  }
  private roll(s: WildSpecies, now: number): () => number { return rng(hashString(`${game.state.seed}:wild:${s.id}:${localDay(now)}`)); }
  /** Out at all today (the day's chance, weather and festival rules). */
  outToday(s: WildSpecies, now = game.now()): boolean {
    if (s.festival && !cycleNow(now).festival) return false;
    if (s.weather && !s.weather.includes(weatherToday(now))) return false;
    return this.roll(s, now)() < s.chance;
  }
  inHours(s: WildSpecies, now = game.now()): boolean {
    const h = new Date(now).getHours();
    return s.from > s.to ? h >= s.from || h < s.to : h >= s.from && h < s.to;
  }
  /** Out and about right now where the player could see it. */
  present(id: string, now = game.now()): boolean {
    const s = this.def(id);
    return !!s && this.open && this.placeOpen(s.place) && this.outToday(s, now) && this.inHours(s, now);
  }
  /** Where it stands today: a number 0..1 the views turn into a spot in its place. */
  spot(s: WildSpecies, now = game.now()): number { const r = this.roll(s, now); r(); return r(); }
  /** Everything visiting a place right now. */
  visiting(place: (p: string) => boolean): WildSpecies[] { return WILDLIFE.species.filter((s) => place(s.place) && this.present(s.id)); }

  photographed(id: string): boolean { return !!game.state.wildlife?.photos[id]; }
  shotToday(id: string): boolean { const t = game.state.wildlife?.today; return t?.day === localDay(game.now()) && t.shot.includes(id); }
  setProgress(set: string): { have: number; of: number } {
    const list = WILDLIFE.species.filter((s) => s.set === set);
    return { have: list.filter((s) => this.photographed(s.id)).length, of: list.length };
  }
  count(): number { return WILDLIFE.species.filter((s) => this.photographed(s.id)).length; }

  /** Take a photo of a visitor that is here now. Each species once a day; the first photo goes in the album. */
  photograph(id: string, at?: Vec): PhotoResult | null {
    const s = this.def(id);
    if (!s || !this.present(id) || this.shotToday(id)) return null;
    const st = this.st, day = localDay(game.now());
    if (st.today?.day !== day) st.today = { day, shot: [] };
    st.today.shot.push(id);
    const first = !st.photos[id];
    if (first) st.photos[id] = { first: game.now(), n: 1 }; else st.photos[id].n++;
    game.incStat('wildlife_photos');
    if (first) game.discover(`wild_${id}`, 'wildlife');
    let set: string | undefined;
    const p = this.setProgress(s.set);
    const sd = WILDLIFE.sets.find((x) => x.id === s.set);
    if (first && sd && p.have === p.of && !st.sets.includes(s.set)) {
      st.sets.push(s.set);
      set = sd.name;
      game.addCoins(sd.reward.coins, at);
      game.addGems(sd.reward.gems);
      game.incStat('wildlife_sets');
    }
    let complete = false;
    if (first && this.count() === WILDLIFE.species.length && !st.complete) {
      st.complete = game.now();
      complete = true;
      mail.send('juniper', 'Your Wildlife Album', `Dear ${game.state.player.name},\n\nYou've photographed every creature in the valley! I leafed through your album with a cup of tea and could not stop smiling. The otter one is my favourite.\n\nHere is a little something for the next roll of film.\n\nJuniper`, { coins: WILDLIFE.complete.coins, gems: WILDLIFE.complete.gems });
    }
    logEvent('wild_photo', { id, first });
    saves.save();
    return { species: s, first, set, complete };
  }
}

export const wildlife = new WildlifeSystem();
