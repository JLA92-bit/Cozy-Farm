import { h, icon, button } from '../dom';
import { ui } from '../UI';
import { audio } from '../../systems/Audio';
import {
  disableNotifications, enableNotifications, notifyPrefs, notifyState, onNotify, sendTestNotification, setNotifyPref, syncSoon,
  type NotifyState,
} from '../../notify/Push';
import type { NotifyKind, NotifyPrefs } from '../../notify/Plan';
import './notify.css';

/**
 * Settings > Notifications: the master switch (asks for permission only when tapped), what to be told
 * about, and quiet hours. Unavailable (practice mode, no push in this browser, iPhone outside the home
 * screen) shows a short explanation instead.
 */

const KINDS: { id: NotifyKind; label: string; icon: string }[] = [
  { id: 'crops', label: 'Crops and trees ready', icon: 'wheat' },
  { id: 'animals', label: 'Animals ready', icon: 'egg' },
  { id: 'goods', label: 'Goods made', icon: 'bread' },
  { id: 'truck', label: 'Delivery truck', icon: 'truck' },
  { id: 'sales', label: 'Gifts and market sales', icon: 'gift' },
  { id: 'daily', label: 'Daily reward reminder', icon: 'calendar' },
];

const UNAVAILABLE: Record<Exclude<NotifyState['available'], 'ok'>, string> = {
  'not-configured': 'Available when online play is switched on.',
  unsupported: 'This browser cannot show notifications from games. Try Chrome, Edge or Firefox, or the Cozy Acres app.',
  'ios-install': 'On iPhone and iPad, add Cozy Acres to your Home Screen first (Share, then Add to Home Screen) and open it from there. Needs iOS 16.4 or newer.',
  'ios-old': 'Notifications need iOS 16.4 or newer. Update your iPhone or iPad, then open Cozy Acres from the Home Screen.',
  'no-sw': 'Notifications are not available in this window yet. Reload the game and try again.',
};

function toggle(on: boolean, label: string, onChange: (v: boolean) => void): HTMLElement {
  const t = h('div', { class: `toggle ${on ? 'on' : ''}`, role: 'switch', tabindex: '0', 'aria-checked': String(on), 'aria-label': label });
  const flip = () => { on = !on; t.classList.toggle('on', on); t.setAttribute('aria-checked', String(on)); onChange(on); audio.play('select'); };
  t.addEventListener('click', flip);
  t.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } });
  return t;
}

const hhmm = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function hourSelect(value: number, label: string, onChange: (m: number) => void): HTMLSelectElement {
  const s = h('select', { class: 'notify-hour', 'aria-label': label }) as HTMLSelectElement;
  for (let hr = 0; hr < 24; hr++) s.append(h('option', { value: String(hr * 60) }, hhmm(hr * 60)));
  // a value set elsewhere that is not on the hour still shows
  if (value % 60) s.append(h('option', { value: String(value) }, hhmm(value)));
  s.value = String(value);
  s.addEventListener('pointerdown', (e) => e.stopPropagation());
  s.addEventListener('change', () => { onChange(Number(s.value)); audio.play('select'); });
  return s;
}

function whenText(t: number): string {
  const d = new Date(t);
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const time = hhmm(d.getHours() * 60 + d.getMinutes());
  if (d.toDateString() === today.toDateString()) return `today at ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `tomorrow at ${time}`;
  return `${d.toLocaleDateString()} ${time}`;
}

/** The "Notifications" section for the Settings panel. */
export function notificationSettingsSection(): HTMLElement {
  const root = h('div', { class: 'notify-settings' });
  let busy = false;
  let shown = '';
  let mounted = false;

  const render = (force = false) => {
    // stop listening once the Settings panel has closed
    if (root.isConnected) mounted = true;
    else if (mounted) { off(); return; }
    const st = notifyState();
    const p = notifyPrefs();
    const key = JSON.stringify([st, p, busy]);
    if (key === shown && !force) return;
    shown = key;
    root.replaceChildren(h('div', { class: 'section-title' }, 'Notifications'));
    const box = h('div', { class: 'notify-box' });
    root.append(box);

    if (st.available !== 'ok') {
      box.append(
        h('div', { class: 'setting-row' }, h('label', null, 'Phone notifications'), h('div', { class: 'toggle disabled', 'aria-disabled': 'true' })),
        h('div', { class: 'muted notify-note' }, UNAVAILABLE[st.available]));
      return;
    }

    const master = toggle(st.on, 'Phone notifications', (v) => void (v ? turnOn() : turnOff()));
    if (busy) master.classList.add('disabled');
    box.append(h('div', { class: 'setting-row' }, h('label', null, 'Phone notifications'), master));

    if (!st.on) {
      const note = st.blocked
        ? 'Notifications are blocked for Cozy Acres. Allow them in your browser or phone settings, then switch this on again.'
        : st.elsewhere
          ? 'You switched notifications on on another device. Switch this on to get them here too.'
          : 'Get a gentle nudge when crops, animals and goods are ready. We only send a few a day, and never during quiet hours.';
      box.append(h('div', { class: 'muted notify-note' }, note));
      return;
    }

    const status = st.waiting
      ? 'Waiting for a connection. Your reminders will be sent when the game is back online.'
      : st.next ? `Next: ${st.next.body.replace(/\.$/, '')} (${whenText(st.next.fireAt)})` : 'Nothing planned right now. Plant, feed or bake something!';
    box.append(h('div', { class: `muted notify-note ${st.waiting ? 'warn' : ''}` }, status));

    const kinds = h('div', { class: 'notify-kinds' });
    for (const k of KINDS) {
      kinds.append(h('div', { class: 'notify-kind' }, icon(k.icon), h('span', null, k.label),
        toggle(p[k.id], k.label, (v) => setNotifyPref(k.id as Exclude<keyof NotifyPrefs, 'enabled'>, v))));
    }
    box.append(kinds);

    const quietOn = p.quietStart !== p.quietEnd;
    const quiet = h('div', { class: 'notify-quiet' });
    const quietRow = h('div', { class: 'notify-kind' }, icon('moon'), h('span', null, 'Quiet hours'),
      toggle(quietOn, 'Quiet hours', (v) => {
        if (v) { setNotifyPref('quietStart', 21 * 60); setNotifyPref('quietEnd', 8 * 60); } else setNotifyPref('quietEnd', p.quietStart);
        render(true);
      }));
    box.append(quietRow);
    if (quietOn) {
      quiet.append(h('span', null, 'From'), hourSelect(p.quietStart, 'Quiet hours start', (m) => { if (m !== notifyPrefs().quietEnd) setNotifyPref('quietStart', m); render(true); }),
        h('span', null, 'to'), hourSelect(p.quietEnd, 'Quiet hours end', (m) => { if (m !== notifyPrefs().quietStart) setNotifyPref('quietEnd', m); render(true); }));
      box.append(quiet, h('div', { class: 'muted notify-note' }, 'Anything ready during quiet hours waits until they end.'));
    }

    const testBtn = button([icon('bell'), 'Send a test'], async () => {
      testBtn.disabled = true;
      const ok = await sendTestNotification();
      ui.feedback.toast(ok ? 'Test notification on its way' : 'Could not send a test', ok ? 'It can take up to 5 minutes to arrive.' : 'Check your connection and try again in a few minutes.', ok ? 'bell' : 'cloud', ok ? '' : 'warn');
      setTimeout(() => { testBtn.disabled = false; }, 30000);
    }, 'small blue');
    box.append(h('div', { class: 'notify-actions' }, testBtn));
  };

  async function turnOn(): Promise<void> {
    if (busy) return;
    busy = true;
    const why = await enableNotifications();
    busy = false;
    if (why === 'blocked') ui.feedback.toast('Notifications are blocked', 'Allow them for Cozy Acres in your browser or phone settings.', 'bell', 'warn');
    else if (why === 'dismissed') ui.feedback.toast('Notifications stay off', 'You can switch them on here any time.', 'bell');
    else if (why) ui.feedback.toast('Could not switch on notifications', 'Please try again in a moment.', 'bell', 'warn');
    else ui.feedback.toast('Notifications are on', 'We will let you know when things are ready.', 'bell');
    render(true);
  }

  async function turnOff(): Promise<void> {
    if (busy) return;
    busy = true;
    await disableNotifications();
    busy = false;
    render(true);
  }

  const off = onNotify(() => render());
  render();
  // refresh "Next: ..." with the latest plan
  if (notifyState().on) syncSoon(300);
  return root;
}
