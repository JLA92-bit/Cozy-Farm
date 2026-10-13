/**
 * 1.13 Endless levels: there is no top level. From level 61 every level hands out a Level Marker (a big number of
 * that level for the farm), up to markerTo, and the authored content (levels.json `authoredMax`) keeps growing with
 * each release. A save that is already past some levels (cloud save, a big XP jump) is caught up when the game opens.
 */
import { BUILDING, ENDLESS } from '../data';
import { game } from './Game';

export const markerId = (level: number): string => `marker_${level}`;

class EndlessSystem {
  init(): void {
    game.bus.on('levelup', ({ level }) => this.grant(level, level, true));
    // levels reached while the game was closed or before this release
    const from = Math.max(ENDLESS.markerFrom, (game.state.endless?.marker ?? 0) + 1);
    if (game.level >= from) this.grant(from, game.level, false);
  }

  /** Give the markers for levels `from` to `to` (one toast for the lot). */
  private grant(from: number, to: number, live: boolean): void {
    const st = (game.state.endless ??= { marker: 0 });
    const last = Math.min(to, ENDLESS.markerTo);
    let n = 0;
    for (let level = Math.max(from, ENDLESS.markerFrom, st.marker + 1); level <= last; level++) {
      const id = markerId(level);
      if (!BUILDING[id]) continue;
      game.state.storage[id] = (game.state.storage[id] ?? 0) + 1;
      game.discover(id, 'building');
      st.marker = level;
      n++;
    }
    if (!n) return;
    game.bus.emit('toast', {
      title: n === 1 ? `Level ${st.marker} Marker!` : `${n} Level Markers!`,
      sub: n === 1 ? 'A big number for your farm is waiting in your storage.' : 'Big numbers for your farm are waiting in your storage.', icon: 'glowing_star',
    });
    if (!live) game.bus.emit('sfx', { name: 'collect' });
  }
}

export const endless = new EndlessSystem();
