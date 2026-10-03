// usage: node render.js manifest.json   manifest: [{svg, out, w, h, transparent, jpg}]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const items = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const fontDir = path.resolve(__dirname, 'fonts');
  for (const it of items) {
    const svg = fs.readFileSync(it.svg, 'utf8');
    await page.setViewportSize({ width: it.w, height: it.h });
    const html = `<!doctype html><html><head><style>
      @font-face{font-family:'Lilita One';src:url('file://${fontDir}/LilitaOne.ttf')}
      @font-face{font-family:'Fredoka';src:url('file://${fontDir}/Fredoka.ttf')}
      html,body{margin:0;padding:0;background:transparent;overflow:hidden}
      body>svg{display:block;width:${it.w}px;height:${it.h}px}</style></head><body>${svg}</body></html>`;
    const tmp = path.join(__dirname, '.render_tmp.html');
    fs.writeFileSync(tmp, html);
    await page.goto('file://' + tmp);
    await page.evaluate(() => document.fonts.ready);
    fs.mkdirSync(path.dirname(it.out), { recursive: true });
    await page.screenshot({ path: it.out, omitBackground: !!it.transparent, type: it.jpg ? 'jpeg' : 'png', quality: it.jpg ? 92 : undefined,
      clip: { x: 0, y: 0, width: it.w, height: it.h } });
  }
  await browser.close();
})();
