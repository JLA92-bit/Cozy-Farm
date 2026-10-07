/**
 * 1.8 weather: one kind per local day, worked out from the farm seed so every device shows the same sky and
 * nothing needs saving. Sunny most days, some rain (crops planted today grow 5% faster, rare fish bite a little
 * more often), some soft mist. Never three rainy days in a row.
 */
import { game } from './Game';
import { localDay } from './Progression';
import { hashString, rng } from '../world/Procedural';

export type WeatherKind = 'sunny' | 'rain' | 'mist';

export const WEATHER: Record<WeatherKind, { name: string; icon: string; text: string }> = {
  sunny: { name: 'Sunny', icon: 'sun', text: 'A bright, sunny day on the farm.' },
  rain: { name: 'Rain', icon: 'rain', text: 'Crops planted today grow 5% faster, and rare fish bite more often.' },
  mist: { name: 'Mist', icon: 'mist', text: 'A soft, misty morning. Everything feels quiet and cosy.' },
};

/** Chances for each day before the "no three rainy days" rule. */
const CHANCE = { rain: 0.2, mist: 0.15 };
/** Crops planted on a rainy day take this much of their grow time. */
export const RAIN_GROWTH = 0.95;
/** Rare, legendary and mythic fish bite this much more often while it rains. */
export const RAIN_RARE_FISH = 1.25;

/** Days since 1970 for a local calendar day ('YYYY-MM-DD'), so neighbouring days are easy to step to. */
export function dayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

function roll(seed: number, n: number): WeatherKind {
  const x = rng(hashString(`${seed}:weather:${n}`))();
  return x < CHANCE.rain ? 'rain' : x < CHANCE.rain + CHANCE.mist ? 'mist' : 'sunny';
}

/** The weather on day number `n` for a farm seed. */
export function weatherOn(n: number, seed = game.state.seed): WeatherKind {
  const w = roll(seed, n);
  // a third rainy day in a row turns sunny (a kept rainy day always has a non-rainy roll one or two days back)
  if (w === 'rain' && roll(seed, n - 1) === 'rain' && roll(seed, n - 2) === 'rain') return 'sunny';
  return w;
}

/** Today's weather (local day). */
export function weatherToday(now = game.now()): WeatherKind {
  return weatherOn(dayNumber(localDay(now)));
}

/** Grow-time multiplier for a crop planted now: rain waters the fields. */
export function plantGrowthMult(now = game.now()): number {
  return weatherToday(now) === 'rain' ? RAIN_GROWTH : 1;
}
