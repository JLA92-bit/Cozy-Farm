import type { Quality } from '../core/Renderer';
import { detectQuality } from '../core/Renderer';

/** Device-level preferences (kept separate from the save so a reset keeps them). */
export interface Settings { music: number; sfx: number; haptics: boolean; quality: Quality; showFps: boolean }
const KEY = 'cozy-acres-settings';

export function loadSettings(): Settings {
  const def: Settings = { music: 0.5, sfx: 0.8, haptics: true, quality: detectQuality(), showFps: false };
  try { return { ...def, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return def; }
}
export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or blocked */ }
}
export const settings: Settings = loadSettings();
