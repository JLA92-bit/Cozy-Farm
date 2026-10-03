import { assetUrl, assets } from '../core/Assets';
import { ITEMS } from '../data';
import { thumbs } from '../world/Thumbs';

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown> & { class?: string; style?: string | Partial<CSSStyleDeclaration>; onclick?: (e: MouseEvent) => void };

/** Tiny hyperscript helper. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style') {
        if (typeof v === 'string') el.setAttribute('style', v);
        else Object.assign(el.style, v);
      } else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else if (k === 'html') el.innerHTML = String(v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el: HTMLElement, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'number' ? String(c) : c);
  }
}

export function clear(el: HTMLElement): HTMLElement { el.replaceChildren(); return el; }

/** <img> for an icon key; 'model:<id>' keys render a 3D thumbnail asynchronously. */
export function icon(key: string, cls = 'icon'): HTMLImageElement {
  const img = h('img', { class: cls, alt: '', draggable: 'false', decoding: 'async' });
  setIcon(img, key);
  return img;
}

export function setIcon(img: HTMLImageElement, key: string): void {
  if (key.startsWith('model:') || key.startsWith('building:')) {
    img.src = TRANSPARENT;
    void thumbs.get(key).then((url) => { if (url) img.src = url; });
  } else {
    const path = assets.manifest?.icons[key];
    img.src = path ? assetUrl(path) : TRANSPARENT;
  }
}

export const itemIcon = (item: string, cls = 'icon'): HTMLImageElement => icon(ITEMS[item]?.icon ?? 'package', cls);

const TRANSPARENT = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * Friendly number: exact with separators below 100,000 (players care about every coin early on),
 * then compact (123K, 1.2M, 12M). Compact values round down so we never show more than you have.
 */
export function fmt(n: number): string {
  const v = Math.floor(n);
  if (v < 0) return `-${fmt(-v)}`;
  if (v >= 1e9) return `${trim(Math.floor(v / 1e8) / 10)}B`;
  if (v >= 1e6) return `${trim(Math.floor(v / (v >= 1e7 ? 1e6 : 1e5)) / (v >= 1e7 ? 1 : 10))}M`;
  if (v >= 1e5) return `${Math.floor(v / 1e3)}K`;
  return v.toLocaleString('en-US');
}
const trim = (x: number): string => (Number.isInteger(x) ? String(x) : x.toFixed(1));

/** Badge text for counters on buttons: "", "2"... "9+". */
export function badgeText(n: number | boolean): string {
  if (typeof n !== 'number' || n <= 1) return '';
  return n > 9 ? '9+' : String(n);
}

/** Button helper with press feedback. */
export function button(label: Child | Child[], onClick: () => void, cls = '', attrs: Attrs = {}): HTMLButtonElement {
  const b = h('button', { class: `btn ${cls}`, type: 'button', ...attrs });
  append(b, Array.isArray(label) ? label : [label]);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (b.disabled) return;
    uiHooks.press?.();
    onClick();
  });
  return b;
}

export function priceTag(coins: number, gems = 0, tokens?: { n: number; icon: string }): HTMLElement {
  const span = h('span', { class: 'price' });
  if (tokens) span.append(icon(tokens.icon), String(tokens.n));
  else if (gems) span.append(icon('gem'), fmt(gems));
  else if (coins) span.append(icon('coin'), fmt(coins));
  else span.append('Free');
  return span;
}

/** Hooks the UI manager fills in (sound on press etc.). */
export const uiHooks: { press?: () => void } = {};

/** innerHTML with live values (timers, progress) blanked, to detect real content changes. */
function structure(el: HTMLElement): string {
  const c = el.cloneNode(true) as HTMLElement;
  c.querySelectorAll('.timer-tag, .progress .label, .live').forEach((e) => { e.textContent = ''; });
  c.querySelectorAll('.progress .fill').forEach((e) => { (e as HTMLElement).style.width = ''; });
  c.querySelectorAll('img').forEach((e) => e.removeAttribute('src')); // thumbnails load asynchronously
  return c.innerHTML;
}

/**
 * Re-render panel containers periodically without replacing DOM under the player's finger:
 * if only timers/progress changed, the old nodes stay and just their live values are updated.
 */
export function stableRefresh(containers: HTMLElement[], render: () => void): void {
  const old = containers.map((c) => ({ c, nodes: [...c.childNodes], sig: structure(c), display: c.style.display }));
  render();
  const same = old.every((o) => structure(o.c) === o.sig);
  if (!same) return;
  for (const o of old) {
    const fresh = o.c;
    const timers = [...fresh.querySelectorAll('.timer-tag, .progress .label, .live')].map((e) => e.textContent);
    const fills = [...fresh.querySelectorAll('.progress .fill')].map((e) => (e as HTMLElement).style.width);
    fresh.replaceChildren(...o.nodes);
    fresh.style.display = o.display;
    fresh.querySelectorAll('.timer-tag, .progress .label, .live').forEach((e, i) => { if (timers[i] !== undefined) e.textContent = timers[i]; });
    fresh.querySelectorAll('.progress .fill').forEach((e, i) => { if (fills[i] !== undefined) (e as HTMLElement).style.width = fills[i]; });
  }
}
