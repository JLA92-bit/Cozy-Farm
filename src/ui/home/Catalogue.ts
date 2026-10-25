import { FURNITURE, HOME, ITEMS, PIECE, VILLAGER, type PieceDef } from '../../data';
import { village } from '../../systems/Village';
import { game } from '../../systems/Game';
import { home } from '../../systems/Home';
import { audio } from '../../systems/Audio';
import { Panel } from '../Panel';
import { button, clear, h, itemIcon, priceTag } from '../dom';
import { ui } from '../UI';
import { CATS, pieceIcon, type HomeControls } from './HomeUI';

/**
 * 1.29 the Furniture Catalogue. Every piece is always on sale at full price; six a day are cheaper (a discount only,
 * nothing is ever taken off sale). A piece bought once stays in "Bought before" to buy again. Crafted and gift
 * pieces show where they come from.
 */

const KIND_TEXT: Record<string, string> = { floor: 'Stands on the floor', surface: 'Small: goes on tables and shelves', wall: 'Hangs on a wall', rug: 'A rug: lies under everything', ceiling: 'Hangs from the ceiling' };

export function openCatalogue(c: HomeControls): void {
  const tabs = [{ id: 'picks', label: "Today's picks", icon: 'sparkles' }, ...CATS.map((x) => ({ id: x.id, label: x.name, icon: x.icon })),
    { id: 'handmade', label: 'Handmade', icon: 'hammer' }, { id: 'gifts', label: "Friends' gifts", icon: 'gift' }, { id: 'known', label: 'Bought before', icon: 'check' }];
  const p = new Panel({ title: 'Furniture Catalogue', icon: 'store', color: 'purple', wallet: true, tabs });
  let query = '';
  const search = h('input', { type: 'search', class: 'hm-input hm-search', placeholder: 'Find a piece', 'aria-label': 'Find a piece', oninput: (e: Event) => { query = (e.target as HTMLInputElement).value.trim().toLowerCase(); render(); } });
  const list = h('div', { class: 'hm-grid hm-cat-grid' });
  // the search box stays in the page while typing (taking it out and back on each letter closed the phone keyboard);
  // only the hint under it changes
  const hint = h('div', { class: 'hm-cat-hint' });
  const head = h('div', { class: 'hm-cat-head' }, search, hint);
  p.body.append(head, list);

  const owned = (id: string) => home.stored(id) + Object.values(home.state.rooms).reduce((n, r) => n + r.items.filter((i) => i.f === id).length, 0);

  /** A crafted piece: what it takes, and Make (at the Carpenter's Workshop). */
  const craftCard = (def: PieceDef): HTMLElement => {
    const short = home.craftShort(def.id);
    const here = home.canCraftHere();
    const ok = here && !Object.keys(short).length && game.coins >= def.price;
    const needs = h('div', { class: 'hm-needs' }, ...Object.entries(def.craft ?? {}).map(([it, n]) =>
      h('span', { class: `hm-need${short[it] ? ' short' : ''}`, title: ITEMS[it]?.name ?? it }, itemIcon(it), `${Math.min(n, game.state.inventory[it] ?? 0)}/${n}`)));
    const have = owned(def.id);
    return h('div', { class: 'hm-card hm-cat' },
      pieceIcon(def, 'hm-card-img'), h('span', { class: 'hm-card-name' }, def.name), needs,
      have ? h('span', { class: 'hm-count outlined' }, `x${have}`) : null,
      h('div', { class: 'hm-card-btns' },
        here ? button(['Make', priceTag(def.price)], () => {
          if (!home.craft(def.id)) { ui.feedback.toast('Not yet', 'You need everything it takes, and the coins.', 'hammer', 'warn'); audio.play('error'); return; }
          audio.play('build', { volume: 0.6 });
          ui.feedback.toast('Made it!', `${def.name} is in your home storage.`, 'hammer');
          render();
        }, `small ${ok ? 'yellow' : 'disabled'}`, { 'aria-label': `Make ${def.name}` }) : h('span', { class: 'hm-card-sub' }, "Build the Carpenter's Workshop to make these"),
        home.stored(def.id) ? button('Place', () => { p.close(); void c.placeFromStorage(def.id); }, 'small green') : null));
  };

  /** A villager's gift piece: who sends it and when, or buy another once you have it. */
  const giftCard = (def: PieceDef): HTMLElement => {
    const known = home.state.known.includes(def.id);
    const v = VILLAGER[def.gift!];
    if (known) return card(def);
    const hearts = village.hearts(def.gift!);
    return h('div', { class: 'hm-card hm-cat locked' },
      pieceIcon(def, 'hm-card-img'), h('span', { class: 'hm-card-name' }, def.name),
      h('span', { class: 'hm-card-sub' }, `${v?.name ?? 'A friend'} sends this at ${def.hearts} hearts`),
      h('span', { class: 'hm-card-sub' }, `${Math.min(hearts, def.hearts ?? 0)} of ${def.hearts} hearts`));
  };

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
    clear(hint);
    clear(list);
    const tab = p.tab;
    let defs: PieceDef[];
    if (tab === 'picks') {
      hint.append(h('div', { class: 'hm-hint' }, `Six pieces are ${Math.round(HOME.discount * 100)}% off today. Everything else is always on sale too.`));
      defs = home.picks().map((id) => PIECE[id]).filter(Boolean);
    } else if (tab === 'handmade') {
      hint.append(h('div', { class: 'hm-hint' }, "Made at the Carpenter's Workshop from things you gather, grow and find."));
      defs = FURNITURE.filter((d) => d.craft);
    } else if (tab === 'gifts') {
      hint.append(h('div', { class: 'hm-hint' }, 'Each villager makes you a set of three as your friendship grows.'));
      defs = FURNITURE.filter((d) => d.gift);
    } else if (tab === 'known') {
      defs = home.state.known.map((id) => PIECE[id]).filter(Boolean);
      if (!defs.length) hint.append(h('div', { class: 'hm-hint' }, 'Pieces you buy show here, ready to buy again.'));
    } else defs = FURNITURE.filter((d) => !d.craft && !d.gift && (tab === 'all' || d.cat === tab));
    if (query) defs = (tab === 'picks' ? FURNITURE : defs).filter((d) => d.name.toLowerCase().includes(query));
    if (!defs.length && query) list.append(h('div', { class: 'hm-empty' }, 'Nothing by that name.'));
    for (const d of defs.slice(0, 120)) list.append(d.craft ? craftCard(d) : d.gift ? giftCard(d) : card(d));
    if (defs.length > 120) list.append(h('div', { class: 'hm-hint' }, `And ${defs.length - 120} more: try the search box.`));
  };
  p.onTab = () => { render(); p.body.scrollTop = 0; };
  p.open();
  render();
}
