import { game } from '../systems/Game';
import { visiting } from '../systems/Visiting';
import { online } from '../online/Online';
import { onlineConfigured } from '../online/Connect';
import type { AccountBackend, PushBackend, PushDevice } from '../online/types';
import { readyEvents } from './Events';
import { planNotifications, planKey, sanitizeNotifyPrefs, type NotifyPrefs, type PlannedNotification } from './Plan';

/**
 * Phone notifications (Web Push), the game side.
 *
 * - Works where the browser has Web Push: Chrome on Android (also inside the Play Store app, which is
 *   Chrome), desktop Chrome / Edge / Firefox, and Safari on iPhone / iPad only when the game was added to
 *   the home screen (iOS 16.4 or newer). Needs real online play and a VAPID key in the build.
 * - The player switches it on in Settings > Notifications. Permission is only asked on that tap.
 * - This device's push subscription is saved to the server (save_push_subscription). Whenever timers change
 *   (and when the game goes to the background) the next day's reminders are planned (Plan.ts) and sent as
 *   the whole new schedule in one call (replace_push_schedule). The server sends them when they are due
 *   (supabase/functions/send-push); gifts and Shared Market sales are added by the server itself.
 * - Never breaks the game: everything is wrapped, failures retry calmly with a growing pause.
 */

export type PushAvailability =
  | 'ok'
  /** practice mode, or no VAPID key in this build */
  | 'not-configured'
  /** this browser cannot receive push messages */
  | 'unsupported'
  /** iPhone / iPad in Safari: add to the home screen first */
  | 'ios-install'
  /** iPhone / iPad home screen app without push: needs iOS 16.4 or newer */
  | 'ios-old'
  /** no service worker (development server, or the browser blocks it) */
  | 'no-sw';

export interface NotifyState {
  available: PushAvailability;
  /** this device gets notifications */
  on: boolean;
  /** the player wants them, but this device is not set up (another device, or permission was taken away) */
  elsewhere: boolean;
  /** notifications are blocked in the browser / phone settings */
  blocked: boolean;
  /** something could not reach the server yet and will be retried */
  waiting: boolean;
  /** the next planned reminder, if any */
  next: PlannedNotification | null;
}

const LS_KEY = 'cozy-acres-push';
const DEBOUNCE_MS = 4000;
/** while the game is on screen nothing is shown anyway (see push-sw.js), so it is only sent this often; leaving sends at once */
const MIN_GAP_MS = 2 * 60000;
/** resend an unchanged schedule this often, so the planning window keeps rolling forward */
const REFRESH_MS = 6 * 3600e3;
const MAX_BACKOFF_MS = 15 * 60000;

/** What this device remembers (localStorage, not the farm save: permission and subscription are per device). */
interface DeviceRecord {
  /** endpoint of this device's subscription, '' = not subscribed */
  endpoint: string;
  /** fingerprint of the device info + account last saved on the server */
  saved: string;
  /** planKey of the schedule last sent, and when */
  schedule: string;
  scheduleAt: number;
  /** endpoints to remove from the server (switched off while offline) */
  pendingDelete: string[];
}
const blank = (): DeviceRecord => ({ endpoint: '', saved: '', schedule: '', scheduleAt: 0, pendingDelete: [] });
function readRecord(): DeviceRecord {
  try {
    const r = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null') as Partial<DeviceRecord> | null;
    if (!r || typeof r !== 'object') return blank();
    const out = { ...blank(), ...r };
    out.pendingDelete = Array.isArray(out.pendingDelete) ? out.pendingDelete.filter((x) => typeof x === 'string').slice(-5) : [];
    return out;
  } catch { return blank(); }
}
let rec = readRecord();
function persist(): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(rec)); } catch { /* storage blocked */ }
}

const vapidKey = (): string => (import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim();
const backend = (): PushBackend | null => ('savePushDevice' in online ? online as unknown as PushBackend : null);
const accountId = (): string => (online as Partial<AccountBackend>).account?.()?.id ?? '';

const isIos = (): boolean => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function isStandalone(): boolean {
  try {
    return (navigator as Navigator & { standalone?: boolean }).standalone === true
      || ['standalone', 'fullscreen', 'minimal-ui'].some((m) => matchMedia(`(display-mode: ${m})`).matches);
  } catch { return false; }
}

/** The player's notification choices (in the save). */
export function notifyPrefs(): NotifyPrefs {
  game.state.notify ??= sanitizeNotifyPrefs(undefined);
  return game.state.notify;
}

let swMissing = false;

/** Can this device get notifications at all? (Fast, no waiting.) */
export function pushAvailability(): PushAvailability {
  if (!onlineConfigured() || !vapidKey() || !backend()) return 'not-configured';
  const hasPush = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIos() && !isStandalone()) return 'ios-install';
  if (!hasPush) return isIos() ? 'ios-old' : 'unsupported';
  if (swMissing) return 'no-sw';
  return 'ok';
}

const permission = (): NotificationPermission => ('Notification' in window ? Notification.permission : 'default');

let waiting = false;
let lastPlan: PlannedNotification[] = [];
const listeners = new Set<() => void>();
function notify(): void { for (const fn of [...listeners]) { try { fn(); } catch (e) { console.error('[notify]', e); } } }
/** Listen for changes (switched on/off, sync state); returns an unsubscribe function. */
export function onNotify(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }

export function notifyState(): NotifyState {
  const available = pushAvailability();
  const wants = !!game.state && notifyPrefs().enabled;
  const blocked = available === 'ok' && permission() === 'denied';
  const on = available === 'ok' && wants && !!rec.endpoint && permission() === 'granted';
  return { available, on, elsewhere: wants && !on, blocked, waiting: on && waiting, next: on ? lastPlan[0] ?? null : null };
}

/** The service worker registration, or null when there is none (development server, blocked). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) return reg;
    // still installing on the very first visit: wait a little for it
    return await Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 8000))]);
  } catch { return null; }
}

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return true; // browser does not tell: assume it is ours
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

/** This device's push subscription for the current VAPID key (made when missing, if allowed). */
async function subscription(create: boolean): Promise<PushSubscription | null> {
  const reg = await registration();
  if (!reg) { swMissing = true; return null; }
  swMissing = false;
  const key = keyBytes(vapidKey());
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options?.applicationServerKey, key)) {
    // the VAPID key changed (new keys were made): the old subscription cannot be used any more
    await sub.unsubscribe().catch(() => false);
    sub = null;
  }
  if (!sub && create) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  return sub;
}

function deviceInfo(sub: PushSubscription): PushDevice | null {
  const j = sub.toJSON();
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) return null;
  const p = notifyPrefs();
  let tz = 'UTC';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { /* old browser */ }
  return { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, tz, quietStart: p.quietStart, quietEnd: p.quietEnd, social: p.sales };
}

// ------------------------------------------------------------------------------- server sync

let timer = 0;
let busy = false;
let again = false;
let failures = 0;
let lastSendAt = 0;
let forceNext = false;
let currentSub: PushSubscription | null = null;

/** Plan and send soon (debounced). */
export function syncSoon(delay = DEBOUNCE_MS, force = false): void {
  if (force) forceNext = true;
  clearTimeout(timer);
  timer = window.setTimeout(() => void syncNow(), delay);
}

async function syncNow(): Promise<void> {
  if (busy) { again = true; return; }
  const pb = backend();
  if (!pb || !game.state) return;
  busy = true;
  const force = forceNext;
  forceNext = false;
  try {
    // 1. switched off while offline: tell the server
    for (const ep of [...rec.pendingDelete]) {
      await pb.deletePushDevice(ep);
      rec.pendingDelete = rec.pendingDelete.filter((x) => x !== ep);
      persist();
    }
    const st = notifyState();
    if (!st.on || visiting.active) { waiting = false; return; }
    // 2. this device (and its quiet hours) known to the server, for this account
    currentSub ??= await subscription(permission() === 'granted');
    const dev = currentSub && deviceInfo(currentSub);
    if (!dev) {
      // no permission any more (the service worker just not being ready yet is not a reason to forget it)
      if (!swMissing) { rec.endpoint = ''; persist(); }
      return;
    }
    if (dev.endpoint !== rec.endpoint) {
      // renewed by the browser or made for new VAPID keys: the old address goes from the server next time
      if (rec.endpoint && !rec.pendingDelete.includes(rec.endpoint)) rec.pendingDelete.push(rec.endpoint);
      rec.endpoint = dev.endpoint;
      rec.saved = '';
    }
    const devKey = () => JSON.stringify([dev, accountId()]);
    if (rec.saved !== devKey()) {
      await pb.savePushDevice(dev);
      rec.saved = devKey(); // account id is known once connected
      rec.schedule = ''; // a new account / device starts without a schedule
      persist();
    }
    // 3. the schedule, when it changed (or now and then, so the 24 hour window keeps rolling)
    lastPlan = planNotifications(readyEvents(game.state, game.now()), notifyPrefs(), Date.now());
    const key = planKey(lastPlan);
    const now = Date.now();
    if (force || key !== rec.schedule || now - rec.scheduleAt > REFRESH_MS) {
      if (!force && now - lastSendAt < MIN_GAP_MS && !document.hidden) { syncSoon(MIN_GAP_MS - (now - lastSendAt)); return; }
      lastSendAt = now;
      await pb.replacePushSchedule(lastPlan.map((p) => ({ fireAt: p.fireAt, kind: p.kind, title: p.title, body: p.body })));
      rec.schedule = key;
      rec.scheduleAt = Date.now();
      persist();
    }
    failures = 0;
    waiting = false;
  } catch (e) {
    failures++;
    waiting = true;
    if (failures === 1) console.warn('[notify] could not reach the server, will try again', e);
    syncSoon(Math.min(MAX_BACKOFF_MS, 30000 * 2 ** (failures - 1)));
  } finally {
    busy = false;
    notify();
    if (again) { again = false; syncSoon(500); }
  }
}

// ------------------------------------------------------------------------------- switching

/** Ask for permission (on a tap) and switch notifications on for this device. Returns null or a short reason. */
export async function enableNotifications(): Promise<null | 'blocked' | 'dismissed' | 'unavailable' | 'failed'> {
  if (pushAvailability() !== 'ok') return 'unavailable';
  // first thing on the tap: browsers only show the permission prompt for a user gesture
  let perm = permission();
  if (perm !== 'granted') {
    perm = await new Promise<NotificationPermission>((resolve) => {
      try {
        const p = Notification.requestPermission(resolve); // old Safari: callback only
        if (p) void p.then(resolve, () => resolve('default'));
      } catch { resolve('default'); }
    });
  }
  if (perm !== 'granted') { notify(); return perm === 'denied' ? 'blocked' : 'dismissed'; }
  try {
    currentSub = await subscription(true);
  } catch (e) {
    console.warn('[notify] could not subscribe', e);
    currentSub = null;
  }
  if (!currentSub) { notify(); return swMissing ? 'unavailable' : 'failed'; }
  notifyPrefs().enabled = true;
  rec.endpoint = currentSub.endpoint;
  rec.pendingDelete = rec.pendingDelete.filter((x) => x !== currentSub!.endpoint);
  rec.saved = '';
  persist();
  syncSoon(0, true);
  notify();
  return null;
}

/** Switch notifications off: forget this device on the server (now, or when back online) and stop the subscription. */
export async function disableNotifications(): Promise<void> {
  notifyPrefs().enabled = false;
  lastPlan = [];
  const ep = rec.endpoint || currentSub?.endpoint || '';
  if (ep && !rec.pendingDelete.includes(ep)) rec.pendingDelete.push(ep);
  rec.endpoint = '';
  rec.saved = '';
  rec.schedule = '';
  persist();
  try { await (currentSub ?? await subscription(false))?.unsubscribe(); } catch { /* already gone */ }
  currentSub = null;
  syncSoon(0);
  notify();
}

/** Change one choice (kinds, quiet hours) and resend what depends on it. */
export function setNotifyPref<K extends Exclude<keyof NotifyPrefs, 'enabled'>>(k: K, v: NotifyPrefs[K]): void {
  notifyPrefs()[k] = v;
  syncSoon(1500);
  notify();
}

/** Ask the server for a test notification (arrives within a few minutes, when the sender runs). */
export async function sendTestNotification(): Promise<boolean> {
  const pb = backend();
  if (!pb || !notifyState().on) return false;
  try {
    syncSoon(0);
    await pb.sendTestPush();
    return true;
  } catch (e) {
    console.warn('[notify] test', e);
    return false;
  }
}

// ------------------------------------------------------------------------------- start

let started = false;
/**
 * Keep the server schedule in step with the farm: after timer changes (planting, feeding, production,
 * the truck, the stall), when the game goes to the background, when the connection comes back, and every
 * 30 minutes while playing. Uses bus and DOM events only, never the frame loop.
 */
export function startNotifications(): void {
  if (started || pushAvailability() === 'not-configured') return;
  started = true;
  const kick = () => { if (notifyState().on || rec.pendingDelete.length) syncSoon(); };
  for (const ev of ['crop:planted', 'crop:harvested', 'tree:harvested', 'animal:fed', 'animal:collected', 'animal:bought',
    'production:queued', 'production:collected', 'building:placed', 'building:removed', 'building:complete', 'building:changed',
    'truck:changed', 'stall:changed'] as const) game.bus.on(ev, kick);
  document.addEventListener('visibilitychange', () => {
    // leaving: send right away (the timers are final for now); coming back: refresh
    if (document.hidden) { if (notifyState().on || rec.pendingDelete.length) { clearTimeout(timer); void syncNow(); } }
    else kick();
  });
  window.addEventListener('online', () => { if (failures) syncSoon(1000); });
  window.setInterval(() => { if (!document.hidden) kick(); }, 30 * 60000);
  // check this device once the game has settled: permission taken away, subscription renewed by the browser...
  setTimeout(() => {
    if (!notifyPrefs().enabled && !rec.pendingDelete.length) return;
    if (notifyPrefs().enabled && rec.endpoint && permission() !== 'granted') {
      // permission was taken away in the browser or phone settings: forget this device on the server too
      if (!rec.pendingDelete.includes(rec.endpoint)) rec.pendingDelete.push(rec.endpoint);
      rec.endpoint = '';
      rec.saved = '';
      persist();
      notify();
    }
    syncSoon(0);
  }, 6000);
}

/** Console helpers for testing: __notify.plan() shows what would be sent. */
(window as unknown as Record<string, unknown>).__notify = {
  plan: () => planNotifications(readyEvents(game.state, game.now()), { ...notifyPrefs(), enabled: true }, Date.now())
    .map((p) => ({ ...p, at: new Date(p.fireAt).toLocaleString() })),
  state: () => ({ ...notifyState(), record: { ...rec } }),
};
