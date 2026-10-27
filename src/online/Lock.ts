import { online } from './Online';
import type { AccountLock } from './types';
import { assetUrl, iconPath } from '../core/Assets';

/**
 * Account locks (supabase/schema.sql "account locks", set from the dashboard's player page). A locked player sees a
 * full-screen notice over the game: the reason the developer typed, when the lock ends and a live countdown. The
 * server refuses their online actions anyway; this screen is what they see. The last known lock is kept on the
 * device, so it still shows offline, and it lifts by itself when the countdown ends (after asking the server).
 */

const KEY = 'cozy-acres-lock';
const CHECK_MS = 5 * 60000;
let current: AccountLock | null = null;
/** server clock minus this device's clock (ms), so the countdown is right even when the phone's clock is not */
let skew = 0;
let el: HTMLElement | null = null;
let tick = 0;
let started = false;
let checking = false;

const endsAt = (l: AccountLock): number | null => (l.until ? new Date(l.until).getTime() : null);
const serverNow = () => Date.now() + skew;
const active = (l: AccountLock | null): l is AccountLock => !!l && (endsAt(l) === null || (endsAt(l) as number) > serverNow());

function remember(l: AccountLock | null): void {
  try { if (l) localStorage.setItem(KEY, JSON.stringify({ ...l, skew })); else localStorage.removeItem(KEY); } catch { /* private window */ }
}

/** Is the player locked right now (as far as this device knows)? */
export function isLocked(): boolean { return active(current); }

/** Show the last known lock at once (before anything loads), then keep checking with the server. Call once at boot. */
export function watchAccountLock(): void {
  if (started) return;
  started = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const l = JSON.parse(raw) as AccountLock & { skew?: number };
      if (l && typeof l.reason === 'string') { skew = Number(l.skew) || 0; current = l; }
    }
  } catch { /* nothing kept */ }
  render();
  window.setInterval(() => { if (!document.hidden) void check(); }, CHECK_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void check(); });
  window.addEventListener('online', () => void check());
  window.addEventListener('cozy-account-locked', () => void check());
  setTimeout(() => void check(), 2500);
}

/** Ask the server for the lock (online players only). Keeps the last known lock when the server cannot be reached. */
export async function check(): Promise<void> {
  if (checking || online.kind !== 'supabase') return;
  checking = true;
  try {
    const l = await online.myLock();
    if (l) skew = new Date(l.now).getTime() - Date.now() || 0;
    current = l;
    remember(l);
  } catch { /* offline or the server is busy: keep what we know */ } finally {
    checking = false;
    render();
  }
}

// ------------------------------------------------------------------------------------------- the notice

function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return d > 0 ? `${d} day${d === 1 ? '' : 's'} ${two(h)}:${two(m)}:${two(sec)}` : `${two(h)}:${two(m)}:${two(sec)}`;
}

function when(ms: number): string {
  return new Date(ms - skew).toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
}

function render(): void {
  if (!active(current)) {
    window.clearInterval(tick);
    el?.remove();
    el = null;
    // a lock that ran out while the game was closed is forgotten too (it was kept on the device)
    if (current) { current = null; remember(null); }
    return;
  }
  const l = current;
  const end = endsAt(l);
  if (!el) {
    el = document.createElement('div');
    el.className = 'lock-screen';
    el.setAttribute('role', 'alertdialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'lock-title');
    // nothing behind the notice can be tapped or scrolled
    for (const ev of ['pointerdown', 'pointerup', 'click', 'touchstart', 'touchmove', 'wheel', 'keydown']) el.addEventListener(ev, (e) => { if (!(e.target as HTMLElement).closest('a')) e.stopPropagation(); }, { passive: true });
    document.body.append(el);
  }
  el.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'lock-card';
  const img = document.createElement('img');
  img.className = 'lock-icon';
  img.alt = '';
  img.src = assetUrl(iconPath('lock'));
  const title = document.createElement('h2');
  title.id = 'lock-title';
  title.textContent = 'Your account is locked';
  const until = document.createElement('p');
  until.className = 'lock-until';
  until.textContent = end === null ? 'You have been locked out of Cozy Acres.' : `You have been locked out of Cozy Acres until ${when(end)}.`;
  const why = document.createElement('div');
  why.className = 'lock-reason';
  const whyLabel = document.createElement('div');
  whyLabel.className = 'lock-label';
  whyLabel.textContent = 'Reason';
  const whyText = document.createElement('p');
  whyText.textContent = l.reason;
  why.append(whyLabel, whyText);
  const clock = document.createElement('div');
  clock.className = 'lock-clock';
  const clockLabel = document.createElement('div');
  clockLabel.className = 'lock-label';
  const clockValue = document.createElement('div');
  clockValue.className = 'lock-count';
  clock.append(clockLabel, clockValue);
  const help = document.createElement('p');
  help.className = 'lock-help';
  help.append('Your farm is safe and waiting for you. If you think this is a mistake, ');
  const a = document.createElement('a');
  a.href = '/support/';
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = 'contact support';
  help.append(a, '.');
  card.append(img, title, until, why, clock, help);
  el.append(card);

  const update = () => {
    if (end === null) { clockLabel.textContent = 'Time remaining'; clockValue.textContent = 'No end date'; return; }
    const left = end - serverNow();
    clockLabel.textContent = 'Time remaining';
    clockValue.textContent = countdown(left);
    if (left <= 0) {
      // time is up: ask the server (an admin may also have changed it), and lift the notice if it agrees
      window.clearInterval(tick);
      clockValue.textContent = 'Unlocking...';
      if (online.kind === 'supabase') void check().then(() => { if (active(current)) tick = window.setInterval(update, 30000); });
      else { current = null; remember(null); render(); }
    }
  };
  window.clearInterval(tick);
  update();
  tick = window.setInterval(update, 1000);
}
