// iPhone app icon and splash screens (ios/README.md), rendered from public/favicon.svg like scripts/gen-icons.mjs.
// Run again after the icon changes:  node scripts/ios-icons.mjs   (uses Google Chrome, or CHROMIUM_PATH; macOS `sips`).
// - AppIcon 1024 x 1024: the rounded picture filling the square, corners in its outline colour (iOS rounds the icon to
//   almost the same curve, so only the dark outline shows at the edge),
//   with no alpha channel (App Store Connect refuses icons that have one).
// - Splash 2732 x 2732 (the three copies the template keeps): the rounded icon on the game's sky blue (#8fd3f4,
//   capacitor.config.ts backgroundColor), like the Android splash (scripts/app-icons.py).
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8').replace('<svg ', '<svg width="100%" height="100%" ');
const assets = fileURLToPath(new URL('../ios/App/App/Assets.xcassets/', import.meta.url));
const exe = process.env.CHROMIUM_PATH;
const browser = await chromium.launch({ executablePath: exe, channel: exe ? undefined : 'chrome' });
const page = await browser.newPage();

async function render(path, size, art, side, bg = '#8fd3f4') {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:${bg};display:grid;place-items:center;height:${size}px">`
    + `<div style="width:${side}px;height:${side}px">${art}</div></body></html>`);
  await page.screenshot({ path });
  // round trip through JPEG drops the alpha channel (the picture is opaque anyway)
  const tmp = `${path}.jpg`;
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '100', path, '--out', tmp], { stdio: 'ignore' });
  execFileSync('sips', ['-s', 'format', 'png', tmp, '--out', path], { stdio: 'ignore' });
  execFileSync('rm', [tmp]);
  console.log('wrote', path.slice(assets.length));
}

await render(`${assets}AppIcon.appiconset/AppIcon-512@2x.png`, 1024, svg, 1024, '#2d1e10');
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  // the launch screen fills the phone (scaleAspectFill), so the square is cut to the screen's width: 17% of it is
  // about a third of a portrait iPhone's width
  await render(`${assets}Splash.imageset/${name}`, 2732, svg, Math.round(2732 * 0.17));
}
await browser.close();
