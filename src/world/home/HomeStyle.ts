import * as THREE from 'three';

/**
 * 1.29 wall and floor patterns for the home, drawn on a canvas from two colours (home.json lists the ids). Every
 * pattern tiles seamlessly; one tile covers TILE_M metres. Textures are cached per pattern and colour pair, so a room
 * with four walls the same costs one texture.
 */

export const TILE_M = 1;
const N = 256;
const cache = new Map<string, THREE.CanvasTexture>();

/** Seeded random, so a pattern looks the same every time it is drawn. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909); s ^= s >>> 16; return (s >>> 0) / 4294967296; };
}

/** A colour lighter (f > 0) or darker (f < 0). */
export function shade(hex: string, f: number): string {
  const c = new THREE.Color(hex);
  if (f >= 0) c.lerp(new THREE.Color(1, 1, 1), f); else c.lerp(new THREE.Color(0, 0, 0), -f);
  return `#${c.getHexString()}`;
}
const mix = (a: string, b: string, k: number) => `#${new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString()}`;

type Draw = (g: CanvasRenderingContext2D, a: string, b: string, r: () => number) => void;

/** Fill with soft speckles of a colour (plaster, carpet, wood grain). */
function speckle(g: CanvasRenderingContext2D, col: string, n: number, size: number, alpha: number, r: () => number): void {
  g.fillStyle = col;
  for (let i = 0; i < n; i++) {
    g.globalAlpha = alpha * (0.4 + r() * 0.6);
    const x = r() * N, y = r() * N, s = size * (0.5 + r());
    for (const dx of [0, -N, N]) for (const dy of [0, -N, N]) { g.beginPath(); g.ellipse(x + dx, y + dy, s, s * (0.6 + r() * 0.5), r() * Math.PI, 0, Math.PI * 2); g.fill(); }
  }
  g.globalAlpha = 1;
}

/** Long thin lines of wood grain across a board. */
function grain(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string, horizontal: boolean, r: () => number): void {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.strokeStyle = col; g.lineWidth = 1;
  const lines = Math.max(2, Math.round((horizontal ? h : w) / 5));
  for (let i = 0; i < lines; i++) {
    g.globalAlpha = 0.12 + r() * 0.15;
    g.beginPath();
    if (horizontal) { const yy = y + r() * h; g.moveTo(x, yy); g.bezierCurveTo(x + w / 3, yy + (r() - 0.5) * 4, x + 2 * w / 3, yy + (r() - 0.5) * 4, x + w, yy); }
    else { const xx = x + r() * w; g.moveTo(xx, y); g.bezierCurveTo(xx + (r() - 0.5) * 4, y + h / 3, xx + (r() - 0.5) * 4, y + 2 * h / 3, xx, y + h); }
    g.stroke();
  }
  g.restore();
  g.globalAlpha = 1;
}

/** Boards of slightly varied colour with seams (planks, panelling). */
function boards(g: CanvasRenderingContext2D, a: string, b: string, r: () => number, count: number, horizontal: boolean, stagger: boolean): void {
  const size = N / count;
  for (let i = 0; i < count; i++) {
    const segs = stagger ? 2 : 1;
    const off = stagger ? r() * N : 0;
    for (let s = 0; s < segs + 1; s++) {
      const start = off + s * (N / segs) - N;
      const len = N / segs;
      const col = shade(a, (r() - 0.5) * 0.16);
      g.fillStyle = col;
      if (horizontal) {
        for (const dx of [0, N]) { g.fillRect(start + dx, i * size, len, size); grain(g, start + dx, i * size, len, size, b, true, r); }
      } else {
        for (const dy of [0, N]) { g.fillRect(i * size, start + dy, size, len); grain(g, i * size, start + dy, size, len, b, false, r); }
      }
      g.fillStyle = shade(b, -0.25);
      if (stagger) {
        if (horizontal) for (const dx of [0, N]) g.fillRect(start + dx, i * size, 2, size);
        else for (const dy of [0, N]) g.fillRect(i * size, start + dy, size, 2);
      }
    }
    g.fillStyle = shade(b, -0.3);
    if (horizontal) g.fillRect(0, i * size, N, 2); else g.fillRect(i * size, 0, 2, N);
  }
}

/** Grid of tiles with grout. */
function tileGrid(g: CanvasRenderingContext2D, a: string, grout: string, cols: number, rows: number, offsetRows: boolean, r: () => number, alt?: string): void {
  g.fillStyle = grout; g.fillRect(0, 0, N, N);
  const w = N / cols, h = N / rows, gap = 3;
  for (let y = 0; y < rows; y++) for (let x = -1; x <= cols; x++) {
    const ox = offsetRows && y % 2 ? w / 2 : 0;
    g.fillStyle = alt && (x + y) % 2 ? alt : shade(a, (r() - 0.5) * 0.08);
    g.fillRect(x * w + ox + gap / 2, y * h + gap / 2, w - gap, h - gap);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(x * w + ox + gap / 2, y * h + gap / 2, w - gap, 3);
  }
}

function flower(g: CanvasRenderingContext2D, x: number, y: number, s: number, petal: string, mid: string): void {
  g.fillStyle = petal;
  for (let k = 0; k < 5; k++) {
    const an = (k / 5) * Math.PI * 2;
    g.beginPath(); g.ellipse(x + Math.cos(an) * s, y + Math.sin(an) * s, s * 0.75, s * 0.5, an, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = mid; g.beginPath(); g.arc(x, y, s * 0.5, 0, Math.PI * 2); g.fill();
}

const WALLS: Record<string, Draw> = {
  plaster: (g, a, b, r) => { g.fillStyle = a; g.fillRect(0, 0, N, N); speckle(g, b, 60, 18, 0.12, r); speckle(g, shade(a, 0.2), 40, 12, 0.2, r); },
  stripes: (g, a, b) => { g.fillStyle = a; g.fillRect(0, 0, N, N); g.fillStyle = b; for (let i = 0; i < 4; i++) g.fillRect(i * 64, 0, 32, N); g.fillStyle = shade(b, 0.3); for (let i = 0; i < 4; i++) g.fillRect(i * 64 + 34, 0, 2, N); },
  pinstripe: (g, a, b) => { g.fillStyle = a; g.fillRect(0, 0, N, N); g.fillStyle = b; for (let i = 0; i < 8; i++) { g.fillRect(i * 32 + 14, 0, 3, N); g.globalAlpha = 0.5; g.fillRect(i * 32 + 20, 0, 1, N); g.globalAlpha = 1; } },
  gingham: (g, a, b) => {
    g.fillStyle = a; g.fillRect(0, 0, N, N);
    g.globalAlpha = 0.5; g.fillStyle = b;
    for (let i = 0; i < 8; i += 2) { g.fillRect(i * 32, 0, 32, N); g.fillRect(0, i * 32, N, 32); }
    g.globalAlpha = 1;
  },
  polka: (g, a, b) => {
    g.fillStyle = a; g.fillRect(0, 0, N, N); g.fillStyle = b;
    for (let y = 0; y < 4; y++) for (let x = 0; x <= 4; x++) { g.beginPath(); g.arc(x * 64 + (y % 2 ? 32 : 0), y * 64 + 32, 9, 0, Math.PI * 2); g.fill(); }
  },
  floral: (g, a, b, r) => {
    g.fillStyle = a; g.fillRect(0, 0, N, N);
    const leaf = mix(b, '#5f9a43', 0.6);
    for (let y = 0; y < 4; y++) for (let x = 0; x <= 4; x++) {
      const cx = x * 64 + (y % 2 ? 32 : 0) + (r() - 0.5) * 6, cy = y * 64 + 32 + (r() - 0.5) * 6;
      g.fillStyle = leaf; g.beginPath(); g.ellipse(cx + 9, cy + 9, 7, 3, 0.8, 0, Math.PI * 2); g.fill();
      flower(g, cx, cy, 6, b, shade(a, 0.3));
    }
  },
  damask: (g, a, b) => {
    g.fillStyle = a; g.fillRect(0, 0, N, N); g.fillStyle = b;
    const motif = (cx: number, cy: number) => {
      g.beginPath(); g.moveTo(cx, cy - 46); g.bezierCurveTo(cx + 30, cy - 26, cx + 30, cy + 26, cx, cy + 46); g.bezierCurveTo(cx - 30, cy + 26, cx - 30, cy - 26, cx, cy - 46); g.fill();
      g.fillStyle = a; g.beginPath(); g.ellipse(cx, cy, 10, 22, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = b; g.beginPath(); g.arc(cx, cy, 5, 0, Math.PI * 2); g.fill();
      for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 22, cy - 34, 8, 4, s * 0.6, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(cx + s * 22, cy + 34, 8, 4, -s * 0.6, 0, Math.PI * 2); g.fill(); }
    };
    for (const [x, y] of [[64, 64], [192, 64], [0, 192], [128, 192], [256, 192], [64, 320], [192, 320], [64, -64], [192, -64]]) motif(x, y);
  },
  diamonds: (g, a, b) => {
    g.fillStyle = a; g.fillRect(0, 0, N, N); g.fillStyle = b;
    for (let y = -1; y < 3; y++) for (let x = -1; x < 5; x++) {
      const cx = x * 64 + (y % 2 ? 32 : 0), cy = y * 128 + 64;
      if ((x + y) % 2) continue;
      g.beginPath(); g.moveTo(cx, cy - 64); g.lineTo(cx + 32, cy); g.lineTo(cx, cy + 64); g.lineTo(cx - 32, cy); g.closePath(); g.fill();
    }
    g.strokeStyle = shade(b, -0.2); g.lineWidth = 1;
    for (let k = -4; k < 8; k++) { g.beginPath(); g.moveTo(k * 64, 0); g.lineTo(k * 64 + 128, N); g.stroke(); g.beginPath(); g.moveTo(k * 64, N); g.lineTo(k * 64 + 128, 0); g.stroke(); }
  },
  panelling: (g, a, b, r) => boards(g, a, b, r, 4, false, false),
  beadboard: (g, a, b) => {
    g.fillStyle = a; g.fillRect(0, 0, N, N);
    for (let i = 0; i < 10; i++) { const x = i * 25.6; g.fillStyle = shade(b, -0.1); g.fillRect(x, 0, 2, N); g.fillStyle = shade(a, 0.25); g.fillRect(x + 2, 0, 2, N); }
  },
  logs: (g, a, b, r) => {
    const rows = 4, h = N / rows;
    for (let i = 0; i < rows; i++) {
      const grd = g.createLinearGradient(0, i * h, 0, (i + 1) * h);
      grd.addColorStop(0, shade(a, -0.25)); grd.addColorStop(0.35, shade(a, 0.1)); grd.addColorStop(0.7, a); grd.addColorStop(1, shade(b, -0.35));
      g.fillStyle = grd; g.fillRect(0, i * h, N, h);
      grain(g, 0, i * h + 6, N, h - 12, b, true, r);
    }
  },
  brick: (g, a, b, r) => tileGrid(g, a, b, 4, 8, true, r),
  stone: (g, a, b, r) => {
    g.fillStyle = b; g.fillRect(0, 0, N, N);
    let y = 0;
    while (y < N) {
      const h = 34 + r() * 22;
      let x = -r() * 40;
      while (x < N) {
        const w = 40 + r() * 46;
        g.fillStyle = shade(a, (r() - 0.5) * 0.25);
        const hh = Math.min(h, N - y);
        g.beginPath(); g.roundRect(x + 3, y + 3, w - 6, hh - 6, 8); g.fill();
        if (x + w > N) { g.beginPath(); g.roundRect(x - N + 3, y + 3, w - 6, hh - 6, 8); g.fill(); }
        x += w;
      }
      y += h;
    }
  },
  tiles: (g, a, b, r) => tileGrid(g, a, b, 4, 4, false, r),
  subway: (g, a, b, r) => tileGrid(g, a, b, 4, 8, true, r),
  chalk: (g, a, b, r) => {
    g.fillStyle = a; g.fillRect(0, 0, N, N);
    speckle(g, b, 30, 20, 0.05, r);
    g.strokeStyle = b; g.lineWidth = 2;
    for (let i = 0; i < 6; i++) { g.globalAlpha = 0.25; g.beginPath(); const x = r() * N, y = r() * N; g.moveTo(x, y); g.quadraticCurveTo(x + 20, y - 10, x + 40 + r() * 20, y + (r() - 0.5) * 10); g.stroke(); }
    g.globalAlpha = 1;
  },
};

const FLOORS: Record<string, Draw> = {
  planks: (g, a, b, r) => boards(g, a, b, r, 6, true, true),
  wideboards: (g, a, b, r) => boards(g, a, b, r, 3, true, true),
  herringbone: (g, a, b, r) => {
    g.fillStyle = shade(b, -0.3); g.fillRect(0, 0, N, N);
    const w = 16, l = 64;
    for (let k = -6; k < 12; k++) for (let j = -2; j < 6; j++) {
      const x0 = k * 32, y0 = j * 64 + k * 32;
      for (const [dx, dy, horiz] of [[0, 0, true], [l - w, 0, false]] as const) {
        g.fillStyle = shade(a, (r() - 0.5) * 0.16);
        const x = ((x0 + dx) % N + N) % N, y = ((y0 + dy) % N + N) % N;
        for (const ox of [0, -N]) for (const oy of [0, -N]) {
          if (horiz) g.fillRect(x + ox + 1, y + oy + 1, l - 2, w - 2); else g.fillRect(x + ox + 1, y + oy + 1, w - 2, l - 2);
        }
      }
    }
  },
  parquet: (g, a, b, r) => {
    const s = 64;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const horiz = (x + y) % 2 === 0;
      for (let k = 0; k < 4; k++) {
        g.fillStyle = shade(a, (r() - 0.5) * 0.18);
        if (horiz) g.fillRect(x * s, y * s + k * 16, s, 16); else g.fillRect(x * s + k * 16, y * s, 16, s);
        g.fillStyle = shade(b, -0.2);
        if (horiz) g.fillRect(x * s, y * s + k * 16, s, 1); else g.fillRect(x * s + k * 16, y * s, 1, s);
      }
    }
  },
  checker: (g, a, b) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? b : a; g.fillRect(x * 64, y * 64, 64, 64); } },
  hex: (g, a, b, r) => {
    // flat-topped hexagons, 6 columns and 5 rows per tile (an even column count keeps the odd-column offset seamless)
    g.fillStyle = b; g.fillRect(0, 0, N, N);
    const R = N / 9, h = N / 5, gap = 2.5;
    for (let col = -1; col <= 6; col++) for (let row = -1; row <= 5; row++) {
      const x = col * 1.5 * R, y = row * h + (col % 2 ? h / 2 : 0);
      g.fillStyle = shade(a, (r() - 0.5) * 0.06);
      g.beginPath();
      g.moveTo(x - R + gap, y); g.lineTo(x - R / 2 + gap / 2, y - h / 2 + gap); g.lineTo(x + R / 2 - gap / 2, y - h / 2 + gap);
      g.lineTo(x + R - gap, y); g.lineTo(x + R / 2 - gap / 2, y + h / 2 - gap); g.lineTo(x - R / 2 + gap / 2, y + h / 2 - gap);
      g.closePath(); g.fill();
    }
  },
  terracotta: (g, a, b, r) => tileGrid(g, a, b, 3, 3, false, r),
  flagstone: (g, a, b, r) => WALLS.stone(g, a, b, r),
  carpet: (g, a, b, r) => { g.fillStyle = a; g.fillRect(0, 0, N, N); speckle(g, b, 400, 2, 0.35, r); speckle(g, shade(a, 0.15), 300, 2, 0.3, r); },
  painted: (g, a, b, r) => { boards(g, a, b, r, 5, true, true); speckle(g, shade(a, 0.3), 40, 3, 0.25, r); },
  straw: (g, a, b) => {
    g.fillStyle = a; g.fillRect(0, 0, N, N);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const horiz = (x + y) % 2 === 0;
      for (let k = 0; k < 4; k++) {
        g.fillStyle = k % 2 ? shade(a, -0.08) : shade(b, 0.05);
        if (horiz) g.fillRect(x * 32, y * 32 + k * 8, 32, 6); else g.fillRect(x * 32 + k * 8, y * 32, 6, 32);
      }
    }
  },
  mosaic: (g, a, b, r) => {
    g.fillStyle = shade(b, -0.35); g.fillRect(0, 0, N, N);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { g.fillStyle = mix(a, b, r() < 0.3 ? 0.8 : r() * 0.25); g.fillRect(x * 16 + 1, y * 16 + 1, 14, 14); }
  },
};

/** The texture for a wall or floor pattern in two colours (cached). */
export function patternTexture(kind: 'wall' | 'floor', id: string, a: string, b: string, renderer?: THREE.WebGLRenderer): THREE.CanvasTexture {
  const key = `${kind}|${id}|${a}|${b}`;
  let tex = cache.get(key);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  const draw = (kind === 'wall' ? WALLS[id] : FLOORS[id]) ?? (kind === 'wall' ? WALLS.plaster : FLOORS.planks);
  draw(g, a, b, rng(id.length * 7919 + 17));
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = Math.min(4, renderer?.capabilities.getMaxAnisotropy() ?? 1);
  cache.set(key, tex);
  return tex;
}

/** A small preview of a pattern for the paint screen (a data URL). */
export function patternPreview(kind: 'wall' | 'floor', id: string, a: string, b: string): string {
  const tex = patternTexture(kind, id, a, b);
  return (tex.image as HTMLCanvasElement).toDataURL('image/png');
}

/** Free textures nobody uses any more (keeps memory flat while trying many looks). */
export function prunePatterns(keep: Set<string>): void {
  for (const [key, tex] of cache) if (!keep.has(key)) { tex.dispose(); cache.delete(key); }
}
export const patternKey = (kind: 'wall' | 'floor', id: string, a: string, b: string): string => `${kind}|${id}|${a}|${b}`;
