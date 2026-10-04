import { BUILDING } from '../data';
import type { SnapBuilding } from './FarmSnapshot';
import { HELP_NOTES, type FarmHelp, type FarmHelpKind, type FarmHelpTarget } from './types';

/**
 * Helping neighbours (Update 5): the pure, shared rules. Used by the visit view (what can be helped),
 * the practice backend (what demo neighbours help with) and the owner side (checking help rows that
 * came from the server, which are untrusted).
 */

/** How a visitor can help with one building of a farm snapshot, or null when it needs no help. */
export function helpKindFor(e: SnapBuilding): FarmHelpKind | null {
  const def = BUILDING[e[0]];
  const ex = e[4];
  if (!def || ex?.c) return null;
  if (def.id === 'plot') return ex?.p && ex.p[1] < 3 ? 'water' : null;
  if (def.tree) return ex?.t ? null : 'tend';
  if (def.animal) return ex?.a && ex.a[2] > 0 ? 'feed' : null;
  return null;
}

/** Button words for each kind of help. */
export const HELP_ACTION: Record<FarmHelpKind, string> = { water: 'Water it', feed: 'Feed the animals', tend: 'Tend the tree' };
/** Past tense, for "Kacie watered your wheat". */
export const HELP_DONE: Record<FarmHelpKind, string> = { water: 'watered', feed: 'fed', tend: 'tended' };
export const HELP_ICON: Record<FarmHelpKind | 'like', string> = { water: 'droplet', feed: 'chicken', tend: 'apple', like: 'heart' };

const KINDS = new Set(['water', 'feed', 'tend', 'like']);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** A help target from untrusted data: a known building type and whole tile numbers inside the map. */
export function cleanTarget(v: unknown): FarmHelpTarget | null {
  if (!isObj(v) || typeof v.type !== 'string' || !BUILDING[v.type]) return null;
  const x = v.x, z = v.z;
  if (typeof x !== 'number' || typeof z !== 'number' || !Number.isInteger(x) || !Number.isInteger(z) || x < 0 || z < 0 || x > 200 || z > 200) return null;
  return { type: v.type, x, z };
}

/** Printable short name (no control characters), like the snapshot's cleanName. */
export function cleanHelperName(v: unknown): string {
  const s = typeof v === 'string' ? [...v].filter((ch) => { const c = ch.charCodeAt(0); return c >= 32 && !(c >= 0x7f && c <= 0x9f) && c !== 0x2028 && c !== 0x2029; }).join('').trim().slice(0, 24) : '';
  return s || 'A neighbour';
}

/** A help row from a backend, checked: unknown kinds are dropped, unknown notes and bad targets removed. */
export function cleanHelp(v: unknown): FarmHelp | null {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id || v.id.length > 64 || typeof v.kind !== 'string' || !KINDS.has(v.kind)) return null;
  const helper = isObj(v.helper) ? v.helper : {};
  const kind = v.kind as FarmHelp['kind'];
  const target = kind === 'like' ? null : cleanTarget(v.target);
  if (kind !== 'like' && !target) return null;
  return {
    id: v.id,
    owner: typeof v.owner === 'string' ? v.owner : '',
    helper: { id: typeof helper.id === 'string' ? helper.id : '', name: cleanHelperName(helper.name) },
    kind,
    target,
    note: kind === 'like' && typeof v.note === 'string' && HELP_NOTES[v.note] ? v.note : null,
    at: typeof v.at === 'number' && Number.isFinite(v.at) ? v.at : 0,
    claimed: !!v.claimed,
  };
}
