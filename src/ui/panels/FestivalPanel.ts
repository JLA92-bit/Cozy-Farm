import { Panel } from '../Panel';
import { h, icon, itemIcon, clear, fmt } from '../dom';
import { ui } from '../UI';
import { BUILDING, FESTIVALS, ITEMS, VILLAGERS, type FestivalDef } from '../../data';
import { game } from '../../systems/Game';
import { festivals } from '../../systems/Festivals';
import { village } from '../../systems/Village';
import { bestQuality } from '../../systems/Quality';
import { audio, haptics } from '../../systems/Audio';
import './festival.css';

const stars = (n: number) => h('span', { class: 'fe-stars' }, ...[1, 2, 3].map((i) => h('span', { class: i <= n ? 'on' : '' }, '★')));
const DERBY_FISH = ['an old boot', 'a tiny minnow', 'a perch', 'a trout', 'a fat carp', 'a big salmon', 'a giant pike'];

/** The festival of the day: lobby, one mini-game, result and prize. */
export function openFestival(): void {
  const t = festivals.today();
  if (!t) { ui.feedback.toast('No festival today', 'Festivals fall on the last day of every season.', 'calendar'); return; }
  const def = t.def;
  const p = new Panel({ title: def.name, icon: def.icon, color: 'pink', size: 'medium', wallet: true });
  let stop: (() => void) | null = null;
  const end = () => { stop?.(); stop = null; };
  p.onClose = end;

  const lobby = () => {
    end();
    clear(p.body);
    const best = festivals.best(t.key), done = festivals.collected(t.key);
    p.body.append(h('div', { class: 'fe-lobby' },
      icon(def.icon, 'fe-hero'),
      h('div', { class: 'fe-blurb' }, def.blurb),
      h('div', { class: 'fe-rules muted' }, def.rules),
      h('div', { class: 'fe-best' }, done ? 'Prize collected: ' : best ? 'Best so far: ' : 'Not played yet', best || done ? stars(done ? festivals.doneStars(t.key) : best) : null),
      h('div', { class: 'fe-prizes' }, ...[1, 2, 3].map((i) => {
        const pr = FESTIVALS.prizes[i - 1];
        return h('div', { class: 'fe-prize' }, stars(i), h('div', null, `${fmt(pr.coins)} coins${pr.gems ? ` + ${pr.gems} gems` : ''}`),
          i >= 2 ? h('div', { class: 'muted' }, `+ ${BUILDING[def.prize.decor]?.name ?? 'a decoration'}`) : null,
          i === 3 ? h('div', { class: 'muted' }, [def.prize.item ? `+ ${def.prize.item.n} ${ITEMS[def.prize.item.id]?.name}` : '', def.prize.gems ? ` + ${def.prize.gems} more gems` : ''].join('')) : null,
          h('div', { class: 'muted' }, `Needs ${def.game === 'derby' ? `${def.stars[i - 1]} points` : def.game === 'fair' ? `${def.stars[i - 1]} points` : `${def.stars[i - 1]} ${def.game === 'eggs' ? 'eggs' : 'dishes'}`}`));
      })),
      h('div', { class: 'fe-actions' },
        ...(done ? [h('div', { class: 'muted' }, `The ${def.ribbon} is on your ribbon wall. See you at the next festival!`)] : [
          def.game === 'feast' && festivals.played(t.key) > 0 ? null : h('button', { class: 'btn green', type: 'button', onclick: () => start() }, best ? 'Try again' : 'Play'),
          best ? h('button', { class: 'btn yellow', type: 'button', onclick: () => collect() }, 'Collect prize') : null]))));
  };

  const collect = () => {
    const r = festivals.collect();
    if (!r) return;
    audio.play('reward'); haptics.buzz(20);
    ui.feedback.toast(`${def.ribbon}!`, `${fmt(r.coins)} coins${r.gems ? `, ${r.gems} gems` : ''}${r.decor ? `, ${BUILDING[r.decor].name} in your storage` : ''}`, 'ribbon');
    lobby();
  };

  const result = (score: number, line: string) => {
    end();
    const s = festivals.stars(def, score);
    const bestStars = festivals.record(s);
    clear(p.body);
    p.body.append(h('div', { class: 'fe-lobby' },
      h('div', { class: 'fe-score' }, line), stars(s),
      h('div', { class: 'muted' }, s ? `Best of the day: ${bestStars} star${bestStars === 1 ? '' : 's'}` : 'Not quite a star. Have another go!'),
      h('div', { class: 'fe-actions' },
        def.game === 'feast' ? null : h('button', { class: 'btn green', type: 'button', onclick: () => start() }, 'Try again'),
        bestStars ? h('button', { class: 'btn yellow', type: 'button', onclick: () => collect() }, 'Collect prize') : null,
        h('button', { class: 'btn', type: 'button', onclick: lobby }, 'Back'))));
    if (s) audio.play('reward');
  };

  const start = () => {
    end();
    if (def.game === 'eggs') eggs(); else if (def.game === 'derby') derby(); else if (def.game === 'fair') fair(); else feast();
  };

  // ---- Spring: Egg Hunt
  const eggs = () => {
    clear(p.body);
    const n = def.bushes ?? 20, total = def.eggs ?? 8;
    const hidden = new Set<number>();
    while (hidden.size < total) hidden.add(Math.floor(Math.random() * n));
    let found = 0, left = def.seconds ?? 40, over = false;
    const info = h('div', { class: 'fe-info' });
    const upd = () => { info.textContent = `Eggs ${found}/${total}   Time ${Math.ceil(left)}s`; };
    const grid = h('div', { class: 'fe-bushes' });
    for (let i = 0; i < n; i++) {
      const b = h('button', { class: 'fe-bush', type: 'button' }, icon('seedling'));
      b.addEventListener('click', () => {
        if (over || b.dataset.done) return;
        b.dataset.done = '1';
        b.replaceChildren(hidden.has(i) ? icon('egg') : h('span', { class: 'muted' }, '·'));
        if (hidden.has(i)) { found++; audio.play('select'); haptics.buzz(10); } else audio.play('tap');
        upd();
        if (found >= total) finish();
      });
      grid.append(b);
    }
    const finish = () => { if (over) return; over = true; result(found, `You found ${found} egg${found === 1 ? '' : 's'}!`); };
    upd();
    p.body.append(h('div', { class: 'fe-game' }, info, grid));
    const iv = window.setInterval(() => { left -= 0.1; upd(); if (left <= 0) finish(); }, 100);
    stop = () => { over = true; clearInterval(iv); };
  };

  // ---- Summer: Fishing Derby (five timed casts)
  const derby = () => {
    clear(p.body);
    const casts = def.casts ?? 5;
    let cast = 0, total = 0, over = false, raf = 0, phase = 0, last = performance.now(), locked = false;
    const info = h('div', { class: 'fe-info' });
    const zone = h('div', { class: 'fe-zone' }), marker = h('div', { class: 'fe-marker' });
    const track = h('div', { class: 'fe-track' }, zone, marker);
    const log = h('div', { class: 'fe-log' });
    const btn = h('button', { class: 'btn yellow big', type: 'button' }, 'Cast!');
    const upd = () => { info.textContent = `Cast ${Math.min(cast + 1, casts)} of ${casts}   Score ${total}`; };
    const speed = () => 0.55 + cast * 0.16;
    const loop = (now: number) => {
      if (over) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!locked) phase += dt * speed();
      const x = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
      marker.style.left = `${x * 100}%`;
      raf = requestAnimationFrame(loop);
    };
    btn.addEventListener('click', () => {
      if (over || locked) return;
      locked = true;
      const x = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
      const d = Math.abs(x - 0.5);
      const pts = d < 0.04 ? 100 : Math.round(100 * Math.pow(Math.max(0, 1 - d / 0.5), 1.3));
      total += pts; cast++;
      log.prepend(h('div', null, `Cast ${cast}: ${DERBY_FISH[Math.min(DERBY_FISH.length - 1, Math.floor(pts / 15))]} (${pts})`));
      audio.play(pts >= 70 ? 'select' : 'tap'); haptics.buzz(10);
      upd();
      window.setTimeout(() => { if (over) return; if (cast >= casts) { over = true; cancelAnimationFrame(raf); result(total, `Your catches scored ${total} points!`); } else locked = false; }, 650);
    });
    upd();
    p.body.append(h('div', { class: 'fe-game' }, info, icon('fishing_pole', 'fe-hero'), track, btn, log));
    raf = requestAnimationFrame(loop);
    stop = () => { over = true; cancelAnimationFrame(raf); };
  };

  // ---- Autumn: Harvest Fair (judged crop and good, they stay in the barn)
  const entryScore = (item: string): number => Math.min(35, Math.round(6 + 2.4 * Math.sqrt(ITEMS[item].sell))) + [0, 8, 15][bestQuality(item)];
  const fair = () => {
    clear(p.body);
    const held = (cats: string[]) => Object.keys(game.state.inventory).filter((k) => ITEMS[k] && cats.includes(ITEMS[k].cat) && game.count(k) > 0).sort((a, b) => ITEMS[b].sell - ITEMS[a].sell);
    const crops = held(['crop', 'fruit']), goods = held(['goods', 'animal']);
    if (!crops.length || !goods.length) {
      p.body.append(h('div', { class: 'fe-lobby' }, h('div', { class: 'fe-blurb' }, !crops.length ? 'You need a crop or fruit in your barn to show.' : 'You need a good (flour, jam, cheese...) in your barn to show.'),
        h('button', { class: 'btn', type: 'button', onclick: lobby }, 'Back')));
      return;
    }
    let pc = crops[0], pg = goods[0];
    const pick = (list: string[], cur: () => string, set: (v: string) => void) => {
      const row = h('div', { class: 'fe-picks' });
      const draw = () => {
        clear(row);
        for (const k of list.slice(0, 18)) {
          const q = (() => { const [, s, g] = game.qualityCounts(k); return g ? ' gold' : s ? ' silver' : ''; })();
          row.append(h('button', { class: `fe-pick${cur() === k ? ' sel' : ''}`, type: 'button', onclick: () => { set(k); audio.play('select'); draw(); upd(); } }, itemIcon(k), h('span', null, ITEMS[k].name + q)));
        }
      };
      draw();
      return row;
    };
    const total = h('div', { class: 'fe-info' });
    const upd = () => { total.textContent = `Judges would give about ${entryScore(pc) + entryScore(pg)} points`; };
    upd();
    p.body.append(h('div', { class: 'fe-game' }, h('div', { class: 'fe-h' }, 'Your best crop'), pick(crops, () => pc, (v) => { pc = v; }),
      h('div', { class: 'fe-h' }, 'Your best good'), pick(goods, () => pg, (v) => { pg = v; }), total,
      h('button', { class: 'btn yellow', type: 'button', onclick: () => {
        const sc = entryScore(pc) + entryScore(pg);
        const judge = VILLAGERS.slice(0, 3).map((v) => `${v.name}: "${sc >= def.stars[2] ? 'Magnificent!' : sc >= def.stars[1] ? 'Lovely work.' : sc >= def.stars[0] ? 'Rather nice.' : 'Hmm, bring something better next time.'}"`).join('  ');
        result(sc, `${ITEMS[pc].name} and ${ITEMS[pg].name} scored ${sc}. ${judge}`);
      } }, 'Show them!')));
  };

  // ---- Winter: Feast of Lights (dishes are eaten, villagers remember their favourites)
  const feast = () => {
    clear(p.body);
    const max = def.dishes ?? 6;
    const dishes = Object.keys(game.state.inventory).filter((k) => ITEMS[k] && ITEMS[k].cat === 'goods' && game.count(k) > 0).sort((a, b) => ITEMS[a].name.localeCompare(ITEMS[b].name));
    if (!dishes.length) { p.body.append(h('div', { class: 'fe-lobby' }, h('div', { class: 'fe-blurb' }, 'Your barn has no dishes or goods to bring. Cook or craft something first!'), h('button', { class: 'btn', type: 'button', onclick: lobby }, 'Back'))); return; }
    const chosen = new Set<string>();
    const info = h('div', { class: 'fe-info' });
    const row = h('div', { class: 'fe-picks' });
    const upd = () => { info.textContent = `On the table: ${chosen.size} of ${max}`; };
    const draw = () => {
      clear(row);
      for (const k of dishes) row.append(h('button', { class: `fe-pick${chosen.has(k) ? ' sel' : ''}`, type: 'button', onclick: () => { if (chosen.has(k)) chosen.delete(k); else if (chosen.size < max) chosen.add(k); audio.play('select'); draw(); upd(); } }, itemIcon(k), h('span', null, `${ITEMS[k].name} x${game.count(k)}`)));
    };
    draw(); upd();
    p.body.append(h('div', { class: 'fe-game' }, info, row, h('button', { class: 'btn yellow', type: 'button', onclick: () => {
      if (!chosen.size) return;
      const FP = FESTIVALS.feastPoints;
      for (const v of VILLAGERS) {
        let pts = 0;
        for (const k of chosen) { const ta = village.taste(v.id, k); pts += ta === 'love' ? FP.love : ta === 'like' ? FP.like : FP.other; }
        village.addPoints(v.id, pts, 'festival');
      }
      for (const k of chosen) game.addItem(k, -1);
      result(chosen.size, `${chosen.size} dish${chosen.size === 1 ? '' : 'es'} on the table. Every villager is delighted!`);
    } }, 'Share the feast')));
  };

  lobby();
  p.open();
}

ui.register('festival', () => openFestival());
export type { FestivalDef };
