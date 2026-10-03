import { game } from './Game';
import { createNewGame } from './NewGame';
import { SAVE_VERSION, type SaveData, type PlacedBuilding } from './State';
import { BUILDING, CROP, ITEMS, LAND, MAX_LEVEL, RECIPE, REWARDS } from '../data';

const KEY = 'cozy-acres-save';
const BACKUP_KEY = 'cozy-acres-save-backup';

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
  out.stall = { ...base.stall, ...(s.stall ?? {}) };
  out.merchant = { ...base.merchant, ...(s.merchant ?? {}) };
  out.orders = { ...base.orders, ...(s.orders ?? {}) };
  out.land = { ...base.land, ...(s.land ?? {}) };
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

  load(): { data: SaveData; fresh: boolean } {
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
    if (this.locked || !game.state) return false;
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

  /** Replace the farm with `data` (the current farm becomes the backup) and reload. */
  applyImport(data: SaveData): string | null {
    // keep the current farm as the backup so an unwanted import can be undone
    this.save();
    this.locked = true;
    const prev = store.get(KEY);
    if (prev) store.set(BACKUP_KEY, prev);
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
    this.locked = true;
    this.locked = false;
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
