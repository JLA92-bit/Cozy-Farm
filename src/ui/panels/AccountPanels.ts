import { Panel } from '../Panel';
import { h, icon, button, fmt } from '../dom';
import { ui } from '../UI';
import { game } from '../../systems/Game';
import { hints } from '../../systems/Hints';
import { audio } from '../../systems/Audio';
import {
  cloudHooks, cloudState, deleteOnlineAccount, signInWithGoogle, signOutOfGoogle, suggest, type FarmSummary,
} from '../../online/CloudSave';
import './account.css';

/** The Google "G" (official colours), inline so it works offline and needs no extra request. */
const G_LOGO = '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">'
  + '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>'
  + '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>'
  + '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>'
  + '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>'
  + '</svg>';

/** "Sign in with Google" in Google's own style: white button, coloured G. Disabled in practice mode. */
export function googleButton(): HTMLButtonElement {
  const b = h('button', { class: 'google-btn', type: 'button' }, h('span', { class: 'g-logo', html: G_LOGO }), h('span', { class: 'g-text' }, 'Sign in with Google'));
  if (!cloudState().available) { b.disabled = true; return b; }
  b.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (b.disabled) return;
    b.disabled = true;
    audio.play('tap');
    b.querySelector('.g-text')!.textContent = 'Opening Google...';
    try {
      await signInWithGoogle(); // leaves the page on success
    } catch (err) {
      console.warn('[account] sign in', err);
      ui.feedback.toast('Could not reach Google sign-in', 'Check your connection and try again. Your farm is safe on this device.', 'cloud', 'warn');
    }
    // still here (failed, or the browser kept the page): allow another try
    setTimeout(() => { b.disabled = false; b.querySelector('.g-text')!.textContent = 'Sign in with Google'; }, 2500);
  });
  return b;
}

export function ago(at: number): string {
  const m = Math.floor((Date.now() - at) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const hr = Math.floor(m / 60);
  return hr < 48 ? `${hr} h ago` : `${Math.floor(hr / 24)} days ago`;
}

function farmCard(title: string, f: FarmSummary, where: string, best: boolean): HTMLElement {
  return h('div', { class: `farm-choice${best ? ' best' : ''}` },
    h('div', { class: 'fc-head' }, h('span', { class: 'fc-title' }, title), best ? h('span', { class: 'fc-badge' }, 'Most progress') : null),
    h('div', { class: 'fc-name' }, `${f.name}'s farm`),
    h('div', { class: 'fc-stats' },
      h('span', null, icon('glowing_star'), `Level ${f.level}`),
      h('span', null, icon('coin'), fmt(f.coins)),
      h('span', null, icon('house'), `${f.buildings} buildings`)),
    h('div', { class: 'fc-meta muted' }, `Last played ${f.lastPlayed ? ago(f.lastPlayed) : 'never'}`),
    h('div', { class: 'fc-meta muted' }, where));
}

/** "We found a farm in the cloud": the player picks which farm to keep playing. */
export function openCloudChoice(local: FarmSummary, cloud: FarmSummary & { device: string; savedAt: number }): Promise<'local' | 'cloud'> {
  return new Promise((resolve) => {
    Panel.closeAll();
    const p = new Panel({ title: 'Cloud farm found', size: 'medium', color: 'blue', icon: 'cloud', closable: false });
    const best = suggest(local, cloud);
    p.body.append(
      h('div', { class: 'center fc-intro' }, 'We found a farm in the cloud'),
      h('div', { class: 'center', style: 'margin-bottom:10px' }, 'Your Google account already has a farm. Which one do you want to play?'),
      h('div', { class: 'farm-choices' },
        farmCard('On this device', local, 'Saved here', best === 'local'),
        farmCard('In the cloud', cloud, `Saved from ${cloud.device || 'another device'}${cloud.savedAt ? `, ${ago(cloud.savedAt)}` : ''}`, best === 'cloud')),
      h('div', { class: 'center muted', style: 'margin-top:10px' }, 'The farm you do not pick is kept on this device (Settings > Your farm), so nothing is lost.'),
    );
    let done = false;
    const pick = (v: 'local' | 'cloud') => { if (done) return; done = true; p.close(); resolve(v); };
    p.footer.append(
      button([icon('house'), 'Keep this farm'], () => pick('local'), best === 'local' ? 'green' : 'blue'),
      button([icon('cloud'), 'Load cloud farm'], () => pick('cloud'), best === 'cloud' ? 'green' : 'blue'),
    );
    p.open();
  });
}
cloudHooks.ask = openCloudChoice;

export function confirmSignOut(after: () => void): void {
  const p = new Panel({ title: 'Sign out?', size: 'small', color: 'blue', icon: 'cloud' });
  p.body.append(h('div', { class: 'center' }, 'Your farm stays on this device, but it will not be backed up any more. Sign in with Google again any time to pick up your cloud farm.'));
  p.footer.append(button('Stay signed in', () => p.close(), 'green'), button('Sign out', async () => {
    p.close();
    try {
      await signOutOfGoogle();
      ui.feedback.toast('Signed out', 'Your farm is still saved on this device.', 'cloud');
    } catch (e) {
      console.warn('[account] sign out', e);
      ui.feedback.toast('Could not sign out', 'Please try again in a moment.', 'cross', 'warn');
    }
    after();
  }, 'blue'));
  p.open();
}

/** Two steps: explain what goes, then "Are you sure?". */
export function confirmDeleteAccount(after: () => void): void {
  const p = new Panel({ title: 'Delete your online account?', size: 'small', color: 'pink', icon: 'cross' });
  p.body.append(
    h('div', { style: 'margin-bottom:8px' }, 'This deletes from our server: your public profile and friend code, your cloud save, your market listings and your gifts. Friends will no longer see you.'),
    h('div', { class: 'muted' }, 'Your farm on this device stays. The game gives you a fresh friend code the next time it goes online.'),
  );
  p.footer.append(button('Keep it', () => p.close(), 'green'), button('Delete', () => { p.close(); confirmDeleteFinal(after); }, 'red'));
  p.open();
}

function confirmDeleteFinal(after: () => void): void {
  const p = new Panel({ title: 'Are you sure?', size: 'small', color: 'pink', icon: 'cross' });
  p.body.append(h('div', { class: 'center' }, 'Your online account is deleted for good. This cannot be undone.'));
  const yes = button('Yes, delete forever', async () => {
    yes.disabled = true;
    try {
      await deleteOnlineAccount();
      p.close();
      ui.feedback.toast('Online account deleted', 'Your farm is still on this device.', 'check');
    } catch (e) {
      console.warn('[account] delete', e);
      p.close();
      ui.feedback.toast('Could not delete right now', 'Check your connection and try again, or email joshmakesgames92@gmail.com.', 'cross', 'warn');
    }
    after();
  }, 'red');
  p.footer.append(button('Cancel', () => p.close(), 'green'), yes);
  p.open();
}

// ------------------------------------------------------------------------------- gentle nudge

const NUDGE_LEVEL = 4;
/** Once: after the tutorial, from level 4, while not signed in: "Back up your farm". Respects the hints setting. */
function maybeNudge(): void {
  const st = cloudState();
  if (!st.available || !st.account?.anonymous || game.level < NUDGE_LEVEL || !game.state.tutorial.done || Panel.isOpen) return;
  if (!hints.firstTime('cloud-backup')) return;
  ui.feedback.toast('Back up your farm', 'Sign in with Google to keep it safe and play on other devices. Tap here.', 'cloud', 'tappable');
  const el = ui.feedback.toastStack.lastElementChild as HTMLElement | null;
  el?.addEventListener('click', () => { if (!Panel.isOpen) ui.open('settings'); }, { once: true });
}

let wired = false;
/** Wire the nudge (call once after boot). Timers and events only. */
export function wireAccountNudge(): void {
  if (wired) return;
  wired = true;
  game.bus.on('levelup', () => setTimeout(maybeNudge, 6000));
  // a light check now and then (skipped while a panel is open), until the nudge has been shown once
  const timer = window.setInterval(() => {
    if (hints.seen('cloud-backup')) { clearInterval(timer); return; }
    if (!document.hidden) maybeNudge();
  }, 60000);
}
