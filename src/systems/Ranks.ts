/**
 * 1.12 Leaderboard trophies: reach 1st, 2nd, 3rd or the top 10 on a leaderboard and a big-number decoration for that
 * place goes into your storage, once, to keep for good (it shows on your farm to every visitor). Ranks are read from
 * the real boards, so this only counts with real online play (not the practice neighbours), and a board needs at
 * least MIN_PLAYERS farmers on it so the early days of a small server do not hand out first places.
 * The check is light: it runs whenever the Leaders panel loads a board and about once an hour while you play.
 */
import { BUILDING } from '../data';
import { game } from './Game';
import { logEvent } from '../online/Events';
import { online } from '../online/Online';
import { fetchBoard, type Board } from '../online/Leaderboard';
import type { LeaderboardKind } from '../online/types';

export const MIN_PLAYERS = 20;
export const BOARD_NAMES: Record<LeaderboardKind, string> = { level: 'Level', farmValue: 'Farm Value', charm: 'Charm', weeklyXp: 'Weekly XP' };
export const BOARDS: LeaderboardKind[] = ['level', 'farmValue', 'charm', 'weeklyXp'];
export const TIERS = [1, 2, 3, 10] as const;
export type RankTier = (typeof TIERS)[number];
const CHECK_EVERY_MS = 3600000;

/** The place a rank earns: 1, 2, 3 or 10 (ranks 4 to 10), or null when it earns nothing. */
export function tierFor(rank: number): RankTier | null {
  if (rank < 1 || rank > 10) return null;
  return rank <= 3 ? (rank as RankTier) : 10;
}
export const trophyId = (kind: LeaderboardKind, tier: RankTier): string => `rank_${kind}_${tier}`;

class RankSystem {
  private lastCheck = 0;
  private timer = 0;

  /** The tiers already earned on a board. */
  earned(kind: LeaderboardKind): RankTier[] { return (game.state.ranks?.[kind] ?? []).filter((t): t is RankTier => (TIERS as readonly number[]).includes(t)); }
  has(kind: LeaderboardKind, tier: RankTier): boolean { return this.earned(kind).includes(tier); }
  count(): number { return BOARDS.reduce((n, k) => n + this.earned(k).length, 0); }

  /** Look at a freshly loaded board: grant the trophy for your place if it is a new one. */
  consider(b: Board): void {
    if (b.stale || online.kind === 'local' || !b.me || !b.rank || b.rows.length < MIN_PLAYERS) return;
    const tier = tierFor(b.rank);
    if (!tier || this.has(b.kind, tier)) return;
    const id = trophyId(b.kind, tier);
    if (!BUILDING[id]) return;
    const st = (game.state.ranks ??= {});
    st[b.kind] = [...this.earned(b.kind), tier];
    game.state.storage[id] = (game.state.storage[id] ?? 0) + 1;
    game.discover(id, 'building');
    game.incStat('rank_trophies');
    logEvent('rank_trophy', { board: b.kind, tier, rank: b.rank });
    game.bus.emit('toast', {
      title: tier === 10 ? `Top 10 on ${BOARD_NAMES[b.kind]}!` : `#${tier} on ${BOARD_NAMES[b.kind]}!`,
      sub: `A ${BUILDING[id].name} trophy is waiting in your storage. Place it on your farm for bragging rights!`, icon: 'trophy',
    });
    game.bus.emit('sfx', { name: 'levelup' });
  }

  /** Check every board now (one at a time, quietly). */
  async checkAll(): Promise<void> {
    if (online.kind === 'local' || !game.state.player.created) return;
    this.lastCheck = Date.now();
    for (const kind of BOARDS) {
      try { this.consider(await fetchBoard(kind)); } catch { /* offline: try again next time */ }
    }
  }

  /** About once an hour while playing and signed in; the first check comes a minute after the game opens. */
  start(): void {
    if (this.timer) return;
    const tick = () => {
      if (document.visibilityState === 'visible' && Date.now() - this.lastCheck >= CHECK_EVERY_MS) void this.checkAll();
    };
    setTimeout(tick, 60000);
    this.timer = window.setInterval(tick, 5 * 60000);
  }
}

export const ranks = new RankSystem();
