/**
 * 1.20 Woodland Friends: a feeding stump for each critter family in the Wild Woods (woods.json `critters`). Leave one
 * of a family's treats on its stump and it visits during its hours; the treat waits on the stump until then, so a
 * missed visit costs nothing. Say hello to a visitor (once a day per family) for a small gift; every few visits is a
 * heart, and hearts make the family's rare gift (for the Museum's Woodland Gifts shelf) likelier.
 * Wren the ranger lives in Whispering Pines and asks for one field note a day: a few of one woods item, for coins.
 * State lives in `state.woods` (critters, note, notesDone); nothing here resets with the woods day.
 */
import { CRITTERS, ITEMS, WOODS, WOODS_REGIONS, WREN, type CritterDef } from '../data';
import { game, type Vec } from './Game';
import { saves } from './Save';
import { localDay } from './Progression';
import { woods } from './Woods';
import { critterVisitsPerDay } from './Grove';
import { logEvent } from '../online/Events';
import { hashString, rng } from '../world/Procedural';
import type { WoodsState } from './State';

export interface VisitResult { gift: string; rare: boolean; heart: number | null; coins: number }

const pickWeighted = <T extends { w: number }>(list: T[], r: () => number): T => {
  let x = r() * list.reduce((a, b) => a + b.w, 0);
  for (const e of list) { x -= e.w; if (x <= 0) return e; }
  return list[list.length - 1];
};

class CrittersSystem {
  private woodsState(): WoodsState { return (game.state.woods ??= { day: localDay(game.now()), picked: [], dug: [], found: {}, visited: false }); }
  private rec(id: string): { visits: number; treat?: string; seen?: string; seenN?: number } {
    const w = this.woodsState();
    return ((w.critters ??= {})[id] ??= { visits: 0 });
  }

  families(): CritterDef[] { return CRITTERS.families; }
  def(id: string): CritterDef | undefined { return CRITTERS.families.find((c) => c.id === id); }

  /** The stump can be used: the woods are open and so is the family's region (the glade always is). */
  open(id: string): boolean {
    const c = this.def(id);
    return !!c && woods.unlocked && (c.region === 'glade' || woods.regionOpen(c.region));
  }
  /** Where the family lives, for text. */
  placeName(c: CritterDef): string { return c.region === 'glade' ? 'the glade' : WOODS_REGIONS.find((r) => r.id === c.region)?.name ?? c.region; }

  visits(id: string): number { return game.state.woods?.critters?.[id]?.visits ?? 0; }
  hearts(id: string): number { return Math.min(CRITTERS.maxHearts, Math.floor(this.visits(id) / CRITTERS.visitsPerHeart)); }
  /** Visits still needed for the next heart (0 at the top). */
  toNextHeart(id: string): number {
    if (this.hearts(id) >= CRITTERS.maxHearts) return 0;
    return CRITTERS.visitsPerHeart - (this.visits(id) % CRITTERS.visitsPerHeart);
  }
  treatOn(id: string): string | undefined { return game.state.woods?.critters?.[id]?.treat; }
  /** Visits from the family today (1.23 the Elder Oak's boughs let them come twice). */
  visitsToday(id: string): number { const r = game.state.woods?.critters?.[id]; return r?.seen === localDay(game.now()) ? r.seenN ?? 1 : 0; }
  /** The family has made all of today's visits. */
  seenToday(id: string): boolean { return this.visitsToday(id) >= critterVisitsPerDay(); }

  /** Inside the family's hours now (local time; hours may wrap past midnight). */
  inHours(c: CritterDef, at = game.now()): boolean {
    const h = new Date(at).getHours();
    return c.from > c.to ? h >= c.from || h < c.to : h >= c.from && h < c.to;
  }
  /** A visitor is at the stump: a treat is waiting, it is the family's time and it has not visited today. */
  present(id: string): boolean {
    const c = this.def(id);
    return !!c && this.open(id) && !!this.treatOn(id) && this.inHours(c) && !this.seenToday(id);
  }
  /** Hours until the family's time starts (0 while it is on). */
  hoursUntil(c: CritterDef): number {
    const h = new Date(game.now()).getHours();
    return this.inHours(c) ? 0 : (c.from - h + 24) % 24;
  }

  /** Treats from the family's list that are in the barn, in the family's order. */
  treatsHeld(c: CritterDef): string[] { return c.treats.filter((t) => game.count(t) > 0); }

  /** Put one treat on the stump. False when the stump is closed, already has a treat, or the item is not held or not liked. */
  feed(id: string, treat: string, at?: Vec): boolean {
    const c = this.def(id);
    if (!c || !this.open(id) || this.treatOn(id) || !c.treats.includes(treat) || game.count(treat) < 1) return false;
    game.addItem(treat, -1, at);
    this.rec(id).treat = treat;
    game.incStat('critter_treats');
    game.bus.emit('woods:changed', {});
    saves.save();
    return true;
  }

  /** Say hello to a visitor: the treat is eaten, a gift is left, and every few visits a heart. */
  visit(id: string, at?: Vec): VisitResult | null {
    const c = this.def(id);
    if (!c || !this.present(id)) return null;
    const r = this.rec(id);
    const before = this.hearts(id);
    delete r.treat;
    const today = localDay(game.now());
    r.seenN = r.seen === today ? (r.seenN ?? 1) + 1 : 1;
    r.seen = today;
    r.visits++;
    const after = this.hearts(id);
    const heart = after > before ? after : null;
    // the rare gift: likelier with every heart, and always on reaching the last heart
    const rareChance = CRITTERS.rareBase + CRITTERS.rarePerHeart * before;
    const rare = heart === CRITTERS.maxHearts || Math.random() < rareChance;
    const gift = rare ? c.rare : pickWeighted(c.gifts, Math.random).id;
    game.addItem(gift, 1, at);
    if (ITEMS[gift]?.cat === 'forage' || rare) woods.noteFound(gift);
    const coins = heart ? CRITTERS.heartCoins * heart : 0;
    if (coins) game.addCoins(coins, at);
    game.incStat('critter_visits');
    if (heart) game.incStat('critter_hearts');
    logEvent('critter', { id, gift, heart: heart ?? 0 });
    game.bus.emit('woods:changed', {});
    saves.save();
    return { gift, rare, heart, coins };
  }

  /** Families with a visitor waiting right now (for the woods sign and banner). */
  waiting(): CritterDef[] { return this.families().filter((c) => this.present(c.id)); }

  // ------------------------------------------------------------------------------- Wren's field notes
  /** Wren is at home once her region's trail is restored. */
  get wrenHere(): boolean { return woods.regionOpen(WREN.region); }
  /** Items Wren might ask for: forage that grows somewhere open to this farm. */
  private noteItems(): string[] {
    const ids = new Set(WOODS.foraged.map((e) => e.id));
    for (const r of WOODS_REGIONS) if (woods.regionOpen(r.id)) for (const e of r.foraged) ids.add(e.id);
    return [...ids].filter((id) => ITEMS[id]);
  }
  /** Today's field note (made the first time it is asked for each day). */
  note(): { item: string; n: number; done: boolean } | null {
    if (!this.wrenHere) return null;
    const w = this.woodsState(), day = localDay(game.now());
    if (w.note?.day !== day || !ITEMS[w.note.item]) {
      const r = rng(hashString(`${game.state.seed}:wren:${day}`));
      const list = this.noteItems();
      const item = list[Math.floor(r() * list.length)];
      const [lo, hi] = WREN.need;
      w.note = { day, item, n: lo + Math.floor(r() * (hi - lo + 1)), done: false };
    }
    return w.note;
  }
  noteReward(): { coins: number; gem: boolean } {
    const n = this.note();
    if (!n) return { coins: 0, gem: false };
    return { coins: Math.round(ITEMS[n.item].sell * n.n * WREN.coinsMult + WREN.bonus), gem: ((game.state.woods?.notesDone ?? 0) + 1) % WREN.gemsEvery === 0 };
  }
  notesDone(): number { return game.state.woods?.notesDone ?? 0; }
  /** Give Wren today's field note. */
  giveNote(at?: Vec): { coins: number; gem: boolean } | null {
    const n = this.note();
    if (!n || n.done || game.count(n.item) < n.n) return null;
    const reward = this.noteReward();
    game.addItem(n.item, -n.n, at);
    const w = this.woodsState();
    w.note!.done = true;
    w.notesDone = (w.notesDone ?? 0) + 1;
    game.addCoins(reward.coins, at);
    if (reward.gem) game.addGems(1, at);
    game.incStat('field_notes');
    logEvent('field_note', { item: n.item });
    game.bus.emit('woods:changed', {});
    saves.save();
    return reward;
  }
  /** One line Wren says today. */
  hello(): string { return WREN.hello[hashString(localDay(game.now())) % WREN.hello.length]; }
}

export const critters = new CrittersSystem();
