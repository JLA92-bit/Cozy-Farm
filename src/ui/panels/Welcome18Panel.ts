/**
 * 1.8 "Village Friends" welcome cards (rules and saved progress: src/systems/Welcome18.ts).
 *
 * One panel walks through the steps; "Later" (or the close button) keeps the step for next time and a small
 * "1.8 tour" side button brings it back in the same session. "Find it here" hides the panel and points at the
 * real button. The first gift hands over to the Village screen (ui.open('village', { villager: 'rosa' })) with a
 * small helper box and a pointing hand; without the Village screen the card offers the gift itself.
 */
import gsap from 'gsap';
import { Panel } from '../Panel';
import { h, icon, itemIcon, button, fmt, setIcon } from '../dom';
import { ui } from '../UI';
import { game } from '../../systems/Game';
import { audio, haptics } from '../../systems/Audio';
import { village } from '../../systems/Village';
import { visiting } from '../../systems/Visiting';
import { welcome18, hazelLetter, W18, W18_STEPS, type W18Step, type W18Variant } from '../../systems/Welcome18';
import { BUILDING, ITEMS, VILLAGER, VILLAGERS } from '../../data';
import { APP_VERSION, compareVersions } from '../../systems/Version';
import { openWhatsNew, refreshWhatsNewDot } from './WhatsNewPanel';
import { tutorial } from '../Tutorial';
import { thumbs } from '../../world/Thumbs';
import { sideEntries } from '../SideBar';
import { logEvent, tasteFromPoints, wireEventLog } from '../../online/Events';
import type { Letter } from '../../systems/State';
import './welcome18.css';

// ------------------------------------------------------------------------------------------- portraits

interface Look { body: string; skin: string; hair: string; top: string; bottom: string; hat: string }

/** How the villagers look until villagers.json gives them a `look` of their own. */
const LOOKS: Record<string, Look> = {
  rosa: { body: 'female-a', skin: '#f6c9a0', hair: '#d9473a', top: '#ff8fb4', bottom: '#f7f1e3', hat: 'chef' },
  tom: { body: 'male-c', skin: '#e8b38a', hair: '#9aa5b1', top: '#1f4e9c', bottom: '#8a5528', hat: 'bucket' },
  juniper: { body: 'female-d', skin: '#c98a5e', hair: '#a77bf3', top: '#2fbfa8', bottom: '#3b3b45', hat: 'flower_crown' },
  pip: { body: 'male-a', skin: '#ffe0c2', hair: '#c98a4b', top: '#ffc93c', bottom: '#3fa9f5', hat: 'cap' },
  hazel: { body: 'female-e', skin: '#7a4b2c', hair: '#f2e2b0', top: '#6cc644', bottom: '#8a5528', hat: 'none' },
  bram: { body: 'male-f', skin: '#a26a43', hair: '#2b2622', top: '#3b3b45', bottom: '#c0582b', hat: 'none' },
};
const BG: Record<string, string> = { rosa: '#ffd6e4', tom: '#d4ecff', juniper: '#e6dcff', pip: '#fff0b8', hazel: '#dff5cf', bram: '#f3dcc8' };

function lookOf(id: string): Look {
  const l = (VILLAGER[id] as unknown as { look?: Partial<Look> } | undefined)?.look;
  const ok = l && (['body', 'skin', 'hair', 'top', 'bottom', 'hat'] as const).every((k) => typeof l[k] === 'string');
  return ok ? (l as Look) : LOOKS[id] ?? LOOKS.hazel;
}

/** A round villager portrait (their 3D farmer, posed), with a soft colour behind it. */
export function villagerPortrait(id: string, size: 'big' | 'mid' | 'small' = 'mid'): HTMLElement {
  const img = h('img', { class: 'w18-portrait-img', alt: '', draggable: 'false' });
  img.style.visibility = 'hidden';
  // setIcon has no 'look:' keys; the thumbnail renderer does (as for leaderboard farmers)
  void thumbs.get(`look:${JSON.stringify(lookOf(id))}`).then((url) => { if (url) { img.src = url; img.style.visibility = ''; } });
  return h('span', { class: `w18-portrait ${size}`, style: { background: BG[id] ?? '#fff1d6' }, 'aria-hidden': 'true' }, img);
}

/** "3 hearts" with a heart icon: never colour alone. */
function heartsPill(id: string): HTMLElement {
  const n = village.hearts(id);
  return h('span', { class: 'w18-hearts' }, icon('heart'), h('span', null, `${n} ${n === 1 ? 'heart' : 'hearts'}`));
}

const vname = (id: string) => VILLAGER[id]?.name ?? id;

// ------------------------------------------------------------------------------------------- "find it here"

/** Where each new thing lives on screen. Buttons other 1.8 parts add are found by their panel id. */
interface Target { label: string; icon: string; sel?: string; world?: 'order_board' }
const TARGETS: Record<string, Target> = {
  village: { label: 'Village', icon: 'house', sel: '[data-hud="village"], [data-side="village"]' },
  quality: { label: 'Barn', icon: 'hut', sel: '[data-hud="inventory"]' },
  mail: { label: 'Mail', icon: 'mailbox', sel: '[data-hud="mail"], [data-side="mail"], [data-side="mailbox"]' },
  help: { label: 'Order Board', icon: 'clipboard', world: 'order_board' },
};

function visibleEl(sel: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') return el;
  }
  return null;
}

/**
 * A pulsing ring and a pointing hand on a button or a place on the farm, with a speech box. Tapping anywhere
 * (or "Back") ends it. Re-positions every frame so it follows the camera.
 */
class Pointer {
  private ring = h('div', { class: 'tut-ring w18-ring' });
  private hand = icon('hand', 'tut-hand w18-hand');
  private catcher = h('div', { class: 'w18-catcher' });
  private box: HTMLElement;
  private raf = 0;
  private tween: gsap.core.Tween;
  private down = false;
  constructor(private where: () => { x: number; y: number } | null, text: string, private done: () => void) {
    this.box = h('div', { class: 'tut-box w18-box' }, villagerPortrait('hazel', 'small'), h('div', { class: 'tut-text' }, text),
      h('div', { class: 'w18-box-row' }, button('Back', () => this.end(), 'small')));
    this.catcher.addEventListener('pointerdown', (e) => { e.preventDefault(); this.end(); });
    ui.root.append(this.catcher, this.ring, this.hand, this.box);
    this.tween = gsap.to(this.hand, { y: -14, duration: 0.45, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    gsap.fromTo(this.box, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.3, ease: 'back.out(2)' });
    const tick = () => { this.place(); this.raf = requestAnimationFrame(tick); };
    tick();
    audio.play('pop', { volume: 0.6 });
  }
  private place(): void {
    const p = this.where();
    this.ring.style.display = this.hand.style.display = p ? '' : 'none';
    if (!p) return;
    const down = p.y > innerHeight - 170;
    if (down !== this.down) { this.down = down; setIcon(this.hand as HTMLImageElement, down ? 'hand_down' : 'hand'); }
    this.ring.style.left = `${p.x}px`; this.ring.style.top = `${p.y}px`;
    this.hand.style.left = `${p.x - 12}px`; this.hand.style.top = down ? `${p.y - 74}px` : `${p.y + 6}px`;
    // keep the speech box away from the target
    this.box.classList.toggle('top', p.y > innerHeight * 0.5);
  }
  end(): void {
    cancelAnimationFrame(this.raf);
    this.tween.kill();
    this.catcher.remove(); this.ring.remove(); this.hand.remove(); this.box.remove();
    this.done();
  }
}

// ------------------------------------------------------------------------------------------- the cards

interface NewsCard { id: W18Step; target: string; title: string; icon: string; color: string; lines: [string, string]; art: () => HTMLElement }

const NEWS: NewsCard[] = [
  {
    id: 'news_village', target: 'village', title: 'Village Friends', icon: 'hug', color: 'pink',
    lines: ['Six villagers live just down the lane. Visit them, have a chat, and bring each one a gift every day.',
      'Gifts fill their hearts. More hearts bring letters, keepsakes and handy perks for your farm.'],
    art: () => h('div', { class: 'w18-art village' },
      ...['rosa', 'tom', 'pip'].map((id, i) => h('div', { class: `w18-art-friend f${i}` }, villagerPortrait(id, 'mid'),
        h('span', { class: 'w18-art-heart' }, icon('heart'), h('b', null, i === 1 ? '+40' : '+20'))))),
  },
  {
    id: 'news_quality', target: 'quality', title: 'Star quality', icon: 'star', color: 'yellow',
    lines: ['Some of what you grow and make now comes out silver or gold.',
      'Starred items sell for more and make extra special gifts. Look for the stars in your barn.'],
    art: () => h('div', { class: 'w18-art quality' },
      ...([['Normal', ''], ['Silver', 'silver'], ['Gold', 'gold']] as const).map(([word, q]) => h('div', { class: `w18-q ${q}` },
        itemIcon('strawberry', 'w18-q-item'), q ? h('span', { class: 'w18-q-star' }, icon('star')) : null, h('span', { class: 'w18-q-word' }, word)))),
  },
  {
    id: 'news_mail', target: 'mail', title: 'Your mailbox', icon: 'mailbox', color: 'blue',
    lines: ['Villagers write to you, and one of them drops by each day with a small wish.',
      'Your mailbox keeps their letters, little gifts and the finds waiting around your farm.'],
    art: () => h('div', { class: 'w18-art mail' },
      h('div', { class: 'w18-mailbox' }, icon('mailbox')),
      h('div', { class: 'w18-envelope e0' }, icon('memo'), h('span', null, 'From Rosa')),
      h('div', { class: 'w18-envelope e1' }, icon('gift'), h('span', null, 'A small gift'))),
  },
  {
    id: 'news_help', target: 'help', title: 'Ask a friend', icon: 'hug', color: 'green',
    lines: ['Missing something for an order or a recipe? Tap Ask and a friend can send it to you.',
      'You can help your friends the same way, and Hazel steps in when nobody can.'],
    art: () => h('div', { class: 'w18-art help' },
      h('div', { class: 'w18-order' }, h('div', { class: 'w18-order-need' }, itemIcon('egg', 'w18-order-item'), h('b', null, '2 / 6')),
        h('span', { class: 'w18-fake-btn' }, icon('hug'), 'Ask')),
      h('div', { class: 'w18-arrow', 'aria-hidden': 'true' }, '→'),
      h('div', { class: 'w18-art-friend' }, villagerPortrait('juniper', 'mid'), h('span', { class: 'w18-art-heart' }, itemIcon('egg'), h('b', null, '+4')))),
  },
];

interface FlowOpts { replay?: boolean; onClose?: () => void }

let flow: Flow | null = null;
/** Set after "Later": a side button brings the welcome back in this session. */
let resumable: W18Variant | null = null;

class Flow {
  private p: Panel | null = null;
  private i: number;
  private steps: W18Step[];
  private vi = 0;
  /** the panel is closing to show something else, not because the player chose Later */
  private handOff = false;
  private ended = false;
  private gift: { taste: string; coins: number; points: number } | null = null;
  private offGift: (() => void) | null = null;
  private coach: HTMLElement | null = null;
  private coachTimer = 0;
  private coachTween: gsap.core.Tween | null = null;
  private coachHand: HTMLImageElement | null = null;
  private coachRing: HTMLElement | null = null;

  constructor(private variant: W18Variant, private opts: FlowOpts) {
    this.steps = W18_STEPS[variant];
    this.i = opts.replay ? 0 : welcome18.stepIndex(variant);
    // a reload half way through the villagers carousel starts it again from Rosa
  }

  start(): void {
    welcome18.running = true;
    welcome18.replay = !!this.opts.replay;
    resumable = null;
    if (!this.opts.replay) {
      // the welcome is the 1.8 release notes: What's new does not pop up as well
      if (compareVersions(game.state.lastSeenVersion, APP_VERSION) < 0) { game.state.lastSeenVersion = APP_VERSION; refreshWhatsNewDot(); }
      logEvent(this.i ? 'welcome_resume' : 'welcome_start', { step: this.steps[this.i], variant: this.variant });
    }
    if (this.steps[this.i] === 'gift') this.watchGift();
    this.openPanel();
  }

  // ---------------------------------------------------------------- panel

  private openPanel(): void {
    const p = new Panel({ title: this.variant === 'short' ? 'Meet the village' : 'Village Friends', size: 'medium', color: 'pink', icon: 'sparkle_heart' });
    p.panel.classList.add('w18-panel');
    p.onClose = () => { if (this.p === p) this.p = null; if (this.handOff) { this.handOff = false; return; } this.later(); };
    this.p = p;
    this.render();
    p.open();
  }

  private render(anim = 0): void {
    const p = this.p;
    if (!p) return;
    const step = this.steps[this.i];
    p.body.replaceChildren(this.progress(), this.card(step));
    p.footer.replaceChildren(...this.footer(step));
    p.footer.style.display = '';
    p.body.scrollTop = 0;
    if (anim) gsap.fromTo(p.body.children[1], { opacity: 0, x: 40 * anim }, { opacity: 1, x: 0, duration: 0.3, ease: 'power2.out', clearProps: 'transform,opacity' });
  }

  private progress(): HTMLElement {
    const n = this.steps.length;
    return h('div', { class: 'w18-progress' },
      h('div', { class: 'w18-dots', 'aria-hidden': 'true' }, ...this.steps.map((_, k) => h('span', { class: k < this.i ? 'done' : k === this.i ? 'now' : '' }))),
      h('div', { class: 'w18-step-word' }, `Step ${this.i + 1} of ${n}`));
  }

  private footer(step: W18Step): HTMLElement[] {
    const later = button('Later', () => this.p?.close(), 'small grey w18-later', { 'aria-label': 'Later, carry on another time' });
    const back = this.i > 0 && !(step === 'gift' && this.gift) ? button('Back', () => this.back(), 'small blue w18-back') : null;
    const next = (label: string, fn = () => this.next(), ic = 'check') => button([h('span', null, label), icon(ic)], fn, 'green w18-next');
    const last = this.i === this.steps.length - 1;
    switch (step) {
      case 'letter': return [later, next('Meet the villagers', undefined, 'hug')];
      case 'villagers': {
        const lastV = this.vi >= VILLAGERS.length - 1;
        return [later, back, next(lastV ? (this.variant === 'short' ? 'First gift' : "What's new") : 'Next', () => {
          if (lastV) this.next();
          else { this.vi++; this.render(1); audio.play('page', { volume: 0.5 }); }
        }, lastV ? 'sparkles' : 'hug')].filter(Boolean) as HTMLElement[];
      }
      case 'gift':
        if (this.gift) return [next(last ? 'Done' : 'Your farm in 1.8', () => (last ? this.done() : this.next()), last ? 'check' : 'house')];
        return [later, back, button('Skip', () => this.skipGift(), 'small grey')].filter(Boolean) as HTMLElement[];
      case 'summary': return [button("What's new", () => this.allChanges(), 'small blue w18-back', { 'aria-label': "What's new: every change in 1.8" }), next("Let's play!", () => this.done(), 'seedling')];
      default: return [later, back, next('Next', undefined, 'sparkles')].filter(Boolean) as HTMLElement[];
    }
  }

  private card(step: W18Step): HTMLElement {
    switch (step) {
      case 'letter': return this.letterCard();
      case 'villagers': return this.villagerCard();
      case 'gift': return this.giftCard();
      case 'summary': return this.summaryCard();
      default: return this.newsCard(NEWS.find((c) => c.id === step)!);
    }
  }

  private go(i: number, dir: number): void {
    this.i = Math.max(0, Math.min(this.steps.length - 1, i));
    welcome18.setStep(this.variant, this.i);
    if (this.steps[this.i] === 'villagers') this.vi = dir < 0 ? VILLAGERS.length - 1 : 0;
    if (this.steps[this.i] === 'gift') this.watchGift();
    audio.play('page', { volume: 0.5 });
    this.render(dir);
  }
  private next(): void { haptics.buzz(8); this.go(this.i + 1, 1); }
  private back(): void {
    if (this.steps[this.i] === 'villagers' && this.vi > 0) { this.vi--; this.render(-1); audio.play('page', { volume: 0.5 }); return; }
    this.go(this.i - 1, -1);
  }

  // ---------------------------------------------------------------- steps

  private letterCard(): HTMLElement {
    let l: Letter;
    try { l = welcome18.letter(this.variant); } catch { const t = hazelLetter(this.variant, game.state.player.name); l = { id: 0, at: 0, from: 'hazel', title: t.title, body: t.body, read: true, claimed: true }; }
    if (l.id && !l.read && !welcome18.replay) { l.read = true; }
    const paras = l.body.split(/\n{2,}/);
    const sign = paras.length > 1 ? paras.pop()! : '';
    return h('div', { class: 'w18-card' },
      h('div', { class: 'w18-letter' },
        h('div', { class: 'w18-letter-head' }, villagerPortrait('hazel', 'mid'),
          h('div', { class: 'w18-letter-from' }, h('div', { class: 'w18-letter-kicker' }, 'A letter from Hazel'), h('div', { class: 'w18-letter-title' }, l.title)),
          h('span', { class: 'w18-stamp', 'aria-hidden': 'true' }, icon('sparkle_heart'))),
        ...paras.map((t) => h('p', null, t)),
        sign ? h('p', { class: 'w18-sign' }, ...sign.split('\n').flatMap((s, k) => (k ? [h('br'), s] : [s]))) : null),
      h('div', { class: 'w18-note' }, icon('mailbox'), h('span', null, 'Letters like this one wait for you in your new mailbox.')));
  }

  private villagerCard(): HTMLElement {
    const v = VILLAGERS[this.vi];
    const loves = v.loves.filter((x) => ITEMS[x]).slice(0, 3);
    const strip = h('div', { class: 'w18-vstrip', role: 'tablist', 'aria-label': 'Villagers' }, ...VILLAGERS.map((x, k) =>
      h('button', { class: `w18-vtab${k === this.vi ? ' on' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(k === this.vi), 'aria-label': x.name,
        onclick: () => { if (k !== this.vi) { const d = k > this.vi ? 1 : -1; this.vi = k; this.render(d); audio.play('page', { volume: 0.5 }); } } },
      villagerPortrait(x.id, 'small'), h('span', null, x.name.replace(/^Old /, '')))));
    return h('div', { class: 'w18-card' },
      h('div', { class: 'w18-intro' }, this.vi === 0 ? `Say hello to ${welcome18.names()}.` : `${this.vi + 1} of ${VILLAGERS.length}`),
      h('div', { class: 'w18-villager' },
        villagerPortrait(v.id, 'big'),
        h('div', { class: 'w18-vname' }, v.name),
        h('div', { class: 'w18-vrole' }, v.role),
        h('p', { class: 'w18-vabout' }, v.about),
        h('div', { class: 'w18-vrow' }, heartsPill(v.id)),
        loves.length ? h('div', { class: 'w18-vloves' }, h('span', { class: 'w18-vloves-word' }, 'Loves'), ...loves.map((x) => h('span', { class: 'w18-chip' }, itemIcon(x), ITEMS[x].name))) : null),
      strip);
  }

  private newsCard(c: NewsCard): HTMLElement {
    const t = TARGETS[c.target];
    return h('div', { class: `w18-card w18-news ${c.color}` },
      h('div', { class: 'w18-news-title' }, h('span', { class: 'w18-news-badge' }, icon(c.icon)), h('span', null, c.title)),
      c.art(),
      h('p', { class: 'w18-news-line' }, c.lines[0]),
      h('p', { class: 'w18-news-line' }, c.lines[1]),
      h('div', { class: 'w18-find' },
        h('span', { class: 'w18-find-look' }, 'Look for', h('span', { class: 'w18-fake-btn' }, icon(t.icon), t.label)),
        button([icon('magnifier'), 'Find it here'], () => this.showMe(t), 'yellow w18-find-btn')));
  }

  private giftCard(): HTMLElement {
    const id = W18.giftVillager;
    if (this.gift) {
      const word = this.gift.taste === 'love' ? `${vname(id)} loved it!` : this.gift.taste === 'like' ? `${vname(id)} liked it!` : `${vname(id)} says thank you!`;
      return h('div', { class: 'w18-card w18-gift done' },
        h('div', { class: 'w18-gift-hero' }, villagerPortrait(id, 'big'), h('span', { class: 'w18-gift-burst', 'aria-hidden': 'true' }, icon('sparkle_heart'))),
        h('div', { class: 'w18-vname' }, word),
        h('p', { class: 'w18-vabout' }, 'A gift a day keeps a friendship growing. Come back tomorrow and try someone new!'),
        h('div', { class: 'w18-rewards' },
          this.gift.points > 0 ? h('span', { class: 'w18-hearts' }, icon('heart'), h('span', null, `+${this.gift.points} friendship`)) : null,
          village.hearts(id) > 0 ? heartsPill(id) : null,
          this.gift.coins ? h('span', { class: 'w18-reward' }, icon('coin'), `+${this.gift.coins} coins`) : null));
    }
    const basket = welcome18.ensureBasket();
    const opts = welcome18.giftOptions(id);
    const canGive = village.canGift(id);
    const loves = VILLAGER[id].loves.filter((x) => ITEMS[x]).map((x) => ITEMS[x].name);
    const hasVillage = ui.has('village');
    const card = h('div', { class: 'w18-card w18-gift' },
      h('div', { class: 'w18-gift-hero' }, villagerPortrait(id, 'big'),
        h('div', { class: 'w18-speech' }, loves.length ? `Oh, hello! My favourite? ${loves[0]}, every time.` : 'Oh, hello! How lovely to see you.')),
      h('div', { class: 'w18-vname' }, `Give ${vname(id)} something she loves`),
      h('p', { class: 'w18-vabout' }, `Gifts fill a villager's hearts. One gift each a day.${welcome18.replay ? '' : ` Your first one earns ${W18.giftCoins} coins.`}`));
    if (basket || game.state.welcome18.basket) {
      card.append(h('div', { class: 'w18-note basket' }, itemIcon('strawberry'), h('span', null, 'Hazel left a basket of 3 strawberries in your barn, just for this.')));
    }
    if (!canGive) {
      card.append(h('div', { class: 'w18-note' }, icon('check'), h('span', null, `${vname(id)} already had a gift from you today. Lovely!`)),
        button([icon('check'), 'Carry on'], () => this.onGift(0, 'like'), 'green wide w18-gift-go'));
      return card;
    }
    if (opts.length) {
      card.append(h('div', { class: 'w18-have-title' }, 'From your barn'),
        h('div', { class: 'w18-have' }, ...opts.slice(0, 3).map((o) => {
          const row = h('div', { class: 'w18-have-row' }, itemIcon(o.item, 'icon big'),
            h('div', { class: 'grow' }, h('div', { class: 'title' }, ITEMS[o.item].name), h('div', { class: 'sub' }, `${o.taste === 'love' ? 'She loves this' : 'She likes this'} - you have ${fmt(o.n)}`)));
          // without the Village screen, the gift is given right here
          if (!hasVillage) row.append(button([icon('gift'), 'Give'], () => this.giveHere(o.item), 'small green'));
          return row;
        })));
    } else card.append(h('div', { class: 'w18-note' }, icon('info'), h('span', null, `Nothing ${vname(id)} likes in your barn yet. Any gift still makes her smile.`)));
    if (hasVillage) card.append(button([icon('house'), 'Open the Village'], () => this.toVillage(), 'green wide w18-gift-go'));
    return card;
  }

  private summaryCard(): HTMLElement {
    const s = game.state;
    const items = Object.values(s.inventory).reduce((a, n) => a + Math.max(0, n), 0);
    const kept: [string, string][] = [
      ['star', `Level ${s.player.level}`],
      ['coin', `${fmt(s.player.coins)} coins and ${fmt(s.player.gems)} gems`],
      ['package', `${fmt(items)} things in your barn`],
      ['house', `${fmt(s.buildings.length)} buildings, fields and decorations`],
    ];
    if (s.social.friends.length) kept.push(['hug', `${fmt(s.social.friends.length)} ${s.social.friends.length === 1 ? 'friend' : 'friends'}`]);
    const stored = s.storage[W18.sign] ?? 0;
    const placed = s.buildings.some((b) => b.type === W18.sign);
    const sign = h('div', { class: 'w18-gain sign' }, icon(`building:${W18.sign}`, 'w18-sign-thumb'),
      h('div', { class: 'grow' }, h('div', { class: 'title' }, BUILDING[W18.sign].name), h('div', { class: 'sub' }, placed ? 'On your farm. Thank you for being here!' : 'Waiting in your storage. Thank you for being here!')),
      stored > 0 ? button('Place it', () => this.placeSign(), 'small green w18-place') : null);
    return h('div', { class: 'w18-card w18-summary' },
      h('div', { class: 'w18-sum-title' }, 'Your farm in 1.8'),
      h('div', { class: 'w18-sum-sec' }, icon('check'), 'You kept everything'),
      h('div', { class: 'w18-kept' }, ...kept.map(([ic, t]) => h('div', { class: 'w18-kept-row' }, icon(ic), h('span', null, t), h('span', { class: 'w18-tick' }, 'Kept')))),
      h('div', { class: 'w18-sum-sec' }, icon('sparkle_heart'), 'New for you'),
      h('div', { class: 'w18-friends' }, ...VILLAGERS.map((v) => h('div', { class: 'w18-friend' }, villagerPortrait(v.id, 'small'), h('span', { class: 'w18-friend-name' }, v.name.replace(/^Old /, '')), heartsPill(v.id)))),
      h('div', { class: 'muted w18-sum-note' }, 'A head start from all the orders you filled before.'),
      sign,
      h('div', { class: 'w18-sum-sec' }, icon('light_bulb'), 'Try next'),
      h('div', { class: 'w18-next-list' },
        h('div', null, icon('gift'), 'Give each villager a gift today. Every friend counts!'),
        h('div', null, icon('mailbox'), 'Check your mailbox every day for letters and a visitor.'),
        h('div', null, icon('star'), 'Look out for silver and gold stars when you harvest.')));
  }

  // ---------------------------------------------------------------- find it here

  private showMe(t: Target): void {
    const p = this.p;
    if (!p) return;
    let where: (() => { x: number; y: number } | null) | null = null;
    if (t.sel) {
      const el = visibleEl(t.sel);
      if (el) where = () => { const r = el.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; };
    } else if (t.world === 'order_board') {
      const b = game.buildingsOf('order_board')[0];
      if (b) {
        const a = ui.scene.farm.anchor(b.uid);
        ui.scene.rig.focus(a.x, a.z, undefined, 0.6);
        where = () => { const s = ui.screen(ui.scene.farm.anchor(b.uid).setY(1.2)); return s.x > 0 && s.y > 0 && s.x < innerWidth && s.y < innerHeight ? s : null; };
      }
    }
    if (!where) {
      ui.feedback.toast(`Look for the ${t.label} button`, 'It shows up on your farm screen', t.icon);
      audio.play('select');
      return;
    }
    logEvent('welcome_find', { target: t.label });
    p.overlay.style.visibility = 'hidden';
    const text = t.world ? 'Ask buttons show up on orders here when something is missing.' : `Here it is! Tap ${t.label} any time.`;
    new Pointer(where, text, () => { if (this.p === p) p.overlay.style.visibility = ''; });
  }

  // ---------------------------------------------------------------- the first gift

  private watchGift(): void {
    if (this.offGift) return;
    this.offGift = game.bus.on('village:points', ({ id, delta, reason }) => {
      if (reason !== 'gift' || id !== W18.giftVillager || this.gift) return;
      this.onGift(delta, tasteFromPoints(delta, village.isBirthday(id)));
    });
  }

  private onGift(points: number, taste: string): void {
    if (this.gift || this.ended) return;
    const coins = welcome18.rewardGift(this.variant);
    this.gift = { taste, coins, points };
    this.offGift?.(); this.offGift = null;
    // the saved step already moved on (a reload resumes after the gift); this session shows the thank-you first
    if (this.coach) { this.coachSuccess(); return; }
    this.render();
    this.celebrate();
  }

  private celebrate(): void {
    audio.play('reward');
    haptics.play('success');
    const at = this.p?.body.querySelector<HTMLElement>('.w18-gift-hero');
    if (at && this.gift?.coins) {
      const r = at.getBoundingClientRect();
      ui.feedback.fly(r.left + r.width / 2, r.top + r.height / 2, 'coin', 'coins', 8);
    }
  }

  private giveHere(item: string): void {
    const q = game.qualityCounts(item).findIndex((n) => n > 0);
    if (q < 0 || !village.giveGift(W18.giftVillager, item, q as 0 | 1 | 2)) { audio.play('error'); return; }
    // 'village:points' fired; a gift that changed nothing (rare) still counts
    if (!this.gift) this.onGift(0, village.taste(W18.giftVillager, item));
  }

  private skipGift(): void {
    logEvent('welcome_skip_gift', { variant: this.variant });
    this.offGift?.(); this.offGift = null;
    if (this.i === this.steps.length - 1) this.done();
    else this.next();
  }

  /** Close the cards and open the Village screen on Rosa, with a helper box and a hand on the gift button. */
  private toVillage(): void {
    this.handOff = true;
    this.p?.close();
    setTimeout(() => {
      if (this.ended) return;
      ui.open('village', { villager: W18.giftVillager });
      this.showCoach();
    }, 220);
  }

  private showCoach(): void {
    this.hideCoach();
    const text = h('div', { class: 'tut-text' }, `Give ${vname(W18.giftVillager)} something she loves. Tap Gift, then pick one of her favourites.`);
    const row = h('div', { class: 'w18-box-row' });
    this.coach = h('div', { class: 'tut-box w18-box w18-coach' }, villagerPortrait('hazel', 'small'), text, row);
    this.coachRing = h('div', { class: 'tut-ring w18-ring' });
    this.coachHand = icon('hand', 'tut-hand w18-hand');
    ui.root.append(this.coach, this.coachRing, this.coachHand);
    this.coachTween = gsap.to(this.coachHand, { y: -14, duration: 0.45, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    gsap.fromTo(this.coach, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.3, ease: 'back.out(2)' });
    let open: boolean | null = null;
    const update = () => {
      if (!this.coach || this.gift) return;
      const isOpen = Panel.isOpen;
      if (isOpen !== open) {
        open = isOpen;
        row.replaceChildren(
          button('Later', () => { this.hideCoach(); this.later(); }, 'small grey'),
          isOpen ? null as unknown as HTMLElement : button([icon('house'), 'Open the Village'], () => ui.open('village', { villager: W18.giftVillager }), 'small green'));
        text.textContent = isOpen ? `Give ${vname(W18.giftVillager)} something she loves. Tap Gift, then pick one of her favourites.` : `The Village is where ${vname(W18.giftVillager)} lives. Open it to give her a gift.`;
      }
      const target = isOpen ? this.giftButton() : null;
      const show = !!target;
      this.coachRing!.style.display = this.coachHand!.style.display = show ? '' : 'none';
      if (target) {
        const r = target.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const down = y > innerHeight - 170;
        this.coachRing!.style.left = `${x}px`; this.coachRing!.style.top = `${y}px`;
        this.coachHand!.style.left = `${x - 12}px`; this.coachHand!.style.top = down ? `${y - 74}px` : `${y + 6}px`;
        this.coach.classList.toggle('top', y > innerHeight * 0.5);
      } else this.coach.classList.remove('top');
    };
    update();
    this.coachTimer = window.setInterval(update, 250);
  }

  /** The gift button on the Village screen: marked data-welcome="gift" by the villagers screen, else found by its words. */
  private giftButton(): HTMLElement | null {
    const top = Panel.stack[Panel.stack.length - 1];
    if (!top) return null;
    const marked = top.overlay.querySelector<HTMLElement>('[data-welcome="gift"], [data-gift="rosa"]');
    if (marked && marked.getBoundingClientRect().width) return marked;
    for (const b of top.overlay.querySelectorAll<HTMLElement>('button, .btn')) {
      if (/\b(gift|give)\b/i.test(b.textContent ?? '') && b.getBoundingClientRect().width && !(b as HTMLButtonElement).disabled) return b;
    }
    return null;
  }

  private coachSuccess(): void {
    const box = this.coach;
    if (!box) return;
    clearInterval(this.coachTimer);
    this.coachRing!.style.display = this.coachHand!.style.display = 'none';
    box.classList.remove('top');
    const coins = this.gift?.coins ?? 0;
    box.querySelector('.tut-text')!.textContent = coins ? `Lovely! ${vname(W18.giftVillager)} will remember that. Here are ${coins} coins from Hazel.` : `Lovely! ${vname(W18.giftVillager)} will remember that.`;
    box.querySelector('.w18-box-row')!.replaceChildren(button([h('span', null, 'Carry on'), icon('check')], () => {
      this.hideCoach();
      Panel.closeAll();
      setTimeout(() => { if (!this.ended) { this.openPanel(); this.celebrate(); } }, 260);
    }, 'small green'));
    audio.play('quest');
    gsap.fromTo(box, { scale: 0.92 }, { scale: 1, duration: 0.35, ease: 'back.out(3)' });
  }

  private hideCoach(): void {
    clearInterval(this.coachTimer);
    this.coachTween?.kill();
    this.coach?.remove(); this.coachRing?.remove(); this.coachHand?.remove();
    this.coach = this.coachRing = this.coachHand = null;
  }

  // ---------------------------------------------------------------- endings

  private placeSign(): void {
    this.done(() => { if ((game.state.storage[W18.sign] ?? 0) > 0) void ui.interaction.startPlacement(W18.sign, true); });
  }

  private allChanges(): void {
    this.done(() => openWhatsNew());
  }

  private later(): void {
    if (this.ended) return;
    this.ended = true;
    this.cleanup();
    welcome18.later(this.variant);
    if (!welcome18.replay) resumable = this.variant;
    this.opts.onClose?.();
  }

  /** Finished: saved as done, a small celebration, then whatever comes next. */
  private done(then?: () => void): void {
    if (this.ended) return;
    this.ended = true;
    welcome18.finish(this.variant);
    this.cleanup();
    const p = this.p;
    this.p = null;
    const after = () => {
      ui.feedback.toast(this.variant === 'short' ? 'Welcome to the village!' : 'Enjoy Village Friends!', 'Your villagers are waiting for you', 'sparkle_heart', 'gold');
      if (then) setTimeout(then, 200);
      else this.opts.onClose?.();
    };
    if (p) { p.onClose = after; p.close(); } else after();
  }

  private cleanup(): void {
    this.offGift?.(); this.offGift = null;
    this.hideCoach();
    welcome18.running = false;
    welcome18.replay = false;
    if (flow === this) flow = null;
  }
}

// ------------------------------------------------------------------------------------------- starting it

/** Open the welcome now (from boot, the level 3 check, the side button or Settings > Replay). */
export function openWelcome18(opts: FlowOpts = {}): boolean {
  if (flow || visiting.active) return false;
  const variant = opts.replay ? 'full' : welcome18.pending();
  if (!variant) return false;
  flow = new Flow(variant, opts);
  flow.start();
  return true;
}

/** Boot: open once the first toasts (quests done while away...) have faded, so they do not cover the letter. */
export function openWelcome18Soon(opts: FlowOpts, maxWait = 6000): void {
  const t0 = performance.now();
  const go = () => {
    if (document.querySelector('.toast-stack')?.childElementCount && performance.now() - t0 < maxWait) { setTimeout(go, 300); return; }
    if (!openWelcome18(opts)) opts.onClose?.();
  };
  go();
}

/** Nothing else on screen: no panel, no tutorial, no building or fishing mode, not visiting. */
function calm(): boolean {
  return !Panel.isOpen && !tutorial.running && !visiting.active && !document.hidden && ui.interaction?.mode.kind === 'idle'
    && !ui.root.classList.contains('mode-fishing') && !document.querySelector('.tut-box');
}

let waiting = 0;
/** Start the welcome once the screen is free (after a level-up card, a swipe, the tutorial's last words...). */
function startWhenCalm(): void {
  if (waiting || flow || !welcome18.pending()) return;
  let tries = 0;
  const check = () => {
    waiting = 0;
    if (flow || !welcome18.pending()) return;
    if (calm()) { openWelcome18(); return; }
    if (++tries < 400) waiting = window.setTimeout(check, 1500);
  };
  waiting = window.setTimeout(check, 2500);
}

/**
 * Boot: the head start (once), the event log, and a new farm marked for its level 3 intro. Returns true when the
 * welcome should open now (instead of What's new); Boot then calls openWelcome18 with its greeting as onClose.
 */
export function bootWelcome18(fresh: boolean): boolean {
  wireEventLog((id) => village.isBirthday(id));
  if (fresh) welcome18.markNewFarm();
  welcome18.applyHeadStart();
  // the short intro waits for level 3, and for the tutorial to be over
  game.bus.on('levelup', () => startWhenCalm());
  game.bus.on('tutorial', ({ signal }) => { if (!signal.startsWith('panel:')) setTimeout(startWhenCalm, 0); });
  return welcome18.pending() === 'full';
}

/** Boot found a short intro already due (a new farm that reached level 3 before this update). */
export function welcome18Due(): boolean { return !!welcome18.pending(); }
export { startWhenCalm as startWelcome18WhenCalm };

ui.register('welcome18', (arg) => {
  const replay = !!(arg as { replay?: boolean } | undefined)?.replay;
  if (!openWelcome18({ replay }) && !replay) ui.feedback.toast('All caught up', 'You have seen the 1.8 welcome', 'check');
});
// after "Later": a quiet way back in, for this session
sideEntries.push(() => (resumable && !flow && welcome18.pending() ? { id: 'welcome18', icon: 'sparkle_heart', label: '1.8 tour', color: 'pink' } : null));
