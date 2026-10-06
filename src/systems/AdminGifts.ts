import { ITEMS } from '../data';
import { game } from './Game';
import { land } from './Land';
import { saves } from './Save';
import type { AdminGift } from '../online/types';

/** What a developer gift actually added (unknown items are skipped; land stops when the map is full). */
export interface AppliedGift { coins: number; gems: number; items: Record<string, number>; land: number }

/**
 * Add a developer gift to the farm and save at once. Land plots are opened next to the farm, like buying
 * them (later plots cost the same as if they had been bought), but free and without the expansion XP.
 */
export function applyAdminGift(g: AdminGift): AppliedGift {
  const items: Record<string, number> = {};
  for (const [k, n] of Object.entries(g.items ?? {})) if (ITEMS[k] && n > 0) items[k] = Math.floor(n);
  const coins = Math.max(0, Math.floor(g.coins) || 0), gems = Math.max(0, Math.floor(g.gems) || 0);
  for (const [k, n] of Object.entries(items)) game.addItem(k, n);
  if (coins) game.addCoins(coins);
  if (gems) game.addGems(gems);
  let plots = 0;
  for (let i = 0; i < Math.min(36, Math.max(0, Math.floor(g.land) || 0)); i++) {
    const chunk = land.purchasableChunks()[0];
    if (!chunk) break;
    game.unlockChunk(chunk);
    game.state.land.bought++;
    game.bus.emit('land:expanded', { chunk });
    plots++;
  }
  game.incStat('gifts_received');
  saves.save();
  return { coins, gems, items, land: plots };
}
