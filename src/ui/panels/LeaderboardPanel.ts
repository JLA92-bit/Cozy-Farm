import gsap from 'gsap';
import { Panel } from '../Panel';
import { h, icon, button, clear, fmt } from '../dom';
import { ui } from '../UI';
import { sideEntries } from '../SideBar';
import { game } from '../../systems/Game';
import { online } from '../../online/Online';
import { thumbs } from '../../world/Thumbs';
import type { LeaderboardKind, PlayerProfile } from '../../online/types';
import {
  BOARD_LIMIT, cachedBoard, chase, fetchBoard, friendIds, isFriend, playerCardHooks, safeLook, score, weekLeftMs, type Board,
} from '../../online/Leaderboard';

/**
 * Leaders panel: who is leading by level, farm value, Charm and this week's XP, with your own rank,
 * who to pass next, and a card for every player. Refreshes on open, every 30 s while open and when
 * the tab comes back; the last results are cached for offline display.
 */

const REFRESH_MS = 30000;
/** Only the first rows get a 3D portrait (each unique look renders once); the rest show an initial. */
const PORTRAIT_ROWS = 24;

const TABS: { id: LeaderboardKind; label: string; icon: string }[] = [
  { id: 'level', label: 'Level', icon: 'xp' },
  { id: 'farmValue', label: 'Farm value', icon: 'coin' },
  { id: 'charm', label: 'Charm', icon: 'sparkle_heart' },
  { id: 'weeklyXp', label: 'This week', icon: 'calendar' },
];

/** The value shown on the right of a row. */
function valueEl(p: PlayerProfile, kind: LeaderboardKind): HTMLElement {
  const ic = kind === 'farmValue' ? 'coin' : kind === 'charm' ? 'sparkle_heart' : 'xp';
  return h('span', { class: 'lb-value outlined' }, icon(ic), fmt(score(p, kind)));
}

/** "X more XP" wording per board. */
function unit(kind: LeaderboardKind, n: number): string {
  return kind === 'farmValue' ? `${fmt(n)} more farm value` : kind === 'charm' ? `${fmt(n)} more Charm` : `${fmt(n)} more XP`;
}

function ago(at: number): string {
  const m = Math.floor((Date.now() - at) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const hr = Math.floor(m / 60);
  return hr < 48 ? `${hr} h ago` : `${Math.floor(hr / 24)} days ago`;
}

function weekLeftText(): string {
  const ms = Math.max(0, weekLeftMs());
  const d = Math.floor(ms / 86400000);
  const hr = Math.floor((ms % 86400000) / 3600000);
  const m = Math.max(1, Math.floor((ms % 3600000) / 60000));
  return d > 0 ? `${d}d ${hr}h` : hr > 0 ? `${hr}h ${m}m` : `${m}m`;
}

/** Soft colour from a name, for players without a drawable look. */
function nameColor(name: string): string {
  let n = 0;
  for (let i = 0; i < name.length; i++) n = (n * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${n % 360} 60% 62%)`;
}

/** Farmer portrait from a public look, with a coloured initial until (or instead of) the 3D render. */
export function farmerFace(p: PlayerProfile, big = false, render = true): HTMLElement {
  const look = safeLook(p.look);
  const name = (p.name || '?').trim() || '?';
  const face = h('span', { class: `lb-face ${big ? 'big' : ''}`, 'aria-hidden': 'true' }, h('span', { class: 'lb-initial outlined' }, name[0].toUpperCase()));
  face.style.background = look?.top ?? nameColor(name);
  if (look && render) {
    const img = h('img', { class: 'lb-portrait', alt: '', draggable: 'false', decoding: 'async' });
    void thumbs.get(`look:${JSON.stringify(look)}`).then((url) => {
      if (!url) return;
      img.src = url;
      face.append(img);
      face.classList.add('has-portrait');
    });
  }
  return face;
}

let current: Panel | null = null;

function openLeaderboard(arg?: unknown): void {
  if (current) return;
  const p = new Panel({ title: 'Leaders', size: 'large', color: 'purple', icon: 'medal', tabs: TABS });
  current = p;
  if (typeof arg === 'string' && TABS.some((t) => t.id === arg)) p.tab = arg;

  const note = h('div', { class: 'lb-note muted' });
  const refreshBtn = button('Refresh', () => void load(true), 'blue lb-refresh');
  p.footer.append(h('div', { class: 'lb-footer' }, note, refreshBtn));

  let board: Board | null = null;
  let loading = false;
  let seq = 0;

  const renderNote = () => {
    if (!board) { note.textContent = loading ? 'Asking the neighbours...' : ''; return; }
    note.textContent = board.stale ? `Offline - showing results from ${ago(board.at)}` : `Updated ${ago(board.at)}`;
  };

  const render = () => {
    clear(p.body);
    if (online.kind === 'local') {
      p.body.append(h('div', { class: 'lb-practice' }, icon('info'), h('span', null, 'Practice mode - demo neighbours, not real players.')));
    }
    if (p.tab === 'weeklyXp') {
      p.body.append(h('div', { class: 'lb-week' }, icon('hourglass'),
        h('div', { class: 'grow' }, h('div', { class: 'lb-week-title' }, `New week in ${weekLeftText()}`), h('div', { class: 'muted' }, 'Weekly XP resets every Monday 00:00 UTC'))));
    }
    if (!board) {
      p.body.append(loading
        ? h('div', { class: 'empty-state' }, icon('medal'), 'Finding the neighbours...')
        : h('div', { class: 'empty-state' }, icon('cloud'), 'Could not reach the neighbours. Try again in a moment.', button('Try again', () => void load(true), 'blue')));
      renderNote();
      return;
    }
    p.body.append(trackerEl(board));
    const friends = friendIds();
    const list = h('div', { class: 'list lb-list' });
    board.rows.forEach((row, i) => list.append(rowEl(row, i + 1, board!, friends, i < PORTRAIT_ROWS)));
    if (board.me && !board.rank) {
      list.append(h('div', { class: 'lb-gap', 'aria-hidden': 'true' }, '...'));
      list.append(rowEl(board.me, 0, board, friends, true));
    }
    if (!board.rows.length) list.append(h('div', { class: 'empty-state' }, icon('medal'), 'No farmers here yet. Be the first!'));
    p.body.append(list);
    renderNote();
  };

  const rowEl = (row: PlayerProfile, rank: number, b: Board, friends: Set<string>, portrait: boolean): HTMLElement => {
    const mine = !!b.me && row.id === b.me.id;
    const tier = rank >= 1 && rank <= 3 ? ` top${rank}` : '';
    const rankEl = rank >= 1 && rank <= 3
      ? h('span', { class: 'lb-rank medal' }, icon(`medal${rank}`), h('span', { class: 'lb-rank-n outlined' }, String(rank)))
      : h('span', { class: 'lb-rank outlined' }, rank ? `#${rank}` : `${BOARD_LIMIT}+`);
    const name = h('div', { class: 'title lb-name' }, h('span', { class: 'lb-name-text' }, row.name || 'Farmer'));
    if (!mine && (playerCardHooks.isFriend ? isFriend(row.id) : friends.has(row.id))) name.append(icon('heart', 'icon lb-heart'));
    if (mine) name.append(h('span', { class: 'lb-tag you' }, 'You'));
    const sub = h('div', { class: 'sub lb-sub' }, `Lv ${row.level}${row.farmName ? ` - ${row.farmName}` : ''}`);
    if (row.bot && !mine) sub.append(h('span', { class: 'lb-tag demo' }, 'demo'));
    const el = h('div', {
      class: `list-item clickable lb-row${tier}${mine ? ' me' : ''}`, role: 'button', tabindex: '0',
      'aria-label': `${rank ? `Rank ${rank}` : 'Your rank'}: ${row.name}, level ${row.level}, ${fmt(score(row, b.kind))}`,
    }, rankEl, farmerFace(row, false, portrait), h('div', { class: 'grow' }, name, sub), valueEl(row, b.kind));
    el.addEventListener('click', () => openPlayerCard(row));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPlayerCard(row); } });
    return el;
  };

  const trackerEl = (b: Board): HTMLElement => {
    const c = chase(b);
    const box = h('div', { class: 'lb-tracker' });
    if (!b.me || !c) {
      box.append(h('div', { class: 'lb-track-title' }, 'Make your farmer to join the board!'));
      return box;
    }
    const fill = h('div', { class: 'fill' });
    let title: string;
    let sub: string;
    if (!c.target) { title = 'You are #1!'; sub = 'Top of the board - keep it up!'; }
    else if (c.rank) { title = `You are #${c.rank}`; sub = `${unit(b.kind, c.gap)} to pass ${c.target.name}`; }
    else { title = `Not in the top ${BOARD_LIMIT} yet`; sub = `${unit(b.kind, c.gap)} to pass ${c.target.name}`; }
    box.append(
      farmerFace(b.me, false, true),
      h('div', { class: 'grow' }, h('div', { class: 'lb-track-title outlined' }, title), h('div', { class: 'lb-track-sub' }, sub),
        h('div', { class: 'progress lb-track-bar' }, fill)),
    );
    requestAnimationFrame(() => gsap.to(fill, { width: `${Math.round(c.progress * 100)}%`, duration: 0.6, ease: 'power2.out' }));
    return box;
  };

  const load = async (manual = false) => {
    if (loading) return;
    const kind = p.tab as LeaderboardKind;
    const my = ++seq;
    loading = true;
    refreshBtn.disabled = true;
    if (!board) render(); else renderNote();
    try {
      const b = await fetchBoard(kind);
      if (my !== seq || p.tab !== kind) return;
      board = b;
      if (manual && b.stale) ui.feedback.toast('Still offline', 'Showing your last results', 'cloud');
    } catch {
      if (my !== seq) return;
      if (manual) ui.feedback.toast('Could not refresh', 'We will try again soon', 'cloud');
    } finally {
      if (my === seq) { loading = false; refreshBtn.disabled = false; }
    }
    if (my === seq && current === p) {
      const top = p.body.scrollTop;
      render();
      p.body.scrollTop = top;
    }
  };

  p.onTab = (id) => {
    seq++; // drop any fetch for the old tab
    loading = false;
    refreshBtn.disabled = false;
    board = cachedBoard(id as LeaderboardKind);
    render();
    void load();
  };

  const timer = window.setInterval(() => {
    if (document.hidden) return;
    void load();
  }, REFRESH_MS);
  const onVis = () => { if (!document.hidden) void load(); };
  document.addEventListener('visibilitychange', onVis);
  const offline = () => renderNote();
  window.addEventListener('offline', offline);
  p.onClose = () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('offline', offline);
    seq++;
    if (current === p) current = null;
  };
  p.open(); // runs onTab for the first tab, which renders the cache and loads
}

/** A player's card: portrait, stats, and actions other features can hook into. */
export function openPlayerCard(row: PlayerProfile): void {
  const mine = row.id === online.me()?.id || row.id === '__me';
  const p = new Panel({ title: mine ? 'Your farmer' : row.name || 'Farmer', size: 'medium', color: 'purple', icon: 'farmer' });
  const tags = h('div', { class: 'lb-card-tags' });
  if (mine) tags.append(h('span', { class: 'lb-tag you' }, 'You'));
  if (!mine && isFriend(row.id)) tags.append(h('span', { class: 'lb-tag friend' }, icon('heart'), 'Friend'));
  if (row.bot) tags.append(h('span', { class: 'lb-tag demo' }, 'Demo neighbour'));
  const stat = (ic: string, label: string, v: string) => h('div', { class: 'lb-stat' }, icon(ic), h('div', null, h('div', { class: 'lb-stat-v outlined' }, v), h('div', { class: 'muted' }, label)));
  p.body.append(
    h('div', { class: 'lb-card' },
      farmerFace(row, true, true),
      h('div', { class: 'lb-card-name outlined' }, row.name || 'Farmer'),
      row.farmName ? h('div', { class: 'muted' }, row.farmName) : null,
      tags,
      h('div', { class: 'lb-stats' },
        stat('xp', 'Level', String(row.level)),
        stat('coin', 'Farm value', fmt(row.farmValue)),
        stat('sparkle_heart', 'Charm', fmt(row.charm)),
        stat('calendar', 'This week', `${fmt(row.weeklyXp)} XP`),
      ),
      row.code && !row.bot ? h('div', { class: 'muted lb-card-code' }, 'Friend code ', h('span', { class: 'friend-code' }, row.code)) : null,
    ),
  );
  const close = () => p.close();
  if (!mine && !isFriend(row.id)) {
    const add = addFriendAction(row);
    if (add) {
      const btn = button([icon('heart'), 'Add friend'], async () => {
        btn.disabled = true;
        try {
          const ok = await add();
          if (ok) {
            ui.feedback.toast('Friend added', `${row.name} is now your friend`, 'heart');
            btn.replaceChildren(icon('heart'), 'Friends!');
            tags.append(h('span', { class: 'lb-tag friend' }, icon('heart'), 'Friend'));
            return;
          }
        } catch { ui.feedback.toast('Could not add friend', 'Try again in a moment', 'cloud'); }
        btn.disabled = false;
      });
      p.footer.append(btn);
    }
  }
  for (const hook of playerCardHooks.buttons) {
    try { const el = hook(row, close); if (el) p.footer.append(el); } catch (e) { console.error('[player card]', e); }
  }
  p.footer.append(button('Close', close, 'grey'));
  p.open();
}

/** How "Add friend" works right now: a hooked friends feature, or the Friends panel if one exists. */
function addFriendAction(row: PlayerProfile): (() => Promise<boolean> | boolean) | null {
  const hook = playerCardHooks.addFriend;
  if (hook) return () => hook(row);
  const panels = (ui as unknown as { panels?: Map<string, unknown> }).panels;
  if (panels?.has('friends')) return () => { Panel.closeAll(); ui.open('friends', { add: row.code || row.id, player: row }); return false; };
  return null;
}

ui.register('leaderboard', openLeaderboard);
sideEntries.push(() => (game.state.player.created && game.state.tutorial.done ? { id: 'leaderboard', icon: 'medal', label: 'Leaders', color: 'purple' } : null));
