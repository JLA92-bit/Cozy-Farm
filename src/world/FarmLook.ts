/**
 * 1.10 Farm look: an optional, purely cosmetic season look (Settings > Farm look). It only leans the grass, the sky
 * and the drifting specks toward a season's colours and adds a few falling petals, leaves or snowflakes. It changes
 * nothing about how the game plays. 'off' is the normal look, 'auto' follows the real calendar.
 */
import { settings } from '../systems/Settings';

export type LookId = 'spring' | 'summer' | 'autumn' | 'winter';
export interface Look { id: LookId; name: string; grass: string; grassMix: number; sky: string; skyMix: number; pollen: string; fall: string[] | null; fallTex: string }

export const LOOKS: Record<LookId, Look> = {
  spring: { id: 'spring', name: 'Spring', grass: '#a6e86e', grassMix: 0.2, sky: '#c4ecff', skyMix: 0.18, pollen: '#ffc4e0', fall: ['#ffb3cf', '#ffd6e6'], fallTex: 'circle_05' },
  summer: { id: 'summer', name: 'Summer', grass: '#7fd04a', grassMix: 0.2, sky: '#8fd3f4', skyMix: 0, pollen: '#fff2a0', fall: null, fallTex: 'circle_05' },
  autumn: { id: 'autumn', name: 'Autumn', grass: '#cfa84a', grassMix: 0.4, sky: '#f2c9a0', skyMix: 0.2, pollen: '#ff9a4a', fall: ['#e8833a', '#d9473a', '#f2b33a'], fallTex: 'circle_05' },
  winter: { id: 'winter', name: 'Winter', grass: '#e3f0f6', grassMix: 0.6, sky: '#cbdce9', skyMix: 0.32, pollen: '#ffffff', fall: ['#ffffff'], fallTex: 'light_01' },
};
export const LOOK_CHOICES: { id: 'off' | 'auto' | LookId; label: string }[] = [
  { id: 'off', label: 'Off' }, { id: 'auto', label: 'Auto' }, { id: 'spring', label: 'Spring' }, { id: 'summer', label: 'Summer' }, { id: 'autumn', label: 'Autumn' }, { id: 'winter', label: 'Winter' },
];

/** The look to show right now (null = the normal look). */
export function currentLook(now = Date.now()): Look | null {
  const v = settings.farmLook ?? 'off';
  if (v === 'off') return null;
  if (v !== 'auto') return LOOKS[v];
  const m = new Date(now).getMonth();
  return LOOKS[m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'autumn' : 'winter'];
}
