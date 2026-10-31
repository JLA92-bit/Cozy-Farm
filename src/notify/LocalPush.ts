import { LocalNotifications } from '@capacitor/local-notifications';
import type { PlannedNotification } from './Plan';

/**
 * 1.34.3 notifications in the store apps, scheduled on the phone itself (no server, no Firebase): the same
 * plan the web sends to the server (Plan.ts) is handed to the phone's own alarm list. Gifts and market sales
 * still need server push, which comes later with FCM and APNs.
 */

/** Ids 7100-7199 are ours; the whole range is cleared before each new plan. */
const BASE = 7100, MAX = 64;

export type LocalPerm = 'granted' | 'denied' | 'prompt';

export async function localPermission(): Promise<LocalPerm> {
  try { const p = await LocalNotifications.checkPermissions(); return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'prompt'; } catch { return 'denied'; }
}

export async function askLocalPermission(): Promise<LocalPerm> {
  try { const p = await LocalNotifications.requestPermissions(); return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'prompt'; } catch { return 'denied'; }
}

export async function clearLocal(): Promise<void> {
  try {
    const pending = await LocalNotifications.getPending();
    const ours = pending.notifications.filter((n) => n.id >= BASE && n.id < BASE + 100).map((n) => ({ id: n.id }));
    if (ours.length) await LocalNotifications.cancel({ notifications: ours });
  } catch { /* nothing scheduled */ }
}

export async function scheduleLocal(plan: PlannedNotification[]): Promise<void> {
  await clearLocal();
  const now = Date.now();
  const list = plan.filter((p) => p.fireAt > now + 5000).slice(0, MAX);
  if (!list.length) return;
  await LocalNotifications.schedule({
    notifications: list.map((p, i) => ({ id: BASE + i, title: p.title, body: p.body, schedule: { at: new Date(p.fireAt), allowWhileIdle: true }, extra: { kind: p.kind } })),
  });
}

/** A test reminder in 5 seconds (Settings > Notifications > Send a test). */
export async function testLocal(): Promise<boolean> {
  try {
    await LocalNotifications.schedule({ notifications: [{ id: BASE + 99, title: 'Cozy Acres', body: 'Notifications are working. See you on the farm!', schedule: { at: new Date(Date.now() + 5000) } }] });
    return true;
  } catch { return false; }
}
