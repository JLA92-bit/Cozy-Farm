// 1.29 draw-call probe for the home: fills a Grand room with 120 different pieces (lamps on, at night) and reports
// draw calls and triangles. usage: vite build, then node tools/stress-home.mjs [url] [--budget N] [--shot file.png]
// (url defaults to a running `vite preview` on 4173). With --budget, exits 1 when the draw calls go over N.
import { readFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const bi = args.indexOf('--budget');
const budget = bi >= 0 ? Number(args.splice(bi, 2)[1]) : null;
const si = args.indexOf('--shot');
const shot = si >= 0 ? args.splice(si, 2)[1] : null;
const url = args[0] ?? 'http://localhost:4173/play/';

const { pieces } = JSON.parse(readFileSync(new URL('../src/data/furniture.json', import.meta.url)));
// a spread of every kind: floor pieces on a grid, small ones on top of them, rugs, wall and ceiling pieces
const ids = pieces.filter((p) => !p.gift && !p.craft).map((p) => p.id);

const exe = process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
const browser = await chromium.launch({ executablePath: exe, channel: exe ? undefined : 'chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(new URL('favicon.svg', url).href);
await page.evaluate(() => localStorage.clear());
await page.goto(url);
await page.waitForFunction(() => window.__home && window.__game?.state, null, { timeout: 120000 });
await page.waitForTimeout(1500);

const placed = await page.evaluate(async (ids) => {
  const g = window.__game, H = window.__home, sys = H.sys;
  g.state.player.created = true; g.state.tutorial.done = true; g.state.player.level = 60; g.state.player.coins = 1e7;
  const fh = g.state.buildings.find((b) => b.type === 'farmhouse'); if (fh) fh.level = 15;
  sys.room('living').size = 2;
  for (const id of ids) sys.give(id, 1);
  await H.enter('living');
  for (let i = 0; i < 50 && !H.active; i++) await new Promise((r) => setTimeout(r, 100));
  const room = 'living';
  const front = H.view.frontWalls();
  const back = [0, 1, 2, 3].filter((i) => !front[i]);
  let n = 0, fx = -3, fz = -3, wx = -3;
  for (const id of ids) {
    if (n >= 120) break;
    const it = await H.placeFromStorage(id);
    if (!it) continue;
    n++;
    if (it.w !== undefined) { sys.move(room, it.u, { x: wx, z: 0, y: 0.5 + (n % 3) * 0.3, w: back[n % 2] }); wx += 0.6; if (wx > 3) wx = -3; continue; }
    sys.move(room, it.u, { x: fx, z: fz, r: n % 4 });
    fx += 0.75; if (fx > 3) { fx = -3; fz += 0.75; }
  }
  document.querySelectorAll('.overlay > .panel > .close-btn').forEach((b) => b.click());
  H.select(null);
  return { placed: sys.room(room).items.length };
}, ids);
await page.waitForTimeout(6000);
// welcome letters and the like open late on a fresh farm: close them before measuring
for (let i = 0; i < 6; i++) { await page.evaluate(() => document.querySelectorAll('.overlay > .panel > .close-btn').forEach((b) => b.click())); await page.waitForTimeout(400); }

const measure = () => page.evaluate(async () => {
  const s = window.__scene; const out = [];
  for (let i = 0; i < 20; i++) { s.loop.wake(2); await new Promise((r) => requestAnimationFrame(r)); const info = (s.renderer.renderer ?? s.renderer).info; out.push([info.render.calls, info.render.triangles]); }
  return { calls: Math.round(out.reduce((a, b) => a + b[0], 0) / out.length), tris: Math.round(out.reduce((a, b) => a + b[1], 0) / out.length) };
});
const m = await measure();
if (shot) await page.screenshot({ path: shot });
console.log(`home: ${placed.placed} pieces, ${m.calls} draw calls, ${m.tris} triangles`);
if (errors.length) console.log('errors:', errors.slice(0, 5).join(' | '));
await browser.close();
if (budget !== null && m.calls > budget) { console.error(`over budget: ${m.calls} draw calls (budget ${budget})`); process.exit(1); }
process.exit(0);
