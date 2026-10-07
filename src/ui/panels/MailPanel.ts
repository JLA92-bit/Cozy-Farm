import { Panel } from '../Panel';
import { h, icon, itemIcon, button, fmt, clear } from '../dom';
import { ui } from '../UI';
import { sideEntries } from '../SideBar';
import { ITEMS, VILLAGER } from '../../data';
import { game } from '../../systems/Game';
import { mail } from '../../systems/Mail';
import { social } from '../../systems/Social';
import { audio, haptics } from '../../systems/Audio';
import { thumbs } from '../../world/Thumbs';
import { villagerPortraitKey } from '../../world/VillagerLooks18';
import type { Letter } from '../../systems/State';
import './mail.css';

/**
 * 1.8 Mailbox: every letter from the villagers, the team and the game, newest first. Open one to read it on a
 * paper card and collect what it carries. Letters stay to reread; "Delete read letters" tidies up.
 */

const TRANSPARENT = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
/** Soft background behind each villager's portrait, so faces read at a glance. */
const TINT: Record<string, string> = { rosa: '#ffd9e6', tom: '#d6e8ff', juniper: '#dcf5ec', pip: '#fff1c4', hazel: '#eadcff', bram: '#ffe0d2' };

export function senderName(from: string): string {
  if (from === 'team') return 'The Cozy Acres team';
  if (from === 'game') return 'Cozy Acres';
  return VILLAGER[from]?.name ?? 'A friend';
}

/** Round portrait for a villager, or the team / game badge. */
export function senderBadge(from: string, size = 48): HTMLElement {
  const wrap = h('span', { class: 'sender-badge', style: `width:${size}px;height:${size}px;flex:0 0 ${size}px` });
  if (VILLAGER[from]) {
    wrap.style.background = TINT[from] ?? '#fff6df';
    const img = h('img', { class: 'portrait', alt: '', draggable: 'false', src: TRANSPARENT });
    void thumbs.get(villagerPortraitKey(from)).then((url) => { if (url) img.src = url; });
    wrap.append(img);
  } else {
    wrap.classList.add(from === 'team' ? 'team' : 'game');
    wrap.append(icon(from === 'team' ? 'sparkle_heart' : 'mailbox'));
  }
  return wrap;
}

/** "Today", "Yesterday", or "3 Oct". */
export function letterDate(at: number, now = game.now()): string {
  const d = new Date(at), n = new Date(now);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(n) - day(d)) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(d.getFullYear() !== n.getFullYear() ? { year: 'numeric' } : {}) });
}

const waiting = (l: Letter) => !!l.attach && !l.claimed;

/** What a letter carries, as chips. */
function attachChips(a: NonNullable<Letter['attach']>): HTMLElement {
  const row = h('div', { class: 'letter-chips' });
  if (a.coins) row.append(h('span', { class: 'pill', dataset: { kind: 'coins' } }, icon('coin'), fmt(a.coins)));
  if (a.gems) row.append(h('span', { class: 'pill', dataset: { kind: 'gems' } }, icon('gem'), fmt(a.gems)));
  for (const [k, n] of Object.entries(a.items ?? {})) if (ITEMS[k] && n > 0) row.append(h('span', { class: 'pill', title: ITEMS[k].name }, itemIcon(k), `${ITEMS[k].name} x${fmt(n)}`));
  return row;
}

/** One row of the letter list. */
export function letterRow(l: Letter, onOpen: () => void): HTMLElement {
  const unread = !l.read;
  const row = h('div', { class: `list-item clickable letter-row${unread ? ' unread' : ''}`, role: 'button', tabindex: '0', 'aria-label': `${unread ? 'Unread letter' : 'Letter'} from ${senderName(l.from)}: ${l.title}` },
    senderBadge(l.from),
    h('div', { class: 'grow' },
      h('div', { class: 'title' }, l.title),
      h('div', { class: 'sub' }, `${senderName(l.from)} - ${letterDate(l.at)}`)),
    waiting(l) ? h('span', { class: 'letter-gift' }, icon('gift'), h('span', { class: 'outlined' }, 'Gift')) : null,
    unread ? h('span', { class: 'letter-new outlined' }, 'New') : null);
  row.addEventListener('click', () => { audio.play('select'); onOpen(); });
  row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } });
  return row;
}

/** Letters newest first. */
export function lettersNewestFirst(): Letter[] { return [...mail.letters].sort((a, b) => b.at - a.at || b.id - a.id); }

/** The paper card for one letter (marks it read). */
function letterCard(l: Letter, onChange: () => void): HTMLElement {
  mail.markRead(l.id);
  const name = senderName(l.from);
  const body = l.body.trim();
  // letters usually end with the sender's name; add the signature only when they do not
  const lastLine = body.split('\n').filter((x) => x.trim()).pop()?.trim() ?? '';
  const signed = VILLAGER[l.from] ? lastLine.replace(/^[-\s]+/, '').startsWith(VILLAGER[l.from].name) : lastLine.includes('Cozy Acres') || lastLine.toLowerCase().includes('team');
  const paras = body.split(/\n{2,}/);
  const sigText = signed ? paras.pop()! : name;
  const card = h('div', { class: 'letter-paper' },
    h('div', { class: 'letter-head' }, senderBadge(l.from, 56), h('div', { class: 'grow' }, h('div', { class: 'letter-title' }, l.title), h('div', { class: 'muted' }, `From ${name} - ${letterDate(l.at)}`))),
    h('div', { class: 'letter-body' }, ...paras.map((p) => h('p', null, p))),
    h('div', { class: 'letter-sign' }, sigText.replace(/^[-\s]+/, '')));
  if (l.attach) {
    const chips = attachChips(l.attach);
    const box = h('div', { class: `letter-attach${l.claimed ? ' done' : ''}` }, h('div', { class: 'letter-attach-title' }, icon(l.claimed ? 'check' : 'gift'), l.claimed ? 'Collected' : 'Something for you'), chips);
    if (!l.claimed) {
      const btn = button([icon('gift'), 'Collect'], () => {
        const got = mail.claim(l.id);
        if (!got) return;
        collectJuice(chips, got);
        onChange();
      }, 'green collect-btn');
      box.append(btn);
    }
    card.append(box);
  }
  return card;
}

/** Coins, gems and items fly from the letter into the wallet and the barn. */
function collectJuice(from: HTMLElement, got: NonNullable<Letter['attach']>): void {
  const r = from.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  if (got.coins) ui.feedback.fly(x, y, 'coin', 'coins', Math.min(8, 2 + Math.floor(got.coins / 50)));
  if (got.gems) ui.feedback.fly(x, y, 'gem', 'gems', Math.min(6, got.gems));
  for (const k of Object.keys(got.items ?? {})) if (ITEMS[k]) ui.feedback.fly(x, y, ITEMS[k].icon.startsWith('model:') ? 'package' : ITEMS[k].icon, 'barn', 2);
  audio.play('coins');
  haptics.play('success');
}

let current: Panel | null = null;

/** The Mailbox screen. With `letter`, opens straight on that letter. */
export function openMail(arg?: { letter?: number }): void {
  current?.close();
  const p = new Panel({ title: 'Mailbox', icon: 'mailbox', color: 'blue', wallet: true });
  current = p;
  let open: number | null = arg?.letter ?? null;
  const render = () => {
    clear(p.body);
    clear(p.footer);
    const l = open !== null ? mail.letters.find((x) => x.id === open) : undefined;
    if (l) {
      p.body.append(letterCard(l, render));
      p.footer.append(button([icon('mailbox'), 'All letters'], () => { open = null; audio.play('page', { volume: 0.5 }); render(); }, 'blue'));
      p.footer.style.display = '';
      p.body.scrollTop = 0;
      return;
    }
    open = null;
    const list = lettersNewestFirst();
    const unread = list.filter((x) => !x.read).length, gifts = list.filter(waiting).length;
    if (list.length) p.body.append(h('div', { class: 'mail-summary' },
      h('span', { class: 'pill' }, icon('mailbox'), `${list.length} ${list.length === 1 ? 'letter' : 'letters'}`),
      unread ? h('span', { class: 'pill unread-pill' }, `${unread} new`) : null,
      gifts ? h('span', { class: 'pill' }, icon('gift'), `${gifts} to collect`) : null));
    // gifts from other players still live in the Friends mailbox: point there so nothing is missed
    if (social.mailCount) {
      const n = social.mailCount;
      p.body.append(h('div', { class: 'list-item mail-friends' }, icon('gift', 'icon big'),
        h('div', { class: 'grow' }, h('div', { class: 'title' }, `${n} ${n === 1 ? 'gift' : 'gifts'} from friends`), h('div', { class: 'sub' }, 'Waiting in your Friends mailbox')),
        button('Open', () => { p.close(); ui.open('friends', { tab: 'mail' }); }, 'green small')));
    }
    if (!list.length) {
      p.body.append(h('div', { class: 'empty-state' }, icon('mailbox'), h('div', null, 'Your mailbox is empty.'), h('div', { class: 'muted' }, 'Villagers write when they visit, on birthdays and when you become friends.')));
    } else {
      const box = h('div', { class: 'list' });
      for (const x of list) box.append(letterRow(x, () => { open = x.id; render(); }));
      p.body.append(box);
    }
    const tidy = list.filter((x) => x.read && !waiting(x)).length;
    if (tidy) {
      p.footer.append(button([icon('check'), `Delete read letters (${tidy})`], () => confirmTidy(tidy, render), 'grey small'));
      p.footer.style.display = '';
    } else p.footer.style.display = 'none';
  };
  p.onClose = () => { if (current === p) current = null; };
  render();
  p.open();
}

/** Ask once before deleting read letters (letters with something still to collect always stay). */
function confirmTidy(n: number, done: () => void): void {
  const c = new Panel({ title: 'Tidy the mailbox?', icon: 'mailbox', color: 'blue', size: 'small' });
  c.body.append(h('div', { class: 'center', style: 'font-size:17px;margin:6px 0' }, `Delete ${n} read ${n === 1 ? 'letter' : 'letters'}?`), h('div', { class: 'muted center' }, 'New letters and letters with a gift to collect stay.'));
  c.footer.append(
    button('Keep them', () => c.close(), 'grey'),
    button('Delete', () => {
      game.state.mail.letters = game.state.mail.letters.filter((l) => !l.read || waiting(l));
      game.bus.emit('state:changed', {});
      audio.play('whoosh', { volume: 0.5 });
      c.close();
      done();
    }, 'red'));
  c.open();
}

ui.register('mail', (arg) => openMail(arg as { letter?: number } | undefined));

// HUD shortcut with a dot while something is unread or waiting to be collected
sideEntries.push(() => (game.state.tutorial.done ? { id: 'mail', icon: 'mailbox', label: 'Mail', color: 'blue', badge: mail.unread() > 0 } : null));

// ------------------------------------------------------------------ "A letter from Rosa"
let arrived: number[] = [];
let toastTimer = 0;
game.bus.on('mail', ({ id }) => {
  arrived.push(id);
  clearTimeout(toastTimer);
  // a short pause gathers letters that arrive together, and lets a letter that was filed as read stay quiet
  toastTimer = window.setTimeout(() => {
    const list = arrived.map((i) => mail.letters.find((l) => l.id === i)).filter((l): l is Letter => !!l && !l.read);
    arrived = [];
    if (!list.length || !game.state.tutorial.done || !ui.feedback) return;
    const one = list.length === 1 ? list[0] : null;
    ui.feedback.toast(one ? `A letter from ${senderName(one.from).replace(/^The /, 'the ')}` : `${list.length} new letters`, one ? one.title : 'Tap to read them', 'mailbox');
    const el = ui.feedback.toastStack.lastElementChild as HTMLElement | null;
    if (el) {
      if (one && VILLAGER[one.from]) el.querySelector('img')?.replaceWith(senderBadge(one.from, 40));
      el.classList.add('tappable');
      el.addEventListener('click', () => openMail(one ? { letter: one.id } : undefined), { once: true });
    }
    audio.play('page', { volume: 0.6 });
    const side = ui.hud.side.querySelector<HTMLElement>('[data-side="mail"]');
    if (side) ui.feedback.bump(side);
  }, 700);
});

