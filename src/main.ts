import './ui/fonts.css';
import './ui/styles.css';
import { registerSW } from 'virtual:pwa-register';
import { boot } from './scenes/Boot';
import { saves, hasBackup, restoreBackup } from './systems/Save';

/** Friendly recovery screen when the farm fails to load (instead of a stuck loading bar). */
function showBootError(): void {
  const screen = document.getElementById('boot-screen');
  screen?.classList.remove('hidden');
  const tip = document.querySelector('.boot-tip');
  if (tip) tip.textContent = 'Oops! Something went wrong loading the farm.';
  const hint = document.querySelector('.boot-hint');
  if (hint) hint.textContent = 'Check your connection and try again. Your farm is saved safely.';
  if (!screen || screen.querySelector('.boot-actions')) return;
  const row = document.createElement('div');
  row.className = 'boot-actions';
  const btn = (label: string, cls: string, fn: () => void) => {
    const b = document.createElement('button');
    b.className = `btn ${cls}`;
    b.textContent = label;
    b.addEventListener('click', fn);
    row.append(b);
  };
  btn('Try again', 'green', () => location.reload());
  if (saves.loadAttempted && hasBackup()) btn('Load backup save', 'blue', () => { saves.locked = true; if (restoreBackup()) location.reload(); });
  screen.append(row);
}

boot().catch((e) => {
  console.error(e);
  // a half-booted game must not overwrite the save with broken state
  saves.locked = true;
  showBootError();
});

/**
 * PWA updates: a new version is installed in the background, then applied the next time the game
 * goes to the background (after saving), or right away if the player taps the update pill.
 */
if (import.meta.env.PROD) {
  let pill: HTMLElement | null = null;
  let lastCheck = Date.now();
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      if (pill) return;
      const apply = () => { saves.save(); saves.locked = true; void updateSW(true); };
      document.addEventListener('visibilitychange', () => { if (document.hidden) apply(); });
      pill = document.createElement('button');
      pill.className = 'update-pill';
      pill.textContent = 'A fresh update is ready - tap to refresh';
      pill.addEventListener('click', apply);
      document.body.append(pill);
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      // games stay open for days on phones: look for updates every few hours and on return
      const check = () => { if (navigator.onLine && Date.now() - lastCheck > 3 * 3600e3) { lastCheck = Date.now(); void reg.update().catch(() => {}); } };
      setInterval(check, 3600e3);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    },
  });
}
