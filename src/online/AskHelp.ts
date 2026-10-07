import { ECONOMY, ITEMS } from '../data';
import { cleanHelperName } from './FarmHelp';
import type { HelpFill, HelpReason, HelpRequest, HelpStatus } from './types';

/**
 * Ask a friend (1.8): the pure, shared rules. Used by both backends (to check rows that came from the server
 * or from localStorage, which are untrusted) and by the game (src/systems/Help.ts).
 */
export const ASK = ECONOMY.help;

export const HELP_REASONS: HelpReason[] = ['order', 'recipe', 'truck', 'visit', 'bundle', 'other'];
/** "for an order", shown to friends under the request. */
export const REASON_TEXT: Record<HelpReason, string> = {
  order: 'for an order', recipe: 'for the workshop', truck: 'for the truck', visit: 'for a visitor', bundle: 'for a bundle', other: 'for the farm',
};
const STATUSES = new Set<HelpStatus>(['open', 'filled', 'expired', 'cancelled']);

/** Items that can be asked for: known to this version of the game, worth something, not event tokens. */
export function askable(item: string): boolean {
  const d = ITEMS[item];
  return !!d && d.sell > 0 && d.cat !== 'event';
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : NaN);
const time = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' ? Date.parse(v) || 0 : 0);
const id = (v: unknown): string => (typeof v === 'string' && v.length > 0 && v.length <= 64 ? v : '');

/** A request from a backend, checked: unknown items or broken numbers are dropped (null). */
export function cleanRequest(v: unknown): HelpRequest | null {
  if (!isObj(v)) return null;
  const rq = isObj(v.requester) ? v.requester : {};
  const qty = Math.floor(num(v.qty)), filled = Math.floor(num(v.filled));
  const item = typeof v.item === 'string' ? v.item : '';
  if (!id(v.id) || !ITEMS[item] || !(qty >= 1 && qty <= ASK.maxQty) || !(filled >= 0)) return null;
  const reason = HELP_REASONS.includes(v.reason as HelpReason) ? v.reason as HelpReason : 'other';
  const status = STATUSES.has(v.status as HelpStatus) ? v.status as HelpStatus : 'open';
  return {
    id: id(v.id), requester: { id: id(rq.id), name: cleanHelperName(rq.name) }, item, qty, filled: Math.min(qty, filled), reason,
    createdAt: time(v.createdAt), expiresAt: time(v.expiresAt), status,
  };
}

/** A fill from a backend, checked (the asker's game adds exactly qty of item for it). */
export function cleanFill(v: unknown): HelpFill | null {
  if (!isObj(v)) return null;
  const hp = isObj(v.helper) ? v.helper : {};
  const qty = Math.floor(num(v.qty));
  const item = typeof v.item === 'string' ? v.item : '';
  if (!id(v.id) || !ITEMS[item] || !(qty >= 1 && qty <= ASK.maxQty)) return null;
  return { id: id(v.id), request: id(v.request), item, helper: { id: id(hp.id), name: cleanHelperName(hp.name) }, qty, auto: !!v.auto, at: time(v.at) };
}

/** Still needed for a request. */
export const needOf = (r: HelpRequest): number => Math.max(0, r.qty - r.filled);
/** Open and not past its 24 hours (the server marks expired ones lazily). */
export const isOpen = (r: HelpRequest, now: number): boolean => r.status === 'open' && r.expiresAt > now && r.filled < r.qty;

/** Coins the game pays a helper for one send (the first rewardedPerDay sends of a day). */
export function helperReward(item: string, qty: number): number {
  const v = (ITEMS[item]?.sell ?? 0) * qty * ASK.rewardMult;
  return Math.max(ASK.rewardMin, Math.min(ASK.rewardMax, Math.round(v)));
}

/** What Hazel charges for each of an item: the Shared Market's fair price, plus her markup. */
export function hazelUnitPrice(item: string): number {
  return Math.max(1, Math.ceil((ITEMS[item]?.sell ?? 1) * ECONOMY.market.defaultPriceMult * ASK.hazelMarkup));
}
