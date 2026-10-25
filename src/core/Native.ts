import { Capacitor } from '@capacitor/core';

/**
 * The Android app (Capacitor, from 1.32) and the iPhone app (ios/): the game's files are inside the app and served
 * from https://localhost (capacitor://localhost on iPhone), so anything that needs the public web address, the store
 * page or the system browser comes from here. In a browser (the website and the installed web app) everything works
 * as before. The plugins load only inside the app.
 */

/** True inside the Android or iPhone app. */
export const isNative = (): boolean => Capacitor.isNativePlatform();
/** True inside the iPhone app (ios/README.md). */
export const isIosApp = (): boolean => Capacitor.getPlatform() === 'ios';
/** True inside the Android app. */
export const isAndroidApp = (): boolean => Capacitor.getPlatform() === 'android';

/** The public game address (gift links and anything shared with other people point here, never at the app). */
export const SITE_URL = 'https://cozyacres.joshmakesgames.app/play/';
/** The app's Google Play page (to update the app). */
export const PLAY_URL = 'https://play.google.com/store/apps/details?id=app.joshmakesgames.cozyacres';
/** The app's App Store page. Empty until the app is in App Store Connect: then the id goes here (apps.apple.com/app/id...). */
export const APP_STORE_URL = '';
/** Where this app updates from: Google Play, the App Store (once it has a page) or nothing (the website). */
export const storeUrl = (): string => (isIosApp() ? APP_STORE_URL : isAndroidApp() ? PLAY_URL : '');
/**
 * "Sign in with Apple" in the iPhone app (App Store guideline 4.8: Google sign-in is offered, so Apple must be too).
 * Off until Apple is set up: an Apple Developer Services ID and key, and Apple switched on in Supabase (ios/README.md).
 */
export const APPLE_SIGN_IN = false;
/** Show the Apple button: in the iPhone app, once it is switched on. */
export const appleSignIn = (): boolean => APPLE_SIGN_IN && isIosApp();

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
