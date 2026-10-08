/**
 * 1.8 Village Friends: heart milestones and the letters that follow friendship (villagers.json has the words).
 * Every milestone is given once and recorded in `friend.rewards`:
 *   2 hearts  a letter with a tip in their voice
 *   4 hearts  a story moment (shown when the player is idle on the farm), then their keepsake decoration
 *   6 hearts  their perk (src/systems/Perks.ts) and a letter about it
 *   8 hearts  a second story moment, then a framed portrait
 *   10 hearts best friends: a letter with a gift, and another gift letter every 7 days
 * Plus: a birthday gift earns a thank-you letter the next day (whoever gave it), and Pip's perk sends a treasure every Monday.
 * Story moments and keepsakes are recorded in `friend.stories`, so a closed game never loses one.
 */
import { BUILDING, FRIENDSHIP, PIP_TREASURES, VILLAGER, VILLAGERS, type VillagerDef, type VillagerLetter } from '../data';
import { game } from './Game';
import { mail } from './Mail';
import { hasPerk } from './Perks';
import { localDay } from './Progression';
import { saves } from './Save';
import { village } from './Village';
import { visiting } from './Visiting';
import { hashString } from '../world/Procedural';
import type { FriendshipState, Letter } from './State';

export const STORY_HEARTS = [2, 4, 6, 8, 10] as const;
/** 1.9: the 2, 6 and 10 heart events have no keepsake; they pay a small thank-you instead. */
const EVENT_THANKS: Record<number, { coins: number; gems: number }> = { 2: { coins: 100, gems: 0 }, 6: { coins: 300, gems: 1 }, 10: { coins: 600, gems: 3 } };
const WEEK_DAYS = 7;

/** What each milestone brings, in a short line for the villager page ("At 4 hearts: ..."). */
export function milestoneText(v: VillagerDef, m: number): string {
  if (m === 2) return `a letter and a short story with ${v.name}`;
  if (m === 4) return `a story with ${v.name} and a keepsake`;
  if (m === 6) return `${v.perk6.text}, and a story`;
  if (m === 8) return `a second story and a portrait of ${v.name}`;
  return `best friends: a story, and a gift from ${v.name} every week`;
}

/** Icon for a milestone row. */
export function milestoneIcon(m: number): string {
  return m === 2 ? 'mailbox' : m === 4 ? 'sparkle_heart' : m === 6 ? 'gift' : m === 8 ? 'framed' : 'crown';
}

const fill = (s: string): string => s.replace(/\{farmer\}/g, game.state.player.name || 'Farmer');

/** Calendar days between two local day strings (YYYY-MM-DD). */
function daysBetween(a: string, b: string): number {
  const t = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, (m || 1) - 1, d || 1); };
  return Math.round((t(b) - t(a)) / 86400000);
}
/** The local day of the Monday that starts `now`'s week. */
export function mondayOf(now: number): string {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDay(d.getTime());
}

/** Is this local day (YYYY-MM-DD) the villager's birthday? */
const isBirthdayDay = (v: VillagerDef, day: string): boolean => { const [, m, d] = day.split('-').map(Number); return m === v.birthday[0] && d === v.birthday[1]; };

class VillageRewards {
  /** Has the player met this villager (chatted, gifted, filled an order or had a visit)? */
  met(id: string): boolean {
    // a record alone is not enough: looking at someone's card creates one (Village.friend)
    const f = game.state.village.friends[id];
    return !!f && (f.points > 0 || f.gifts > 0 || !!f.chatDay || f.rewards.length > 0);
  }

  /** The next milestone not reached yet, or null at 10 hearts. */
  next(id: string): number | null {
    const h = village.hearts(id);
    return FRIENDSHIP.milestones.find((m) => m > h) ?? null;
  }

  private send(v: VillagerDef, l: VillagerLetter, attach?: Letter['attach']): void {
    mail.send(v.id, fill(l.title), fill(l.body), attach);
  }

  /** The best-friend weekly gift (items + coins). */
  private weeklyAttach(v: VillagerDef): Letter['attach'] {
    return { coins: v.weekly.coins || undefined, items: { ...v.weekly.items } };
  }

  private treasure(week: string): Letter['attach'] {
    const t = PIP_TREASURES[hashString(`${game.state.seed}:pip:${week}`) % PIP_TREASURES.length];
    return { items: t.items ? { ...t.items } : undefined, gems: t.gems, coins: t.coins };
  }

  /** Give every milestone this villager has reached and not had yet. */
  check(id: string): void {
    const v = VILLAGER[id];
    if (!v || !game.state.village.friends[id]) return;
    const f = village.friend(id);
    const hearts = village.hearts(id);
    let changed = false;
    for (const m of FRIENDSHIP.milestones) {
      if (hearts < m || f.rewards.includes(m)) continue;
      f.rewards.push(m);
      changed = true;
      const today = localDay(game.now());
      if (m === 2) this.send(v, v.letters.hearts2);
      else if (m === 6) {
        // Pip's perk letter carries the first treasure; later ones come every Monday
        if (v.perk6.id === 'pip_treasure') { f.treasureWeek = mondayOf(game.now()); this.send(v, v.letters.perk, this.treasure(f.treasureWeek)); }
        else this.send(v, v.letters.perk);
      } else if (m === 10) { f.weeklyDay = today; this.send(v, v.letters.best, this.weeklyAttach(v)); }
      game.bus.emit('village:milestone', { id, hearts: m });
    }
    if (changed) { this.gauges(); saves.save(); }
  }

  /** Stats for the dashboard and the friendship achievements. */
  gauges(): void {
    game.setGauge('village_hearts', village.totalHearts());
    game.setGauge('best_friends', VILLAGERS.filter((v) => village.hearts(v.id) >= 10).length);
  }

  /** The first story moment waiting to be shown, if any. */
  pendingStory(): { id: string; hearts: number } | null {
    for (const v of VILLAGERS) {
      const f = game.state.village.friends[v.id];
      if (!f) continue;
      for (const m of STORY_HEARTS) if (f.rewards.includes(m) && !(f.stories ?? []).includes(m) && v.stories[String(m)]) return { id: v.id, hearts: m };
    }
    return null;
  }

  /** Mark a story moment seen and put its keepsake in storage (once). Returns the decoration id given. */
  finishStory(id: string, hearts: number): string | null {
    const v = VILLAGER[id];
    const f = game.state.village.friends[id];
    if (!v || !f || !f.rewards.includes(hearts) || (f.stories ??= []).includes(hearts)) return null;
    f.stories.push(hearts);
    const thanks = EVENT_THANKS[hearts];
    if (thanks) {
      game.addCoins(thanks.coins);
      if (thanks.gems) game.addGems(thanks.gems);
      game.bus.emit('toast', { title: `${v.name} says thank you`, sub: `${thanks.coins} coins${thanks.gems ? ` and ${thanks.gems} gem${thanks.gems === 1 ? '' : 's'}` : ''}`, icon: 'sparkle_heart' });
      game.incStat('heart_events');
      saves.save();
      return null;
    }
    const deco = hearts === 4 ? v.keepsake : v.portrait;
    if (!BUILDING[deco]) return null;
    game.state.storage[deco] = (game.state.storage[deco] ?? 0) + 1;
    game.incStat('keepsakes');
    saves.save();
    return deco;
  }

  /** Keepsakes earned with a villager (0-2). */
  keepsakes(id: string): number { return (game.state.village.friends[id]?.stories ?? []).filter((m) => m === 4 || m === 8).length; }

  /** Letters that wait for a new day: birthday thanks, best-friend gifts, Pip's treasure. */
  daily(now = game.now()): void {
    if (visiting.active || !game.state.tutorial.done) return;
    const today = localDay(now);
    for (const v of VILLAGERS) {
      const f: FriendshipState | undefined = game.state.village.friends[v.id];
      if (!f) continue;
      // a gift on their birthday is thanked by letter on a later day (once per birthday gift)
      if (f.giftDay && f.giftDay !== today && f.bdayThanks !== f.giftDay && isBirthdayDay(v, f.giftDay)) {
        f.bdayThanks = f.giftDay;
        this.send(v, v.letters.birthday);
      }
      if (f.rewards.includes(10) && (!f.weeklyDay || daysBetween(f.weeklyDay, today) >= WEEK_DAYS)) {
        f.weeklyDay = today;
        this.send(v, v.letters.weekly, this.weeklyAttach(v));
      }
      if (v.perk6.id === 'pip_treasure' && hasPerk('pip_treasure')) {
        const week = mondayOf(now);
        if (f.treasureWeek !== week) {
          f.treasureWeek = week;
          const notes = v.treasure ?? [v.letters.weekly];
          this.send(v, notes[hashString(week) % notes.length], this.treasure(week));
        }
      }
    }
  }

  private started = false;
  /** Called once after boot. */
  start(): void {
    if (this.started) return;
    this.started = true;
    game.bus.on('village:points', ({ id }) => {
      this.check(id);
      this.gauges();
    });
    for (const v of VILLAGERS) this.check(v.id);
    this.gauges();
    this.daily();
  }
}

export const villageRewards = new VillageRewards();
