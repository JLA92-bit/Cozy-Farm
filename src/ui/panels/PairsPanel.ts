import { Panel } from '../Panel';
import { h, icon, itemIcon, button, clear, fmt, tooSoon, CONFIRM_MS } from '../dom';
import { ui } from '../UI';
import { ITEMS, PAIRS } from '../../data';
import { game } from '../../systems/Game';
import { pairs, pairReward } from '../../systems/Pairs';
import { social } from '../../systems/Social';
import { audio } from '../../systems/Audio';
import type { PairBoard, PairTask } from '../../online/types';
import './friends.css';

const daysLeft = (b: PairBoard): number => Math.max(1, Math.ceil((b.week + 7 * 864e5 - Date.now()) / 864e5));

/** A button that asks "Sure?" first (tap again within a few seconds). */
function twoTap(label: string, sure: string, onYes: () => void, cls: string): HTMLButtonElement {
  let armed = 0, at = 0;
  const b = button(label, () => {
    if (!armed) {
      b.replaceChildren(sure);
      at = performance.now();
      armed = window.setTimeout(() => { armed = 0; b.replaceChildren(label); }, CONFIRM_MS);
      return;
    }
    if (tooSoon(at)) return;
    clearTimeout(armed);
    armed = 0;
    onYes();
  }, cls);
  return b;
}

/**
 * 1.48 Friends Board: invites to answer, the boards you share (this week's tasks, what each of you gave, the bond),
 * invites you sent, and friends you could team up with.
 */
export function openPairs(): void {
  const p = new Panel({ title: 'Friends Board', icon: 'hug', color: 'pink', size: 'large', wallet: true });
  let busy = false;
  const act = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    busy = true;
    try { await fn(); audio.play('reward'); } catch (e) { ui.feedback.toast('Not just now', (e as Error).message, 'info'); audio.play('error'); }
    busy = false;
    render();
  };

  const taskRow = (b: PairBoard, t: PairTask): HTMLElement => {
    const name = ITEMS[t.item]?.name ?? t.item;
    const left = pairs.myLeft(t), have = game.count(t.item), give = Math.min(left, have, PAIRS.maxGive);
    const total = t.mine + t.theirs, pct = Math.min(100, Math.round((total / t.qty) * 100));
    const mePct = Math.min(100, (t.mine / t.qty) * 100), themPct = Math.min(100 - mePct, (t.theirs / t.qty) * 100);
    const sub = t.done ? `Done together: you gave ${t.mine}, ${b.partner.name} gave ${t.theirs}.`
      : left > 0 ? `You ${t.mine}, ${b.partner.name} ${t.theirs} of ${t.qty}. You can give up to ${left} more. You have ${fmt(have)}.`
        : `You gave your part (${t.mine}). ${b.partner.name} gives the last ${t.qty - total}.`;
    return h('div', { class: `pb-task${t.done ? ' done' : ''}` },
      itemIcon(t.item, 'cp-icon'),
      h('div', { class: 'grow' },
        h('div', { class: 'cp-name' }, `${t.qty} ${name}`),
        h('div', { class: 'pb-bar', role: 'img', 'aria-label': `${pct}% done` }, h('div', { class: 'pb-me', style: `width:${mePct}%` }), h('div', { class: 'pb-them', style: `width:${themPct}%` })),
        h('div', { class: 'muted' }, sub)),
      t.done ? icon('check') : left > 0 ? button(give > 0 ? `Give ${give}` : 'Give', () => void act(async () => {
        const used = await pairs.give(b, t, give);
        ui.feedback.toast(`Gave ${used} ${name}`, `To your board with ${b.partner.name}.`, 'hug');
      }), `small ${give > 0 ? 'green' : 'disabled'}`) : icon('hourglass'));
  };

  const boardCard = (b: PairBoard): HTMLElement => {
    const bond = pairs.bond(b), done = b.tasks.filter((t) => t.done).length;
    const task = pairReward('task', bond), full = pairReward('full', bond);
    const nextBond = bond >= PAIRS.bondMax ? null : (bond + 1) * PAIRS.bondTasks - b.tasksDone;
    return h('div', { class: 'card cp-card pb-card' },
      h('div', { class: 'title' }, icon('hug'), ` With ${b.partner.name}`, h('span', { class: 'muted pb-lvl' }, ` level ${b.partner.level}`)),
      h('div', { class: 'pb-stats' },
        h('span', { class: 'pb-chip' }, icon('heart', 'cp-mini'), `Bond ${bond}${bond ? ` (+${Math.round(bond * PAIRS.bondXp * 100)}% XP)` : ''}`),
        h('span', { class: 'pb-chip' }, icon('check', 'cp-mini'), `${b.tasksDone} done together`),
        b.streak > 1 ? h('span', { class: 'pb-chip' }, icon('trophy', 'cp-mini'), `${b.streak} full weeks in a row`) : null),
      h('div', { class: 'sub' }, `${done} of ${b.tasks.length} this week. New tasks in ${daysLeft(b)} ${daysLeft(b) === 1 ? 'day' : 'days'}.`
        + (nextBond ? ` ${nextBond} more ${nextBond === 1 ? 'task' : 'tasks'} to bond ${bond + 1}.` : '')),
      h('div', { class: 'pb-reward muted' }, `Each task: about ${fmt(task.xp)} XP and coins for both of you. Every task this week: ${fmt(full.xp)} XP and ${full.tokens} Friendship Tokens more.`),
      ...b.tasks.map((t) => taskRow(b, t)),
      b.tasks.length ? null : h('div', { class: 'muted' }, 'This week\'s tasks are on their way...'),
      h('div', { class: 'pb-foot' }, twoTap('Leave board', 'Leave? Tap again', () => void act(() => pairs.leave(b)), 'small grey')));
  };

  const render = () => {
    clear(p.body);
    if (!pairs.available) {
      p.body.append(h('div', { class: 'empty-state' }, icon('lock'), h('div', null, game.level < PAIRS.level ? `The Friends Board opens at level ${PAIRS.level}.` : 'The Friends Board is resting for now.')));
      return;
    }
    p.body.append(h('div', { class: 'sq-intro-text' }, `Team up with a friend who adds you back. Each week you share ${PAIRS.tasks} deliveries and you both give to each one. Finished tasks pay you both XP and coins; unfinished goods come back.`));
    if (social.practice) p.body.append(h('div', { class: 'social-note' }, icon('info'), h('div', null, h('b', null, 'Practice mode. '), 'Demo neighbours on your friends list say yes to invites and give their half now and then.')));
    if (pairs.error) p.body.append(h('div', { class: 'muted' }, pairs.error));
    const owed = pairs.owed();
    if (owed > 0) p.body.append(h('div', { class: 'social-note' }, icon('star'), h('div', null, h('b', null, `${fmt(owed)} XP on its way. `), `Friends Board XP comes in a little at a time, up to ${fmt(PAIRS.xpPerHour)} an hour.`)));

    const inv = pairs.invites();
    if (inv.length) {
      p.body.append(h('div', { class: 'section-title' }, 'Invites for you'));
      for (const b of inv) p.body.append(h('div', { class: 'list-item' }, icon('hug'),
        h('div', { class: 'grow' }, h('div', { class: 'title' }, b.partner.name), h('div', { class: 'sub' }, 'wants to share a Friends Board with you')),
        button('Say yes', () => void act(async () => { await pairs.invite(b.partner.id); ui.feedback.toast(`You and ${b.partner.name} are a team!`, 'This week\'s tasks are on your board.', 'hug'); }), 'small green'),
        twoTap('No thanks', 'Sure?', () => void act(() => pairs.leave(b)), 'small grey')));
    }

    const act1 = pairs.active();
    p.body.append(h('div', { class: 'section-title' }, `Your boards (${act1.length} of ${PAIRS.partners})`));
    if (!act1.length) p.body.append(h('div', { class: 'muted' }, pairs.loaded ? 'None yet. Invite a friend below; when they say yes, your board starts.' : 'Looking...'));
    for (const b of act1) p.body.append(boardCard(b));

    const sent = pairs.sent();
    if (sent.length) {
      p.body.append(h('div', { class: 'section-title' }, 'Waiting for a yes'));
      for (const b of sent) p.body.append(h('div', { class: 'list-item' }, icon('hourglass'),
        h('div', { class: 'grow' }, h('div', { class: 'title' }, b.partner.name), h('div', { class: 'sub' }, 'They need to open the Friends Board and say yes.')),
        twoTap('Take back', 'Sure?', () => void act(() => pairs.leave(b)), 'small grey')));
    }

    const free = social.state.friends.filter((f) => !pairs.withFriend(f.id));
    p.body.append(h('div', { class: 'section-title' }, 'Team up with a friend'));
    if (!social.state.friends.length) p.body.append(h('div', { class: 'muted' }, 'Add friends first (Friends, then add their code). They need to add you too.'));
    else if (!free.length) p.body.append(h('div', { class: 'muted' }, 'You share a board (or an invite) with every friend.'));
    const room = pairs.used() < PAIRS.partners;
    for (const f of free) p.body.append(h('div', { class: 'list-item' }, icon('hug'),
      h('div', { class: 'grow' }, h('div', { class: 'title' }, f.name)),
      room ? button('Invite', () => void act(async () => {
        const b = await pairs.invite(f.id);
        ui.feedback.toast(b.status === 'active' ? `You and ${f.name} are a team!` : `Invite sent to ${f.name}`, b.status === 'active' ? 'This week\'s tasks are on your board.' : 'When they say yes, your board starts.', 'hug');
      }), 'small pink') : h('span', { class: 'muted' }, 'Board limit reached')));
  };
  const off = pairs.onChange(() => { if (!busy) render(); });
  p.onClose = () => off();
  render();
  p.open();
  void pairs.poll();
}

ui.register('pairs', () => openPairs());

let started = false, checkAt = 0;
ui.onTick((now) => {
  if (started || now - checkAt < 2000) return;
  checkAt = now;
  if (game.state && pairs.available) { started = true; pairs.start(); }
});
