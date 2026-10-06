import './style.css';
import { configured, session, signIn, signOut, rpc, sb } from './api';
import { h, clear, toast } from './ui';
import { overviewView } from './views/overview';
import { playersView, playerView } from './views/players';
import { giftsView } from './views/gifts';
import { codesView } from './views/codes';
import { backupsView } from './views/backups';
import { feedbackView } from './views/feedback';
import { marketView } from './views/market';
import { leaderboardsView } from './views/leaderboards';
import { notifyView } from './views/notify';
import { systemView } from './views/system';

type View = (host: HTMLElement, arg?: string) => Promise<void> | void;
const NAV: { id: string; label: string; icon: string; view: View }[] = [
  { id: 'overview', label: 'Overview', icon: '◔', view: overviewView },
  { id: 'players', label: 'Players', icon: '☺', view: playersView },
  { id: 'gifts', label: 'Gifts', icon: '✦', view: giftsView },
  { id: 'codes', label: 'Codes', icon: '#', view: codesView },
  { id: 'backups', label: 'Backups', icon: '⤓', view: backupsView },
  { id: 'feedback', label: 'Feedback', icon: '✉', view: feedbackView },
  { id: 'market', label: 'Market', icon: '⚖', view: marketView },
  { id: 'leaderboards', label: 'Leaderboards', icon: '★', view: leaderboardsView },
  { id: 'notify', label: 'Notifications', icon: '🔔', view: notifyView },
  { id: 'system', label: 'System & log', icon: '⚙', view: systemView },
];

const app = document.getElementById('app')!;

function theme(): void {
  let t: string | null = null;
  try { t = localStorage.getItem('cozy-admin-theme'); } catch { /* blocked */ }
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
}

function signInScreen(message = '', email = ''): void {
  clear(app);
  app.append(h('main', { class: 'signin' }, h('div', { class: 'signin-card card' },
    h('div', { class: 'brand big' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, '⌂'), 'Cozy Acres Admin'),
    !configured ? h('p', { class: 'error-box' }, 'This build has no Supabase settings (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).') : null,
    message ? h('p', { class: 'error-box' }, message) : h('p', { class: 'muted' }, 'Private dashboard. Sign in with the Google account that is on the admin list.'),
    email ? h('p', { class: 'muted small' }, `Signed in as ${email}.`) : null,
    configured ? h('button', { class: 'btn primary wide', onclick: () => signIn().catch((e) => toast((e as Error).message, 'err')) }, 'Sign in with Google') : null,
    email ? h('button', { class: 'btn wide', onclick: async () => { await signOut(); signInScreen(); } }, 'Use a different account') : null)));
}

let main: HTMLElement;
let navEls: Record<string, HTMLElement> = {};
let badgeFeedback: HTMLElement;

function shell(email: string): void {
  clear(app);
  navEls = {};
  badgeFeedback = h('span', { class: 'nav-badge', hidden: true });
  const nav = h('nav', { class: 'nav', 'aria-label': 'Sections' }, NAV.map((n) => {
    const a = h('a', { href: `#/${n.id}`, class: 'nav-item' }, h('span', { class: 'nav-icon', 'aria-hidden': 'true' }, n.icon), h('span', null, n.label), n.id === 'feedback' ? badgeFeedback : null);
    navEls[n.id] = a;
    return a;
  }));
  const toggleTheme = () => {
    const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('cozy-admin-theme', document.documentElement.dataset.theme); } catch { /* blocked */ }
  };
  main = h('main', { class: 'main', id: 'main' });
  app.append(h('div', { class: 'layout' },
    h('aside', { class: 'side' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, '⌂'), 'Cozy Acres', h('span', { class: 'badge' }, 'Admin')),
      nav,
      h('div', { class: 'side-foot' },
        h('div', { class: 'muted small', title: email }, email),
        h('div', { class: 'row' },
          h('button', { class: 'btn small', onclick: toggleTheme }, 'Light / dark'),
          h('button', { class: 'btn small', onclick: async () => { await signOut(); signInScreen(); } }, 'Sign out')),
        h('a', { class: 'small', href: '../play/', target: '_blank', rel: 'noopener' }, 'Open the game ↗'))),
    main));
}

async function route(): Promise<void> {
  const [, id = 'overview', arg] = location.hash.split('/');
  const entry = id === 'player' ? null : NAV.find((n) => n.id === id) ?? NAV[0];
  for (const [k, el] of Object.entries(navEls)) el.classList.toggle('active', k === (entry?.id ?? 'players'));
  clear(main);
  main.scrollTop = 0;
  window.scrollTo(0, 0);
  const host = h('div', { class: 'view' });
  main.append(host);
  if (id === 'player' && arg) await playerView(host, decodeURIComponent(arg));
  else await entry!.view(host);
}

export function refreshBadges(): void {
  rpc<{ feedbackNew: number }>('admin_overview', { p_days: 7 }).then((o) => {
    badgeFeedback.hidden = !o.feedbackNew;
    badgeFeedback.textContent = String(o.feedbackNew);
  }).catch(() => { /* ignore */ });
}

async function start(): Promise<void> {
  theme();
  if (!configured) { signInScreen(); return; }
  const s = await session();
  if (!s) { signInScreen(); return; }
  const email = s.user.email ?? '';
  let who: { admin: boolean; email?: string };
  try { who = await rpc('admin_whoami'); } catch (e) {
    signInScreen(/admin_whoami/.test((e as Error).message) ? 'The admin functions are not on the server yet. Run the latest supabase/schema.sql (ADMIN.md).' : (e as Error).message, email);
    return;
  }
  if (!who.admin) { signInScreen('This Google account is not on the admin list.', email); return; }
  shell(who.email ?? email);
  window.addEventListener('hashchange', () => void route());
  await route();
  refreshBadges();
  sb?.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') signInScreen(); });
}

void start();
