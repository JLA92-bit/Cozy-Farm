/**
 * 1.9 Dashboard settings: a few things the developer can change without a release (which weekday is market day, the
 * weather on one chosen date). They are read from the server once per start and kept in this browser, so the game
 * always has the last known values (or its normal defaults) and never waits on the network.
 */
import { online } from './Online';

export interface GameConfig {
  marketDay: number | null; weather: { date: string; kind: string } | null; upkeep: number; /** 1.28 co-op Village Projects on (default) or off */ coop: boolean;
  /** 1.33.3 the lowest app version that may still play, per store app (src/ui/UpdatePrompt.ts) */
  appMin: { android?: string; ios?: string };
}
const KEY = 'cozy-config-1.9';
const KINDS = ['sunny', 'rain', 'mist'];
const VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;

function clean(raw: Record<string, unknown>): GameConfig {
  const md = raw.market_day;
  const w = raw.weather as { date?: unknown; kind?: unknown } | undefined;
  const up = raw.upkeep;
  const am = (raw.app_min && typeof raw.app_min === 'object' ? raw.app_min : {}) as { android?: unknown; ios?: unknown };
  const ver = (v: unknown) => (typeof v === 'string' && VERSION.test(v) ? v : undefined);
  return {
    appMin: { android: ver(am.android), ios: ver(am.ios) },
    coop: raw.coop !== false,
    upkeep: typeof up === 'number' && Number.isFinite(up) ? Math.max(0, Math.min(2, up)) : 1,
    marketDay: typeof md === 'number' && Number.isInteger(md) && md >= 0 && md <= 6 ? md : null,
    weather: w && typeof w.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(w.date) && typeof w.kind === 'string' && KINDS.includes(w.kind) ? { date: w.date, kind: w.kind } : null,
  };
}

export const gameConfig: GameConfig = { marketDay: null, weather: null, upkeep: 1, coop: true, appMin: {} };

try { const saved = localStorage.getItem(KEY); if (saved) Object.assign(gameConfig, clean(JSON.parse(saved))); } catch { /* defaults */ }

/** Fetch the latest settings (online players only). Call once after the backend is ready. */
export async function loadGameConfig(): Promise<void> {
  try {
    if (online.kind !== 'supabase') return;
    const raw = await online.gameConfig();
    Object.assign(gameConfig, clean(raw));
    try { localStorage.setItem(KEY, JSON.stringify(raw)); } catch { /* private window */ }
  } catch { /* keep what we have */ }
}
