import { h, icon, button } from '../dom';
import { ui } from '../UI';
import { game } from '../../systems/Game';
import { online } from '../../online/Online';
import { publishProfile } from '../../online/Connect';
import { onOnlineStatus, onlineStatus, onlineStatusLabel, type OnlineStatus } from '../../online/Status';

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

/** "Online play" section for the Settings panel: status, friend code (with copy) and public name. */
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
    h('div', { class: 'setting-row' }, h('label', null, 'Friend code'), h('div', { class: 'row', style: 'gap:8px' }, codeBox, copyBtn)),
    h('div', { class: 'setting-row' }, h('label', null, 'Public name'),
      h('div', { class: 'row', style: 'gap:8px' }, nameText, button([icon('farmer'), 'Edit'], onEditName, 'small blue'))),
  );

  const render = (s: OnlineStatus) => {
    if (!root.isConnected && off) { off(); off = null; return; }
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
