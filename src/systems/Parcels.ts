import { BUILDING, BUILDINGS, CROP, ITEMS, PARCELS, VILLAGER } from '../data';
import { game } from './Game';
import { repairParcels, saves } from './Save';
import { mail } from './Mail';
import { crates } from './Progression';
import { NEED_GROUPS, lovedGift, needsNow, senderFor, unitValue, type Need } from './Needs';
import { hashString, rng } from '../world/Procedural';
import { logEvent } from '../online/Events';
import type { ParcelCard, ParcelSource, ParcelState } from './State';

/**
 * 1.45 Thoughtful Parcels: a villager noticed what you are short of and sent some over. Need picks what is in a
 * parcel, never how much: its worth is set by the level and what earned it (parcels.json). Three cards, pick one;
 * the cards are worked out when the parcel is first opened and kept, so reopening cannot change them. Parcels are
 * never sold, and no shop offer is ever built from this list (ROADMAP.md guardrails).
 */
const DAY = 86400000;

/** A parcel's worth in coins. */
export function parcelValue(level: number, src: ParcelSource): number {
  const v = PARCELS.value;
  return Math.round(Math.min(v.max, v.base + v.perLevel * level) * PARCELS.share[src]);
}

/** Turn a need into a card worth `value`: as many as fit and the limits allow, the rest in coins. Null when not even one fits. */
function cardFor(n: Need, value: number): ParcelCard | null {
  if (n.item === 'coins') return { coins: value, why: n.why, from: n.from, need: n.id };
  const unit = unitValue(n.item, n.star);
  const limit = n.capped ? Math.ceil(n.missing * PARCELS.lineShare) : n.missing;
  const qty = Math.min(limit, Math.floor(value / unit));
  if (qty < 1) return null;
  return { item: n.item, qty, star: n.star, coins: Math.round(value - qty * unit), why: n.why, from: n.from, need: n.id };
}

function shuffled<T>(list: T[], r: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** A crate's item roll: something the farm is short of, at most `max` of it and worth at most `budget`. Plain items only. */
export function crateNeed(max: number, budget: number, r: () => number): { item: string; n: number } | null {
  for (const need of shuffled(needsNow().filter((x) => x.item !== 'coins' && !x.star), r)) {
    const limit = need.capped ? Math.ceil(need.missing * PARCELS.lineShare) : need.missing;
    const n = Math.min(max, limit, Math.floor(budget / unitValue(need.item, 0)));
    if (n > 0) return { item: need.item, n };
  }
  return null;
}

class ParcelSystem {
  private get st(): ParcelState { return (game.state.parcels ??= { level: 0, pending: [], recent: {} }); }

  init(): void {
    const first = !game.state.parcels;
    const st = this.st;
    if (first) st.level = game.level;
    // farms already on the road get one to start with, and a note saying what it is
    if (first && game.level >= PARCELS.level) {
      st.pending.push({ src: 'welcome', level: game.level });
      mail.send('hazel', 'Keeping an eye out for you',
        `Dear ${game.state.player.name || 'farmer'},\n\nWe have all been talking, and it seems silly to watch you run short of something when one of us has plenty. So from now on, each time you go up a level, one of us will send a parcel over.\n\nYou choose from three, and if there is something you are working towards, pin it and we will know.\n\nThe first one is on its way.\n\nWith love,\nHazel`);
    }
    this.catchUp(false);
    game.bus.on('levelup', () => this.catchUp(true));
  }

  /** Levels reached since the last check each earn a parcel (a cloud save can jump several). */
  private catchUp(live: boolean): void {
    const st = this.st;
    for (let l = Math.max(st.level + 1, PARCELS.level); l <= game.level; l++) st.pending.push({ src: 'level', level: l });
    const added = game.level > st.level && game.level >= PARCELS.level;
    st.level = Math.max(st.level, game.level);
    if (added && live) this.arrived();
  }

  /** Master week or a 3-star festival prize. */
  add(src: ParcelSource): void {
    if (game.level < PARCELS.level) return;
    this.st.pending.push({ src, level: game.level });
    this.arrived();
  }
  private arrived(): void { game.bus.emit('toast', { title: 'A parcel for you', sub: 'Someone in the village sent something over', icon: 'package' }); saves.saveSoon(); }

  waiting(): number { return game.state.parcels?.pending.length ?? 0; }

  /** The three cards for the first parcel. They are made once and saved. */
  offer(): NonNullable<ParcelState['offer']> | null {
    const st = this.st;
    const first = st.pending[0];
    if (!first) return null;
    if (st.offer && st.offer.src === first.src && st.offer.level === first.level) return st.offer;
    st.offer = { src: first.src, level: first.level, cards: this.makeCards(first.src, first.level) };
    logEvent('parcel_offered', { src: first.src, level: first.level, cards: st.offer.cards.map((c) => c.item ?? c.decor ?? 'coins') });
    saves.save();
    return st.offer;
  }

  private makeCards(src: ParcelSource, level: number): ParcelCard[] {
    const st = this.st, now = game.now(), value = parcelValue(level, src);
    const r = rng(hashString(`${game.state.seed}:parcel:${src}:${level}:${st.pending.length}`));
    const needs = needsNow(now);
    const cards: ParcelCard[] = [];
    const used = new Set<string>();
    const take = (n: Need): boolean => {
      if (cards.length >= 3 || used.has(n.item)) return false;
      const c = cardFor(n, value);
      if (!c) return false;
      used.add(n.item);
      cards.push(c);
      return true;
    };
    // what the player pinned comes first; everything else keeps to one item a week
    const pin = needs.find((n) => n.id === st.pin);
    if (pin) take(pin);
    const fresh = needs.filter((n) => n.item === 'coins' || now - (st.recent[n.item] ?? 0) >= PARCELS.repeatDays * DAY);
    const groups = NEED_GROUPS.map((g) => shuffled(fresh.filter((n) => n.group === g), r));
    // one from each group where possible, so the three are a real choice
    for (const g of groups) { for (const n of g) if (take(n)) break; }
    for (const g of groups) for (const n of g) take(n);
    // nothing else wanted: coins, a piece of decor the farm does not have, or something a villager loves
    if (cards.length < 3 && !cards.some((c) => !c.item && !c.decor)) cards.push({ coins: value, why: 'a little something for the farm', from: senderFor('coins') });
    if (cards.length < 3) {
      const list = BUILDINGS.filter((b) => b.cat === 'decor' && !b.event && !b.path && b.cost > 0 && b.cost <= value && b.level <= game.level && !game.ownedCount(b.id));
      const d = shuffled(list, r)[0];
      if (d) cards.push({ decor: d.id, coins: value - d.cost, why: 'it made me think of your farm', from: PARCELS.senders.decor });
    }
    const love = lovedGift();
    if (cards.length < 3 && love && !used.has(love.item)) {
      const unit = unitValue(love.item, 0), qty = Math.min(5, Math.floor(value / unit));
      if (qty > 0) cards.push({ item: love.item, qty, star: 0, coins: Math.round(value - qty * unit), why: `${VILLAGER[love.who].name} loves these`, from: senderFor(love.item) });
    }
    return cards;
  }

  /** Take a card from the offer. */
  pick(index: number): ParcelCard | null {
    const st = this.st, offer = st.offer, c = offer?.cards[index];
    if (!offer || !c) return null;
    if (c.item && c.qty) { game.as('parcel').addItem(c.item, c.qty, undefined, c.star ?? 0); st.recent[c.item] = game.now(); }
    if (c.decor) game.state.storage[c.decor] = (game.state.storage[c.decor] ?? 0) + 1;
    if (c.coins) game.addCoins(c.coins);
    logEvent('parcel_picked', { src: offer.src, level: offer.level, picked: c.item ?? c.decor ?? 'coins', index });
    st.pending.shift();
    delete st.offer;
    for (const k of Object.keys(st.recent)) if (game.now() - st.recent[k] > PARCELS.repeatDays * DAY) delete st.recent[k];
    game.bus.emit('sfx', { name: 'reward' });
    game.bus.emit('state:changed', {});
    saves.save();
    return c;
  }

  /** What can be pinned, best first. */
  goals(): Need[] { return needsNow().filter((n) => n.group === 'project' || n.group === 'upgrade'); }
  pinned(): Need | null {
    const id = game.state.parcels?.pin;
    return id ? this.goals().find((n) => n.id === id) ?? null : null;
  }
  /** Pin a goal, or unpin it if it is already pinned. */
  togglePin(id: string): void {
    const st = this.st;
    if (st.pin === id) delete st.pin; else st.pin = id;
    saves.save();
  }
  needName(n: Need): string {
    if (n.item === 'coins') return `${n.missing.toLocaleString('en-US')} coins`;
    return `${n.missing} ${n.star === 2 ? 'gold ' : n.star === 1 ? 'silver ' : ''}${ITEMS[n.item].name}`;
  }
}

export const parcels = new ParcelSystem();
Object.assign(window as unknown as Record<string, unknown>, {
  __needs: needsNow,
  __parcels: Object.assign(parcels, { debug: { unit: unitValue, decorCost: (id: string) => BUILDING[id].cost, repair: repairParcels, get crates() { return crates; }, plain: (id: string) => !!CROP[id] || ITEMS[id]?.cat === 'feed' } }),
});
