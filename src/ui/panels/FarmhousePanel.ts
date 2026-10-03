import { Panel } from '../Panel';
import { h, icon, button, priceTag, clear, fmt } from '../dom';
import { ui } from '../UI';
import { BUILDING, FARMHOUSE } from '../../data';
import { game } from '../../systems/Game';
import { buildings, speedupCost } from '../../systems/Buildings';
import { audio } from '../../systems/Audio';
import { formatTime, isUpgrading } from '../../systems/Timers';
import {
  CAP_KEYS, CAP_NAMES, MAX_FARMHOUSE, capAt, farmhouseBuilding, farmhouseGains, gainText, type CapKey,
} from '../../systems/Caps';

/** How full a cap is right now. Animal homes and workshops count per kind, so show the limit only. */
function usageText(key: CapKey, fhLevel: number): string {
  const cap = capAt(key, fhLevel);
  if (CAP_NAMES[key].each) return `${cap} each`;
  const def = Object.values(BUILDING).find((d) => d.cap === key && !d.max);
  return def ? `${game.capUsage(def)} / ${cap}` : `${cap}`;
}

const capLabel: Record<CapKey, string> = {
  plot: 'Fields', tree: 'Fruit trees', decor: 'Decorations', animal: 'Animal homes', production: 'Workshops',
};

/**
 * Farmhouse overview: what you can build now, what the next level adds and what every level gives.
 * Opened from the farmhouse popup, the Shop when a limit is full, and goal cards.
 */
export function openFarmhouse(): void {
  const fh = farmhouseBuilding();
  if (!fh) return;
  // glide the camera home behind the panel, so closing it lands on the farmhouse
  const at = ui.scene.farm.anchor(fh.uid);
  ui.scene.rig.focus(at.x, at.z);
  const p = new Panel({ title: 'Farmhouse', icon: 'house', color: 'blue', size: 'medium', wallet: true });
  const render = () => {
    clear(p.body);
    clear(p.footer);
    const lv = fh.level;
    const now = game.now();
    p.body.append(h('div', { class: 'center fh-intro' },
      h('div', { class: 'fh-level outlined' }, `Level ${lv}`, lv >= MAX_FARMHOUSE ? ' - fully upgraded!' : ''),
      h('div', { class: 'muted' }, 'A bigger home makes room for more fields, trees and buildings.')));

    // what you can have right now
    p.body.append(h('div', { class: 'section-title' }, 'Your farm now'));
    const now1 = h('div', { class: 'fh-caps' });
    for (const key of CAP_KEYS) {
      now1.append(h('div', { class: `fh-cap ${key === 'plot' ? 'hot' : ''}` }, icon(CAP_NAMES[key].icon),
        h('div', { class: 'fh-cap-name' }, capLabel[key]), h('div', { class: 'fh-cap-val outlined' }, usageText(key, lv))));
    }
    p.body.append(now1);

    // the next upgrade
    const up = buildings.upgradeInfo(fh);
    if (up) {
      const upgrading = isUpgrading(fh, now);
      p.body.append(h('div', { class: 'section-title' }, upgrading ? `Upgrading to level ${up.next}` : `Next: level ${up.next}`));
      const list = h('div', { class: 'list' });
      for (const g of farmhouseGains(lv)) {
        list.append(h('div', { class: 'list-item' }, icon(CAP_NAMES[g.key].icon, 'icon big'),
          h('div', { class: 'grow' }, h('div', { class: 'title' }, gainText(g)),
            h('div', { class: 'sub' }, `${capLabel[g.key]}: ${capAt(g.key, lv)} -> ${capAt(g.key, lv + 1)}${CAP_NAMES[g.key].each ? ' each' : ''}`))));
      }
      p.body.append(list);
      if (upgrading) {
        const left = () => Math.max(0, (fh.upgradeEnd ?? 0) - game.now());
        const timer = h('div', { class: 'timer-tag outlined fh-timer' }, formatTime(left()));
        p.body.append(h('div', { class: 'center' }, timer));
        const iv = setInterval(() => {
          if (!timer.isConnected) { clearInterval(iv); return; }
          if (left() <= 0) { clearInterval(iv); render(); return; }
          timer.textContent = formatTime(left());
        }, 1000);
        p.footer.append(button([priceTag(0, speedupCost(left())), 'Finish now'], () => {
          if (!buildings.speedup(fh)) { ui.feedback.toast('Not enough gems', undefined, 'gem'); audio.play('error'); return; }
          render();
        }, 'purple wide'));
      } else {
        const check = buildings.canUpgrade(fh);
        const needLevel = game.level < up.needLevel;
        if (needLevel) {
          p.body.append(h('div', { class: 'center muted fh-need' }, icon('lock'), ` Opens at player level ${up.needLevel} - you are level ${game.level}. Keep farming!`));
        } else if (game.coins < up.cost) {
          p.body.append(h('div', { class: 'progress fh-save' },
            h('div', { class: 'fill', style: `width:${Math.min(100, (game.coins / Math.max(1, up.cost)) * 100)}%` }),
            h('div', { class: 'label' }, `${fmt(game.coins)} / ${fmt(up.cost)}`)));
        }
        p.footer.append(button(['Upgrade', priceTag(up.cost), up.sec ? h('span', { class: 'fh-time' }, formatTime(up.sec * 1000)) : null], () => {
          if (!buildings.upgrade(fh)) {
            const c = buildings.canUpgrade(fh);
            if (!c.ok && c.reason === 'Not enough coins') ui.needCoins(up.cost);
            else { ui.feedback.toast(c.ok ? 'Cannot upgrade' : c.reason, undefined, 'lock'); audio.play('error'); }
            return;
          }
          ui.effects.sparkle(ui.scene.farm.anchor(fh.uid), '#fff6a0', 16);
          render();
        }, `wide ${check.ok ? 'yellow' : 'disabled'}`));
      }
    }

    // every level at a glance
    p.body.append(h('div', { class: 'section-title' }, 'All levels'));
    const all = h('div', { class: 'list fh-levels' });
    for (const L of FARMHOUSE.levels) {
      if (L.level === 1) continue;
      const done = L.level <= lv;
      const gains = farmhouseGains(L.level - 1).map(gainText).join(', ');
      all.append(h('div', { class: `list-item fh-row ${done ? 'done' : ''} ${L.level === lv + 1 ? 'next' : ''}` },
        h('div', { class: 'fh-row-lv outlined' }, `${L.level}`),
        h('div', { class: 'grow' }, h('div', { class: 'sub' }, gains),
          h('div', { class: 'sub' }, done ? 'Done' : `Player level ${L.playerLevel} · ${fmt(L.cost)} coins`)),
        done ? icon('check') : game.level < L.playerLevel ? icon('lock') : null));
    }
    p.body.append(all);
  };
  render();
  // refresh when the upgrade finishes or coins change while the panel is open
  const offB = game.bus.on('building:complete', ({ b }) => { if (b === fh && p.body.isConnected) render(); });
  const offL = game.bus.on('levelup', () => { if (p.body.isConnected) render(); });
  p.onClose = () => { offB(); offL(); };
  p.open();
}

ui.register('farmhouse', () => openFarmhouse());
