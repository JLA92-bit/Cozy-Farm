import { BUILDING, ITEMS, LEVELS } from '../data';
import { game } from '../systems/Game';
import { buildings } from '../systems/Buildings';
import { online } from './Online';
import { weeklyXp } from './Weekly';
import type { PlayerProfile, ProfileStats } from './types';
import { saves } from '../systems/Save';

/** Public stats for this player's profile, computed from the local save. */
export function profileStats(): ProfileStats {
  const s = game.state;
  let totalXp = s.player.xp;
  for (let l = 1; l < s.player.level; l++) totalXp += LEVELS[l - 1]?.xpToNext ?? 0;
  let value = s.player.coins + s.player.gems * 25;
  for (const [id, n] of Object.entries(s.inventory)) value += (ITEMS[id]?.sell ?? 0) * n;
  for (const b of s.buildings) value += BUILDING[b.type]?.cost ?? 0;
  const { body, skin, hair, top, bottom, hat } = s.player.look;
  return {
    name: s.player.name, level: s.player.level, totalXp, farmValue: Math.round(value), charm: buildings.charm(),
    weeklyXp: weeklyXp(),
    look: { body, skin, hair, top, bottom, hat },
  };
}

let holds = 0;
/**
 * Pause profile publishing (counted: every hold is released once) while it is not yet known which farm this account
 * plays: a sign-in coming back, the first cloud check, the player choosing between two farms. Until then this
 * device's farm (maybe a brand new one) must never be published as the account's profile. 1.33.5: also covers the
 * first connect below, which used to publish regardless.
 */
export function holdProfile(on: boolean): void { holds = Math.max(0, holds + (on ? 1 : -1)); }
/** True while profile publishing is paused, or the farm is being swapped for another (the page reloads next). */
export const profileHeld = (): boolean => holds > 0 || saves.locked;

let ready: Promise<PlayerProfile> | null = null;
/** Connect (once) and publish this player's profile. Feature code awaits this before any online call. */
export function ensureOnline(): Promise<PlayerProfile> {
  ready ??= online.init()
    // held: an account that already has a profile keeps it as it is (publishProfile sends the right farm later)
    .then(() => { const me = online.me(); return me && profileHeld() ? me : online.upsertProfile(profileStats()); })
    .catch((e) => { ready = null; throw e; });
  return ready;
}

/** Forget the connection (after signing out or deleting the account): the next call connects afresh. */
export function resetOnlineProfile(): void { ready = null; }
