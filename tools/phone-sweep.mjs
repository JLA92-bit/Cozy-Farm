// Dev helper: open every panel on a late-game farm at phone sizes (portrait and landscape) and report anything that
// spills off screen, buttons too small to tap, and page errors. Screenshots go to the folder given.
// usage: vite build, then node tools/phone-sweep.mjs <out-dir> [WxH ...] [--only id,id]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const out = args.shift() ?? 'sweep';
let sizes = [], only = null;
for (let i = 0; i < args.length; i++) { if (args[i] === '--only') only = args[++i].split(','); else sizes.push(args[i]); }
if (!sizes.length) sizes = ['360x640', '412x915', '640x360', '915x412'];
mkdirSync(out, { recursive: true });

const PORT = Number(process.env.TEST_PORT ?? 4318);
const ROOT = `http://localhost:${PORT}/play/`;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
process.on('exit', () => { try { server.kill(); } catch { /* gone */ } });
for (let i = 0; i < 60; i++) { try { if ((await fetch(ROOT)).ok) break; } catch { /* not up */ } await new Promise((r) => setTimeout(r, 500)); }

const exe = process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

// panels that need an argument, or open a flow rather than a screen
const ARGS = { 'square-room': { room: 'estate_clock_base' }, critter: 'rabbit' };
const SKIP = new Set(['__levelbadge', '__goal', 'visit', 'visit18', 'home', 'mine']);

let problems = 0;
for (const s of sizes) {
  const [w, h] = s.split('x').map(Number);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${ROOT}favicon.svg`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(ROOT);
  await page.waitForFunction(() => window.__game?.state && window.__ui, null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  // a late-game farm: every screen has something to show
  await page.evaluate(() => {
    const g = window.__game, st = g.state;
    st.player.created = true; st.tutorial.done = true; st.player.level = 95; st.player.coins = 2e6; st.player.name = 'Sweep Farm';
    st.restoration ??= { given: {}, done: [], seen: [] }; st.restoration.festival = 1;
  });
  const ids = await page.evaluate(() => [...window.__ui.panels.keys()]);
  for (const id of ids) {
    if (SKIP.has(id) || (only && !only.includes(id))) continue;
    errors.length = 0;
    const r = await page.evaluate(([id, arg]) => {
      try { window.__ui.open(id, arg); } catch (e) { return { err: String(e) }; }
      return null;
    }, [id, ARGS[id]]);
    // wait for the bounce-in to settle: tall panels overshoot the screen edge for a moment while they open
    await page.waitForTimeout(500);
    for (let i = 0, last = ''; i < 20; i++) {
      const now = await page.evaluate(() => JSON.stringify([...document.querySelectorAll('.overlay > .panel')].pop()?.getBoundingClientRect()));
      if (now === last) break;
      last = now;
      await page.waitForTimeout(150);
    }
    const found = await page.evaluate(([W, H]) => {
      const bad = [];
      const panel = [...document.querySelectorAll('.overlay > .panel')].pop();
      if (!panel) return { open: false, bad };
      const pr = panel.getBoundingClientRect();
      if (pr.left < -1 || pr.right > W + 1 || pr.top < -1 || pr.bottom > H + 1) bad.push(`panel ${Math.round(pr.left)},${Math.round(pr.top)}-${Math.round(pr.right)},${Math.round(pr.bottom)}`);
      if (document.documentElement.scrollWidth > W + 1) bad.push(`page scrolls sideways (${document.documentElement.scrollWidth})`);
      for (const el of panel.querySelectorAll('*')) {
        if (!el.offsetParent) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        // inside a scroller is fine
        let sc = el.parentElement, clipped = false;
        while (sc && sc !== panel) { const cs = getComputedStyle(sc); if (/(auto|scroll|hidden)/.test(cs.overflowX + cs.overflowY)) { clipped = true; break; } sc = sc.parentElement; }
        const label = `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${(el.textContent ?? '').trim().slice(0, 30)}"`;
        if (el.classList.contains('close-btn')) { if (r.right - r.width / 2 > W || r.top < -r.height / 2) bad.push('close button off screen'); continue; }
        if (!clipped && (r.right > pr.right + 2 || r.left < pr.left - 2)) bad.push(`sticks out sideways: ${label}`);
        if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === 'hidden' && getComputedStyle(el).textOverflow !== 'ellipsis' && el.children.length === 0) bad.push(`text cut off: ${label}`);
        if (el.tagName === 'BUTTON' && (r.height < 28 || r.width < 28)) bad.push(`small button ${Math.round(r.width)}x${Math.round(r.height)}: ${label}`);
      }
      return { open: true, bad: [...new Set(bad)].slice(0, 12) };
    }, [w, h]);
    const list = [...(r?.err ? [r.err] : []), ...found.bad, ...errors.map((e) => `error: ${e}`)];
    if (list.length) { problems += list.length; console.log(`${s} ${id}${found.open ? '' : ' (no panel found)'}\n  ${list.join('\n  ')}`); }
    await page.screenshot({ path: `${out}/${id}-${s}.png` });
    for (let i = 0; i < 4; i++) {
      const more = await page.evaluate(() => { const b = [...document.querySelectorAll('.overlay > .panel > .close-btn')].pop(); b?.click(); return !!b; });
      if (!more) break;
      await page.waitForTimeout(450);
    }
  }
  await ctx.close();
}
await browser.close();
console.log(problems ? `\n${problems} problem(s)` : '\nno problems found');
process.exit(0);
