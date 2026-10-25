import { ITEMS } from '../data';
import { game } from './Game';
import { land } from './Land';
import { saves } from './Save';
import { mail } from './Mail';
import type { AdminGift } from '../online/types';

/**
 * 1.31.2 a gift's item key may ask for a quality: `silver__<item>` or `gold__<item>` (the dashboard's Needs tab sends
 * these for bundles that want starred goods). Plain ids are normal quality. Null for anything not a real item.
 */
export function giftItemKey(key: string): { item: string; quality: 0 | 1 | 2 } | null {
  const m = /^(silver|gold)__(.+)$/.exec(key);
  const item = m ? m[2] : key;
  if (!ITEMS[item]) return null;
  return { item, quality: m ? (m[1] === 'gold' ? 2 : 1) : 0 };
}

/** What a developer gift actually added (unknown items are skipped; land stops when the map is full). */
export interface AppliedGift { coins: number; gems: number; items: Record<string, number>; land: number }

/**
 * Add a developer gift to the farm and save at once. Land plots are opened next to the farm, like buying
 * them (later plots cost the same as if they had been bought), but free and without the expansion XP.
 */
export function applyAdminGift(g: AdminGift): AppliedGift {
  // `items` is what the letter lists (plain ids, all qualities together)
  const items: Record<string, number> = {};
  for (const [k, raw] of Object.entries(g.items ?? {})) {
    const key = giftItemKey(k), n = Math.floor(raw);
    if (!key || !(n > 0)) continue;
    game.addItem(key.item, n, undefined, key.quality);
    items[key.item] = (items[key.item] ?? 0) + n;
  }
  const coins = Math.max(0, Math.floor(g.coins) || 0), gems = Math.max(0, Math.floor(g.gems) || 0);
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
  // 1.8: keep it in the mailbox as a letter to reread (already collected, so it is filed as read)
  const msg = (g.message ?? '').trim();
  const body = `${msg || 'Thank you for playing Cozy Acres! Here is a little something for your farm.'}${plots ? `\n\nAlso: ${plots} new land ${plots === 1 ? 'plot' : 'plots'} next to your farm.` : ''}\n\nThe Cozy Acres team`;
  const letter = mail.send('team', 'A gift from the Cozy Acres team', body, coins || gems || Object.keys(items).length ? { coins: coins || undefined, gems: gems || undefined, items: Object.keys(items).length ? items : undefined } : undefined);
  letter.read = true;
  letter.claimed = true;
  saves.save();
  return { coins, gems, items, land: plots };
}
