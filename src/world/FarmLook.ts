/**
 * 1.10 Farm look: an optional, purely cosmetic season look (Settings > Farm look). It only leans the grass, the sky
 * and the drifting specks toward a season's colours and adds a few falling petals, leaves or snowflakes. It changes
 * nothing about how the game plays. 'off' is the normal look, 'auto' follows the real calendar.
 */
import { settings } from '../systems/Settings';

export type LookId = 'spring' | 'summer' | 'autumn' | 'winter' | 'halloween';
export interface Look { id: LookId; name: string; grass: string; grassMix: number; sky: string; skyMix: number; pollen: string; fall: string[] | null; fallTex: string; mood?: number }

export const LOOKS: Record<LookId, Look> = {
  spring: { id: 'spring', name: 'Spring', grass: '#a6e86e', grassMix: 0.2, sky: '#c4ecff', skyMix: 0.18, pollen: '#ffc4e0', fall: ['#ffb3cf', '#ffd6e6'], fallTex: 'circle_05' },
  summer: { id: 'summer', name: 'Summer', grass: '#7fd04a', grassMix: 0.2, sky: '#8fd3f4', skyMix: 0, pollen: '#fff2a0', fall: null, fallTex: 'circle_05' },
  autumn: { id: 'autumn', name: 'Autumn', grass: '#cfa84a', grassMix: 0.4, sky: '#f2c9a0', skyMix: 0.2, pollen: '#ff9a4a', fall: ['#e8833a', '#d9473a', '#f2b33a'], fallTex: 'circle_05' },
  winter: { id: 'winter', name: 'Winter', grass: '#e3f0f6', grassMix: 0.6, sky: '#cbdce9', skyMix: 0.32, pollen: '#ffffff', fall: ['#ffffff'], fallTex: 'light_01' },
  // 1.20.1 October only (world/Halloween.ts): a dusky lilac sky, slightly autumn grass, orange specks, orange and purple leaves
  halloween: { id: 'halloween', name: 'Spooky season', grass: '#8a8a3e', grassMix: 0.38, sky: '#7a5aa8', skyMix: 0.62, pollen: '#ff9a2a', fall: ['#e8833a', '#8e5bc4', '#f2b33a', '#5b3a7a'], fallTex: 'circle_05', mood: 1 },
};
export const LOOK_CHOICES: { id: 'off' | 'auto' | Exclude<LookId, 'halloween'>; label: string }[] = [
  { id: 'off', label: 'Off' }, { id: 'auto', label: 'Auto' }, { id: 'spring', label: 'Spring' }, { id: 'summer', label: 'Summer' }, { id: 'autumn', label: 'Autumn' }, { id: 'winter', label: 'Winter' },
];

/** The look to show right now (null = the normal look). */
export function currentLook(now = Date.now()): Look | null {
  // 1.20.1 October's Halloween look comes first (players can switch it off in Settings)
  if (halloweenOn(now)) return LOOKS.halloween;
  const v = settings.farmLook ?? 'off';
  if (v === 'off') return null;
  if (v !== 'auto') return LOOKS[v];
  const m = new Date(now).getMonth();
  return LOOKS[m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'autumn' : 'winter'];
}

// ------------------------------------------------------------------ 1.20.1 Spooky season (see world/Halloween.ts)
/** True through October (local date), unless the player switched it off. */
export function halloweenOn(now = Date.now()): boolean {
  if (settings.halloween === false) return false;
  return halloweenSeason(now);
}
/** October, whatever the player's choice (the Settings row only shows then). */
export function halloweenSeason(now = Date.now()): boolean { return new Date(now).getMonth() === 9; }

/** Villagers dress up: a witch's hat or a pumpkin on their head. */
const COSTUME: Record<string, string> = { rosa: 'witch', tom: 'pumpkin', juniper: 'witch', pip: 'pumpkin', hazel: 'witch', bram: 'pumpkin' };
export function costume<T extends { hat: string }>(look: T, id: string): T {
  return halloweenOn() && COSTUME[id] ? { ...look, hat: COSTUME[id] } : look;
}
