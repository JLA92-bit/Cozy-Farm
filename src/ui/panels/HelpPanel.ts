import gsap from 'gsap';
import { Panel } from '../Panel';
import { h, icon, itemIcon, button, clear, fmt, priceTag } from '../dom';
import { ui } from '../UI';
import { tutorial } from '../Tutorial';
import { ITEMS } from '../../data';
import { game } from '../../systems/Game';
import { audio, haptics } from '../../systems/Audio';
import { help, type Arrival } from '../../systems/Help';
import { social } from '../../systems/Social';
import { visiting } from '../../systems/Visiting';
import { ASK, REASON_TEXT, askable, hazelUnitPrice, isOpen, needOf } from '../../online/AskHelp';
import type { HelpReason, HelpRequest } from '../../online/types';
import { formatTime } from '../../systems/Timers';
import { visitBannerHooks } from '../../scenes/Visit';
import './help.css';

/**
 * Ask a friend (1.8), the screens: the Ask friends sheet (ui.open('help', { item, qty, reason })), the small
 * "Ask" buttons next to missing items, the Requests strip in Friends, the "Thanks, Ben!" card when items
 * arrive, Hazel's offer and the Auto-help control in Settings. The logic lives in src/systems/Help.ts.
 */

const REASONS: { id: HelpReason; label: string; icon: string }[] = [
  { id: 'order', label: 'Order', icon: 'clipboard' },
  { id: 'recipe', label: 'Workshop', icon: 'hammer' },
  { id: 'truck', label: 'Truck', icon: 'truck' },
  { id: 'other', label: 'Farm', icon: 'house' },
];

const itemName = (item: string): string => ITEMS[item]?.name ?? item.replace(/_/g, ' ');

function nope(el: HTMLElement, title: string, sub?: string): void {
  ui.feedback.toast(title, sub, 'info');
  audio.play('error');
  el.classList.remove('nope');
  void el.offsetWidth;
  el.classList.add('nope');
}

/** A round initial for a friend (we only know their name here). */
function initial(name: string, cls = ''): HTMLElement {
  const COLORS = ['#ff8fb4', '#3fa9f5', '#6cc644', '#ffc93c', '#a77bf3', '#f2955c'];
  let n = 0;
  for (const c of name) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return h('div', { class: `help-face ${cls}`, style: `background:${COLORS[n % COLORS.length]}` }, h('span', { class: 'outlined' }, (name.trim()[0] ?? '?').toUpperCase()));
}

/** "-  3  +" stepper (44px buttons). */
function stepper(value: number, min: number, max: number, onChange: (v: number) => void, label: string): { el: HTMLElement; set: (v: number) => void } {
  let v = value;
  const val = h('span', { class: 'help-qty-val outlined', 'aria-live': 'polite' }, String(v));
  const minus = button('-', () => set(v - 1), 'small grey help-qty-btn', { 'aria-label': `One less ${label}` });
  const plus = button('+', () => set(v + 1), 'small grey help-qty-btn', { 'aria-label': `One more ${label}` });
  const set = (n: number) => {
    v = Math.max(min, Math.min(max, n));
    val.textContent = String(v);
    minus.classList.toggle('disabled', v <= min);
    plus.classList.toggle('disabled', v >= max);
    onChange(v);
  };
  set(v);
  return { el: h('div', { class: 'help-stepper' }, minus, val, plus), set };
}

function progressBar(r: HelpRequest): HTMLElement {
  const pct = Math.round((r.filled / r.qty) * 100);
  return h('div', { class: 'progress help-progress' }, h('div', { class: 'fill', style: `width:${pct}%` }), h('div', { class: 'label' }, `${r.filled} of ${r.qty} arrived`));
}

// ------------------------------------------------------------------ the Ask friends sheet

/** The Ask friends sheet for an item: how many, what for, Ask. Shows the request's progress once asked. */
export function openAskFriends(item: string, qty = 1, reason: HelpReason | string = 'other'): void {
  if (!ITEMS[item]) return;
  const p = new Panel({ title: 'Ask friends', icon: 'hug', color: 'pink', size: 'small' });
  let want = Math.max(1, Math.min(ASK.maxQty, Math.floor(qty) || 1));
  let why: HelpReason = (['order', 'recipe', 'truck', 'visit', 'bundle', 'other'] as string[]).includes(reason) ? reason as HelpReason : 'other';
  let sending = false;
  let armed = 0;
  /** the request this sheet showed as open (it then also shows it once filled) */
  let shown = '';

  const render = () => {
    if (!p.overlay.isConnected && p.body.childElementCount) return;
    last = sig();
    clear(p.body);
    clear(p.footer);
    p.footer.style.display = '';
    const r = help.latestFor(item);
    if (r && (isOpen(r, game.now()) || (r.status === 'filled' && r.id === shown))) renderProgress(r);
    else renderAsk();
    if (!p.footer.childElementCount) p.footer.style.display = 'none';
  };

  const head = () => h('div', { class: 'help-head' }, itemIcon(item, 'help-item-icon'),
    h('div', { class: 'grow' }, h('div', { class: 'help-item-name outlined' }, itemName(item)),
      h('div', { class: 'muted' }, `You have ${fmt(game.count(item))}`)));

  const renderAsk = () => {
    p.body.append(head());
    const friends = social.state.friends.length;
    if (help.practice && friends) p.body.append(h('div', { class: 'social-note' }, icon('info'), h('div', null, h('b', null, 'Practice mode. '), 'Demo neighbours on your friends list answer after a minute or two.')));
    const block = help.canAsk(item);
    if (!friends) {
      p.body.append(h('div', { class: 'help-empty' }, icon('hug', 'icon big'),
        h('div', null, h('div', { class: 'title' }, 'No friends yet'),
          h('div', { class: 'muted' }, help.practice ? 'Add a demo neighbour in Friends to try asking. They answer in a minute or two.' : 'Add friends with their friend code first. They will see what you need and can send it in one tap.'))));
      p.footer.append(button([icon('hug'), help.practice ? 'Add demo neighbours' : 'Add friends'], () => { p.close(); ui.open('friends', { tab: 'friends' }); }, 'green'));
      return;
    }
    if (block) {
      p.body.append(h('div', { class: 'help-block' }, icon('info'), h('div', null, block)));
      const open = help.openMine();
      if (open.length) {
        p.body.append(h('div', { class: 'section-title' }, 'Your requests'));
        p.body.append(myList(open, () => render()));
      }
      p.footer.append(button('OK', () => p.close(), 'grey'));
      return;
    }
    const st = stepper(want, 1, ASK.maxQty, (v) => { want = v; }, itemName(item));
    p.body.append(h('div', { class: 'help-row' }, h('span', { class: 'help-label' }, 'How many?'), st.el));
    const seg = h('div', { class: 'help-reasons', role: 'radiogroup', 'aria-label': 'What it is for' });
    const opts = REASONS.some((x) => x.id === why) ? REASONS : [...REASONS.slice(0, 3), { id: why, label: why === 'visit' ? 'Visitor' : why === 'bundle' ? 'Bundle' : 'Farm', icon: why === 'visit' ? 'smile' : 'gift' }];
    for (const o of opts) {
      const b = h('button', { class: `opt-btn help-reason ${o.id === why ? 'selected' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(o.id === why) }, icon(o.icon), o.label);
      b.addEventListener('click', () => {
        why = o.id;
        seg.querySelectorAll('button').forEach((x) => { x.classList.toggle('selected', x === b); x.setAttribute('aria-checked', String(x === b)); });
        audio.play('select');
      });
      seg.append(b);
    }
    p.body.append(h('div', { class: 'help-label' }, 'What is it for?'), seg);
    p.body.append(h('div', { class: 'muted help-fine' }, `${friends} ${friends === 1 ? 'friend' : 'friends'} will see this for ${ASK.expireHours} hours. What they send goes straight into your barn.`));
    const askBtn = button([icon('hug'), 'Ask friends'], async () => {
      if (sending) return;
      sending = true;
      askBtn.classList.add('disabled');
      try {
        await help.ask(item, want, why);
        audio.play('jingle');
        haptics.play('success');
        ui.feedback.toast('Asked!', `Your friends can see that you need ${want} ${itemName(item)}.`, 'hug');
        game.bus.emit('tutorial', { signal: 'help:asked' });
      } catch (e) { nope(askBtn, 'Not asked', (e as Error).message); }
      sending = false;
      if (p.overlay.isConnected) render();
    }, 'pink-btn help-ask-btn');
    p.footer.append(button('Cancel', () => p.close(), 'grey'), askBtn);
  };

  const renderProgress = (r: HelpRequest) => {
    shown = r.id;
    p.body.append(head());
    const now = game.now();
    const open = isOpen(r, now);
    p.body.append(h('div', { class: 'help-status' },
      h('div', { class: 'title' }, open ? `You asked for ${r.qty} ${itemName(r.item)}` : 'Everything arrived!'),
      progressBar(r),
      h('div', { class: 'muted' }, open ? `Open for ${formatTime(r.expiresAt - now)} more. Items arrive in your barn by themselves.` : 'Thank your friends next time you visit!')));
    if (open) {
      const offer = help.hazelOffers(now).find((x) => x.id === r.id) ?? (now - r.createdAt >= ASK.hazelAfterMin * 60000 ? r : null);
      if (offer) p.body.append(hazelCard(offer, () => render()));
      else p.body.append(h('div', { class: 'muted help-fine' }, `If friends are busy, Hazel from the village shop can bring the rest after ${ASK.hazelAfterMin / 60} hours.`));
      const take = button('Take back', () => {
        if (!armed) {
          take.replaceChildren('Take back?');
          take.classList.replace('grey', 'red');
          armed = window.setTimeout(() => { armed = 0; take.replaceChildren('Take back'); take.classList.replace('red', 'grey'); }, 3000);
          return;
        }
        clearTimeout(armed);
        armed = 0;
        void help.cancel(r.id).then(() => { ui.feedback.toast('Request taken back', 'Anything already sent still arrives.', 'hug'); if (p.overlay.isConnected) render(); })
          .catch((e) => nope(take, 'Not taken back', (e as Error).message));
      }, 'grey');
      p.footer.append(take, button('OK', () => p.close(), 'green'));
    } else p.footer.append(button('Lovely!', () => p.close(), 'green'));
  };

  // re-draw only when something shown here changed (never under the player's finger for nothing)
  const sig = () => { const r = help.latestFor(item); return JSON.stringify([r?.id, r?.status, r?.filled, help.canAsk(item), social.state.friends.length, help.hazelOffers().map((x) => x.id)]); };
  let last = sig();
  const off = help.onChange(() => {
    const now = sig();
    if (now === last) return;
    last = now;
    if (p.overlay.isConnected && !sending) render();
  });
  p.onClose = () => { off(); clearTimeout(armed); };
  render();
  p.open();
  void help.poll();
}

/** The player's own open requests, small rows with progress. */
function myList(list: HelpRequest[], after: () => void): HTMLElement {
  const box = h('div', { class: 'list help-mine' });
  for (const r of list) {
    box.append(h('div', { class: 'list-item clickable', onclick: () => { openAskFriends(r.item, r.qty, r.reason); after(); } },
      itemIcon(r.item, 'icon big'),
      h('div', { class: 'grow' }, h('div', { class: 'title' }, `${r.qty} ${itemName(r.item)}`), progressBar(r))));
  }
  return box;
}

// ------------------------------------------------------------------ Ask buttons next to missing items

/**
 * A small "Ask" button for an item the player is short of (null when asking is not possible here). With an
 * open request it shows the progress instead ("2/5"), and opens it.
 */
export function askButton(item: string, missing: number, reason: HelpReason): HTMLElement | null {
  if (!help.available || !askable(item) || missing <= 0 || visiting.active) return null;
  const r = help.openFor(item);
  const open = (e?: Event) => { e?.stopPropagation(); ui.open('help', { item, qty: Math.min(ASK.maxQty, missing), reason }); };
  if (r) {
    return button([icon('hug'), h('span', { class: 'live' }, `${r.filled}/${r.qty}`)], () => open(), 'small blue help-ask asked', { 'aria-label': `Asked friends for ${itemName(item)}: ${r.filled} of ${r.qty} arrived` });
  }
  return button([icon('hug'), h('span', null, 'Ask')], () => open(), 'small pink-btn help-ask', { 'aria-label': `Ask friends for ${itemName(item)}` });
}

// ------------------------------------------------------------------ Requests strip (Friends)

let stripOpen = false;
/** "Friends need a hand": each friend's open request with a one-tap Send. Null when there is nothing to show. */
export function requestsStrip(): HTMLElement | null {
  if (!help.available) return null;
  const list = help.friendReqs.filter((r) => needOf(r) > 0);
  const mine = help.openMine();
  if (!list.length && !mine.length) return null;
  const box = h('div', { class: 'help-strip' });
  if (list.length) {
    box.append(h('div', { class: 'section-title help-strip-title' }, icon('hug'), `Friends need a hand (${list.length})`));
    const rows = h('div', { class: 'list' });
    const FIRST = 3;
    for (const r of list.slice(0, stripOpen ? list.length : FIRST)) rows.append(requestRow(r));
    box.append(rows);
    if (!stripOpen && list.length > FIRST) {
      box.append(button(`Show ${list.length - FIRST} more`, () => {
        stripOpen = true;
        for (const r of list.slice(FIRST)) rows.append(requestRow(r));
        more.remove();
      }, 'small blue help-more'));
    }
    const more = box.lastElementChild as HTMLElement;
    const left = help.rewardsLeft();
    box.append(h('div', { class: 'muted help-fine' }, left ? `Each send pays a thank-you in coins (${left} more today).` : 'Thank-you coins are used up today, but your friends still love the help!'));
  }
  if (mine.length) {
    box.append(h('div', { class: 'section-title' }, 'You asked for'));
    box.append(myList(mine, () => undefined));
  }
  return box;
}

function requestRow(r: HelpRequest): HTMLElement {
  const need = needOf(r);
  const have = game.count(r.item);
  let qty = Math.max(1, Math.min(need, have));
  const row = h('div', { class: 'list-item help-req' });
  const queued = help.isQueued(r.id);
  const send = button([icon('gift'), h('span', null, `Send ${qty}`)], async () => {
    if (send.classList.contains('disabled')) { nope(send, have ? 'Already sending' : `You have no ${itemName(r.item)}`, have ? undefined : 'Grow or make some, then come back.'); return; }
    if (visiting.active) { help.queue(r, qty); ui.feedback.toast(`We will send ${qty} ${itemName(r.item)} to ${r.requester.name}`, 'As soon as you are back home.', 'hug'); send.classList.add('disabled'); return; }
    send.classList.add('disabled');
    const rect = send.getBoundingClientRect();
    try {
      const res = await help.send(r, qty);
      audio.play('purchase');
      haptics.play('success');
      if (res.coins) { ui.feedback.reward(rect.left + rect.width / 2, rect.top - 10, 'coins', res.coins); ui.feedback.fly(rect.left + rect.width / 2, rect.top, 'coin', 'coins', Math.min(8, Math.ceil(res.coins / 15))); }
      ui.feedback.toast(`Sent ${res.sent} ${itemName(r.item)} to ${r.requester.name}!`, res.coins ? `They say thank you: +${res.coins} coins` : 'They will be so pleased.', 'hug');
    } catch (e) { nope(send, 'Not sent', (e as Error).message); send.classList.remove('disabled'); }
  }, `small green help-send ${have && !queued ? '' : 'disabled'}`, { 'aria-label': `Send ${r.requester.name} ${itemName(r.item)}` });
  const label = send.querySelector('span')!;
  const st = have > 1 && need > 1 ? stepper(qty, 1, Math.min(need, have), (v) => { qty = v; label.textContent = `Send ${v}`; }, itemName(r.item)) : null;
  row.append(
    initial(r.requester.name),
    h('div', { class: 'grow' },
      h('div', { class: 'title' }, r.requester.name, r.requester.id.startsWith('bot_') ? h('span', { class: 'demo-tag' }, 'demo') : null),
      h('div', { class: 'help-need' }, itemIcon(r.item, 'icon'), h('span', null, `needs ${need} ${itemName(r.item)}`)),
      h('div', { class: 'sub' }, `${REASON_TEXT[r.reason]} - you have ${fmt(have)}`),
      queued ? h('div', { class: 'sub' }, 'Sending when you are back home') : null),
    h('div', { class: 'help-send-col' }, st?.el ?? null, send));
  return row;
}

// ------------------------------------------------------------------ Hazel

function hazelCard(r: HelpRequest, after: () => void): HTMLElement {
  const { qty, coins } = help.hazelPrice(r);
  const afford = game.coins >= coins;
  const buy = button(['Yes please', priceTag(coins)], async () => {
    if (!afford) { nope(buy, 'Not enough coins', `Hazel's price is ${fmt(coins)} coins.`); return; }
    buy.classList.add('disabled');
    try {
      const res = await help.hazelBuy(r);
      if (res.qty) {
        const rect = buy.getBoundingClientRect();
        ui.feedback.fly(rect.left + rect.width / 2, rect.top, ITEMS[r.item]?.icon?.startsWith('model:') ? 'package' : ITEMS[r.item]?.icon ?? 'package', 'barn', Math.min(4, res.qty));
        audio.play('purchase');
        ui.feedback.toast(`Hazel brought ${res.qty} ${itemName(r.item)}`, `"Pleasure doing business, dear!" -${fmt(res.coins)} coins`, 'woman_farmer');
      }
    } catch (e) { nope(buy, 'Hazel could not help', (e as Error).message); }
    after();
  }, `small yellow ${afford ? '' : 'disabled'}`);
  return h('div', { class: 'help-hazel' },
    h('div', { class: 'help-hazel-face' }, icon('woman_farmer', 'icon big')),
    h('div', { class: 'grow' },
      h('div', { class: 'title' }, 'Hazel can help'),
      h('div', { class: 'help-hazel-say' }, `"Your friends must be busy. I can bring the other ${qty} ${itemName(r.item)} from my shop for ${fmt(coins)} coins (${hazelUnitPrice(r.item)} each)."`),
      h('div', { class: 'row help-hazel-btns' }, buy,
        button('No thanks', () => { help.hazelDecline(r.id); after(); }, 'small grey'))));
}

/** Hazel's offer as its own card, shown once per request while nothing else is on screen. */
function openHazel(r: HelpRequest): void {
  const p = new Panel({ title: 'A word from Hazel', icon: 'woman_farmer', color: 'purple', size: 'small' });
  const render = () => {
    clear(p.body);
    const cur = help.openMine().find((x) => x.id === r.id);
    if (!cur) { p.close(); return; }
    p.body.append(h('div', { class: 'help-head' }, itemIcon(cur.item, 'help-item-icon'),
      h('div', { class: 'grow' }, h('div', { class: 'help-item-name outlined' }, itemName(cur.item)), progressBar(cur))));
    p.body.append(hazelCard(cur, () => { if (!help.openMine().some((x) => x.id === r.id) || (help.state.hazelNo ?? []).includes(r.id)) p.close(); else render(); }));
    p.body.append(h('div', { class: 'muted help-fine' }, 'Close this to keep waiting for your friends. Hazel will ask again next time.'));
  };
  render();
  p.open();
}

// ------------------------------------------------------------------ "Thanks, Ben!"

let thanksBox: HTMLElement | null = null;
function showArrivals(list: Arrival[]): void {
  if (!list.length) return;
  thanksBox ??= ui.root.appendChild(h('div', { class: 'help-thanks-stack' }));
  // one card per friend, newest on top
  const byFriend = new Map<string, Arrival[]>();
  for (const a of list) byFriend.set(a.from, [...(byFriend.get(a.from) ?? []), a]);
  let delay = 0;
  for (const [from, items] of byFriend) {
    const card = h('div', { class: 'help-thanks', role: 'status' });
    const close = () => {
      if (!card.isConnected) return;
      const r = btn.getBoundingClientRect();
      ui.feedback.floatText(r.left + r.width / 2, r.top, '', 'heart', '#ff8fb4');
      gsap.to(card, { y: -20, opacity: 0, duration: 0.25, onComplete: () => card.remove() });
    };
    const btn = button([icon('heart'), `Thanks, ${from}!`], () => { audio.play('pop'); haptics.play('tap'); close(); }, 'small pink-btn help-thanks-btn');
    card.append(initial(from, 'small'),
      h('div', { class: 'grow' },
        h('div', { class: 'title' }, `${from} sent you`),
        h('div', { class: 'help-thanks-items' }, ...items.map((a) => h('span', { class: 'gift-chip' }, itemIcon(a.item), `${a.qty} ${itemName(a.item)}`))),
        items.some((a) => a.requestDone) ? h('div', { class: 'sub' }, 'Everything you asked for is here!') : null),
      btn);
    thanksBox.prepend(card);
    gsap.fromTo(card, { y: -30, opacity: 0, scale: 0.85 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(2)', delay });
    setTimeout(() => close(), 7000 + delay * 1000);
    // the items fly into the barn
    setTimeout(() => {
      const r = card.getBoundingClientRect();
      for (const a of items) {
        const ic = ITEMS[a.item]?.icon ?? 'package';
        ui.feedback.fly(r.left + 40, r.top + r.height / 2, ic.startsWith('model:') ? 'package' : ic, 'barn', Math.min(4, a.qty));
      }
    }, 450 + delay * 1000);
    delay += 0.3;
  }
  audio.play('jingle');
  haptics.play('success');
  const house = game.buildingsOf('farmhouse')[0];
  if (house && !visiting.active) ui.effects.sparkle(ui.scene.farm.anchor(house.uid), '#ffb3d1', 14);
}

// ------------------------------------------------------------------ Settings: Auto-help

/** One Settings control: Auto-help on/off and how many of each item to keep. */
export function autoHelpSection(): HTMLElement {
  const s = help.state;
  const note = h('div', { class: 'muted hint-note' });
  const keepRow = h('div', { class: 'help-keep' });
  const sync = () => {
    note.textContent = s.auto
      ? `While the game is open, your spare items go to friends who ask. You get the thank-you coins and a letter each day.`
      : 'Send friends what they ask for by yourself, from Friends.';
    keepRow.style.display = s.auto ? '' : 'none';
  };
  const t = h('div', { class: `toggle ${s.auto ? 'on' : ''}`, role: 'switch', 'aria-checked': String(s.auto), 'aria-label': 'Auto-help', tabindex: '0' });
  t.addEventListener('click', () => {
    help.setAuto(!s.auto);
    t.classList.toggle('on', s.auto);
    t.setAttribute('aria-checked', String(s.auto));
    audio.play('select');
    sync();
  });
  const keepText = h('div', { class: 'help-label' });
  const st = stepper(s.reserve, 0, 500, (v) => {
    if (v !== s.reserve) help.setReserve(v);
    keepText.textContent = `Keep at least ${v} of each item for yourself`;
  }, 'item to keep');
  const big = (d: number) => button(d > 0 ? '+10' : '-10', () => st.set(s.reserve + d), 'small grey help-qty-btn wide-step', { 'aria-label': d > 0 ? 'Keep 10 more' : 'Keep 10 fewer' });
  st.el.prepend(big(-10));
  st.el.append(big(10));
  keepRow.append(keepText, st.el);
  sync();
  return h('div', { class: 'setting-row stack help-auto' },
    h('div', { class: 'row between', style: 'width:100%' }, h('label', null, 'Auto-help friends'), t),
    note, keepRow);
}

// ------------------------------------------------------------------ visiting a friend who needs something

/** A speech bubble under the visit banner: what this friend is asking for, with a Send for when back home. */
function visitBubble(ownerId: string, banner: HTMLElement): void {
  const r = help.friendReqs.find((x) => x.requester.id === ownerId && needOf(x) > 0);
  if (!r) return;
  const need = needOf(r);
  const have = game.count(r.item);
  const qty = Math.min(need, have);
  const el = h('div', { class: 'help-visit visit-keep' }, itemIcon(r.item, 'icon item'),
    h('div', { class: 'grow' }, h('b', null, `${r.requester.name} needs ${need} ${itemName(r.item)}`), h('br'), have ? `You have ${fmt(have)}` : 'You have none right now'));
  if (qty > 0) {
    const b = button(help.isQueued(r.id) ? [icon('check'), 'At home'] : [icon('gift'), `Send ${qty}`], () => {
      if (help.isQueued(r.id)) return;
      help.queue(r, qty);
      b.replaceChildren(icon('check'), 'At home');
      b.classList.replace('green', 'grey');
      audio.play('select');
      ui.feedback.toast(`We will send ${qty} ${itemName(r.item)}`, 'As soon as you are back home.', 'hug');
    }, `small ${help.isQueued(r.id) ? 'grey' : 'green'}`, { 'aria-label': `Send ${r.requester.name} ${qty} ${itemName(r.item)} when you are back home` });
    el.append(b);
  }
  banner.classList.add('has-help');
  banner.append(el);
}
visitBannerHooks.push(visitBubble);

// ------------------------------------------------------------------ wiring

ui.register('help', (arg) => {
  const a = (arg ?? {}) as { item?: string; qty?: number; reason?: string };
  if (a.item) openAskFriends(a.item, a.qty ?? 1, a.reason ?? 'other');
});
help.onArrive((list) => showArrivals(list));

let started = false;
let checkAt = 0;
const hazelShown = new Set<string>();
ui.onTick((now) => {
  if (now - checkAt < 1000) return;
  checkAt = now;
  if (!game.state || !help.available) return;
  if (!started) { started = true; help.start(); }
  // Hazel's offer: once per request per session, when nothing else is on screen
  if (Panel.isOpen || tutorial.running || visiting.active || document.hidden) return;
  const offer = help.hazelOffers().find((r) => !hazelShown.has(r.id));
  if (offer) { hazelShown.add(offer.id); openHazel(offer); }
});

Object.assign(window as unknown as Record<string, unknown>, { __helpUI: { openAskFriends, showArrivals, openHazel } });
