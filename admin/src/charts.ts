/**
 * Hand-made SVG charts: one accent hue (blue, light->dark for magnitude), thin marks, recessive grid,
 * hover tooltips, and a "Show as table" toggle on every chart. Colours come from CSS tokens (style.css)
 * so light and dark mode each use their own validated steps.
 */
import { h, svg, clear, num } from './ui';

export interface Point { label: string; value: number; tip?: string }

let tipEl: HTMLElement | null = null;
function tip(show: boolean, html = '', x = 0, y = 0): void {
  tipEl ??= document.body.appendChild(h('div', { class: 'chart-tip', role: 'tooltip' }));
  tipEl.style.display = show ? 'block' : 'none';
  if (!show) return;
  tipEl.innerHTML = html;
  const w = tipEl.offsetWidth, hh = tipEl.offsetHeight;
  tipEl.style.left = `${Math.min(window.innerWidth - w - 8, Math.max(8, x - w / 2))}px`;
  tipEl.style.top = `${Math.max(8, y - hh - 12)}px`;
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const tickLabel = (v: number, fmt: (n: number) => string): string => (Number.isInteger(v) || v >= 100 ? fmt(v) : v.toFixed(1));

function niceMax(v: number): number {
  if (v <= 2) return 2; // counts: keep the middle tick a whole number
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Card with title, optional subtitle, the chart, and a table view toggle. */
export function chartCard(title: string, sub: string, draw: (host: HTMLElement) => void, rows: Point[], valueName = 'Value'): HTMLElement {
  const host = h('div', { class: 'chart-host' });
  const table = h('div', { class: 'chart-table', hidden: true },
    h('table', { class: 'table compact' }, h('thead', null, h('tr', null, h('th', null, 'Label'), h('th', { class: 'r' }, valueName))),
      h('tbody', null, rows.map((r) => h('tr', null, h('td', null, r.label), h('td', { class: 'r' }, num(r.value)))))));
  const toggle = h('button', { class: 'link-btn', onclick: () => { const t = table.hidden; table.hidden = !t; host.hidden = t; toggle.textContent = t ? 'Show chart' : 'Show as table'; } }, 'Show as table');
  const card = h('section', { class: 'card chart-card' },
    h('div', { class: 'card-head' }, h('div', null, h('h3', null, title), sub ? h('div', { class: 'muted small' }, sub) : null), toggle),
    host, table);
  const render = () => { clear(host); draw(host); };
  requestAnimationFrame(render);
  let last = 0;
  new ResizeObserver(() => { const w = host.clientWidth; if (Math.abs(w - last) > 8) { last = w; render(); } }).observe(host);
  return card;
}

/** Vertical bars (counts per day, per level...). */
export function bars(host: HTMLElement, data: Point[], opts: { height?: number; every?: number; fmt?: (n: number) => string } = {}): void {
  const W = Math.max(280, host.clientWidth), H = opts.height ?? 180, L = 36, B = 22, T = 8;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const fmt = opts.fmt ?? num;
  const s = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': `${data.length} bars` });
  for (const f of [0, 0.5, 1]) {
    const y = T + (H - T - B) * (1 - f);
    s.append(svg('line', { x1: L, x2: W, y1: y, y2: y, class: f === 0 ? 'axis' : 'grid' }), svg('text', { x: L - 6, y: y + 4, class: 'tick', 'text-anchor': 'end' }, tickLabel(max * f, fmt)));
  }
  const n = Math.max(1, data.length), slot = (W - L) / n, bw = Math.max(1, Math.min(28, slot - 2));
  const every = opts.every ?? Math.ceil(n / Math.max(1, Math.floor((W - L) / 54)));
  data.forEach((d, i) => {
    const x = L + i * slot + (slot - bw) / 2, bh = ((H - T - B) * d.value) / max, y = H - B - bh;
    if (d.value > 0) {
      const r = Math.min(4, bw / 2, bh);
      s.append(svg('path', { class: 'bar', d: `M${x},${H - B}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${H - B}Z` }));
    }
    if (i % every === 0) s.append(svg('text', { x: x + bw / 2, y: H - 6, class: 'tick', 'text-anchor': 'middle' }, d.label));
    const hit = svg('rect', { x: L + i * slot, y: T, width: slot, height: H - T - B, class: 'hit' });
    hit.addEventListener('pointermove', (e) => tip(true, `<b>${esc(d.label)}</b><br>${esc(d.tip ?? fmt(d.value))}`, e.clientX, e.clientY));
    hit.addEventListener('pointerleave', () => tip(false));
    s.append(hit);
  });
  host.append(s);
}

/** Line + soft area with a crosshair tooltip (change over time). */
export function line(host: HTMLElement, data: Point[], opts: { height?: number; fmt?: (n: number) => string } = {}): void {
  const W = Math.max(280, host.clientWidth), H = opts.height ?? 200, L = 36, B = 22, T = 10, R = 8;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const fmt = opts.fmt ?? num;
  const n = data.length;
  const X = (i: number) => L + ((W - L - R) * i) / Math.max(1, n - 1);
  const Y = (v: number) => T + (H - T - B) * (1 - v / max);
  const s = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'line chart' });
  for (const f of [0, 0.5, 1]) {
    const y = T + (H - T - B) * (1 - f);
    s.append(svg('line', { x1: L, x2: W - R, y1: y, y2: y, class: f === 0 ? 'axis' : 'grid' }), svg('text', { x: L - 6, y: y + 4, class: 'tick', 'text-anchor': 'end' }, tickLabel(max * f, fmt)));
  }
  if (n) {
    const pts = data.map((d, i) => `${X(i).toFixed(1)},${Y(d.value).toFixed(1)}`);
    s.append(svg('path', { class: 'area', d: `M${X(0)},${H - B}L${pts.join('L')}L${X(n - 1)},${H - B}Z` }), svg('path', { class: 'line', d: `M${pts.join('L')}` }));
    const every = Math.ceil(n / Math.max(1, Math.floor((W - L) / 64)));
    data.forEach((d, i) => { if (i % every === 0 || i === n - 1) s.append(svg('text', { x: X(i), y: H - 6, class: 'tick', 'text-anchor': i === n - 1 ? 'end' : 'middle' }, d.label)); });
    const cross = svg('line', { class: 'cross', y1: T, y2: H - B, x1: 0, x2: 0, visibility: 'hidden' });
    const dot = svg('circle', { class: 'dot', r: 5, cx: 0, cy: 0, visibility: 'hidden' });
    const hit = svg('rect', { x: L, y: T, width: W - L - R, height: H - T - B, class: 'hit' });
    hit.addEventListener('pointermove', (e) => {
      const box = s.getBoundingClientRect();
      const i = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - box.left - L) / (W - L - R)) * (n - 1))));
      const d = data[i];
      cross.setAttribute('x1', String(X(i))); cross.setAttribute('x2', String(X(i))); cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', String(X(i))); dot.setAttribute('cy', String(Y(d.value))); dot.setAttribute('visibility', 'visible');
      tip(true, `<b>${esc(d.label)}</b><br>${esc(d.tip ?? fmt(d.value))}`, box.left + X(i), box.top + Y(d.value));
    });
    hit.addEventListener('pointerleave', () => { tip(false); cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); });
    s.append(cross, dot, hit);
  }
  host.append(s);
}

/** Horizontal bars as HTML rows (shares: platforms, versions, items). Labels and values stay in ink colours. */
export function hbars(host: HTMLElement, data: Point[], fmt: (n: number) => string = num): void {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((a, d) => a + d.value, 0);
  host.append(h('div', { class: 'hbars' }, data.map((d) => h('div', { class: 'hbar-row', title: d.tip ?? '' },
    h('span', { class: 'hbar-label' }, d.label),
    h('span', { class: 'hbar-track' }, h('span', { class: 'hbar-fill', style: { width: `${Math.max(1, (d.value / max) * 100)}%` } })),
    h('span', { class: 'hbar-value' }, `${fmt(d.value)}`, total ? h('span', { class: 'muted' }, ` ${Math.round((d.value / total) * 100)}%`) : null)))));
}

/** Sequential blue for 0..1 (ramp steps from the palette; near-zero recedes toward the surface). */
export function seq(f: number): string {
  const ramp = ['var(--seq-100)', 'var(--seq-200)', 'var(--seq-300)', 'var(--seq-400)', 'var(--seq-500)', 'var(--seq-600)', 'var(--seq-700)'];
  return ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(f * ramp.length)))];
}

/** Activity calendar: one square per day for the last `days` days, shaded by minutes played. */
export function calendar(host: HTMLElement, byDay: Map<string, { minutes: number; sessions: number }>, days = 120): void {
  const max = Math.max(1, ...[...byDay.values()].map((v) => v.minutes));
  const end = new Date(); end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end.getTime() - (days - 1) * 864e5);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7)); // back to Monday
  const cells: HTMLElement[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 864e5) {
    const key = new Date(t).toISOString().slice(0, 10);
    const v = byDay.get(key);
    const c = h('span', { class: `cal-cell${v ? ' on' : ''}`, title: `${key}: ${v ? `${v.minutes} min, ${v.sessions} sessions` : 'not played'}` });
    if (v) c.style.background = seq(0.15 + (0.85 * v.minutes) / max);
    cells.push(c);
  }
  host.append(h('div', { class: 'calendar' }, cells), h('div', { class: 'cal-legend muted small' }, 'Less', [0.15, 0.4, 0.7, 1].map((f) => h('span', { class: 'cal-cell on', style: { background: seq(f) } })), 'More'));
}
