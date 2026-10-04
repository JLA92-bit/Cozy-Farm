import { Panel } from './Panel';
import { h, icon, button } from './dom';
import { ui } from './UI';

/**
 * "Add to home screen". Chrome/Edge/Samsung Internet fire `beforeinstallprompt`, which we keep so a button
 * can show the real install prompt later. Safari (iPhone/iPad) and some other browsers never fire it, so
 * they get short how-to steps instead. Already installed (home screen app or the Play Store app) = no button.
 */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
let installedNow = false;

/** Call once at startup, before the browser may fire the event. */
export function watchInstallPrompt(): void {
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep it for our own button instead of the browser's mini bar
    deferred = e as InstallPromptEvent;
  });
  addEventListener('appinstalled', () => { deferred = null; installedNow = true; });
}

/** Running as an installed app (home screen icon, or the Play Store app). */
export function isInstalled(): boolean {
  if (installedNow) return true;
  const standalone = ['standalone', 'fullscreen', 'minimal-ui'].some((m) => matchMedia(`(display-mode: ${m})`).matches);
  return standalone || (navigator as Navigator & { standalone?: boolean }).standalone === true || document.referrer.startsWith('android-app://');
}

const isIos = (): boolean => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** The Settings button, or null when the game is already installed. */
export function installButton(): HTMLElement | null {
  if (isInstalled()) return null;
  return button([icon('house'), 'Add to home screen'], () => void install(), 'small green');
}

async function install(): Promise<void> {
  if (deferred) {
    const ev = deferred;
    deferred = null; // the prompt can only be shown once
    try {
      await ev.prompt();
      const { outcome } = await ev.userChoice;
      if (outcome === 'accepted') ui.feedback.toast('Cozy Acres is on your home screen', 'Open it from there any time, even offline', 'house');
      return;
    } catch { /* fall through to the steps */ }
  }
  showSteps();
}

function showSteps(): void {
  const p = new Panel({ title: 'Add to home screen', icon: 'house', color: 'green', size: 'small' });
  const steps = isIos()
    ? ['In Safari, tap the Share button (the square with an arrow, at the bottom or top of the screen).', 'Scroll down and tap "Add to Home Screen".', 'Tap "Add". Cozy Acres now opens full screen from your home screen.']
    : ['Open your browser menu (the three dots, usually top right).', 'Tap "Add to Home screen" or "Install app".', 'Tap "Install" or "Add". Cozy Acres now opens full screen from your home screen.'];
  p.body.append(
    h('ol', { class: 'install-steps' }, ...steps.map((s) => h('li', null, s))),
    h('div', { class: 'muted' }, isIos() ? 'On iPhone and iPad this only works in Safari.' : 'Your farm stays the same - it is the same game, just one tap away.'),
  );
  p.footer.append(button('Got it', () => p.close(), 'green'));
  p.open();
}
