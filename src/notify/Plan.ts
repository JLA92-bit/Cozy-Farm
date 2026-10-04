/**
 * Phone notifications: which reminders to send, and when. Pure functions only (no game, DOM or network),
 * so the rules are easy to test: `node tools/test-notify.mjs` runs them with fixed clocks.
 *
 * The game knows exactly when things finish. Whenever timers change, it turns them into "ready" events,
 * and planNotifications() makes a short, calm schedule for the next day out of them:
 *   - only the kinds the player switched on, only things that are still in the future
 *   - nothing during quiet hours: those move to the end of the quiet hours (local time)
 *   - at most one notification per kind in each 30 minute window (fires when the last of the group is ready;
 *     something ready soon after it joins too, up to 45 minutes after the first)
 *   - notifications of different kinds that land within 10 minutes of each other become one
 *   - at most 6 in total; the earliest are kept
 * The server sends the schedule (see supabase/schema.sql, replace_push_schedule, and supabase/functions/send-push).
 */

/** Client-side notification kinds (the server adds 'gift', 'market' and 'test'). */
export type NotifyKind = 'crops' | 'animals' | 'goods' | 'truck' | 'sales' | 'daily';
export const NOTIFY_KINDS: NotifyKind[] = ['crops', 'animals', 'goods', 'truck', 'sales', 'daily'];

/** The player's notification choices (kept in the save; see NewGame.ts / Save.ts). */
export interface NotifyPrefs {
  /** the player wants phone notifications (each device still needs its own permission) */
  enabled: boolean;
  crops: boolean;
  animals: boolean;
  goods: boolean;
  truck: boolean;
  /** gifts and market sales (also used by the server for gifts and Shared Market sales) */
  sales: boolean;
  daily: boolean;
  /** quiet hours, minutes after local midnight; equal = no quiet hours */
  quietStart: number;
  quietEnd: number;
}

export function defaultNotifyPrefs(): NotifyPrefs {
  return { enabled: false, crops: true, animals: true, goods: true, truck: true, sales: true, daily: true, quietStart: 21 * 60, quietEnd: 8 * 60 };
}

/** Repair prefs from a save (missing, older or hand-edited). */
export function sanitizeNotifyPrefs(v: unknown): NotifyPrefs {
  const def = defaultNotifyPrefs();
  if (!v || typeof v !== 'object' || Array.isArray(v)) return def;
  const o = v as Record<string, unknown>;
  const bool = (k: keyof NotifyPrefs) => (typeof o[k] === 'boolean' ? o[k] as boolean : def[k] as boolean);
  const mins = (k: 'quietStart' | 'quietEnd') => {
    const n = o[k];
    return typeof n === 'number' && Number.isFinite(n) ? ((Math.floor(n) % 1440) + 1440) % 1440 : def[k];
  };
  return {
    enabled: bool('enabled'), crops: bool('crops'), animals: bool('animals'), goods: bool('goods'), truck: bool('truck'),
    sales: bool('sales'), daily: bool('daily'), quietStart: mins('quietStart'), quietEnd: mins('quietEnd'),
  };
}

/** Something that becomes ready at a real (wall clock) time. `what` is a display name like "Wheat". */
export interface ReadyEvent { kind: NotifyKind; at: number; what?: string }

export interface PlannedNotification {
  /** primary kind, or 'mixed' when several kinds were joined */
  kind: NotifyKind | 'mixed';
  fireAt: number;
  title: string;
  body: string;
}

export interface PlanOptions {
  horizonMs: number;
  /** the daily reward reminder may be planned a little further ahead (tomorrow morning) */
  dailyHorizonMs: number;
  windowMs: number;
  joinMs: number;
  maxTotal: number;
  /** ignore things ready within this time from now (the player is looking at the farm right now) */
  minLeadMs: number;
}

export const PLAN_DEFAULTS: PlanOptions = {
  horizonMs: 24 * 3600e3,
  dailyHorizonMs: 36 * 3600e3,
  windowMs: 30 * 60e3,
  joinMs: 10 * 60e3,
  maxTotal: 6,
  minLeadMs: 2 * 60e3,
};

const minuteOfDay = (d: Date): number => d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;

/** Is this moment inside the quiet hours (local time)? */
export function inQuietHours(t: number, quietStart: number, quietEnd: number): boolean {
  if (quietStart === quietEnd) return false;
  const m = minuteOfDay(new Date(t));
  return quietStart < quietEnd ? m >= quietStart && m < quietEnd : m >= quietStart || m < quietEnd;
}

/** Move a moment inside the quiet hours to the end of them (local time, the next time the clock shows quietEnd). */
export function afterQuietHours(t: number, quietStart: number, quietEnd: number): number {
  if (!inQuietHours(t, quietStart, quietEnd)) return t;
  const d = new Date(t);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(quietEnd / 60), quietEnd % 60, 0, 0);
  if (end.getTime() <= t) end.setDate(end.getDate() + 1);
  return end.getTime();
}

/** The next time the local clock shows `minute` (after `t`). */
export function nextLocalTime(t: number, minute: number): number {
  const d = new Date(t);
  const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(minute / 60), minute % 60, 0, 0);
  if (at.getTime() <= t) at.setDate(at.getDate() + 1);
  return at.getTime();
}

interface Group { kinds: Map<NotifyKind, Map<string, number>>; first: number; fireAt: number }

const KIND_ORDER: Record<NotifyKind, number> = { crops: 0, animals: 1, goods: 2, sales: 3, truck: 4, daily: 5 };

/** "Wheat", "Wheat and corn", "Wheat, corn and 2 more" */
function nameList(names: string[]): string {
  const n = names.map((x) => x.toLowerCase());
  if (n.length <= 1) return n[0] ?? '';
  if (n.length === 2) return `${n[0]} and ${n[1]}`;
  if (n.length === 3) return `${n[0]}, ${n[1]} and ${n[2]}`;
  return `${n[0]}, ${n[1]} and ${n.length - 2} more`;
}
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** One sentence for one kind (used alone or joined with others). */
function partText(kind: NotifyKind, items: Map<string, number>): string {
  const names = [...items.keys()].filter(Boolean);
  const list = nameList(names);
  const verb = names.length > 1 ? 'are' : 'is';
  switch (kind) {
    case 'crops':
      return list ? `${cap(list)} ${verb} ready to harvest` : 'Your crops are ready to harvest';
    case 'animals':
      return list ? `Fresh ${list} ready to collect` : 'The animals have something for you';
    case 'goods':
      return list ? `${cap(list)} ${verb} ready to collect` : 'Your goods are ready';
    case 'sales':
      return list ? `A customer bought your ${list} at the stall` : 'Your stall made a sale';
    case 'truck':
      return 'The delivery truck is here. Fill its crates for big rewards';
    case 'daily':
      return 'Your daily reward is waiting. Keep your streak going';
  }
}

const TITLES: Record<NotifyKind, string> = {
  crops: 'Harvest time!',
  animals: 'The animals are calling',
  goods: 'Fresh goods are ready',
  sales: 'Your stall made a sale',
  truck: 'The truck is here!',
  daily: 'A gift for today',
};

function render(g: Group): PlannedNotification {
  const kinds = [...g.kinds.keys()].sort((a, b) => KIND_ORDER[a] - KIND_ORDER[b]);
  if (kinds.length === 1) {
    const k = kinds[0];
    return { kind: k, fireAt: g.fireAt, title: TITLES[k], body: `${partText(k, g.kinds.get(k)!)}.`.slice(0, 180) };
  }
  const parts = kinds.slice(0, 3).map((k) => partText(k, g.kinds.get(k)!));
  const more = kinds.length > 3 ? ' And more!' : '';
  return { kind: 'mixed', fireAt: g.fireAt, title: 'Busy day on the farm!', body: `${parts.join('. ')}.${more}`.slice(0, 180) };
}

function addTo(g: Group, e: ReadyEvent): void {
  const m = g.kinds.get(e.kind) ?? new Map<string, number>();
  const key = e.what ?? '';
  m.set(key, (m.get(key) ?? 0) + 1);
  g.kinds.set(e.kind, m);
}

/** Make the notification schedule (sorted by time) from ready events. `now` is wall clock ms. */
export function planNotifications(events: ReadyEvent[], prefs: NotifyPrefs, now: number, opt: Partial<PlanOptions> = {}): PlannedNotification[] {
  const o = { ...PLAN_DEFAULTS, ...opt };
  if (!prefs.enabled) return [];
  // 1. wanted, still to come, inside the horizon; quiet hours move to their end
  const list: ReadyEvent[] = [];
  for (const e of events) {
    if (!prefs[e.kind] || !Number.isFinite(e.at)) continue;
    if (e.at < now + o.minLeadMs) continue; // already done (or about to be, while the player watches)
    const at = afterQuietHours(e.at, prefs.quietStart, prefs.quietEnd);
    if (at > now + (e.kind === 'daily' ? o.dailyHorizonMs : o.horizonMs)) continue;
    list.push({ ...e, at });
  }
  list.sort((a, b) => a.at - b.at);

  // 2. per kind: one notification per window, fired when the last thing in the window is ready
  const groups: Group[] = [];
  const open = new Map<NotifyKind, Group>();
  for (const e of list) {
    const g = open.get(e.kind);
    // joins the open window, or follows its notification too closely (but a window never spans over 1.5 windows)
    if (g && (e.at - g.first <= o.windowMs || (e.at - g.fireAt < o.windowMs && e.at - g.first <= o.windowMs * 1.5))) {
      addTo(g, e);
      g.fireAt = Math.max(g.fireAt, e.at);
      continue;
    }
    const ng: Group = { kinds: new Map(), first: e.at, fireAt: e.at };
    addTo(ng, e);
    open.set(e.kind, ng);
    groups.push(ng);
  }
  groups.sort((a, b) => a.fireAt - b.fireAt);

  // 3. different kinds close together become one notification (at the later time)
  // (measured from the first of the joined ones, so a chain of events cannot keep pushing it later)
  const joined: Group[] = [];
  let joinStart = 0;
  for (const g of groups) {
    const last = joined[joined.length - 1];
    if (last && g.fireAt - joinStart <= o.joinMs) {
      for (const [k, items] of g.kinds) {
        const m = last.kinds.get(k) ?? new Map<string, number>();
        for (const [name, n] of items) m.set(name, (m.get(name) ?? 0) + n);
        last.kinds.set(k, m);
      }
      last.fireAt = g.fireAt;
      continue;
    }
    joined.push(g);
    joinStart = g.fireAt;
  }

  // 4. a calm day: the earliest few only
  return joined.slice(0, o.maxTotal).map(render);
}

/** A stable text key for a plan, to skip sending a schedule that did not change. Times are rounded to the minute. */
export function planKey(plan: PlannedNotification[]): string {
  return plan.map((p) => `${Math.round(p.fireAt / 60000)}|${p.kind}|${p.title}|${p.body}`).join('\n');
}
