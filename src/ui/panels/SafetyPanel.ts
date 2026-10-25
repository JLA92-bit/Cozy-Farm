import { Panel } from '../Panel';
import { h, button, icon } from '../dom';
import { ui } from '../UI';
import { online } from '../../online/Online';
import { blocks } from '../../systems/Blocks';
import type { PlayerProfile, ReportPlace, ReportReason } from '../../online/types';
import { visitBannerHooks, visitedFarm } from '../../scenes/Visit';
import './friends.css';

/**
 * Reports and blocks (src/systems/Blocks.ts): Report and Block on player cards, gifts and visits, and the Blocked list
 * in Friends. Reports go to the developer's dashboard (Reports page).
 */

type Who = Pick<PlayerProfile, 'id' | 'name'>;
const REASONS: [ReportReason, string][] = [
  ['name', 'Rude or hurtful name'],
  ['message', 'Unkind gift note'],
  ['farm', 'Rude signs or pictures on their farm or home'],
  ['cheating', 'Cheating'],
  ['other', 'Something else'],
];

const isPlayer = (p: Who): boolean => !!p.id && p.id !== '__me' && p.id !== online.me()?.id;

/** Report a player, with an "Also block" box (ticked). giftId: the gift that was reported (its note is kept). */
export function openReport(p: Who, place: ReportPlace, giftId?: string): void {
  if (!isPlayer(p)) return;
  const name = p.name || 'Farmer';
  const panel = new Panel({ title: `Report ${name}`, icon: 'flag', color: 'pink', size: 'small' });
  let reason: ReportReason = place === 'gift' ? 'message' : place === 'visit' || place === 'home' ? 'farm' : 'name';
  const seg = h('div', { class: 'segmented report-reasons', role: 'radiogroup', 'aria-label': 'What is wrong?' });
  const pick = (r: ReportReason) => {
    reason = r;
    seg.querySelectorAll('button').forEach((b) => { const on = b.dataset.reason === r; b.classList.toggle('active', on); b.setAttribute('aria-checked', String(on)); });
  };
  for (const [r, label] of REASONS) seg.append(h('button', { type: 'button', role: 'radio', dataset: { reason: r }, onclick: () => pick(r) }, label));
  pick(reason);
  const ta = h('textarea', { class: 'code-box', rows: '3', maxlength: '300', placeholder: 'Anything else we should know? (optional)', 'aria-label': 'More about the report' }) as HTMLTextAreaElement;
  ta.addEventListener('pointerdown', (e) => e.stopPropagation());
  const also = h('input', { type: 'checkbox', id: 'report-block' }) as HTMLInputElement;
  also.checked = !blocks.has(p.id);
  panel.body.append(
    h('div', { class: 'section-title' }, 'What is wrong?'),
    seg, ta,
    h('label', { class: 'report-block', for: 'report-block', hidden: blocks.has(p.id) }, also, h('span', null, `Also block ${name}`)),
    h('div', { class: 'muted center', style: 'margin-top:6px' }, 'Reports go to the Cozy Acres team, who read every one within a day. The player is not told who reported them.'),
  );
  let busy = false;
  panel.footer.append(button('Cancel', () => panel.close(), 'grey'), button([icon('flag'), 'Send report'], async () => {
    if (busy) return;
    busy = true;
    try {
      await blocks.report(p, reason, ta.value, place, giftId);
      if (also.checked && !blocks.has(p.id)) await blocks.block(p).catch(() => ui.feedback.toast('Could not block', 'Try again from their card.', 'cloud'));
      panel.close();
      ui.feedback.toast('Thank you for telling us', also.checked ? `${name} is blocked. We will look at the report soon.` : 'We will look at it soon.', 'check');
    } catch (e) {
      ui.feedback.toast('Could not send the report', (e as Error).message === 'too many today' ? 'That is a lot of reports today. Try again tomorrow.' : 'Check your internet and try again.', 'cloud');
    } finally { busy = false; }
  }, 'red'));
  panel.open();
}

/** Ask, then block a player. `done` runs after blocking (to close the card it was opened from). */
export function confirmBlock(p: Who, done?: () => void): void {
  if (!isPlayer(p)) return;
  const name = p.name || 'Farmer';
  const panel = new Panel({ title: `Block ${name}?`, icon: 'no_entry', color: 'pink', size: 'small' });
  panel.body.append(h('div', { class: 'center' },
    `You and ${name} will not see each other's gifts, farms, homes, market goods or requests, and ${name} leaves your friends. `,
    'They are not told. You can unblock them in Friends.'));
  let busy = false;
  panel.footer.append(button('Cancel', () => panel.close(), 'grey'), button([icon('no_entry'), 'Block'], async () => {
    if (busy) return;
    busy = true;
    try {
      await blocks.block(p);
      panel.close();
      done?.();
      ui.feedback.toast(`${name} is blocked`, 'You can unblock them in Friends.', 'check');
    } catch { ui.feedback.toast('Could not block', 'Check your internet and try again.', 'cloud'); }
    finally { busy = false; }
  }, 'red'));
  panel.open();
}

/** Report and Block (or Unblock) as a small row, for player cards. Null for your own card. */
export function safetyRow(p: Who, close: () => void, place: ReportPlace = 'card'): HTMLElement | null {
  if (!isPlayer(p)) return null;
  const blocked = blocks.has(p.id);
  return h('div', { class: 'safety-row' },
    button([icon('flag'), 'Report'], () => openReport(p, place), 'small grey', { 'aria-label': `Report ${p.name || 'Farmer'}` }),
    blocked
      ? button([icon('unlock'), 'Unblock'], async () => {
        try { await blocks.unblock(p.id); close(); ui.feedback.toast(`${p.name || 'Farmer'} is unblocked`, '', 'check'); } catch { ui.feedback.toast('Could not unblock', 'Check your internet and try again.', 'cloud'); }
      }, 'small grey')
      : button([icon('no_entry'), 'Block'], () => confirmBlock(p, close), 'small grey', { 'aria-label': `Block ${p.name || 'Farmer'}` }));
}

/** Friends tab: the players you blocked, each with Unblock. Null when there are none. */
export function blockedList(): HTMLElement | null {
  if (!blocks.all.length) return null;
  const box = h('div', { class: 'list' });
  for (const b of blocks.all) {
    const un = button('Unblock', async () => {
      un.classList.add('disabled');
      try { await blocks.unblock(b.id); } catch { un.classList.remove('disabled'); ui.feedback.toast('Could not unblock', 'Check your internet and try again.', 'cloud'); }
    }, 'small grey');
    box.append(h('div', { class: 'list-item friend-item' }, icon('no_entry'), h('div', { class: 'grow' }, h('div', { class: 'title' }, b.name)), un));
  }
  return h('div', { class: 'blocked-list' }, h('div', { class: 'section-title' }, `Blocked (${blocks.all.length})`), box);
}

// a Report button on the banner while visiting someone's farm (signs and decor are theirs)
visitBannerHooks.push((ownerId, banner) => {
  const f = visitedFarm();
  if (!f || f.id !== ownerId || ownerId.startsWith('bot_')) return;
  const row = banner.querySelector('.visit-help-row') ?? banner;
  row.append(button(icon('flag'), () => openReport({ id: f.id, name: f.name }, 'visit'), 'small grey visit-report', { 'aria-label': `Report ${f.name || 'this farmer'}` }));
});
