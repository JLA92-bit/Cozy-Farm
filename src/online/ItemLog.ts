/**
 * 1.46.1 The item log: every change to the barn, what caused it and what was left, so support can answer "where did
 * my wheat go?" (dashboard player page > Item history, ADMIN.md "Item history").
 *
 * Each `item` event on the bus carries a reason from game.as() (systems tag their own barn changes). Changes with no
 * tag take the reason from an action event fired in the same tick (a harvest, an order...), else "other". Changes
 * of the same item for the same reason close together are merged into one line, so a big harvest is a few lines.
 * The log is kept on the device (the newest LOCAL_MAX lines) and, with real online play, sent to the server in
 * batches (log_items, kept 120 days). When the game starts, barn counts that differ from the last ones the log saw
 * (a cloud farm, an import, another device) are logged as "loaded".
 */
import { game } from '../systems/Game';
import { online } from './Online';

export interface ItemLine {
  /** when (ms) */
  t: number;
  item: string;
  /** change: + in, - out */
  d: number;
  /** quality of items added (0 normal, 1 silver, 2 gold); for removals, the quality asked for if any */
  q: 0 | 1 | 2;
  /** reason, e.g. 'order', 'sell_extras', 'farmhand:workshop_start' */
  w: string;
  /** barn count of that item after the change */
  b: number;
  /** sent to the server */
  s?: 1;
}

const LOG_KEY = 'cozy-acres-item-log';
const BAL_KEY = 'cozy-acres-item-bal';
const LOCAL_MAX = 1500;
/** changes this close together (same item, reason, quality and direction) become one line */
const MERGE_MS = 120_000;
const SEND_EVERY_MS = 3 * 60_000;
const SEND_MAX = 300;
const WHY = /^[a-z0-9_:.-]{1,40}$/;

/** reasons for untagged changes, from the action events of the same tick */
const TICK_EVENTS: Record<string, string> = {
  'crop:harvested': 'harvest', 'tree:harvested': 'tree', 'animal:collected': 'animal', 'animal:fed': 'animal_feed',
  'production:queued': 'workshop_start', 'production:collected': 'workshop', 'order:completed': 'order',
  'crate:granted': 'crate', levelup: 'level_up', 'quest:completed': 'quest', achievement: 'achievement', mail: 'mail',
  'restoration:room': 'project',
};

const KNOCK_ON = new Set(['achievement', 'quest', 'level_up', 'mail', 'crate']);

let lines: ItemLine[] = [];
let bal: Record<string, number> = {};
let wired = false;
let tickWhy = '';
let pending: ItemLine[] = [];
let sending = false;
let saveTimer = 0;

function read<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; }
}
function store(): void {
  if (saveTimer) return;
  saveTimer = window.setTimeout(() => {
    saveTimer = 0;
    try { localStorage.setItem(LOG_KEY, JSON.stringify(lines)); localStorage.setItem(BAL_KEY, JSON.stringify(bal)); } catch { /* storage full or blocked */ }
  }, 10_000);
}

function push(l: ItemLine): void {
  bal[l.item] = l.b;
  if (!bal[l.item]) delete bal[l.item];
  // merge into a recent line for the same thing (not one already sent)
  for (let i = lines.length - 1; i >= 0 && i >= lines.length - 30; i--) {
    const o = lines[i];
    if (l.t - o.t > MERGE_MS) break;
    if (!o.s && o.item === l.item && o.w === l.w && o.q === l.q && Math.sign(o.d) === Math.sign(l.d)) {
      o.d += l.d; o.b = l.b; o.t = l.t;
      store();
      return;
    }
  }
  lines.push(l);
  if (lines.length > LOCAL_MAX) lines.splice(0, lines.length - LOCAL_MAX);
  store();
}

/** Untagged changes wait for the end of the tick, when the action event that caused them has fired. */
function settle(): void {
  const why = tickWhy || 'other';
  for (const l of pending) push({ ...l, w: l.w || why });
  pending = [];
  tickWhy = '';
}

/** Barn counts that changed while the log was not watching (cloud farm, import, another device). */
function checkLoaded(): void {
  const inv = game.state.inventory;
  const first = !Object.keys(bal).length && !lines.length;
  const t = game.now();
  for (const item of new Set([...Object.keys(inv), ...Object.keys(bal)])) {
    const now = inv[item] ?? 0, was = bal[item] ?? 0;
    if (now === was) continue;
    // the very first start only notes the counts (nothing to compare with)
    if (first) { if (now) bal[item] = now; continue; }
    push({ t, item, d: now - was, q: 0, w: 'loaded', b: now });
  }
  store();
}

async function send(): Promise<void> {
  if (sending || online.kind !== 'supabase') return;
  const batch = lines.filter((l) => !l.s).slice(0, SEND_MAX);
  // the newest lines may still grow: leave the last minute's for the next send unless the game is closing
  const cut = document.hidden ? Infinity : game.now() - 60_000;
  const ready = batch.filter((l) => l.t < cut);
  if (!ready.length) return;
  sending = true;
  try {
    const ok = await online.logItems(ready.map((l) => ({ t: l.t, i: l.item, d: l.d, q: l.q, w: l.w, b: l.b })));
    if (ok) { for (const l of ready) l.s = 1; store(); }
  } catch { /* try again next time */ } finally { sending = false; }
}

/** Start the log (once, after the save is loaded). */
export function wireItemLog(): void {
  if (wired) return;
  wired = true;
  lines = read<ItemLine[]>(LOG_KEY, []);
  if (!Array.isArray(lines)) lines = [];
  bal = read<Record<string, number>>(BAL_KEY, {});
  if (!bal || typeof bal !== 'object') bal = {};
  checkLoaded();
  for (const [ev, why] of Object.entries(TICK_EVENTS)) {
    // knock-on events (an achievement for a harvest) never win over the action that caused them
    game.bus.on(ev as 'levelup', () => { if (!tickWhy || (KNOCK_ON.has(tickWhy) && !KNOCK_ON.has(why))) tickWhy = why; });
  }
  game.bus.on('item', ({ item, delta, total, quality, why }) => {
    if (!delta) return;
    const w0 = why && WHY.test(why) ? why : '';
    const w = w0 && game.actor ? `${game.actor}:${w0}`.slice(0, 40) : w0 || (game.actor ? `${game.actor}:other` : '');
    const l: ItemLine = { t: game.now(), item, d: delta, q: (quality ?? 0) as 0 | 1 | 2, w, b: total };
    if (w) { push(l); return; }
    if (!pending.length) queueMicrotask(settle);
    pending.push(l);
  });
  window.setInterval(() => { void send(); }, SEND_EVERY_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    try { localStorage.setItem(LOG_KEY, JSON.stringify(lines)); localStorage.setItem(BAL_KEY, JSON.stringify(bal)); } catch { /* blocked */ }
    void send();
  });
}

/** The newest lines on this device, newest first (debug: __itemLog.lines()). */
export function itemLines(item?: string, n = 200): ItemLine[] {
  const out: ItemLine[] = [];
  for (let i = lines.length - 1; i >= 0 && out.length < n; i--) if (!item || lines[i].item === item) out.push(lines[i]);
  return out;
}

(window as unknown as { __itemLog: unknown }).__itemLog = { lines: itemLines, send, check: checkLoaded };
