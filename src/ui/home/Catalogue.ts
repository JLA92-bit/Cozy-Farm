import { FURNITURE, HOME, PIECE, type PieceDef } from '../../data';
import { game } from '../../systems/Game';
import { home } from '../../systems/Home';
import { audio } from '../../systems/Audio';
import { Panel } from '../Panel';
import { button, clear, h, priceTag } from '../dom';
import { ui } from '../UI';
import { CATS, pieceIcon, type HomeControls } from './HomeUI';

/**
 * 1.29 the Furniture Catalogue. Every piece is always on sale at full price; six a day are cheaper (a discount only,
 * nothing is ever taken off sale). A piece bought once stays in "Bought before" to buy again. Crafted and gift
 * pieces show where they come from.
 */

const KIND_TEXT: Record<string, string> = { floor: 'Stands on the floor', surface: 'Small: goes on tables and shelves', wall: 'Hangs on a wall', rug: 'A rug: lies under everything', ceiling: 'Hangs from the ceiling' };

export function openCatalogue(c: HomeControls): void {
  const tabs = [{ id: 'picks', label: "Today's picks", icon: 'sparkles' }, ...CATS.map((x) => ({ id: x.id, label: x.name, icon: x.icon })), { id: 'known', label: 'Bought before', icon: 'check' }];
  const p = new Panel({ title: 'Furniture Catalogue', icon: 'store', color: 'purple', wallet: true, tabs });
  let query = '';
  const search = h('input', { type: 'search', class: 'hm-input hm-search', placeholder: 'Find a piece', 'aria-label': 'Find a piece', oninput: (e: Event) => { query = (e.target as HTMLInputElement).value.trim().toLowerCase(); render(); } });
  const list = h('div', { class: 'hm-grid hm-cat-grid' });
  const head = h('div', { class: 'hm-cat-head' });
  p.body.append(head, list);

  const owned = (id: string) => home.stored(id) + Object.values(home.state.rooms).reduce((n, r) => n + r.items.filter((i) => i.f === id).length, 0);

  const card = (def: PieceDef): HTMLElement => {
    const pick = home.picks().includes(def.id);
    const price = home.price(def.id);
    const have = owned(def.id);
    const can = home.buyable(def);
    const buy = () => {
      if (!home.buy(def.id)) { ui.feedback.toast('Not enough coins', undefined, 'cross'); audio.play('error'); return; }
      audio.play('coins', { volume: 0.6 });
      render();
    };
    const place = async () => { p.close(); await c.placeFromStorage(def.id); };
    return h('div', { class: `hm-card hm-cat${pick ? ' pick' : ''}` },
      pick ? h('span', { class: 'hm-sale outlined' }, `-${Math.round(HOME.discount * 100)}%`) : null,
      pieceIcon(def, 'hm-card-img'),
      h('span', { class: 'hm-card-name' }, def.name),
      h('span', { class: 'hm-card-sub' }, KIND_TEXT[def.kind]),
      have ? h('span', { class: 'hm-count outlined' }, `x${have}`) : null,
      h('div', { class: 'hm-card-btns' },
        can ? button(priceTag(price), buy, `small ${game.coins >= price ? 'yellow' : 'disabled'}`, { 'aria-label': `Buy ${def.name}` })
          : h('span', { class: 'hm-card-sub' }, def.craft ? 'Made at the Carpenter' : 'A gift from a friend'),
        home.stored(def.id) ? button('Place', () => void place(), 'small green', { 'aria-label': `Place ${def.name}` }) : null));
  };

  const render = () => {
    clear(head);
    clear(list);
    const tab = p.tab;
    head.append(search);
    let defs: PieceDef[];
    if (tab === 'picks') {
      head.append(h('div', { class: 'hm-hint' }, `Six pieces are ${Math.round(HOME.discount * 100)}% off today. Everything else is always on sale too.`));
      defs = home.picks().map((id) => PIECE[id]).filter(Boolean);
    } else if (tab === 'known') {
      defs = home.state.known.map((id) => PIECE[id]).filter(Boolean);
      if (!defs.length) head.append(h('div', { class: 'hm-hint' }, 'Pieces you buy show here, ready to buy again.'));
    } else defs = FURNITURE.filter((d) => tab === 'all' || d.cat === tab);
    if (query) defs = (tab === 'picks' ? FURNITURE : defs).filter((d) => d.name.toLowerCase().includes(query));
    if (!defs.length && query) list.append(h('div', { class: 'hm-empty' }, 'Nothing by that name.'));
    for (const d of defs.slice(0, 120)) list.append(card(d));
    if (defs.length > 120) list.append(h('div', { class: 'hm-hint' }, `And ${defs.length - 120} more: try the search box.`));
  };
  p.onTab = () => { render(); p.body.scrollTop = 0; };
  p.open();
  render();
}
