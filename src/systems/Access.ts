import { settings, reducedMotion } from './Settings';
import { isNative } from '../core/Native';

/**
 * 1.47.3 accessibility: Text size and Reduce motion (Settings > Accessibility).
 * - Text size sets `--ts` on <html>; every font-size in the game's CSS is multiplied by it (vite.config.ts `accessCss`).
 * - Reduce motion puts `reduce-motion` on <html>: the `prefers-reduced-motion` CSS applies, animations and transitions
 *   finish at once, screen shake is off and particle effects are smaller.
 */
export type TextSize = 'normal' | 'large' | 'larger';
export const TEXT_SCALE: Record<TextSize, number> = { normal: 1, large: 1.15, larger: 1.3 };
export const TEXT_NAME: Record<TextSize, string> = { normal: 'Normal', large: 'Large', larger: 'Larger' };

/**
 * The phone's own text size in the store apps (Android Font size, iPhone Dynamic Type), from the TextZoom plugin.
 * 1 on the web, where the browser handles it. Read once at start (`readPhoneTextSize`); the app web view itself is
 * kept at 100% (Android MainActivity), so this setting is the only thing that scales the game's text.
 */
let phoneScale = 1;
export function phoneFontScale(): number { return phoneScale; }
export async function readPhoneTextSize(): Promise<void> {
  if (!isNative()) return;
  try {
    const { TextZoom } = await import('@capacitor/text-zoom');
    const { value } = await TextZoom.getPreferred();
    if (Number.isFinite(value) && value > 0) { phoneScale = value; if (!settings.textSize) applyAccess(); }
  } catch { /* plugin missing in an older app build */ }
}

/** The player's choice, or a size to match a big phone font in the Android app. */
export function textSize(): TextSize {
  if (settings.textSize) return settings.textSize;
  const f = phoneFontScale();
  return f >= 1.3 ? 'larger' : f >= 1.12 ? 'large' : 'normal';
}

export function motionReduced(): boolean {
  const m = settings.motion ?? 'auto';
  return m === 'on' || (m === 'auto' && reducedMotion());
}

const listeners: (() => void)[] = [];
/** Called after every change (and once now): the scene uses it for screen shake and effects. */
export function onAccessChange(fn: () => void): void { listeners.push(fn); fn(); }

export function applyAccess(): void {
  const root = document.documentElement;
  const k = TEXT_SCALE[textSize()];
  root.style.setProperty('--ts', String(k));
  // the always-on screen (top bar, dock, side shortcuts, place banners) grows a little only: it has no room to spare
  root.style.setProperty('--ts-hud', String(Math.min(k, 1.08)));
  root.dataset.textSize = textSize();
  root.classList.toggle('reduce-motion', motionReduced());
  for (const fn of listeners) fn();
}

// follow the phone when Reduce motion is on Auto
try { window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => applyAccess()); } catch { /* old browser */ }
