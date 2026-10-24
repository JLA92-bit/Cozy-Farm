import { Panel } from '../Panel';
import { h, icon, button, clear, fmt } from '../dom';
import { ui } from '../UI';
import { ITEMS, MINE } from '../../data';
import { game } from '../../systems/Game';
import { mine, layerOf } from '../../systems/Mine';
import { audio } from '../../systems/Audio';
import { senderBadge } from './MailPanel';
import { itemIcon } from '../dom';
import './mine.css';

/**
 * 1.31 The Old Mine's screens: the lift (any lift floor you have reached, the top always) and Bram's forge (the next
 * pickaxe and what it takes, cracking geodes, and how deep you have been).
 */

/** The lift: pick a floor. */
export function openLift(go: (floor: number) => void): void {
  const p = new Panel({ title: 'The Lift', icon: 'lift', color: 'blue', size: 'medium' });
  const floors = mine.lifts();
  p.body.append(h('div', { class: 'mn-intro' }, icon('lift', 'mn-intro-icon'), h('div', null,
    h('div', { class: 'mn-intro-title' }, `Deepest so far: floor ${mine.deepest || 1}`),
    h('div', { class: 'mn-intro-text' }, `The lift stops every ${MINE.liftEvery} floors you have reached. ${mine.swingsLeft()} swings left in your lantern today.`))));
  let layer = '';
  const list = h('div', { class: 'mn-floors' });
  for (const f of floors) {
    const l = layerOf(f);
    if (l.id !== layer) { layer = l.id; list.append(h('div', { class: 'section-title' }, l.name)); }
    const tier = mine.needsPickaxe(f);
    const chest = MINE.chests[String(f)] && !mine.chestOpened(f);
    list.append(h('button', { class: `mn-floor mn-${l.id}${tier !== null ? ' locked' : ''}`, type: 'button', onclick: () => {
      if (tier !== null) { ui.feedback.toast('Too hard to dig', `You need the ${MINE.pickaxes[tier].name.toLowerCase()} for ${l.name}.`, 'pick', 'warn'); audio.play('error'); return; }
      p.close();
      go(f);
    } }, icon(tier !== null ? 'lock' : l.icon), h('span', { class: 'mn-floor-n' }, `Floor ${f}`), chest ? h('span', { class: 'mn-floor-tag' }, icon('coin'), 'Chest') : null));
  }
  p.body.append(list);
  p.footer.append(button('Close', () => p.close(), 'grey'));
  p.open();
}

/** Bram's forge: pickaxes and geodes. */
export function openBram(): void {
  const p = new Panel({ title: "Bram's Forge", icon: 'hammer', color: 'orange', size: 'medium', wallet: true });
  const render = () => {
    clear(p.body);
    p.body.append(h('div', { class: 'mn-intro' }, senderBadge('bram', 48), h('div', null,
      h('div', { class: 'mn-intro-title' }, mine.open ? 'Mind your head down there' : 'Help me open the old mine'),
      h('div', { class: 'mn-intro-text' }, mine.open
        ? `Bring me bars from your Smelter and I'll make you a better pickaxe. Got a geode? I'll crack it open for ${MINE.geodeCost} coins.`
        : 'The entrance needs new timbers, lamps and a good lunch for the crew. Tap the boarded mouth to see what is needed.'))));
    // the pickaxe
    const cur = MINE.pickaxes[mine.pickaxe()];
    const next = mine.nextPickaxe();
    p.body.append(h('div', { class: 'section-title' }, 'Your pickaxe'));
    p.body.append(h('div', { class: 'mn-card' }, icon('pick', 'mn-card-icon'), h('div', { class: 'grow' },
      h('div', { class: 'mn-card-name' }, cur.name), h('div', { class: 'mn-card-sub' }, cur.about))));
    if (next) {
      const lines = Object.entries(next.needs).map(([k, n]) => {
        const have = game.count(k);
        return h('div', { class: `mn-need${have >= n ? ' ok' : ''}` }, itemIcon(k), h('span', null, `${ITEMS[k].name}`), h('b', null, `${Math.min(have, n)}/${n}`));
      });
      const can = mine.canBuyPickaxe();
      p.body.append(h('div', { class: 'mn-card next' }, icon('pick', 'mn-card-icon'), h('div', { class: 'grow' },
        h('div', { class: 'mn-card-name' }, `Next: ${next.name}`), h('div', { class: 'mn-card-sub' }, next.about),
        h('div', { class: 'mn-needs' }, ...lines, h('div', { class: `mn-need${game.coins >= next.coins ? ' ok' : ''}` }, icon('coin'), h('span', null, 'Coins'), h('b', null, fmt(next.coins)))),
        button([icon('hammer'), 'Make it'], () => {
          if (!mine.buyPickaxe()) { audio.play('error'); return; }
          audio.play('build');
          ui.feedback.toast(`${MINE.pickaxes[mine.pickaxe()].name}!`, 'Bram hands it over with a grin. Rocks will break faster now.', 'pick');
          game.bus.emit('mine:changed', {});
          render();
        }, `small ${can && mine.open ? 'green' : 'disabled'}`))));
    }
    // geodes
    const n = game.count('geode');
    p.body.append(h('div', { class: 'section-title' }, 'Geodes'));
    p.body.append(h('div', { class: 'mn-card' }, itemIcon('geode', 'icon mn-card-icon'), h('div', { class: 'grow' },
      h('div', { class: 'mn-card-name' }, n ? `${n} geode${n === 1 ? '' : 's'} to crack` : 'No geodes yet'),
      h('div', { class: 'mn-card-sub' }, 'Found in the Crystal Caverns and the Ember Deeps. Each has a mineral inside: quartz, amethyst, topaz, jade, and now and then a ruby, emerald, sapphire or opal.'),
      button([icon('hammer'), `Crack one (${MINE.geodeCost} coins)`], () => {
        const r = mine.crackGeode();
        if (!r) { audio.play('error'); return; }
        audio.play('gem');
        ui.feedback.toast(`${ITEMS[r.item].name}!`, r.first ? 'A new find for your collection' : 'Out of the geode', ITEMS[r.item].icon);
        render();
      }, `small ${n && game.coins >= MINE.geodeCost && mine.open ? 'yellow' : 'disabled'}`))));
    // progress
    const done = Object.keys(MINE.chests).filter((f) => mine.chestOpened(Number(f))).length;
    p.body.append(h('div', { class: 'section-title' }, 'Down the mine'));
    p.body.append(h('div', { class: 'mn-stats' },
      h('div', null, h('b', null, String(mine.deepest)), h('span', null, 'deepest floor')),
      h('div', null, h('b', null, `${done}/${Object.keys(MINE.chests).length}`), h('span', null, 'chests opened')),
      h('div', null, h('b', null, fmt(game.stat('rocks_broken'))), h('span', null, 'rocks broken'))));
  };
  render();
  p.footer.append(button('Close', () => p.close(), 'grey'));
  p.open();
}
