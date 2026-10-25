import { Capacitor } from '@capacitor/core';

/**
 * The Android app (Capacitor, from 1.32): the game's files are inside the app and served from https://localhost, so
 * anything that needs the public web address, the store page or the system browser comes from here. In a browser
 * (the website and the installed web app) everything works as before. The plugins load only inside the app.
 */

/** True inside the Android app. */
export const isNative = (): boolean => Capacitor.isNativePlatform();

/** The public game address (gift links and anything shared with other people point here, never at the app). */
export const SITE_URL = 'https://cozyacres.joshmakesgames.app/play/';
/** The app's Google Play page (to update the app). */
export const PLAY_URL = 'https://play.google.com/store/apps/details?id=app.joshmakesgames.cozyacres';
/** Where Google sends the player back to inside the app (also listed in Supabase > Auth > URL configuration). */
export const AUTH_RETURN = 'app.joshmakesgames.cozyacres://auth';

/** Open a page outside the game: the system browser in the app, a new tab on the web. */
export async function openExternal(url: string): Promise<void> {
  if (isNative()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
  } else window.open(url, '_blank', 'noopener');
}

/** Close the in-app browser opened by openExternal (after Google sends the player back). */
export async function closeExternal(): Promise<void> {
  if (!isNative()) return;
  const { Browser } = await import('@capacitor/browser');
  await Browser.close().catch(() => { /* already closed */ });
}

/** Call `cb` with every deep link the app is opened with (app.joshmakesgames.cozyacres://...). */
export function onDeepLink(cb: (url: string) => void): void {
  if (!isNative()) return;
  void import('@capacitor/app').then(({ App }) => App.addListener('appUrlOpen', (e) => cb(e.url)));
}
