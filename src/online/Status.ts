/**
 * Connection status shown to the player (Settings > Online play, and any online panel).
 * 'practice' = the local practice backend with demo neighbours (no server configured).
 */
export type OnlineStatus = 'practice' | 'connecting' | 'online' | 'offline';

let current: OnlineStatus = 'practice';
const listeners = new Set<(s: OnlineStatus) => void>();

export function onlineStatus(): OnlineStatus { return current; }

export function setOnlineStatus(s: OnlineStatus): void {
  if (s === current) return;
  current = s;
  for (const fn of [...listeners]) { try { fn(s); } catch (e) { console.error('[online status]', e); } }
}

/** Listen for status changes; returns an unsubscribe function. */
export function onOnlineStatus(fn: (s: OnlineStatus) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Short friendly label for the status. */
export function onlineStatusLabel(s = current): string {
  return s === 'practice' ? 'Practice mode' : s === 'online' ? 'Online' : s === 'offline' ? 'Offline' : 'Connecting...';
}
