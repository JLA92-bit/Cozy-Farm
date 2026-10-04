import { Panel } from '../Panel';
import { h, icon, button } from '../dom';
import { ui } from '../UI';
import { saves } from '../../systems/Save';
import { game } from '../../systems/Game';
import { NEW_HOST, moveLink, farmInHash, decodeFarm, clearFarmHash } from '../../systems/FarmMove';
import { confirmImport } from './SettingsPanel';

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

/** Opening a move link (#farm=...): check it like Import save and ask before loading. Never automatic. */
async function openFarmLink(data: string): Promise<void> {
  let r: ReturnType<typeof saves.parse>;
  try {
    r = saves.parse(await decodeFarm(data));
  } catch (e) {
    const msg = (e as Error).message;
    r = { error: msg.startsWith('This browser') ? msg : 'bad link' };
  }
  clearFarmHash();
  if ('error' in r) {
    const sub = r.error.startsWith('This browser') ? r.error : 'This farm link is damaged or incomplete. Make a new one, or use Export save and Import save.';
    ui.feedback.toast('Could not open that farm link', sub, 'cross');
    return;
  }
  confirmImport(r.data);
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
