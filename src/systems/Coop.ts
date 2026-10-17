/**
 * 1.28 Together: co-op Village Projects (coop.json). Host a project with your friends (the footbridge, the community
 * garden, fireworks night) and everyone adds goods to it. When it is finished, everyone who gave gets its decoration
 * and a plaque with all their names; if it runs out of time or is cancelled, everyone gets back exactly what they gave.
 *
 * Same trust model as Ask a friend (Help.ts): the giver's items leave the barn before the server call and whatever the
 * server did not use comes back; rewards and refunds come from coop_claim(), which hands each one out once. Polling is
 * light (every minute while the game is visible and someone is in a project), never on the frame loop. Nothing is
 * given or added while visiting a neighbour.
 */
import { COOP, ITEMS, type CoopDef } from '../data';
import { game } from './Game';
import { saves } from './Save';
import { social } from './Social';
import { visiting } from './Visiting';
import { take, giveBack } from './Help';
import { online } from '../online/Online';
import { gameConfig } from '../online/GameConfig';
import { ensureOnline } from '../online/Profile';
import { logEvent } from '../online/Events';
import { coopLeft } from '../online/Coop';
import type { CoopClaim, CoopProject } from '../online/types';

const friendIds = (): string[] => social.state.friends.map((f) => f.id);
const WORDS: Record<string, string> = {
  level: 'Your farm needs a higher level for that project.', 'already hosting': 'You are already hosting a project. Finish it first.',
  'too many': `You can start ${COOP.startsPerWeek} projects a week. Try again in a few days.`, 'switched off': 'Village Projects are resting for now. Try again later.',
  closed: 'That project is already finished.', 'not needed': 'They have all of that now. Thank you anyway!', 'too many today': `That is ${COOP.givesPerDay} gifts today. You can help again tomorrow.`,
  'others joined': 'Friends have already given to it, so it cannot be cancelled. It closes by itself if it runs out of time, and everyone gets their goods back.',
};

class CoopSystem {
  projects: CoopProject[] = [];
  error = '';
  loaded = false;
  private started = false;
  private polling: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  private audienceSig = '';

  /** Open with Friends, from the project level, unless switched off from the dashboard. */
  get available(): boolean { return social.available && game.level >= COOP.level && gameConfig.coop; }
  def(kind: string): CoopDef | undefined { return COOP.projects.find((p) => p.id === kind); }
  plaques() { return game.state.coop?.plaques ?? []; }
  mine(): CoopProject | undefined { return this.projects.find((p) => p.host.id === online.me()?.id && p.status === 'open'); }
  friends(): CoopProject[] { return this.projects.filter((p) => p.host.id !== online.me()?.id); }

  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private changed(): void { for (const fn of this.listeners) { try { fn(); } catch (e) { console.error('[coop]', e); } } }
  private words(e: unknown): Error { const m = (e as Error)?.message ?? ''; return new Error(WORDS[m] ?? 'Could not reach the village right now.'); }

  start(): void {
    if (this.started) return;
    this.started = true;
    window.setInterval(() => { if (!document.hidden) void this.poll(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void this.poll(); });
    social.onChange(() => void this.syncAudience());
    setTimeout(() => void this.poll(), 6000);
  }

  /** Host a project with your friends. */
  async host(kind: string): Promise<CoopProject> {
    if (!this.available) throw new Error(WORDS['switched off']);
    try {
      await ensureOnline();
      const p = await online.coopStart(kind, friendIds());
      this.projects = [p, ...this.projects.filter((x) => x.id !== p.id)];
      this.audienceSig = friendIds().join(',');
      game.incStat('coop_hosted');
      logEvent('coop_start', { kind });
      this.changed();
      return p;
    } catch (e) { throw this.words(e); }
  }

  /** Give up to qty of an item: the server takes what is still needed and the rest comes straight back. */
  async give(p: CoopProject, item: string, qty: number): Promise<number> {
    if (visiting.active) throw new Error('You can give this when you are back home.');
    const n = Math.min(Math.floor(qty), coopLeft(p)[item] ?? 0, game.count(item), COOP.maxGive);
    if (n < 1) throw new Error(game.count(item) ? WORDS['not needed'] : `You have no ${ITEMS[item]?.name ?? 'items'} to give.`);
    const taken = take(item, n);
    let r: { used: number; project: CoopProject };
    try {
      await ensureOnline();
      r = await online.coopGive(p.id, item, n);
    } catch (e) {
      giveBack(item, taken, n);
      saves.save();
      throw this.words(e);
    }
    if (r.used < n) giveBack(item, taken, n - r.used);
    this.projects = this.projects.map((x) => (x.id === p.id ? r.project : x));
    game.incStat('coop_given', r.used);
    saves.save();
    this.changed();
    if (r.project.status === 'done') void this.poll();
    return r.used;
  }

  async cancel(p: CoopProject): Promise<void> {
    try {
      const c = await online.coopCancel(p.id);
      this.projects = this.projects.map((x) => (x.id === p.id ? c : x));
      await this.collect();
      this.changed();
    } catch (e) { throw this.words(e); }
  }

  /** Fetch projects and hand over rewards and refunds. Safe to call often (calls are merged). */
  poll(): Promise<void> {
    if (!this.available || !game.state) return Promise.resolve();
    this.polling ??= this.doPoll().finally(() => { this.polling = null; });
    return this.polling;
  }
  private async doPoll(): Promise<void> {
    // stay quiet for players with no friends and no project of their own
    if (!friendIds().length && !this.projects.length && this.loaded) { this.changed(); return; }
    try {
      await ensureOnline();
      this.projects = await online.coopList(friendIds());
      if (!visiting.active) await this.collect();
      this.error = '';
      this.loaded = true;
    } catch { this.error = 'Could not reach the village right now.'; }
    this.changed();
  }

  /** Claims: finished projects bring the decoration and a plaque with everyone's names; refunds bring the goods back. */
  private async collect(): Promise<void> {
    const got: CoopClaim[] = await online.coopClaim();
    if (!got.length) return;
    for (const c of got) {
      const def = this.def(c.kind);
      if (c.done && def) {
        for (const id of [def.decor, COOP.plaque]) { game.state.storage[id] = (game.state.storage[id] ?? 0) + 1; game.discover(id, 'building'); }
        const st = (game.state.coop ??= { plaques: [] });
        st.plaques.push({ project: c.project, kind: c.kind, host: c.host, names: c.names, at: c.closedAt || game.now() });
        if (st.plaques.length > 50) st.plaques.splice(0, st.plaques.length - 50);
        game.incStat('coop_done');
        game.bus.emit('toast', { title: `${def.name} is finished!`, sub: `Built together by ${c.names.slice(0, 4).join(', ')}${c.names.length > 4 ? ' and friends' : ''}. Its decoration and a plaque are in your storage.`, icon: def.icon });
        game.bus.emit('sfx', { name: 'reward' });
      } else if (c.refund) {
        for (const [item, n] of Object.entries(c.refund)) game.addItem(item, n);
        game.bus.emit('toast', { title: 'Goods returned', sub: `${def?.name ?? 'A project'} closed before it was finished, so what you gave is back in your barn.`, icon: 'basket' });
      }
    }
    saves.save();
  }

  /** The host's friends changed: the server learns who may see their open project. */
  private async syncAudience(): Promise<void> {
    const sig = friendIds().join(',');
    if (sig === this.audienceSig || !this.mine()) return;
    this.audienceSig = sig;
    try { await online.coopSetFriends(friendIds()); } catch { this.audienceSig = ''; }
  }
}

export const coop = new CoopSystem();
