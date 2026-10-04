// Icon variants built from Fluent Emoji bodies: recoloured copies (hue shift) and simple
// compositions (a small badge emoji in the corner of a base emoji). Used by build-assets.mjs and
// handy to run on its own: `node scripts/icon-variants.mjs` writes just these icons and adds them
// to public/assets/manifest.json without rebuilding every asset.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** New base icons for fishing (key -> Fluent Emoji name). Also listed in build-assets ICONS. */
export const FISHING_ICONS = {
  fish: 'fish', tropical_fish: 'tropical-fish', blowfish: 'blowfish', crab: 'crab', shrimp: 'shrimp', octopus: 'octopus',
  squid: 'squid', lobster: 'lobster', jellyfish: 'jellyfish', shark: 'shark', fishing_pole: 'fishing-pole', worm: 'worm',
  boot: 'hiking-boot', fish_cake: 'fish-cake-with-swirl', curry: 'curry-rice', water_wave: 'water-wave', bottle: 'bottle-with-popping-cork',
};

/**
 * Variants: `hue` rotates every colour of `base` by that many degrees (with optional saturation/lightness
 * scale); `badge` draws another emoji small in the bottom-right corner.
 */
export const ICON_VARIANTS = {
  fish_green: { base: 'fish', hue: -70, sat: 0.85 },
  fish_pink: { base: 'fish', hue: 168, sat: 0.8, light: 1.18 },
  fish_gold: { base: 'fish', hue: -155, sat: 1.1, light: 1.1 },
  seaweed: { base: 'herb', hue: 35, sat: 0.8, light: 0.85 },
  fish_pie: { base: 'pie', badge: 'fish' },
};

function hexToHsl(hex) {
  const n = parseInt(hex.length === 4 ? hex.slice(1).split('').map((c) => c + c).join('') : hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.min(1, Math.max(0, s)); l = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function iconOf(json, name) {
  let icon = json.icons[name];
  if (!icon && json.aliases?.[name]) icon = json.icons[json.aliases[name].parent];
  return icon;
}

/** SVG text for a variant, or null if a source emoji is missing. */
export function variantSvg(json, v, iconsMap) {
  const W = json.width ?? 16, H = json.height ?? 16;
  const base = iconOf(json, iconsMap[v.base] ?? v.base);
  if (!base) return null;
  const w = base.width ?? W, h = base.height ?? H;
  let body = base.body;
  if (v.hue !== undefined) {
    body = body.replace(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g, (hex) => {
      const [hh, s, l] = hexToHsl(hex);
      return hslToHex(hh + v.hue, s * (v.sat ?? 1), l * (v.light ?? 1));
    });
  }
  if (v.badge) {
    const b = iconOf(json, iconsMap[v.badge] ?? v.badge);
    if (!b) return null;
    const bw = b.width ?? W, bh = b.height ?? H;
    body += `<svg x="${w * 0.48}" y="${h * 0.48}" width="${w * 0.52}" height="${h * 0.52}" viewBox="${b.left ?? 0} ${b.top ?? 0} ${bw} ${bh}">${b.body}</svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${base.left ?? 0} ${base.top ?? 0} ${w} ${h}" width="64" height="64">${body}</svg>`;
}

/** Write the variant icons into `dir`; returns {key: 'icons/key.svg'} for the manifest. */
export function writeVariants(json, dir, iconsMap) {
  const out = {};
  for (const [key, v] of Object.entries(ICON_VARIANTS)) {
    const svg = variantSvg(json, v, iconsMap);
    if (!svg) { console.warn('icon variant missing source:', key); continue; }
    fs.writeFileSync(path.join(dir, `${key}.svg`), svg);
    out[key] = `icons/${key}.svg`;
  }
  return out;
}

// stand-alone: write the fishing icons + variants and add them to the manifest
if (import.meta.url === `file://${process.argv[1]}`) {
  const root = new URL('../public/assets/', import.meta.url).pathname;
  const dir = path.join(root, 'icons');
  const json = require('@iconify-json/fluent-emoji-flat/icons.json');
  const W = json.width ?? 16, H = json.height ?? 16;
  const added = {};
  for (const [key, name] of Object.entries(FISHING_ICONS)) {
    const icon = iconOf(json, name);
    if (!icon) { console.warn('missing', name); continue; }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.left ?? 0} ${icon.top ?? 0} ${icon.width ?? W} ${icon.height ?? H}" width="64" height="64">${icon.body}</svg>`;
    fs.writeFileSync(path.join(dir, `${key}.svg`), svg);
    added[key] = `icons/${key}.svg`;
  }
  Object.assign(added, writeVariants(json, dir, { herb: 'herb', pie: 'pie', ...FISHING_ICONS }));
  const mPath = path.join(root, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(mPath, 'utf8'));
  manifest.icons = { ...manifest.icons, ...added };
  fs.writeFileSync(mPath, JSON.stringify(manifest));
  console.log('icons written:', Object.keys(added).join(', '));
}
