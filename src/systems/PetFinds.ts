/**
 * 1.9 Pets that help: tap your pet (the dog, cat, bunny... chosen in Me > Look) once a day and it has dug up a little
 * something for you. What it finds is fixed by the farm seed and the date. Only the day it was last claimed is saved.
 */
import { ITEMS } from '../data';
import { game } from './Game';
import { saves } from './Save';
import { localDay } from './Progression';
import { hashString, rng } from '../world/Procedural';

export interface PetFind { coins?: number; gems?: number; item?: { id: string; n: number } }

const ITEM_FINDS: { id: string; n: number; w: number }[] = [
  { id: 'acorn', n: 2, w: 3 }, { id: 'seashell', n: 2, w: 3 }, { id: 'petal', n: 2, w: 3 }, { id: 'bait', n: 3, w: 2 }, { id: 'rare_seed', n: 1, w: 1 },
];

class PetFinds {
  hasPet(): boolean { const p = game.state.player.look?.pet; return !!p && p !== 'none'; }
  available(): boolean { return this.hasPet() && game.state.tutorial.done && game.state.petfind?.day !== localDay(game.now()); }

  /** Today's find (without giving it). */
  peek(): PetFind {
    const r = rng(hashString(`${game.state.seed}:petfind:${localDay(game.now())}`));
    const x = r();
    if (x < 0.45) return { coins: 60 + Math.floor(r() * 90) };
    if (x < 0.55) return { gems: 1 };
    const total = ITEM_FINDS.reduce((a, b) => a + b.w, 0);
    let y = r() * total;
    for (const e of ITEM_FINDS) { y -= e.w; if (y <= 0) return { item: { id: e.id, n: e.n } }; }
    return { coins: 80 };
  }

  /** Claim today's find once. Returns it, or null (no pet, or already claimed). */
  claim(): PetFind | null {
    if (!this.available()) return null;
    const f = this.peek();
    if (f.coins) game.addCoins(f.coins);
    if (f.gems) game.addGems(f.gems);
    if (f.item && ITEMS[f.item.id]) game.addItem(f.item.id, f.item.n);
    game.state.petfind = { day: localDay(game.now()) };
    game.incStat('pet_finds');
    saves.save();
    return f;
  }
}

export const petFinds = new PetFinds();
