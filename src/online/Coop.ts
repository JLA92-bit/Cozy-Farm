/**
 * 1.28 Together: the shared rules and cleaning for co-op Village Projects (coop.json), used by both backends so the
 * practice backend behaves like the server. Anything odd from the server or storage is dropped, never trusted.
 */
import { COOP, ITEMS } from '../data';
import type { CoopClaim, CoopProject, CoopStatus } from './types';
import { isFriendlyText } from '../systems/WordFilter';

const STATUS: CoopStatus[] = ['open', 'done', 'expired', 'cancelled'];
const int = (v: unknown, max: number): number => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0; };
const ms = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) || 0 : 0);
const name = (v: unknown): string => (typeof v === 'string' && v.trim() && isFriendlyText(v) ? v.trim().slice(0, 24) : 'Farmer');
function counts(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object') for (const [k, n] of Object.entries(v)) if (ITEMS[k]) { const c = int(n, 100000); if (c > 0) out[k] = c; }
  return out;
}

/** A project row (server or practice) made safe, or null when it cannot be shown. */
export function cleanCoop(r: Record<string, unknown> | null | undefined): CoopProject | null {
  if (!r || typeof r.id !== 'string' || typeof r.kind !== 'string' || !COOP.projects.some((p) => p.id === r.kind)) return null;
  const host = (r.host ?? {}) as { id?: unknown; name?: unknown };
  const status = STATUS.includes(r.status as CoopStatus) ? (r.status as CoopStatus) : 'open';
  const givers = (Array.isArray(r.givers) ? r.givers : []).slice(0, 30).map((g: { name?: unknown; qty?: unknown; me?: unknown }) => ({ name: name(g?.name), qty: int(g?.qty, 1e6), me: g?.me === true }));
  return {
    id: r.id, host: { id: typeof host.id === 'string' ? host.id : '', name: name(host.name) }, kind: r.kind, needs: counts(r.needs), given: counts(r.given), status,
    createdAt: ms(r.created_at ?? r.createdAt), expiresAt: ms(r.expires_at ?? r.expiresAt), closedAt: ms(r.closed_at ?? r.closedAt), givers,
  };
}

export function cleanClaim(r: Record<string, unknown> | null | undefined): CoopClaim | null {
  if (!r || typeof r.project !== 'string' || typeof r.kind !== 'string') return null;
  return {
    project: r.project, kind: r.kind, host: name(r.host), done: r.done === true, refund: r.refund ? counts(r.refund) : null,
    names: (Array.isArray(r.names) ? r.names : []).slice(0, 30).map(name), closedAt: ms(r.closed_at ?? r.closedAt),
  };
}

/** What is still needed of each item. */
export const coopLeft = (p: CoopProject): Record<string, number> => Object.fromEntries(Object.entries(p.needs).map(([k, n]) => [k, Math.max(0, n - (p.given[k] ?? 0))]));
/** 0..1 how far along a project is (every item counts by its share of the whole). */
export function coopFraction(p: CoopProject): number {
  const need = Object.values(p.needs).reduce((a, b) => a + b, 0);
  return need ? Object.entries(p.needs).reduce((a, [k, n]) => a + Math.min(n, p.given[k] ?? 0), 0) / need : 0;
}
