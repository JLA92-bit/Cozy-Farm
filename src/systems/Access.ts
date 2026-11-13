import { settings, reducedMotion } from './Settings';
import { isNative } from '../core/Native';

/**
 * Accessibility (Settings > Accessibility). 1.47.3: Text size and Reduce motion; 1.47.4: more text sizes (to 200%),
 * Bars and buttons size, Bold text and High contrast.
 * - Text size sets `--ts` on <html>; every font-size in the game's CSS is multiplied by it (vite.config.ts `accessCss`).
 * - Bars and buttons size sets `--hz`, a CSS `zoom` on the HUD (top bar, goal card, side shortcuts, dock): the whole
 *   button grows, icons too. The HUD's own text grows a little with Text size (`--ts-hud`, at most 1.08) on top.
 * - Reduce motion puts `reduce-motion` on <html>: the `prefers-reduced-motion` CSS applies, animations and transitions
 *   finish at once, screen shake is off and particle effects are smaller.
 * - Bold text (`bold-text`) and High contrast (`high-contrast`) are classes on <html> (styles.css).
 */
export type TextSize = 'normal' | 'large' | 'larger' | 'largest' | 'huge' | 'max';
export const TEXT_SIZES: TextSize[] = ['normal', 'large', 'larger', 'largest', 'huge', 'max'];
export const TEXT_SCALE: Record<TextSize, number> = { normal: 1, large: 1.15, larger: 1.3, largest: 1.5, huge: 1.75, max: 2 };
export const TEXT_NAME: Record<TextSize, string> = { normal: 'Normal', large: 'Large', larger: 'Larger', largest: 'Largest', huge: 'Huge', max: 'Biggest' };

export type HudSize = 'normal' | 'large' | 'larger';
export const HUD_SCALE: Record<HudSize, number> = { normal: 1, large: 1.15, larger: 1.3 };
export const HUD_NAME: Record<HudSize, string> = { normal: 'Normal', large: 'Large', larger: 'Larger' };

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

/** The player's choice, or the biggest size not past the phone's own font size in the store apps. */
export function textSize(): TextSize {
  const s = settings.textSize;
  if (s && s in TEXT_SCALE) return s;
  const f = phoneFontScale() + 0.03;
  let pick: TextSize = 'normal';
  for (const t of TEXT_SIZES) if (TEXT_SCALE[t] <= f) pick = t;
  return pick;
}

export function hudSize(): HudSize {
  const s = settings.hudSize;
  return s && s in HUD_SCALE ? s : 'normal';
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
  // the always-on screen (top bar, dock, side shortcuts, place banners): its text grows a little only, the whole of it
  // grows with Bars and buttons size
  root.style.setProperty('--ts-hud', String(Math.min(k, 1.08)));
  // panel titles are big already: they stop growing at 140% so the screen keeps room for what is in it
  root.style.setProperty('--ts-title', String(Math.min(k, 1.4)));
  root.style.setProperty('--hz', String(HUD_SCALE[hudSize()]));
  root.dataset.textSize = textSize();
  root.dataset.hudSize = hudSize();
  root.classList.toggle('reduce-motion', motionReduced());
  root.classList.toggle('bold-text', !!settings.bold);
  root.classList.toggle('high-contrast', !!settings.contrast);
  for (const fn of listeners) fn();
}

// follow the phone when Reduce motion is on Auto
try { window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => applyAccess()); } catch { /* old browser */ }
