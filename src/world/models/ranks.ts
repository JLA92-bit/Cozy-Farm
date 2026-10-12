import * as THREE from 'three';
import { geo } from '../Procedural';

/**
 * 1.12 Leaderboard trophies: a stone podium with a big blocky number on it, in gold (1), silver (2), bronze (3) or
 * green wood (Top 10), and a flag in the colour of the board it was won on. Built from seven-segment digits so the
 * number reads from far away.
 */
export const RANK_BOARDS = ['level', 'farmValue', 'charm', 'weeklyXp'] as const;
export const RANK_TIERS = [1, 2, 3, 10] as const;
const ACCENT: Record<string, string> = { level: '#3fa9f5', farmValue: '#ffc93c', charm: '#ff8fb4', weeklyXp: '#6cc644' };
const METAL: Record<number, [string, string]> = { 1: ['#f2c14e', '#ffe08a'], 2: ['#c9d1d9', '#eef2f6'], 3: ['#c98a4b', '#e6b27a'], 10: ['#6cae4f', '#a8dc88'] };
const STONE = '#d9c7a3', STONE_DARK = '#b3a78d';

/** Segments a b c d e f g of each digit (top, top right, bottom right, bottom, bottom left, top left, middle). */
const DIGITS: Record<string, string> = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg' };

function digit(b: ReturnType<typeof geo>, ch: string, cx: number, y0: number, w: number, h: number, t: number, color: string, light: string): void {
  const on = DIGITS[ch] ?? '';
  const d = 0.16;
  const horiz = (y: number) => b.block(w, t, d, color, [cx, y, 0]);
  const vert = (x: number, y: number) => b.block(t, (h - 3 * t) / 2 + t, d, color, [cx + x, y, 0]);
  const top = y0 + h - t, mid = y0 + (h - t) / 2, bot = y0;
  const upperY = mid + t * 0.5, lowerY = bot + t * 0.5;
  if (on.includes('a')) horiz(top);
  if (on.includes('g')) horiz(mid);
  if (on.includes('d')) horiz(bot);
  if (on.includes('b')) vert(w / 2 - t / 2, upperY);
  if (on.includes('c')) vert(w / 2 - t / 2, lowerY);
  if (on.includes('f')) vert(-w / 2 + t / 2, upperY);
  if (on.includes('e')) vert(-w / 2 + t / 2, lowerY);
  // a lighter face on the front so the digit shines
  if (on.includes('a')) b.block(w - 0.04, 0.02, 0.02, light, [cx, top + t - 0.03, d / 2]);
}

export function rankGeometry(board: string, tier: number): THREE.BufferGeometry {
  const b = geo();
  const [metal, light] = METAL[tier];
  const text = String(tier);
  // podium: two stone steps
  b.cyl(0.62, 0.7, 0.1, STONE_DARK, [0, 0, 0], 14);
  b.block(0.9, 0.22, 0.5, STONE, [0, 0.1, 0]);
  b.block(0.96, 0.05, 0.56, STONE_DARK, [0, 0.32, 0]);
  // the number, big and blocky
  const w = text.length === 1 ? 0.5 : 0.36, h = text.length === 1 ? 0.82 : 0.7, t = text.length === 1 ? 0.13 : 0.1;
  const gap = 0.08;
  const start = -((text.length - 1) * (w + gap)) / 2;
  [...text].forEach((ch, i) => digit(b, ch, start + i * (w + gap), 0.4, w, h, t, metal, light));
  // a flag in the board's colour on a little pole
  b.cyl(0.015, 0.015, 0.7, '#7b6a4f', [0.42, 0.37, 0], 6);
  b.block(0.2, 0.14, 0.02, ACCENT[board] ?? '#ffffff', [0.52, 0.93, 0]);
  // bigger than life: the point is bragging rights, so it fills a 3x3 footprint
  const g = b.build();
  g.scale(3.1, 3.1, 3.1);
  return g;
}

export const RANK_PROC: Record<string, () => THREE.BufferGeometry> = {};
for (const board of RANK_BOARDS) for (const tier of RANK_TIERS) RANK_PROC[`rank_${board}_${tier}`] = () => rankGeometry(board, tier);
