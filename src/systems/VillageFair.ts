/**
 * 1.44 The Village Fair: on the Harvest Fair day of each 28-day cycle, from level 100, two contests run in the square.
 * The bake-off takes one gold-star good (judged on what it is worth) and the best-animal show one animal home (judged
 * on its animals' hearts). Each pays a ribbon for the farm and gems, once per fair. Friends only: nobody loses anything.
 */
import { ANIMAL, BUILDING, ITEMS } from '../data';
import { game } from './Game';
import { saves } from './Save';
import { animals, MAX_ANIMAL_HEARTS } from './Animals';
import { cycleNow } from './FestivalCycle';
import { localDay } from './Progression';
import { rollsQuality } from './Quality';
import { logEvent } from '../online/Events';
import type { PlacedBuilding } from './State';

export type Ribbon = 'blue' | 'red' | 'yellow';
export const FAIR_LEVEL = 100;
/** The Harvest Fair is the third festival of the cycle. */
const FAIR_SLOT = 2;
const GEMS: Record<Ribbon, number> = { blue: 10, red: 5, yellow: 2 };
export const RIBBON_NAME: Record<Ribbon, string> = { blue: 'First prize', red: 'Second prize', yellow: 'Third prize' };

class VillageFairSystem {
  isFairDay(now = game.now()): boolean { const c = cycleNow(now); return game.level >= FAIR_LEVEL && c.festival && c.index === FAIR_SLOT; }
  private get st(): { day: string; bake?: Ribbon; show?: Ribbon } {
    const day = localDay(game.now());
    if (game.state.fair?.day !== day) game.state.fair = { day };
    return game.state.fair!;
  }
  entered(contest: 'bake' | 'show'): Ribbon | undefined { return this.isFairDay() ? this.st[contest] : undefined; }

  /** Gold-star goods the farm could enter in the bake-off, best first. */
  bakes(): string[] { return Object.keys(game.state.inventory).filter((i) => ITEMS[i]?.cat === 'goods' && rollsQuality(i) && game.qualityCounts(i)[2] > 0).sort((a, b) => ITEMS[b].sell - ITEMS[a].sell); }
  bakeRibbon(item: string): Ribbon { const v = ITEMS[item]?.sell ?? 0; return v >= 4000 ? 'blue' : v >= 1500 ? 'red' : 'yellow'; }
  /** Animal homes with animals, best average hearts first. */
  homes(): PlacedBuilding[] { return game.state.buildings.filter((b) => BUILDING[b.type]?.cat === 'animal' && (b.animals?.length ?? 0) > 0).sort((a, b) => this.hearts(b) - this.hearts(a)); }
  hearts(b: PlacedBuilding): number { const n = b.animals?.length ?? 0; return n ? (b.animals ?? []).reduce((s, _, i) => s + animals.hearts(b, i), 0) / n : 0; }
  showRibbon(b: PlacedBuilding): Ribbon { const h = this.hearts(b) / MAX_ANIMAL_HEARTS; return h >= 0.9 ? 'blue' : h >= 0.6 ? 'red' : 'yellow'; }

  private award(contest: 'bake' | 'show', r: Ribbon, what: string): Ribbon {
    this.st[contest] = r;
    const decor = `fair_ribbon_${r}`;
    game.state.storage[decor] = (game.state.storage[decor] ?? 0) + 1;
    game.discover(decor, 'building');
    game.addGems(GEMS[r]);
    if (r === 'blue') game.incStat('fair_blue');
    logEvent('fair', { contest, ribbon: r, what });
    saves.save();
    return r;
  }
  enterBake(item: string): Ribbon | null {
    if (!this.isFairDay() || this.st.bake || !this.bakes().includes(item)) return null;
    if (!game.removeQuality(item, 2, 1)) return null;
    return this.award('bake', this.bakeRibbon(item), item);
  }
  enterShow(uid: number): Ribbon | null {
    const b = game.state.buildings.find((x) => x.uid === uid);
    if (!this.isFairDay() || this.st.show || !b || !(b.animals?.length)) return null;
    return this.award('show', this.showRibbon(b), ANIMAL[BUILDING[b.type].animal!]?.id ?? b.type);
  }
  gems(r: Ribbon): number { return GEMS[r]; }
}

export const villageFair = new VillageFairSystem();
Object.assign(window as unknown as Record<string, unknown>, { __fair: villageFair });
