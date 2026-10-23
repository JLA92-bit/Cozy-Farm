import { FURNITURE, HOME, HOME_ROOM, ITEMS, PIECE, type PieceDef } from '../../data';
import { pictureIcon, pictureName } from '../../world/home/Pictures';
import { game } from '../../systems/Game';
import { home, nextRoom, openRooms } from '../../systems/Home';
import type { WallStyle } from '../../systems/State';
import { audio } from '../../systems/Audio';
import { pieceGeo, pieceGeoNow, PART_NAMES } from '../../world/home/FurnitureGeo';
import { patternPreview } from '../../world/home/HomeStyle';
import { button, clear, fmt, h, icon, priceTag } from '../dom';
import { ui } from '../UI';
import { openCatalogue } from './Catalogue';

/**
 * 1.29 the home's screens: a banner (room name, back to the farm), a bar of tools at the bottom, a toolbar for the
 * piece in hand, and a sheet that slides up for storage, paint, colours, rooms and saved looks. The sheet leaves the
 * room in view, so every change shows at once.
 */

export interface HomeControls {
  readonly roomId: string;
  readonly selected: number | null;
  readonly snap: number;
  item(): import('../../systems/State').HomeItem | undefined;
  select(uid: number | null): void;
  goRoom(id: string): Promise<void>;
  placeFromStorage(piece: string): Promise<unknown>;
  rotate(dir?: number): void;
  store(): void;
  duplicate(): void;
  toggleLamp(): void;
  turnCamera(dir: number): void;
  setSnap(step: number): void;
  reframe(): void;
  leave(): void;
  frontWalls(): boolean[];
  setViewShift(x: number, y: number): void;
  readonly azimuth: number;
}

type SheetKind = 'storage' | 'paint' | 'colours' | 'rooms' | 'looks' | 'picture' | 'rug';

export const CATS: { id: string; name: string; icon: string }[] = [
  { id: 'all', name: 'All', icon: 'house' }, { id: 'living', name: 'Living', icon: 'couch' }, { id: 'bedroom', name: 'Bedroom', icon: 'bed' },
  { id: 'kitchen', name: 'Kitchen', icon: 'cooking' }, { id: 'bathroom', name: 'Bathroom', icon: 'bathtub' }, { id: 'study', name: 'Study', icon: 'books' },
  { id: 'lights', name: 'Lights', icon: 'light_bulb' }, { id: 'rugs', name: 'Rugs', icon: 'card_box' }, { id: 'plants', name: 'Plants', icon: 'potted_plant' },
  { id: 'decor', name: 'Decor', icon: 'framed' },
];

/** The piece's thumbnail. */
export const pieceIcon = (def: PieceDef, cls = 'icon'): HTMLImageElement => icon(def.icon ?? `model:${def.model}`, cls);

/** Colours copied with "Copy style", ready to paste on another piece. */
let clipboard: { piece: string; colours: Record<string, string> } | null = null;

export class HomeUI {
  private banner: HTMLElement;
  private bar: HTMLElement;
  private pieceBar: HTMLElement;
  private sheet: HTMLElement;
  private sheetBody: HTMLElement;
  private sheetTitle: HTMLElement;
  private sheetKind: SheetKind | null = null;
  private storageCat = 'all';
  private paintTab: 'walls' | 'lower' | 'floor' | 'trim' = 'walls';
  private paintWall: 'all' | 'left' | 'right' | 'front' = 'all';
  private part: string | null = null;
  private offs: (() => void)[] = [];

  constructor(private c: HomeControls) {
    this.banner = h('div', { class: 'visit-banner visit-keep sq-keep hm-banner' });
    this.bar = h('div', { class: 'hm-bar sq-keep', role: 'toolbar', 'aria-label': 'Home tools' });
    this.pieceBar = h('div', { class: 'hm-piece sq-keep', role: 'toolbar', 'aria-label': 'The piece in your hands' });
    this.sheetTitle = h('div', { class: 'hm-sheet-title outlined' });
    this.sheetBody = h('div', { class: 'hm-sheet-body' });
    this.sheet = h('div', { class: 'hm-sheet sq-keep', role: 'dialog' },
      h('div', { class: 'hm-sheet-head' }, this.sheetTitle, button('✕', () => this.closeSheet(), 'red small hm-close', { 'aria-label': 'Close' })),
      this.sheetBody);
    this.offs.push(game.bus.on('home:changed', () => this.refreshSoon()), game.bus.on('coins', () => { if (this.sheetKind === 'rooms') this.refreshSoon(); }));
    this.refresh();
  }

  elements(): HTMLElement[] { return [this.banner, this.sheet, this.pieceBar, this.bar]; }

  destroy(): void {
    this.c.setViewShift(0, 0);
    for (const off of this.offs) off();
    for (const el of this.elements()) el.remove();
  }

  private pending = false;
  private refreshSoon(): void {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => { this.pending = false; this.refresh(); });
  }

  refresh(): void {
    this.renderBanner();
    this.renderBar();
    this.renderPiece();
    if (this.sheetKind) this.renderSheet();
  }

  onSelect(): void {
    this.part = null;
    this.rugKindPicked = false;
    this.renderPiece();
    if ((this.sheetKind === 'colours' || this.sheetKind === 'picture' || this.sheetKind === 'rug') && !this.c.item()) this.closeSheet();
    else if (this.sheetKind === 'rug') { if (PIECE[this.c.item()!.f].patterned) this.renderSheet(); else this.closeSheet(); }
    else if (this.sheetKind === 'colours') this.renderSheet();
    else if (this.sheetKind === 'picture') { if (PIECE[this.c.item()!.f].picture) this.renderSheet(); else this.closeSheet(); }
    else if (this.c.selected !== null && this.sheetKind && this.sheetKind !== 'storage') this.closeSheet();
  }

  // ------------------------------------------------------------------------------------------- banner and bars

  private renderBanner(): void {
    clear(this.banner);
    const room = home.room(this.c.roomId);
    const n = room?.items.length ?? 0;
    const size = HOME.sizes[room?.size ?? 0];
    this.banner.append(
      h('div', { class: 'visit-title' },
        h('div', { class: 'visit-name outlined' }, home.roomName(this.c.roomId)),
        h('div', { class: 'visit-sub' }, h('span', null, `${size.name} room, ${size.w} by ${size.d} m`), h('span', null, `${n} ${n === 1 ? 'piece' : 'pieces'}`))),
      button([icon('house'), h('span', null, 'Back to the farm')], () => this.c.leave(), 'green visit-home', { 'aria-label': 'Back to your farm' }));
  }

  private renderBar(): void {
    clear(this.bar);
    const tool = (label: string, ic: string, fn: () => void, cls = '', attrs: Record<string, string> = {}) =>
      button([icon(ic), h('span', { class: 'hm-tool-label' }, label)], fn, `hm-tool ${cls}`, { 'aria-label': label, ...attrs });
    const stored = home.storedTotal();
    this.bar.append(
      tool('Storage', 'package', () => this.toggleSheet('storage'), this.sheetKind === 'storage' ? 'on' : '', stored ? { 'data-count': String(Math.min(99, stored)) } : {}),
      tool('Catalogue', 'store', () => openCatalogue(this.c)),
      tool('Paint', 'paintbrush', () => this.toggleSheet('paint'), this.sheetKind === 'paint' ? 'on' : ''),
      tool('Rooms', 'door', () => this.toggleSheet('rooms'), this.sheetKind === 'rooms' ? 'on' : ''),
      tool('Looks', 'floppy', () => this.toggleSheet('looks'), this.sheetKind === 'looks' ? 'on' : ''),
      h('span', { class: 'hm-sep' }),
      tool('Undo', 'undo', () => { if (home.undo(this.c.roomId)) audio.play('tap'); }, home.canUndo(this.c.roomId) ? '' : 'dim'),
      tool('Redo', 'redo', () => { if (home.redo(this.c.roomId)) audio.play('tap'); }, home.canRedo(this.c.roomId) ? '' : 'dim'),
      tool('Turn', 'rotate', () => this.c.turnCamera(1)),
    );
  }

  private renderPiece(): void {
    clear(this.pieceBar);
    const it = this.c.item();
    this.pieceBar.classList.toggle('show', !!it);
    if (!it) return;
    const def = PIECE[it.f];
    const act = (label: string, ic: string, fn: () => void, cls = '') => button([icon(ic), h('span', { class: 'hm-tool-label' }, label)], fn, `hm-tool ${cls}`, { 'aria-label': label });
    this.pieceBar.append(
      h('div', { class: 'hm-piece-name' }, pieceIcon(def, 'icon hm-piece-icon'), h('span', null, def.name)),
      h('div', { class: 'hm-piece-tools' },
        act(def.kind === 'wall' ? 'Next wall' : 'Turn', 'rotate', () => this.c.rotate(1)),
        act('Colours', 'paint', () => this.toggleSheet('colours'), this.sheetKind === 'colours' ? 'on' : ''),
        ...(def.picture ? [act('Picture', 'framed', () => this.toggleSheet('picture'), this.sheetKind === 'picture' ? 'on' : '')] : []),
        ...(def.patterned ? [act('Pattern', 'paintbrush', () => this.toggleSheet('rug'), this.sheetKind === 'rug' ? 'on' : '')] : []),
        act('Copy', 'crayon', () => { clipboard = { piece: it.f, colours: { ...(it.c ?? {}) } }; ui.feedback.toast('Style copied', 'Pick another piece and tap Paste.', 'crayon'); this.renderPiece(); }),
        ...(clipboard ? [act('Paste', 'magic_wand', () => this.paste())] : []),
        act('Another', 'plus', () => this.c.duplicate()),
        ...(def.lamp ? [act(it.off ? 'Light on' : 'Light off', 'light_bulb', () => this.c.toggleLamp(), it.off ? 'dim' : '')] : []),
        act('Put away', 'package', () => this.c.store()),
        act('Done', 'check', () => this.c.select(null), 'done')));
  }

  /** Paste copied colours: parts with the same name take the copied colour (a tint goes to a tint). */
  private paste(): void {
    const it = this.c.item();
    if (!it || !clipboard) return;
    const geo = pieceGeoNow(it.f);
    const parts = geo?.parts ?? [];
    const next: Record<string, string> = { ...(it.c ?? {}) };
    let n = 0;
    for (const [k, v] of Object.entries(clipboard.colours)) if (parts.includes(k)) { next[k] = v; n++; }
    // a one-finish piece takes the first copied colour as its tint
    if (!n && parts.includes('tint')) { const first = Object.values(clipboard.colours)[0]; if (first) { next.tint = first; n++; } }
    if (!n) { ui.feedback.toast('Nothing to paste', 'These two pieces have no parts in common.', 'crayon', 'warn'); return; }
    home.setColours(this.c.roomId, it.u, next);
    audio.play('pop', { volume: 0.6 });
  }

  // ------------------------------------------------------------------------------------------- the sheet

  private toggleSheet(kind: SheetKind): void {
    if (this.sheetKind === kind) { this.closeSheet(); return; }
    this.sheetKind = kind;
    this.sheet.classList.add('show');
    this.renderSheet();
    this.renderBar();
    this.renderPiece();
    this.shiftView();
  }

  closeSheet(): void {
    this.sheetKind = null;
    this.sheet.classList.remove('show');
    this.renderBar();
    this.renderPiece();
    this.shiftView();
  }

  /** Keep the room in the free part of the screen while the sheet is open (above it, or beside it in landscape). */
  private shiftView(): void {
    if (!this.sheetKind) { this.c.setViewShift(0, 0); return; }
    requestAnimationFrame(() => {
      const r = this.sheet.getBoundingClientRect();
      const W = window.innerWidth, H = window.innerHeight;
      if (r.left > W * 0.3) this.c.setViewShift((W - r.left) / 2 / W, 0);
      else this.c.setViewShift(0, (H - r.top) / 2 / H * 0.85);
    });
  }

  private renderSheet(): void {
    const keep = this.sheetBody.scrollTop;
    clear(this.sheetBody);
    switch (this.sheetKind) {
      case 'storage': this.sheetTitle.textContent = 'Storage'; this.storage(); break;
      case 'paint': this.sheetTitle.textContent = 'Paint and paper'; this.paint(); break;
      case 'colours': this.sheetTitle.textContent = 'Colours'; this.colours(); break;
      case 'rooms': this.sheetTitle.textContent = 'Rooms'; this.rooms(); break;
      case 'looks': this.sheetTitle.textContent = 'Saved looks'; this.looks(); break;
      case 'picture': this.sheetTitle.textContent = 'What it shows'; this.picture(); break;
      case 'rug': this.sheetTitle.textContent = 'Rug pattern'; this.rugPattern(); break;
    }
    this.sheetBody.scrollTop = keep;
  }

  private chips<T extends string>(list: { id: T; name: string; icon?: string }[], cur: T, pick: (id: T) => void): HTMLElement {
    return h('div', { class: 'hm-chips' }, ...list.map((x) => h('button', { class: `hm-chip${x.id === cur ? ' on' : ''}`, type: 'button', onclick: () => pick(x.id) }, x.icon ? icon(x.icon) : null, x.name)));
  }

  private storage(): void {
    const st = home.state.storage;
    const ids = Object.keys(st).filter((k) => PIECE[k] && (this.storageCat === 'all' || PIECE[k].cat === this.storageCat));
    const cats = CATS.filter((c) => c.id === 'all' || Object.keys(st).some((k) => PIECE[k]?.cat === c.id));
    this.sheetBody.append(this.chips(cats, this.storageCat, (id) => { this.storageCat = id; this.renderSheet(); }));
    if (!ids.length) {
      this.sheetBody.append(h('div', { class: 'hm-empty' }, Object.keys(st).length ? 'Nothing of that kind in storage.' : 'Storage is empty. Buy furniture in the Catalogue, or put pieces away here.',
        button([icon('store'), ' Open the Catalogue'], () => openCatalogue(this.c), 'small yellow')));
      return;
    }
    const grid = h('div', { class: 'hm-grid' });
    for (const id of ids.sort((a, b) => PIECE[a].name.localeCompare(PIECE[b].name))) {
      const def = PIECE[id];
      grid.append(h('button', { class: 'hm-card', type: 'button', 'aria-label': `Place ${def.name}`, onclick: async () => { const it = await this.c.placeFromStorage(id); if (it && window.innerHeight < 520) this.closeSheet(); } },
        pieceIcon(def, 'hm-card-img'), h('span', { class: 'hm-card-name' }, def.name), h('span', { class: 'hm-count outlined' }, `x${st[id]}`)));
    }
    this.sheetBody.append(h('div', { class: 'hm-hint' }, 'Tap a piece to put it in the room.'), grid);
  }

  // ---------------------------------------------------------------------------------- paint

  /** Which walls the paint goes on: all, the standing left/right ones, or the two cut-away ones in front. */
  private wallTargets(): number[] {
    const front = this.c.frontWalls();
    const standing = [0, 1, 2, 3].filter((i) => !front[i]);
    const cut = [0, 1, 2, 3].filter((i) => front[i]);
    // left and right as you look at the room
    const az = this.c.azimuth;
    const side = (i: number) => { const n = [[0, 1], [-1, 0], [0, -1], [1, 0]][i]; return -n[0] * Math.cos(az) + n[1] * Math.sin(az); };
    const [left, right] = standing.sort((a, b) => side(a) - side(b));
    switch (this.paintWall) {
      case 'left': return [left];
      case 'right': return [right];
      case 'front': return cut;
      default: return [0, 1, 2, 3];
    }
  }

  private paint(): void {
    const room = home.room(this.c.roomId);
    if (!room) return;
    this.sheetBody.append(this.chips([
      { id: 'walls', name: 'Walls', icon: 'bricks' }, { id: 'lower', name: 'Lower walls', icon: 'ruler' }, { id: 'floor', name: 'Floor', icon: 'card_box' }, { id: 'trim', name: 'Trim and beams', icon: 'hammer' },
    ] as const, this.paintTab, (id) => { this.paintTab = id; this.renderSheet(); }));
    const id = this.c.roomId;
    if (this.paintTab === 'walls') {
      this.sheetBody.append(this.chips([{ id: 'all', name: 'All walls' }, { id: 'left', name: 'Left wall' }, { id: 'right', name: 'Right wall' }, { id: 'front', name: 'Front walls' }] as const, this.paintWall, (w) => { this.paintWall = w; this.renderSheet(); }));
      const targets = this.wallTargets();
      const cur = room.walls[targets[0]];
      const set = (s: WallStyle) => { for (const t of targets) home.setWall(id, t, s, t === targets[0]); };
      this.styleEditor('wall', cur, set);
    } else if (this.paintTab === 'lower') {
      const w = room.wainscot;
      this.sheetBody.append(h('div', { class: 'hm-row' },
        h('label', { class: 'hm-switch' }, h('input', { type: 'checkbox', checked: !!w, onchange: (e: Event) => home.setWainscot(id, (e.target as HTMLInputElement).checked ? { p: 'panelling', a: '#f7f1e3', b: '#e7d3b3', h: 0.4 } : null) }), ' Give the lower walls their own look')));
      if (w) {
        this.sheetBody.append(h('div', { class: 'hm-row' }, h('span', { class: 'hm-label' }, 'Height'),
          h('input', { type: 'range', min: '20', max: '70', value: String(Math.round(w.h * 100)), class: 'hm-range', 'aria-label': 'Lower wall height', onchange: (e: Event) => home.setWainscot(id, { ...w, h: Number((e.target as HTMLInputElement).value) / 100 }) })));
        this.styleEditor('wall', [w.p, w.a, w.b], (s) => home.setWainscot(id, { p: s[0], a: s[1], b: s[2], h: w.h }));
      }
    } else if (this.paintTab === 'floor') {
      this.styleEditor('floor', room.floor, (s) => home.setFloor(id, s));
    } else {
      this.sheetBody.append(h('div', { class: 'hm-label' }, 'Skirting, rails and beams'), this.palette(room.trim, (c) => home.setTrim(id, c)));
      this.sheetBody.append(h('div', { class: 'hm-label' }, 'Cornice along the top'), this.palette(room.ceiling, (c) => home.setCeiling(id, c)));
      this.sheetBody.append(h('div', { class: 'hm-row' },
        h('label', { class: 'hm-switch' }, h('input', { type: 'checkbox', checked: !!room.beams, onchange: (e: Event) => home.setBeams(id, (e.target as HTMLInputElement).checked) }), ' Exposed beams and posts')));
      this.sheetBody.append(h('div', { class: 'hm-row' }, button([icon('undo'), ' Back to how the room started'], () => home.resetLook(id), 'small grey')));
    }
  }

  /** Pattern previews, then the two colours. */
  private styleEditor(kind: 'wall' | 'floor', cur: WallStyle, set: (s: WallStyle) => void): void {
    const list = kind === 'wall' ? HOME.wallPatterns : HOME.floorPatterns;
    const grid = h('div', { class: 'hm-patterns' });
    for (const p of list) {
      grid.append(h('button', { class: `hm-pattern${p.id === cur[0] ? ' on' : ''}`, type: 'button', 'aria-label': p.name, onclick: () => set([p.id, cur[1], cur[2]]) },
        h('img', { src: patternPreview(kind, p.id, cur[1], cur[2]), alt: '' }), h('span', null, p.name)));
    }
    this.sheetBody.append(h('div', { class: 'hm-label' }, 'Pattern'), grid,
      h('div', { class: 'hm-label' }, 'Main colour'), this.palette(cur[1], (c) => set([cur[0], c, cur[2]])),
      h('div', { class: 'hm-label' }, 'Second colour'), this.palette(cur[2], (c) => set([cur[0], cur[1], c])));
  }

  /** The palette, plus any colour at all. */
  private palette(cur: string, pick: (c: string) => void): HTMLElement {
    const row = h('div', { class: 'hm-palette' });
    for (const col of HOME.palette) {
      row.append(h('button', { class: `hm-swatch${col === cur ? ' on' : ''}`, type: 'button', style: `background:${col}`, 'aria-label': `Colour ${col}`, onclick: () => pick(col) }));
    }
    const custom = h('input', { type: 'color', value: cur, class: 'hm-custom', 'aria-label': 'Any colour', onchange: (e: Event) => pick((e.target as HTMLInputElement).value.toLowerCase()) });
    row.append(h('label', { class: `hm-swatch hm-any${HOME.palette.includes(cur) ? '' : ' on'}`, title: 'Any colour', style: HOME.palette.includes(cur) ? '' : `background:${cur}` }, custom, icon('paint')));
    return row;
  }

  // ---------------------------------------------------------------------------------- piece colours

  private colours(): void {
    const it = this.c.item();
    if (!it) return;
    const def = PIECE[it.f];
    const geo = pieceGeoNow(it.f);
    if (!geo) { void pieceGeo(it.f).then(() => this.renderSheet()); return; }
    const parts = geo.parts;
    this.part ??= parts[0];
    const cols = it.c ?? {};
    const chips = h('div', { class: 'hm-chips' });
    parts.forEach((p, i) => {
      const col = cols[p] ?? geo.defaults[i];
      chips.append(h('button', { class: `hm-chip${p === this.part ? ' on' : ''}`, type: 'button', onclick: () => { this.part = p; this.renderSheet(); } },
        h('span', { class: 'hm-dot', style: `background:${col}` }), PART_NAMES[p] ?? p));
    });
    const i = parts.indexOf(this.part);
    const cur = cols[this.part] ?? geo.defaults[Math.max(0, i)];
    const roomId = this.c.roomId;
    this.sheetBody.append(h('div', { class: 'hm-label' }, `${def.name}: pick a part, then a colour`), chips,
      this.palette(cur, (c) => home.setColours(roomId, it.u, { ...(it.c ?? {}), [this.part!]: c })),
      h('div', { class: 'hm-row hm-buttons' },
        button('Own colours', () => home.setColours(roomId, it.u, null), 'small grey'),
        button('Same on every one here', () => {
          const room = home.room(roomId);
          const same = room?.items.filter((x) => x.f === it.f && x.u !== it.u) ?? [];
          for (const [k, x] of same.entries()) home.setColours(roomId, x.u, it.c ?? null, k === 0);
          ui.feedback.toast(same.length ? 'Matched' : 'Only this one', same.length ? `${same.length} more ${same.length === 1 ? 'piece' : 'pieces'} in these colours.` : 'There are no others of this piece in the room.', 'paint');
        }, 'small blue')));
  }

  // ---------------------------------------------------------------------------------- patterned rugs

  private rugKind: 'floor' | 'wall' = 'floor';
  /** 1.30 any floor or wall pattern on a rug, in two colours (the border colour is under Colours). */
  private rugPattern(): void {
    const it = this.c.item();
    if (!it) return;
    const [kind, id] = (it.pat ?? 'floor:checker').split(':') as ['floor' | 'wall', string];
    if (this.rugKind !== kind && !this.rugKindPicked) this.rugKind = kind;
    this.sheetBody.append(this.chips([{ id: 'floor', name: 'Floor patterns', icon: 'card_box' }, { id: 'wall', name: 'Wallpaper patterns', icon: 'bricks' }] as const, this.rugKind, (k) => { this.rugKind = k; this.rugKindPicked = true; this.renderSheet(); }));
    const cur: WallStyle = [this.rugKind === kind ? id : (this.rugKind === 'floor' ? HOME.floorPatterns : HOME.wallPatterns)[0].id, it.c?.a ?? '#f3e3c3', it.c?.b ?? '#c0473b'];
    const roomId = this.c.roomId;
    this.styleEditor(this.rugKind, cur, (s) => home.setRugPattern(roomId, it.u, `${this.rugKind}:${s[0]}`, s[1], s[2]));
    this.sheetBody.append(h('div', { class: 'hm-hint' }, 'The border colour is under Colours.'));
  }
  private rugKindPicked = false;

  // ---------------------------------------------------------------------------------- pictures

  /** A frame or plaque: a painting, a Wildlife Album photo, a fish you caught or a find from the barn or Museum. */
  private picture(): void {
    const it = this.c.item();
    if (!it) return;
    const st = game.state;
    const groups: { name: string; shows: string[] }[] = [
      { name: 'Wildlife Album photos', shows: Object.keys(st.wildlife?.photos ?? {}).map((k) => `wild:${k}`) },
      { name: 'Fish you have caught', shows: Object.keys(st.fishing?.caught ?? {}).filter((k) => ITEMS[k]).map((k) => `item:${k}`) },
      { name: 'Museum finds', shows: [...new Set(Object.values(st.museum?.donated ?? {}).flat())].filter((k) => ITEMS[k]).map((k) => `item:${k}`) },
      { name: 'From your barn', shows: Object.keys(st.inventory).filter((k) => ITEMS[k] && st.inventory[k] > 0).map((k) => `item:${k}`) },
    ];
    const pick = (show: string | null) => { home.setShow(this.c.roomId, it.u, show); audio.play('pop', { volume: 0.5 }); };
    const tile = (show: string | null) => h('button', { class: `hm-card hm-pic${(it.show ?? null) === show ? ' on' : ''}`, type: 'button', 'aria-label': pictureName(show ?? undefined), onclick: () => pick(show) },
      show ? icon(pictureIcon(show) ?? 'framed', 'hm-card-img') : icon('framed', 'hm-card-img'), h('span', { class: 'hm-card-name' }, pictureName(show ?? undefined)));
    this.sheetBody.append(h('div', { class: 'hm-grid' }, tile(null)));
    for (const g of groups) {
      if (!g.shows.length) continue;
      const grid = h('div', { class: 'hm-grid' });
      for (const show of g.shows.slice(0, 80)) grid.append(tile(show));
      this.sheetBody.append(h('div', { class: 'hm-label' }, g.name), grid);
    }
    if (!groups.some((g) => g.shows.length)) this.sheetBody.append(h('div', { class: 'hm-hint' }, 'Photograph wildlife, catch fish and fill the Museum to have more to hang.'));
  }

  // ---------------------------------------------------------------------------------- rooms

  private rooms(): void {
    const cur = this.c.roomId;
    const list = h('div', { class: 'hm-rooms' });
    for (const r of openRooms()) {
      list.append(h('button', { class: `hm-room${r.id === cur ? ' on' : ''}`, type: 'button', onclick: () => void this.c.goRoom(r.id) }, icon(r.icon), h('span', null, home.roomName(r.id))));
    }
    const next = nextRoom();
    if (next) list.append(h('div', { class: 'hm-room locked' }, icon('lock'), h('span', null, `${next.name}: Farmhouse level ${next.fh}`)));
    this.sheetBody.append(list);
    // this room: its name, size and a few big tools
    const name = h('input', { type: 'text', class: 'hm-input', maxlength: '24', value: home.roomName(cur), 'aria-label': 'Room name', onchange: (e: Event) => home.rename(cur, (e.target as HTMLInputElement).value) });
    this.sheetBody.append(h('div', { class: 'hm-label' }, 'This room'), h('div', { class: 'hm-row' }, h('span', { class: 'hm-label' }, 'Name'), name));
    const cost = home.enlargeCost(cur);
    const room = home.room(cur);
    if (room) {
      const size = HOME.sizes[room.size];
      const up = cost !== null ? HOME.sizes[room.size + 1] : null;
      this.sheetBody.append(h('div', { class: 'hm-row' }, h('span', null, `${size.name}: ${size.w} by ${size.d} m.`),
        up ? button([`Make it ${up.name.toLowerCase()}`, priceTag(cost!)], () => {
          if (!home.enlarge(cur)) { ui.feedback.toast('Not enough coins', undefined, 'cross'); audio.play('error'); return; }
          audio.play('reward');
          ui.feedback.toast(`${up.name} ${home.roomName(cur).toLowerCase()}`, `Now ${up.w} by ${up.d} metres.`, 'house');
          this.c.reframe();
        }, `small ${game.coins >= cost! ? 'yellow' : 'disabled'}`) : h('span', { class: 'muted' }, 'As big as it gets.')));
      const shift = (dx: number, dz: number) => () => home.shiftAll(cur, dx, dz);
      this.sheetBody.append(h('div', { class: 'hm-row' }, h('span', { class: 'hm-label' }, 'Move everything'),
        button('◀', shift(-0.25, 0), 'small grey', { 'aria-label': 'Everything west' }), button('▲', shift(0, -0.25), 'small grey', { 'aria-label': 'Everything north' }),
        button('▼', shift(0, 0.25), 'small grey', { 'aria-label': 'Everything south' }), button('▶', shift(0.25, 0), 'small grey', { 'aria-label': 'Everything east' })));
      this.sheetBody.append(h('div', { class: 'hm-row' },
        h('span', { class: 'hm-label' }, 'Moves'),
        button('Grid', () => { this.c.setSnap(0.125); this.renderSheet(); }, `small ${this.c.snap >= 0.125 ? 'green' : 'grey'}`),
        button('Fine', () => { this.c.setSnap(0.025); this.renderSheet(); }, `small ${this.c.snap < 0.125 ? 'green' : 'grey'}`)));
      this.sheetBody.append(h('div', { class: 'hm-row' }, button([icon('package'), ' Put everything away'], () => {
        const n = home.clearRoom(cur);
        if (n) ui.feedback.toast('Room cleared', `${n} pieces went to storage. Undo brings them back.`, 'package');
      }, 'small red')));
    }
  }

  // ---------------------------------------------------------------------------------- looks

  private looks(): void {
    const id = this.c.roomId;
    const room = home.room(id);
    if (!room) return;
    this.sheetBody.append(h('div', { class: 'hm-hint' }, 'Keep up to three looks for this room: the walls, the floor and every piece where it stands. Switch between them any time.'));
    for (let slot = 0; slot < 3; slot++) {
      const look = room.looks?.[slot];
      const name = h('input', { type: 'text', class: 'hm-input', maxlength: '24', placeholder: `Look ${slot + 1}`, value: look?.name ?? '', 'aria-label': `Name for look ${slot + 1}` });
      this.sheetBody.append(h('div', { class: 'card hm-look' },
        h('div', { class: 'hm-row' }, h('span', { class: 'hm-slot outlined' }, String(slot + 1)), name),
        h('div', { class: 'sub' }, look ? `${look.items.length} pieces` : 'Empty'),
        h('div', { class: 'hm-row hm-buttons' },
          button(look ? 'Save over it' : 'Save the room as it is', () => {
            if (!home.saveLook(id, slot, name.value)) { ui.feedback.toast('Too many saved pieces', `Saved looks hold up to ${HOME.lookItems} pieces across the whole home. Delete a look you no longer need.`, 'floppy', 'warn'); audio.play('error'); return; }
            audio.play('reward', { volume: 0.5 }); ui.feedback.toast('Look saved', name.value || `Look ${slot + 1}`, 'floppy');
          }, 'small green'),
          ...(look ? [
            button('Use this look', () => {
              const missing = home.applyLook(id, slot);
              audio.play('pop');
              ui.feedback.toast(look.name, missing ? `${missing} pieces were not in storage and were left out.` : 'The room is back the way you saved it.', 'floppy');
            }, 'small yellow'),
            button('Delete', () => home.deleteLook(id, slot), 'small red'),
          ] : []))));
    }
  }
}

/** For the catalogue: every piece of a category that can be shown. */
export const piecesOf = (cat: string): PieceDef[] => FURNITURE.filter((p) => cat === 'all' || p.cat === cat);
export { fmt, HOME_ROOM };
