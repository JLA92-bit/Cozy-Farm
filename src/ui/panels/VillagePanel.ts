import gsap from 'gsap';
import { Panel } from '../Panel';
import { h, icon, itemIcon, button, clear, fmt } from '../dom';
import { ui } from '../UI';
import { BUILDING, FRIENDSHIP, ITEMS, VILLAGER, VILLAGERS, type VillagerDef } from '../../data';
import { game } from '../../systems/Game';
import { village, type GiftResult, type Taste } from '../../systems/Village';
import { villageRewards, milestoneIcon, milestoneText, STORY_HEARTS } from '../../systems/VillageRewards';
import { localDay } from '../../systems/Progression';
import { audio, haptics } from '../../systems/Audio';
import { visiting } from '../../systems/Visiting';
import { saves } from '../../systems/Save';
import './village.css';

/**
 * 1.8 Village Friends screens: the Village (six villager cards), a villager's page, the gift picker with the
 * villager's reaction, and the story moments shown at 4 and 8 hearts. Open with ui.open('village', { villager? }).
 */

const PER_HEART = FRIENDSHIP.pointsPerHeart;
const MAX_HEARTS = FRIENDSHIP.maxHearts;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TASTE_WORD: Record<Taste, string> = { love: 'Loves it!', like: 'Likes it', neutral: 'Thanks!', dislike: 'Not a fan' };
const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const birthdayText = (v: VillagerDef): string => `${v.birthday[1]} ${MONTHS[v.birthday[0] - 1]}`;
const QUALITY_WORD = ['', 'Silver', 'Gold'];

// ======================================================================== small pieces
/** Ten small hearts (filled ones in red, the rest pale) and always the number in words too. */
export function heartsRow(hearts: number, big = false): HTMLElement {
  const row = h('div', { class: `v-hearts${big ? ' big' : ''}`, role: 'img', 'aria-label': `${hearts} of ${MAX_HEARTS} hearts` });
  for (let i = 0; i < MAX_HEARTS; i++) row.append(icon('heart', `v-heart${i < hearts ? ' on' : ''}`));
  return row;
}
const heartsText = (hearts: number): string => `${hearts} / ${MAX_HEARTS} hearts`;

/** Progress bar towards the next heart ("40 / 100 to the next heart"). */
function heartBar(id: string): HTMLElement {
  const pts = village.points(id);
  const hearts = village.hearts(id);
  const max = hearts >= MAX_HEARTS;
  const into = max ? PER_HEART : pts - hearts * PER_HEART;
  return h('div', { class: 'progress v-bar' },
    h('div', { class: 'fill', style: `width:${Math.round((into / PER_HEART) * 100)}%` }),
    h('div', { class: 'label' }, max ? 'Best friends!' : `${into} / ${PER_HEART} to next heart`));
}

/** Round portrait in the villager's colour; birthday cake and best-friend crown as badges with words. */
export function portrait(v: VillagerDef, size: 'small' | 'big' = 'small'): HTMLElement {
  const best = village.hearts(v.id) >= MAX_HEARTS;
  const el = h('div', { class: `v-portrait ${size}${best ? ' best' : ''}`, style: `--vc:${v.colour}` }, icon(`villager:${v.id}`, 'v-portrait-img'));
  if (village.isBirthday(v.id)) el.append(h('span', { class: 'v-badge cake', title: 'Birthday today' }, icon('birthday_cake')));
  if (best) el.append(h('span', { class: 'v-badge crown', title: 'Best friends' }, icon('crown')));
  return el;
}

function giftState(v: VillagerDef): HTMLElement {
  if (!village.canGift(v.id)) return h('div', { class: 'v-gifted' }, icon('check'), 'Gift given today');
  return button([icon('gift'), village.isBirthday(v.id) ? 'Birthday gift' : 'Give a gift'], () => openVillager(v.id, { gift: true }), 'small v-gift-btn', { dataset: { welcome: 'gift' } });
}

let villageOpen = 0;

// ======================================================================== the Village
export function openVillage(arg?: { villager?: string }): void {
  if (arg?.villager && VILLAGER[arg.villager]) { openVillager(arg.villager, { standalone: true }); return; }
  const p = new Panel({ title: 'Village', icon: 'hug', color: 'pink' });
  villageOpen++;
  game.state.village.openedDay = localDay(game.now());
  refreshVillageBadge();
  const render = () => {
    clear(p.body);
    const total = village.totalHearts();
    p.body.append(h('div', { class: 'v-intro' },
      icon('hug', 'icon'),
      h('div', null,
        h('div', { class: 'v-intro-title' }, `Your friends in the valley · ${total} ${total === 1 ? 'heart' : 'hearts'}`),
        h('div', { class: 'v-intro-text' }, 'Give each villager one gift a day, chat with them on your farm and fill their orders. Hearts bring letters, stories, keepsakes and special gifts.'))));
    const grid = h('div', { class: 'v-grid' });
    for (const v of VILLAGERS) {
      const hearts = village.hearts(v.id);
      const card = h('div', { class: `card clickable v-card${hearts >= MAX_HEARTS ? ' best' : ''}${village.isBirthday(v.id) ? ' birthday' : ''}`, role: 'button', 'aria-label': `${v.name}, ${heartsText(hearts)}`, style: `--vc:${v.colour}` },
        portrait(v),
        h('div', { class: 'v-name' }, v.name),
        h('div', { class: 'v-role' }, v.role),
        village.isBirthday(v.id) ? h('div', { class: 'v-bday-tag' }, icon('birthday_cake'), 'Birthday today!') : null,
        heartsRow(hearts),
        h('div', { class: 'v-hearts-text' }, heartsText(hearts)),
        heartBar(v.id),
        giftState(v));
      card.addEventListener('click', () => openVillager(v.id));
      grid.append(card);
    }
    p.body.append(grid);
  };
  render();
  const off = game.bus.on('village:points', () => { if (p.overlay.isConnected) render(); });
  // a villager page closing on top brings fresh numbers
  const offPage = onPageClosed(() => { if (p.overlay.isConnected) render(); });
  p.onClose = () => { off(); offPage(); villageOpen--; refreshVillageBadge(); };
  p.open();
}

const pageClosed = new Set<() => void>();
function onPageClosed(fn: () => void): () => void { pageClosed.add(fn); return () => pageClosed.delete(fn); }

// ======================================================================== a villager's page
interface Reaction { r: GiftResult; line: string; before: number }

export function openVillager(id: string, opts: { gift?: boolean; standalone?: boolean } = {}): void {
  const v = VILLAGER[id];
  if (!v) return;
  const p = new Panel({ title: v.name, color: 'pink', size: 'medium' });
  p.panel.classList.add('v-page');
  p.panel.style.setProperty('--vc', v.colour);
  let reaction: Reaction | null = null;

  const render = () => {
    clear(p.body);
    clear(p.footer);
    const f = village.friend(id);
    const hearts = village.hearts(id);
    // header: portrait, name, role, hearts
    const pic = portrait(v, 'big');
    p.body.append(h('div', { class: 'v-head' }, pic,
      h('div', { class: 'v-head-info' },
        h('div', { class: 'v-name big' }, v.name),
        h('div', { class: 'v-role' }, v.role),
        heartsRow(hearts, true),
        h('div', { class: 'v-hearts-text' }, heartsText(hearts)),
        heartBar(id))));
    // speech: their reaction to a gift, else who they are
    if (reaction) {
      const r = reaction.r;
      p.body.append(h('div', { class: `v-speech react ${r.taste}` },
        h('div', { class: 'v-speech-line' }, `"${reaction.line}"`),
        h('div', { class: 'v-react-row' },
          h('span', { class: `v-taste ${r.taste}` }, itemIcon(r.item), r.birthday ? 'Birthday gift!' : TASTE_WORD[r.taste]),
          h('span', { class: `v-points ${r.points < 0 ? 'neg' : ''}` }, icon('heart'), `${r.points > 0 ? '+' : ''}${r.points} friendship`))));
    } else {
      p.body.append(h('div', { class: 'v-speech' }, h('div', null, v.about), h('div', { class: 'v-home' }, v.home)));
    }
    if (village.isBirthday(id)) p.body.append(h('div', { class: 'v-bday-banner' }, icon('birthday_cake'), h('span', null, `It's ${v.name}'s birthday today! Gifts count three times.`)));
    // next reward
    const next = villageRewards.next(id);
    p.body.append(h('div', { class: 'v-next' }, icon(next ? milestoneIcon(next) : 'crown', 'icon'),
      h('div', null, next ? h('b', null, `At ${next} hearts: `) : h('b', null, 'Best friends! '), next ? milestoneText(v, next) : `${v.name} sends you a gift every week.`)));
    // tastes
    p.body.append(h('div', { class: 'section-title' }, 'What they like'));
    const box = h('div', { class: 'v-tastes' });
    let unknown = 0;
    const tasteRow = (label: string, list: string[], cls: string) => {
      const items = h('div', { class: 'v-taste-items' });
      for (const it of list) {
        const isFish = it === 'fish';
        const known = isFish ? f.known.some((k) => ITEMS[k]?.cat === 'fish') : f.known.includes(it);
        if (!known) { unknown++; items.append(h('span', { class: 'v-taste-chip unknown', title: 'Not found out yet' }, h('span', { class: 'v-q' }, '?'))); continue; }
        items.append(h('span', { class: 'v-taste-chip', title: isFish ? 'Any fish' : ITEMS[it].name }, isFish ? icon('fish') : itemIcon(it), h('span', null, isFish ? 'Any fish' : ITEMS[it].name)));
      }
      box.append(h('div', { class: `v-taste-row ${cls}` }, h('div', { class: 'v-taste-label' }, label), items));
    };
    tasteRow('Loves', v.loves, 'love');
    tasteRow('Likes', v.likes, 'like');
    tasteRow('Dislikes', v.dislikes, 'dislike');
    p.body.append(box);
    if (unknown) p.body.append(h('div', { class: 'muted v-hint' }, 'Give gifts to find out what the question marks are.'));
    // facts
    const ks = villageRewards.keepsakes(id);
    p.body.append(h('div', { class: 'v-facts' },
      h('span', { class: 'pill' }, icon('birthday_cake'), `Birthday: ${birthdayText(v)}`),
      h('span', { class: 'pill' }, icon('gift'), `Gifts given: ${fmt(f.gifts)}`),
      h('span', { class: 'pill' }, icon('sparkle_heart'), `Keepsakes: ${ks} / 2`)));
    // milestones
    p.body.append(h('div', { class: 'section-title' }, 'Friendship rewards'));
    const ms = h('div', { class: 'v-milestones' });
    for (const m of FRIENDSHIP.milestones) {
      const got = f.rewards.includes(m);
      ms.append(h('div', { class: `v-ms${got ? ' got' : ''}` },
        h('span', { class: 'v-ms-hearts' }, icon('heart'), String(m)),
        h('span', { class: 'v-ms-text' }, milestoneText(v, m)),
        got ? h('span', { class: 'v-ms-done' }, icon('check'), 'Done') : h('span', { class: 'v-ms-left' }, `${m - hearts} to go`)));
    }
    p.body.append(ms);
    // stories already shared can be read again
    const seen = (f.stories ?? []).filter((m) => v.stories[String(m)]);
    const waiting = STORY_HEARTS.filter((m) => f.rewards.includes(m) && !(f.stories ?? []).includes(m));
    if (seen.length || waiting.length) {
      p.body.append(h('div', { class: 'section-title' }, 'Stories'));
      const row = h('div', { class: 'v-stories' });
      for (const m of [...seen, ...waiting].sort()) {
        const fresh = waiting.includes(m as 4 | 8);
        row.append(button([icon(fresh ? 'sparkles' : 'book'), v.stories[String(m)].title, fresh ? h('span', { class: 'v-new' }, 'New') : null], () => openStory(id, m, !fresh), `small ${fresh ? 'yellow' : 'blue'}`));
      }
      p.body.append(row);
    }
    // footer: the gift button
    if (village.canGift(id)) p.footer.append(button([icon('gift'), village.isBirthday(id) ? 'Give a birthday gift' : 'Give a gift'], () => openGiftPicker(id, onGiven), 'v-gift-main', { dataset: { welcome: 'gift' } }));
    else p.footer.append(h('div', { class: 'v-gifted big' }, icon('check'), `Gift given today. Come back tomorrow for another!`));
    if (opts.standalone && !villageOpen) p.footer.append(button([icon('hug'), 'Everyone'], () => { p.close(); openVillage(); }, 'small blue'));
    return pic;
  };

  const onGiven = (r: GiftResult) => {
    const before = village.points(id) - r.points;
    const lines = r.birthday ? v.react.birthday : v.react[r.taste];
    reaction = { r, line: pick(lines), before };
    const pic = render();
    p.body.scrollTop = 0;
    celebrate(p, pic, r, before);
  };

  const off = game.bus.on('village:points', ({ id: who }) => { if (who === id && p.overlay.isConnected && !reaction) render(); });
  render();
  p.onClose = () => { off(); for (const fn of pageClosed) fn(); };
  p.open();
  if (opts.gift && village.canGift(id)) setTimeout(() => { if (p.overlay.isConnected) openGiftPicker(id, onGiven); }, 250);
}

/** The reaction: a bounce, the bar filling, "+40 friendship", and a big "+1 heart!" when a heart is reached. */
function celebrate(p: Panel, pic: HTMLElement, r: GiftResult, before: number): void {
  const fill = p.body.querySelector<HTMLElement>('.v-head .v-bar .fill');
  const beforeInto = (before % PER_HEART) / PER_HEART;
  if (fill && !r.heartUp && r.points > 0) {
    const to = fill.style.width;
    fill.style.transition = 'none';
    fill.style.width = `${Math.round(beforeInto * 100)}%`;
    void fill.offsetWidth;
    fill.style.transition = 'width .9s cubic-bezier(.3,1.4,.5,1) .25s';
    fill.style.width = to;
  }
  gsap.fromTo(pic, { scale: 0.85, rotate: r.taste === 'dislike' ? 6 : -6 }, { scale: 1, rotate: 0, duration: 0.7, ease: 'elastic.out(1.2, 0.4)' });
  const sp = p.body.querySelector<HTMLElement>('.v-speech');
  if (sp) gsap.fromTo(sp, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(2.2)', delay: 0.1 });
  const b = pic.getBoundingClientRect();
  const x = b.left + b.width / 2, y = b.top + b.height / 3;
  ui.feedback.floatText(x, y, `${r.points > 0 ? '+' : ''}${r.points}`, 'heart', r.points > 0 ? '#ffd1dc' : '#ffb3a8', 0.2);
  if (r.points > 0) floatHearts(x, y, r.taste === 'love' || r.birthday ? 9 : r.taste === 'like' ? 5 : 2);
  if (r.taste === 'dislike') { audio.play('pop', { volume: 0.5, rate: 0.6 }); haptics.play('light'); }
  else if (r.taste === 'love' || r.birthday) { audio.play('reward'); haptics.play('success'); }
  else { audio.play('collect'); haptics.play('tap'); }
  if (r.heartUp) setTimeout(() => heartBurst(p, r.hearts), 650);
}

/** Little hearts that rise from a point on screen. */
function floatHearts(x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const el = icon('heart', 'v-float-heart');
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    ui.feedback.floatLayer.append(el);
    gsap.fromTo(el, { x: 0, y: 0, scale: 0.3, opacity: 1 }, {
      x: (Math.random() - 0.5) * 140, y: -60 - Math.random() * 90, scale: 0.6 + Math.random() * 0.6, opacity: 0, rotate: (Math.random() - 0.5) * 60,
      duration: 1 + Math.random() * 0.5, delay: i * 0.05, ease: 'power1.out', onComplete: () => el.remove(),
    });
  }
}

/** "+1 heart!" over the page. */
function heartBurst(p: Panel, hearts: number): void {
  if (!p.overlay.isConnected) return;
  const el = h('div', { class: 'v-burst', role: 'status' }, icon('heart', 'v-burst-heart'), h('div', { class: 'v-burst-text outlined' }, '+1 heart!'), h('div', { class: 'v-burst-sub outlined' }, heartsText(hearts)));
  p.panel.append(el);
  audio.play('levelup', { volume: 0.7 });
  haptics.play('celebrate');
  const r = el.getBoundingClientRect();
  floatHearts(r.left + r.width / 2, r.top + r.height / 2, 14);
  gsap.timeline({ onComplete: () => el.remove() })
    .fromTo(el, { scale: 0.2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(2.5)' })
    .to(el, { scale: 1.05, duration: 1.1 })
    .to(el, { opacity: 0, scale: 0.8, duration: 0.3 });
  el.addEventListener('click', () => el.remove());
}

// ======================================================================== gift picker
interface Stack { item: string; q: 0 | 1 | 2; n: number; taste: Taste | null; known: boolean }

function openGiftPicker(id: string, onGiven: (r: GiftResult) => void): void {
  const v = VILLAGER[id];
  if (!v || !village.canGift(id)) return;
  const p = new Panel({ title: `A gift for ${v.name}`, icon: 'gift', color: 'pink', size: 'medium' });
  p.panel.classList.add('v-picker');
  const f = village.friend(id);
  let sel: Stack | null = null;
  let given = false;

  const stacks = (): Stack[] => {
    const out: Stack[] = [];
    for (const [item, n] of Object.entries(game.state.inventory)) {
      if (!ITEMS[item] || n <= 0) continue;
      const known = f.known.includes(item) || (ITEMS[item].cat === 'fish' && v.likes.includes('fish') && f.known.some((k) => ITEMS[k]?.cat === 'fish'));
      const taste = known ? village.taste(id, item) : null;
      const counts = game.qualityCounts(item);
      for (const q of [2, 1, 0] as const) if (counts[q] > 0) out.push({ item, q, n: counts[q], taste, known });
    }
    const rank = (s: Stack) => (s.taste === 'love' ? 0 : s.taste === 'like' ? 1 : s.taste === 'dislike' ? 3 : 2);
    return out.sort((a, b) => rank(a) - rank(b) || ITEMS[a.item].name.localeCompare(ITEMS[b.item].name) || b.q - a.q);
  };

  const confirm = h('div', { class: 'v-confirm' });
  const render = () => {
    clear(p.body);
    clear(confirm);
    const list = stacks();
    p.body.append(h('div', { class: 'v-intro small' }, icon('info', 'icon'), h('div', { class: 'v-intro-text' },
      village.isBirthday(id) ? `It's ${v.name}'s birthday: every gift counts three times today!` : 'Loved gifts give 40 friendship, liked 20, others 8. Silver and gold stars give more.')));
    if (!list.length) {
      p.body.append(h('div', { class: 'empty-state' }, icon('package'), h('div', null, 'Your barn is empty. Harvest or make something, then come back!')));
      return;
    }
    const grid = h('div', { class: 'v-gift-grid' });
    for (const s of list) {
      const on = !!sel && sel.item === s.item && sel.q === s.q;
      const tile = h('button', { type: 'button', class: `v-tile${on ? ' selected' : ''}${s.taste === 'dislike' ? ' disliked' : ''}`, 'aria-label': `${QUALITY_WORD[s.q]} ${ITEMS[s.item].name}, ${s.n}` },
        itemIcon(s.item, 'v-tile-icon'),
        h('span', { class: 'v-tile-name' }, ITEMS[s.item].name),
        h('span', { class: 'v-tile-count outlined' }, `x${fmt(s.n)}`),
        s.q ? h('span', { class: `v-star q${s.q}` }, icon('star'), QUALITY_WORD[s.q]) : null,
        s.taste === 'love' ? h('span', { class: 'v-tile-taste love' }, icon('heart'), 'Loves') : s.taste === 'like' ? h('span', { class: 'v-tile-taste like' }, 'Likes')
          : s.taste === 'dislike' ? h('span', { class: 'v-tile-taste dislike' }, 'Dislikes') : null);
      tile.addEventListener('click', () => { sel = on ? null : s; audio.play('select', { volume: 0.5 }); render(); });
      grid.append(tile);
    }
    p.body.append(grid);
    if (sel) {
      const s = sel;
      const name = `${s.q ? `${QUALITY_WORD[s.q]} ` : ''}${ITEMS[s.item].name}`;
      confirm.append(h('div', { class: 'v-confirm-text' }, itemIcon(s.item), h('span', null, `Give 1 ${name} to ${v.name}?`)),
        button([icon('gift'), 'Give'], () => give(s), 'v-give'));
    } else confirm.append(h('div', { class: 'v-confirm-text muted' }, 'Tap something to give it.'));
  };

  const give = (s: Stack) => {
    if (given) return; // double taps give one gift only
    const r = village.giveGift(id, s.item, s.q);
    if (!r) { ui.feedback.toast('That gift could not be given', village.canGift(id) ? 'It is no longer in your barn' : `${v.name} already had a gift today`, 'cross'); audio.play('error'); sel = null; render(); return; }
    given = true;
    saves.save();
    p.close();
    onGiven(r);
  };

  p.footer.append(confirm);
  render();
  p.open();
}

// ======================================================================== story moments
function openStory(id: string, hearts: number, replay: boolean): void {
  const v = VILLAGER[id];
  const story = v?.stories[String(hearts)];
  if (!v || !story) return;
  const p = new Panel({ title: story.title, color: 'pink', size: 'medium', icon: 'sparkle_heart' });
  p.panel.classList.add('v-story');
  p.panel.style.setProperty('--vc', v.colour);
  let i = 0;
  let done = false;
  const finish = (): string | null => {
    if (done || replay) return null;
    done = true;
    return villageRewards.finishStory(id, hearts);
  };
  const render = () => {
    clear(p.body);
    clear(p.footer);
    const c = story.cards[i];
    const pic = h('div', { class: 'v-story-pic', style: `--vc:${v.colour}` }, icon(`villager:${v.id}`, 'v-story-portrait'), h('div', { class: 'v-story-icon' }, icon(c.icon)));
    const dots = h('div', { class: 'v-dots', 'aria-label': `Picture ${i + 1} of ${story.cards.length}` }, ...story.cards.map((_, k) => h('span', { class: k === i ? 'on' : '' })));
    p.body.append(h('div', { class: 'v-story-hearts' }, icon('heart'), `${hearts} hearts with ${v.name}`), pic, h('div', { class: 'v-story-text' }, c.text), dots);
    gsap.fromTo(pic, { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(2)' });
    const last = i === story.cards.length - 1;
    if (i > 0) p.footer.append(button('Back', () => { i--; audio.play('page', { volume: 0.5 }); render(); }, 'grey'));
    p.footer.append(button(last ? (replay ? 'Close' : 'Thank you!') : 'Next', () => {
      if (!last) { i++; audio.play('page', { volume: 0.6 }); render(); return; }
      if (replay) { p.close(); return; }
      showKeepsake(p, v, finish());
    }, last ? 'yellow' : ''));
  };
  // closing half way still gives the keepsake: it waits in the barn
  p.onClose = () => {
    const deco = finish();
    if (deco) ui.feedback.toast(`${v.name} left you a keepsake`, `${BUILDING[deco].name} is in your Barn, under Stored`, 'sparkle_heart', 'gold');
    for (const fn of pageClosed) fn();
  };
  render();
  p.open();
  audio.play('jingle', { volume: 0.6 });
}

function showKeepsake(p: Panel, v: VillagerDef, deco: string | null): void {
  if (!deco) { p.close(); return; }
  clear(p.body);
  clear(p.footer);
  const thumb = icon(`building:${deco}`, 'v-keepsake-img');
  p.body.append(h('div', { class: 'v-keepsake' },
    h('div', { class: 'v-keepsake-title outlined' }, 'A keepsake!'),
    thumb,
    h('div', { class: 'v-keepsake-name' }, BUILDING[deco].name),
    h('div', { class: 'muted' }, `${v.name} gave you this to remember the moment. It adds +${BUILDING[deco].charm} charm. You will find it in your Barn, under Stored.`)));
  gsap.fromTo(thumb, { scale: 0.2, rotate: -20 }, { scale: 1, rotate: 0, duration: 0.8, ease: 'elastic.out(1.1, 0.45)' });
  audio.play('reward');
  haptics.play('celebrate');
  const r = thumb.getBoundingClientRect();
  floatHearts(r.left + r.width / 2, r.top + r.height / 2, 10);
  p.footer.append(
    button('Later', () => p.close(), 'grey'),
    button([icon('hammer'), 'Place it now'], () => { Panel.closeAll(); setTimeout(() => void ui.interaction.startPlacement(deco, true), 300); }, 'yellow'));
}

// ======================================================================== farm hooks
/** The HUD dot: a met villager's birthday, gifts still to give today (until the Village is opened), or never opened. */
export function refreshVillageBadge(): void {
  if (!ui.hud) return;
  const s = game.state;
  const today = localDay(game.now());
  const met = VILLAGERS.filter((v) => villageRewards.met(v.id));
  const birthday = met.some((v) => village.isBirthday(v.id) && village.canGift(v.id));
  const unopened = s.village.openedDay !== today && met.some((v) => village.canGift(v.id));
  const never = !s.village.openedDay && s.tutorial.done && s.player.created;
  ui.hud.setBadge('village', birthday || unopened || never);
}

let lastInput = performance.now();
let idleFor = 0;
/** Story moments wait until the player has been idle on their farm for a few seconds. */
function storyTick(dt: number): void {
  const s = game.state;
  const busy = Panel.isOpen || visiting.active || document.hidden || !s.tutorial.done || !s.player.created || !s.welcome18.done
    || ui.interaction?.mode.kind !== 'idle' || performance.now() - lastInput < 4000;
  idleFor = busy ? 0 : idleFor + dt;
  if (idleFor < 2) return;
  idleFor = 0;
  const st = villageRewards.pendingStory();
  if (st) openStory(st.id, st.hearts, false);
}

const MILESTONE_SUB: Record<number, (v: VillagerDef) => string> = {
  2: (v) => `${v.name} wrote you a letter`,
  4: (v) => `${v.name} has a story to share with you`,
  6: (v) => v.perk6.text,
  8: (v) => `${v.name} has another story for you`,
  10: (v) => `Best friends! ${v.name} will send a gift every week`,
};

// Starts on the first farm tick (after boot, with the save loaded); ticks pause while visiting a neighbour.
let started = false;
let last = 0;
let daily = 0;
function start(): void {
  started = true;
  last = performance.now();
  villageRewards.start();
  window.addEventListener('pointerdown', () => { lastInput = performance.now(); }, { capture: true, passive: true });
  game.bus.on('village:milestone', (e) => {
    const { id, hearts } = e as { id: string; hearts: number };
    const v = VILLAGER[id];
    if (v) ui.feedback.toast(`${hearts} hearts with ${v.name}!`, MILESTONE_SUB[hearts]?.(v), hearts === 10 ? 'crown' : 'heart', 'gold');
  });
  // a heart from chatting or an order (gifts celebrate on the villager page)
  game.bus.on('village:points', ({ id, delta, points, hearts, reason }) => {
    if (delta <= 0 || reason === 'gift' || FRIENDSHIP.milestones.includes(hearts)) return;
    if (Math.floor((points - delta) / PER_HEART) < hearts) ui.feedback.toast(`${VILLAGER[id]?.name}: ${heartsText(hearts)}`, 'Your friendship grew!', 'heart');
  });
}
ui.onTick(() => {
  if (!started) start();
  const now = performance.now();
  const dt = Math.min(5, (now - last) / 1000);
  last = now;
  storyTick(dt);
  refreshVillageBadge();
  if ((daily += dt) > 20) { daily = 0; villageRewards.daily(); }
});

ui.register('village', (arg) => openVillage(arg as { villager?: string } | undefined));
