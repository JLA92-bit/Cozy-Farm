import { game } from './Game';
import { createNewGame } from './NewGame';
import { SAVE_VERSION, type SaveData } from './State';

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

class SaveSystem {
  private timer = 0;
  lastSaved = 0;
  /** When set, saving is suppressed (e.g. while resetting). */
  locked = false;

  load(): { data: SaveData; fresh: boolean } {
    const tryParse = (key: string) => {
      const txt = localStorage.getItem(key);
      if (!txt) return null;
      try {
        const raw = JSON.parse(txt);
        return validate(raw) ? migrate(raw) : null;
      } catch (e) { console.warn('save unreadable', key, e); return null; }
    };
    const data = tryParse(KEY) ?? tryParse(BACKUP_KEY);
    if (data) return { data, fresh: false };
    return { data: createNewGame(), fresh: true };
  }

  save(): void {
    if (this.locked || !game.state) return;
    game.state.lastSeen = game.now();
    try {
      const txt = JSON.stringify(game.state);
      const prev = localStorage.getItem(KEY);
      if (prev) localStorage.setItem(BACKUP_KEY, prev);
      localStorage.setItem(KEY, txt);
      this.lastSaved = Date.now();
    } catch (e) {
      console.error('save failed', e);
    }
  }

  /** Autosave every 30 s and whenever the page is hidden or closed. */
  startAutosave(intervalMs = 30000): void {
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.save(), intervalMs);
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

  /** Read a JSON save file; on success stores it and reloads the page. */
  async importFile(file: File): Promise<string | null> {
    try {
      const raw = JSON.parse(await file.text());
      if (!validate(raw)) return 'That file is not a Cozy Acres save.';
      const data = migrate(raw);
      this.locked = true;
      localStorage.setItem(BACKUP_KEY, localStorage.getItem(KEY) ?? '');
      localStorage.setItem(KEY, JSON.stringify(data));
      location.reload();
      return null;
    } catch (e) {
      return `Could not read save: ${(e as Error).message}`;
    }
  }

  reset(): void {
    this.locked = true;
    const prev = localStorage.getItem(KEY);
    if (prev) localStorage.setItem(BACKUP_KEY, prev);
    // write a fresh farm (not just remove) so the backup is not picked up on reload
    localStorage.setItem(KEY, JSON.stringify(createNewGame()));
    location.reload();
  }
}

export const saves = new SaveSystem();
