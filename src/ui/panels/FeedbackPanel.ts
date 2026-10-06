import { Panel } from '../Panel';
import { h, button } from '../dom';
import { ui } from '../UI';
import { online } from '../../online/Online';
import { ensureOnline } from '../../online/Profile';
import { platform } from '../../online/Activity';
import { game } from '../../systems/Game';
import { APP_VERSION } from '../../systems/Version';
import './friends.css';

const EMAIL = 'joshmakesgames92@gmail.com';
type Kind = 'bug' | 'idea' | 'praise' | 'other';
const KINDS: [Kind, string][] = [['bug', 'Something is wrong'], ['idea', 'An idea'], ['praise', 'I love it'], ['other', 'Other']];

/** Settings > Send feedback: goes straight to the developer's dashboard (or by email in practice mode). */
export function openFeedback(): void {
  const p = new Panel({ title: 'Send feedback', icon: 'light_bulb', color: 'blue', size: 'small' });
  let kind: Kind = 'bug';
  const seg = h('div', { class: 'segmented', style: 'flex-wrap:wrap;margin-bottom:8px' });
  const pick = (k: Kind) => { kind = k; seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.kind === k)); };
  for (const [k, label] of KINDS) seg.append(h('button', { type: 'button', dataset: { kind: k }, style: 'flex:1 1 40%', onclick: () => pick(k) }, label));
  pick('bug');
  const ta = h('textarea', { class: 'code-box', rows: '5', maxlength: '2000', placeholder: 'Tell us what happened, or what you would like...', 'aria-label': 'Your feedback' }) as HTMLTextAreaElement;
  ta.addEventListener('pointerdown', (e) => e.stopPropagation());
  p.body.append(
    h('div', { class: 'center', style: 'margin-bottom:8px' }, 'Thank you for helping make Cozy Acres better!'),
    seg, ta,
    h('div', { class: 'muted center', style: 'margin-top:6px' }, `Sent with your farmer name, level, game version (${APP_VERSION}) and phone model, so we can help.`),
  );
  let busy = false;
  p.footer.append(button('Send', async () => {
    const msg = ta.value.trim();
    if (!msg) { ta.focus(); ui.feedback.toast('Write a few words first', 'What would you like to tell us?', 'info'); return; }
    if (online.kind !== 'supabase') {
      location.href = `mailto:${EMAIL}?subject=${encodeURIComponent(`Cozy Acres feedback (${kind})`)}&body=${encodeURIComponent(`${msg}\n\nVersion ${APP_VERSION}`)}`;
      return;
    }
    if (busy) return;
    busy = true;
    try {
      await ensureOnline();
      await online.submitFeedback(kind, msg, { version: APP_VERSION, platform: platform(), device: navigator.userAgent, level: game.state.player.level });
      p.close();
      ui.feedback.toast('Thank you!', 'Your feedback was sent.', 'check');
    } catch (e) {
      const m = (e as Error).message;
      ui.feedback.toast('Could not send it', m === 'too many' ? 'That is a lot of messages today. Try again tomorrow.' : `Check your internet, or email ${EMAIL}.`, 'cross');
    } finally { busy = false; }
  }, 'green'));
  p.open();
}
