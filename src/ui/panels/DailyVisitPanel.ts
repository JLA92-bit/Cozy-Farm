import * as THREE from 'three';
import { Panel } from '../Panel';
import { h, icon, itemIcon, button, fmt } from '../dom';
import { ui } from '../UI';
import { ITEMS, VILLAGER, FRIENDSHIP } from '../../data';
import { game } from '../../systems/Game';
import { village } from '../../systems/Village';
import { daily18, VISIT_POINTS, LOST, LOST_POINTS } from '../../systems/Daily18';
import { weatherToday, WEATHER } from '../../systems/Weather';
import { hints } from '../../systems/Hints';
import { visiting } from '../../systems/Visiting';
import { audio, haptics } from '../../systems/Audio';
import { speech } from '../Speech';
import { Daily18View } from '../../world/Daily18View';
import { openMail, senderBadge } from './MailPanel';
import { confetti } from './ProgressionPanels';
import './mail.css';

/**
 * 1.8 daily rhythm on screen: the mailbox, the villager of the day and the finds on the farm (world/Daily18View.ts),
 * the visitor's request card, the weather chip and the first-time hints.
 */

/** Things counted as a heap rather than one by one ("some milk", not "3 milks"). */
const HEAPS = new Set(['wheat', 'corn', 'sugarcane', 'cotton', 'milk', 'goat_milk', 'wool', 'cream', 'butter', 'cheese', 'goat_cheese', 'sugar', 'syrup', 'caramel', 'ice_cream', 'yarn', 'cotton_fabric', 'marmalade', 'tomato_sauce', 'salsa', 'pickled_beets', 'bread', 'corn_bread', 'seafood_curry', 'oyster_chowder', 'seaweed', 'bait', 'grapes', 'cherry', 'cookie', 'pancakes', 'wool_socks', 'truffle']);

/** "Could you spare 3 eggs?" in plain words. */
export function askLine(item: string, qty: number): string {
  const def = ITEMS[item];
  const name = (def?.name ?? item).toLowerCase();
  if (!def || HEAPS.has(item) || def.cat === 'fish' || def.cat === 'feed' || item.endsWith('_jam')) return `Could you spare some ${name}? ${qty} would be perfect.`;
  const plural = /[^aeiou]y$/.test(name) ? `${name.slice(0, -1)}ies` : /(o|s|sh|ch|x)$/.test(name) ? `${name}es` : `${name}s`;
  return `Could you spare ${qty} ${plural}?`;
}

/** "2 hearts" with a heart icon: never colour alone. */
export function heartsLabel(id: string): HTMLElement {
  const n = village.hearts(id);
  return h('span', { class: 'visit-hearts' }, icon('heart'), `${n} ${n === 1 ? 'heart' : 'hearts'} of ${FRIENDSHIP.maxHearts}`);
}

let view: Daily18View | null = null;
let card: Panel | null = null;

/** The visitor's little request card: give, ask friends, or not now. */
export function openVisit(): void {
  const q = daily18.request();
  const id = daily18.today.visitor;
  const v = VILLAGER[id];
  if (!q || !v) return;
  card?.close();
  const p = new Panel({ title: `${v.name} is visiting`, icon: 'house', color: 'green', size: 'small', wallet: true });
  card = p;
  p.onClose = () => { if (card === p) card = null; };
  const have = game.count(q.item);
  const enough = have >= q.qty;
  p.body.append(
    h('div', { class: 'visit-head' }, senderBadge(id, 72), h('div', { class: 'grow' }, h('div', { class: 'visit-name' }, v.name), h('div', { class: 'muted', style: 'font-size:15px' }, v.role), heartsLabel(id))),
    h('div', { class: 'visit-say' }, askLine(q.item, q.qty)),
    h('div', { class: 'visit-need' }, itemIcon(q.item, 'icon big'),
      h('div', { class: 'grow' },
        h('div', { class: 'title' }, `${q.qty} x ${ITEMS[q.item].name}`),
        h('div', { class: `have ${enough ? 'ok' : 'short'}` }, icon(enough ? 'check' : 'package'), enough ? `You have ${fmt(have)}` : `You have ${fmt(have)}, ${q.qty - have} more needed`))),
    h('div', { class: 'visit-reward' }, h('span', { class: 'muted', style: 'font-size:15px' }, 'Thank-you:'),
      h('span', { class: 'pill' }, icon('coin'), fmt(q.coins)),
      h('span', { class: 'pill' }, icon('xp'), `${fmt(q.xp)} XP`),
      h('span', { class: 'pill' }, icon('heart'), `+${VISIT_POINTS} friendship`)),
  );
  const row = h('div', { class: 'visit-footer' });
  if (enough) row.append(button([icon('gift'), 'Give'], () => give(p), 'green'));
  else row.append(button([icon('hug'), 'Ask friends'], () => { p.close(); ui.open('help', { item: q.item, qty: q.qty - have, reason: 'visit' }); }, 'blue'));
  row.append(button('Not now', () => {
    p.close();
    const root = view?.visitorRoot;
    if (root) speech.say(root, { icon: 'smile', text: "No rush, I'll wait!", prio: 2 });
  }, 'grey'));
  p.footer.append(row);
  p.open();
}

function give(p: Panel): void {
  const r = daily18.give();
  if (!r) { audio.play('error'); return; }
  const btn = p.footer.querySelector('.btn');
  const rect = btn?.getBoundingClientRect();
  if (rect) ui.feedback.fly(rect.left + rect.width / 2, rect.top, 'coin', 'coins', Math.min(8, 2 + Math.floor(r.coins / 60)));
  audio.play('quest');
  haptics.buzz([15, 30, 15]);
  p.close();
  const root = view?.visitorRoot;
  const name = VILLAGER[r.id]?.name ?? 'Your friend';
  if (root) {
    speech.say(root, { icon: 'heart', text: 'Thank you so much!', prio: 3, dur: 2.6 });
    ui.effects.hearts(root.position.clone().setY(1.6));
  }
  view?.sendHome(true);
  ui.feedback.toast(`+${VISIT_POINTS} friendship with ${name}`, r.heartUp ? `Now ${r.hearts} ${r.hearts === 1 ? 'heart' : 'hearts'}!` : `+${fmt(r.coins)} coins, +${fmt(r.xp)} XP`, 'heart');
  if (r.heartUp) confetti(30, ['#ff8fb4', '#ffc4dc', '#fff3c4']);
}

/** A find was tapped: pick it up with a sparkle. */
function collectFind(id: string, at: THREE.Vector3): void {
  const got = daily18.collect(id);
  if (!got) return;
  view?.takeFind(id);
  ui.effects.sparkle(at.clone().setY(0.4), got.lost ? '#ffe680' : '#fff6a0', 12);
  audio.play('sparkle', { volume: 0.7 });
  haptics.play('success');
  if (got.lost) {
    const v = VILLAGER[got.lost];
    ui.effects.hearts(at.clone().setY(0.8));
    ui.feedback.toast(`+${LOST_POINTS} friendship with ${v.name}`, `You found ${LOST[got.lost].thanks}! It is on its way back.`, 'heart');
    const el = ui.feedback.toastStack.lastElementChild as HTMLElement | null;
    el?.querySelector('img')?.replaceWith(senderBadge(got.lost, 40));
  } else if (got.item) {
    // the usual "+2" that flies to the barn
    const s = ui.screen(at);
    ui.feedback.floatText(s.x - 24, s.y - 40, `+${got.qty}`, got.icon, '#fff');
    ui.feedback.fly(s.x, s.y, got.icon, 'barn', got.qty ?? 1);
    if (hints.firstTime('intro:finds-gift')) setTimeout(() => ui.feedback.toast('Finds make lovely gifts', 'Pip adores seashells and Juniper loves petals.', got.icon), 900);
  }
}

// ------------------------------------------------------------------ weather chip
let weatherEl: HTMLElement | null = null;
let shownWeather = '';
function syncWeather(): void {
  const w = weatherToday();
  ui.scene.env.weather = w;
  if (!weatherEl) {
    const row = ui.hud.charmEl.parentElement;
    if (!row) return;
    weatherEl = h('span', { class: 'weather-pill', role: 'button', onclick: (e: MouseEvent) => { e.stopPropagation(); weatherToast(); } });
    row.append(weatherEl);
  }
  if (w !== shownWeather) {
    shownWeather = w;
    weatherEl.className = `weather-pill ${w}`;
    weatherEl.replaceChildren(icon(WEATHER[w].icon));
    weatherEl.setAttribute('aria-label', `Weather today: ${WEATHER[w].name}`);
    weatherEl.title = `Today: ${WEATHER[w].name}`;
  }
}
function weatherToast(): void {
  const w = weatherToday();
  ui.feedback.toast(`Today: ${WEATHER[w].name}`, WEATHER[w].text, WEATHER[w].icon);
}

// ------------------------------------------------------------------ one-time intros
let introAt = 0;
function intros(now: number): void {
  if (!game.state.tutorial.done || Panel.isOpen || now < introAt || ui.interaction.mode.kind !== 'idle' || visiting.active || ui.root.classList.contains('mode-fishing')) return;
  introAt = now + 4000;
  if (weatherToday() === 'rain' && hints.firstTime('intro:rain')) { ui.feedback.toast("It's raining!", WEATHER.rain.text, 'rain'); return; }
  if (daily18.visitorWaiting && hints.firstTime('intro:visitor')) {
    const v = VILLAGER[daily18.today.visitor];
    ui.feedback.toast(`${v.name} is visiting!`, `Tap ${v.name} by your farmhouse. A villager drops by every day.`, 'house');
    const el = ui.feedback.toastStack.lastElementChild as HTMLElement | null;
    el?.querySelector('img')?.replaceWith(senderBadge(v.id, 40));
    if (el) { el.classList.add('tappable'); el.addEventListener('click', () => openVisit(), { once: true }); }
    return;
  }
  if (daily18.waitingFinds().length && hints.firstTime('intro:finds')) ui.feedback.toast('Little finds!', 'Shiny things turn up on your farm every day. Tap them to pick them up.', 'sparkles');
}

// ------------------------------------------------------------------ wiring, once the farm is on screen
function init(): void {
  if (view || !ui.scene) return;
  view = new Daily18View(ui.scene);
  view.onMailbox = () => { audio.play('pop', { volume: 0.6 }); openMail(); };
  view.onVisitor = () => openVisit();
  view.onFind = (id, at) => collectFind(id, at);
  view.onVisitorMoved = (pos) => {
    ui.world.setBubble('d18-visitor', pos, () => {
      const q = daily18.request();
      return h('div', { class: 'visit-bubble', role: 'button', 'aria-label': 'Visitor request', onclick: (e: MouseEvent) => { e.stopPropagation(); openVisit(); } },
        h('span', { class: 'bang' }, '!'), q ? itemIcon(q.item) : null);
    }, `${daily18.today.day}:${daily18.request()?.item ?? ''}`);
  };
  const prev = ui.extraPick;
  ui.extraPick = (ray) => view?.pick(ray) ?? prev?.(ray) ?? null;
  ui.onTick((now) => { syncWeather(); intros(now); });
  syncWeather();
}
ui.onTick(() => init());
