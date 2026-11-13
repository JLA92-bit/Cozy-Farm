/**
 * 1.48 Friends Board: the shared rules and cleaning (pairs.json), used by both backends so the practice backend
 * behaves like the server. Anything odd from the server or storage is dropped, never trusted.
 */
import { ITEMS, PAIRS } from '../data';
import type { PairBoard, PairClaim, PairStatus, PairTask } from './types';
import { isFriendlyText } from '../systems/WordFilter';

const STATUS: PairStatus[] = ['pending', 'active', 'ended'];
const int = (v: unknown, max: number): number => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0; };
const ms = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) || 0 : 0);
const name = (v: unknown): string => (typeof v === 'string' && v.trim() && isFriendlyText(v) ? v.trim().slice(0, 24) : 'Farmer');

/** The most one friend can give to a task: the other must give at least `share` of it. */
export const pairPart = (qty: number): number => qty - Math.ceil(qty * PAIRS.share);
/** Monday 00:00 UTC of the week `t` is in. */
export function pairWeek(t: number): number {
  const d = new Date(t);
  const day = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}
/** Bond level from tasks done together. */
export const pairBond = (tasksDone: number): number => Math.min(PAIRS.bondMax, Math.floor(Math.max(0, tasksDone) / PAIRS.bondTasks));

export function cleanPair(r: Record<string, unknown> | null | undefined): PairBoard | null {
  if (!r || typeof r.id !== 'string') return null;
  const pt = (r.partner ?? {}) as { id?: unknown; name?: unknown; level?: unknown };
  if (typeof pt.id !== 'string' || !pt.id) return null;
  const tasks: PairTask[] = (Array.isArray(r.tasks) ? r.tasks : []).slice(0, 10)
    .map((t: Record<string, unknown>) => ({ idx: int(t?.idx, 9), item: String(t?.item ?? ''), qty: int(t?.qty, 1000), mine: int(t?.mine, 1000), theirs: int(t?.theirs, 1000), done: t?.done === true }))
    .filter((t) => !!ITEMS[t.item] && t.qty > 0);
  return {
    id: r.id, status: STATUS.includes(r.status as PairStatus) ? (r.status as PairStatus) : 'ended',
    partner: { id: pt.id, name: name(pt.name), level: Math.max(1, int(pt.level, 999)) },
    invitedByMe: (r.invited_by_me ?? r.invitedByMe) === true,
    tasksDone: int(r.tasks_done ?? r.tasksDone, 1e6), fullWeeks: int(r.full_weeks ?? r.fullWeeks, 1e5), streak: int(r.streak, 1e5),
    week: ms(r.week), tasks,
  };
}

export function cleanPairClaim(r: Record<string, unknown> | null | undefined): PairClaim | null {
  if (!r || typeof r.id !== 'string' || !['task', 'full', 'refund'].includes(r.kind as string)) return null;
  const refund: Record<string, number> = {};
  if (r.refund && typeof r.refund === 'object') for (const [k, n] of Object.entries(r.refund)) if (ITEMS[k]) { const c = int(n, 1000); if (c > 0) refund[k] = c; }
  return {
    id: r.id, board: typeof r.board === 'string' ? r.board : '', partner: name(r.partner), kind: r.kind as PairClaim['kind'],
    item: typeof r.item === 'string' && ITEMS[r.item] ? r.item : '', qty: int(r.qty, 1000), bond: Math.min(PAIRS.bondMax, int(r.bond, 100)),
    refund: r.kind === 'refund' ? refund : null,
  };
}
