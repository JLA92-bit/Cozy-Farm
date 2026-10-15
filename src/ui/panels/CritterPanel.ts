import { Panel } from '../Panel';
import { h, icon, itemIcon, button, clear, priceTag } from '../dom';
import { ui } from '../UI';
import { CRITTERS, ITEMS, ROOM, WOODS_REGIONS, WREN, type CritterDef } from '../../data';
import { game } from '../../systems/Game';
import { critters } from '../../systems/Critters';
import { woods } from '../../systems/Woods';
import { audio, haptics } from '../../systems/Audio';
import './woods.css';

/**
 * 1.20 Woodland Friends screens: a critter family's feeding stump (choose a treat to leave), Wren the ranger's field
 * notes, and the Critter Journal page of the Collection Book.
 */

const hour = (n: number): string => `${n % 12 === 0 ? 12 : n % 12}${n < 12 ? 'am' : 'pm'}`;
const hoursText = (c: CritterDef): string => `${hour(c.from)} to ${hour(c.to)}`;

function heartsRow(id: string): HTMLElement {
  const n = critters.hearts(id);
  const row = h('div', { class: 'cr-hearts', 'aria-label': `${n} of ${CRITTERS.maxHearts} hearts` });
  for (let i = 0; i < CRITTERS.maxHearts; i++) row.append(icon('heart', `cr-heart ${i < n ? 'on' : ''}`));
  return row;
}

/** What the stump is waiting for, in one line. */
function stumpLine(c: CritterDef): string {
  const treat = critters.treatOn(c.id);
  if (critters.present(c.id)) return `The ${c.name.toLowerCase()} are here! Tap them by the stump to say hello.`;
  if (treat) {
    const wait = critters.hoursUntil(c);
    const when = critters.seenToday(c.id) ? 'tomorrow' : wait === 0 ? 'any moment now' : `in about ${wait} ${wait === 1 ? 'hour' : 'hours'}`;
    return `A ${ITEMS[treat].name.toLowerCase()} is waiting on the stump. They come by in the ${c.when}, ${when}.`;
  }
  if (critters.seenToday(c.id)) return 'They visited today. Leave a treat now and it waits for tomorrow.';
  return `Leave a treat on the stump and they come by in the ${c.when} (${hoursText(c)}).`;
}

/** A family's feeding stump. */
export function openCritter(id: string): void {
  const c = critters.def(id);
  if (!c) return;
  const p = new Panel({ title: c.name, icon: c.icon, color: 'green', size: 'medium' });
  const render = () => {
    clear(p.body);
    p.body.append(h('div', { class: 'cr-head' }, icon(c.icon, 'cr-big'),
      h('div', { class: 'grow' }, h('div', { class: 'muted' }, c.about), heartsRow(c.id),
        h('div', { class: 'cr-sub' }, critters.hearts(c.id) >= CRITTERS.maxHearts ? 'Best friends!' : `${critters.toNextHeart(c.id)} more ${critters.toNextHeart(c.id) === 1 ? 'visit' : 'visits'} to the next heart`))));
    p.body.append(h('div', { class: `card cr-state ${critters.present(c.id) ? 'here' : ''}` }, icon(critters.present(c.id) ? 'paw_prints' : 'hourglass', 'cr-state-icon'), h('span', null, stumpLine(c))));
    if (critters.present(c.id)) {
      p.body.append(h('div', { class: 'center' }, button([icon('heart'), 'Say hello'], () => { p.close(); sayHello(c.id); }, 'green')));
    }
    p.body.append(h('div', { class: 'section-title' }, 'Their favourite treats'));
    const list = h('div', { class: 'col', style: 'gap:6px' });
    const busy = !!critters.treatOn(c.id);
    for (const t of c.treats) {
      const have = game.count(t);
      list.append(h('div', { class: 'list-item' }, itemIcon(t, 'icon big'),
        h('div', { class: 'grow' }, h('div', { class: 'title' }, ITEMS[t].name), h('div', { class: 'sub' }, `You have ${have}`)),
        button('Leave one', () => {
          if (!critters.feed(c.id, t)) { audio.play('error'); return; }
          audio.play('pop'); haptics.buzz(10);
          ui.feedback.toast('Treat left on the stump', critters.present(c.id) ? 'Listen... something is coming!' : `The ${c.name.toLowerCase()} come by in the ${c.when}.`, ITEMS[t].icon);
          render();
        }, `small ${!busy && have > 0 ? 'yellow' : 'disabled'}`)));
    }
    p.body.append(list);
    const rareFound = woods.found(c.rare) > 0;
    p.body.append(h('div', { class: 'card cr-rare' }, rareFound ? itemIcon(c.rare, 'icon big') : icon('gift', 'icon big'),
      h('div', { class: 'grow' }, h('div', { class: 'title' }, rareFound ? `Special gift: ${ITEMS[c.rare].name}` : 'A special gift'),
        h('div', { class: 'sub' }, rareFound ? 'For the Woodland Gifts shelf in the Museum.' : 'Friends with more hearts bring it more often.'))));
  };
  render();
  p.open();
}

/** Say hello to a visitor (from a tap on it or the stump screen). */
export function sayHello(id: string): void {
  const c = critters.def(id);
  if (!c) return;
  const r = critters.visit(id);
  if (!r) return;
  audio.play(r.heart ? 'reward' : 'pop'); haptics.buzz(15);
  const gift = ITEMS[r.gift];
  if (r.heart) ui.feedback.toast(`The ${c.name.toLowerCase()} trust you more!`, `${r.heart} ${r.heart === 1 ? 'heart' : 'hearts'} and +${r.coins} coins. They left you a ${gift.name.toLowerCase()}.`, 'heart');
  else ui.feedback.toast(r.rare ? `A special gift: ${gift.name}!` : `They left you a ${gift.name.toLowerCase()}`, r.rare ? 'One for the Woodland Gifts shelf in the Museum.' : 'Leave another treat for their next visit.', gift.icon);
}

/** Wren the ranger: today's field note and what each critter likes. */
export function openWren(): void {
  if (!critters.wrenHere) return;
  const p = new Panel({ title: `${WREN.name} the ranger`, icon: 'wren', color: 'green', size: 'medium', wallet: true });
  const render = () => {
    clear(p.body);
    p.body.append(h('div', { class: 'cr-head' }, icon('wren', 'cr-big'), h('div', { class: 'grow' }, h('div', { class: 'cr-say' }, `"${critters.hello()}"`))));
    const n = critters.note();
    if (n) {
      const have = game.count(n.item), rw = critters.noteReward();
      p.body.append(h('div', { class: 'section-title' }, "Today's field note"));
      p.body.append(h('div', { class: `card list-item cr-note ${n.done ? 'cr-done' : ''}` }, itemIcon(n.item, 'icon big'),
        h('div', { class: 'grow' }, h('div', { class: 'title' }, n.done ? `Thank you for the ${ITEMS[n.item].name.toLowerCase()}!` : `I'm studying ${ITEMS[n.item].name.toLowerCase()}: could you bring ${n.n}?`),
          h('div', { class: 'sub' }, n.done ? 'A new note tomorrow.' : `You have ${have} of ${n.n}${rw.gem ? '. This one comes with a gem' : ''}`)),
        n.done ? icon('check', 'icon') : button(['Give', priceTag(rw.coins)], () => {
          const r = critters.giveNote();
          if (!r) { ui.feedback.toast('Not enough yet', `Wren needs ${n.n} ${ITEMS[n.item].name.toLowerCase()}.`, ITEMS[n.item].icon); audio.play('error'); return; }
          audio.play('reward'); haptics.buzz(15);
          ui.feedback.toast('Field note done', `+${r.coins} coins${r.gem ? ' and a gem' : ''}`, 'field_notes');
          render();
        }, `small ${have >= n.n ? 'yellow' : 'disabled'}`)));
      p.body.append(h('div', { class: 'muted cr-sub' }, `Field notes so far: ${critters.notesDone()}`));
    }
    p.body.append(h('div', { class: 'section-title' }, 'What the critters like'));
    for (const c of CRITTERS.families) {
      p.body.append(h('div', { class: 'list-item' }, icon(c.icon, 'icon big'),
        h('div', { class: 'grow' }, h('div', { class: 'title' }, `${c.name}, ${critters.placeName(c)}`), h('div', { class: 'sub' }, `${hoursText(c)}: `, ...c.treats.map((t) => itemIcon(t, 'cr-mini'))))));
    }
  };
  render();
  p.open();
}

/** The Critter Journal page of the Collection Book. */
export function renderCritterJournal(p: Panel): void {
  clear(p.body);
  const total = CRITTERS.families.reduce((a, c) => a + critters.hearts(c.id), 0), max = CRITTERS.families.length * CRITTERS.maxHearts;
  p.body.append(h('div', { class: 'al-head' }, icon('paw_prints', 'al-icon'),
    h('div', null, h('div', { class: 'al-title' }, 'Critter Journal'),
      h('div', { class: 'muted' }, woods.unlocked ? `${total} of ${max} hearts. Leave treats on the feeding stumps in the Wild Woods.` : 'The Wild Woods open at level 14.'))));
  for (const c of CRITTERS.families) {
    const open = critters.open(c.id), met = critters.visits(c.id) > 0;
    const reg = WOODS_REGIONS.find((r) => r.id === c.region);
    if (!open && !met) {
      p.body.append(h('div', { class: 'card cr-entry locked' }, icon('lock', 'icon big'),
        h('div', { class: 'grow' }, h('div', { class: 'title' }, '???'), h('div', { class: 'sub' }, reg ? `Lives in ${reg.name}. Restore ${ROOM[reg.trail]?.name ?? 'the trail'} to meet them.` : 'Lives in the Wild Woods.'))));
      continue;
    }
    p.body.append(h('div', { class: 'card cr-entry' }, icon(c.icon, 'icon big'),
      h('div', { class: 'grow' },
        h('div', { class: 'row between' }, h('div', { class: 'title' }, c.name), heartsRow(c.id)),
        h('div', { class: 'sub' }, `${critters.placeName(c).replace(/^the /, 'The ')}, ${hoursText(c)}. ${critters.visits(c.id)} ${critters.visits(c.id) === 1 ? 'visit' : 'visits'}.`),
        h('div', { class: 'sub cr-likes' }, 'Likes ', ...c.treats.map((t) => itemIcon(t, 'cr-mini')), ' Gift ', woods.found(c.rare) ? itemIcon(c.rare, 'cr-mini') : h('span', null, '?')))));
  }
}

ui.register('critter', (arg) => { const a = arg as { id?: string } | undefined; if (a?.id) openCritter(a.id); });
ui.register('wren', () => openWren());
