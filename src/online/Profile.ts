import { BUILDING, ITEMS, LEVELS } from '../data';
import { game } from '../systems/Game';
import { buildings } from '../systems/Buildings';
import { online } from './Online';
import { weeklyXp } from './Weekly';
import type { PlayerProfile, ProfileStats } from './types';

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

let ready: Promise<PlayerProfile> | null = null;
/** Connect (once) and publish this player's profile. Feature code awaits this before any online call. */
export function ensureOnline(): Promise<PlayerProfile> {
  ready ??= online.init().then(() => online.upsertProfile(profileStats())).catch((e) => { ready = null; throw e; });
  return ready;
}
