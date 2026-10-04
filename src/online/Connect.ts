import { ITEMS } from '../data';
import { game } from '../systems/Game';
import { LocalBackend } from './LocalBackend';
import { online, setOnlineBackend } from './Online';
import { ensureOnline, profileStats } from './Profile';
import { setOnlineStatus } from './Status';
import { SupabaseBackend } from './SupabaseBackend';
import { trackWeeklyXp } from './Weekly';

/** True when this build was made with a real online server (see ONLINE.md). */
export function onlineConfigured(): boolean {
  return !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

let configured = false;
/**
 * Pick the online backend once, at the very start of boot: Supabase when the build has its URL and
 * key, otherwise the local practice backend with demo neighbours. Also starts weekly XP tracking.
 */
/**
 * The Supabase project address, reduced to just https://<ref>.supabase.co. The dashboard also shows a
 * "RESTful endpoint" ending in /rest/v1; if that is pasted instead, sign-in links would point into the
 * database API ("No API key found in request"), so any path, query or trailing slash is dropped.
 */
export function projectUrl(raw: string | undefined): string {
  const v = (raw ?? '').trim();
  if (!v) return '';
  try { return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).origin; } catch { return v.replace(/\/+$/, ''); }
}

export function configureOnline(): void {
  if (configured) return;
  configured = true;
  trackWeeklyXp();
  const url = projectUrl(import.meta.env.VITE_SUPABASE_URL);
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (url && key) {
    setOnlineBackend(new SupabaseBackend(url, key));
    setOnlineStatus('connecting');
  } else {
    if (online instanceof LocalBackend) online.knownItems = (item) => !!ITEMS[item];
    setOnlineStatus('practice');
  }
}

const PUBLISH_MS = 60000;
const MAX_BACKOFF_MS = 10 * 60000;

let started = false;
let busy = false;
let failures = 0;
let nextAt = 0;
let held = false;

/**
 * Pause profile publishing (while the player chooses between this farm and a cloud farm, so the
 * account's public profile is not overwritten with the farm they may be about to replace).
 */
export function holdProfile(on: boolean): void { held = on; }

/** Publish this player's profile now (if they have made their farmer). Never throws. */
export async function publishProfile(force = false): Promise<void> {
  if (busy || held || !game.state?.player.created) return;
  if (!force && Date.now() < nextAt) return;
  busy = true;
  try {
    const firstConnect = !online.me();
    await ensureOnline(); // connects and publishes the first time
    if (!firstConnect) await online.upsertProfile(profileStats());
    failures = 0;
    nextAt = Date.now() + PUBLISH_MS;
  } catch (e) {
    failures++;
    nextAt = Date.now() + Math.min(MAX_BACKOFF_MS, PUBLISH_MS * 2 ** (failures - 1));
    if (failures === 1) console.warn('[online] could not reach the server, will retry', e);
    if (online.kind === 'supabase' && (!navigator.onLine || !online.me())) setOnlineStatus('offline');
  } finally {
    busy = false;
  }
}

/**
 * Keep the public profile fresh: every ~60 s while playing, on level up, when the farmer is
 * created, and when the tab is hidden or shown. Uses timers and DOM events only, never the frame loop.
 */
export function startOnlineSync(): void {
  if (started) return;
  started = true;
  window.setInterval(() => { if (!document.hidden) void publishProfile(); }, 15000);
  let levelTimer = 0;
  game.bus.on('levelup', () => {
    clearTimeout(levelTimer);
    levelTimer = window.setTimeout(() => void publishProfile(failures === 0), 1500);
  });
  game.bus.on('tutorial', ({ signal }) => { if (signal === 'character_done') void publishProfile(true); });
  document.addEventListener('visibilitychange', () => {
    // leaving: send the latest stats; coming back: try again right away if we were offline
    if (document.hidden) void publishProfile(failures === 0);
    else void publishProfile(failures > 0);
  });
  window.addEventListener('online', () => void publishProfile(true));
  window.addEventListener('offline', () => { if (online.kind === 'supabase') setOnlineStatus('offline'); });
  void publishProfile(true);
}
