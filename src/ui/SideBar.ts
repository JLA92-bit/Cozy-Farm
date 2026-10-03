import { ui } from './UI';
import { game } from '../systems/Game';
import { merchant, truck } from '../systems/Economy';

/** Extra side shortcuts on the HUD; other systems append entries via sideEntries. */
export const sideEntries: ((now: number) => { id: string; icon: string; label: string; color?: string; badge?: boolean } | null)[] = [];

export function updateSideBar(now: number): void {
  const list = [];
  for (const fn of sideEntries) { const e = fn(now); if (e) list.push(e); }
  if (merchant.visit(now).present) list.push({ id: 'merchant', icon: 'cart', label: 'Merchant', color: 'purple' });
  if (game.state.truck && truck.depot) list.push({ id: 'truck', icon: 'truck', label: 'Truck', color: 'blue', badge: truck.complete });
  ui.hud.setSide(list);
}
