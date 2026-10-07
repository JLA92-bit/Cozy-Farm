import { BUILDING, type BuildingDef } from '../data';
import type { PlacedBuilding } from './State';

/**
 * Personal touches on placed decor: a paint colour for paintable pieces (`paint` in buildings.json names the
 * model colour that gets repainted) and the short text on a Farm Sign (`sign` in buildings.json).
 * Both are stored on the PlacedBuilding (`tint`, `text`), saved, and shared in farm snapshots.
 */

/** Cosy paint palette. Keys are what gets saved, so never rename one. */
export const PAINTS: { id: string; name: string; hex: string; juniper?: boolean }[] = [
  { id: 'rose', name: 'Rose', hex: '#e8655a' },
  { id: 'peach', name: 'Peach', hex: '#f5a05a' },
  { id: 'butter', name: 'Butter', hex: '#f6d04d' },
  { id: 'sage', name: 'Sage', hex: '#86c06a' },
  { id: 'sky', name: 'Sky', hex: '#5aaee0' },
  { id: 'lilac', name: 'Lilac', hex: '#a98be3' },
  { id: 'blush', name: 'Blush', hex: '#f4a3c4' },
  { id: 'cream', name: 'Cream', hex: '#f7ecd6' },
  // 1.8: Juniper's colours, offered once she is a 6-heart friend (always valid in saves and farm snapshots)
  { id: 'mint', name: 'Mint', hex: '#7fd8be', juniper: true },
  { id: 'coral', name: 'Coral', hex: '#ff7f6a', juniper: true },
  { id: 'honey', name: 'Honey', hex: '#e8a838', juniper: true },
  { id: 'midnight', name: 'Midnight', hex: '#3c4f8f', juniper: true },
];
const PAINT_BY_ID = new Map(PAINTS.map((p) => [p.id, p]));

/** Hex for a saved paint key, or undefined for "as built" / unknown keys. */
export const paintHex = (id: string | undefined): string | undefined => (id ? PAINT_BY_ID.get(id)?.hex : undefined);
export const isPaint = (id: unknown): id is string => typeof id === 'string' && PAINT_BY_ID.has(id);
export const canPaint = (def: BuildingDef | undefined): boolean => !!def?.paint;

export const SIGN_MAX = 16;

/**
 * Sign text reduced to what a sign may show: letters (with common accents), digits, spaces and a little
 * punctuation, single-spaced, at most 16 characters. Returns '' when nothing is left.
 */
export function cleanSignText(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.normalize('NFC')
    .replace(/[^A-Za-z0-9À-ÖØ-öø-ÿ '!?.,&:#-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SIGN_MAX)
    .trim();
}

// A small, deliberately strict word list for a 13+ game. Whole words only (so "Grassy Acres" or "Hoe Down"
// stay fine), plus a few roots that are caught even inside other words.
const BAD_WORDS = new Set([
  'ass', 'arse', 'asshole', 'arsehole', 'bastard', 'bitch', 'bitches', 'bollocks', 'boob', 'boobs', 'butthole', 'cock', 'cocks',
  'crap', 'cum', 'damn', 'dick', 'dicks', 'dildo', 'douche', 'fag', 'fags', 'hell', 'homo', 'jizz', 'kkk',
  'nazi', 'nazis', 'piss', 'porn', 'prick', 'pussy', 'rape', 'raped', 'rapist', 'retard', 'retarded', 'sex', 'sexy', 'shag',
  'slag', 'slut', 'sluts', 'spunk', 'tit', 'tits', 'titties', 'turd', 'twat', 'wank', 'wanker', 'whore', 'hitler',
  'penis', 'vagina', 'anal', 'anus', 'nude', 'nudes', 'naked', 'horny', 'milf', 'thot', 'simp', 'stfu', 'wtf', 'omfg', 'kys',
]);
const BAD_ROOTS = ['fuck', 'fuk', 'fck', 'shit', 'cunt', 'nigg', 'nigga', 'faggot', 'bitch', 'whore', 'slut', 'twat', 'porn', 'dildo', 'penis', 'vagin', 'motherf', 'bullsh', 'asshole', 'jizz'];
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i' };

/** True when the text is fine to show on a farm other players can visit. */
export function isFriendlyText(text: string): boolean {
  const lower = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const unleet = [...lower].map((c) => LEET[c] ?? c).join('');
  const words = unleet.split(/[^a-z]+/).filter(Boolean);
  if (words.some((w) => BAD_WORDS.has(w) || BAD_WORDS.has(w.replace(/(.)\1+/g, '$1')))) return false;
  // squashed together ("f.u.c.k", "sh1t head"), with repeated letters collapsed ("fuuuck")
  const squashed = unleet.replace(/[^a-z]/g, '');
  const collapsed = squashed.replace(/(.)\1+/g, '$1');
  return !BAD_ROOTS.some((r) => squashed.includes(r) || collapsed.includes(r));
}

/** What a sign shows: its own text when set and friendly, otherwise a default made from the farmer's name. */
export function signText(b: Pick<PlacedBuilding, 'text'>, farmerName: string): string {
  const own = cleanSignText(b.text);
  if (own && isFriendlyText(own)) return own;
  const name = cleanSignText(farmerName);
  const def = name && isFriendlyText(name) ? `${name}'s Farm` : '';
  return def && def.length <= SIGN_MAX ? def : 'Welcome!';
}

/** Repaint a placed decor piece (undefined = back to its built colour). Returns false when it cannot be painted. */
export function setTint(b: PlacedBuilding, tint: string | undefined): boolean {
  if (!canPaint(BUILDING[b.type])) return false;
  if (tint === undefined) delete b.tint;
  else if (isPaint(tint)) b.tint = tint;
  else return false;
  return true;
}

/** Saved fields of a building cleaned in place (own saves, imports): unknown paints or unfriendly text are dropped. */
export function sanitizeDecorFields(b: PlacedBuilding): void {
  const def = BUILDING[b.type];
  if (b.tint !== undefined && !(def?.paint && isPaint(b.tint))) delete b.tint;
  if (b.text !== undefined) {
    const t = def?.sign ? cleanSignText(b.text) : '';
    if (t && isFriendlyText(t)) b.text = t; else delete b.text;
  }
}
