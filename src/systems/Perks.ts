/**
 * 1.8 Village Friends: the 6-heart perks (perk6 in villagers.json). Kept tiny and free of UI imports so
 * fishing, decor, production and the merchant can ask "is this perk on?" without pulling in the village code.
 * A perk is on once its 6-heart milestone was given (src/systems/VillageRewards.ts records it in `rewards`).
 */
import { game } from './Game';
import { VILLAGERS } from '../data';

export type PerkId = 'rosa_tart' | 'tom_casts' | 'juniper_paints' | 'pip_treasure' | 'hazel_discount' | 'bram_workshops';

/** Extra free casts a day with Old Tom's perk. */
export const TOM_EXTRA_CASTS = 2;
/** Price multiplier at the travelling merchant with Hazel's perk. */
export const HAZEL_PRICE_MULT = 0.9;
/** Production time multiplier with Bram's perk. */
export const BRAM_TIME_MULT = 0.95;

export function hasPerk(id: PerkId): boolean {
  const v = VILLAGERS.find((x) => x.perk6.id === id);
  return !!v && !!game.state?.village?.friends[v.id]?.rewards.includes(6);
}
