import { game } from '../systems/Game';
import { homeUnlocked, repairHome } from '../systems/Home';
import { mail } from '../systems/Mail';
import { visiting } from '../systems/Visiting';
import type { HomeRoom, HomeState } from '../systems/State';
import { online } from './Online';
import type { HomeSnapshot } from './types';

/**
 * 1.30 sharing your home: friends visiting your farm can step inside your Farmhouse. The shared picture holds the
 * rooms only (walls, floors and furniture), never storage, the catalogue or anything else from the save, and it is
 * checked with the same repair as a save before it is drawn. Coffee visits are only friendly: no coins or XP.
 */

const PUBLISH_MS = 5 * 60000;
const COFFEE_MS = 10 * 60000;
let busy = false;
let last = '';
let nextAt = 0;
let failures = 0;

/** What friends see of your home. */
export function homeSnapshot(): HomeSnapshot | null {
  const st = game.state.home;
  if (!st || !homeUnlocked()) return null;
  const rooms: Record<string, Omit<HomeRoom, 'looks'>> = {};
  for (const [id, r] of Object.entries(st.rooms)) {
    const { looks: _looks, ...rest } = r;
    void _looks;
    rooms[id] = rest;
  }
  const snap: HomeSnapshot = { v: 1, name: (game.state.player.name || 'Farmer').slice(0, 24), rooms };
  // 1.30.4 the photos hanging in a room go along, as many as fit under the server's limit (the rest show a painting)
  const hung = new Set(Object.values(rooms).flatMap((r) => r.items.map((i) => i.show)).filter((s) => s?.startsWith('photo:')));
  const photos = (st.photos ?? []).filter((p) => hung.has(`photo:${p.id}`));
  let bytes = JSON.stringify(snap).length;
  for (const p of photos) {
    if (bytes + p.d.length + 40 > SHARE_BYTES) break;
    (snap.photos ??= []).push(p);
    bytes += p.d.length + 40;
  }
  return snap;
}
/** a little under the server's limit for a shared home (supabase/schema.sql home_snapshots, 196,608 bytes) */
const SHARE_BYTES = 190000;

/** A friend's home picture, made safe to draw (unknown rooms and pieces dropped, numbers and colours checked). */
export function sanitizeHome(raw: unknown): { name: string; home: HomeState } | null {
  if (!raw || typeof raw !== 'object' || (raw as { v?: unknown }).v !== 1) return null;
  const r = raw as { name?: unknown; rooms?: unknown; photos?: unknown };
  const st = repairHome({ rooms: r.rooms, storage: {}, known: [], uid: 1, photos: r.photos });
  if (!st || !Object.keys(st.rooms).length) return null;
  return { name: typeof r.name === 'string' ? r.name.slice(0, 24) : 'Farmer', home: st };
}

/** Share the home if it changed: at most every 5 minutes unless forced (leaving the home). Never throws. */
export async function publishHome(force = false): Promise<void> {
  if (busy || visiting.active || !game.state?.player.created) return;
  if (!force && Date.now() < nextAt) return;
  const snap = homeSnapshot();
  if (!snap) return;
  const key = `${online.me()?.id ?? ''}|${JSON.stringify(snap)}`;
  if (key === last) return;
  busy = true;
  try {
    await online.publishHome(snap);
    last = key;
    failures = 0;
    nextAt = Date.now() + PUBLISH_MS;
  } catch (e) {
    failures++;
    nextAt = Date.now() + Math.min(30 * 60000, 60000 * 2 ** (failures - 1));
    if (failures === 1) console.warn('[online] could not share the home yet, will retry', e);
  } finally {
    busy = false;
  }
}

let coffeeTimer = 0;
/** Who came over for coffee: a letter (one for several at once) and the callback for a toast. */
export function startHomeSync(onCoffee: (names: string[]) => void): void {
  if (coffeeTimer) return;
  const poll = async () => {
    if (document.hidden || !online.me()) return;
    try {
      const visits = await online.myCoffeeVisits();
      if (!visits.length) return;
      const names = [...new Set(visits.map((v) => v.guestName))];
      const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
      mail.send('game', names.length > 1 ? 'Friends came over for coffee' : `${names[0]} came over for coffee`,
        `${list} stopped by your Farmhouse for a cup of coffee and a look round. Your home must be a cosy one!`);
      onCoffee(names);
    } catch { /* offline or not signed in: try again later */ }
  };
  coffeeTimer = window.setInterval(() => void poll(), COFFEE_MS);
  setTimeout(() => void poll(), 20000);
  window.setInterval(() => { if (!document.hidden) void publishHome(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) void publishHome(true); });
  setTimeout(() => void publishHome(true), 8000);
}
