import type { OnlineBackend } from './types';
import { LocalBackend } from './LocalBackend';

/**
 * The active online backend. Real online play is switched on by build-time settings
 * (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY); without them the game uses the local practice
 * backend. Game code always talks to `online` and must check `online.kind` to label practice mode.
 */
export let online: OnlineBackend = new LocalBackend();

/** Swap the backend (called once at boot when a real backend is configured, and by tests). */
export function setOnlineBackend(b: OnlineBackend): void { online = b; }
