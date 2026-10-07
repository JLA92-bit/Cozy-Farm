import { game } from './Game';
import { createNewGame } from './NewGame';
import { SAVE_VERSION, type SaveData, type PlacedBuilding } from './State';
import { FIRST_VERSION } from './Version';
import { visiting } from './Visiting';
import { sanitizeNotifyPrefs } from '../notify/Plan';
import { BUILDING, CROP, ITEMS, LAND, MAX_LEVEL, RECIPE, REWARDS, VILLAGER } from '../data';
import { sanitizeDecorFields } from './Decor';

const KEY = 'cozy-acres-save';
const BACKUP_KEY = 'cozy-acres-save-backup';
/**
 * The farm that was last replaced on purpose (by an import, a cloud farm, or the cloud copy the player
 * chose not to keep). Unlike the rolling backup above it is not overwritten by autosaves, so it can
 * be brought back from Settings.
 */
const REPLACED_KEY = 'cozy-acres-save-replaced';

/** A farm kept aside in the replaced-farm slot. */
export interface ReplacedFarm { data: SaveData; at: number; why: string }

/** Migrations from version N to N+1. Add one function per bump of SAVE_VERSION. */
const MIGRATIONS: Record<number, (s: Record<string, unknown>) => void> = {
  // 1: (s) => { ... upgrade v1 -> v2 ... },
};

/** Fill in any fields missing from older/partial saves with new-game defaults. */
function withDefaults(s: Partial<SaveData>): SaveData {
  const base = createNewGame(Date.now(), s.seed);
  const out = { ...base, ...s } as SaveData;
  out.player = { ...base.player, ...(s.player ?? {}) };
  out.player.look = { ...base.player.look, ...(s.player?.look ?? {}) };
  out.quests = { ...base.quests, ...(s.quests ?? {}) };
  out.daily = { ...base.daily, ...(s.daily ?? {}) };
  out.tutorial = { ...base.tutorial, ...(s.tutorial ?? {}) };
  out.seen = { ...base.seen, ...(s.seen ?? {}) };
  // older saves: treat everything already in the book as seen
  if (s.seen && s.seen.collectionSeenAt === undefined) out.seen.collectionSeenAt = Date.now() + (s.debugTimeOffset ?? 0);
  out.stall = { ...base.stall, ...(s.stall ?? {}) };
  out.merchant = { ...base.merchant, ...(s.merchant ?? {}) };
  out.orders = { ...base.orders, ...(s.orders ?? {}) };
  out.land = { ...base.land, ...(s.land ?? {}) };
  out.weeklyXp = { ...base.weeklyXp, ...(isObj(s.weeklyXp) ? s.weeklyXp : {}) };
  // saves from before versions were tracked have seen nothing new yet
  if (typeof s.lastSeenVersion !== 'string' || !/^\d+(\.\d+)*$/.test(s.lastSeenVersion)) out.lastSeenVersion = FIRST_VERSION;
  if (typeof out.weeklyXp.week !== 'string' || !Number.isFinite(out.weeklyXp.xp) || out.weeklyXp.xp < 0) out.weeklyXp = { ...base.weeklyXp };
  out.hints = { ...base.hints, ...(isObj(s.hints) ? s.hints : {}) };
  if (!['', 'all', 'new', 'off'].includes(out.hints.mode)) out.hints.mode = '';
  out.hints.intros = strArr(out.hints.intros);
  out.social = { ...base.social, ...(isObj(s.social) ? s.social : {}) };
  out.neighbours = { ...base.neighbours, ...(isObj(s.neighbours) ? s.neighbours : {}) };
  out.notify = sanitizeNotifyPrefs(s.notify);
  out.fishing = { ...base.fishing, ...(isObj(s.fishing) ? s.fishing : {}) };
  out.village = { ...base.village, ...(isObj(s.village) ? s.village : {}) };
  out.village.today = { ...base.village.today, ...(isObj(out.village.today) ? out.village.today : {}) };
  out.mail = { ...base.mail, ...(isObj(s.mail) ? s.mail : {}) };
  out.help = { ...base.help, ...(isObj(s.help) ? s.help : {}) };
  // a farm from before 1.8 gets the welcome and the head start once
  out.welcome18 = isObj(s.welcome18) ? { ...base.welcome18, ...s.welcome18 } : { step: 0, done: false, headStart: false };
  out.quality = isObj(s.quality) ? (s.quality as SaveData['quality']) : {};
  return sanitize(out, base);
}

const finite = (v: unknown, def: number, min = -Infinity): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, v) : def);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
function countMap(v: unknown, known: (k: string) => boolean): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(v)) return out;
  for (const [k, n] of Object.entries(v)) {
    const c = Math.floor(finite(n, 0, 0));
    if (c > 0 && known(k)) out[k] = c;
  }
  return out;
}

/**
 * Repair anything a hand-edited, truncated or newer/older-data save could break: unknown building
 * types or items (e.g. removed from the data files), NaN currencies, duplicate uids. Without this a
 * single bad entry crashes the boot and the player is stuck on the loading screen.
 */
export function sanitize(out: SaveData, base: SaveData): SaveData {
  const dropped: string[] = [];
  const p = out.player;
  p.level = Math.min(MAX_LEVEL, Math.max(1, Math.floor(finite(p.level, 1, 1))));
  p.xp = finite(p.xp, 0, 0);
  p.coins = Math.floor(finite(p.coins, base.player.coins, 0));
  p.gems = Math.floor(finite(p.gems, base.player.gems, 0));
  if (typeof p.name !== 'string') p.name = base.player.name;
  out.lastSeen = finite(out.lastSeen, Date.now());
  out.createdAt = finite(out.createdAt, Date.now());
  out.debugTimeOffset = finite(out.debugTimeOffset, 0);
  out.truckNextAt = finite(out.truckNextAt, 0);

  const uids = new Set<number>();
  let maxUid = 0;
  const fixed: PlacedBuilding[] = [];
  for (const b of Array.isArray(out.buildings) ? out.buildings : []) {
    if (!isObj(b) || !BUILDING[b.type] || !Number.isFinite(b.x) || !Number.isFinite(b.z)) { dropped.push(`building ${isObj(b) ? b.type : '?'}`); continue; }
    b.rot = ((Math.floor(finite(b.rot, 0)) % 4) + 4) % 4;
    b.level = Math.max(1, Math.floor(finite(b.level, 1, 1)));
    if (!Number.isInteger(b.uid) || b.uid <= 0 || uids.has(b.uid)) b.uid = 0; // reassigned below
    else uids.add(b.uid);
    if (b.plot && (!isObj(b.plot) || !CROP[b.plot.crop] || !Number.isFinite(b.plot.plantedAt) || !(b.plot.growSec > 0))) b.plot = null;
    if (b.tree && !Number.isFinite(b.tree.readyAt)) b.tree = { readyAt: 0 };
    if (b.animals) b.animals = (Array.isArray(b.animals) ? b.animals : []).filter(isObj).map((a) => ({ fedAt: Number.isFinite(a.fedAt) ? a.fedAt as number : null }));
    if (b.queue) b.queue = (Array.isArray(b.queue) ? b.queue : []).filter((e) => isObj(e) && RECIPE[e.recipe] && Number.isFinite(e.start) && Number.isFinite(e.end));
    if (b.ready) b.ready = strArr(b.ready).filter((i) => ITEMS[i]);
    sanitizeDecorFields(b);
    maxUid = Math.max(maxUid, b.uid);
    fixed.push(b);
  }
  for (const b of fixed) if (!b.uid) b.uid = ++maxUid;
  out.buildings = fixed;
  out.nextUid = Math.max(Math.floor(finite(out.nextUid, 1, 1)), maxUid + 1);

  const obstacleTypes = LAND.obstacles.types as Record<string, { models: string[] }>;
  out.obstacles = (Array.isArray(out.obstacles) ? out.obstacles : []).filter((o) => {
    const ok = isObj(o) && !!obstacleTypes[o.type] && Number.isFinite(o.x) && Number.isFinite(o.z) && Number.isFinite(o.id);
    if (ok) { const n = obstacleTypes[o.type].models.length; o.model = ((Math.floor(finite(o.model, 0)) % n) + n) % n; }
    else dropped.push('obstacle');
    return ok;
  });

  out.inventory = countMap(out.inventory, (k) => !!ITEMS[k]);
  out.storage = countMap(out.storage, (k) => !!BUILDING[k]);
  out.land.unlocked = strArr(out.land.unlocked);
  if (!out.land.unlocked.length) out.land.unlocked = [...base.land.unlocked];
  out.land.bought = Math.floor(finite(out.land.bought, 0, 0));
  out.orders.list = (Array.isArray(out.orders.list) ? out.orders.list : []).filter((o) => isObj(o) && Array.isArray(o.lines) && o.lines.length > 0 && o.lines.every((l) => isObj(l) && ITEMS[l.item] && l.qty > 0));
  out.orders.nextId = Math.max(1, Math.floor(finite(out.orders.nextId, 1)));
  if (out.truck && (!isObj(out.truck) || !Array.isArray(out.truck.crates) || !out.truck.crates.every((c) => isObj(c) && ITEMS[c.item]))) out.truck = null;
  out.stall.slots = (Array.isArray(out.stall.slots) ? out.stall.slots : []).filter(isObj).map((sl) =>
    sl.item && !ITEMS[sl.item] ? { item: null, qty: 0, price: 0, listedAt: 0, soldAt: null, buyDelay: 0 } : sl);
  const rarities = REWARDS.crates.rarities as string[];
  out.crates = strArr(out.crates).filter((c) => rarities.includes(c));
  out.cosmetics = strArr(out.cosmetics);
  out.seen.loginDays = strArr(out.seen.loginDays);
  for (const k of ['stats', 'achievements', 'collection'] as const) if (!isObj(out[k])) out[k] = { ...base[k] };
  for (const k of ['daily', 'weekly'] as const) if (!Array.isArray(out.quests[k])) { out.quests[k] = []; out.quests[`${k}Key`] = ''; }
  if (out.event && !isObj(out.event)) out.event = null;
  const so = out.social;
  so.friends = (Array.isArray(so.friends) ? so.friends : []).filter((f) => isObj(f) && typeof f.id === 'string' && typeof f.name === 'string').map((f) => ({ id: f.id, name: f.name, code: typeof f.code === 'string' ? f.code : '', addedAt: finite(f.addedAt, 0) }));
  so.sent = isObj(so.sent) ? { day: typeof so.sent.day === 'string' ? so.sent.day : '', gifts: Math.floor(finite(so.sent.gifts, 0, 0)), coins: Math.floor(finite(so.sent.coins, 0, 0)) } : { ...base.social.sent };
  so.claimedCodes = strArr(so.claimedCodes).slice(-300);
  so.madeCodes = strArr(so.madeCodes).slice(-300);
  if (typeof so.botGiftDay !== 'string') so.botGiftDay = '';
  const nb = out.neighbours;
  if (typeof nb.day !== 'string') nb.day = '';
  nb.rewarded = Math.floor(finite(nb.rewarded, 0, 0));
  nb.consoled = Math.floor(finite(nb.consoled, 0, 0));
  nb.paid = strArr(nb.paid).slice(-100);
  const fi = out.fishing;
  fi.caught = countMap(fi.caught, (k) => !!ITEMS[k] || k === 'bottle');
  fi.records = isObj(fi.records) ? Object.fromEntries(Object.entries(fi.records).filter(([k, v]) => typeof v === 'number' && Number.isFinite(v) && v > 0 && (!!ITEMS[k] || k === 'bottle'))) : {};
  if (typeof fi.freeDay !== 'string') fi.freeDay = '';
  fi.freeUsed = Math.floor(finite(fi.freeUsed, 0, 0));
  fi.casts = Math.floor(finite(fi.casts, 0, 0));
  // 1.8: friendships, quality, mail, help
  const vf: SaveData['village']['friends'] = {};
  for (const [k, f] of Object.entries(isObj(out.village.friends) ? out.village.friends : {})) {
    if (!VILLAGER[k] || !isObj(f)) continue;
    const r = f as unknown as Record<string, unknown>;
    vf[k] = {
      points: Math.min(1000, Math.floor(finite(r.points, 0, 0))),
      giftDay: typeof r.giftDay === 'string' ? r.giftDay : '',
      chatDay: typeof r.chatDay === 'string' ? r.chatDay : '',
      gifts: Math.floor(finite(r.gifts, 0, 0)),
      rewards: Array.isArray(r.rewards) ? r.rewards.filter((x): x is number => typeof x === 'number') : [],
      known: strArr(r.known).filter((x) => !!ITEMS[x]),
    };
    // villagers agent's optional fields: kept only when well formed
    if (Array.isArray(r.stories)) vf[k].stories = r.stories.filter((x): x is number => typeof x === 'number');
    for (const key of ['bdayThanks', 'weeklyDay', 'treasureWeek'] as const) if (typeof r[key] === 'string' && r[key]) vf[k][key] = r[key] as string;
  }
  out.village.friends = vf;
  if (out.village.openedDay !== undefined && typeof out.village.openedDay !== 'string') delete out.village.openedDay;
  const td = out.village.today;
  if (typeof td.day !== 'string') td.day = '';
  if (typeof td.visitor !== 'string') td.visitor = '';
  td.visitorDone = !!td.visitorDone;
  td.finds = Array.isArray(td.finds) ? td.finds.filter((f) => isObj(f) && typeof f.id === 'string' && !!ITEMS[f.item as string] && Number.isFinite(f.x) && Number.isFinite(f.z)) : [];
  const q: SaveData['quality'] = {};
  for (const [k, v] of Object.entries(out.quality)) {
    const have = out.inventory[k] ?? 0;
    if (!ITEMS[k] || !Array.isArray(v) || have <= 0) continue;
    const silver = Math.min(have, Math.floor(finite(v[0], 0, 0)));
    const gold = Math.min(have - silver, Math.floor(finite(v[1], 0, 0)));
    if (silver || gold) q[k] = [silver, gold];
  }
  out.quality = q;
  const mail = out.mail;
  mail.letters = Array.isArray(mail.letters) ? mail.letters.filter((l) => isObj(l) && typeof l.id === 'number' && typeof l.title === 'string' && typeof l.body === 'string').slice(-200) : [];
  mail.nextId = Math.max(Math.floor(finite(mail.nextId, 1, 1)), ...mail.letters.map((l) => l.id + 1));
  const hp = out.help;
  hp.auto = !!hp.auto;
  hp.reserve = Math.min(999, Math.floor(finite(hp.reserve, 20, 0)));
  hp.asked = isObj(hp.asked) ? Object.fromEntries(Object.entries(hp.asked).filter(([k, t]) => !!ITEMS[k] && typeof t === 'number' && Number.isFinite(t))) : {};
  const w = out.welcome18;
  w.step = Math.floor(finite(w.step, 0, 0));
  w.done = !!w.done;
  w.headStart = !!w.headStart;
  if (dropped.length) console.warn('save repaired, dropped:', dropped.join(', '));
  return out;
}

export function migrate(raw: Record<string, unknown>): SaveData {
  let v = Number(raw.version ?? 0);
  if (v > SAVE_VERSION) throw new Error(`Save is from a newer version (${v})`);
  while (v < SAVE_VERSION) {
    MIGRATIONS[v]?.(raw);
    v++;
    raw.version = v;
  }
  return withDefaults(raw as Partial<SaveData>);
}

export function validate(raw: unknown): raw is Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as Record<string, unknown>;
  return typeof r.version === 'number' && !!r.player && Array.isArray(r.buildings) && Array.isArray(r.obstacles);
}

/** localStorage that never throws (Safari private mode, blocked storage, quota exceeded). */
const store = {
  get(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, v: string): boolean { try { localStorage.setItem(key, v); return true; } catch { return false; } },
  remove(key: string): void { try { localStorage.removeItem(key); } catch { /* blocked */ } },
};

/** True when a backup save exists (used by the boot error screen). */
export function hasBackup(): boolean { return !!store.get(BACKUP_KEY); }
/** Swap the main save for the backup (boot error recovery). */
export function restoreBackup(): boolean {
  const b = store.get(BACKUP_KEY);
  if (!b) return false;
  const cur = store.get(KEY);
  if (!store.set(KEY, b)) return false;
  if (cur) store.set(BACKUP_KEY, cur);
  return true;
}

class SaveSystem {
  private timer = 0;
  lastSaved = 0;
  /** When set, saving is suppressed (e.g. while resetting). */
  locked = false;

  /** True when the main save could not be read and the backup was loaded instead. */
  recoveredFromBackup = false;
  private warned = false;
  private autosaveWired = false;

  /** Set once the save has been read (a boot failure after this may be caused by the save). */
  loadAttempted = false;

  load(): { data: SaveData; fresh: boolean } {
    this.loadAttempted = true;
    const tryParse = (key: string) => {
      const txt = store.get(key);
      if (!txt) return null;
      try {
        const raw = JSON.parse(txt);
        return validate(raw) ? migrate(raw) : null;
      } catch (e) { console.warn('save unreadable', key, e); return null; }
    };
    const main = tryParse(KEY);
    if (main) return { data: main, fresh: false };
    const backup = tryParse(BACKUP_KEY);
    if (backup) { this.recoveredFromBackup = !!store.get(KEY); return { data: backup, fresh: false }; }
    return { data: createNewGame(), fresh: true };
  }

  save(): boolean {
    // never while visiting a neighbour: the player's farm was saved just before the visit and stays untouched
    if (this.locked || visiting.active || !game.state) return false;
    game.state.lastSeen = game.now();
    let txt: string;
    try { txt = JSON.stringify(game.state); } catch (e) { console.error('save failed', e); return false; }
    const prev = store.get(KEY);
    // keep the previous save as a backup, but never let the backup cost us the main save
    if (prev && prev !== txt && !store.set(BACKUP_KEY, prev)) store.remove(BACKUP_KEY);
    if (store.set(KEY, txt) || (store.remove(BACKUP_KEY), store.set(KEY, txt))) {
      this.lastSaved = Date.now();
      return true;
    }
    if (!this.warned) {
      this.warned = true;
      game.bus.emit('toast', { title: 'Could not save', sub: 'Your browser storage is full or blocked. Try exporting your save in Settings.', icon: 'package', style: 'warn' });
    }
    return false;
  }

  private tabId = Math.random().toString(36).slice(2);
  /** Called when the farm is opened in another tab/window and this one stops saving. */
  onTakenOver: (() => void) | null = null;

  /**
   * One farm, one writer: tell other open tabs we are starting so they save, stop saving and step
   * aside. Waits briefly for their final save so we load the freshest farm. Without this two tabs
   * keep overwriting each other and progress made in one silently disappears.
   */
  async claimTab(): Promise<void> {
    if (typeof BroadcastChannel === 'undefined') return;
    let ch: BroadcastChannel;
    try { ch = new BroadcastChannel('cozy-acres-tabs'); } catch { return; }
    let acked: () => void = () => {};
    const ack = new Promise<void>((r) => { acked = r; });
    ch.onmessage = (e: MessageEvent) => {
      const m = e.data as { type?: string; id?: string } | null;
      if (!m || m.id === this.tabId) return;
      if (m.type === 'hello') {
        if (!this.locked) { this.save(); this.locked = true; this.onTakenOver?.(); }
        ch.postMessage({ type: 'saved', id: this.tabId });
      } else if (m.type === 'saved') acked();
    };
    ch.postMessage({ type: 'hello', id: this.tabId });
    await Promise.race([ack, new Promise((r) => setTimeout(r, 250))]);
  }

  /** Autosave every 30 s and whenever the page is hidden or closed. */
  startAutosave(intervalMs = 30000): void {
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.save(), intervalMs);
    if (this.autosaveWired) return;
    this.autosaveWired = true;
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
    window.addEventListener('pagehide', () => this.save());
    window.addEventListener('beforeunload', () => this.save());
  }

  exportFile(): void {
    this.save();
    const blob = new Blob([JSON.stringify(game.state, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = `cozy-acres-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /** Read and check a JSON save file without applying it. */
  async readFile(file: File): Promise<{ data: SaveData } | { error: string }> {
    try {
      if (file.size > 5e6) return { error: 'That file is too big to be a Cozy Acres save.' };
      const raw = JSON.parse(await file.text());
      if (!validate(raw)) return { error: 'That file is not a Cozy Acres save.' };
      return { data: migrate(raw) };
    } catch (e) {
      return { error: e instanceof SyntaxError ? 'That file is damaged or not a save.' : `Could not read save: ${(e as Error).message}` };
    }
  }

  /** The current farm as save-file JSON (saves first), or null when it cannot be serialised. */
  serialize(): string | null {
    this.save();
    try { return JSON.stringify(game.state); } catch { return null; }
  }

  /** Read untrusted save JSON (a file, the cloud) through the same checks and migrations as an import. */
  parse(raw: unknown): { data: SaveData } | { error: string } {
    try {
      if (typeof raw === 'string') {
        if (raw.length > 5e6) return { error: 'too big' };
        raw = JSON.parse(raw);
      }
      if (!validate(raw)) return { error: 'not a save' };
      // work on a copy: migrate() edits its input
      return { data: migrate(JSON.parse(JSON.stringify(raw)) as Record<string, unknown>) };
    } catch (e) {
      return { error: (e as Error).message || 'unreadable' };
    }
  }

  /** Keep a farm aside in the replaced-farm slot (see REPLACED_KEY). */
  keepReplaced(json: string, why: string): boolean {
    return store.set(REPLACED_KEY, JSON.stringify({ at: Date.now(), why, save: json }));
  }

  /** The farm in the replaced-farm slot, checked like an import, or null. */
  replacedFarm(): ReplacedFarm | null {
    const txt = store.get(REPLACED_KEY);
    if (!txt) return null;
    try {
      const r = JSON.parse(txt) as { at?: number; why?: string; save?: string };
      const parsed = this.parse(r.save ?? '');
      return 'data' in parsed ? { data: parsed.data, at: finite(r.at, 0), why: typeof r.why === 'string' ? r.why : '' } : null;
    } catch { return null; }
  }

  /** Swap the current farm with the replaced one (the current farm takes its place) and reload. */
  restoreReplaced(): string | null {
    const kept = this.replacedFarm();
    if (!kept) return 'There is no other farm to bring back.';
    return this.applyImport(kept.data, 'Swapped back from Settings');
  }

  /**
   * Replace the farm with `data` and reload. The current farm becomes the backup and is also kept in
   * the replaced-farm slot, so an unwanted import (or cloud load) can be undone from Settings.
   */
  applyImport(data: SaveData, why = 'Replaced by an imported save', keep = true): string | null {
    this.save();
    this.locked = true;
    const prev = store.get(KEY);
    if (prev) { store.set(BACKUP_KEY, prev); if (keep) this.keepReplaced(prev, why); }
    if (!store.set(KEY, JSON.stringify(data))) { this.locked = false; return 'Could not store the save. Your browser storage may be full.'; }
    location.reload();
    return null;
  }

  /** Read a JSON save file; on success stores it and reloads the page. */
  async importFile(file: File): Promise<string | null> {
    const r = await this.readFile(file);
    return 'error' in r ? r.error : this.applyImport(r.data);
  }

  reset(): void {
    this.save();
    this.locked = true;
    const prev = store.get(KEY);
    if (prev) store.set(BACKUP_KEY, prev);
    // write a fresh farm (not just remove) so the backup is not picked up on reload
    store.set(KEY, JSON.stringify(createNewGame()));
    location.reload();
  }
}

export const saves = new SaveSystem();
