import gsap from 'gsap';
import { Panel } from '../Panel';
import { h, icon, button, clear, fmt, itemIcon } from '../dom';
import { ui } from '../UI';
import { ACHIEVEMENTS, ACHIEVEMENT, ACHIEVEMENT_REWARDS, LEVELS, MAX_LEVEL, REWARDS, ITEMS, COSMETICS, BUILDINGS, type EventDef } from '../../data';
import { game } from '../../systems/Game';
import { achievements, collectionEntries, crates, daily, events, quests, unlocksAt, type CrateReward, type UnlockEntry } from '../../systems/Progression';
import { audio, haptics } from '../../systems/Audio';
import { eventTokenItem } from '../../systems/Farming';
import { cosmeticUnlocked, unlockText } from './CharacterPanel';
import { formatTime } from '../../systems/Timers';

const unlockCard = (u: UnlockEntry, locked: boolean) => h('div', { class: `card ${locked ? 'locked' : ''}`, style: 'width:104px' },
  locked ? h('div', { class: 'lock-tag' }, `Lv ${u.level}`) : null, icon(u.icon, 'card-icon'), h('div', { class: 'card-title', style: 'font-size:13px' }, u.name), h('div', { class: 'card-sub' }, u.kind));

// ======================================================================== level up
const levelQueue: number[] = [];
let showingLevel = false;
export function showLevelUp(level: number): void {
  levelQueue.push(level);
  if (!showingLevel) nextLevelUp();
}
function nextLevelUp(): void {
  const level = levelQueue.shift();
  if (level === undefined) { showingLevel = false; return; }
  showingLevel = true;
  const def = LEVELS[level - 1];
  const p = new Panel({ title: 'Level up!', color: 'purple', size: 'medium', icon: 'glowing_star' });
  const title = h('div', { class: 'levelup-title outlined' }, `Level ${level}`);
  const burst = h('div', { class: 'burst' });
  p.panel.prepend(burst);
  burst.style.top = '90px';
  p.body.append(title, h('div', { class: 'chip-row', style: 'margin:10px 0' },
    def.coins ? h('span', { class: 'pill' }, icon('coin'), `+${fmt(def.coins)}`) : null, def.gems ? h('span', { class: 'pill' }, icon('gem'), `+${def.gems}`) : null));
  const now = unlocksAt(level);
  if (now.length) {
    p.body.append(h('div', { class: 'section-title center' }, 'New for you'));
    p.body.append(h('div', { class: 'unlock-strip' }, ...now.slice(0, 8).map((u) => unlockCard(u, false))));
  }
  if (level < MAX_LEVEL) {
    let lv = level + 1, next = unlocksAt(lv);
    while (!next.length && lv < MAX_LEVEL) next = unlocksAt(++lv);
    if (next.length) {
      p.body.append(h('div', { class: 'section-title center' }, `Coming at level ${lv}`));
      p.body.append(h('div', { class: 'unlock-strip' }, ...next.slice(0, 4).map((u) => unlockCard(u, true))));
    }
  }
  p.footer.append(button('Awesome!', () => p.close(), 'yellow wide'));
  p.onClose = () => setTimeout(nextLevelUp, 200);
  p.open();
  gsap.fromTo(title, { scale: 0.2, rotate: -12 }, { scale: 1, rotate: 0, duration: 0.8, ease: 'elastic.out(1.1, 0.4)', delay: 0.1 });
  p.body.querySelectorAll('.unlock-strip .card').forEach((c, i) => gsap.fromTo(c, { y: 30, opacity: 0, scale: 0.6 }, { y: 0, opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(2)', delay: 0.35 + i * 0.07 }));
  audio.play('levelup');
  haptics.buzz([30, 50, 30, 50, 60]);
}

// ======================================================================== unlock tree
export function openUnlockTree(): void {
  const p = new Panel({ title: 'Unlock Path', icon: 'map', color: 'purple' });
  const list = h('div', { class: 'list' });
  let current: HTMLElement | null = null;
  for (let lv = 2; lv <= MAX_LEVEL; lv++) {
    const un = unlocksAt(lv);
    if (!un.length) continue;
    const locked = lv > game.level;
    const row = h('div', { class: 'list-item', style: `align-items:flex-start;${locked ? '' : 'background:#e8f8dc'}` },
      h('div', { class: 'level-badge', style: 'width:46px;height:46px;flex:0 0 46px;font-size:20px' }, h('span', { class: 'outlined' }, String(lv))),
      h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' }, ...un.map((u) => {
        const c = h('div', { class: `card ${locked ? 'locked' : ''}`, style: 'width:86px;padding:4px' }, icon(u.icon, 'card-icon'), h('div', { class: 'card-sub', style: 'font-size:11px' }, u.name));
        (c.firstChild as HTMLElement).style.cssText = 'width:44px;height:44px';
        return c;
      })));
    if (lv === game.level + 1) current = row;
    list.append(row);
  }
  p.body.append(h('div', { class: 'muted center', style: 'margin-bottom:8px' }, `You are level ${game.level}. ${game.level < MAX_LEVEL ? `${fmt(game.xpToNext() - game.state.player.xp)} XP to go!` : 'Max level!'}`), list);
  p.open();
  if (current) setTimeout(() => current!.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350);
}

// ======================================================================== achievements
const CATS = ['farming', 'animals', 'production', 'building', 'decorating', 'economy', 'collection', 'hidden'];
const CAT_ICON: Record<string, string> = { farming: 'wheat', animals: 'cow', production: 'bread', building: 'hammer', decorating: 'sparkles', economy: 'coin', collection: 'books', hidden: 'eye' };
export function openAchievements(): void {
  const p = new Panel({ title: 'Awards', icon: 'trophy', color: 'orange', tabs: CATS.map((c) => ({ id: c, label: c[0].toUpperCase() + c.slice(1), icon: CAT_ICON[c] })) });
  p.onTab = (cat) => {
    clear(p.body);
    const earned = Object.values(game.state.achievements).reduce((s, t) => s + t, 0);
    p.body.append(h('div', { class: 'muted', style: 'margin-bottom:8px' }, `${earned}/${ACHIEVEMENTS.length * 3} medals earned`));
    const list = h('div', { class: 'list' });
    for (const a of ACHIEVEMENTS.filter((x) => x.category === cat)) {
      const tier = achievements.tier(a.id);
      const hidden = a.hidden && tier === 0;
      const v = game.stat(a.stat);
      const target = a.tiers[Math.min(2, tier)];
      const prev = tier > 0 ? a.tiers[tier - 1] : 0;
      const pct = tier >= 3 ? 100 : Math.max(0, Math.min(100, ((v - (a.gauge ? 0 : prev)) / Math.max(1, target - (a.gauge ? 0 : prev))) * 100));
      const medals = h('div', { class: 'row', style: 'gap:2px' }, ...['medal3', 'medal2', 'medal1'].map((m, i) => { const im = icon(m); if (i >= tier) im.style.filter = 'grayscale(1) opacity(.35)'; return im; }));
      list.append(h('div', { class: 'list-item' },
        hidden ? icon('lock', 'icon big') : icon(a.icon, 'icon big'),
        h('div', { class: 'grow' },
          h('div', { class: 'title' }, hidden ? '???' : a.name),
          h('div', { class: 'sub' }, hidden ? 'A secret award. Keep playing!' : tier >= 3 ? 'Complete!' : a.desc.replace('{n}', fmt(target))),
          hidden ? null : h('div', { class: 'progress', style: 'margin-top:4px' }, h('div', { class: 'fill', style: `width:${pct}%` }), h('div', { class: 'label' }, tier >= 3 ? 'Gold!' : `${fmt(Math.min(v, target))}/${fmt(target)}`))),
        medals));
    }
    p.body.append(list);
  };
  p.open();
}

// ======================================================================== quests
export function openQuests(tab?: string): void {
  quests.refresh(game.now());
  const tabs = [{ id: 'daily', label: 'Daily', icon: 'sunrise' }, { id: 'weekly', label: 'Weekly', icon: 'calendar' }];
  if (events.current) tabs.push({ id: 'event', label: events.current.name, icon: events.current.icon });
  const p = new Panel({ title: 'Quests', icon: 'scroll', color: 'green', tabs });
  const render = (t: string) => {
    clear(p.body);
    if (t === 'event' && events.current) { renderEvent(p, events.current, () => render(t)); return; }
    const kind = t as 'daily' | 'weekly';
    const list = kind === 'daily' ? game.state.quests.daily : game.state.quests.weekly;
    const r = quests.reward(kind);
    const reset = kind === 'daily' ? (() => { const d = new Date(game.now()); d.setHours(24, 0, 0, 0); return d.getTime(); })() : (() => { const d = new Date(game.now()); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); d.setHours(0, 0, 0, 0); return d.getTime(); })();
    p.body.append(h('div', { class: 'row between', style: 'margin-bottom:8px' }, h('div', { class: 'muted' }, kind === 'daily' ? 'Finish all three for a mystery crate!' : 'Each weekly quest gives a rare crate. All five: an epic crate!'), h('span', { class: 'timer-tag outlined' }, `New in ${formatTime(reset - game.now())}`)));
    const el = h('div', { class: 'list' });
    list.forEach((q, i) => {
      const prog = quests.progress(q);
      const done = quests.done(q);
      el.append(h('div', { class: `list-item ${q.claimed ? '' : ''}`, style: q.claimed ? 'opacity:.6' : done ? 'background:#e8f8dc' : '' },
        icon(q.icon, 'icon big'),
        h('div', { class: 'grow' }, h('div', { class: 'title' }, q.text),
          h('div', { class: 'progress', style: 'margin:4px 0' }, h('div', { class: 'fill', style: `width:${(prog / q.target) * 100}%` }), h('div', { class: 'label' }, `${prog}/${q.target}`)),
          h('div', { class: 'row', style: 'gap:4px' }, h('span', { class: 'pill' }, icon('coin'), fmt(r.coins)), h('span', { class: 'pill' }, icon('xp'), `${r.xp}`), r.gems ? h('span', { class: 'pill' }, icon('gem'), `${r.gems}`) : null)),
        q.claimed ? icon('check', 'icon big') : button('Claim', () => { if (quests.claim(kind, i)) { ui.effects.sparkle(ui.scene.rig.target.clone().setY(1), '#ffe066', 16); haptics.buzz(15); render(t); } }, `small ${done ? 'yellow' : 'disabled'}`)));
    });
    p.body.append(el);
  };
  p.onTab = render;
  if (tab) p.tab = tab;
  p.open();
}

function renderEvent(p: Panel, e: EventDef, rerender: () => void): void {
  const st = game.state.event;
  const token = eventTokenItem(e.id);
  p.body.append(h('div', { class: 'list-item', style: `background:${e.color}33` }, icon(e.icon, 'icon big'), h('div', { class: 'grow' }, h('div', { class: 'title' }, e.name), h('div', { class: 'sub' }, e.blurb)), h('span', { class: 'pill' }, itemIcon(token), `${st?.tokens ?? 0}`)));
  const list = h('div', { class: 'list', style: 'margin-top:10px' });
  e.quests.forEach((q, i) => {
    const prog = events.questProgress(i);
    const claimed = st?.questsClaimed.includes(i);
    const rewards = h('div', { class: 'row', style: 'gap:4px' }, q.reward.tokens ? h('span', { class: 'pill' }, itemIcon(token), `${q.reward.tokens}`) : null, q.reward.coins ? h('span', { class: 'pill' }, icon('coin'), `${q.reward.coins}`) : null, q.reward.gems ? h('span', { class: 'pill' }, icon('gem'), `${q.reward.gems}`) : null, q.reward.crate ? h('span', { class: 'pill' }, icon('gift'), q.reward.crate) : null);
    list.append(h('div', { class: 'list-item', style: claimed ? 'opacity:.6' : '' }, icon(e.icon, 'icon big'),
      h('div', { class: 'grow' }, h('div', { class: 'title' }, q.text.replace('{n}', String(q.n))), h('div', { class: 'progress', style: 'margin:4px 0' }, h('div', { class: 'fill', style: `width:${(prog / q.n) * 100}%` }), h('div', { class: 'label' }, `${prog}/${q.n}`)), rewards),
      claimed ? icon('check', 'icon big') : button('Claim', () => { if (events.claimQuest(i)) rerender(); }, `small ${prog >= q.n ? 'yellow' : 'disabled'}`)));
  });
  p.body.append(list);
  // event cosmetics for tokens
  const cos = [...COSMETICS.hats, ...COSMETICS.outfitColors.map((o) => ({ id: `color:${o.color}`, name: `${o.name ?? 'Outfit'} colour`, unlock: o.unlock }))].filter((c) => c.unlock.event === e.id);
  const decor = BUILDINGS.filter((b) => b.event === e.id);
  p.body.append(h('div', { class: 'section-title' }, 'Festival shop'));
  const grid = h('div', { class: 'grid tight', style: 'grid-template-columns:repeat(auto-fill,minmax(100px,1fr))' });
  for (const c of cos) {
    const owned = cosmeticUnlocked(c.id, c.unlock);
    grid.append(h('div', { class: `card ${owned ? 'done' : 'clickable'}`, onclick: owned ? undefined : () => {
      if (!st || st.tokens < (c.unlock.cost ?? 0)) { ui.feedback.toast('Not enough tokens', unlockText(c.unlock), 'cross'); audio.play('error'); return; }
      st.tokens -= c.unlock.cost ?? 0;
      game.state.cosmetics.push(c.id);
      game.discover(c.id, 'cosmetic');
      audio.play('purchase');
      ui.feedback.toast('New style unlocked!', c.name, 'hat', 'gold');
      rerender();
    } }, icon(c.id.startsWith('color:') ? 'paint' : 'hat', 'card-icon'), h('div', { class: 'card-sub' }, c.name), h('span', { class: 'pill' }, owned ? 'Owned' : h('span', null, itemIcon(token), ` ${c.unlock.cost}`))));
  }
  for (const d of decor) grid.append(h('div', { class: 'card clickable', onclick: () => { p.close(); ui.open('shop', 'event'); } }, icon(`building:${d.id}`, 'card-icon'), h('div', { class: 'card-sub' }, d.name), h('span', { class: 'pill' }, itemIcon(token), ` ${d.eventCost}`)));
  p.body.append(grid);
}

// ======================================================================== daily calendar
export function openDaily(): void {
  const claimable = daily.check();
  const p = new Panel({ title: 'Daily Rewards', icon: 'calendar', color: 'blue', size: 'medium', closable: !claimable });
  const idx = daily.dayIndex;
  const cal = h('div', { class: 'calendar' });
  REWARDS.daily.days.forEach((_, i) => {
    const r = daily.rewardFor(i);
    const parts = [r.coins ? h('span', { class: 'pill' }, icon('coin'), fmt(r.coins)) : null, r.gems ? h('span', { class: 'pill' }, icon('gem'), String(r.gems)) : null, r.items ? h('span', { class: 'pill' }, icon('basket'), `x${r.items}`) : null, r.crate ? h('span', { class: 'pill' }, icon('gift'), r.crate) : null];
    const claimed = i < idx || (i === idx && !claimable);
    cal.append(h('div', { class: `card ${i === 6 ? 'day7' : ''} ${i === idx && claimable ? 'today' : ''} ${claimed ? 'claimed' : ''}` }, h('div', { class: 'card-title' }, `Day ${i + 1}`), h('div', { class: 'chip-row' }, ...parts)));
  });
  p.body.append(h('div', { class: 'center muted', style: 'margin-bottom:8px' }, `Login streak: ${game.state.daily.streak} day${game.state.daily.streak === 1 ? '' : 's'}. Missing one day won't break it!`), cal);
  if (claimable) p.footer.append(button('Claim!', () => {
    const r = daily.claim();
    if (r) {
      const c = cal.children[idx] as HTMLElement;
      c.classList.remove('today'); c.classList.add('claimed');
      gsap.fromTo(c, { scale: 1.3 }, { scale: 1, duration: 0.5, ease: 'back.out(2)' });
      const rect = c.getBoundingClientRect();
      if (r.coins) ui.feedback.fly(rect.left + rect.width / 2, rect.top + rect.height / 2, 'coin', 'coins', 6, () => ui.hud.setCoins(game.coins));
      if (r.gems) ui.feedback.fly(rect.left + rect.width / 2, rect.top + rect.height / 2, 'gem', 'gems', r.gems, () => ui.hud.setGems(game.gems));
      haptics.buzz([15, 30, 15]);
    }
    setTimeout(() => { p.close(); if (r?.crate) ui.open('crates'); }, 900);
  }, 'yellow wide'));
  p.open();
}

// ======================================================================== crates
const RARITY_ICON: Record<string, string> = { common: 'package', rare: 'gift', epic: 'gift', legendary: 'crown' };
export function openCrates(): void {
  const p = new Panel({ title: 'Mystery Crates', icon: 'gift', color: 'purple', size: 'medium' });
  const render = () => {
    clear(p.body);
    const list = game.state.crates;
    if (!list.length) { p.body.append(h('div', { class: 'center muted', style: 'padding:30px' }, 'No crates right now. Earn them from quests, the truck and daily rewards!')); return; }
    p.body.append(h('div', { class: 'muted center', style: 'margin-bottom:8px' }, 'Tap a crate to open it!'));
    const grid = h('div', { class: 'grid tight' });
    list.forEach((r, i) => grid.append(h('div', { class: `card clickable rarity-${r}`, style: 'border-color:var(--r)', onclick: () => reveal(i) }, icon(RARITY_ICON[r], 'card-icon'), h('div', { class: 'rarity-label', style: 'font-size:16px' }, r))));
    p.body.append(grid);
  };
  const reveal = (i: number) => {
    const rarity = game.state.crates.splice(i, 1)[0];
    const res = crates.open(rarity);
    clear(p.body);
    const box = h('div', { class: 'crate-box' }, icon(RARITY_ICON[res.rarity], 'icon'));
    const stage = h('div', { class: 'crate-stage' }, box);
    const label = h('div', { class: `center rarity-label rarity-${res.rarity}`, style: 'opacity:0' }, `${res.rarity[0].toUpperCase()}${res.rarity.slice(1)}!`);
    const cards = h('div', { class: 'unlock-strip' });
    p.body.append(stage, label, cards);
    audio.play('bonus');
    gsap.timeline()
      .to(box, { rotate: -12, duration: 0.08, yoyo: true, repeat: 7, ease: 'none' })
      .to(box, { scale: 1.35, duration: 0.18, ease: 'power2.in' })
      .add(() => {
        audio.play(res.rarity === 'legendary' || res.rarity === 'epic' ? 'achievement' : 'reward');
        haptics.buzz(res.rarity === 'legendary' ? [40, 40, 80] : 25);
        if (res.rarity !== 'common') ui.scene.rig.shake(0.15, 0.3);
        stage.style.height = '90px';
      })
      .to(box, { scale: 0.6, opacity: 0.0, duration: 0.25 })
      .to(label, { opacity: 1, duration: 0.2 })
      .add(() => {
        res.rewards.forEach((rw, k) => {
          const c = rewardCard(rw, res.rarity);
          cards.append(c);
          gsap.fromTo(c, { rotateY: 90, scale: 0.6 }, { rotateY: 0, scale: 1, duration: 0.45, ease: 'back.out(2)', delay: k * 0.18 });
        });
      });
    p.footer.replaceChildren(button('Nice!', () => { p.footer.replaceChildren(); render(); }, 'yellow'));
    p.footer.style.display = '';
  };
  render();
  p.open();
}
function rewardCard(rw: CrateReward, rarity: string): HTMLElement {
  return h('div', { class: `card rarity-${rarity} rarity-glow`, style: 'width:110px' }, icon(rw.icon, 'card-icon'),
    h('div', { class: 'card-title' }, rw.type === 'coins' || rw.type === 'gems' || rw.type === 'items' ? `${fmt(rw.amount)} ${rw.type === 'items' ? rw.name : ''}` : rw.name),
    h('div', { class: 'card-sub' }, rw.type === 'decor' ? 'Decoration (in storage)' : rw.type === 'cosmetic' ? 'New style!' : rw.name));
}

// ======================================================================== collection
export function openCollection(): void {
  const groups = ['Crops', 'Fruit', 'Animal goods', 'Goods', 'Animals', 'Styles'];
  const p = new Panel({ title: 'Collection Book', icon: 'books', color: 'purple', tabs: groups.map((g) => ({ id: g, label: g })) });
  const all = collectionEntries();
  p.onTab = (g) => {
    clear(p.body);
    const list = all.filter((e) => e.group === g);
    const found = list.filter((e) => game.state.collection[e.key]).length;
    p.body.append(h('div', { class: 'row between', style: 'margin-bottom:8px' }, h('div', { class: 'muted' }, `${found}/${list.length} discovered`), h('div', { class: 'progress', style: 'width:50%' }, h('div', { class: 'fill', style: `width:${(found / Math.max(1, list.length)) * 100}%` }))));
    const grid = h('div', { class: 'grid tight' });
    for (const e of list) {
      const seen = !!game.state.collection[e.key];
      grid.append(h('div', { class: `card ${seen ? '' : 'locked'}` }, icon(e.icon, 'card-icon'), h('div', { class: 'card-sub' }, seen ? e.name : '???'),
        seen && e.kind === 'item' ? h('div', { class: 'card-sub', style: 'font-size:11px' }, `sells ${ITEMS[e.id].sell}`) : null));
    }
    p.body.append(grid);
  };
  p.open();
}

// ======================================================================== hooks
ui.register('achievements', () => openAchievements());
ui.register('quests', (t) => openQuests(t as string | undefined));
ui.register('daily', () => openDaily());
ui.register('crates', () => openCrates());
ui.register('collection', () => openCollection());
ui.register('unlocks', () => openUnlockTree());
ui.register('event', () => openQuests('event'));

game.bus.on('achievement', ({ id, tier }) => {
  const a = ACHIEVEMENT[id];
  const r = ACHIEVEMENT_REWARDS[tier - 1];
  ui.feedback.toast(`${['Bronze', 'Silver', 'Gold'][tier - 1]}: ${a.name}`, `+${r.coins} coins, +${r.gems} gems`, ['medal3', 'medal2', 'medal1'][tier - 1], ['bronze', 'silver', 'gold'][tier - 1]);
  audio.play('achievement', { volume: 0.8 });
  haptics.buzz([20, 40, 20]);
});
game.bus.on('quest:completed', ({ text }) => {
  ui.feedback.toast('Quest complete!', text, 'scroll', 'gold');
  audio.play('quest');
});
game.bus.on('crate:granted', ({ rarity }) => ui.feedback.toast(`${rarity[0].toUpperCase()}${rarity.slice(1)} crate!`, 'Open it from the gift button', 'gift'));
void achievements;
