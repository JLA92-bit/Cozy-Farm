import { online } from '../online/Online';
import { ensureOnline } from '../online/Profile';
import type { PlayerProfile, ReportPlace, ReportReason } from '../online/types';
import { social } from './Social';

/**
 * Reports and blocks (App Store guideline 1.2; server: supabase/schema.sql section "reports and blocks"). The server
 * keeps the block list and enforces it both ways (gifts, help, visits, homes, listings, requests); this keeps a copy
 * so the game can hide blocked players on the leaderboards and show the Blocked list in Friends. Blocking also drops
 * them from the friends list and their gifts from the mailbox.
 */

const CACHE_KEY = 'cozy-acres-blocks';
type Blocked = { id: string; name: string };

class Blocks {
  private list: Blocked[] = [];
  private listeners = new Set<() => void>();
  private loaded = false;

  constructor() {
    try {
      const v = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]') as unknown;
      if (Array.isArray(v)) this.list = v.filter((b): b is Blocked => !!b && typeof b.id === 'string' && typeof b.name === 'string');
    } catch { /* blocked storage: starts empty, refresh() fills it */ }
  }

  get all(): readonly Blocked[] { return this.list; }
  has(id: string): boolean { return this.list.some((b) => b.id === id); }

  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private set(list: Blocked[]): void {
    this.list = list;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(list)); } catch { /* storage full */ }
    for (const fn of this.listeners) fn();
  }

  /** Read the list from the server (once a session unless forced). Never throws. */
  async refresh(force = false): Promise<void> {
    if (this.loaded && !force) return;
    // practice mode keeps its list on this device, and this copy has the names (the practice backend does not)
    if (online.kind === 'local') { this.loaded = true; return; }
    try {
      await ensureOnline();
      this.set(await online.myBlocks());
      this.loaded = true;
    } catch { /* offline: the cached list stands */ }
  }

  /** Block a player: the server first, then the friends list and mailbox here. Throws when the server refused. */
  async block(p: Pick<PlayerProfile, 'id' | 'name'>): Promise<void> {
    await ensureOnline();
    await online.blockPlayer(p.id);
    if (social.isFriend(p.id)) social.removeFriend(p.id);
    social.dropFrom(p.id);
    if (!this.has(p.id)) this.set([{ id: p.id, name: p.name || 'Farmer' }, ...this.list]);
  }

  async unblock(id: string): Promise<void> {
    await ensureOnline();
    await online.unblockPlayer(id);
    this.set(this.list.filter((b) => b.id !== id));
  }

  /** Report a player; false when they were already reported today. Throws 'too many today' or when offline. */
  async report(p: Pick<PlayerProfile, 'id'>, reason: ReportReason, note: string, place: ReportPlace, giftId?: string): Promise<boolean> {
    await ensureOnline();
    return online.reportPlayer(p.id, reason, note.trim().slice(0, 300), place, giftId);
  }
}

export const blocks = new Blocks();
