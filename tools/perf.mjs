// Perf probe: loads the game, builds a busy mid-game farm via the debug hooks, and reports
// draw calls, triangles and JS frame time with optional CPU throttling.
import { chromium } from 'playwright-core';
const url = process.argv[2] ?? 'http://localhost:4173/play/';
const throttle = Number(process.argv[3] ?? 4);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let bytes = 0;
page.on('response', async (r) => { try { const b = await r.body(); bytes += b.length; } catch {} });
const t0 = Date.now();
await page.goto(url);
await page.waitForFunction(() => window.__scene, null, { timeout: 120000 });
const loadMs = Date.now() - t0;
const initialBytes = bytes;
await page.evaluate(async () => {
  const g = window.__game; g.state.player.created = true; g.state.tutorial.done = true;
  document.querySelectorAll('.close-btn').forEach((b) => b.click());
  g.state.player.level = 25; g.state.player.coins = 1e6;
});
// build a busy farm through the game's own API exposed on window
await page.evaluate(async () => {
  const g = window.__game, ui = window.__ui;
  const unlock = ['1,2', '1,3', '4,2', '4,3', '2,1', '3,1', '2,4', '3,4'];
  for (const c of unlock) g.unlockChunk(c);
  g.state.obstacles = g.state.obstacles.filter((o) => !unlock.includes(`${Math.floor(o.x / 8)},${Math.floor(o.z / 8)}`) && !(o.x >= 16 && o.x < 32 && o.z >= 16 && o.z < 32));
  g.rebuildOccupancy();
  ui.scene.farm.refreshLand();
  const types = ['plot', 'plot', 'plot', 'plot', 'plot', 'plot', 'plot', 'plot', 'plot', 'plot', 'plot', 'plot', 'apple_tree', 'cherry_tree', 'pear_tree', 'coop', 'cow_pasture', 'sheep_pen', 'pig_pen', 'feed_mill', 'bakery', 'sugar_mill', 'dairy', 'loom', 'jam_kitchen', 'roadside_stall', 'truck_depot', 'fountain', 'well', 'statue_head', 'tent'];
  for (let i = 0; i < 40; i++) types.push(['fence_wood', 'path_stone', 'flowerbed_red', 'lantern', 'bench', 'hedge', 'haybale', 'pine'][i % 8]);
  const placed = [];
  for (const t of types) {
    let ok = false;
    for (let z = 8; z < 40 && !ok; z++) for (let x = 8; x < 40 && !ok; x++) {
      if (g.canPlace(t, x, z, 0)) {
        const b = { uid: g.newUid(), type: t, x, z, rot: 0, level: 1 };
        if (t === 'plot') b.plot = { crop: ['wheat', 'corn', 'carrot', 'tomato'][placed.length % 4], plantedAt: Date.now() - 1e9, growSec: 30 };
        g.state.buildings.push(b); g.markBuilding(b, b.uid); placed.push(b); ok = true;
      }
    }
  }
  for (const b of placed) {
    if (b.type.endsWith('_tree')) b.tree = { readyAt: 0 };
    if (['coop', 'cow_pasture', 'sheep_pen', 'pig_pen'].includes(b.type)) b.animals = [{ fedAt: null }, { fedAt: null }, { fedAt: null }];
    if (['feed_mill', 'bakery', 'sugar_mill', 'dairy', 'loom', 'jam_kitchen'].includes(b.type)) { b.queue = []; b.ready = []; }
    await ui.scene.farm.addBuilding(b);
  }
  ui.scene.rig.distance = 40;
});
await page.waitForTimeout(6000);
await page.evaluate(() => document.querySelectorAll('.close-btn').forEach((b) => b.click()));
await page.waitForTimeout(800);
const breakdown = await page.evaluate(() => {
  const s = window.__scene; const out = {}; let shadowTris = 0;
  s.scene.traverseVisible((o) => {
    if (!o.isMesh && !o.isSprite) return;
    const g = o.geometry; const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    const inst = o.isInstancedMesh ? o.count : 1;
    const key = o.isInstancedMesh ? 'pool:' + o.name.split('/')[0] : o.isSkinnedMesh ? 'skinned' : o.isSprite ? 'sprite' : (o.material?.name || 'mesh');
    out[key] ??= { draws: 0, tris: 0 };
    if (inst > 0) { out[key].draws++; out[key].tris += n * inst; }
    if (o.castShadow) shadowTris += n * inst;
  });
  return { out, shadowTris };
});
console.log(JSON.stringify(breakdown));
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
const stats = await page.evaluate(async () => {
  const s = window.__scene;
  const samples = [];
  for (let i = 0; i < 60; i++) {
    s.loop.wake(2);
    await new Promise((r) => requestAnimationFrame(r));
    const info = s.renderer.info.render;
    samples.push({ calls: info.calls, tris: info.triangles, ms: s.frameMs });
  }
  const avg = (k) => samples.reduce((a, b) => a + b[k], 0) / samples.length;
  const max = (k) => Math.max(...samples.map((x) => x[k]));
  return { calls: avg('calls'), maxCalls: max('calls'), tris: avg('tris'), maxTris: max('tris'), frameMs: avg('ms'), p95: samples.map((x) => x.ms).sort((a, b) => a - b)[57], geoms: s.renderer.info.memory.geometries, tex: s.renderer.info.memory.textures, buildings: window.__game.state.buildings.length };
});
await page.screenshot({ path: '/tmp/claude-0/perf.png' });
console.log(JSON.stringify({ loadMs, initialMB: +(initialBytes / 1e6).toFixed(2), throttle, ...stats, errors }, null, 1));
await browser.close();
