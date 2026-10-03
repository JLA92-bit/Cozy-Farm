import {
  ACHIEVEMENTS, ACHIEVEMENT_REWARDS, ANIMALS, BUILDINGS, COSMETICS, CROP, CROPS, EVENTS, FARMHOUSE, ITEMS, LAND, LEVEL_DATA,
  QUESTS, RECIPES, REWARDS, TREES, type EventDef, type QuestTemplate, BUILDING,
} from '../data';
import { game } from './Game';
import type { QuestState } from './State';
import { rng, hashString } from '../world/Procedural';

// ======================================================================== unlocks
export interface UnlockEntry { kind: string; id: string; name: string; icon: string; level: number }

export function unlocksAt(level: number): UnlockEntry[] {
  const out: UnlockEntry[] = [];
  for (const c of CROPS) if (c.level === level) out.push({ kind: 'Crop', id: c.id, name: c.name, icon: ITEMS[c.id].icon, level });
  for (const t of TREES) if (t.level === level) out.push({ kind: 'Tree', id: t.id, name: t.name, icon: ITEMS[t.item].icon, level });
  for (const a of ANIMALS) if (a.level === level) out.push({ kind: 'Animal', id: a.id, name: a.name, icon: `model:${a.model}`, level });
  for (const b of BUILDINGS) if (b.level === level && !b.event && b.cat !== 'farm' && b.cost > 0) out.push({ kind: b.cat === 'decor' ? 'Decor' : 'Building', id: b.id, name: b.name, icon: `building:${b.id}`, level });
  for (const r of RECIPES) if (r.level === level && r.level > BUILDING[r.building].level) out.push({ kind: 'Recipe', id: r.id, name: ITEMS[r.item].name, icon: ITEMS[r.item].icon, level });
  for (const list of [COSMETICS.hats, COSMETICS.accessories, COSMETICS.pets]) for (const c of list) if (c.unlock.level === level) out.push({ kind: 'Style', id: c.id, name: c.name, icon: c.model ? `model:${c.model}` : 'hat', level });
  for (const o of COSMETICS.outfitColors) if (o.unlock.level === level) out.push({ kind: 'Style', id: o.color, name: `${o.name ?? 'New'} outfit colour`, icon: 'paint', level });
  for (const f of FARMHOUSE.levels) if (f.playerLevel === level && f.level > 1) out.push({ kind: 'Upgrade', id: `fh${f.level}`, name: `Farmhouse level ${f.level}`, icon: 'house', level });
  const slots = (LEVEL_DATA.orderSlots as Record<string, number>)[String(level)];
  if (slots && level > 1) out.push({ kind: 'Orders', id: `slots${slots}`, name: `${slots} order slots`, icon: 'clipboard', level });
  // land expansions open up every few levels
  const e = LAND.expansion;
  for (let n = 0; n < 32; n++) if (Math.floor(e.baseLevel + n * e.levelStep) === level) { out.push({ kind: 'Land', id: `land${n}`, name: 'New land to buy', icon: 'map', level }); break; }
  return out;
}

// ======================================================================== achievements
export class AchievementSystem {
  init(): void {
    game.bus.on('stat', ({ stat }) => this.check(stat));
    for (const a of ACHIEVEMENTS) this.check(a.stat, true);
  }

  tier(id: string): number { return game.state.achievements[id] ?? 0; }

  check(stat: string, silent = false): void {
    for (const a of ACHIEVEMENTS) {
      if (a.stat !== stat) continue;
      const v = game.stat(stat);
      let t = this.tier(a.id);
      while (t < 3 && v >= a.tiers[t]) {
        t++;
        game.state.achievements[a.id] = t;
        const r = ACHIEVEMENT_REWARDS[t - 1];
        game.addCoins(r.coins);
        game.addGems(r.gems);
        game.addXp(r.xp);
        if (!silent) game.bus.emit('achievement', { id: a.id, tier: t });
      }
    }
  }
}

// ======================================================================== quests
function localDay(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function weekKey(now: number): string {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7; // monday = 0
  d.setDate(d.getDate() - day);
  return `W${localDay(d.getTime())}`;
}

export class QuestSystem {
  private notified = new Set<string>();

  init(): void {
    this.refresh(game.now());
    game.bus.on('stat', () => this.notify());
  }

  private make(tpl: QuestTemplate, r: () => number, seedLabel: string): QuestState {
    let stat = tpl.stat, text = tpl.text, icon = tpl.icon;
    if (stat.includes('{crop}')) {
      const crops = CROPS.filter((c) => c.level <= game.level && c.growSec <= 3600);
      const c = crops[Math.floor(r() * crops.length)] ?? CROP.wheat;
      stat = stat.replace('{crop}', c.id);
      text = text.replace('{cropName}', c.name);
      icon = ITEMS[c.id].icon;
    }
    const [lo, hi] = tpl.n;
    const target = Math.max(1, Math.round((lo + r() * (hi - lo)) * (1 + game.level * QUESTS.nPerLevel)));
    void seedLabel;
    return { tpl: tpl.id, text: text.replace('{n}', String(target)), stat, start: game.stat(stat), target, claimed: false, icon };
  }

  refresh(now: number): void {
    const q = game.state.quests;
    const dk = localDay(now), wk = weekKey(now);
    if (q.dailyKey !== dk) {
      const r = rng(hashString(`${game.state.seed}:${dk}`));
      const pool = QUESTS.daily.templates.filter((t) => t.level <= game.level);
      const picked: QuestState[] = [];
      const used = new Set<string>();
      while (picked.length < QUESTS.daily.count && used.size < pool.length) {
        const t = pool[Math.floor(r() * pool.length)];
        if (used.has(t.id)) continue;
        used.add(t.id);
        picked.push(this.make(t, r, dk));
      }
      q.daily = picked;
      q.dailyKey = dk;
      game.bus.emit('quests:changed', {});
    }
    if (q.weeklyKey !== wk) {
      const r = rng(hashString(`${game.state.seed}:${wk}`));
      const pool = QUESTS.weekly.templates.filter((t) => t.level <= game.level);
      const picked: QuestState[] = [];
      const used = new Set<string>();
      while (picked.length < QUESTS.weekly.count && used.size < pool.length) {
        const t = pool[Math.floor(r() * pool.length)];
        if (used.has(t.id)) continue;
        used.add(t.id);
        picked.push(this.make(t, r, wk));
      }
      q.weekly = picked;
      q.weeklyKey = wk;
      q.weeklyBonusClaimed = false;
      game.bus.emit('quests:changed', {});
    }
  }

  progress(q: QuestState): number { return Math.min(q.target, Math.max(0, game.stat(q.stat) - q.start)); }
  done(q: QuestState): boolean { return this.progress(q) >= q.target; }

  reward(kind: 'daily' | 'weekly') {
    const r = kind === 'daily' ? QUESTS.daily.reward : QUESTS.weekly.reward;
    return {
      coins: r.coinsBase + r.coinsPerLevel * game.level,
      xp: r.xpBase + r.xpPerLevel * game.level,
      gems: kind === 'weekly' ? QUESTS.weekly.reward.gems : 0,
    };
  }

  claim(kind: 'daily' | 'weekly', i: number): boolean {
    const list = kind === 'daily' ? game.state.quests.daily : game.state.quests.weekly;
    const q = list[i];
    if (!q || q.claimed || !this.done(q)) return false;
    q.claimed = true;
    const r = this.reward(kind);
    game.addCoins(r.coins);
    game.addXp(r.xp);
    if (r.gems) game.addGems(r.gems);
    game.incStat('quests_completed');
    if (kind === 'daily') game.incStat('daily_quests_completed');
    // the last daily quest of the day and every weekly quest give a crate
    const crate = kind === 'daily' ? (list.every((x) => x.claimed) ? QUESTS.daily.bonusCrate : null) : QUESTS.weekly.bonusCrate;
    if (crate) { game.state.crates.push(crate); game.bus.emit('crate:granted', { rarity: crate }); }
    if (kind === 'weekly' && list.every((x) => x.claimed) && !game.state.quests.weeklyBonusClaimed) {
      game.state.quests.weeklyBonusClaimed = true;
      game.state.crates.push(QUESTS.weekly.completeAllCrate);
      game.bus.emit('crate:granted', { rarity: QUESTS.weekly.completeAllCrate });
    }
    game.bus.emit('quests:changed', {});
    game.bus.emit('sfx', { name: 'quest' });
    return true;
  }

  claimable(): number {
    const q = game.state.quests;
    return [...q.daily, ...q.weekly].filter((x) => !x.claimed && this.done(x)).length;
  }

  private notify(): void {
    for (const [kind, list] of [['daily', game.state.quests.daily], ['weekly', game.state.quests.weekly]] as const) {
      for (const q of list) {
        const key = `${kind}:${q.tpl}:${q.start}`;
        if (!q.claimed && this.done(q) && !this.notified.has(key)) {
          this.notified.add(key);
          game.bus.emit('quest:completed', { kind, text: q.text });
        } else if (this.done(q)) this.notified.add(key);
      }
    }
  }
}

// ======================================================================== daily login calendar
export class DailySystem {
  /** Called on boot and on day change: updates streak. Returns true if a reward is claimable. */
  check(now = game.now()): boolean {
    const d = game.state.daily;
    const today = localDay(now);
    if (d.lastDay !== today) {
      if (!game.state.seen.loginDays.includes(today)) {
        game.state.seen.loginDays.push(today);
        if (game.state.seen.loginDays.length > 120) game.state.seen.loginDays.shift();
        game.incStat('login_days');
      }
      const yesterday = localDay(now - 86400000);
      const twoAgo = localDay(now - 2 * 86400000);
      const week = weekKey(now);
      if (d.lastDay === yesterday) { /* streak continues */ }
      else if (d.lastDay === twoAgo && d.protectionUsedWeek !== week && d.streak > 0) {
        // gentle streak protection: missing a single day once a week keeps your streak
        d.protectionUsedWeek = week;
        game.bus.emit('toast', { title: 'Streak saved!', sub: 'Missing one day is okay. Welcome back!', icon: 'heart' });
      } else if (d.lastDay) d.streak = 0;
      d.lastDay = today;
    }
    return d.claimedDay !== today;
  }

  get dayIndex(): number { return game.state.daily.streak % 7; }

  rewardFor(index: number): { coins: number; gems: number; items: number; crate?: string } {
    const r = REWARDS.daily.days[index] as { coins?: number; gems?: number; items?: number; crate?: string };
    return { coins: Math.round((r.coins ?? 0) * (1 + game.level * REWARDS.daily.levelScale)), gems: r.gems ?? 0, items: r.items ?? 0, crate: r.crate };
  }

  claim(): { coins: number; gems: number; items: Record<string, number>; crate?: string } | null {
    const d = game.state.daily;
    const today = localDay(game.now());
    if (d.claimedDay === today) return null;
    const r = this.rewardFor(this.dayIndex);
    const items: Record<string, number> = {};
    if (r.items) {
      const pool = CROPS.filter((c) => c.level <= game.level).map((c) => c.id);
      for (let i = 0; i < r.items; i++) { const it = pool[Math.floor(Math.random() * pool.length)]; items[it] = (items[it] ?? 0) + 1; }
    }
    if (r.coins) game.addCoins(r.coins);
    if (r.gems) game.addGems(r.gems);
    for (const [k, n] of Object.entries(items)) game.addItem(k, n);
    if (r.crate) { game.state.crates.push(r.crate); game.bus.emit('crate:granted', { rarity: r.crate }); }
    d.claimedDay = today;
    d.streak++;
    d.best = Math.max(d.best, d.streak);
    game.setGauge('best_streak', d.streak);
    game.bus.emit('sfx', { name: 'reward' });
    return { coins: r.coins, gems: r.gems, items, crate: r.crate };
  }
}

// ======================================================================== mystery crates
export interface CrateReward { type: 'coins' | 'gems' | 'items' | 'decor' | 'cosmetic'; amount: number; id?: string; name: string; icon: string }

export class CrateSystem {
  open(rarity: string): { rarity: string; rewards: CrateReward[] } {
    const C = REWARDS.crates;
    const ix = C.rarities.indexOf(rarity);
    const up = (C.upgradeChance as Record<string, number[]>)[rarity] ?? [1, 0, 0, 0];
    let x = Math.random(), final = rarity;
    for (let k = 0; k < up.length; k++) { x -= up[k]; if (x <= 0) { final = C.rarities[k]; break; } }
    if (C.rarities.indexOf(final) < ix) final = rarity;
    const n = (C.rolls as Record<string, number>)[final];
    const pool = (C.pools as Record<string, { type: string; min?: number; max?: number; w: number }[]>)[final];
    const rewards: CrateReward[] = [];
    const scale = 1 + game.level * 0.06;
    for (let i = 0; i < n; i++) {
      let w = Math.random() * pool.reduce((s, p) => s + p.w, 0);
      let pick = pool[0];
      for (const p of pool) { w -= p.w; if (w <= 0) { pick = p; break; } }
      const amt = (lo = 1, hi = 1) => lo + Math.floor(Math.random() * (hi - lo + 1));
      if (pick.type === 'coins') { const a = Math.round(amt(pick.min, pick.max) * scale); game.addCoins(a); rewards.push({ type: 'coins', amount: a, name: 'Coins', icon: 'coin' }); }
      else if (pick.type === 'gems') { const a = amt(pick.min, pick.max); game.addGems(a); rewards.push({ type: 'gems', amount: a, name: 'Gems', icon: 'gem' }); }
      else if (pick.type === 'items') {
        const pool2 = Object.values(ITEMS).filter((it) => it.cat !== 'event' && (CROP[it.id]?.level ?? 99) <= game.level || (it.cat === 'feed'));
        const it = pool2[Math.floor(Math.random() * pool2.length)];
        const a = amt(pick.min, pick.max);
        game.addItem(it.id, a);
        rewards.push({ type: 'items', amount: a, id: it.id, name: it.name, icon: it.icon });
      } else if (pick.type === 'decor') {
        const cap = final === 'legendary' ? 99 : final === 'epic' ? game.level + 15 : game.level + 6;
        const list = BUILDINGS.filter((b) => b.cat === 'decor' && !b.event && !b.path && b.level <= cap && b.cost >= (final === 'rare' ? 20 : 150));
        const d = list[Math.floor(Math.random() * list.length)];
        game.state.storage[d.id] = (game.state.storage[d.id] ?? 0) + 1;
        rewards.push({ type: 'decor', amount: 1, id: d.id, name: d.name, icon: `building:${d.id}` });
      } else {
        const order = ['rare', 'epic', 'legendary'];
        const all = [...COSMETICS.hats, ...COSMETICS.accessories, ...COSMETICS.pets].filter((c) => c.unlock.crate && order.indexOf(c.unlock.crate) <= order.indexOf(final) && !game.state.cosmetics.includes(c.id));
        if (all.length) {
          const c = all[Math.floor(Math.random() * all.length)];
          game.state.cosmetics.push(c.id);
          game.discover(c.id, 'cosmetic');
          rewards.push({ type: 'cosmetic', amount: 1, id: c.id, name: c.name, icon: c.model ? `model:${c.model}` : 'hat' });
        } else { const a = 5 * (order.indexOf(final) + 1); game.addGems(a); rewards.push({ type: 'gems', amount: a, name: 'Gems', icon: 'gem' }); }
      }
    }
    game.incStat('crates_opened');
    if (final === 'legendary') game.incStat('legendary_crates');
    return { rarity: final, rewards };
  }
}

// ======================================================================== collection book
export interface CollectionEntry { key: string; kind: string; id: string; name: string; icon: string; group: string }

export function collectionEntries(): CollectionEntry[] {
  const out: CollectionEntry[] = [];
  for (const it of Object.values(ITEMS)) {
    if (it.cat === 'event') continue;
    const group = it.cat === 'crop' ? 'Crops' : it.cat === 'fruit' ? 'Fruit' : it.cat === 'animal' ? 'Animal goods' : 'Goods';
    out.push({ key: `item:${it.id}`, kind: 'item', id: it.id, name: it.name, icon: it.icon, group });
  }
  for (const a of ANIMALS) out.push({ key: `animal:${a.id}`, kind: 'animal', id: a.id, name: a.name, icon: `model:${a.model}`, group: 'Animals' });
  for (const c of [...COSMETICS.hats, ...COSMETICS.accessories, ...COSMETICS.pets]) {
    if (c.id === 'none') continue;
    out.push({ key: `cosmetic:${c.id}`, kind: 'cosmetic', id: c.id, name: c.name, icon: c.model ? `model:${c.model}` : 'hat', group: 'Styles' });
  }
  return out;
}

/** Collection Book pages: finishing every entry on a page pays a one-off reward. */
export const BOOK_PAGES = ['Crops', 'Fruit', 'Animal goods', 'Goods', 'Animals', 'Styles'] as const;
type PageReward = { gems?: number; crate?: string };
let bookCache: CollectionEntry[] | null = null;
export const book = {
  entries(): CollectionEntry[] { return (bookCache ??= collectionEntries()); },
  reward(page: string): PageReward { return (REWARDS.collection.pages as Record<string, PageReward>)[page] ?? {}; },
  progress(page: string): { found: number; total: number } {
    let found = 0, total = 0;
    for (const e of this.entries()) if (e.group === page) { total++; if (game.state.collection[e.key]) found++; }
    return { found, total };
  },
  claimed(page: string): boolean { return game.state.seen.bookPages.includes(page); },
  claimable(page: string): boolean {
    if (this.claimed(page)) return false;
    const { found, total } = this.progress(page);
    return total > 0 && found >= total;
  },
  claimableCount(): number { let n = 0; for (const p of BOOK_PAGES) if (this.claimable(p)) n++; return n; },
  claim(page: string): PageReward | null {
    if (!this.claimable(page)) return null;
    const r = this.reward(page);
    game.state.seen.bookPages.push(page);
    if (r.gems) game.addGems(r.gems);
    if (r.crate) { game.state.crates.push(r.crate); game.bus.emit('crate:granted', { rarity: r.crate }); }
    game.bus.emit('sfx', { name: 'reward' });
    return r;
  },
};

/** Mark cosmetics that are now unlocked as discovered. */
export function syncCosmeticDiscovery(isUnlocked: (id: string, unlock: { level?: number; achievement?: string; default?: boolean }) => boolean): void {
  for (const c of [...COSMETICS.hats, ...COSMETICS.accessories, ...COSMETICS.pets]) {
    if (c.id !== 'none' && !c.unlock.default && isUnlocked(c.id, c.unlock)) game.discover(c.id, 'cosmetic');
  }
}

// ======================================================================== seasonal events
export function eventForDate(now: number): EventDef | null {
  const d = new Date(now);
  const md = (d.getMonth() + 1) * 100 + d.getDate();
  for (const e of EVENTS) {
    const [sm, sd] = e.start.split('-').map(Number), [em, ed] = e.end.split('-').map(Number);
    const s = sm * 100 + sd, en = em * 100 + ed;
    const inside = s <= en ? md >= s && md <= en : md >= s || md <= en;
    if (inside) return e;
  }
  return null;
}

export class EventSystem {
  current: EventDef | null = null;
  check(now = game.now()): void {
    const e = eventForDate(now);
    this.current = e;
    if (!e) return;
    if (game.state.event?.id !== e.id) {
      game.state.event = { id: e.id, tokens: 0, questsClaimed: [], bought: {} };
      game.state.stats.event_tokens_start = game.stat('event_tokens');
      // event quests track progress from the start of the event
      for (const q of e.quests) game.state.stats[`event_start_${q.stat}`] = game.stat(q.stat);
      game.bus.emit('toast', { title: `${e.name} is here!`, sub: 'Festival quests and treats await. Tap the Event button!', icon: e.icon, style: 'gold' });
    }
  }
  /** Event quests that are finished but not yet claimed. */
  claimable(): number {
    const e = this.current, st = game.state.event;
    if (!e || !st) return 0;
    let n = 0;
    for (let i = 0; i < e.quests.length; i++) if (!st.questsClaimed.includes(i) && this.questProgress(i) >= e.quests[i].n) n++;
    return n;
  }
  /** Milliseconds until the current event ends (end of its last day). */
  timeLeft(now = game.now()): number {
    const e = this.current;
    if (!e) return 0;
    const [em, ed] = e.end.split('-').map(Number);
    const d = new Date(now);
    let end = new Date(d.getFullYear(), em - 1, ed + 1).getTime();
    if (end <= now) end = new Date(d.getFullYear() + 1, em - 1, ed + 1).getTime();
    return end - now;
  }
  questProgress(i: number): number {
    const e = this.current;
    if (!e) return 0;
    const q = e.quests[i];
    return Math.min(q.n, game.stat(q.stat) - (game.state.stats[`event_start_${q.stat}`] ?? 0));
  }
  claimQuest(i: number): boolean {
    const e = this.current, st = game.state.event;
    if (!e || !st || st.questsClaimed.includes(i) || this.questProgress(i) < e.quests[i].n) return false;
    st.questsClaimed.push(i);
    const r = e.quests[i].reward;
    if (r.tokens) st.tokens += r.tokens;
    if (r.coins) game.addCoins(r.coins);
    if (r.gems) game.addGems(r.gems);
    if (r.crate) { game.state.crates.push(r.crate); game.bus.emit('crate:granted', { rarity: r.crate }); }
    game.bus.emit('sfx', { name: 'reward' });
    return true;
  }
}

export const achievements = new AchievementSystem();
export const quests = new QuestSystem();
export const daily = new DailySystem();
export const crates = new CrateSystem();
export const events = new EventSystem();
