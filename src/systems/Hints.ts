import { BUILDING } from '../data';
import { game } from './Game';
import type { PlacedBuilding } from './State';

/**
 * Helpful hints: how much coaching the player gets.
 *
 * - 'all'  coaching for basic skills ("Swipe across them!") until the skill is learned, plus intros.
 * - 'new'  basic coaching is off; brand new features still get ONE short intro the first time.
 * - 'off'  no coaching and no intros (the first-session tutorial is separate and can be replayed).
 *
 * The save stores the player's choice, or '' for automatic: 'all' while learning (below level
 * {@link HINTS_LEVEL}), then 'new'. Older saves load with '' too, so players already past the early game
 * stop seeing coaching for things they have done many times.
 */
export type HintMode = 'all' | 'new' | 'off';
export interface HintState { mode: HintMode | ''; intros: string[] }

/** From this level the automatic mode switches basic coaching off entirely. */
export const HINTS_LEVEL = 5;

/**
 * Basic skills and how many times they must be done before their coaching stops.
 * Each reads an existing stat, so progress made before this update counts.
 */
export const SKILLS = {
  plant: { stat: 'plants_planted', n: 10 },
  harvest: { stat: 'crops_harvested', n: 10 },
  swipe: { stat: 'swipe_best', n: 4 },
  orders: { stat: 'orders_completed', n: 3 },
  feed: { stat: 'animals_fed', n: 6 },
  collect: { stat: 'animal_products', n: 6 },
  produce: { stat: 'items_produced', n: 3 },
  fruit: { stat: 'fruit_harvested', n: 3 },
  truck: { stat: 'truck_crates', n: 3 },
  stall: { stat: 'stall_sales', n: 2 },
  build: { stat: 'buildings_built', n: 3 },
  move: { stat: 'buildings_moved', n: 2 },
  expand: { stat: 'land_expanded', n: 1 },
  clear: { stat: 'obstacles_cleared', n: 3 },
} as const satisfies Record<string, { stat: string; n: number }>;
export type Skill = keyof typeof SKILLS;

export const HINT_MODES: { id: HintMode; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'New things only' },
  { id: 'off', label: 'Off' },
];

function state(): HintState {
  return game.state.hints ??= { mode: '', intros: [] };
}

export const hints = {
  /** The mode in effect right now (resolves automatic). */
  get mode(): HintMode {
    const m = state().mode;
    if (m) return m;
    return game.level >= HINTS_LEVEL ? 'new' : 'all';
  },
  /** The player's own pick, or '' when automatic. */
  get chosen(): HintMode | '' { return state().mode; },
  setMode(m: HintMode): void { state().mode = m; game.bus.emit('state:changed', {}); },

  /** How far along a skill is (0..1). */
  progress(skill: Skill): number {
    const d = SKILLS[skill];
    return Math.min(1, game.stat(d.stat) / d.n);
  },
  learned(skill: Skill): boolean { return game.stat(SKILLS[skill].stat) >= SKILLS[skill].n; },

  /** Show explanatory coaching for a basic skill? Only in 'all' mode, and only until it is learned. */
  coach(skill: Skill): boolean {
    return this.mode === 'all' && !this.learned(skill);
  },

  /** Has this one-time intro been shown already? */
  seen(id: string): boolean { return state().intros.includes(id); },

  /**
   * Show a one-time intro for a new feature? Returns true once (and remembers it), false after that,
   * when hints are off, during the first-session tutorial, or when the player has already used the
   * feature (`skill` done at least once), so long-time players are not "introduced" to what they know.
   */
  firstTime(id: string, skill?: Skill): boolean {
    const st = state();
    if (st.intros.includes(id)) return false;
    if (skill && game.stat(SKILLS[skill].stat) > 0) { st.intros.push(id); return false; }
    if (this.mode === 'off' || !game.state.tutorial.done) return false;
    st.intros.push(id);
    return true;
  },

  /** Explain a panel or feature: while still learning it ('all'), or once the first time ('new'). */
  explain(id: string, skill: Skill): boolean {
    if (this.coach(skill)) { if (!this.seen(id)) state().intros.push(id); return true; }
    return this.firstTime(id, skill);
  },
};

/** Short feature intros, each shown once, the first time the player gets the feature. */
const INTROS: Record<string, { title: string; sub: string; icon?: string; skill?: Skill }> = {
  animal: { title: 'A home for animals!', sub: 'Tap it to get animals. Tap again to feed them and collect.', skill: 'feed' },
  production: { title: 'Time to make goods!', sub: 'Tap the building and pick a recipe. Goods earn more than crops.', skill: 'produce' },
  tree: { title: 'Fruit trees', sub: 'They fruit again and again. Tap to pick when ripe.', skill: 'fruit' },
  roadside_stall: { title: 'Your own stall!', sub: 'Set a price and passers-by buy from it.', skill: 'stall' },
};

let wired = false;
/** One short intro the first time a new kind of building is ready. Safe to call more than once. */
export function wireHintIntros(): void {
  if (wired) return;
  wired = true;
  // count building moves so the "move" skill can be learned (old saves start at 0)
  game.bus.on('building:moved', () => game.incStat('buildings_moved'));
  const introFor = (b: PlacedBuilding) => {
    const def = BUILDING[b.type];
    if (!def) return;
    const key = def.cat === 'animal' ? 'animal' : def.cat === 'production' ? 'production' : def.tree ? 'tree' : INTROS[b.type] ? b.type : '';
    const intro = key ? INTROS[key] : undefined;
    if (!intro || !hints.firstTime(`intro:${key}`, intro.skill)) return;
    // after the "is ready!" toast, so the two read in order
    setTimeout(() => game.bus.emit('toast', { title: intro.title, sub: intro.sub, icon: intro.icon ?? def.icon ?? 'info' }), 900);
  };
  game.bus.on('building:complete', ({ b }) => introFor(b));
  // things with no build time (fruit trees) are ready as soon as they are placed
  game.bus.on('building:placed', ({ b, isNew }) => { if (isNew && !b.buildEnd) introFor(b); });
}
