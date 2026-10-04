import gsap from 'gsap';
import { Panel } from '../Panel';
import { button, fmt, h, icon } from '../dom';
import { ui } from '../UI';
import { tutorial } from '../Tutorial';
import { audio } from '../../systems/Audio';
import { game } from '../../systems/Game';
import { neighbours, type AwayEntry } from '../../systems/Neighbours';
import { visiting } from '../../systems/Visiting';
import { HELP_ICON } from '../../online/FarmHelp';
import { online } from '../../online/Online';
import { HELP_NOTES, type FarmHelp } from '../../online/types';
import { possessive, visitFarm } from '../../scenes/Visit';
import './neighbours.css';

/**
 * Helping neighbours (Update 5), owner side UI: the "While you were away" panel and the Visitors list
 * (a tab in Friends). The logic lives in src/systems/Neighbours.ts.
 */

const ago = (at: number): string => {
  const m = Math.max(0, (Date.now() - at) / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return `${Math.floor(m)} min ago`;
  if (m < 60 * 24) return `${Math.floor(m / 60)} h ago`;
  return `${Math.floor(m / 1440)} days ago`;
};

/** "While you were away: Kacie watered your wheat, Mel liked your farm". */
export function openAway(list: AwayEntry[]): void {
  if (!list.length) return;
  const p = new Panel({ title: 'While you were away', size: 'small', color: 'pink', icon: 'hug' });
  p.body.append(h('div', { class: 'center muted', style: 'margin-bottom:8px' }, 'Your neighbours dropped by!'));
  const box = h('div', { class: 'list away-list' });
  const shown = list.slice(0, 12);
  for (const e of shown) {
    box.append(h('div', { class: 'list-item' }, icon(HELP_ICON[e.kind], 'icon big'),
      h('div', { class: 'grow' },
        h('div', { class: 'title' }, neighbours.line(e)),
        e.note && HELP_NOTES[e.note] ? h('div', { class: 'away-note' }, `"${HELP_NOTES[e.note]}"`) : null,
        !e.ok ? h('div', { class: 'sub' }, e.coins ? `It was already done, so they left you ${e.coins} coins instead.` : 'It was already done - sweet of them!') : null)));
  }
  if (list.length > shown.length) box.append(h('div', { class: 'muted center' }, `...and ${list.length - shown.length} more. See Friends > Visitors.`));
  p.body.append(box);
  p.footer.append(
    button([icon('hug'), 'Visitors'], () => { p.close(); ui.open('friends', { tab: 'visitors' }); }, 'blue'),
    button('Lovely!', () => p.close(), 'green'));
  p.open();
  audio.play('jingle');
  gsap.fromTo([...box.children], { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.3, ease: 'back.out(2)', delay: 0.2, stagger: 0.1 });
}

/** The Visitors tab of Friends: like count, recent helpers and their notes, with Visit back. */
export function renderVisitors(body: HTMLElement): void {
  const likes = neighbours.likes;
  const rows = neighbours.recent;
  const helps = rows.filter((r) => r.kind !== 'like').length;
  body.append(h('div', { class: 'visitor-stats' },
    h('span', { class: 'pill' }, icon('heart'), likes >= 0 ? `${fmt(likes)} ${likes === 1 ? 'like' : 'likes'}` : '... likes'),
    h('span', { class: 'pill' }, icon('hug'), `${helps} recent ${helps === 1 ? 'help' : 'helps'}`),
    h('span', { class: 'pill' }, icon('medal'), `You helped ${fmt(game.stat('neighbours_helped'))}`)));
  body.append(h('div', { class: 'social-note' }, icon('info'), h('div', null,
    'Visit a neighbour and tap a growing field, fruit tree or hungry animals to help once a day. Tap the heart to like their farm and leave a note!')));
  if (neighbours.error) body.append(h('div', { class: 'muted' }, neighbours.error));
  body.append(h('div', { class: 'section-title' }, 'Recent visitors'));
  if (!rows.length) {
    body.append(h('div', { class: 'empty-state' }, icon('house'), h('div', null, 'No visitors yet. Share your friend code so neighbours can drop by!')));
    return;
  }
  // one row per visitor, newest first: what they did and their latest note
  const byHelper = new Map<string, FarmHelp[]>();
  for (const r of rows) {
    const k = r.helper.id || r.helper.name;
    const list = byHelper.get(k);
    if (list) list.push(r); else byHelper.set(k, [r]);
  }
  const box = h('div', { class: 'list' });
  for (const [, list] of [...byHelper].slice(0, 30)) {
    const who = list[0].helper;
    const did = [...new Set(list.map((r) => r.kind))];
    const note = list.find((r) => r.note)?.note;
    const words = did.map((k) => (k === 'like' ? 'liked your farm' : k === 'water' ? 'watered a field' : k === 'feed' ? 'fed your animals' : 'tended a tree'));
    box.append(h('div', { class: 'list-item friend-item visitor-item' },
      h('div', { class: 'friend-portrait', style: 'background:#ff8fb4' }, h('span', { class: 'outlined' }, (who.name.trim()[0] ?? '?').toUpperCase())),
      h('div', { class: 'grow' },
        h('div', { class: 'title' }, who.name, who.id.startsWith('bot_') ? h('span', { class: 'demo-tag' }, 'demo') : null),
        h('div', { class: 'sub' }, ...did.map((k) => icon(HELP_ICON[k])), ` ${words.join(', ')} - ${ago(list[0].at)}`),
        note && HELP_NOTES[note] ? h('div', { class: 'away-note' }, `"${HELP_NOTES[note]}"`) : null),
      who.id && who.id !== online.me()?.id
        ? button([icon('house'), h('span', { class: 'fbtn-lbl' }, 'Visit back')], () => void visitFarm({ id: who.id, name: who.name }), 'small blue visit-btn', { 'aria-label': `Visit ${possessive(who.name)} farm` })
        : null));
  }
  body.append(box);
}

/** Debug panel / headless tests: make a demo neighbour drop by now (practice mode only). */
function botVisit(): boolean {
  const b = online as unknown as { botHelp?: (force: boolean) => boolean };
  return online.kind === 'local' && !!b.botHelp?.(true);
}

// ------------------------------------------------------------------ wiring

let started = false;
let checkAt = 0;
ui.onTick((now) => {
  if (now - checkAt < 500) return;
  checkAt = now;
  if (!game.state || !neighbours.available) return;
  if (!started) { started = true; neighbours.start(); }
  // show "While you were away" when nothing else is on screen
  if (neighbours.away.length && !Panel.isOpen && !tutorial.running && !visiting.active && !document.hidden) openAway(neighbours.takeAway());
});

Object.assign(window as unknown as Record<string, unknown>, {
  __neighbours: { n: neighbours, botVisit, poll: () => neighbours.poll(), applyPending: () => neighbours.applyPending() },
});
