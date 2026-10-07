/**
 * 1.8 game events for the developer dashboard (ADMIN.md, "1.8 Village"): small named moments like "finished
 * the welcome" or "gave Rosa a gift", stored per player by the server function log_event (at most 200 a day).
 * Only with real online play: in practice mode, or when anything goes wrong, logEvent quietly does nothing.
 */
import { online } from './Online';
import { game, QUALITY_MULT } from '../systems/Game';
import { visiting } from '../systems/Visiting';
import { FRIENDSHIP } from '../data';

const KIND = /^[a-z0-9_.:-]{1,40}$/;
/** a calm session never gets near this; it stops a runaway loop from flooding the server */
const MAX_PER_SESSION = 150;
let sent = 0;

/** Record one event (fire and forget). `detail` is a small flat object; long text is cut short. */
export function logEvent(kind: string, detail: Record<string, unknown> = {}): void {
  try {
    if (online.kind !== 'supabase' || visiting.active || !KIND.test(kind) || sent >= MAX_PER_SESSION) return;
    const d: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(detail).slice(0, 12)) {
      if (typeof v === 'number' && Number.isFinite(v)) d[k] = v;
      else if (typeof v === 'boolean') d[k] = v;
      else if (typeof v === 'string') d[k] = v.slice(0, 80);
    }
    sent++;
    void online.logEvent(kind, d).catch(() => {});
  } catch { /* statistics only */ }
}

/** How a gift landed, worked out from the friendship it gave (the event carries points, not the item). */
export function tasteFromPoints(delta: number, birthday: boolean): string {
  if (delta < 0) return 'dislike';
  const base = delta / (birthday ? FRIENDSHIP.birthdayMult : 1);
  let best = 'neutral', bd = Infinity;
  for (const [taste, pts] of Object.entries(FRIENDSHIP.gift)) {
    if (pts <= 0) continue;
    for (const m of QUALITY_MULT) {
      const d = Math.abs(pts * m - base);
      if (d < bd) { bd = d; best = taste; }
    }
  }
  return best;
}

let wired = false;

/**
 * Listen for the 1.8 moments the dashboard counts: gifts to villagers (villager, taste), hearts gained, daily
 * villager visits done, and Ask a friend activity (any new stat starting with "help", "ask" or "request"). The welcome logs its
 * own steps. Listening keeps the other 1.8 systems free of dashboard code.
 */
export function wireEventLog(isBirthday: (id: string) => boolean): void {
  if (wired) return;
  wired = true;
  game.bus.on('village:points', ({ id, delta, points, hearts, reason }) => {
    if (reason === 'gift') logEvent('gift', { villager: id, taste: tasteFromPoints(delta, isBirthday(id)), points: delta, birthday: isBirthday(id) });
    else if (reason === 'visit') logEvent('visit', { villager: id });
    const before = Math.floor((points - delta) / FRIENDSHIP.pointsPerHeart);
    if (hearts > before) logEvent('hearts', { villager: id, hearts, reason: reason.slice(0, 20) });
  });
  game.bus.on('stat', ({ stat, value, delta }) => {
    // help_received is older (neighbours helping on your farm, Update 5), not Ask a friend
    if (delta > 0 && /^(help|ask|request)/.test(stat) && stat !== 'help_received') logEvent('help', { stat, value });
  });
}
