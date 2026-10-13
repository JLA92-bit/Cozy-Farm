/**
 * 1.15 Upkeep: animals grow old and can fall sick, and workshops and animal homes wear down until they are repaired.
 * Everything steps once per local day the player actually opens the game, so nothing is ever lost while away.
 * Untreated sickness ends with the animal wandering off; it can be brought back for a finder's fee for a few days.
 * Strength comes from upkeep.json times the remote dial (gameConfig.upkeep, 0 = off).
 */
import { ANIMAL, BUILDING, UPKEEP } from '../data';
import { gameConfig } from '../online/GameConfig';
import { animals } from './Animals';
import { game } from './Game';
import { isBuilt } from './Timers';
import { localDay } from './Progression';
import { saves } from './Save';
import type { PlacedBuilding } from './State';
import { hashString } from '../world/Procedural';

const DAY = 86400000;
export type WearStage = 'fine' | 'weathered' | 'worn' | 'broken';

class UpkeepSystem {
  get strength(): number { return game.level >= UPKEEP.fromLevel ? gameConfig.upkeep : 0; }
  get wanderDays(): number { return UPKEEP.animals.wanderAfterDays; }
  get on(): boolean { return this.strength > 0; }

  /** The village vet and carpenter: treating and repairing need their buildings (built, not still under construction). */
  hasVet(): boolean { return game.buildingsOf('vet_cottage').some((b) => isBuilt(b, game.now())); }
  hasCarpenter(): boolean { return game.buildingsOf('carpenter').some((b) => isBuilt(b, game.now())); }
  sickList(): { b: PlacedBuilding; i: number }[] {
    const out: { b: PlacedBuilding; i: number }[] = [];
    for (const b of game.state.buildings) (b.animals ?? []).forEach((a, i) => { if (a.sickAt) out.push({ b, i }); });
    return out;
  }
  /** Buildings that need the carpenter: worn or broken, worst first. */
  repairList(): PlacedBuilding[] {
    return game.state.buildings.filter((b) => this.wears(b) && this.canRepair(b)).sort((a, b) => this.wearOf(b) - this.wearOf(a));
  }

  wearOf(b: PlacedBuilding): number { return Math.min(100, b.wear ?? 0); }
  /** Only workshops and animal homes wear. */
  wears(b: PlacedBuilding): boolean { const c = BUILDING[b.type]?.cat; return c === 'production' || c === 'animal'; }
  stage(b: PlacedBuilding): WearStage {
    const w = this.wearOf(b);
    return w >= UPKEEP.wear.broken ? 'broken' : w >= UPKEEP.wear.worn ? 'worn' : w >= UPKEEP.wear.weathered ? 'weathered' : 'fine';
  }
  /** Workshop speed: 1 when fine, slower when worn. */
  slow(b: PlacedBuilding): number { const s = this.stage(b); return s === 'weathered' ? UPKEEP.wear.slow.weathered : s === 'worn' ? UPKEEP.wear.slow.worn : 1; }
  repairCost(b: PlacedBuilding): number {
    const base = BUILDING[b.type].cost * (1 + 0.4 * (b.level - 1));
    return Math.max(UPKEEP.wear.repairMin, Math.round(base * UPKEEP.wear.repairPct * this.wearOf(b) / 100 / 5) * 5);
  }
  canRepair(b: PlacedBuilding): boolean { return this.wears(b) && this.wearOf(b) >= UPKEEP.wear.minRepair; }
  repair(b: PlacedBuilding): boolean {
    if (!this.hasCarpenter() || !this.canRepair(b) || !game.spend(this.repairCost(b))) return false;
    delete b.wear;
    game.incStat('repairs');
    game.bus.emit('building:changed', { b });
    game.bus.emit('sfx', { name: 'build' });
    saves.save();
    return true;
  }

  ageDays(a: { born?: number }): number { return a.born ? Math.max(0, (game.now() - a.born) / DAY) : 0; }
  isElder(a: { born?: number }): boolean { return this.ageDays(a) >= UPKEEP.animals.elderDays; }

  treatCost(animal: string): number { return Math.max(UPKEEP.animals.treatMin, Math.round(ANIMAL[animal].cost * UPKEEP.animals.treatCostPct / 5) * 5); }
  /** Cure a sick animal: its product timer carries on from where it paused. */
  treat(b: PlacedBuilding, i: number): boolean {
    const a = b.animals?.[i];
    if (!a?.sickAt || !this.hasVet() || !game.spend(this.treatCost(BUILDING[b.type].animal!))) return false;
    if (a.fedAt !== null) a.fedAt += game.now() - a.sickAt;
    delete a.sickAt; delete a.sickDays;
    game.incStat('animals_treated');
    game.bus.emit('building:changed', { b });
    game.bus.emit('sfx', { name: ANIMAL[BUILDING[b.type].animal!].sound });
    saves.save();
    return true;
  }

  finderFee(animal: string): number { return Math.max(UPKEEP.animals.finderMin, Math.round(ANIMAL[animal].cost * UPKEEP.animals.finderPct / 5) * 5); }
  lost() { return game.state.upkeep?.lost ?? []; }
  /** Bring a wandered animal home to any home of its kind with space. */
  retrieve(index: number): { ok: boolean; reason?: string } {
    const l = this.lost()[index];
    if (!l) return { ok: false, reason: 'Gone' };
    const home = animals.homeWithSpace(l.animal);
    if (!home) return { ok: false, reason: 'No space at home' };
    if (!game.spend(this.finderFee(l.animal))) return { ok: false, reason: 'Not enough coins' };
    (home.animals ??= []).push({ fedAt: null, ...(l.name ? { name: l.name } : {}), ...(l.love ? { love: l.love } : {}), born: l.born ?? game.now() });
    game.state.upkeep!.lost.splice(index, 1);
    game.bus.emit('building:changed', { b: home });
    game.bus.emit('sfx', { name: ANIMAL[l.animal].sound });
    saves.save();
    return { ok: true };
  }

  /** Sickness chance for one animal today. */
  chance(b: PlacedBuilding, a: NonNullable<PlacedBuilding['animals']>[number], love: number): number {
    const u = UPKEEP.animals;
    let c = u.sickChance + (this.isElder(a) ? u.elderChance : 0);
    const st = this.stage(b);
    if (st !== 'fine') c *= u.wearMult[st];
    c *= Math.max(u.minHeartFactor, 1 - u.heartCut * love);
    return Math.min(0.5, c * this.strength);
  }

  /** One day of upkeep. Exposed for tests. */
  step(rate = 1, days = 1): void {
    // rate < 1 is time spent away: slower, and it can never make an animal wander off or let a wanderer be gone
    const slow = rate < 1;
    const s = this.strength * rate * days;
    const sick: string[] = [];
    const away: string[] = [];
    for (const b of game.state.buildings) {
      if (this.wears(b)) b.wear = Math.min(100, (b.wear ?? 0) + UPKEEP.wear.perDay * s * (0.7 + 0.6 * (hashString(`${b.uid}:${game.state.upkeep!.day}`) % 100) / 100));
      for (let i = (b.animals?.length ?? 0) - 1; i >= 0; i--) {
        const a = b.animals![i];
        if (!a.born) a.born = game.now();
        if (a.sickAt) {
          a.sickDays = (a.sickDays ?? 0) + rate * days;
          if (slow) a.sickDays = Math.max(a.sickDays - rate * days, Math.min(a.sickDays, UPKEEP.animals.wanderAfterDays - 2));
          else if (a.sickDays >= UPKEEP.animals.wanderAfterDays) {
            const nm = animals.nameOf(b, i);
            game.state.upkeep!.lost.push({ animal: BUILDING[b.type].animal!, name: nm, love: a.love, born: a.born, left: UPKEEP.animals.returnWithinDays });
            b.animals!.splice(i, 1);
            away.push(nm);
            game.bus.emit('building:changed', { b });
          }
        } else if (Math.random() < this.chance(b, a, animals.hearts(b, i)) * rate * days) {
          a.sickAt = game.now(); a.sickDays = 0;
          sick.push(animals.nameOf(b, i));
          game.bus.emit('building:changed', { b });
        }
      }
    }
    // those who wandered off earlier: the days to bring them back run down
    const up = game.state.upkeep!;
    up.lost = up.lost.filter((l) => { l.left = slow ? Math.max(Math.min(l.left, 2), l.left - rate * days) : l.left - 1; return l.left > 0; });
    if (sick.length) game.bus.emit('toast', { title: sick.length === 1 ? `${sick[0]} is unwell${slow ? ' while you were away' : ''}` : `${sick.length} animals are unwell`, sub: this.hasVet() ? 'Take them to the vet before they wander off.' : "Build the Vet's Cottage to treat them before they wander off.", icon: 'heart' });
    if (away.length) game.bus.emit('toast', { title: away.length === 1 ? `${away[0]} wandered off` : `${away.length} animals wandered off`, sub: this.hasVet() ? 'The vet can help bring them back for a small fee.' : 'Open their home to bring them back for a small fee.', icon: 'info' });
    if (sick.length) game.incStat('animals_sick', sick.length);
    saves.save();
  }

  check(): void {
    const today = localDay(game.now());
    let up = game.state.upkeep;
    if (!up) {
      // first run: an old farm gets a random starting age and wear so it does not all happen at once
      up = game.state.upkeep = { day: today, lost: [] };
      for (const b of game.state.buildings) {
        if (this.wears(b) && b.wear === undefined) b.wear = Math.floor(Math.random() * UPKEEP.migrate.maxWear);
        for (const a of b.animals ?? []) if (!a.born) a.born = game.now() - Math.floor(Math.random() * UPKEEP.migrate.maxAgeDays * DAY);
      }
      saves.save();
      return;
    }
    // animals bought since the last check get a birthday
    for (const b of game.state.buildings) for (const a of b.animals ?? []) if (!a.born) a.born = game.now();
    if (up.day === today) return;
    // days missed since the game was last opened still count, at a slower rate and up to a limit
    const missed = Math.max(0, Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${up.day}T12:00:00`).getTime()) / DAY) - 1);
    up.day = today;
    if (!this.on) { saves.save(); return; }
    if (missed > 0) this.step(UPKEEP.away.rate, Math.min(missed, UPKEEP.away.maxDays));
    this.step();
  }

  init(): void {
    this.check();
    window.setInterval(() => this.check(), 5 * 60000);
    Object.assign(window as unknown as Record<string, unknown>, { __upkeep: this });
  }
}

export const upkeep = new UpkeepSystem();
