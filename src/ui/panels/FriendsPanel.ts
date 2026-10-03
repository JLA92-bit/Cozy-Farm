import gsap from 'gsap';
import { Panel } from '../Panel';
import { h, icon, itemIcon, button, fmt, clear } from '../dom';
import { ui } from '../UI';
import { sideEntries } from '../SideBar';
import { tutorial } from '../Tutorial';
import { COSMETICS, ITEMS } from '../../data';
import { game } from '../../systems/Game';
import { audio, haptics } from '../../systems/Audio';
import { social, SOCIAL, type GiftContents } from '../../systems/Social';
import type { FriendEntry } from '../../systems/State';
import { online } from '../../online/Online';
import type { PlayerProfile, PublicLook } from '../../online/types';
import './friends.css';

type Tab = 'friends' | 'mail' | 'codes';

// ------------------------------------------------------------------ small helpers

/** Farmer portrait from a public look: the matching pre-made avatar on a disc in their shirt colour. */
function portrait(name: string, look?: PublicLook | null, cls = ''): HTMLElement {
  const el = h('div', { class: `friend-portrait ${cls}`, style: `background:${look?.top ?? pickColor(name)}` });
  const av = look ? COSMETICS.avatars.find((a) => a.body === look.body) : null;
  if (av) el.append(icon(`avatar:${av.id}`, 'friend-portrait-img'));
  else el.append(h('span', { class: 'outlined' }, (name.trim()[0] ?? '?').toUpperCase()));
  return el;
}
const COLORS = ['#ff8fb4', '#3fa9f5', '#6cc644', '#ffc93c', '#a77bf3', '#f2955c'];
function pickColor(s: string): string { let n = 0; for (const c of s) n = (n * 31 + c.charCodeAt(0)) >>> 0; return COLORS[n % COLORS.length]; }

function seen(at: number): string {
  const m = Math.max(0, (Date.now() - at) / 60000);
  if (m < 3) return 'Here now';
  if (m < 60) return `Seen ${Math.floor(m)}m ago`;
  if (m < 60 * 24) return `Seen ${Math.floor(m / 60)}h ago`;
  return `Seen ${Math.floor(m / 1440)}d ago`;
}

function contentsRow(c: GiftContents): HTMLElement {
  const row = h('div', { class: 'gift-contents' });
  for (const [k, n] of Object.entries(c.items)) row.append(h('span', { class: 'gift-chip' }, itemIcon(k), `x${fmt(n)}`));
  if (c.coins) row.append(h('span', { class: 'gift-chip' }, icon('coin'), fmt(c.coins)));
  return row;
}

function textInput(placeholder: string, maxlength: number, value = '', cls = ''): HTMLInputElement {
  const input = h('input', { class: `name-input social-input ${cls}`, maxlength: String(maxlength), value, placeholder, 'aria-label': placeholder, autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'done' }) as HTMLInputElement;
  input.addEventListener('pointerdown', (e) => e.stopPropagation());
  return input;
}

function nope(el: HTMLElement, title: string, sub?: string): void {
  ui.feedback.toast(title, sub, 'info');
  audio.play('error');
  el.classList.remove('nope');
  void el.offsetWidth;
  el.classList.add('nope');
}

/** Share with the Web Share sheet when there is one, else copy to the clipboard. */
async function share(text: string, url?: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void>; canShare?: (d: ShareData) => boolean };
  const data: ShareData = url ? { title: 'Cozy Acres', text, url } : { title: 'Cozy Acres', text };
  if (nav.share && (!nav.canShare || nav.canShare(data))) {
    try { await nav.share(data); return 'shared'; } catch (e) { if ((e as Error).name === 'AbortError') return 'cancelled'; }
  }
  return (await copy(url ? `${text} ${url}` : text)) ? 'copied' : 'failed';
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

/** Rewards burst out of `from` and fly into the coin counter and the barn. */
function flyContents(r: DOMRect, c: GiftContents): void {
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  let delay = 0;
  if (c.coins) {
    ui.feedback.reward(x, y - 10, 'coins', c.coins);
    ui.hud.coinsHeld++;
    ui.feedback.fly(x, y, 'coin', 'coins', Math.ceil(c.coins / 15), () => { ui.hud.coinsHeld = Math.max(0, ui.hud.coinsHeld - 1); ui.hud.setCoins(game.coins); });
    delay += 0.12;
  }
  for (const [k, n] of Object.entries(c.items)) {
    const ic = ITEMS[k]?.icon ?? 'package';
    const flat = ic.startsWith('model:') ? 'package' : ic;
    ui.feedback.floatText(x - 20, y - 30, `+${n}`, flat, '#fff', delay);
    setTimeout(() => ui.feedback.fly(x, y, flat, 'barn', Math.min(4, n)), delay * 1000);
    delay += 0.12;
  }
  audio.play('reward');
  haptics.play('success');
}

function practiceNote(): HTMLElement | null {
  if (!social.practice) return null;
  return h('div', { class: 'social-note' }, icon('info'), h('div', null, h('b', null, 'Practice mode - demo neighbours. '), 'Real online play is not connected, so friends here are pretend farmers on this device. Gift codes work with anyone!'));
}

// ------------------------------------------------------------------ main panel

export function openFriends(arg?: { tab?: Tab; code?: string } | string): void {
  const opts = typeof arg === 'string' ? { tab: arg as Tab } : arg ?? {};
  const mailLabel = () => (social.mailCount ? `Mailbox (${social.mailCount})` : 'Mailbox');
  const p = new Panel({
    title: 'Friends', icon: 'hug', color: 'pink', wallet: true,
    tabs: [{ id: 'friends', label: 'Friends', icon: 'hug' }, { id: 'mail', label: mailLabel(), icon: 'mailbox' }, { id: 'codes', label: 'Gift codes', icon: 'gift' }],
  });
  let codeText = opts.code ?? '';
  const profiles = new Map<string, PlayerProfile>();
  let me: PlayerProfile | null = online.me();
  let bots: PlayerProfile[] = [];
  let loading = true;

  const updateMailTab = () => {
    const t = p.tabsEl?.querySelector<HTMLElement>('[data-tab="mail"] .tab-label');
    if (t) t.textContent = mailLabel();
  };

  const render = (tab: string) => {
    clear(p.body);
    clear(p.footer);
    p.footer.style.display = 'none';
    updateMailTab();
    if (tab === 'mail') renderMail();
    else if (tab === 'codes') renderCodes();
    else renderFriends();
  };

  // ---------------- friends tab
  const renderFriends = () => {
    p.body.append(...[practiceNote()].filter(Boolean) as HTMLElement[]);
    // your code
    const codeEl = h('div', { class: 'friend-code outlined' }, me ? me.code : social.error ? '---' : '...');
    const shareBtn = button([icon('hug'), 'Share'], async () => {
      if (!me) return;
      const r = await share(`Be my neighbour in Cozy Acres! My friend code is ${me.code}`);
      if (r === 'copied') ui.feedback.toast('Code copied!', 'Paste it to a friend so they can add you.', 'check');
      else if (r === 'failed') ui.feedback.toast('Your friend code', me.code, 'hug');
    }, 'small blue', { 'aria-label': 'Share your friend code' });
    if (!me) shareBtn.classList.add('disabled');
    p.body.append(h('div', { class: 'social-card my-code' },
      h('div', { class: 'grow' }, h('div', { class: 'muted' }, 'Your friend code'), codeEl,
        social.error ? h('div', { class: 'muted' }, social.error, ' ', button('Retry', () => { social.error = ''; void load(); }, 'small grey')) : null),
      shareBtn));

    // add by code
    const input = textInput('Friend code, e.g. ABC-123', 12, '', 'code-input');
    const add = button('Add', async () => {
      const v = input.value;
      add.classList.add('disabled');
      try {
        const f = await social.addFriend(v);
        audio.play('unlock');
        ui.feedback.toast(`${f.name} is your friend now!`, 'Send them a gift to say hello.', 'hug');
        input.value = '';
        await load();
      } catch (e) { nope(input, 'Could not add friend', (e as Error).message); }
      add.classList.remove('disabled');
    }, 'small green add-btn');
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add.click(); });
    p.body.append(h('div', { class: 'name-row add-row' }, input, add));

    p.body.append(limitsRow());

    // friends
    const list = social.state.friends;
    p.body.append(h('div', { class: 'section-title' }, `Your friends (${list.length})`));
    if (!list.length) p.body.append(h('div', { class: 'empty-state' }, icon('hug'), h('div', null, 'No friends yet. Share your code, or add a friend with theirs.')));
    const box = h('div', { class: 'list' });
    for (const f of list) box.append(friendRow(f));
    p.body.append(box);

    // practice: demo neighbours to try things with
    const extra = bots.filter((b) => !social.isFriend(b.id));
    if (social.practice && extra.length) {
      p.body.append(h('div', { class: 'section-title' }, 'Demo neighbours'));
      const bl = h('div', { class: 'list' });
      for (const b of extra) {
        bl.append(h('div', { class: 'list-item friend-item' }, portrait(b.name, b.look),
          h('div', { class: 'grow' }, h('div', { class: 'title' }, b.name, h('span', { class: 'demo-tag' }, 'demo')), h('div', { class: 'sub' }, `Level ${b.level} · code ${b.code}`)),
          button('Add', () => {
            try { profiles.set(b.id, b); social.addProfile(b); audio.play('unlock'); ui.feedback.toast(`${b.name} is your friend now!`, 'A demo neighbour - great for trying gifts.', 'hug'); } catch (e) { ui.feedback.toast((e as Error).message); }
          }, 'small green')));
      }
      p.body.append(bl);
    }
  };

  const friendRow = (f: FriendEntry): HTMLElement => {
    const prof = profiles.get(f.id);
    const sub = prof ? `Level ${prof.level} · ${seen(prof.updatedAt)}` : loading ? 'Loading...' : 'Not seen lately';
    let armed = 0;
    const remove = button(icon('cross'), () => {
      if (!armed) {
        remove.classList.replace('grey', 'red');
        remove.replaceChildren('Remove?');
        armed = window.setTimeout(() => { armed = 0; remove.classList.replace('red', 'grey'); remove.replaceChildren(icon('cross')); }, 3000);
        return;
      }
      clearTimeout(armed);
      social.removeFriend(f.id);
    }, 'small grey remove-btn', { 'aria-label': `Remove ${f.name}` });
    return h('div', { class: 'list-item friend-item' },
      portrait(f.name, prof?.look),
      h('div', { class: 'grow' }, h('div', { class: 'title' }, f.name, f.id.startsWith('bot_') ? h('span', { class: 'demo-tag' }, 'demo') : null), h('div', { class: 'sub' }, sub)),
      button([icon('gift'), 'Gift'], () => openCompose(f), 'small yellow', { 'aria-label': `Send ${f.name} a gift` }),
      remove);
  };

  // ---------------- mailbox tab
  const renderMail = () => {
    p.body.append(...[practiceNote()].filter(Boolean) as HTMLElement[]);
    const gifts = social.inbox;
    if (!gifts.length) {
      p.body.append(h('div', { class: 'empty-state' }, icon('mailbox'), h('div', null, loading ? 'Checking your mailbox...' : 'Your mailbox is empty. Gifts from friends land here.')));
      return;
    }
    void fetchSenders();
    const box = h('div', { class: 'list' });
    for (const g of gifts) {
      const c = social.clamp(g.items, g.coins);
      const claim = button('Open', async () => {
        if (claim.classList.contains('disabled')) return;
        claim.classList.add('disabled');
        const rect = claim.getBoundingClientRect();
        try {
          const got = await social.claim(g.id);
          flyContents(rect, got);
          ui.feedback.toast(`Gift from ${got.from}`, 'Everything went into your barn.', 'gift');
          const row = claim.closest('.list-item') as HTMLElement | null;
          if (row) gsap.to(row, { scale: 0.8, opacity: 0, duration: 0.3, ease: 'back.in(2)', onComplete: () => render(p.tab) });
          else render(p.tab);
        } catch (e) { nope(claim, 'Oops', (e as Error).message); render(p.tab); }
      }, 'small green');
      box.append(h('div', { class: 'list-item gift-item' },
        portrait(g.from.name, profiles.get(g.from.id)?.look),
        h('div', { class: 'grow' },
          h('div', { class: 'title' }, `From ${g.from.name}`, g.from.id.startsWith('bot_') ? h('span', { class: 'demo-tag' }, 'demo') : null),
          g.message ? h('div', { class: 'gift-msg' }, `"${g.message}"`) : null,
          contentsRow(c)),
        claim));
    }
    p.body.append(box);
    if (gifts.length > 1) {
      const all = button([icon('gift'), 'Open all'], async () => {
        all.classList.add('disabled');
        const rect = all.getBoundingClientRect();
        for (const g of [...social.inbox]) {
          try { flyContents(rect, await social.claim(g.id)); } catch { /* already opened elsewhere */ }
          await new Promise((r) => setTimeout(r, 250));
        }
        render(p.tab);
      }, 'green');
      p.footer.style.display = '';
      p.footer.append(all);
    }
  };

  // ---------------- gift codes tab
  const renderCodes = () => {
    p.body.append(h('div', { class: 'social-note' }, icon('gift'), h('div', null, 'Gift codes work with anyone, on any device - no internet friends needed. Each code can be opened once per farm.')));
    p.body.append(h('div', { class: 'section-title' }, 'Got a gift code?'));
    const input = textInput('Paste a gift code or link', 2000, codeText, 'gift-code-input');
    const preview = h('div', { class: 'code-preview' });
    const openBtn = button([icon('gift'), 'Open'], () => {
      const rect = openBtn.getBoundingClientRect();
      const text = input.value;
      codeText = '';
      try {
        const got = social.claimCode(text);
        flyContents(rect, got);
        if (input.isConnected) { input.value = ''; updatePreview(); }
        ui.feedback.toast(`Gift from ${got.from}!`, got.message ? `"${got.message}"` : 'Everything went into your barn.', 'gift');
      } catch (e) { codeText = text; nope(input, 'Could not open that gift', (e as Error).message); }
    }, 'small green');
    const updatePreview = () => {
      codeText = input.value;
      clear(preview);
      openBtn.classList.toggle('disabled', !input.value.trim());
      if (!input.value.trim()) return;
      const r = social.peekCode(input.value);
      if ('error' in r) { preview.append(h('div', { class: 'muted' }, r.error)); return; }
      preview.append(h('div', { class: 'social-card' }, icon('gift', 'icon big'),
        h('div', { class: 'grow' }, h('div', { class: 'title' }, `A gift from ${r.ok.from}`), r.ok.message ? h('div', { class: 'gift-msg' }, `"${r.ok.message}"`) : null, contentsRow(social.clamp(r.ok.items, r.ok.coins)))));
    };
    input.addEventListener('input', updatePreview);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') openBtn.click(); });
    p.body.append(h('div', { class: 'name-row add-row' }, input, openBtn), preview);
    updatePreview();

    p.body.append(h('div', { class: 'section-title' }, 'Make a gift code'));
    p.body.append(h('div', { class: 'muted', style: 'margin-bottom:8px' }, 'Pick items and coins from your barn, then send the code or link to anyone. The gift leaves your barn right away.'));
    p.body.append(limitsRow());
    p.body.append(button([icon('gift'), 'Make a gift code'], () => openCompose(null), 'purple wide', { style: 'margin-top:8px' }));
  };

  // farmer looks of mailbox senders who are not friends (gifts can arrive while the panel is open)
  let fetching = false;
  const tried = new Set<string>();
  const fetchSenders = async () => {
    const missing = [...new Set(social.inbox.map((g) => g.from.id))].filter((id) => !profiles.has(id) && !tried.has(id));
    if (!missing.length || fetching || loading) return;
    fetching = true;
    for (const id of missing) tried.add(id);
    try {
      const got = await online.getProfiles(missing);
      for (const pr of got) profiles.set(pr.id, pr);
      if (got.length && p.overlay.isConnected && p.tab === 'mail') render('mail');
    } catch { /* initials are fine */ }
    fetching = false;
  };

  let loads = 0;
  const load = async () => {
    const my = ++loads;
    loading = true;
    try {
      me = await social.connect();
      const [map] = await Promise.all([social.friendProfiles(), social.poll()]);
      profiles.clear();
      for (const [k, v] of map) profiles.set(k, v);
      if (social.practice) bots = (await online.leaderboard('level', 50)).filter((b) => b.bot);
    } catch { /* social.error explains */ }
    loading = false;
    await fetchSenders();
    if (my === loads && p.overlay.isConnected) render(p.tab);
  };

  // live updates (new mail, friends added), but never while the player is typing in a box
  const off = social.onChange(() => {
    const typing = document.activeElement instanceof HTMLInputElement && p.body.contains(document.activeElement);
    if (p.overlay.isConnected && !typing) render(p.tab);
    else updateMailTab();
  });
  p.onClose = () => off();
  p.onTab = render;
  p.tab = opts.tab ?? (social.mailCount ? 'mail' : 'friends');
  p.open();
  void load();
}

function limitsRow(): HTMLElement {
  const left = social.giftsLeft();
  return h('div', { class: 'chip-row limits-row' },
    h('span', { class: `pill ${left ? '' : 'short'}` }, icon('gift'), `${left}/${SOCIAL.giftsPerDay} gifts left today`),
    h('span', { class: 'pill' }, icon('coin'), `Up to ${fmt(Math.max(0, Math.min(SOCIAL.maxCoinsPerGift, SOCIAL.maxCoinsPerDay - social.state.sent.coins)))} coins`));
}

// ------------------------------------------------------------------ compose a gift

/** Press-and-hold repeat for the coin stepper. */
function holdRepeat(b: HTMLButtonElement, step: () => void): void {
  let t = 0, held = false;
  const stop = () => { clearTimeout(t); t = 0; };
  const tick = (delay: number) => { t = window.setTimeout(() => { held = true; step(); tick(Math.max(50, delay * 0.8)); }, delay); };
  b.addEventListener('pointerdown', () => { held = false; stop(); tick(380); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
  b.addEventListener('click', (e) => { if (held) { e.stopImmediatePropagation(); held = false; } }, { capture: true });
}

/** Pick items and coins for a friend (friend set) or for a shareable gift code (friend null). */
export function openCompose(friend: FriendEntry | null): void {
  const p = new Panel({ title: friend ? `Gift for ${friend.name}` : 'Make a gift code', icon: 'gift', color: friend ? 'pink' : 'purple', size: 'medium', wallet: true });
  const chosen: Record<string, number> = {};
  let coins = 0;
  let message = '';
  const units = () => Object.values(chosen).reduce((s, n) => s + n, 0);

  const chosenBox = h('div', { class: 'compose-chosen' });
  const coinVal = h('span', { class: 'qty-val outlined' }, '0');
  const grid = h('div', { class: 'grid tight compose-grid' });
  const sendBtn = button(friend ? [icon('gift'), 'Send gift'] : [icon('gift'), 'Make code'], () => void submit(), friend ? 'green' : 'purple');
  const countPill = h('span', { class: 'pill' });

  const render = () => {
    clear(chosenBox);
    const entries = Object.entries(chosen).filter(([, n]) => n > 0);
    if (!entries.length && !coins) chosenBox.append(h('div', { class: 'muted' }, 'Tap items in your barn below to add them.'));
    for (const [k, n] of entries) {
      const chip = h('button', { class: 'gift-chip clickable', type: 'button', 'aria-label': `Take one ${ITEMS[k]?.name ?? k} back` }, itemIcon(k), `x${n}`, h('span', { class: 'chip-x' }, '-'));
      chip.addEventListener('click', () => { chosen[k]--; if (chosen[k] <= 0) delete chosen[k]; audio.play('select'); render(); });
      chosenBox.append(chip);
    }
    countPill.replaceChildren(icon('package'), `${units()}/${SOCIAL.maxItemsPerGift} items`);
    coinVal.textContent = fmt(coins);
    sendBtn.classList.toggle('disabled', !!social.check(chosen, coins));
    // barn
    clear(grid);
    const items = Object.entries(game.state.inventory).filter(([id, n]) => n > 0 && ITEMS[id]).sort((a, b) => ITEMS[a[0]].sell - ITEMS[b[0]].sell || ITEMS[a[0]].name.localeCompare(ITEMS[b[0]].name));
    if (!items.length) grid.append(h('div', { class: 'muted' }, 'Your barn is empty.'));
    for (const [id, n] of items) {
      const left = n - (chosen[id] ?? 0);
      const card = h('div', { class: `card clickable item-card ${chosen[id] ? 'selected' : ''} ${left <= 0 ? 'locked' : ''}` }, itemIcon(id, 'card-icon'), h('div', { class: 'card-sub' }, ITEMS[id].name), h('div', { class: 'count-tag outlined' }, `x${fmt(left)}`));
      card.addEventListener('click', () => {
        if (left <= 0) return nope(card, 'That is all you have');
        if (units() >= SOCIAL.maxItemsPerGift) return nope(card, `Up to ${SOCIAL.maxItemsPerGift} items per gift`);
        if (!chosen[id] && Object.keys(chosen).length >= SOCIAL.maxStacksPerGift) return nope(card, `Up to ${SOCIAL.maxStacksPerGift} kinds of items per gift`);
        chosen[id] = (chosen[id] ?? 0) + 1;
        audio.play('select');
        render();
      });
      grid.append(card);
    }
  };

  const step = (d: number) => {
    const max = social.coinsLeft();
    const next = Math.max(0, Math.min(max, coins + d));
    if (next === coins && d > 0) { nope(coinVal, max ? `Up to ${fmt(max)} coins right now` : 'No coins to give right now'); return; }
    coins = next;
    render();
  };
  const minus = button('-', () => step(-10), 'small grey qty-btn', { 'aria-label': '10 coins less' });
  const plus = button('+', () => step(10), 'small grey qty-btn', { 'aria-label': '10 coins more' });
  holdRepeat(minus, () => step(-10));
  holdRepeat(plus, () => step(10));
  const msg = textInput('A short note (optional)', SOCIAL.messageMax);
  msg.addEventListener('input', () => { message = msg.value; });

  const submit = async () => {
    const why = social.check(chosen, coins);
    if (why) { nope(sendBtn, 'Not yet', why); return; }
    sendBtn.classList.add('disabled');
    try {
      if (friend) {
        await social.send(friend, { ...chosen }, coins, message);
        audio.play('purchase');
        haptics.play('success');
        ui.feedback.toast(`Gift sent to ${friend.name}!`, friend.id.startsWith('bot_') ? 'Your demo neighbour is delighted.' : 'It is waiting in their mailbox.', 'gift');
        p.close();
      } else {
        const code = social.makeCode({ ...chosen }, coins, message);
        audio.play('purchase');
        p.close();
        showCode(code);
      }
    } catch (e) { nope(sendBtn, 'Gift not sent', (e as Error).message); render(); }
  };

  if (!friend) p.body.append(h('div', { class: 'social-note' }, icon('gift'), h('div', null, 'Anyone you send the code to can open it once. The gift leaves your barn now.')));
  p.body.append(
    h('div', { class: 'row between compose-head' }, h('div', { class: 'section-title' }, 'In the gift'), countPill),
    chosenBox,
    h('div', { class: 'compose-coins' }, icon('coin'), h('span', { class: 'grow' }, 'Coins'), h('div', { class: 'qty-stepper' }, minus, coinVal, plus)),
    msg,
    h('div', { class: 'section-title' }, 'From your barn'),
    grid,
  );
  p.footer.append(h('span', { class: 'muted compose-left' }, `${social.giftsLeft()}/${SOCIAL.giftsPerDay} gifts left today`), sendBtn);
  render();
  p.open();
}

/** After making a gift code: share or copy it. */
function showCode(code: string): void {
  const link = `${location.origin}${location.pathname}?gift=${code}`;
  const p = new Panel({ title: 'Your gift code', icon: 'gift', color: 'purple', size: 'small' });
  const ta = h('textarea', { class: 'code-box', readonly: 'true', rows: '4', 'aria-label': 'Gift link' }) as HTMLTextAreaElement;
  ta.value = link;
  ta.addEventListener('pointerdown', (e) => e.stopPropagation());
  ta.addEventListener('focus', () => ta.select());
  p.body.append(
    h('div', { class: 'center', style: 'margin-bottom:8px' }, icon('gift', 'icon code-gift')),
    h('div', { class: 'muted center', style: 'margin-bottom:8px' }, 'Send this link to a friend. They can open it, or paste it in Friends > Gift codes. It works once per farm.'),
    ta,
  );
  const done = (r: string, what: string) => {
    if (r === 'copied') ui.feedback.toast(`${what} copied!`, 'Paste it in a message to a friend.', 'check');
    else if (r === 'failed') { ta.focus(); ta.select(); ui.feedback.toast('Copy it by hand', 'Select the text and copy it.', 'info'); }
  };
  if (typeof (navigator as { share?: unknown }).share === 'function') p.footer.append(button([icon('hug'), 'Share'], async () => done(await share('A gift for you in Cozy Acres!', link), 'Link'), 'blue'));
  p.footer.append(
    button('Copy link', async () => done((await copy(link)) ? 'copied' : 'failed', 'Link'), 'green'),
    button('Copy code', async () => done((await copy(code)) ? 'copied' : 'failed', 'Code'), 'grey'),
  );
  p.open();
  gsap.fromTo(p.body.querySelector('.code-gift'), { scale: 0.3, rotate: -20 }, { scale: 1, rotate: 0, duration: 0.6, ease: 'elastic.out(1.2, 0.5)' });
}

// ------------------------------------------------------------------ wiring

ui.register('friends', (arg) => openFriends(arg as { tab?: Tab; code?: string } | undefined));
sideEntries.push(() => (social.available ? { id: 'friends', icon: social.mailCount ? 'mailbox' : 'hug', label: social.mailCount ? 'Mail' : 'Friends', color: 'green', badge: social.mailCount > 0 } : null));

let started = false;
let badgeAt = 0;
ui.onTick((now) => {
  if (now - badgeAt < 500) return;
  badgeAt = now;
  if (!started && game.state) { started = true; social.start(); }
  if (social.mailCount > 1) ui.hud.setBadge('friends', social.mailCount);
  // a ?gift= link: open it as soon as the farm is ready and nothing else is on screen
  if (social.pendingCode && social.available && !Panel.isOpen && !tutorial.running) {
    const code = social.pendingCode;
    social.pendingCode = null;
    openFriends({ tab: 'codes', code });
  }
});
Object.assign(window as unknown as Record<string, unknown>, { __social: social });
