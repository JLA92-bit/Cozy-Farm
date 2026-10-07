/**
 * 1.8.5 Crafting at Bram's forge (the Workshop room of the village square). Recipes are in crafting.json. A craft
 * takes coins and items from the barn and gives a helper into storage (placed from the Shop, Decor, Helpers) or an
 * item into the barn. The Crafting skill sometimes makes one extra and Thrifty Smith saves materials. The
 * auto-feeder ticks here too.
 */
import { CRAFT_RECIPES, HELPERS, ITEMS, SKILL_VALUES, type CraftRecipe } from '../data';
import { game } from './Game';
import { animals } from './Animals';
import { roomDone } from './RestorationEffects';
import { hasSkillPerk, skillLevel } from './SkillEffects';
import { feederPerTick, homesInReach } from './HelperEffects';
import { isBuilt } from './Timers';
import { logEvent } from '../online/Events';

/** Items a craft needs after Thrifty Smith (a quarter off, at least one of anything that was wanted). */
export function craftNeeds(r: CraftRecipe): Record<string, number> {
  const out: Record<string, number> = {};
  const cut = hasSkillPerk('thrifty_smith') ? 1 - SKILL_VALUES.thriftyCrafting : 1;
  for (const [id, n] of Object.entries(r.in)) out[id] = Math.max(1, Math.round(n * cut));
  return out;
}

class CraftingSystem {
  open(): boolean { return roomDone('workshop'); }
  recipes(): CraftRecipe[] { return CRAFT_RECIPES; }
  chanceExtra(): number { return (skillLevel('crafting') - 1) * SKILL_VALUES.craftExtraPerLevel; }

  canCraft(r: CraftRecipe): { ok: boolean; reason?: string } {
    if (!this.open()) return { ok: false, reason: 'Rebuild the Workshop first' };
    if (game.coins < r.coins) return { ok: false, reason: 'Not enough coins' };
    for (const [id, n] of Object.entries(craftNeeds(r))) if (game.count(id) < n) return { ok: false, reason: `Needs ${n} ${ITEMS[id]?.name ?? id}` };
    return { ok: true };
  }

  craft(id: string): boolean {
    const r = CRAFT_RECIPES.find((x) => x.id === id);
    if (!r || !this.canCraft(r).ok) return false;
    if (r.coins) game.spend(r.coins);
    for (const [item, n] of Object.entries(craftNeeds(r))) game.addItem(item, -n);
    const extra = Math.random() < this.chanceExtra();
    const qty = r.qty * (extra ? 2 : 1);
    if (r.kind === 'building') game.state.storage[r.out] = (game.state.storage[r.out] ?? 0) + qty;
    else game.addItem(r.out, qty);
    game.discover(r.out, r.kind === 'building' ? 'building' : 'item');
    game.incStat('crafts_made');
    game.bus.emit('toast', { title: extra ? `${r.name} x${qty}` : r.name, sub: extra ? 'An extra one came out!' : r.kind === 'building' ? 'In storage: place it from the Shop' : 'Added to your barn', icon: r.icon });
    game.bus.emit('sfx', { name: 'build2' });
    game.bus.emit('state:changed', {});
    logEvent('craft', { item: r.id, qty });
    return true;
  }

  private lastFeed = 0;
  /** Logic tick: every auto-feeder feeds a few hungry animals nearby, using feed from the barn. */
  tick(now: number): void {
    if (now - this.lastFeed < HELPERS.autoFeederEverySec * 1000) return;
    this.lastFeed = now;
    for (const f of game.state.buildings) {
      if (f.type !== 'auto_feeder' || !isBuilt(f, now)) continue;
      let left = feederPerTick();
      for (const home of homesInReach(f)) {
        if (left <= 0) break;
        left -= animals.feedAll(home, left);
      }
    }
  }
}

export const crafting = new CraftingSystem();
