import { Panel } from '../Panel';
import { h, icon, itemIcon, clear } from '../dom';
import { ui } from '../UI';
import { ITEMS, MUSEUM, type MuseumShelf } from '../../data';
import { museum } from '../../systems/Museum';
import { audio, haptics } from '../../systems/Audio';
import './woods.css';

/** The Museum in the Wild Woods: shelves of finds. Tap a piece you hold to give it. */
export function openMuseum(): void {
  if (!museum.unlocked) { ui.feedback.toast('The Museum', `Opens at level ${MUSEUM.level}.`, 'trophy'); return; }
  const p = new Panel({ title: 'The Museum', icon: 'trophy', color: 'purple', size: 'medium', wallet: true });
  const render = () => {
    clear(p.body);
    const t = museum.total();
    p.body.append(h('div', { class: 'mu-head' },
      h('div', { class: 'mu-title' }, museum.curator() ? 'Curator of the valley' : 'Fill every shelf to become the Curator'),
      h('div', { class: 'progress' }, h('div', { class: 'fill', style: `width:${Math.round((t.have / Math.max(1, t.slots)) * 100)}%` }), h('div', { class: 'label' }, `${t.have} / ${t.slots} pieces`))));
    for (const s of museum.shelves()) p.body.append(shelf(s));
  };
  const give = (s: MuseumShelf, item: string) => {
    if (!museum.donate(s.id, item)) return;
    audio.play('reward'); haptics.buzz(15);
    ui.feedback.toast(`${ITEMS[item].name} is on display`, undefined, ITEMS[item].icon);
    render();
  };
  const shelf = (s: MuseumShelf): HTMLElement => {
    const done = museum.donated(s.id), full = museum.full(s), can = museum.givable(s);
    const slots = h('div', { class: 'mu-slots' });
    const ids = s.items ?? [];
    if (s.kind === 'gold') {
      for (let i = 0; i < (s.slots ?? 0); i++) slots.append(h('div', { class: `mu-slot ${done[i] ? 'got' : ''}` }, done[i] ? itemIcon(done[i]) : h('span', null, '?')));
    } else {
      for (const id of ids) {
        const got = done.includes(id), have = can.includes(id);
        const el = h('button', { class: `mu-slot ${got ? 'got' : have ? 'ready' : ''}`, type: 'button', title: got || have ? ITEMS[id].name : 'Not found yet' }, got || have ? itemIcon(id) : h('span', null, '?'));
        if (have) el.addEventListener('click', () => give(s, id));
        slots.append(el);
      }
    }
    return h('div', { class: `card mu-shelf ${full ? 'done' : ''}` },
      h('div', { class: 'row between' }, h('div', { class: 'mu-name' }, icon(s.icon, 'mu-icon'), s.name),
        h('div', { class: 'muted' }, `${done.length}/${museum.slots(s)}`)),
      slots,
      s.kind === 'gold' ? h('div', { class: 'mu-gold' }, ...(can.length ? can.slice(0, 12).map((id) => h('button', { class: 'mu-slot ready', type: 'button', title: `${ITEMS[id].name} (gold star)`, onclick: () => give(s, id) }, itemIcon(id))) : [h('span', { class: 'muted' }, full ? '' : 'Gold-star items from your barn can go here, one of each kind.')])) : null,
      h('div', { class: 'muted mu-reward' }, full ? 'Complete' : `Reward: ${s.reward.coins} coins and ${s.reward.gems} gems`));
  };
  render();
  p.open();
}

ui.register('museum', () => openMuseum());
