// Renders the PWA icons from public/favicon.svg using the pre-installed Chromium (playwright-core).
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
mkdirSync(new URL('../public/icons/', import.meta.url), { recursive: true });
const exe = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage();
const targets = [
  { file: 'icon-192.png', size: 192, pad: 0, bg: 'transparent' },
  { file: 'icon-512.png', size: 512, pad: 0, bg: 'transparent' },
  { file: 'icon-maskable-512.png', size: 512, pad: 80, bg: '#8fd3f4' },
  { file: 'apple-touch-icon.png', size: 180, pad: 10, bg: '#8fd3f4' },
];
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(`<html><body style="margin:0;background:${t.bg}"><div style="width:${t.size}px;height:${t.size}px;padding:${t.pad}px;box-sizing:border-box">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body></html>`);
  await page.screenshot({ path: new URL(`../public/icons/${t.file}`, import.meta.url).pathname, omitBackground: t.bg === 'transparent' });
  console.log('wrote', t.file);
}
await browser.close();
