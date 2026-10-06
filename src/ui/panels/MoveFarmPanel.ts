import { Panel } from '../Panel';
import { h, icon, button } from '../dom';
import { ui } from '../UI';
import { saves } from '../../systems/Save';
import { game } from '../../systems/Game';
import { NEW_HOST, moveLink, farmInHash, farmLinkData, farmCode, decodeFarm, clearFarmHash } from '../../systems/FarmMove';
import { confirmImport } from './SettingsPanel';
import { online } from '../../online/Online';

/** Settings > "Move my farm": the farm as a link for the new address. Only offered on github.io. */
export async function openMoveFarm(): Promise<void> {
  const json = saves.serialize();
  if (!json) { ui.feedback.toast('Could not read your farm', 'Try Export save instead.', 'cross'); return; }
  const link = await moveLink(json);
  const p = new Panel({ title: 'Move my farm', icon: 'truck', color: 'green', size: 'small' });
  const ta = h('textarea', { class: 'code-box', readonly: 'true', rows: '4', 'aria-label': 'Farm link' }) as HTMLTextAreaElement;
  ta.value = link;
  ta.addEventListener('pointerdown', (e) => e.stopPropagation());
  ta.addEventListener('focus', () => ta.select());
  p.body.append(
    h('div', { class: 'center', style: 'margin-bottom:8px' }, `Cozy Acres is moving to ${NEW_HOST}. Open this link after the move to bring your farm across.`),
    h('div', { class: 'muted center', style: 'margin-bottom:8px' }, 'Keep it somewhere safe, like a note or a message to yourself. The link holds your whole farm as it is right now, so make a new one if you play on.'),
    ta,
  );
  const done = (ok: boolean) => {
    if (ok) ui.feedback.toast('Link copied!', 'Keep it safe until the move.', 'check');
    else { ta.focus(); ta.select(); ui.feedback.toast('Copy it by hand', 'Select the text and copy it.', 'info'); }
  };
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (typeof nav.share === 'function') {
    p.footer.append(button([icon('hug'), 'Share'], async () => {
      try { await nav.share!({ title: 'My Cozy Acres farm', url: link }); } catch (e) { if ((e as Error).name !== 'AbortError') done(await copy(link)); }
    }, 'blue'));
  }
  p.footer.append(button('Copy link', async () => done(await copy(link)), 'green'));
  p.open();
}

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back */ }
  try {
    const ta = h('textarea', { style: 'position:fixed;opacity:0;top:0;left:0' }) as HTMLTextAreaElement;
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

/** Decode farm link data, check it like Import save and ask before loading. Never automatic. */
async function loadFarmData(data: string): Promise<boolean> {
  let r: ReturnType<typeof saves.parse>;
  try {
    r = saves.parse(await decodeFarm(data));
  } catch (e) {
    const msg = (e as Error).message;
    r = { error: msg.startsWith('This browser') ? msg : 'bad link' };
  }
  if ('error' in r) {
    const sub = r.error.startsWith('This browser') ? r.error : 'This farm link is damaged or incomplete. Make sure you copied all of it.';
    ui.feedback.toast('Could not open that farm link', sub, 'cross');
    return false;
  }
  confirmImport(r.data);
  return true;
}

/** Opening a move link (#farm=...). */
async function openFarmLink(data: string): Promise<void> {
  clearFarmHash();
  await loadFarmData(data);
}

/**
 * Settings > "Load a farm": type a short farm code or paste a whole farm link, inside the game. Needed in the Play
 * app, where a link opened from a message app lands in that app's own browser and its farm never reaches the game.
 */
export function openLoadFarm(): void {
  const p = new Panel({ title: 'Load a farm', icon: 'unlock', color: 'blue', size: 'small' });
  const ta = h('textarea', { class: 'code-box', rows: '3', placeholder: 'K7QM-2XPA', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Farm code or link' }) as HTMLTextAreaElement;
  ta.addEventListener('pointerdown', (e) => e.stopPropagation());
  p.body.append(
    h('div', { class: 'center', style: 'margin-bottom:8px' }, 'Type your farm code (8 letters and numbers), or paste a whole farm link.'),
    h('div', { class: 'muted center', style: 'margin-bottom:8px' }, 'Your current farm is kept as a backup in Settings > Previous farm.'),
    ta,
  );
  const clip = navigator.clipboard as Clipboard | undefined;
  if (typeof clip?.readText === 'function') {
    p.footer.append(button('Paste', async () => {
      try { ta.value = await clip.readText(); } catch { ta.focus(); ui.feedback.toast('Paste it by hand', 'Press and hold in the box, then Paste.', 'info'); }
    }, 'blue'));
  }
  let busy = false;
  p.footer.append(button('Load farm', async () => {
    if (busy) return;
    const text = ta.value;
    const link = farmLinkData(text);
    if (link) { if (await loadFarmData(link)) p.close(); return; }
    const code = farmCode(text);
    if (!code) { ui.feedback.toast('Check the code', 'Farm codes are 8 letters and numbers, like K7QM-2XPA.', 'cross'); return; }
    if (online.kind !== 'supabase') { ui.feedback.toast('Farm codes need online play', 'Paste the whole farm link instead.', 'cross'); return; }
    busy = true;
    try {
      if (await loadFarmData(await online.claimFarmTransfer(code))) p.close();
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === 'not found') ui.feedback.toast('Code not found', 'Check the letters, or ask for a new code (codes last 14 days).', 'cross');
      else if (/too many tries/.test(msg)) ui.feedback.toast('Too many tries', 'Wait an hour, then try again.', 'cross');
      else ui.feedback.toast('Could not reach the farm server', 'Check your internet and try again.', 'cross');
    } finally { busy = false; }
  }, 'green'));
  p.open();
}

const pending = farmInHash();
if (pending) {
  let shown = false;
  ui.onTick(() => {
    if (shown || !game.state) return;
    shown = true;
    setTimeout(() => void openFarmLink(pending), 900);
  });
}
