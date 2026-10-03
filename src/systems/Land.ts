import { LAND } from '../data';
import { CHUNK, CHUNKS } from '../world/Grid';
import { rng } from '../world/Procedural';
import { game, type Vec } from './Game';
import type { Obstacle } from './State';

type ObstacleType = keyof typeof LAND.obstacles.types;

export class LandSystem {
  /** Cost and level requirement of the next expansion. */
  nextExpansion(): { cost: number; level: number } {
    const e = LAND.expansion;
    const n = game.state.land.bought;
    return { cost: Math.round(e.baseCost * Math.pow(e.costGrowth, n) / 50) * 50, level: Math.floor(e.baseLevel + n * e.levelStep) };
  }

  canExpand(): { ok: boolean; reason?: string } {
    const { cost, level } = this.nextExpansion();
    if (game.level < level) return { ok: false, reason: `Reach level ${level}` };
    if (game.coins < cost) return { ok: false, reason: 'Not enough coins' };
    return { ok: true };
  }

  /** Locked chunks that touch the farm and can be bought next, nearest to the farm centre first. */
  purchasableChunks(): string[] {
    const out: { key: string; d: number }[] = [];
    const unlocked = game.state.land.unlocked;
    let sx = 0, sz = 0;
    for (const k of unlocked) { const [x, z] = k.split(',').map(Number); sx += x; sz += z; }
    const cx = sx / Math.max(1, unlocked.length), cz = sz / Math.max(1, unlocked.length);
    for (let z = 0; z < CHUNKS; z++) for (let x = 0; x < CHUNKS; x++) {
      const key = `${x},${z}`;
      if (game.isUnlocked(key)) continue;
      if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => game.isUnlocked(`${x + dx},${z + dz}`))) continue;
      out.push({ key, d: Math.hypot(x - cx, z - cz) });
    }
    return out.sort((a, b) => a.d - b.d).map((o) => o.key);
  }

  /** Cheapest obstacle on land the player owns (for "clear an obstacle" nudges). */
  easiestObstacle(): Obstacle | null {
    let best: Obstacle | null = null, bestCost = Infinity;
    for (const o of game.state.obstacles) {
      if (!game.isUnlocked(`${Math.floor(o.x / CHUNK)},${Math.floor(o.z / CHUNK)}`)) continue;
      const c = this.obstacleDef(o).clearCost;
      if (c < bestCost) { best = o; bestCost = c; }
    }
    return best;
  }

  expand(chunk: string): boolean {
    if (game.isUnlocked(chunk) || !this.canExpand().ok) return false;
    const { cost } = this.nextExpansion();
    game.spend(cost);
    game.unlockChunk(chunk);
    game.state.land.bought++;
    game.incStat('land_expanded');
    game.addXp(LAND.expansion.xp);
    game.bus.emit('land:expanded', { chunk });
    game.bus.emit('sfx', { name: 'unlock' });
    return true;
  }

  obstacleDef(o: Obstacle) { return LAND.obstacles.types[o.type as ObstacleType]; }

  canClear(o: Obstacle): { ok: boolean; reason?: string } {
    const [cx, cz] = [Math.floor(o.x / CHUNK), Math.floor(o.z / CHUNK)];
    if (!game.isUnlocked(`${cx},${cz}`)) return { ok: false, reason: 'Buy this land first' };
    if (game.coins < this.obstacleDef(o).clearCost) return { ok: false, reason: 'Not enough coins' };
    return { ok: true };
  }

  /** Clear an obstacle: pay coins, receive XP and a small random drop. */
  clear(o: Obstacle, at?: Vec): { coins: number; gems: number } | null {
    if (!this.canClear(o).ok) return null;
    const t = this.obstacleDef(o);
    game.spend(t.clearCost);
    game.state.obstacles = game.state.obstacles.filter((x) => x.id !== o.id);
    game.occO[o.z * 48 + o.x] = 0;
    const r = rng(o.id * 977 + game.state.seed);
    const [lo, hi] = t.drops.coins;
    const coins = Math.round(lo + (hi - lo) * r());
    const gemChance = (t.drops as { gems?: number }).gems ?? 0;
    const gems = r() < gemChance ? 1 : 0;
    game.addXp(t.xp, at);
    game.addCoins(coins, at);
    if (gems) game.addGems(gems, at);
    game.incStat('obstacles_cleared');
    game.incStat(o.type.includes('rock') ? 'clear_rock' : 'clear_tree');
    game.bus.emit('obstacle:cleared', { o });
    game.bus.emit('sfx', { name: t.sound });
    return { coins, gems };
  }
}

export const land = new LandSystem();
