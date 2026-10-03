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

export function fmt(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K`;
  return Math.floor(n).toLocaleString('en-US');
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
