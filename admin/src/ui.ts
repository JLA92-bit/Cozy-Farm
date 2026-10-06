/** Small DOM helpers for the dashboard. */
type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k in el && k !== 'list' && k !== 'form') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(typeof c === 'number' ? String(c) : c);
  return el;
}

export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...children: (SVGElement | string)[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) el.append(c);
  return el;
}

export const clear = (el: Element): void => { while (el.firstChild) el.firstChild.remove(); };

const nf = new Intl.NumberFormat('en-GB');
export const num = (n: number | null | undefined): string => nf.format(Math.round(n ?? 0));
export const compact = (n: number): string => n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}m` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : num(n);
export const pct = (a: number, b: number): string => (b > 0 ? `${Math.round((a / b) * 100)}%` : '-');
export const bytes = (n: number): string => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`;
export const minutes = (m: number): string => m >= 120 ? `${(m / 60).toFixed(m >= 6000 ? 0 : 1)} h` : `${Math.round(m)} min`;

export function date(s: string | null | undefined, withTime = false): string {
  if (!s) return '-';
  const d = new Date(s.length === 10 ? `${s}T00:00:00Z` : s);
  return withTime
    ? d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: s.length === 10 ? 'UTC' : undefined });
}

export function ago(s: string | null | undefined): string {
  if (!s) return 'never';
  const t = s.length === 10 ? Date.parse(`${s}T12:00:00Z`) : Date.parse(s);
  const sec = (Date.now() - t) / 1000;
  if (s.length === 10) {
    const days = Math.round((Date.parse(new Date().toISOString().slice(0, 10)) - Date.parse(s)) / 864e5);
    return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  }
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} h ago`;
  const d = Math.floor(sec / 86400);
  return d === 1 ? 'yesterday' : d < 60 ? `${d} days ago` : date(s);
}

// ------------------------------------------------------------------------------------------ toasts

let toastBox: HTMLElement | null = null;
export function toast(text: string, kind: 'ok' | 'err' | 'info' = 'ok'): void {
  toastBox ??= document.body.appendChild(h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }));
  const t = h('div', { class: `toast ${kind}` }, h('span', { class: 'toast-icon', 'aria-hidden': 'true' }, kind === 'err' ? '!' : kind === 'info' ? 'i' : '✓'), text);
  toastBox.append(t);
  setTimeout(() => t.classList.add('out'), kind === 'err' ? 6500 : 3500);
  setTimeout(() => t.remove(), kind === 'err' ? 7000 : 4000);
}

export function fail(e: unknown): void { toast((e as Error)?.message || String(e), 'err'); }

// ------------------------------------------------------------------------------------------ dialogs

/** A modal dialog. Resolves with the button value (or null when dismissed). */
export function modal(title: string, body: Child | Child[], buttons: { label: string; value: string; kind?: string }[] = [{ label: 'Close', value: 'close' }], wide = false): Promise<string | null> {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: `modal${wide ? ' wide' : ''}` });
    const done = (v: string | null) => { dlg.close(); dlg.remove(); resolve(v); };
    dlg.append(
      h('div', { class: 'modal-head' }, h('h2', null, title), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => done(null) }, '×')),
      h('div', { class: 'modal-body' }, body),
      h('div', { class: 'modal-foot' }, buttons.map((b) => h('button', { class: `btn ${b.kind ?? ''}`, onclick: () => done(b.value) }, b.label))),
    );
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

export async function confirmAction(title: string, text: string, ok = 'Yes', kind = 'danger'): Promise<boolean> {
  return (await modal(title, h('p', null, text), [{ label: 'Cancel', value: 'no' }, { label: ok, value: 'yes', kind }])) === 'yes';
}

/** Confirmation that needs a word typed, for things that cannot be undone. */
export async function confirmTyped(title: string, text: string, word: string): Promise<boolean> {
  const input = h('input', { class: 'input', placeholder: word, 'aria-label': `Type ${word} to confirm`, autocomplete: 'off' });
  const r = await modal(title, [h('p', null, text), h('p', { class: 'muted' }, `Type ${word} to confirm.`), input], [{ label: 'Cancel', value: 'no' }, { label: 'Delete for good', value: 'yes', kind: 'danger' }]);
  return r === 'yes' && input.value.trim().toUpperCase() === word.toUpperCase();
}

// ------------------------------------------------------------------------------------------ files

export function download(name: string, content: string | Blob, type = 'application/json'): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function csv(rows: Record<string, unknown>[], cols: string[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

export async function copyText(text: string): Promise<void> {
  try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Could not copy - select it and copy by hand', 'info'); }
}

export const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'farm';
export const today = (): string => new Date().toISOString().slice(0, 10);

/** A labelled field for forms. */
export function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint ? h('span', { class: 'field-hint' }, hint) : null);
}

export function badge(text: string, kind = ''): HTMLElement { return h('span', { class: `badge ${kind}` }, text); }

/** A loading placeholder that turns into the view or an error message. */
export async function loading(host: HTMLElement, work: () => Promise<void>): Promise<void> {
  clear(host);
  host.append(h('div', { class: 'loading' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Loading...'));
  try { await work(); } catch (e) {
    clear(host);
    host.append(h('div', { class: 'error-box' }, h('b', null, 'Could not load this page. '), (e as Error).message,
      /admin_|function .* does not exist/.test((e as Error).message) ? h('div', { class: 'muted' }, 'Run the latest supabase/schema.sql in the Supabase SQL Editor (ADMIN.md).') : null));
  }
}
