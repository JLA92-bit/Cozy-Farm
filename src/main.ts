import './ui/fonts.css';
import './ui/styles.css';
import { registerSW } from 'virtual:pwa-register';
import { boot } from './scenes/Boot';
import { watchInstallPrompt } from './ui/Install';
import { saves, hasBackup, restoreBackup, NewerSaveError } from './systems/Save';
import './ui/halloween.css';
import { halloweenOn } from './world/FarmLook';

// 1.20.1 Spooky season: dress the loading screen (and later the whole UI) for October
if (halloweenOn()) {
  document.documentElement.classList.add('halloween');
  const runner = document.querySelector<HTMLImageElement>('.boot-runner');
  if (runner) runner.src = runner.src.replace('seedling.svg', 'ghost.svg');
  const tip = document.querySelector('.boot-tip');
  if (tip) tip.textContent = 'Brewing something spooky...';
}

/** Fetch the newest version of the game (service worker), then reload. */
async function updateAndReload(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
    const waiting = reg?.waiting ?? reg?.installing;
    if (waiting) {
      await new Promise<void>((done) => {
        navigator.serviceWorker.addEventListener('controllerchange', () => done(), { once: true });
        waiting.postMessage({ type: 'SKIP_WAITING' });
        setTimeout(done, 4000);
      });
    }
  } catch { /* no service worker: a plain reload fetches the new version */ }
  location.reload();
}

/** Friendly recovery screen when the farm fails to load (instead of a stuck loading bar). */
function showBootError(newer = false): void {
  const screen = document.getElementById('boot-screen');
  screen?.classList.remove('hidden');
  const tip = document.querySelector('.boot-tip');
  if (tip) tip.textContent = newer ? 'Your farm needs the latest version of Cozy Acres.' : 'Oops! Something went wrong loading the farm.';
  const hint = document.querySelector('.boot-hint');
  if (hint) hint.textContent = newer ? 'It was saved by a newer version of the game. Update to keep playing. Your farm is safe and has not been changed.' : 'Check your connection and try again. Your farm is saved safely.';
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
  if (newer) { btn('Update now', 'green', () => { void updateAndReload(); }); screen.append(row); return; }
  btn('Try again', 'green', () => location.reload());
  if (saves.loadAttempted && hasBackup()) btn('Load backup save', 'blue', () => { saves.locked = true; if (restoreBackup()) location.reload(); });
  screen.append(row);
}

// catch the browser's install prompt early so Settings > Add to home screen can use it
watchInstallPrompt();

boot().catch((e) => {
  console.error(e);
  // a half-booted game must not overwrite the save with broken state
  saves.locked = true;
  showBootError(e instanceof NewerSaveError);
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
      // games stay open for days on phones: look for a new version every 10 minutes while playing, and
      // right away when the player comes back (at most once a minute). The check only fetches sw.js.
      const check = (minGap: number) => {
        if (!navigator.onLine || document.hidden || Date.now() - lastCheck < minGap) return;
        lastCheck = Date.now();
        void reg.update().catch(() => {});
      };
      setInterval(() => check(10 * 60e3), 60e3);
      document.addEventListener('visibilitychange', () => check(60e3));
      addEventListener('focus', () => check(60e3));
      addEventListener('online', () => check(60e3));
    },
  });
}
