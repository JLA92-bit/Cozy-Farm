// Dev helper: screenshot the running game in headless Chromium at phone/tablet sizes.
// usage: node tools/shot.mjs <url> <out-prefix> [WxH ...] [--eval "js"] [--wait ms]
import { chromium } from 'playwright-core';
const args = process.argv.slice(2);
const url = args.shift();
const prefix = args.shift();
let sizes = [], evalJs = null, wait = 4000, clear = false, actions = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--eval') evalJs = args[++i];
  else if (args[i] === '--wait') wait = +args[++i];
  else if (args[i] === '--clear') clear = true;
  else if (args[i] === '--actions') actions = args[++i];
  else sizes.push(args[i]);
}
if (!sizes.length) sizes = ['844x390'];
const exe = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const s of sizes) {
  const [w, h] = s.split('x').map(Number);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); else if (process.env.VERBOSE) console.log(m.text()); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
  if (clear) { await page.goto(url); await page.evaluate(() => localStorage.clear()); }
  await page.goto(url);
  await page.waitForTimeout(wait);
  if (evalJs) { const r = await page.evaluate(evalJs); if (r !== undefined) console.log('eval:', JSON.stringify(r)); await page.waitForTimeout(1200); }
  if (actions) { const mod = await import(new URL(actions, `file://${process.cwd()}/`)); await mod.default(page); }
  await page.screenshot({ path: `${prefix}-${s}.png` });
  console.log(`shot ${prefix}-${s}.png`, errors.length ? `\n${errors.slice(0, 15).join('\n')}` : '(no errors)');
  await ctx.close();
}
await browser.close();
