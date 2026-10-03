import { h, icon, button } from '../dom';
import { ui } from '../UI';
import { game } from '../../systems/Game';
import { online } from '../../online/Online';
import { publishProfile } from '../../online/Connect';
import { onOnlineStatus, onlineStatus, onlineStatusLabel, type OnlineStatus } from '../../online/Status';
import { cloudState, onCloud, saveToCloudNow, type CloudState } from '../../online/CloudSave';
import { ago, confirmDeleteAccount, confirmSignOut, googleButton } from './AccountPanels';

const NOTES: Record<OnlineStatus, string> = {
  practice: 'Practice mode - demo neighbours. Friends, gifts and the market work on this device only, with pretend neighbours.',
  online: 'Connected. Share your friend code so friends can find your farm.',
  offline: 'No connection right now. Your farm is safe and keeps saving on this device. We will try again soon.',
  connecting: 'Saying hello to the neighbours...',
};

/** Copy text to the clipboard, with a fallback for browsers without the async clipboard API. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0;top:0;left:0', readonly: true }) as HTMLTextAreaElement;
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* not allowed */ }
    ta.remove();
    return ok;
  }
}

const CLOUD_TEXT: Record<CloudState['status'], (at: number) => string> = {
  off: () => 'Cloud save: off',
  idle: (at) => (at ? `Cloud save: saved ${ago(at)}` : 'Cloud save: not saved yet'),
  saving: () => 'Cloud save: saving...',
  error: (at) => `Cloud save: could not save${at ? ` (last saved ${ago(at)})` : ''}, will try again`,
  newer: () => 'Cloud save: paused - your cloud farm is from a newer version of the game',
};

/**
 * The Google account part: a disabled Google button in practice mode, "Sign in with Google" for
 * anonymous players, and the signed-in details with Save now, Sign out and Delete my online account.
 */
function accountBox(): HTMLElement {
  const box = h('div', { class: 'account-box' });
  let shown = '';
  let mounted = false;
  const render = () => {
    // stop listening once the Settings panel has closed
    if (box.isConnected) mounted = true;
    else if (mounted) { off?.(); off = null; clearInterval(timer); return; }
    const st = cloudState();
    const a = st.account;
    const key = `${st.available}|${a?.id}|${a?.anonymous}|${a?.email}|${st.status}|${st.lastSync}|${Math.floor(Date.now() / 60000)}`;
    if (key === shown) return;
    shown = key;
    box.replaceChildren();
    const deleteBtn = () => button([icon('cross'), 'Delete my online account'], () => confirmDeleteAccount(render), 'small red');
    if (!st.available) {
      box.append(h('div', { class: 'account-row' }, googleButton()),
        h('div', { class: 'muted account-note' }, 'Available when online play is switched on. Your farm is saved on this device.'));
      return;
    }
    if (!a || a.anonymous) {
      box.append(h('div', { class: 'account-row' }, googleButton()),
        h('div', { class: 'muted account-note' }, 'Back up your farm and play it on other devices, like the app. Your friend code stays the same.'));
      if (a) box.append(h('div', { class: 'account-actions' }, deleteBtn()));
      return;
    }
    const line = h('span', { class: `cloud-line ${st.status === 'error' || st.status === 'newer' ? 'error' : ''}` }, icon('cloud'), CLOUD_TEXT[st.status](st.lastSync));
    const saveBtn = button([icon('cloud'), 'Save now'], async () => {
      saveBtn.disabled = true;
      const ok = await saveToCloudNow();
      if (!ok && cloudState().status !== 'newer') ui.feedback.toast('Could not save to the cloud', 'Your farm is safe on this device. We will try again soon.', 'cloud', 'warn');
      else if (ok) ui.feedback.toast('Saved to the cloud', undefined, 'check');
      saveBtn.disabled = false;
      render();
    }, 'small blue');
    saveBtn.disabled = st.status === 'saving' || st.status === 'newer';
    box.append(
      h('div', { class: 'account-row' }, h('span', { class: 'account-who' }, `Signed in as ${a.email || a.name || 'your Google account'}`)),
      a.email && a.name ? h('div', { class: 'muted' }, a.name) : '',
      h('div', { class: 'account-row' }, line, saveBtn),
      h('div', { class: 'account-actions' }, button([icon('wave'), 'Sign out'], () => confirmSignOut(render), 'small blue'), deleteBtn()),
    );
  };
  let off: (() => void) | null = onCloud(render);
  const timer = window.setInterval(render, 30000);
  render();
  return box;
}

/** "Online play" section for the Settings panel: status, Google account and cloud save, friend code (with copy) and public name. */
export function onlineSettingsSection(onEditName: () => void): HTMLElement {
  const statusPill = h('span', { class: 'online-pill' });
  const note = h('div', { class: 'muted online-note' });
  const codeBox = h('span', { class: 'friend-code' }, '...');
  const copyBtn = button([icon('clipboard'), 'Copy'], async () => {
    const code = online.me()?.code;
    if (!code) return;
    const ok = await copyText(code);
    ui.feedback.toast(ok ? 'Friend code copied' : 'Could not copy', ok ? `Share ${code} with a friend` : `Your code is ${code}`, ok ? 'check' : 'info');
  }, 'small blue');
  copyBtn.disabled = true;
  const nameText = h('span', { class: 'muted' }, game.state.player.name);
  const root = h('div', { class: 'online-settings' },
    h('div', { class: 'section-title' }, 'Online play'),
    h('div', { class: 'setting-row' }, h('label', null, 'Status'), statusPill),
    note,
    accountBox(),
    h('div', { class: 'setting-row' }, h('label', null, 'Friend code'), h('div', { class: 'row', style: 'gap:8px' }, codeBox, copyBtn)),
    h('div', { class: 'setting-row' }, h('label', null, 'Public name'),
      h('div', { class: 'row', style: 'gap:8px' }, nameText, button([icon('farmer'), 'Edit'], onEditName, 'small blue'))),
  );

  let mounted = false;
  const render = (s: OnlineStatus) => {
    if (root.isConnected) mounted = true;
    else if (mounted) { off?.(); off = null; return; }
    statusPill.className = `online-pill ${s}`;
    statusPill.textContent = onlineStatusLabel(s);
    note.textContent = NOTES[s];
    const me = online.me();
    if (me?.code) { codeBox.textContent = me.code; copyBtn.disabled = false; }
    else codeBox.textContent = game.state.player.created ? (s === 'offline' ? 'Not yet' : '...') : 'Make your farmer first';
    nameText.textContent = me?.name ?? game.state.player.name;
  };
  let off: (() => void) | null = onOnlineStatus(render);
  render(onlineStatus());
  // connect (or refresh) when the panel opens, so the code shows up
  if (game.state.player.created) void publishProfile(true).then(() => render(onlineStatus()));
  return root;
}
