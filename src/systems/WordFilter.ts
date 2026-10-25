import WORDS from '../data/wordfilter.json';

/**
 * The word filter for everything other players see: farmer and farm names, gift notes, signs and room names
 * (App Store guideline 1.2). The lists are in src/data/wordfilter.json; supabase/schema.sql is_friendly() runs the same
 * check on the server (names and gift notes), so a changed game cannot get around it. Text typed here is refused
 * before it is sent, and text from other players is hidden if anything slipped through (older names, other versions).
 */

const BAD_WORDS = new Set(WORDS.words);
const BAD_ROOTS = WORDS.roots;
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i' };

/** True when the text is fine for other players to see. */
export function isFriendlyText(text: string): boolean {
  if (!text) return true;
  const lower = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const unleet = [...lower].map((c) => LEET[c] ?? c).join('');
  const words = unleet.split(/[^a-z]+/).filter(Boolean);
  if (words.some((w) => BAD_WORDS.has(w) || BAD_WORDS.has(w.replace(/(.)\1+/g, '$1')))) return false;
  // squashed together ("f.u.c.k", "sh1t head"), with repeated letters collapsed ("fuuuck")
  const squashed = unleet.replace(/[^a-z]/g, '');
  const collapsed = squashed.replace(/(.)\1+/g, '$1');
  return !BAD_ROOTS.some((r) => squashed.includes(r) || collapsed.includes(r));
}

/** The text, or `fallback` when it is not friendly (for showing other players' names and notes). */
export function friendlyOr<T extends string | undefined>(text: string, fallback: T): string | T {
  return isFriendlyText(text) ? text : fallback;
}

/** What to tell a player whose text was refused. */
export const UNFRIENDLY = 'Please choose kinder words. Cozy Acres is for everyone.';
