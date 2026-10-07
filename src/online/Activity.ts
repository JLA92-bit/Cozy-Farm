/**
 * For the developer dashboard (ADMIN.md): play statistics and gifts from the developer.
 * - A session start, then minutes played (counted only while the game is visible), sent every 5 minutes.
 * - Gifts from the developer (coins, gems, items, land) are picked up by themselves: on start, every few
 *   minutes and every time the game is opened again (comes back to the front or back online). Each is claimed once on the server, then added.
 * - 1.8: letters from the developer to every player arrive in the mailbox the same way, once each.
 * Only with real online play and once the farmer exists; never shown while visiting a neighbour.
 */
import { online } from './Online';
import { ensureOnline } from './Profile';
import { game } from '../systems/Game';
import { visiting } from '../systems/Visiting';
import { applyAdminGift } from '../systems/AdminGifts';
import { APP_VERSION } from '../systems/Version';
import { mail } from '../systems/Mail';
import type { AdminGift, AdminLetter, Platform } from './types';

const TICK_MS = 60000;
const BEAT_MINUTES = 5;
const GIFT_CHECK_MS = 5 * 60000;

/** Where the game runs: the Play Store app (TWA), an installed web app, or a browser tab. */
export function platform(): Platform {
  let p: string | null = null;
  try { p = sessionStorage.getItem('cozy-platform'); } catch { /* blocked */ }
  if (p === 'android' || p === 'pwa' || p === 'web' || p === 'ios') return p;
  const standalone = matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const out: Platform = document.referrer.startsWith('android-app://') ? 'android'
    : standalone ? (/iPhone|iPad|iPod/.test(navigator.userAgent) ? 'ios' : 'pwa') : 'web';
  try { sessionStorage.setItem('cozy-platform', out); } catch { /* blocked */ }
  return out;
}

/** Shows one received gift (set by the UI, so this file has no UI imports). */
export const adminGiftHooks: { show?: (g: AdminGift) => Promise<void> } = {};

let started = false;
let sessionSent = false;
let visibleMinutes = 0;
let lastGiftCheck = 0;
let checking = false;

async function checkGifts(): Promise<void> {
  if (checking || visiting.active || !game.state?.player.created) return;
  checking = true;
  lastGiftCheck = Date.now();
  try {
    await ensureOnline();
    for (const g of await online.adminGifts()) {
      if (visiting.active) break;
      let got: AdminGift;
      try { got = await online.claimAdminGift(g.id); } catch { continue; } // claimed elsewhere already
      applyAdminGift(got);
      await adminGiftHooks.show?.(got);
    }
    await checkLetters();
  } catch { /* offline: try again later */ } finally { checking = false; }
}

/** 1.8: letters the developer sent to every player, delivered to the mailbox once each (claimed first). */
async function checkLetters(): Promise<void> {
  for (const l of await online.adminLetters()) {
    if (visiting.active) break;
    let got: AdminLetter;
    try { got = await online.claimAdminLetter(l.id); } catch { continue; } // delivered already
    mail.send('team', got.title, got.body);
  }
}

async function tick(): Promise<void> {
  if (document.hidden || !game.state?.player.created) return;
  if (!sessionSent) {
    try { await ensureOnline(); } catch { return; }
    sessionSent = true;
    void online.logActivity(true, 0, platform(), APP_VERSION);
    void checkGifts();
    return;
  }
  visibleMinutes += TICK_MS / 60000;
  if (visibleMinutes >= BEAT_MINUTES) {
    visibleMinutes -= BEAT_MINUTES;
    void online.logActivity(false, BEAT_MINUTES, platform(), APP_VERSION);
  }
  if (Date.now() - lastGiftCheck >= GIFT_CHECK_MS) void checkGifts();
}

export function startActivity(): void {
  if (started || online.kind !== 'supabase') return;
  started = true;
  platform();
  window.setInterval(() => void tick(), TICK_MS);
  setTimeout(() => void tick(), 8000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    // back after a long break counts as a new session
    const away = Date.now() - lastGiftCheck;
    if (sessionSent && away > 30 * 60000) sessionSent = false;
    if (!sessionSent) void tick();
    // opening the game again: look for gifts straight away
    else if (away > 15000) void checkGifts();
  });
  window.addEventListener('online', () => { if (sessionSent) void checkGifts(); });
}
