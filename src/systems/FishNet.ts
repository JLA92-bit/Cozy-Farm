/**
 * 1.34 The fishing net (fish.json `net`, PLAN-1.34.md). Set it at the dock with bait; fish swim in one at a time, evenly
 * spread until it is full (`hours`); haul any time and keep up to `keep` of them, the rest swim away. The fish are rolled
 * when the net is set (from the farm seed and the time), so a haul is the same on every device and cannot be re-rolled.
 * It saves time, it never beats the rod: only dock fish already caught with the rod, common and uncommon (a rare one at
 * the tier's small chance), always plain (no stars), no XP, records, Book entries or `fish_caught`.
 */
import { FISHING, ITEMS, type FishDef, type FishNetTier } from '../data';
import { game } from './Game';
import { saves } from './Save';
import { fishing } from './Fishing';
import { skillLevel } from './SkillEffects';
import { requestedCount } from './Economy';
import { hashString, rng } from '../world/Procedural';
import { logEvent } from '../online/Events';

const NET = FISHING.net;
const HOUR = 3600000;

class FishNetSystem {
  /** The best net the Fishing skill allows (-1 below the first). */
  tierIndex(): number {
    const lv = skillLevel('fishing');
    let t = -1;
    NET.tiers.forEach((x, i) => { if (lv >= x.skill) t = i; });
    return t;
  }
  get unlocked(): boolean { return fishing.unlocked && this.tierIndex() >= 0; }
  /** The net as it is now: the set one keeps its tier until it is hauled; otherwise the best allowed. */
  tier(): FishNetTier { return NET.tiers[this.set?.tier ?? Math.max(0, this.tierIndex())]; }
  /** The next net up, for "Fishing skill 5: Mended Net". */
  nextTier(): FishNetTier | null { return NET.tiers[this.tierIndex() + 1] ?? null; }
  get set(): { setAt: number; tier: number; fish: string[] } | undefined { return game.state.fishing?.net; }

  /** Dock fish that can swim in: caught with the rod before, at your level, not the extra kinds. */
  pool(rarities: FishDef['rarity'][]): FishDef[] {
    const caught = fishing.st.caught;
    return FISHING.species.filter((f) => (f.spot ?? 'dock') === 'dock' && !f.extra && rarities.includes(f.rarity) && f.level <= game.level && (caught[f.id] ?? 0) > 0);
  }

  /** Why the net cannot be set now, or null. */
  cannotSet(): string | null {
    if (!this.unlocked) return `Reach Fishing skill ${NET.tiers[0].skill} for a net`;
    if (this.set) return 'The net is already out';
    if (!this.pool(['common', 'uncommon']).length) return 'Catch a few fish with your rod first';
    if (fishing.bait < NET.bait) return `Setting the net takes ${NET.bait} bait`;
    return null;
  }

  /** Set the net: the bait goes in and the fish that will swim in are rolled now. */
  setNet(): boolean {
    if (this.cannotSet()) return false;
    const tierIdx = this.tierIndex(), t = NET.tiers[tierIdx];
    const now = game.now();
    const r = rng(hashString(`${game.state.seed}:net:${now}`));
    const plain = this.pool(['common', 'uncommon']), rare = this.pool(['rare']);
    // each fish is as likely as the share of the day it bites (an any-time fish four times a night-only one)
    const pick = (list: FishDef[]): string => {
      let x = r() * list.reduce((s, f) => s + f.times.length, 0);
      for (const f of list) { x -= f.times.length; if (x <= 0) return f.id; }
      return list[list.length - 1].id;
    };
    const fish: string[] = [];
    for (let i = 0; i < t.holds; i++) fish.push(rare.length && r() < t.rare ? pick(rare) : pick(plain));
    game.addItem(FISHING.baitItem, -NET.bait);
    game.state.fishing.net = { setAt: now, tier: tierIdx, fish };
    game.incStat('nets_set');
    logEvent('net_set', { tier: tierIdx });
    game.bus.emit('sfx', { name: 'select' });
    saves.save();
    return true;
  }

  /** Milliseconds between fish swimming in. */
  private gap(t = this.tier()): number { return (t.hours * HOUR) / t.holds; }
  /** How many fish are in the net now. */
  count(now = game.now()): number {
    const s = this.set;
    if (!s) return 0;
    return Math.max(0, Math.min(s.fish.length, Math.floor((now - s.setAt) / this.gap(NET.tiers[s.tier]))));
  }
  full(now = game.now()): boolean { const s = this.set; return !!s && this.count(now) >= s.fish.length; }
  /** Milliseconds until the next fish (0 when full or not set). */
  nextIn(now = game.now()): number {
    const s = this.set;
    if (!s || this.full(now)) return 0;
    return s.setAt + (this.count(now) + 1) * this.gap(NET.tiers[s.tier]) - now;
  }
  /** Milliseconds until the net is full (0 when full or not set). */
  fullIn(now = game.now()): number {
    const s = this.set;
    if (!s || this.full(now)) return 0;
    return s.setAt + NET.tiers[s.tier].hours * HOUR - now;
  }
  /** The fish in the net now, in the order they swam in. */
  inNet(now = game.now()): string[] { return this.set?.fish.slice(0, this.count(now)) ?? []; }

  /** The fish picked to start with: what your orders need first, then the most valuable. Indexes into inNet(). */
  suggested(now = game.now()): number[] {
    const fish = this.inNet(now), keep = this.tier().keep;
    const want = new Map<string, number>();
    for (const id of new Set(fish)) want.set(id, Math.max(0, requestedCount(id) - game.count(id)));
    const score = (id: string): number => {
      const w = want.get(id) ?? 0;
      return (w > 0 ? 1e6 : 0) + (ITEMS[id]?.sell ?? 0);
    };
    const order = fish.map((_, i) => i).sort((a, b) => score(fish[b]) - score(fish[a]));
    const out: number[] = [];
    for (const i of order) {
      if (out.length >= keep) break;
      const id = fish[i];
      out.push(i);
      // one fewer needed now this one is picked
      if ((want.get(id) ?? 0) > 0) want.set(id, (want.get(id) ?? 0) - 1);
    }
    return out.sort((a, b) => a - b);
  }

  /**
   * Haul the net: the picked fish (indexes into inNet(), at most `keep`) go to the barn, plain, and the rest swim away.
   * The net comes in empty and can be set again. Returns the fish kept, or null when there is no net out.
   */
  haul(picked: number[], now = game.now()): string[] | null {
    const s = this.set;
    if (!s) return null;
    const fish = this.inNet(now), t = NET.tiers[s.tier];
    const keep = [...new Set(picked)].filter((i) => Number.isInteger(i) && i >= 0 && i < fish.length).slice(0, t.keep).map((i) => fish[i]);
    for (const id of keep) game.addItem(id, 1, undefined, 0);
    delete game.state.fishing.net;
    game.incStat('net_hauls');
    if (keep.length) game.incStat('net_fish', keep.length);
    logEvent('net_haul', { tier: s.tier, caught: fish.length, kept: keep.length });
    game.bus.emit('sfx', { name: keep.length ? 'collect' : 'close' });
    saves.save();
    return keep;
  }
}

export const fishNet = new FishNetSystem();
Object.assign(window as unknown as Record<string, unknown>, { __net: fishNet });
