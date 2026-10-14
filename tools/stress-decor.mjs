// Late-game draw-call probe: fills a fully expanded farm with up to 720 decor pieces (every decor kind in turn, plus
// Level Markers) and reports draw calls and triangles at full zoom-out, with shadows on and off.
// usage: node tools/stress-decor.mjs [url] [count] [--budget N] [--shot file.png]   (url defaults to a running `vite preview`)
// With --budget, exits 1 when the shadowed draw calls go over N (used as a performance budget).
import { readFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const bi = args.indexOf('--budget');
const budget = bi >= 0 ? Number(args.splice(bi, 2)[1]) : null;
const si = args.indexOf('--shot');
const shot = si >= 0 ? args.splice(si, 2)[1] : null;
const url = args[0] ?? 'http://localhost:4173/play/';
const count = Number(args[1] ?? 720);

const { buildings } = JSON.parse(readFileSync(new URL('../src/data/buildings.json', import.meta.url)));
const decor = buildings.filter((b) => b.cat === 'decor' && !b.path && !b.link && !b.onField).map((b) => b.id);
for (let n = 61; n <= 120; n++) decor.push(`marker_${n}`);

const exe = process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
const browser = await chromium.launch({ executablePath: exe, channel: exe ? undefined : 'chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(new URL('favicon.svg', url).href);
await page.evaluate(() => localStorage.clear());
await page.goto(url);
await page.waitForFunction(() => window.__scene && window.__game?.state, null, { timeout: 120000 });
await page.waitForTimeout(1500);

const placed = await page.evaluate(async ({ decor, count }) => {
  const g = window.__game, ui = window.__ui;
  g.state.player.created = true; g.state.tutorial.done = true; g.state.player.level = 100;
  // measure at noon so the result does not depend on the time of day (lamps glow at night: about 70 more draws)
  { const n = new Date(); const t = new Date(n); t.setHours(12, 0, 0, 0); g.state.debugTimeOffset = t.getTime() - n.getTime(); }
  for (let cx = 0; cx < 6; cx++) for (let cz = 0; cz < 6; cz++) g.unlockChunk(`${cx},${cz}`);
  g.state.obstacles = []; g.rebuildOccupancy(); ui.scene.farm.refreshLand();
  const out = [];
  let k = 0, misses = 0;
  for (let z = 1; z < 47 && out.length < count; z++) for (let x = 1; x < 47 && out.length < count; x++) {
    for (let tries = 0; tries < decor.length; tries++) {
      const t = decor[(k + tries) % decor.length];
      if (!g.canPlace(t, x, z, 0)) continue;
      const b = { uid: g.newUid(), type: t, x, z, rot: 0, level: 1 };
      g.state.buildings.push(b); g.markBuilding(b, b.uid); out.push(b); k += tries + 1; break;
    }
    misses++;
  }
  for (const b of out) await ui.scene.farm.addBuilding(b);
  document.querySelectorAll('.close-btn').forEach((b) => b.click());
  ui.scene.rig.distance = 999; // clamped to the widest zoom
  return { placed: out.length, kinds: new Set(out.map((b) => b.type)).size };
}, { decor, count });
await page.waitForTimeout(8000);

const measure = () => page.evaluate(async () => {
  const s = window.__scene; const out = [];
  for (let i = 0; i < 20; i++) { s.loop.wake(2); await new Promise((r) => requestAnimationFrame(r)); const info = (s.renderer.renderer ?? s.renderer).info; out.push([info.render.calls, info.render.triangles]); }
  return { calls: Math.round(out.reduce((a, b) => a + b[0], 0) / out.length), tris: Math.round(out.reduce((a, b) => a + b[1], 0) / out.length) };
});
const setShadows = (on) => page.evaluate((on) => { const w = window.__scene.renderer; w.setShadowsPref?.(true); const r = w.renderer ?? w; r.shadowMap.enabled = on; r.shadowMap.needsUpdate = true; window.__scene.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); }, on);
await setShadows(true); await page.waitForTimeout(1500);
const shadowed = await measure();
await setShadows(false); await page.waitForTimeout(1500);
const plain = await measure();
if (shot) {
  await setShadows(true);
  await page.evaluate(() => { document.getElementById('ui-root').style.visibility = 'hidden'; });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: shot });
  // and a closer look at the middle of the farm
  await page.evaluate(() => { window.__scene.rig.focus(0, 0, 16, 0); });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: shot.replace(/\.png$/, '-close.png') });
}
const breakdown = await page.evaluate(() => {
  const out = {};
  window.__scene.scene.traverseVisible((o) => {
    if (!o.isMesh && !o.isSprite) return;
    const k = o.isBatchedMesh ? 'batched' : o.isInstancedMesh ? 'instanced' : o.isSprite ? 'sprite' : 'single';
    out[k] = (out[k] || 0) + 1;
  });
  return out;
});
console.log(JSON.stringify({ ...placed, shadows: shadowed, noShadows: plain, objects: breakdown, errors }));
await browser.close();
if (budget !== null && shadowed.calls > budget) { console.error(`over budget: ${shadowed.calls} draw calls > ${budget}`); process.exit(1); }
