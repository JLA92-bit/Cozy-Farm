import { Panel } from '../Panel';
import { h, icon, priceTag, clear } from '../dom';
import { ui } from '../UI';
import { BUILDINGS, type BuildingDef, ANIMALS } from '../../data';
import { game } from '../../systems/Game';
import { buildings, eventCostOf } from '../../systems/Buildings';
import { audio } from '../../systems/Audio';
import { animals } from '../../systems/Animals';
import { eventTokenItem } from '../../systems/Farming';
import { ITEMS } from '../../data';
import { capCardHint, moreRoomHint, nextCapRaise, type CapKey } from '../../systems/Caps';

const TABS = [
  { id: 'farm', label: 'Farm', icon: 'seedling' },
  { id: 'animal', label: 'Animals', icon: 'chicken' },
  { id: 'production', label: 'Make', icon: 'hammer_wrench' },
  { id: 'decor', label: 'Decor', icon: 'sparkles' },
  { id: 'special', label: 'Special', icon: 'store' },
];

/** Last tab the player browsed this session, so reopening the shop lands where they left off. */
let lastTab = '';

const inTab = (b: BuildingDef, tab: string): boolean => {
  if (tab === 'event') return b.event === game.state.event?.id;
  if (b.event) return false;
  if (tab === 'animal') return b.cat === 'animal';
  if (b.cat !== tab) return false;
  if (b.cat === 'special' && !b.max) return false;
  return true;
};

/** Unlocked at the player's current level and not bought yet: worth a "New!" tag. */
const isNew = (b: BuildingDef): boolean => !b.event && b.level > 1 && b.level === game.level && game.capUsage(b) === 0 && game.ownedCount(b.id) === 0;

export function openShop(tab?: string): void {
  const tabs = [...TABS];
  if (game.state.event) tabs.push({ id: 'event', label: 'Event', icon: ITEMS[eventTokenItem(game.state.event.id)]?.icon ?? 'party' });
  const p = new Panel({ title: 'Shop', icon: 'cart', tabs, color: 'green', wallet: true });
  p.onTab = (id) => { lastTab = id; render(p, id); };
  const start = tab ?? lastTab;
  if (start && tabs.some((t) => t.id === start)) p.tab = start;
  // little dots on tabs that hold something new for this level
  p.tabsEl?.querySelectorAll<HTMLElement>('.tab').forEach((t) => {
    const id = t.dataset.tab!;
    const fresh = BUILDINGS.some((b) => inTab(b, id) && isNew(b)) || (id === 'animal' && ANIMALS.some((a) => a.level > 1 && a.level === game.level));
    if (fresh) t.append(h('span', { class: 'tab-dot' }));
  });
  p.open();
}

function render(p: Panel, tab: string): void {
  clear(p.body);
  if (tab === 'animal') { renderAnimals(p); return; }
  const list = BUILDINGS.filter((b) => inTab(b, tab)).sort((a, b) => a.level - b.level);
  const grid = h('div', { class: 'grid shop-grid' });
  for (const def of list) grid.append(card(p, def));
  if (tab === 'event' && game.state.event) {
    p.body.append(h('div', { class: 'section-title' }, `You have ${game.state.event.tokens} `, icon(ITEMS[eventTokenItem(game.state.event.id)].icon)));
  }
  p.body.append(grid);
}

function card(p: Panel, def: BuildingDef): HTMLElement {
  const locked = !def.event && game.level < def.level;
  const cap = game.capFor(def);
  const used = game.capUsage(def);
  const check = buildings.canBuy(def.id);
  const stored = game.state.storage[def.id] ?? 0;
  const thumb = icon(`building:${def.id}`, 'card-icon');
  const price = def.event
    ? priceTag(0, 0, { n: eventCostOf(def), icon: ITEMS[eventTokenItem(def.event)].icon })
    : priceTag(game.priceOf(def));
  const full = !locked && cap !== Infinity && used >= cap;
  const broke = !locked && !full && !check.ok && !stored;
  // full, but a bigger Farmhouse makes room: point the way instead of a dead end
  const growable = full && !def.max && !!def.cap && !!nextCapRaise(def.cap as CapKey);
  const sub: (HTMLElement | string)[] = [];
  if (locked) sub.push(`Level ${def.level}`);
  else if (cap !== Infinity) sub.push(`${used} / ${cap}`);
  if (def.charm && def.cat === 'decor') sub.push(`+${def.charm} charm`);
  const el = h('div', { class: `card clickable shop-card ${locked ? 'locked' : ''} ${full && !stored ? 'maxed' : ''}` },
    locked ? h('div', { class: 'lock-tag' }, icon('lock'), `Lv ${def.level}`) : null,
    !locked && isNew(def) ? h('div', { class: 'new-tag outlined' }, 'New!') : null,
    thumb,
    h('div', { class: 'card-title' }, def.name),
    h('div', { class: 'card-sub' }, sub.join(' · ')),
    growable && !stored ? h('div', { class: 'card-sub more-room' }, capCardHint(def)) : null,
    stored
      ? h('div', { class: 'pill stored' }, icon('package'), `${stored} stored`)
      : growable ? h('div', { class: 'pill get-more' }, icon('house'), 'Get more')
        : full ? h('div', { class: 'pill maxed' }, 'Max') : h('div', { class: `pill ${broke ? 'cant' : ''}` }, price),
  );
  el.addEventListener('click', () => {
    if (stored > 0) { p.close(); void ui.interaction.startPlacement(def.id, true); return; }
    if (growable) {
      const hint = moreRoomHint(def);
      ui.feedback.toast(hint.title, hint.sub, 'house');
      audio.play('select');
      p.close();
      setTimeout(() => ui.open('farmhouse'), 220);
      return;
    }
    if (!check.ok) { ui.feedback.toast(check.reason, def.name, locked ? 'lock' : 'cross'); audio.play('error'); return; }
    audio.play('select');
    p.close();
    void ui.interaction.startPlacement(def.id);
  });
  return el;
}

function renderAnimals(p: Panel): void {
  p.body.append(h('div', { class: 'section-title' }, 'Animal homes'));
  const grid = h('div', { class: 'grid shop-grid' });
  for (const def of BUILDINGS.filter((b) => b.cat === 'animal').sort((a, b) => a.level - b.level)) grid.append(card(p, def));
  p.body.append(grid);
  p.body.append(h('div', { class: 'section-title' }, 'Animals'));
  const g2 = h('div', { class: 'grid shop-grid' });
  for (const a of ANIMALS) {
    const locked = game.level < a.level;
    const cost = animals.price(a.id);
    const home = animals.homeWithSpace(a.id);
    const el = h('div', { class: `card clickable shop-card ${locked ? 'locked' : ''}` },
      locked ? h('div', { class: 'lock-tag' }, icon('lock'), `Lv ${a.level}`) : null,
      !locked && a.level > 1 && a.level === game.level ? h('div', { class: 'new-tag outlined' }, 'New!') : null,
      icon(`model:${a.model}`, 'card-icon'),
      h('div', { class: 'card-title' }, a.name),
      h('div', { class: 'card-sub' }, locked ? `Level ${a.level}` : home ? `Gives ${ITEMS[a.product].name}` : `Needs a ${BUILDINGS.find((b) => b.id === a.house)?.name}`),
      h('div', { class: `pill ${!locked && game.coins < cost ? 'cant' : ''}` }, priceTag(cost)),
    );
    el.addEventListener('click', () => {
      if (locked) { ui.feedback.toast(`${a.name} unlocks at level ${a.level}`, undefined, 'lock'); audio.play('error'); return; }
      const r = animals.buy(a.id);
      if (!r.ok) { ui.feedback.toast(r.reason ?? 'Cannot buy', undefined, 'cross'); audio.play('error'); return; }
      p.close();
      ui.scene.rig.focus(ui.scene.farm.anchor(r.home!.uid).x, ui.scene.farm.anchor(r.home!.uid).z);
    });
    g2.append(el);
  }
  p.body.append(g2);
}

ui.register('shop', (tab) => openShop(tab as string | undefined));
