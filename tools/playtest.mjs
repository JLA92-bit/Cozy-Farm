// Automated first-hour playtest through the real UI. Reports progress and any errors.
import { chromium } from 'playwright-core';
const url = process.argv[2] ?? 'http://localhost:4173/Cozy-Farm/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(`console: ${m.text()}`); });
const log = (...a) => console.log(...a);
const shot = (n) => page.screenshot({ path: `/tmp/claude-0/pt-${n}.png` });
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const tile = (x, z) => ev(([x, z]) => { const s = window.__scene; const v = new (s.rig.target.constructor)(x - 24 + 0.5, 0.1, z - 24 + 0.5); const p = s.project(v); return [p.x, p.y]; }, [x, z]);
const skip = (min) => ev((m) => { const g = window.__game; g.state.debugTimeOffset += m * 60000; }, min);
const state = () => ev(() => { const g = window.__game; return { lv: g.level, xp: g.state.player.xp, coins: g.coins, gems: g.gems, step: g.state.tutorial.step, done: g.state.tutorial.done, inv: { ...g.state.inventory } }; });

await page.goto(url);
await page.waitForFunction(() => window.__scene, null, { timeout: 120000 });
await wait(2500);
// --- character creator
await page.click('.panel-footer .btn:last-child');
await wait(2000);
log('after creator', JSON.stringify(await state()));
// --- tutorial: welcome
await page.click('.tut-box .btn:not(.tut-skip)');
await wait(600);
// tap empty plot
let [x, y] = await tile(17, 22);
await page.mouse.click(x, y);
await wait(800);
// pick wheat in the tray
await page.click('.tray-item[data-crop="wheat"]');
await wait(400);
// swipe across empty plots
const empties = await ev(() => window.__game.state.buildings.filter((b) => b.type === 'plot' && !b.plot).map((b) => [b.x, b.z]));
for (const [px, pz] of empties) { const [a, b] = await tile(px, pz); await page.mouse.click(a, b); await wait(150); }
await wait(800);
log('planted, step', (await state()).step);
await ev(() => document.querySelector('.tray .tray-close')?.click());
await wait(500);
// tap order board
const ob = await ev(() => { const b = window.__game.buildingsOf('order_board')[0]; const a = window.__scene.farm.anchor(b.uid); const p = window.__scene.project(a); return [p.x, p.y + 20]; });
await page.mouse.click(ob[0], ob[1]);
await wait(900);
await shot('orders');
log('orders open, step', (await state()).step);
await ev(() => document.querySelector('.close-btn')?.click());
await wait(800);
// wait for wheat: skip 1 minute, then harvest by swiping over all plots
await skip(1);
await wait(800);
const plots = await ev(() => window.__game.state.buildings.filter((b) => b.type === 'plot').map((b) => [b.x, b.z]));
for (const [px, pz] of plots) { const [a, b] = await tile(px, pz); await page.mouse.click(a, b); await wait(120); }
await wait(800);
log('harvested', JSON.stringify(await state()));
// deliver order
await page.mouse.click(ob[0], ob[1]);
await wait(900);
const deliver = await page.$('.panel .card.done .btn');
if (deliver) await deliver.click();
await wait(700);
await ev(() => document.querySelectorAll('.close-btn').forEach((b) => b.click()));
await wait(700);
log('delivered', JSON.stringify(await state()));
// shop -> field
await page.click('[data-hud="shop"]');
await wait(900);
await page.click('.panel .card.clickable >> nth=0');
await wait(1200);
await page.click('.action-bar .btn >> nth=-1');
await wait(900);
await page.click('.action-bar .btn >> nth=0').catch(() => {});
await wait(600);
log('placed field', JSON.stringify(await state()));
// finish tutorial
const okBtn = await page.$('.tut-box .btn:not(.tut-skip)');
if (okBtn) await okBtn.click();
await wait(500);
await shot('after-tutorial');
// --- simulate ~an hour of play: plant/harvest cycles, orders, build progression
for (let cycle = 0; cycle < 40; cycle++) {
  await ev(async () => {
    const g = window.__game;
    const { farming } = await import(new URL('/src/systems/Farming.ts', location.href).href).catch(() => ({ farming: null }));
    void farming;
  }).catch(() => {});
  // plant best affordable crop on every empty field via the game API exposed through the UI singletons
  await ev(() => {
    const g = window.__game, inter = window.__interaction;
    void inter;
    const crops = window.__crops;
    void crops;
    return g.level;
  });
  // use tray: open by tapping an empty plot, choose highest unlocked crop
  const empty = await ev(() => window.__game.state.buildings.filter((b) => b.type === 'plot' && !b.plot && !b.buildEnd).map((b) => [b.x, b.z]));
  if (empty.length) {
    const [a, b] = await tile(empty[0][0], empty[0][1]);
    await page.mouse.click(a, b);
    await wait(300);
    const items = await page.$$('.tray-item:not(.locked)');
    const pickIdx = Math.max(0, items.length - 1 - (cycle % 2));
    if (items[pickIdx]) await items[pickIdx].click();
    await wait(200);
    for (const [px, pz] of empty) { const [c, d] = await tile(px, pz); await page.mouse.click(c, d); await wait(60); }
    await page.click('.tray .tray-close').catch(() => {});
    await wait(200);
  }
  await skip(1.5);
  await wait(300);
  const ready = await ev(() => window.__game.state.buildings.filter((b) => b.plot && Date.now() + window.__game.state.debugTimeOffset >= b.plot.plantedAt + b.plot.growSec * 1000).map((b) => [b.x, b.z]));
  for (const [px, pz] of ready) { const [c, d] = await tile(px, pz); await page.mouse.click(c, d); await wait(60); }
  // complete any orders possible
  await page.mouse.click(ob[0], ob[1]);
  await wait(500);
  for (let k = 0; k < 4; k++) { const d = await page.$('.panel .card.done .btn'); if (!d) break; await d.click(); await wait(300); }
  await ev(() => document.querySelectorAll('.close-btn').forEach((b) => b.click()));
  await wait(400);
  // claim quests / levelups
  await ev(() => document.querySelectorAll('.close-btn').forEach((b) => b.click()));
  if (cycle % 10 === 9) log(`cycle ${cycle}`, JSON.stringify(await state()));
}
// open every panel once
for (const id of ['inventory', 'quests', 'achievements', 'collection', 'character', 'settings', 'unlocks', 'daily', 'crates', 'orders', 'shop', 'gems', 'event']) {
  await ev((p) => window.__ui.open(p), id);
  await wait(700);
  await ev(() => document.querySelectorAll('.close-btn').forEach((b) => b.click()));
  await wait(500);
}
await shot('end');
log('final', JSON.stringify(await state()));
log('errors', errors.length ? errors.slice(0, 20).join('\n') : 'none');
await browser.close();
