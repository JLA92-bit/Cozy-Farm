import { Panel } from '../Panel';
import { h, button } from '../dom';
import { ui } from '../UI';
import { game } from '../../systems/Game';
import { saves } from '../../systems/Save';
import { buildings } from '../../systems/Buildings';
import { MAX_LEVEL, LEVELS } from '../../data';
import { settings, saveSettings } from '../../systems/Settings';

/** Hidden developer tools: 5 quick taps on the level badge. */
export function openDebug(): void {
  const p = new Panel({ title: 'Debug', icon: 'toolbox', color: 'purple' });
  const info = h('div', { class: 'muted', style: 'margin-bottom:8px' });
  const refreshInfo = () => {
    const r = ui.scene.renderer.info;
    info.textContent = `fps ${ui.scene.fps.toFixed(0)} · frame ${ui.scene.frameMs.toFixed(1)}ms · calls ${r.render.calls} · tris ${(r.render.triangles / 1000).toFixed(1)}k · geoms ${r.memory.geometries} · tex ${r.memory.textures} · time offset ${(game.state.debugTimeOffset / 60000).toFixed(0)}m`;
  };
  refreshInfo();
  const timer = setInterval(() => { if (!p.overlay.isConnected) clearInterval(timer); else refreshInfo(); }, 500);
  const act = (label: string, fn: () => void, cls = 'small') => button(label, () => { fn(); game.emitChanged(); ui.hud.refresh(); refreshInfo(); }, cls);
  const skip = (min: number) => () => {
    game.state.debugTimeOffset += min * 60000;
    buildings.tick(game.now());
    ui.scene.farm.tick(game.now());
    ui.feedback.toast(`Skipped ${min} minutes`, undefined, 'timer');
  };
  p.body.append(info, h('div', { class: 'debug-grid' },
    act('+1,000 coins', () => game.addCoins(1000)),
    act('+100,000 coins', () => game.addCoins(100000)),
    act('+50 gems', () => game.addGems(50)),
    act('+100 XP', () => game.addXp(100)),
    act('Level up', () => game.addXp(game.xpToNext() - game.state.player.xp)),
    act('Max level', () => { while (game.level < MAX_LEVEL) game.addXp(LEVELS[game.level - 1].xpToNext); }),
    act('Skip 1 min', skip(1)),
    act('Skip 10 min', skip(10)),
    act('Skip 1 hour', skip(60)),
    act('Skip 1 day', skip(1440)),
    act('Reset time skip', () => { game.state.debugTimeOffset = 0; }),
    act('+10 of each item', () => { for (const id of ['wheat', 'corn', 'carrot', 'turnip', 'sugarcane', 'egg', 'milk', 'chicken_feed', 'cow_feed', 'sugar']) game.addItem(id, 10); }),
    act('Grant crates', () => { game.state.crates.push('common', 'rare', 'epic', 'legendary'); }),
    act('Finish all timers', () => {
      const now = game.now();
      for (const b of game.state.buildings) {
        if (b.buildEnd) b.buildEnd = now - 1;
        if (b.upgradeEnd) b.upgradeEnd = now - 1;
        if (b.plot) b.plot.plantedAt = now - b.plot.growSec * 1000;
        if (b.tree) b.tree.readyAt = now - 1;
        for (const a of b.animals ?? []) if (a.fedAt) a.fedAt = 0;
        for (const q of b.queue ?? []) { q.end = now - 1; q.start = Math.min(q.start, now - 2); }
      }
      buildings.tick(now);
      ui.scene.farm.tick(now);
    }),
    act('Daily reset', () => { game.state.daily.claimedDay = ''; game.state.quests.dailyKey = ''; }),
    act(settings.showFps ? 'Hide FPS' : 'Show FPS', () => { settings.showFps = !settings.showFps; saveSettings(settings); ui.setFps(settings.showFps); }),
    act('Save now', () => saves.save()),
    act('Reset save', () => { if (confirm('Erase the farm and start over?')) saves.reset(); }, 'small red'),
  ));
  p.open();
}
