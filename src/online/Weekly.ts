import { game } from '../systems/Game';

/** Monday 00:00 UTC of the week containing `t`, as YYYY-MM-DD (the weekly leaderboard's week id). */
export function weekKey(t = Date.now()): string {
  const d = new Date(t);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow)).toISOString().slice(0, 10);
}

/** XP earned since Monday 00:00 UTC (real time, so the debug clock cannot inflate it). */
export function weeklyXp(): number {
  const w = game.state.weeklyXp;
  return w && w.week === weekKey() ? Math.floor(w.xp) : 0;
}

let wired = false;
/** Count every XP gain into the current week's total (resets when a new week starts). */
export function trackWeeklyXp(): void {
  if (wired) return;
  wired = true;
  game.bus.on('xp', ({ delta }) => {
    const s = game.state;
    if (!s || !(delta > 0)) return;
    const week = weekKey();
    if (!s.weeklyXp || s.weeklyXp.week !== week) s.weeklyXp = { week, xp: 0 };
    s.weeklyXp.xp += delta;
  });
}
