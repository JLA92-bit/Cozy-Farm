import { h, num, badge, toast, modal, field, ago, compact } from '../ui';
import {
  AFTER_FESTIVAL, BUILDING, CARE_LEVELS, FARMHOUSE_LEVELS, ITEMS, MINE, PROJECT_GROUPS, UPGRADE_LEVELS, WAITS_FOR,
  iconUrl, nameOf, type Room,
} from '../gamedata';

/**
 * The player page's Needs tab (ADMIN.md "Needs"): everything the player is working towards, read from their cloud
 * save, with how far along each one is and what is still missing. Tick what to send and gift it in one press; it goes
 * out as a normal developer gift (admin_give), so it shows under Developer gifts and on the Gifts page.
 *
 * "Missing" = what is wanted, less what was already put in, less what they hold that counts (a bundle that wants
 * gold only counts gold). Quests count what the player does, so they are shown but cannot be gifted.
 */

export interface NeedsSave {
  lastSeenVersion?: string;
  player?: { level: number; coins: number };
  inventory?: Record<string, number>;
  quality?: Record<string, [number, number]>;
  buildings?: { uid: number; type: string; level: number }[];
  restoration?: { done?: string[]; given?: Record<string, Record<string, Record<string, number>>>; festival?: number };
  orders?: { list?: { id: number; lines: { item: string; qty: number }[] }[] };
  truck?: { crates?: { item: string; qty: number; filled: boolean }[] } | null;
  boatvisit?: { day: string; theme: string; want: Record<string, number>; done: boolean };
  helpwanted?: { day: string; done: number[]; reqs?: { who: string; item: string; n: number; star: 0 | 2 }[] };
  woods?: { note?: { day: string; item: string; n: number; done: boolean } };
  mine?: { pickaxe?: number };
  quests?: { daily?: Quest[]; weekly?: Quest[] };
  stats?: Record<string, number>;
}
interface Quest { text: string; stat?: string; start?: number; target?: number; claimed: boolean }

export interface NeedsOptions {
  name: string;
  /** when the cloud save was written, and the game version they last played on */
  savedAt: string | null;
  version: string | null;
  /** developer gifts sent but not opened yet (the save does not include them) */
  pendingGifts: number;
  /** send the gift; resolves true when it went out */
  give: (items: Record<string, number>, coins: number, message: string) => Promise<boolean>;
}

/** silver and gold items in gifts arrive as `silver__<id>` / `gold__<id>` from game 1.31.2 */
const STAR_GIFTS_FROM = '1.31.2';
const STAR_NAME = ['', 'Silver', 'Gold'];

const newer = (v: string | null | undefined, than: string): boolean => {
  if (!v) return false;
  const a = v.split('.').map(Number), b = than.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0); }
  return true;
};

/** One thing that can be put in the gift: an item (of a quality) or coins. */
interface Pick { key: string; label: string; check: HTMLInputElement; qty: HTMLInputElement }

export function needsTab(s: NeedsSave | null, o: NeedsOptions): HTMLElement[] {
  if (!s?.player) {
    return [h('section', { class: 'card' }, h('h3', null, 'Needs'),
      h('p', { class: 'muted' }, 'Needs are read from the cloud save, and this player has none (only players signed in with Google have one).'))];
  }
  const level = s.player.level, coins = s.player.coins;
  const inv = s.inventory ?? {}, quality = s.quality ?? {};
  const done = new Set(s.restoration?.done ?? []);
  const given = s.restoration?.given ?? {};
  const starOk = newer(o.version, STAR_GIFTS_FROM);
  const picks: Pick[] = [];

  /** how many of an item they hold that counts: any quality, silver or better, or gold only */
  const held = (item: string, star = 0): number => {
    if (item === 'coins') return coins;
    const total = inv[item] ?? 0, [sv, gd] = quality[item] ?? [0, 0];
    return star === 2 ? gd : star === 1 ? sv + gd : total;
  };

  // ------------------------------------------------------------------------------------------ the gift bar
  const summary = h('span', { class: 'needs-sum' });
  const msg = h('input', { class: 'input', maxLength: 200, value: 'A little help for your farm from the Cozy Acres team!' }) as HTMLInputElement;
  const sendBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => void send() }, 'Gift selected') as HTMLButtonElement;
  const chosen = (): { items: Record<string, number>; coins: number; lines: string[] } => {
    const items: Record<string, number> = {}; let c = 0;
    for (const p of picks) {
      if (!p.check.checked || p.check.disabled) continue;
      const n = Math.max(0, Math.floor(Number(p.qty.value) || 0));
      if (!n) continue;
      if (p.key === 'coins') c += n; else items[p.key] = (items[p.key] ?? 0) + n;
    }
    const lines = Object.entries(items).map(([k, n]) => `${num(n)} ${keyName(k)}`);
    if (c) lines.unshift(`${num(c)} coins`);
    return { items, coins: c, lines };
  };
  const refresh = () => {
    const g = chosen();
    const kinds = Object.keys(g.items).length;
    summary.textContent = kinds || g.coins ? `${kinds} item ${kinds === 1 ? 'kind' : 'kinds'}${g.coins ? ` and ${num(g.coins)} coins` : ''} selected` : 'Nothing selected';
    sendBtn.disabled = !kinds && !g.coins;
  };
  const send = async () => {
    const g = chosen();
    if (!Object.keys(g.items).length && !g.coins) return;
    // the server keeps at most 100,000 of an item and 10,000,000 coins per gift
    if (g.coins > 10_000_000 || Object.values(g.items).some((n) => n > 100_000)) { toast('Too much for one gift: at most 100,000 of an item and 10,000,000 coins', 'err'); return; }
    const ok = await modal(`Gift for ${o.name}`, [
      h('p', null, 'They get this the next time they open the game:'),
      h('ul', null, g.lines.map((l) => h('li', null, l))),
      h('p', { class: 'muted small' }, `Message: "${msg.value.trim() || 'Thank you for playing Cozy Acres!'}"`),
    ], [{ label: 'Cancel', value: 'no' }, { label: 'Send gift', value: 'yes', kind: 'primary' }]);
    if (ok !== 'yes') return;
    if (await o.give(g.items, g.coins, msg.value.trim())) for (const p of picks) p.check.checked = false;
    refresh();
  };

  // ------------------------------------------------------------------------------------------ rows
  const ico = (id: string) => h('img', { class: 'item-ico', src: id === 'coins' ? iconUrl('coin') : iconUrl(id), alt: '', loading: 'lazy', onerror: (e: Event) => { (e.target as HTMLElement).style.visibility = 'hidden'; } });
  const bar = (frac: number) => h('div', { class: 'progress' }, h('span', { style: { width: `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%` } }));
  /** a table of wanted things; `open` preselects what is missing */
  const table = (lines: { item: string; star?: number; want: number; given?: number }[], open: boolean): HTMLElement => {
    const rows = lines.map((l) => {
      const star = l.star ?? 0, gv = l.given ?? 0, have = held(l.item, star);
      const left = Math.max(0, l.want - gv), missing = Math.max(0, left - have);
      const key = l.item === 'coins' ? 'coins' : star ? `${star === 2 ? 'gold' : 'silver'}__${l.item}` : l.item;
      const blocked = star > 0 && !starOk;
      const check = h('input', { type: 'checkbox', 'aria-label': `Gift ${keyName(key)}`, onchange: refresh }) as HTMLInputElement;
      // coins are never ticked by themselves: a big coin gift should be a choice, not a default
      check.checked = open && missing > 0 && !blocked && l.item !== 'coins';
      check.disabled = blocked || left === 0;
      const qty = h('input', { class: 'input qty', type: 'number', min: 0, max: l.item === 'coins' ? 10_000_000 : 100_000, step: 1, value: String(missing || left), inputMode: 'numeric', 'aria-label': 'How many', oninput: refresh }) as HTMLInputElement;
      qty.disabled = check.disabled;
      picks.push({ key, label: keyName(key), check, qty });
      const status = left === 0 ? badge('Done', 'good') : missing === 0 ? badge('Has enough', 'info') : badge(`${num(missing)} missing`, 'warn');
      return h('tr', { class: left === 0 ? 'muted' : '' },
        h('td', null, check),
        h('td', null, ico(l.item), ' ', l.item === 'coins' ? 'Coins' : ITEMS[l.item]?.name ?? nameOf(l.item), star ? badge(STAR_NAME[star], star === 2 ? 'warn' : 'info') : null,
          blocked ? h('div', { class: 'muted small' }, `Needs game ${STAR_GIFTS_FROM} or newer to receive ${STAR_NAME[star].toLowerCase()} items (they have ${o.version ?? 'an older one'})`) : null),
        h('td', { class: 'r' }, num(l.want)), h('td', { class: 'r' }, l.given === undefined ? '' : num(gv)),
        h('td', { class: 'r' }, l.item === 'coins' ? compact(have) : num(have)), h('td', null, status), h('td', { class: 'r' }, qty));
    });
    return h('table', { class: 'table compact needs-table' },
      h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'Item'), h('th', { class: 'r' }, 'Wants'), h('th', { class: 'r' }, lines.some((l) => l.given !== undefined) ? 'Put in' : ''),
        h('th', { class: 'r' }, 'Has'), h('th', null, 'Status'), h('th', { class: 'r' }, 'Gift'))),
      h('tbody', null, rows));
  };
  /** select or clear every row in a block */
  const selectAll = (box: HTMLElement, on: boolean) => {
    for (const c of box.querySelectorAll<HTMLInputElement>('input[type=checkbox]')) if (!c.disabled) c.checked = on;
    refresh();
  };
  const block = (title: string, sub: string | HTMLElement | null, frac: number | null, body: HTMLElement, open: boolean, tag?: HTMLElement | null): HTMLElement => {
    const box = h('details', { class: 'needs-block', open },
      h('summary', null, h('b', null, title), tag ?? null, sub ? h('span', { class: 'muted small' }, ' ', sub) : null),
      frac === null ? null : bar(frac),
      body,
      h('div', { class: 'needs-actions' },
        h('button', { class: 'btn small', type: 'button', onclick: () => selectAll(box, true) }, 'Select all'),
        h('button', { class: 'btn small', type: 'button', onclick: () => selectAll(box, false) }, 'Clear')));
    return box;
  };
  const card = (title: string, intro: string | null, ...kids: (HTMLElement | null)[]) =>
    h('section', { class: 'card' }, h('h3', null, title), intro ? h('p', { class: 'muted small' }, intro) : null, ...kids.filter(Boolean) as HTMLElement[]);

  // ------------------------------------------------------------------------------------------ building projects
  const lockOf = (g: { id: string }, r: Room): string | null => {
    if (r.opensAt && level < r.opensAt) return `Opens at level ${r.opensAt}`;
    if (AFTER_FESTIVAL.has(g.id) && !s.restoration?.festival) return 'After the Village Festival';
    const prev = WAITS_FOR.get(r.id);
    if (prev && !done.has(prev)) return `After ${nameOf(prev)}`;
    return null;
  };
  // open ones first, by group; every locked one folded into one list underneath, soonest first
  const openBlocks: HTMLElement[] = [];
  const lockedBlocks: { at: number; el: HTMLElement }[] = [];
  let openRooms = 0;
  for (const g of PROJECT_GROUPS) {
    const left = g.rooms.filter((r) => !done.has(r.id) && (r.bundles?.length ?? 0) > 0);
    let header: HTMLElement | null = h('h4', null, g.name);
    for (const r of left) {
      const lock = lockOf(g, r);
      if (!lock) openRooms++;
      const bundles = (r.bundles ?? []).map((b) => {
        const gv = given[r.id]?.[b.id] ?? {};
        const lines = Object.entries(b.wants).map(([item, want]) => ({ item, star: b.minStar ?? 0, want, given: Math.min(want, gv[item] ?? 0) }));
        const want = lines.reduce((a, l) => a + l.want, 0), put = lines.reduce((a, l) => a + l.given, 0);
        return h('div', { class: 'needs-bundle' },
          h('div', { class: 'needs-bundle-head' }, h('b', null, b.name), b.minStar ? badge(`${STAR_NAME[b.minStar]} or better`, 'info') : null,
            h('span', { class: 'muted small' }, ` ${num(put)} of ${num(want)} put in`), put >= want ? badge('Full', 'good') : null),
          bar(put / Math.max(1, want)),
          put >= want ? null : table(lines, !lock));
      });
      const all = (r.bundles ?? []).reduce((a, b) => a + Object.values(b.wants).reduce((x, y) => x + y, 0), 0);
      const put = (r.bundles ?? []).reduce((a, b) => a + Object.entries(b.wants).reduce((x, [k, w]) => x + Math.min(w, given[r.id]?.[b.id]?.[k] ?? 0), 0), 0);
      const el = block(lock ? `${g.name}: ${r.name}` : r.name, lock ?? `${Math.round((put / Math.max(1, all)) * 100)}% put in`, put / Math.max(1, all), h('div', null, ...bundles), !lock, lock ? badge('Locked', '') : badge('Open', 'good'));
      if (lock) lockedBlocks.push({ at: r.opensAt ?? 0, el });
      else { if (header) { openBlocks.push(header); header = null; } openBlocks.push(el); }
    }
  }
  lockedBlocks.sort((a, b) => a.at - b.at);
  const projectCards: HTMLElement[] = [
    ...(openBlocks.length ? openBlocks : [h('p', { class: 'muted' }, 'Nothing open right now.')]),
    lockedBlocks.length ? h('details', { class: 'needs-later' }, h('summary', null, h('b', null, `Locked for now (${lockedBlocks.length})`), h('span', { class: 'muted small' }, ' open later in the game; you can still send what they will need')),
      ...lockedBlocks.map((x) => x.el)) : null,
  ].filter((x): x is HTMLElement => !!x);

  // ------------------------------------------------------------------------------------------ today's requests
  const requests: HTMLElement[] = [];
  const orders = s.orders?.list ?? [];
  if (orders.length) {
    const want: Record<string, number> = {};
    for (const od of orders) for (const l of od.lines) want[l.item] = (want[l.item] ?? 0) + l.qty;
    requests.push(block('Order board', `${orders.length} ${orders.length === 1 ? 'order' : 'orders'} waiting`, null,
      table(Object.entries(want).map(([item, n]) => ({ item, want: n })), true), true));
  }
  const crates = (s.truck?.crates ?? []).filter((c) => !c.filled);
  if (crates.length) {
    const want: Record<string, number> = {};
    for (const c of crates) want[c.item] = (want[c.item] ?? 0) + c.qty;
    requests.push(block('Delivery truck', `${crates.length} ${crates.length === 1 ? 'crate' : 'crates'} still to fill`, null, table(Object.entries(want).map(([item, n]) => ({ item, want: n })), true), true));
  }
  if (s.boatvisit && !s.boatvisit.done && Object.keys(s.boatvisit.want ?? {}).length) {
    requests.push(block(`Boat visitor (${nameOf(s.boatvisit.theme)})`, `wish list for ${s.boatvisit.day}`, null,
      table(Object.entries(s.boatvisit.want).map(([item, n]) => ({ item, want: n })), true), true));
  }
  const hw = s.helpwanted;
  const hwLeft = (hw?.reqs ?? []).map((r, i) => ({ r, i })).filter(({ i }) => !(hw?.done ?? []).includes(i));
  if (hwLeft.length) {
    requests.push(block('Help Wanted', `requests for ${hw!.day}`, null,
      table(hwLeft.map(({ r }) => ({ item: r.item, star: r.star, want: r.n })), true), true));
  }
  const note = s.woods?.note;
  if (note && !note.done) requests.push(block("Wren's field note", `for ${note.day}`, null, table([{ item: note.item, want: note.n }], true), true));

  // ------------------------------------------------------------------------------------------ Bram's next pickaxe
  let pickaxe: HTMLElement | null = null;
  const nextPick = MINE.pickaxes[(s.mine?.pickaxe ?? 0) + 1];
  if (done.has(MINE.entrance.id) && nextPick) {
    pickaxe = card(`Next pickaxe: ${nextPick.name}`, 'Bram makes it at the Old Mine from bars and coins.',
      table([...Object.entries(nextPick.needs).map(([item, n]) => ({ item, want: n })), { item: 'coins', want: nextPick.coins }], true));
  }

  // ------------------------------------------------------------------------------------------ upgrades (coins)
  const ups: { type: string; name: string; from: number; cost: number; need: number }[] = [];
  for (const b of s.buildings ?? []) {
    const def = BUILDING.get(b.type);
    if (!def) continue;
    if (b.type === 'farmhouse') {
      const lv = FARMHOUSE_LEVELS[b.level];
      if (lv) ups.push({ type: b.type, name: 'Farmhouse', from: b.level, cost: lv.cost, need: lv.playerLevel });
    } else if (b.type === 'vet_cottage' || b.type === 'carpenter') {
      const lv = CARE_LEVELS[b.level - 1];
      if (lv) ups.push({ type: b.type, name: def.name, from: b.level, cost: lv.cost, need: lv.playerLevel });
    } else if (def.cat === 'production' || def.cat === 'animal') {
      const lv = (def.cat === 'production' ? UPGRADE_LEVELS.production : UPGRADE_LEVELS.animal).levels[b.level - 1];
      if (lv) ups.push({ type: b.type, name: def.name, from: b.level, cost: Math.round(lv.cost * (def.upgradeMult ?? 1)), need: def.level + b.level * 2 });
    }
  }
  ups.sort((a, b) => a.cost - b.cost);
  let upgrades: HTMLElement | null = null;
  if (ups.length) {
    const rows = ups.map((u) => {
      const short = Math.max(0, u.cost - coins);
      const check = h('input', { type: 'checkbox', 'aria-label': `Coins for ${u.name}`, onchange: refresh }) as HTMLInputElement;
      const qty = h('input', { class: 'input qty', type: 'number', min: 0, max: 10_000_000, step: 1, value: String(short || u.cost), inputMode: 'numeric', 'aria-label': 'Coins', oninput: refresh }) as HTMLInputElement;
      picks.push({ key: 'coins', label: 'coins', check, qty });
      return h('tr', null, h('td', null, check), h('td', null, ico(u.type), ' ', u.name),
        h('td', { class: 'r' }, `${u.from} to ${u.from + 1}`), h('td', { class: 'r' }, num(u.cost)),
        h('td', null, level < u.need ? badge(`Needs level ${u.need}`, '') : short ? badge(`${num(short)} short`, 'warn') : badge('Can afford', 'good')),
        h('td', { class: 'r' }, qty));
    });
    upgrades = card('Upgrades', `Upgrades cost coins only. They have ${num(coins)} coins. Ticking a row adds that many coins to the gift.`,
      h('table', { class: 'table compact needs-table' },
        h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'Building'), h('th', { class: 'r' }, 'Level'), h('th', { class: 'r' }, 'Cost'), h('th', null, 'Status'), h('th', { class: 'r' }, 'Gift coins'))),
        h('tbody', null, rows)));
  }

  // ------------------------------------------------------------------------------------------ quests (status only)
  const st = s.stats ?? {};
  const questRows = (list: Quest[] | undefined, kind: string) => (list ?? []).map((q) => {
    const got = q.stat && q.target ? Math.min(q.target, Math.max(0, (st[q.stat] ?? 0) - (q.start ?? 0))) : null;
    return h('tr', null, h('td', null, kind), h('td', null, q.text),
      h('td', { style: { width: '30%' } }, got === null ? '' : bar(got / Math.max(1, q.target ?? 1))),
      h('td', { class: 'r' }, got === null ? '' : `${num(got)} / ${num(q.target ?? 0)}`),
      h('td', null, q.claimed ? badge('Claimed', 'good') : got !== null && got >= (q.target ?? 0) ? badge('Ready to claim', 'info') : badge('In progress', '')));
  });
  const qRows = [...questRows(s.quests?.daily, 'Daily'), ...questRows(s.quests?.weekly, 'Weekly')];
  const quests = qRows.length ? card('Quests', 'Quests count what the player does (harvest, sell, fish...), so they cannot be filled with a gift.',
    h('table', { class: 'table compact' }, h('tbody', null, qRows))) : null;

  // ------------------------------------------------------------------------------------------ page
  const bar0 = h('div', { class: 'needs-bar' }, summary, field('Message they will see', msg), sendBtn);
  const head = h('section', { class: 'card' },
    h('h3', null, 'Needs'),
    h('p', null, `From ${o.name}'s cloud save${o.savedAt ? `, saved ${ago(o.savedAt)}` : ''}${o.version ? ` (last played on game ${o.version})` : ''}. Level ${level}, ${num(coins)} coins. ${openRooms} open ${openRooms === 1 ? 'project' : 'projects'}.`),
    o.pendingGifts ? h('p', null, badge('Gift waiting', 'info'), ` ${o.pendingGifts} developer gift(s) not opened yet: what they hold below does not include ${o.pendingGifts === 1 ? 'it' : 'them'}.`) : null,
    h('p', { class: 'muted small' }, 'Missing items are ticked in open projects and today\'s requests (coins never are). Change any number, tick or untick, then press Gift selected. It is sent as a developer gift: it shows under Developer gifts on the Support tab and on the Gifts page.'),
    starOk ? null : h('p', { class: 'muted small' }, `Silver and gold items can only be gifted once they play game ${STAR_GIFTS_FROM} or newer.`));
  refresh();
  return [
    head,
    requests.length ? card("Today's requests", 'Orders, the truck, the boat visitor, Help Wanted and Wren, as of their last save.', ...requests) : null,
    openRooms + lockedBlocks.length ? card('Building projects', 'Every room, wing and stage not finished yet, open ones first.', ...projectCards) : card('Building projects', null, h('p', { class: 'muted' }, 'Every project is finished.')),
    pickaxe, upgrades, quests, bar0,
  ].filter((x): x is HTMLElement => !!x);
}

/** "Gold Strawberry", "Cheese" or "coins" for a gift key */
function keyName(key: string): string {
  if (key === 'coins') return 'coins';
  const m = /^(silver|gold)__(.+)$/.exec(key);
  return m ? `${m[1] === 'gold' ? 'Gold' : 'Silver'} ${ITEMS[m[2]]?.name ?? nameOf(m[2])}` : ITEMS[key]?.name ?? nameOf(key);
}
