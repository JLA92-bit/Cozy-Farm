import type { Quality } from '../core/Renderer';
import { detectQuality, detectShadows } from '../core/Renderer';

/** Device-level preferences (kept separate from the save so a reset keeps them). */
export interface Settings { music: number; sfx: number; haptics: boolean; quality: Quality; showFps: boolean; shake: boolean
  /** Shadows switch. Left unset until the player (or the blank-screen fallback) sets it; unset means "automatic". */
  shadows?: boolean;
  /** The quality the GPU blank-screen check has already passed (or been overridden by the player) at. */
  gpuChecked?: Quality }
const KEY = 'cozy-acres-settings';

function reducedMotion(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

export function loadSettings(): Settings {
  const def: Settings = { music: 0.5, sfx: 0.8, haptics: true, quality: detectQuality(), showFps: false, shake: !reducedMotion() };
  try { return { ...def, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return def; }
}
export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or blocked */ }
}
export const settings: Settings = loadSettings();

/** Shadows on/off: the player's choice if they ever made one, else on (off for GPUs known to break with them). */
export function shadowsWanted(): boolean { return settings.shadows ?? detectShadows(); }
