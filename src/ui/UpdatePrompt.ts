import { Panel } from './Panel';
import { h, button, icon } from './dom';
import { APP_STORE_URL, isAndroidApp, isIosApp, isNative, openExternal, storeUrl } from '../core/Native';
import { gameConfig, loadGameConfig } from '../online/GameConfig';
import { APP_VERSION, compareVersions } from '../systems/Version';
import { localDay } from '../systems/Progression';
import { assetUrl, iconPath } from '../core/Assets';

/**
 * 1.33.3 "An update is ready" in the store apps (the website updates itself). Two levels:
 * - gentle: the store says a newer version is live (Google Play's in-app updates; the App Store's lookup by app id,
 *   once APP_STORE_URL is set), so a card offers Update or Later, at most once a day for each new version;
 * - must update: the dashboard's game setting `app_min` (supabase/schema.sql admin_set_game_config) names the lowest
 *   version that may still play (for a server change old builds cannot follow); below it a full-screen notice asks the
 *   player to update. Raise it only once the new build is live in that store.
 * Plugin: @capawesome/capacitor-app-update (loaded only inside the app). Debug: `__update.card('1.40.0')`, `__update.must()`.
 */

const SEEN_KEY = 'cozy-acres-update-seen';
const storeName = (): string => (isIosApp() ? 'App Store' : 'Google Play');
const appStoreId = (): string | undefined => APP_STORE_URL.match(/id(\d+)/)?.[1];

/** The newer version live in the store, or null (not in a store app, up to date, or the store cannot be reached). */
async function storeVersion(): Promise<string | null> {
  if (!isNative() || (isIosApp() && !appStoreId())) return null;
  try {
    const { AppUpdate, AppUpdateAvailability } = await import('@capawesome/capacitor-app-update');
    const info = await AppUpdate.getAppUpdateInfo();
    if (info.updateAvailability !== AppUpdateAvailability.UPDATE_AVAILABLE) return null;
    return info.availableVersionName ?? 'new';
  } catch { return null; }
}

/** Off to the store: Google's own update screen when Play allows it, otherwise the store page. */
async function update(): Promise<void> {
  try {
    const { AppUpdate } = await import('@capawesome/capacitor-app-update');
    if (isAndroidApp()) {
      const info = await AppUpdate.getAppUpdateInfo();
      if (info.immediateUpdateAllowed) { await AppUpdate.performImmediateUpdate(); return; }
      await AppUpdate.openAppStore();
      return;
    }
    const appId = appStoreId();
    if (appId) { await AppUpdate.openAppStore({ appId }); return; }
  } catch { /* fall back to the store page */ }
  const url = storeUrl();
  if (url) await openExternal(url);
}

/** The gentle card. */
function showCard(version: string): void {
  const p = new Panel({ title: 'Update ready', icon: 'sparkles', color: 'green', size: 'small' });
  p.body.append(
    h('div', { class: 'center update-card' },
      h('div', { class: 'update-title outlined' }, version === 'new' ? 'A new Cozy Acres is ready' : `Cozy Acres ${version} is ready`),
      h('p', null, `Get the latest from ${storeName()}: new things to do and fixes. Your farm is saved and stays just as it is.`)));
  p.footer.append(button('Later', () => p.close(), 'grey'), button([icon('sparkles'), 'Update'], () => { p.close(); void update(); }, 'green'));
  p.open();
}

let blocker: HTMLElement | null = null;

/** The must-update notice: covers the game until the player updates. */
function showMust(min: string): void {
  if (blocker) return;
  const el = document.createElement('div');
  el.className = 'lock-screen update-screen';
  el.setAttribute('role', 'alertdialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'update-title');
  for (const ev of ['pointerdown', 'pointerup', 'click', 'touchstart', 'touchmove', 'wheel', 'keydown']) el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
  const img = document.createElement('img');
  img.className = 'lock-icon';
  img.alt = '';
  img.src = assetUrl(iconPath('sparkles'));
  const title = document.createElement('h2');
  title.id = 'update-title';
  title.textContent = 'Time to update';
  const text = document.createElement('p');
  text.className = 'lock-until';
  text.textContent = `This version of Cozy Acres (${APP_VERSION}) needs an update. Get ${min} or newer from ${storeName()} to keep playing.`;
  const safe = document.createElement('p');
  safe.className = 'lock-help';
  safe.textContent = 'Your farm is saved on this phone and waiting for you.';
  const go = button([icon('sparkles'), 'Update now'], () => void update(), 'green');
  const card = document.createElement('div');
  card.className = 'lock-card';
  card.append(img, title, text, safe, go);
  el.append(card);
  document.body.append(el);
  blocker = el;
}

/** Below the dashboard's minimum for this store app? */
function tooOld(): string | null {
  const min = isIosApp() ? gameConfig.appMin.ios : isAndroidApp() ? gameConfig.appMin.android : undefined;
  return min && compareVersions(APP_VERSION, min) < 0 ? min : null;
}

let checking = false;
/** Look for an update now (at start and when the app comes back); the card shows once a day for each version. */
export async function checkForUpdate(): Promise<void> {
  if (!isNative() || checking) return;
  checking = true;
  try {
    await loadGameConfig();
    const min = tooOld();
    if (min) { showMust(min); return; }
    const v = await storeVersion();
    if (!v) return;
    const seen = `${v}|${localDay(Date.now())}`;
    let last: string | null = null;
    try { last = localStorage.getItem(SEEN_KEY); } catch { /* blocked */ }
    if (last === seen || Panel.isOpen) return;
    try { localStorage.setItem(SEEN_KEY, seen); } catch { /* blocked */ }
    showCard(v);
  } finally { checking = false; }
}

/** Called once the farm is on screen. */
export function startUpdateChecks(): void {
  Object.assign(window as unknown as Record<string, unknown>, { __update: { card: (v = '9.9.9') => showCard(v), must: (v = '9.9.9') => showMust(v), check: checkForUpdate } });
  if (!isNative()) return;
  // the last known minimum works offline too
  const min = tooOld();
  if (min) showMust(min);
  setTimeout(() => void checkForUpdate(), 8000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void checkForUpdate(); });
}

