/**
 * 1.8 Village Friends: friendship points with the six villagers (src/data/villagers.json). This is the shared
 * core; the 1.8 villagers agent builds gifts, chats, orders, milestones, perks and the Village screen on it.
 * 100 points = 1 heart, up to 10 hearts. Points never drop from not playing.
 */
import { game, QUALITY_MULT } from './Game';
import { FRIENDSHIP, ITEMS, VILLAGER, VILLAGERS } from '../data';
import { localDay } from './Progression';
import type { FriendshipState } from './State';

export type Taste = 'love' | 'like' | 'neutral' | 'dislike';

/** What a gift did: the points, how they felt about it, and whether it was their birthday. */
export interface GiftResult { id: string; item: string; quality: 0 | 1 | 2; taste: Taste; points: number; birthday: boolean; hearts: number; heartUp: boolean }

const MAX = FRIENDSHIP.pointsPerHeart * FRIENDSHIP.maxHearts;

export class VillageSystem {
  /** The friendship record for a villager (created on first use). */
  friend(id: string): FriendshipState {
    const f = game.state.village.friends;
    return (f[id] ??= { points: 0, giftDay: '', chatDay: '', gifts: 0, rewards: [], known: [] });
  }
  points(id: string): number { return game.state.village.friends[id]?.points ?? 0; }
  hearts(id: string): number { return Math.floor(this.points(id) / FRIENDSHIP.pointsPerHeart); }
  /** Total hearts with everyone (for goals, achievements and the dashboard). */
  totalHearts(): number { return VILLAGERS.reduce((a, v) => a + this.hearts(v.id), 0); }
  /** How a villager feels about an item ('fish' in likes covers every fish). */
  taste(id: string, item: string): Taste {
    const v = VILLAGER[id];
    if (!v) return 'neutral';
    if (v.loves.includes(item)) return 'love';
    if (v.dislikes.includes(item)) return 'dislike';
    if (v.likes.includes(item) || (v.likes.includes('fish') && ITEMS[item]?.cat === 'fish')) return 'like';
    return 'neutral';
  }
  /** True on the villager's birthday (local date). */
  isBirthday(id: string, now = game.now()): boolean {
    const v = VILLAGER[id];
    if (!v) return false;
    const d = new Date(now);
    return d.getMonth() + 1 === v.birthday[0] && d.getDate() === v.birthday[1];
  }
  /** One gift per villager per local day. */
  canGift(id: string, now = game.now()): boolean { return !!VILLAGER[id] && this.friend(id).giftDay !== localDay(now); }
  /**
   * Give one item of a quality (0 normal, 1 silver, 2 gold). Points = the taste's points x the quality
   * multiplier, x3 on their birthday (a disliked gift loses points, never multiplied). Takes the item, marks
   * today's gift, reveals the taste on their card. Null (nothing changed) if they had a gift today or the item
   * is not in the barn.
   */
  giveGift(id: string, item: string, quality: 0 | 1 | 2 = 0, now = game.now()): GiftResult | null {
    if (!this.canGift(id, now) || !ITEMS[item]) return null;
    if (!game.removeQuality(item, quality, 1)) return null;
    const taste = this.taste(id, item);
    const birthday = this.isBirthday(id, now);
    const base = FRIENDSHIP.gift[taste];
    const points = base < 0 ? base : Math.round(base * QUALITY_MULT[quality] * (birthday ? FRIENDSHIP.birthdayMult : 1));
    const f = this.friend(id);
    const before = this.hearts(id);
    f.giftDay = localDay(now);
    f.gifts++;
    if (!f.known.includes(item)) f.known.push(item);
    this.addPoints(id, points, 'gift');
    game.incStat('villager_gifts');
    const hearts = this.hearts(id);
    return { id, item, quality, taste, points, birthday, hearts, heartUp: hearts > before };
  }
  /** Add (or with a disliked gift, remove) friendship. Emits 'village:points'. Returns the new points. */
  addPoints(id: string, delta: number, reason: string): number {
    if (!VILLAGER[id] || !delta) return this.points(id);
    const f = this.friend(id);
    const before = f.points;
    f.points = Math.max(0, Math.min(MAX, Math.round(f.points + delta)));
    const d = f.points - before;
    if (d) game.bus.emit('village:points', { id, delta: d, points: f.points, hearts: this.hearts(id), reason });
    return f.points;
  }
}

export const village = new VillageSystem();
