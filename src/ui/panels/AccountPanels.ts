import { Panel } from '../Panel';
import { h, icon, button, fmt } from '../dom';
import { ui } from '../UI';
import { game } from '../../systems/Game';
import { hints } from '../../systems/Hints';
import { audio } from '../../systems/Audio';
import {
  cloudHooks, cloudState, deleteOnlineAccount, listCloudCopies, restoreCloudCopy, signInWithApple, signInWithGoogle, signOutOfGoogle, suggest, type FarmSummary,
} from '../../online/CloudSave';
import { appleSignIn } from '../../core/Native';
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

/** The Apple logo, white, for "Sign in with Apple" (Apple's own button style: black, white logo and text). */
const APPLE_LOGO = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#fff" d="M16.37 1.43c0 1.14-.49 2.27-1.18 3.08-.74.9-1.99 1.57-2.99 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.57-2.27 1.21-2.98.8-.94 2.14-1.64 3.25-1.68.03.13.05.28.05.43zm4.56 15.71c-.03.07-.46 1.58-1.52 3.12-.94 1.34-1.94 2.71-3.43 2.71-1.52 0-1.9-.88-3.63-.88-1.7 0-2.3.91-3.67.91-1.38 0-2.33-1.26-3.43-2.8-1.29-1.82-2.32-4.63-2.32-7.28 0-4.28 2.8-6.55 5.55-6.55 1.45 0 2.67.95 3.6.95.87 0 2.22-1.01 3.9-1.01.61 0 2.89.06 4.37 2.19-.13.09-2.38 1.37-2.38 4.19 0 3.26 2.85 4.42 2.96 4.45z"/></svg>';

/** "Sign in with Apple" in Apple's style. Only in the iPhone app (appleSignIn), next to Google. */
export function appleButton(): HTMLButtonElement {
  const label = 'Sign in with Apple';
  const b = h('button', { class: 'apple-btn', type: 'button' }, h('span', { class: 'a-logo', html: APPLE_LOGO }), h('span', { class: 'a-text' }, label));
  if (!cloudState().available) { b.disabled = true; return b; }
  b.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (b.disabled) return;
    b.disabled = true;
    audio.play('tap');
    b.querySelector('.a-text')!.textContent = 'Opening Apple...';
    try {
      await signInWithApple(); // leaves for Apple on success
    } catch (err) {
      console.warn('[account] sign in with Apple', err);
      ui.feedback.toast('Could not reach Apple sign-in', 'Check your connection and try again. Your farm is safe on this device.', 'cloud', 'warn');
    }
    setTimeout(() => { b.disabled = false; b.querySelector('.a-text')!.textContent = label; }, 2500);
  });
  return b;
}

/** The sign-in buttons for this device: Apple and Google in the iPhone app, Google everywhere else. */
export function signInButtons(): HTMLButtonElement[] {
  return appleSignIn() ? [appleButton(), googleButton()] : [googleButton()];
}

/** "Sign in with Google", or just "Sign in" where Apple is offered too. */
export const signInWords = (): string => (appleSignIn() ? 'Sign in' : 'Sign in with Google');

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

/** 1.33.5 Settings > Your farm > Earlier cloud farms: farms the server kept when the cloud farm was replaced. */
export async function openEarlierCloudFarms(): Promise<void> {
  const p = new Panel({ title: 'Earlier cloud farms', size: 'medium', color: 'blue', icon: 'cloud' });
  const list = h('div', { class: 'list' }, h('div', { class: 'center muted' }, 'Looking in the cloud...'));
  p.body.append(h('div', { class: 'muted', style: 'margin-bottom:8px' }, 'When your cloud farm is replaced by a different farm or a smaller one, we keep the old one here for 180 days (the last 5).'), list);
  p.footer.append(button('Close', () => p.close(), 'grey'));
  p.open();
  let copies;
  try { copies = await listCloudCopies(); } catch { list.replaceChildren(h('div', { class: 'center muted' }, 'Could not reach the cloud. Try again in a moment.')); return; }
  if (!copies.length) { list.replaceChildren(h('div', { class: 'center muted' }, 'Nothing here: your cloud farm has never been replaced.')); return; }
  list.replaceChildren(...copies.map((c) => h('div', { class: 'list-item' },
    icon('house', 'icon big'),
    h('div', { class: 'grow' },
      h('div', { class: 'title' }, `${c.name}'s farm - level ${c.level}`),
      h('div', { class: 'sub' }, `Saved ${ago(c.savedAt)}${c.device ? ` from ${c.device}` : ''}. Replaced ${ago(c.keptAt)} by ${c.reason === 'smaller' ? 'a smaller save' : 'another farm'}.`)),
    button('Bring back', () => {
      const ok = new Panel({ title: 'Bring this farm back?', size: 'small', color: 'blue', icon: 'cloud' });
      ok.body.append(h('div', { class: 'center' }, `${c.name}'s level ${c.level} farm replaces the farm you are playing now, on this device and in the cloud. The farm you are playing now is kept in Settings > Your farm > Previous farm, and in this list.`));
      ok.footer.append(button('Go back', () => ok.close(), 'grey'), button('Bring it back', async () => {
        ok.close();
        const err = await restoreCloudCopy(c.id).catch(() => 'Could not reach the cloud. Try again in a moment.');
        if (err) ui.feedback.toast('Could not bring it back', err, 'cloud', 'warn');
      }, 'green'));
      ok.open();
    }, 'small green'))));
}

/** "Are you sure?" before the farm with less progress replaces a bigger one. */
function confirmSmaller(v: 'local' | 'cloud', keep: FarmSummary, lose: FarmSummary, yes: () => void): void {
  const p = new Panel({ title: 'Are you sure?', size: 'small', color: 'pink', icon: 'info', closable: false });
  p.body.append(
    h('div', { class: 'center fc-intro' }, v === 'local' ? `Replace your level ${lose.level} cloud farm?` : `Swap this level ${lose.level} farm away?`),
    h('div', { class: 'center' }, v === 'local'
      ? `${lose.name}'s farm in the cloud is level ${lose.level}. Keeping the level ${keep.level} farm on this device replaces it in the cloud.`
      : `The farm on this device is level ${lose.level}. Loading the level ${keep.level} cloud farm puts it aside.`),
    h('div', { class: 'center muted', style: 'margin-top:8px' }, v === 'local'
      ? 'A copy is kept for 180 days: Settings > Your farm > Earlier cloud farms brings it back.'
      : 'It is kept on this device: Settings > Your farm > Previous farm brings it back.'),
  );
  p.footer.append(
    button('Go back', () => p.close(), 'green'),
    button(v === 'local' ? 'Yes, replace it' : 'Yes, load the cloud farm', () => { p.close(); yes(); }, 'red'),
  );
  p.open();
}

/** "We found a farm in the cloud": the player picks which farm to keep playing. */
export function openCloudChoice(local: FarmSummary, cloud: FarmSummary & { device: string; savedAt: number }): Promise<'local' | 'cloud'> {
  return new Promise((resolve) => {
    Panel.closeAll();
    const p = new Panel({ title: 'Cloud farm found', size: 'medium', color: 'blue', icon: 'cloud', closable: false });
    const best = suggest(local, cloud);
    p.body.append(
      h('div', { class: 'center fc-intro' }, 'We found a farm in the cloud'),
      h('div', { class: 'center', style: 'margin-bottom:10px' }, 'Your account already has a farm. Which one do you want to play?'),
      h('div', { class: 'farm-choices' },
        farmCard('On this device', local, 'Saved here', best === 'local'),
        farmCard('In the cloud', cloud, `Saved from ${cloud.device || 'another device'}${cloud.savedAt ? `, ${ago(cloud.savedAt)}` : ''}`, best === 'cloud')),
      h('div', { class: 'center muted', style: 'margin-top:10px' }, 'The farm you do not pick is kept on this device (Settings > Your farm), and a replaced cloud farm is kept in Settings > Your farm > Earlier cloud farms, so nothing is lost.'),
    );
    let done = false;
    const finish = (v: 'local' | 'cloud') => { if (done) return; done = true; p.close(); resolve(v); };
    // 1.33.5 picking the farm with less progress takes a second, clear yes (one wrong tap must not swap a big farm away)
    const pick = (v: 'local' | 'cloud') => {
      const keep = v === 'local' ? local : cloud;
      const lose = v === 'local' ? cloud : local;
      if (lose.totalXp > keep.totalXp) confirmSmaller(v, keep, lose, () => finish(v));
      else finish(v);
    };
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
  p.body.append(h('div', { class: 'center' }, `Your farm stays on this device, but it will not be backed up any more. ${signInWords()} again any time to pick up your cloud farm.`));
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
  ui.feedback.toast('Back up your farm', `${signInWords()} to keep it safe and play on other devices. Tap here.`, 'cloud', 'tappable');
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
