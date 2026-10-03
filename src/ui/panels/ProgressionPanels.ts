import gsap from 'gsap';
import { Panel } from '../Panel';
import { h, icon, button, clear, fmt, itemIcon } from '../dom';
import { ui } from '../UI';
import { ACHIEVEMENTS, ACHIEVEMENT, ACHIEVEMENT_REWARDS, LEVELS, MAX_LEVEL, REWARDS, ITEMS, COSMETICS, BUILDINGS, type EventDef } from '../../data';
import { game } from '../../systems/Game';
import { achievements, book, BOOK_PAGES, crates, daily, events, quests, unlocksAt, type CrateReward, type UnlockEntry } from '../../systems/Progression';
import { actionForStat, actionForUnlock } from '../../systems/Goals';
import { audio, haptics } from '../../systems/Audio';
import { hints, type Skill } from '../../systems/Hints';
import { eventTokenItem } from '../../systems/Farming';
import { cosmeticUnlocked, unlockText } from './CharacterPanel';
import { formatTime } from '../../systems/Timers';
import { runGoalAction } from '../GoalActions';
import { land } from '../../systems/Land';
import { CHUNK } from '../../world/Grid';

// ======================================================================== shared juice
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

let flyRaise = 0;
/** Coins / gems / XP fly from a panel element into the HUD counters. */
function flyFrom(el: Element, kind: 'coins' | 'gems' | 'xp', n: number): void {
  const r = el.getBoundingClientRect();
  if (!r.width || n <= 0) return;
  // lift the fly layer above the panel dimmer while the icons travel
  const layer = ui.feedback.floatLayer;
  layer.style.zIndex = '60';
  clearTimeout(flyRaise);
  flyRaise = window.setTimeout(() => { layer.style.zIndex = ''; }, 1600);
  const ic = kind === 'coins' ? 'coin' : kind === 'gems' ? 'gem' : 'xp';
  const count = kind === 'coins' ? Math.min(8, Math.max(3, Math.ceil(n / 40))) : kind === 'gems' ? Math.min(6, Math.max(1, n)) : 3;
  ui.feedback.fly(r.left + r.width / 2, r.top + r.height / 2, ic, kind, count, () => {
    if (kind === 'coins') ui.hud.setCoins(game.coins);
    else if (kind === 'gems') ui.hud.setGems(game.gems);
    else ui.hud.refresh();
  });
}

const CONFETTI = ['#ffc93c', '#f25f5c', '#6cc644', '#3fa9f5', '#a77bf3', '#ff9fc2'];
/** A short shower of DOM confetti over everything (removed after it lands). */
export function confetti(n = 36, colors = CONFETTI): void {
  if (!ui.root) return;
  const layer = h('div', { class: 'confetti-layer' });
  for (let i = 0; i < n; i++) {
    const c = colors[i % colors.length];
    const piece = h('i', { class: `confetti-piece ${i % 3 === 0 ? 'round' : ''}` });
    piece.style.cssText = `left:${Math.random() * 100}%;background:${c};--d:${(Math.random() * 0.5).toFixed(2)}s;--t:${(1.8 + Math.random() * 1.2).toFixed(2)}s;--dx:${Math.round((Math.random() - 0.5) * 160)}px;--rot:${Math.round(360 + Math.random() * 540)}deg`;
    layer.append(piece);
  }
  ui.root.append(layer);
  setTimeout(() => layer.remove(), 3600);
}

/** Small row of reward pills (coins / XP / gems). */
const rewardPills = (r: { coins?: number; xp?: number; gems?: number }) => h('div', { class: 'row', style: 'gap:4px;flex-wrap:wrap' },
  r.coins ? h('span', { class: 'pill', dataset: { kind: 'coins' } }, icon('coin'), fmt(r.coins)) : null,
  r.xp ? h('span', { class: 'pill', dataset: { kind: 'xp' } }, icon('xp'), fmt(r.xp)) : null,
  r.gems ? h('span', { class: 'pill', dataset: { kind: 'gems' } }, icon('gem'), fmt(r.gems)) : null);

/** Fly every reward pill inside `root` into the HUD. */
function flyPills(root: HTMLElement, r: { coins?: number; xp?: number; gems?: number }): void {
  root.querySelectorAll<HTMLElement>('.pill[data-kind]').forEach((p) => {
    const kind = p.dataset.kind as 'coins' | 'gems' | 'xp';
    flyFrom(p, kind, r[kind] ?? 0);
  });
}

/** Mark a tab of a panel with a little count badge. */
function tabBadge(p: Panel, id: string, n: number): void {
  const t = p.tabsEl?.querySelector<HTMLElement>(`[data-tab="${id}"]`);
  if (!t) return;
  t.querySelector('.badge-dot')?.remove();
  t.style.position = 'relative';
  if (n > 0) t.append(h('span', { class: 'badge-dot outlined' }, n > 1 ? String(n) : ''));
}

/** Scroll a panel's tab strip so the active tab is visible. */
function showActiveTab(p: Panel): void {
  const t = p.tabsEl?.querySelector<HTMLElement>('.tab.active');
  if (t && p.tabsEl) p.tabsEl.scrollLeft = Math.max(0, t.offsetLeft - (p.tabsEl.clientWidth - t.offsetWidth) / 2);
}

const unlockCard = (u: UnlockEntry, locked: boolean, onTry?: () => void, tag = true) => {
  const c = h('div', { class: `card ${locked ? 'locked' : ''} ${onTry ? 'clickable' : ''}`, style: 'width:104px' },
    locked ? h('div', { class: 'lock-tag' }, `Lv ${u.level}`) : null, icon(u.icon, 'card-icon'), h('div', { class: 'card-title', style: 'font-size:13px' }, u.name), h('div', { class: 'card-sub' }, u.kind),
    onTry && tag ? h('div', { class: 'try-tag outlined' }, 'Try it!') : null);
  if (onTry) c.addEventListener('click', onTry);
  return c;
};

// ======================================================================== level up
/** Unlock kinds the player already knows how to use once they have done this. */
const TRY_SKILL: Record<string, Skill | undefined> = { Crop: 'plant', Tree: 'fruit', Animal: 'feed', Recipe: 'produce', Building: 'build', Orders: 'orders', Land: 'expand' };
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
  const milestone = (def.gems ?? 0) >= 5;
  const p = new Panel({ title: milestone ? 'Big milestone!' : 'Level up!', color: 'purple', size: 'medium', icon: milestone ? 'trophy' : 'glowing_star' });
  if (milestone) p.panel.classList.add('levelup-milestone');
  const title = h('div', { class: 'levelup-title outlined' }, `Level ${level}`);
  const burst = h('div', { class: 'burst' });
  p.panel.prepend(burst);
  burst.style.top = '90px';
  const rewards = h('div', { class: 'chip-row levelup-rewards', style: 'margin:10px 0' },
    def.coins ? h('span', { class: 'pill', dataset: { kind: 'coins' } }, icon('coin'), `+${fmt(def.coins)}`) : null,
    def.gems ? h('span', { class: 'pill', dataset: { kind: 'gems' } }, icon('gem'), `+${def.gems}`) : null);
  p.body.append(title, rewards);
  const now = unlocksAt(level);
  // tapping a fresh unlock takes you straight to it
  const tryIt = (u: UnlockEntry) => {
    const a = actionForUnlock(u);
    return a ? () => { flyPills(rewards, def); runGoalAction(a, true); } : undefined;
  };
  if (now.length) {
    p.body.append(h('div', { class: 'section-title center' }, 'New for you'));
    // "Try it!" is for kinds of things that are new to the player; cards stay tappable either way
    const tryTag = (u: UnlockEntry) => hints.mode === 'all' || hints.firstTime(`try:${u.kind}`, TRY_SKILL[u.kind]);
    p.body.append(h('div', { class: 'unlock-strip' }, ...now.slice(0, 8).map((u) => unlockCard(u, false, tryIt(u), tryTag(u)))));
    if (now.length > 8) p.body.append(h('div', { class: 'muted center', style: 'margin-top:6px' }, `and ${now.length - 8} more!`));
  }
  if (level < MAX_LEVEL) {
    let lv = level + 1, next = unlocksAt(lv);
    while (!next.length && lv < MAX_LEVEL) next = unlocksAt(++lv);
    if (next.length) {
      p.body.append(h('div', { class: 'section-title center' }, `Coming at level ${lv}`));
      p.body.append(h('div', { class: 'unlock-strip' }, ...next.slice(0, 4).map((u) => unlockCard(u, true))));
    }
    p.body.append(h('div', { class: 'muted center', style: 'margin-top:10px' }, `Level ${level + 1} needs ${fmt(game.xpToNext(level))} XP`));
  } else p.body.append(h('div', { class: 'muted center', style: 'margin-top:10px' }, 'You reached the top level. Amazing farming!'));
  p.footer.append(button('Awesome!', () => { flyPills(rewards, def); p.close(); }, 'yellow wide'));
  p.onClose = () => setTimeout(nextLevelUp, 200);
  p.open();
  gsap.fromTo(title, { scale: 0.2, rotate: -12 }, { scale: 1, rotate: 0, duration: 0.8, ease: 'elastic.out(1.1, 0.4)', delay: 0.1 });
  if (rewards.children.length) gsap.fromTo(rewards.children, { scale: 0 }, { scale: 1, duration: 0.35, ease: 'back.out(3)', delay: 0.4, stagger: 0.1 });
  p.body.querySelectorAll('.unlock-strip .card').forEach((c, i) => gsap.fromTo(c, { y: 30, opacity: 0, scale: 0.6 }, { y: 0, opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(2)', delay: 0.35 + i * 0.07 }));
  confetti(milestone ? 60 : 36, milestone ? ['#ffc93c', '#ffe066', '#fff3c4', '#f2b33a', '#a77bf3'] : CONFETTI);
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
    const isNext = lv === game.level + 1;
    const row = h('div', { class: `list-item ${isNext ? 'path-next' : ''}`, style: `align-items:flex-start;${locked ? '' : 'background:#e8f8dc'}` },
      h('div', { class: 'level-badge', style: 'width:46px;height:46px;flex:0 0 46px;font-size:20px' }, h('span', { class: 'outlined' }, String(lv))),
      h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' }, ...un.map((u) => {
        const c = h('div', { class: `card ${locked ? 'locked' : ''}`, style: 'width:86px;padding:4px' }, icon(u.icon, 'card-icon'), h('div', { class: 'card-sub', style: 'font-size:11px' }, u.name));
        (c.firstChild as HTMLElement).style.cssText = 'width:44px;height:44px';
        return c;
      })),
      isNext ? h('div', { class: 'path-tag outlined' }, 'Next!') : !locked ? icon('check', 'icon path-check') : null);
    if (isNext) current = row;
    list.append(row);
  }
  const need = game.xpToNext();
  const pct = game.level >= MAX_LEVEL ? 100 : Math.min(100, (game.state.player.xp / Math.max(1, need)) * 100);
  p.body.append(h('div', { class: 'list-item', style: 'margin-bottom:10px' },
    h('div', { class: 'level-badge', style: 'width:52px;height:52px;flex:0 0 52px;font-size:24px' }, h('span', { class: 'outlined' }, String(game.level))),
    h('div', { class: 'grow' },
      h('div', { class: 'title' }, game.level < MAX_LEVEL ? `${fmt(need - game.state.player.xp)} XP to level ${game.level + 1}` : 'Max level!'),
      h('div', { class: 'progress', style: 'margin-top:4px' }, h('div', { class: 'fill', style: `width:${pct}%` }), h('div', { class: 'label' }, game.level < MAX_LEVEL ? `${fmt(game.state.player.xp)}/${fmt(need)}` : 'MAX')),
      h('div', { class: 'sub', style: 'margin-top:2px' }, 'Earn XP by harvesting, delivering orders and finishing quests.'))), list);
  p.open();
  if (current) setTimeout(() => current!.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350);
}

// ======================================================================== achievements
const CATS = ['farming', 'animals', 'production', 'building', 'decorating', 'economy', 'collection', 'hidden'];
const CAT_ICON: Record<string, string> = { farming: 'wheat', animals: 'cow', production: 'bread', building: 'hammer', decorating: 'sparkles', economy: 'coin', collection: 'books', hidden: 'eye' };
const TIER_NAME = ['Bronze', 'Silver', 'Gold'];
const TIER_ICON = ['medal3', 'medal2', 'medal1'];

function achievementProgress(a: typeof ACHIEVEMENTS[number]): { tier: number; pct: number; v: number; target: number } {
  const tier = achievements.tier(a.id);
  const v = game.stat(a.stat);
  const target = a.tiers[Math.min(2, tier)];
  const prev = tier > 0 ? a.tiers[tier - 1] : 0;
  const pct = tier >= 3 ? 100 : Math.max(0, Math.min(100, ((v - (a.gauge ? 0 : prev)) / Math.max(1, target - (a.gauge ? 0 : prev))) * 100));
  return { tier, pct, v, target };
}

export function openAchievements(cat?: string): void {
  const p = new Panel({ title: 'Awards', icon: 'trophy', color: 'orange', tabs: CATS.map((c) => ({ id: c, label: c[0].toUpperCase() + c.slice(1), icon: CAT_ICON[c] })) });
  // tabs with an award that is nearly done get a dot, so there is always something to chase
  for (const c of CATS) tabBadge(p, c, ACHIEVEMENTS.filter((a) => a.category === c && !(a.hidden && achievements.tier(a.id) === 0) && (() => { const s = achievementProgress(a); return s.tier < 3 && s.pct >= 75; })()).length);
  if (cat && CATS.includes(cat)) p.tab = cat;
  p.onTab = (cat) => {
    clear(p.body);
    const counts = [0, 0, 0];
    for (const a of ACHIEVEMENTS) for (let t = 0; t < achievements.tier(a.id); t++) counts[t]++;
    const earned = counts[0] + counts[1] + counts[2];
    p.body.append(h('div', { class: 'row between', style: 'margin-bottom:8px;gap:8px;flex-wrap:wrap' },
      h('div', { class: 'row', style: 'gap:4px' }, ...counts.map((n, t) => h('span', { class: 'pill' }, icon(TIER_ICON[t]), String(n)))),
      h('div', { class: 'progress', style: 'flex:1 1 120px' }, h('div', { class: 'fill', style: `width:${(earned / (ACHIEVEMENTS.length * 3)) * 100}%` }), h('div', { class: 'label' }, `${earned}/${ACHIEVEMENTS.length * 3} medals`))));
    const list = h('div', { class: 'list' });
    for (const a of ACHIEVEMENTS.filter((x) => x.category === cat)) {
      const { tier, pct, v, target } = achievementProgress(a);
      const hidden = a.hidden && tier === 0;
      const almost = !hidden && tier < 3 && pct >= 75;
      const medals = h('div', { class: 'row', style: 'gap:2px' }, ...TIER_ICON.map((m, i) => { const im = icon(m); if (i >= tier) im.style.filter = 'grayscale(1) opacity(.35)'; return im; }));
      const next = tier < 3 && !hidden ? ACHIEVEMENT_REWARDS[tier] : null;
      list.append(h('div', { class: `list-item ${tier >= 3 ? 'award-gold' : ''}` },
        hidden ? icon('lock', 'icon big') : icon(a.icon, 'icon big'),
        h('div', { class: 'grow' },
          h('div', { class: 'title' }, hidden ? '???' : a.name, almost ? h('span', { class: 'almost-tag' }, 'Almost!') : null),
          h('div', { class: 'sub' }, hidden ? 'A secret award. Keep playing!' : tier >= 3 ? 'All medals won!' : a.desc.replace('{n}', fmt(target))),
          hidden ? null : h('div', { class: 'progress', style: 'margin-top:4px' }, h('div', { class: 'fill', style: `width:${pct}%` }), h('div', { class: 'label' }, tier >= 3 ? 'Gold!' : `${fmt(Math.min(v, target))}/${fmt(target)}`)),
          next ? h('div', { class: 'award-next' }, icon(TIER_ICON[tier], 'icon tier'), rewardPills(next)) : null),
        medals));
    }
    p.body.append(list);
  };
  p.open();
  showActiveTab(p);
}

// ======================================================================== quests
function questReset(kind: 'daily' | 'weekly'): number {
  const d = new Date(game.now());
  if (kind === 'daily') d.setHours(24, 0, 0, 0);
  else { d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); d.setHours(0, 0, 0, 0); }
  return d.getTime();
}

/** "Go" button that closes the panel and takes you where the quest can be done. */
function goButton(stat: string): HTMLElement {
  const a = actionForStat(stat);
  if (!a) return button('Claim', () => undefined, 'small disabled');
  return button('Go', () => runGoalAction(a, true), 'small blue');
}

export function openQuests(tab?: string): void {
  quests.refresh(game.now());
  const tabs = [{ id: 'daily', label: 'Daily', icon: 'sunrise' }, { id: 'weekly', label: 'Weekly', icon: 'calendar' }];
  if (events.current) tabs.push({ id: 'event', label: events.current.name, icon: events.current.icon });
  const p = new Panel({ title: 'Quests', icon: 'scroll', color: 'green', tabs });
  const badges = () => {
    const ready = (l: typeof game.state.quests.daily) => l.filter((q) => !q.claimed && quests.done(q)).length;
    tabBadge(p, 'daily', ready(game.state.quests.daily));
    tabBadge(p, 'weekly', ready(game.state.quests.weekly));
    tabBadge(p, 'event', events.claimable());
  };
  const render = (t: string) => {
    clear(p.body);
    badges();
    if (t === 'event' && events.current) { renderEvent(p, events.current, () => render(t)); return; }
    const kind = t as 'daily' | 'weekly';
    const list = kind === 'daily' ? game.state.quests.daily : game.state.quests.weekly;
    const r = quests.reward(kind);
    // bonus tracker: every quest claimed fills a pip toward the bonus crate
    const claimedN = list.filter((q) => q.claimed).length;
    const bonusDone = kind === 'daily' ? claimedN >= list.length : game.state.quests.weeklyBonusClaimed;
    p.body.append(h('div', { class: `quest-bonus ${bonusDone ? 'done' : ''}` },
      icon('gift', 'icon'),
      h('div', { class: 'grow' },
        h('div', { class: 'title' }, bonusDone ? 'Bonus crate earned!' : kind === 'daily' ? 'Finish all for a bonus crate' : 'Finish all for an epic crate'),
        h('div', { class: 'quest-pips' }, ...list.map((q) => h('i', { class: q.claimed ? 'on' : quests.done(q) ? 'ready' : '' })))),
      h('span', { class: 'timer-tag outlined' }, `New in ${formatTime(questReset(kind) - game.now())}`)));
    if (kind === 'weekly') p.body.append(h('div', { class: 'muted', style: 'margin:-2px 0 8px' }, 'Every weekly quest also gives a rare crate.'));
    const el = h('div', { class: 'list' });
    // ready-to-claim first, then in progress, then finished
    const order = list.map((q, i) => ({ q, i })).sort((a, b) => rank(a.q) - rank(b.q));
    function rank(q: typeof list[number]): number { return q.claimed ? 2 : quests.done(q) ? 0 : 1; }
    for (const { q, i } of order) {
      const prog = quests.progress(q);
      const done = quests.done(q);
      const pills = rewardPills(r);
      const row = h('div', { class: `list-item quest-row ${q.claimed ? 'claimed' : done ? 'ready' : ''}` },
        icon(q.icon, 'icon big'),
        h('div', { class: 'grow' }, h('div', { class: 'title' }, q.text),
          h('div', { class: 'progress', style: 'margin:4px 0' }, h('div', { class: 'fill', style: `width:${(prog / q.target) * 100}%` }), h('div', { class: 'label' }, done ? 'Done!' : `${fmt(prog)}/${fmt(q.target)}`)),
          pills),
        q.claimed ? icon('check', 'icon big') : done ? button('Claim', () => {
          if (!quests.claim(kind, i)) return;
          flyPills(pills, r);
          haptics.buzz(15);
          if (list.every((x) => x.claimed)) confetti(30);
          gsap.to(row, { scale: 1.04, duration: 0.12, yoyo: true, repeat: 1, onComplete: () => render(t) });
        }, 'small yellow') : goButton(q.stat));
      el.append(row);
    }
    p.body.append(el);
  };
  p.onTab = render;
  if (tab) p.tab = tab;
  p.open();
}

function renderEvent(p: Panel, e: EventDef, rerender: () => void): void {
  const st = game.state.event;
  const token = eventTokenItem(e.id);
  const left = events.timeLeft();
  p.body.append(h('div', { class: 'list-item', style: `background:${e.color}33` }, icon(e.icon, 'icon big'),
    h('div', { class: 'grow' }, h('div', { class: 'title' }, e.name), h('div', { class: 'sub' }, e.blurb),
      left ? h('span', { class: 'timer-tag outlined', style: 'display:inline-block;margin-top:4px' }, left > 86400000 ? `${Math.ceil(left / 86400000)} days left` : `Ends in ${formatTime(left)}`) : null),
    h('span', { class: 'pill' }, itemIcon(token), `${st?.tokens ?? 0}`)));
  const list = h('div', { class: 'list', style: 'margin-top:10px' });
  e.quests.forEach((q, i) => {
    const prog = Math.max(0, events.questProgress(i));
    const claimed = st?.questsClaimed.includes(i);
    const done = prog >= q.n;
    const rewards = h('div', { class: 'row', style: 'gap:4px;flex-wrap:wrap' }, q.reward.tokens ? h('span', { class: 'pill' }, itemIcon(token), `${q.reward.tokens}`) : null, q.reward.coins ? h('span', { class: 'pill', dataset: { kind: 'coins' } }, icon('coin'), `${q.reward.coins}`) : null, q.reward.gems ? h('span', { class: 'pill', dataset: { kind: 'gems' } }, icon('gem'), `${q.reward.gems}`) : null, q.reward.crate ? h('span', { class: 'pill' }, icon('gift'), q.reward.crate) : null);
    list.append(h('div', { class: `list-item quest-row ${claimed ? 'claimed' : done ? 'ready' : ''}` }, icon(e.icon, 'icon big'),
      h('div', { class: 'grow' }, h('div', { class: 'title' }, q.text.replace('{n}', String(q.n))), h('div', { class: 'progress', style: 'margin:4px 0' }, h('div', { class: 'fill', style: `width:${(prog / q.n) * 100}%` }), h('div', { class: 'label' }, done ? 'Done!' : `${prog}/${q.n}`)), rewards),
      claimed ? icon('check', 'icon big') : done ? button('Claim', () => {
        if (!events.claimQuest(i)) return;
        flyPills(rewards, { coins: q.reward.coins, gems: q.reward.gems });
        haptics.buzz(15);
        rerender();
      }, 'small yellow') : goButton(q.stat)));
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
const streakText = (n: number) => (n > 0 ? `${n} day streak` : 'Start your streak today!');
export function openDaily(): void {
  const claimable = daily.check();
  const p = new Panel({ title: 'Daily Rewards', icon: 'calendar', color: 'blue', size: 'medium', closable: !claimable });
  const idx = daily.dayIndex;
  const cal = h('div', { class: 'calendar' });
  const pillsFor = (r: ReturnType<typeof daily.rewardFor>) => [r.coins ? h('span', { class: 'pill' }, icon('coin'), fmt(r.coins)) : null, r.gems ? h('span', { class: 'pill' }, icon('gem'), String(r.gems)) : null, r.items ? h('span', { class: 'pill' }, icon('basket'), `x${r.items}`) : null, r.crate ? h('span', { class: 'pill' }, icon('gift'), r.crate) : null];
  REWARDS.daily.days.forEach((_, i) => {
    const r = daily.rewardFor(i);
    // a day is done if it was claimed earlier in this streak, or today's reward was just collected
    const claimed = i < idx || (i === idx && !claimable);
    cal.append(h('div', { class: `card ${i === 6 ? 'day7' : ''} ${i === idx && claimable ? 'today' : ''} ${claimed ? 'claimed' : ''}` },
      h('div', { class: 'card-title' }, i === 6 ? 'Day 7 - Big gift!' : `Day ${i + 1}`), h('div', { class: 'chip-row' }, ...pillsFor(r))));
  });
  const d = game.state.daily;
  const streak = h('div', { class: 'streak-row' },
    h('span', { class: 'pill streak-pill' }, icon('fire'), streakText(d.streak)),
    d.best > d.streak ? h('span', { class: 'pill' }, icon('trophy'), `Best ${d.best}`) : null);
  p.body.append(streak, h('div', { class: 'center muted', style: 'margin:6px 0 8px' }, 'Come back every day. Missing one day won\'t break your streak!'), cal);
  const tomorrow = () => {
    const nr = daily.rewardFor(daily.dayIndex);
    return h('div', { class: 'daily-next' }, h('span', { class: 'muted' }, 'Tomorrow:'), ...pillsFor(nr));
  };
  if (claimable) p.footer.append(button('Claim!', () => {
    const r = daily.claim();
    if (r) {
      const c = cal.children[idx] as HTMLElement;
      c.classList.remove('today'); c.classList.add('claimed');
      gsap.fromTo(c, { scale: 1.3 }, { scale: 1, duration: 0.5, ease: 'back.out(2)' });
      if (r.coins) flyFrom(c, 'coins', r.coins);
      if (r.gems) flyFrom(c, 'gems', r.gems);
      const rect = c.getBoundingClientRect();
      if (Object.keys(r.items).length) ui.feedback.fly(rect.left + rect.width / 2, rect.top + rect.height / 2, 'basket', 'barn', 3);
      if (r.crate || idx === 6) confetti(48);
      haptics.buzz([15, 30, 15]);
      p.footer.replaceChildren(tomorrow());
      (streak.firstChild as HTMLElement).replaceChildren(icon('fire'), streakText(game.state.daily.streak));
      gsap.fromTo(streak.firstChild, { scale: 1.4 }, { scale: 1, duration: 0.5, ease: 'back.out(3)' });
    }
    setTimeout(() => { p.close(); if (r?.crate) ui.open('crates'); }, 1500);
  }, 'yellow wide'));
  else p.footer.append(tomorrow());
  p.open();
}

// ======================================================================== crates
const RARITY_ICON: Record<string, string> = { common: 'package', rare: 'gift', epic: 'gift', legendary: 'crown' };
const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];
const cap = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;
export function openCrates(): void {
  const p = new Panel({ title: 'Mystery Crates', icon: 'gift', color: 'purple', size: 'medium' });
  const render = () => {
    clear(p.body);
    p.footer.replaceChildren();
    p.footer.style.display = 'none';
    const list = game.state.crates;
    if (!list.length) { p.body.append(h('div', { class: 'center muted', style: 'padding:30px' }, 'No crates right now. Earn them from quests, the truck and daily rewards!')); return; }
    p.body.append(h('div', { class: 'muted center', style: 'margin-bottom:8px' }, list.length > 1 ? `You have ${list.length} crates. Tap one to open it!` : 'Tap the crate to open it!'));
    const grid = h('div', { class: 'grid tight' });
    // best crates first, so the exciting ones are on top
    const sorted = list.map((r, i) => ({ r, i })).sort((a, b) => RARITY_ORDER.indexOf(b.r) - RARITY_ORDER.indexOf(a.r));
    for (const { r, i } of sorted) {
      const c = h('div', { class: `card clickable crate-card rarity-${r}`, style: 'border-color:var(--r)', onclick: () => reveal(i) }, icon(RARITY_ICON[r], 'card-icon'), h('div', { class: 'rarity-label', style: 'font-size:16px' }, cap(r)));
      grid.append(c);
    }
    p.body.append(grid);
    gsap.fromTo(grid.children, { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(2)', stagger: 0.05 });
  };
  const nextBest = () => {
    const l = game.state.crates;
    let best = 0;
    for (let k = 1; k < l.length; k++) if (RARITY_ORDER.indexOf(l[k]) > RARITY_ORDER.indexOf(l[best])) best = k;
    return best;
  };
  const reveal = (i: number) => {
    const rarity = game.state.crates.splice(i, 1)[0];
    const res = crates.open(rarity);
    const upgraded = res.rarity !== rarity;
    clear(p.body);
    // the box shows the rarity you were given; an upgrade is revealed as it bursts open
    const img = icon(RARITY_ICON[rarity], 'icon');
    const box = h('div', { class: 'crate-box' }, img);
    const rays = h('div', { class: `crate-rays rarity-${rarity}` });
    const stage = h('div', { class: 'crate-stage' }, rays, box);
    const label = h('div', { class: `center rarity-label rarity-${res.rarity}`, style: 'opacity:0' }, upgraded ? `Upgraded to ${cap(res.rarity)}!` : `${cap(res.rarity)}!`);
    const cards = h('div', { class: 'unlock-strip' });
    p.body.append(stage, label, cards);
    p.footer.replaceChildren();
    p.footer.style.display = 'none';
    audio.play('bonus');
    const tl = gsap.timeline();
    tl.fromTo(rays, { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 0.8, duration: 0.6 }, 0)
      .to(box, { rotate: -12, duration: 0.08, yoyo: true, repeat: 7, ease: 'none' }, 0)
      .to(box, { scale: 1.35, duration: 0.18, ease: 'power2.in' });
    if (upgraded) {
      tl.add(() => { rays.className = `crate-rays rarity-${res.rarity}`; img.replaceWith(icon(RARITY_ICON[res.rarity], 'icon')); audio.play('sparkle'); haptics.buzz(20); })
        .fromTo(box, { scale: 1.6 }, { scale: 1.3, duration: 0.25, ease: 'back.out(3)' })
        .to(box, { rotate: 10, duration: 0.07, yoyo: true, repeat: 5, ease: 'none' });
    }
    tl.add(() => {
      audio.play(res.rarity === 'legendary' || res.rarity === 'epic' ? 'achievement' : 'reward');
      haptics.buzz(res.rarity === 'legendary' ? [40, 40, 80] : 25);
      if (res.rarity !== 'common') ui.scene.rig.shake(0.15, 0.3);
      if (res.rarity === 'epic' || res.rarity === 'legendary') confetti(res.rarity === 'legendary' ? 60 : 36, res.rarity === 'legendary' ? ['#ffb020', '#ffe066', '#fff3c4'] : ['#a77bf3', '#d6c2ff', '#ffc93c']);
    })
      .to(box, { scale: 0.6, opacity: 0.0, duration: 0.25 })
      .to(stage, { height: 70, duration: 0.25 }, '<')
      .fromTo(label, { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(3)' })
      .add(() => {
        res.rewards.forEach((rw, k) => {
          const c = rewardCard(rw, res.rarity);
          cards.append(c);
          gsap.fromTo(c, { rotateY: 90, scale: 0.6 }, { rotateY: 0, scale: 1, duration: 0.45, ease: 'back.out(2)', delay: k * 0.18, onStart: () => audio.play('pop', { volume: 0.6 }) });
        });
        const more = game.state.crates.length;
        const collect = () => {
          cards.querySelectorAll<HTMLElement>('.card').forEach((c, k) => {
            const rw = res.rewards[k];
            if (rw.type === 'coins' || rw.type === 'gems') flyFrom(c, rw.type, rw.amount);
          });
        };
        p.footer.replaceChildren(button('Nice!', () => { collect(); if (more) render(); else p.close(); }, 'yellow'));
        if (more) p.footer.prepend(button(`Open next (${more})`, () => { collect(); reveal(nextBest()); }, 'purple'));
        p.footer.style.display = '';
        gsap.fromTo(p.footer, { opacity: 0 }, { opacity: 1, duration: 0.3, delay: res.rewards.length * 0.18 });
      });
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
let bookKeys: Set<string> | null = null;
const inBook = (key: string) => (bookKeys ??= new Set(book.entries().map((e) => e.key))).has(key);

/** How many book entries were found since the book was last opened. */
export function newDiscoveries(): number {
  const since = game.state.seen.collectionSeenAt ?? 0;
  let n = 0;
  for (const k in game.state.collection) if (game.state.collection[k] > since && inBook(k)) n++;
  return n;
}

export function openCollection(tab?: string): void {
  const groups = [...BOOK_PAGES];
  const p = new Panel({ title: 'Collection Book', icon: 'books', color: 'purple', tabs: groups.map((g) => ({ id: g, label: g })) });
  const all = book.entries();
  const since = game.state.seen.collectionSeenAt ?? 0;
  const isNew = (key: string) => (game.state.collection[key] ?? 0) > since;
  const badges = () => { for (const g of groups) tabBadge(p, g, all.filter((e) => e.group === g && isNew(e.key)).length + (book.claimable(g) ? 1 : 0)); };
  badges();
  const totalFound = all.filter((e) => game.state.collection[e.key]).length;
  const render = (g: string) => {
    clear(p.body);
    const list = all.filter((e) => e.group === g);
    const { found, total } = book.progress(g);
    p.body.append(h('div', { class: 'row between', style: 'margin-bottom:8px;gap:8px' },
      h('div', { class: 'muted' }, `Book: ${totalFound}/${all.length}`),
      h('div', { class: 'progress', style: 'flex:1 1 50%' }, h('div', { class: 'fill', style: `width:${(found / Math.max(1, total)) * 100}%` }), h('div', { class: 'label' }, found >= total ? 'Complete!' : `${found}/${total} found`))));
    // page reward: always visible, so there is a reason to fill the page
    const r = book.reward(g);
    const claimed = book.claimed(g), ready = book.claimable(g);
    const pills = h('div', { class: 'row', style: 'gap:4px;flex-wrap:wrap' },
      r.gems ? h('span', { class: 'pill', dataset: { kind: 'gems' } }, icon('gem'), String(r.gems)) : null,
      r.crate ? h('span', { class: 'pill' }, icon('gift'), `${cap(r.crate)} crate`) : null);
    const banner = h('div', { class: `quest-bonus book-reward ${claimed ? 'done' : ready ? 'ready' : ''}` },
      icon(claimed ? 'check' : 'gift', 'icon'),
      h('div', { class: 'grow' },
        h('div', { class: 'title' }, claimed ? 'Page complete - reward collected!' : ready ? 'Page complete!' : `Fill this page for a reward (${total - found} to go)`),
        claimed ? null : pills),
      ready ? button('Claim', () => {
        const got = book.claim(g);
        if (!got) return;
        flyPills(pills, { gems: got.gems });
        confetti(40);
        haptics.buzz([15, 30, 15]);
        badges();
        ui.hud.setBadge('collection', collectionBadge());
        gsap.to(banner, { scale: 1.05, duration: 0.12, yoyo: true, repeat: 1, onComplete: () => render(g) });
      }, 'small yellow') : null);
    p.body.append(banner);
    const grid = h('div', { class: 'grid tight' });
    for (const e of list) {
      const seen = !!game.state.collection[e.key];
      grid.append(h('div', { class: `card ${seen ? '' : 'locked'}` },
        seen && isNew(e.key) ? h('div', { class: 'new-tag outlined' }, 'New!') : null,
        icon(e.icon, 'card-icon'), h('div', { class: 'card-sub' }, seen ? e.name : '???'),
        seen && e.kind === 'item' ? h('div', { class: 'card-sub', style: 'font-size:11px' }, `sells ${ITEMS[e.id].sell}`) : null));
    }
    p.body.append(grid);
    const tags = grid.querySelectorAll('.new-tag');
    if (tags.length) gsap.fromTo(tags, { scale: 0 }, { scale: 1, duration: 0.4, ease: 'back.out(3)', stagger: 0.05, delay: 0.2 });
  };
  p.onTab = render;
  // open on the page with a reward waiting, else the one with something new
  const start = tab && groups.includes(tab as typeof groups[number]) ? tab
    : groups.find((g) => book.claimable(g)) ?? groups.find((g) => all.some((e) => e.group === g && isNew(e.key)));
  if (start) p.tab = start;
  // everything is "seen" once the book has been opened
  p.onClose = () => { game.state.seen.collectionSeenAt = game.now(); ui.hud.setBadge('collection', collectionBadge()); };
  p.open();
  showActiveTab(p);
}

/** HUD badge for the book: fresh discoveries plus pages with a reward to claim. */
export function collectionBadge(): number { return newDiscoveries() + book.claimableCount(); }

// ======================================================================== hooks
ui.register('achievements', (t) => openAchievements(t as string | undefined));
ui.register('quests', (t) => openQuests(t as string | undefined));
ui.register('daily', () => openDaily());
ui.register('crates', () => openCrates());
ui.register('collection', (t) => openCollection(t as string | undefined));
ui.register('unlocks', () => openUnlockTree());
ui.register('event', () => openQuests('event'));

/** Make the toast that was just shown tappable (opens the matching panel). */
function tapLastToast(fn: () => void): void {
  const el = ui.feedback.toastStack.lastElementChild as HTMLElement | null;
  if (!el) return;
  el.classList.add('tappable');
  el.addEventListener('click', fn, { once: true });
}

game.bus.on('achievement', ({ id, tier }) => {
  const a = ACHIEVEMENT[id];
  const r = ACHIEVEMENT_REWARDS[tier - 1];
  ui.feedback.toast(`${TIER_NAME[tier - 1]} medal: ${a.name}`, `+${plural(r.coins, 'coin')}, +${plural(r.gems, 'gem')}, +${r.xp} XP`, TIER_ICON[tier - 1], ['bronze', 'silver', 'gold'][tier - 1]);
  tapLastToast(() => openAchievements(a.category));
  ui.feedback.bump(ui.hud.buttons.achievements);
  if (tier === 3) confetti(40, ['#ffc93c', '#ffe066', '#fff3c4']);
  audio.play('achievement', { volume: 0.8 });
  haptics.buzz([20, 40, 20]);
});
game.bus.on('quest:completed', ({ text }) => {
  ui.feedback.toast('Quest complete!', `${text} - tap to claim`, 'scroll', 'gold');
  tapLastToast(() => ui.open('quests'));
  ui.feedback.bump(ui.hud.buttons.quests);
  audio.play('quest');
});
game.bus.on('crate:granted', ({ rarity }) => {
  ui.feedback.toast(`${cap(rarity)} crate!`, 'Tap to open it', RARITY_ICON[rarity] ?? 'gift');
  // don't stack a second crate panel on top of the one that is open
  tapLastToast(() => { if (!document.querySelector('.crate-stage, .crate-card')) ui.open('crates'); });
});

/** Collection "new entry" notes; wired once the farm is on screen so boot-time syncing stays quiet. */
export function wireProgressionNotes(): void {
  // new land: a little party, then point at the wild spots waiting there
  game.bus.on('land:expanded', ({ chunk }) => {
    confetti(44, ['#7cd65a', '#b4f28a', '#ffc93c', '#fff3c4', '#8fd3ff']);
    const [cx, cz] = chunk.split(',').map(Number);
    const wild = game.state.obstacles.filter((o) => Math.floor(o.x / CHUNK) === cx && Math.floor(o.z / CHUNK) === cz);
    setTimeout(() => {
      const next = land.nextExpansion();
      if (wild.length) {
        const easiest = wild.reduce((a, b) => (land.obstacleDef(b).clearCost < land.obstacleDef(a).clearCost ? b : a));
        ui.feedback.toast(`${wild.length} wild spots to clear`, hints.coach('clear') ? 'Each one hides a little treasure. Tap to start!' : 'Tap to start', land.obstacleDef(easiest).icon);
        tapLastToast(() => runGoalAction({ obstacle: easiest.id }, true));
      }
      if (land.purchasableChunks().length) ui.feedback.toast('More land later', game.level >= next.level ? `Next plot: ${fmt(next.cost)} coins` : `Next plot opens at level ${next.level}`, 'map');
    }, 1800);
  });

  let pending: { name: string; icon: string; group: string }[] = [];
  let timer = 0;
  game.bus.on('collection:new', ({ id, kind }) => {
    if (!inBook(`${kind}:${id}`) || !game.state.tutorial.done) return;
    const e = book.entries().find((x) => x.key === `${kind}:${id}`);
    if (!e) return;
    pending.push({ name: e.name, icon: e.icon, group: e.group });
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      const list = pending;
      pending = [];
      if (list.length === 1) ui.feedback.toast('New in your Book!', list[0].name, list[0].icon);
      else ui.feedback.toast(`${list.length} new Book entries!`, list.map((x) => x.name).slice(0, 3).join(', ') + (list.length > 3 ? '...' : ''), 'books');
      tapLastToast(() => ui.open('collection'));
      for (const page of new Set(list.map((x) => x.group))) {
        if (!book.claimable(page)) continue;
        ui.feedback.toast(`${page} page complete!`, 'Tap to claim your Book reward', 'books', 'gold');
        tapLastToast(() => ui.open('collection', page));
        confetti(30);
      }
      ui.feedback.bump(ui.hud.buttons.collection);
      audio.play('sparkle', { volume: 0.6 });
    }, 700);
  });
}
