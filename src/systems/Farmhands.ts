/**
 * 1.25 Farmhands: helpers hired from the village (farmhands.json), one per slot as the farm grows. Each takes one
 * chore and does it every few minutes while the game is open: replant harvested fields, feed one animal home, or
 * restart one workshop with its last recipe. They save time but never play for you: nothing is sold, delivered or
 * collected. A hand is paid on the first round they work each day (no work, no wage) and rests on festival days.
 */
import { ANIMAL, BUILDING, CROP, FARMHANDS, RECIPE, type ChoreId, type FarmhandDef } from '../data';
import { game } from './Game';
import { saves } from './Save';
import { localDay } from './Progression';
import { cycleNow } from './FestivalCycle';
import { farming } from './Farming';
import { animals } from './Animals';
import { production } from './Production';
import { visiting } from './Visiting';
import { isBuilt } from './Timers';
import { logEvent } from '../online/Events';
import type { PlacedBuilding, SaveData } from './State';

type St = NonNullable<SaveData['farmhands']>;
export interface RoundResult { planted: number; fed: number; queued: number; paid: number; resting: boolean; broke: string[] }

class FarmhandsSystem {
  private started = false;
  /** when the last round ran (ms, real time), for 'next round in' */
  lastRound = 0;
  get st(): St { return (game.state.farmhands ??= { hired: [], paid: {}, lastCrop: {}, lastRecipe: {} }); }

  hands(): FarmhandDef[] { return FARMHANDS.hands; }
  def(id: string): FarmhandDef | undefined { return FARMHANDS.hands.find((h) => h.id === id); }
  /** A hand can be hired once the farm reaches their level. */
  unlocked(id: string): boolean { const d = this.def(id); return !!d && game.level >= d.level; }
  isOpen(): boolean { return game.level >= FARMHANDS.hands[0].level; }
  /** Minutes until the hands next look at their chores. */
  nextRoundIn(): number { return Math.max(1, Math.ceil((this.lastRound + FARMHANDS.roundMinutes * 60000 - Date.now()) / 60000)); }
  hired(id: string): St['hired'][number] | undefined { return game.state.farmhands?.hired.find((h) => h.id === id); }
  /** Festival days are days off. */
  resting(): boolean { return cycleNow().festival; }
  today(): NonNullable<St['today']> {
    const st = this.st, day = localDay(game.now());
    if (st.today?.day !== day) st.today = { day, planted: 0, fed: 0, queued: 0, wages: 0 };
    return st.today;
  }

  /** Buildings a chore can be given (the farm's animal homes or workshops), built or not. */
  targets(chore: ChoreId): PlacedBuilding[] {
    if (chore === 'fields') return [];
    return game.state.buildings.filter((b) => (chore === 'animals' ? !!BUILDING[b.type]?.animal : BUILDING[b.type]?.cat === 'production'));
  }
  targetName(b: PlacedBuilding | undefined): string { return b ? BUILDING[b.type]?.name ?? b.type : 'nothing yet'; }

  /** Hire (or re-task) a hand. Animal and workshop chores take the first home or workshop unless one is named. */
  hire(id: string, chore: ChoreId, target?: number): boolean {
    if (!this.unlocked(id) || !FARMHANDS.chores[chore]) return false;
    const st = this.st;
    const t = chore === 'fields' ? undefined : target ?? this.targets(chore)[0]?.uid;
    if (chore !== 'fields' && (t === undefined || !this.targets(chore).some((b) => b.uid === t))) return false;
    const h = st.hired.find((x) => x.id === id);
    if (h) { h.chore = chore; if (t === undefined) delete h.target; else h.target = t; }
    else st.hired.push({ id, chore, ...(t !== undefined ? { target: t } : {}) });
    game.incStat('farmhands_hired');
    logEvent('farmhand', { id, chore });
    saves.save();
    return true;
  }
  /** Let a hand go (they can be hired again at any time). */
  dismiss(id: string): void { const st = this.st; st.hired = st.hired.filter((h) => h.id !== id); delete st.paid[id]; saves.save(); }

  /** Pay today's wage the first time a hand works today: the coins paid now (0 if already paid), or -1 when they cannot be. */
  private pay(id: string): number {
    const st = this.st, day = localDay(game.now());
    if (st.paid[id] === day) return 0;
    if (!game.spend(FARMHANDS.wage)) return -1;
    st.paid[id] = day;
    this.today().wages += FARMHANDS.wage;
    return FARMHANDS.wage;
  }

  /** What a hand would do now, without doing it (so no wage is paid for an idle round). */
  private work(h: St['hired'][number], dry: boolean, reserve = 0): number {
    const now = game.now();
    if (h.chore === 'fields') {
      const st = this.st;
      let n = 0;
      for (const b of game.state.buildings) {
        if (n >= FARMHANDS.fieldsPerRound) break;
        const crop = st.lastCrop[b.uid];
        if (b.type !== 'plot' || b.plot || !crop || !CROP[crop] || !farming.canPlant(b, crop).ok) continue;
        // a dry run keeps the day's wage aside: a hand is never paid for a round the seeds cannot be bought for
        if (dry && game.coins - reserve < CROP[crop].seedCost) continue;
        if (!dry) {
          // a hand sows plain seed: the seed tray's fertiliser and rare-seed switches are the farmer's own
          const fert = farming.useFert, rare = farming.useRare;
          farming.useFert = false; farming.useRare = false;
          try { if (!farming.plant(b, crop)) continue; } finally { farming.useFert = fert; farming.useRare = rare; }
        }
        n++;
      }
      return n;
    }
    const b = game.state.buildings.find((x) => x.uid === h.target);
    if (!b || !isBuilt(b, now)) return 0;
    if (h.chore === 'animals') {
      if (dry) return animals.counts(b).hungry > 0 && game.count(animalFeed(b)) > 0 ? 1 : 0;
      return animals.feedAll(b);
    }
    const recipe = this.st.lastRecipe[b.uid];
    if (!recipe || !RECIPE[recipe]) return 0;
    if (dry) return production.canQueue(b, recipe).ok ? 1 : 0;
    let n = 0;
    while (n < 10 && production.queue(b, recipe)) n++;
    return n;
  }

  /** One round of chores for every hired hand. */
  round(): RoundResult {
    const out: RoundResult = { planted: 0, fed: 0, queued: 0, paid: 0, resting: false, broke: [] };
    this.lastRound = Date.now();
    if (visiting.active || !game.state?.farmhands?.hired.length) return out;
    if (this.resting()) { out.resting = true; return out; }
    const t = this.today();
    for (const h of this.st.hired) {
      const owed = this.st.paid[h.id] === localDay(game.now()) ? 0 : FARMHANDS.wage;
      if (!this.unlocked(h.id) || this.work(h, true, owed) <= 0) continue;
      const wage = this.pay(h.id);
      if (wage < 0) { out.broke.push(h.id); continue; }
      out.paid += wage;
      const n = this.work(h, false);
      if (h.chore === 'fields') { out.planted += n; t.planted += n; }
      else if (h.chore === 'animals') { out.fed += n; t.fed += n; }
      else { out.queued += n; t.queued += n; }
    }
    if (out.planted || out.fed || out.queued) {
      game.incStat('farmhand_chores', out.planted + out.fed + out.queued);
      saves.save();
    }
    return out;
  }

  /** Remember what to redo: the crop harvested on each field and the recipe last started in each workshop. */
  init(): void {
    if (this.started) return;
    this.started = true;
    game.bus.on('crop:harvested', ({ b, crop }) => { this.st.lastCrop[b.uid] = crop; });
    game.bus.on('production:queued', ({ b, recipe }) => { this.st.lastRecipe[b.uid] = recipe; });
    window.setInterval(() => { if (!document.hidden) this.round(); }, FARMHANDS.roundMinutes * 60000);
    window.setTimeout(() => this.round(), 15000);
  }
}

/** The feed an animal home's animals eat. */
const animalFeed = (b: PlacedBuilding): string => ANIMAL[BUILDING[b.type]?.animal ?? '']?.feed ?? '';

export const farmhands = new FarmhandsSystem();
