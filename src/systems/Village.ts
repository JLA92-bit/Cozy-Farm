/**
 * 1.8 Village Friends: friendship points with the six villagers (src/data/villagers.json). This is the shared
 * core; the 1.8 villagers agent builds gifts, chats, orders, milestones, perks and the Village screen on it.
 * 100 points = 1 heart, up to 10 hearts. Points never drop from not playing.
 */
import { game } from './Game';
import { FRIENDSHIP, VILLAGER, VILLAGERS } from '../data';
import type { FriendshipState } from './State';

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
