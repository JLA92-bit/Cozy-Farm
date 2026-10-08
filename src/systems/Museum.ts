/**
 * 1.9 The Museum (in the Wild Woods, data/museum.json): donate one of each find (minerals, fossils, artifacts, wild
 * plants, great catches) to its shelf, or any gold-star goods to the Gold Star Case. The piece is given away for good.
 * A full shelf pays its reward once; every shelf full makes the player the Curator.
 */
import { BUILDING, ITEMS, MUSEUM, type MuseumShelf } from '../data';
import { game } from './Game';
import { saves } from './Save';
import { logEvent } from '../online/Events';

class MuseumSystem {
  private st() { return (game.state.museum ??= { donated: {}, done: [], curator: false }); }

  get unlocked(): boolean { return game.state.tutorial.done && game.level >= MUSEUM.level; }
  shelves(): MuseumShelf[] { return MUSEUM.shelves; }
  slots(s: MuseumShelf): number { return s.items?.length ?? s.slots ?? 0; }
  donated(id: string): string[] { return this.st().donated[id] ?? []; }
  full(s: MuseumShelf): boolean { return this.donated(s.id).length >= this.slots(s); }
  isDone(id: string): boolean { return this.st().done.includes(id); }
  curator(): boolean { return this.st().curator; }
  /** Pieces donated and slots in all. */
  total(): { have: number; slots: number } {
    let have = 0, slots = 0;
    for (const s of MUSEUM.shelves) { have += this.donated(s.id).length; slots += this.slots(s); }
    return { have, slots };
  }

  /** Items the player could give to this shelf right now. */
  givable(s: MuseumShelf): string[] {
    const got = this.donated(s.id);
    if (this.full(s)) return [];
    if (s.kind === 'gold') return Object.keys(game.state.inventory).filter((i) => ITEMS[i] && !got.includes(i) && game.qualityCounts(i)[2] > 0);
    return (s.items ?? []).filter((i) => !got.includes(i) && game.count(i) > 0);
  }
  /** How many pieces across all shelves are ready to give (the dot on the board). */
  givableCount(): number { return MUSEUM.shelves.reduce((n, s) => n + this.givable(s).length, 0); }

  donate(shelfId: string, item: string): boolean {
    const s = MUSEUM.shelves.find((x) => x.id === shelfId);
    if (!s || !this.unlocked || !this.givable(s).includes(item)) return false;
    if (s.kind === 'gold') game.removeQuality(item, 2, 1); else game.addItem(item, -1);
    const st = this.st();
    (st.donated[s.id] ??= []).push(item);
    game.incStat('museum_pieces');
    logEvent('museum_give', { shelf: s.id, item });
    game.bus.emit('sfx', { name: 'reward' });
    if (this.full(s) && !st.done.includes(s.id)) {
      st.done.push(s.id);
      game.addCoins(s.reward.coins);
      game.addGems(s.reward.gems);
      game.bus.emit('toast', { title: `${s.name} complete!`, sub: `${s.reward.coins} coins and ${s.reward.gems} gems`, icon: s.icon });
      logEvent('museum_shelf', { shelf: s.id });
      if (!st.curator && MUSEUM.shelves.every((x) => st.done.includes(x.id))) this.crown();
    }
    game.bus.emit('state:changed', {});
    saves.save();
    return true;
  }

  private crown(): void {
    const st = this.st();
    st.curator = true;
    const c = MUSEUM.curator;
    game.addCoins(c.coins);
    game.addGems(c.gems);
    if (BUILDING[c.decor]) game.state.storage[c.decor] = (game.state.storage[c.decor] ?? 0) + 1;
    game.bus.emit('toast', { title: 'You are the Curator!', sub: `Every shelf is full. ${c.coins} coins, ${c.gems} gems and a ${BUILDING[c.decor]?.name ?? 'prize'} for your farm`, icon: 'trophy' });
    logEvent('museum_curator');
  }
}

export const museum = new MuseumSystem();
