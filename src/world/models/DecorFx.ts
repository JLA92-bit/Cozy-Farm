import * as THREE from 'three';
import { assets } from '../../core/Assets';
import type { BuildingDef } from '../../data';
import { paintHex, signText } from '../../systems/Decor';
import type { PlacedBuilding } from '../../systems/State';
import { geo } from '../Procedural';
import type { Visual } from '../Visuals';
import { MARK, PUMPKINS } from './Decor';
import { foundingSignFx } from './Keepsakes';

/**
 * Per-instance extras for "pretty farm" decor: paint colours (recoloured geometry, shared per colour) and the
 * small animated or lit bits that cannot live in a shared instanced pool: campfire flames and embers, fairy
 * light bulbs, bees, pinwheel blades, pumpkin faces and the farm sign's own text.
 */

// ------------------------------------------------------------------------------------------- paint

const hslA = { h: 0, s: 0, l: 0 };
const hslB = { h: 0, s: 0, l: 0 };
const SRGB = THREE.SRGBColorSpace;

/**
 * Copy of `src` with the paint colour swapped for `hex`. Vertices of the marker's hue take the new colour,
 * keeping how much lighter or darker they were than the marker (trims, shading). A marker written as
 * '=#rrggbb' only repaints that exact colour (models where other parts share its hue, like soil under a
 * wooden frame).
 */
export function paintGeometry(src: THREE.BufferGeometry, marker: string, hex: string): THREE.BufferGeometry {
  const g = src.clone();
  const col = g.attributes.color as THREE.BufferAttribute | undefined;
  if (!col) return g;
  const out = new THREE.Color(hex);
  const c = new THREE.Color();
  const exact = marker.startsWith('=');
  const mc = new THREE.Color(exact ? marker.slice(1) : marker);
  const m = mc.getHSL(hslA, SRGB);
  const mh = m.h, ms = m.s, ml = m.l;
  out.getHSL(hslB, SRGB);
  const th = hslB.h, ts = hslB.s, tl = hslB.l;
  for (let i = 0; i < col.count; i++) {
    c.fromBufferAttribute(col, i);
    if (exact && Math.abs(c.r - mc.r) + Math.abs(c.g - mc.g) + Math.abs(c.b - mc.b) > 0.01) continue;
    c.getHSL(hslA, SRGB);
    const dh = Math.min(Math.abs(hslA.h - mh), 1 - Math.abs(hslA.h - mh));
    if (dh > 0.035 || hslA.s < 0.2 || Math.abs(hslA.s - ms) > 0.35) continue;
    const l = THREE.MathUtils.clamp(tl + (hslA.l - ml) * (tl > 0.8 ? 0.6 : 1), 0.08, 0.95);
    c.setHSL(th, THREE.MathUtils.clamp(ts * (hslA.s / ms), 0, 1), l, SRGB);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
  return g;
}

const painted = new Map<string, Visual>();
/** The visual to draw for a placed building: its painted copy when it has a paint colour. Shared per colour. */
export function styledVisual(visual: Visual, def: BuildingDef, b: PlacedBuilding): Visual {
  const hex = def.paint ? paintHex(b.tint) : undefined;
  if (!hex) return visual;
  const key = `${visual.key}|${b.tint}`;
  let v = painted.get(key);
  if (!v) {
    v = {
      ...visual, key, geometry: paintGeometry(visual.geometry, def.paint!, hex),
      parts: visual.parts?.map((p) => ({ ...p, geometry: paintGeometry(p.geometry, def.paint!, hex) })),
    };
    painted.set(key, v);
  }
  return v;
}

// ------------------------------------------------------------------------------------------- fx

export interface DecorFx {
  update(dt: number, t: number, night: number): void;
  dispose(): void;
  /** height (model units) the glow sprite should sit at, when the piece glows */
  glowY?: number;
}

interface FxCtx { b: PlacedBuilding; def: BuildingDef; farmer: string }
type FxBuilder = (inner: THREE.Object3D, ctx: FxCtx) => DecorFx;

const FX: Record<string, FxBuilder> = {
  campfire: campfireFx,
  farm_sign: signFx,
  fairy_lights: fairyLightsFx,
  beehive: beeFx,
  pinwheel: pinwheelFx,
  pumpkin_lanterns: pumpkinFx,
  founding_sign: (inner, ctx) => foundingSignFx(inner, ctx.b, ctx.farmer),
};

/** Pieces with per-instance extras are drawn standalone (not pooled). */
export const hasFx = (def: BuildingDef): boolean => !!FX[def.id] && def.model.startsWith('proc:');

/** Add a piece's extras under `inner` (the model-space group of its standalone object). */
export function attachFx(inner: THREE.Object3D, b: PlacedBuilding, def: BuildingDef, farmer: string): DecorFx | null {
  return hasFx(def) ? FX[def.id](inner, { b, def, farmer }) : null;
}

const noop = (): void => {};

// ---- campfire

let flameGeo: THREE.BufferGeometry | null = null;
let coreGeo: THREE.BufferGeometry | null = null;
/** Soft rounded teardrop (lathe), coloured from base to tip. */
function teardrop(bottom: string, top: string): THREE.BufferGeometry {
  // a plump rounded drop with a soft (not sharp) tip
  const pts = [[0, 0], [0.075, 0.012], [0.115, 0.05], [0.128, 0.105], [0.12, 0.16], [0.098, 0.22], [0.068, 0.28], [0.038, 0.33], [0.016, 0.365], [0, 0.375]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 14).toNonIndexed();
  const pos = g.attributes.position as THREE.BufferAttribute;
  const arr = new Float32Array(pos.count * 3);
  const a = new THREE.Color(bottom), c = new THREE.Color(top), o = new THREE.Color();
  for (let i = 0; i < pos.count; i++) o.lerpColors(a, c, Math.min(1, pos.getY(i) / 0.34)).toArray(arr, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}
const flameMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false });
// the bright heart is drawn after the soft outer flame so it glows through it
const coreMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
const coalMat = new THREE.MeshBasicMaterial({ vertexColors: true });
let coalGeo: THREE.BufferGeometry | null = null;
let emberTex: THREE.Texture | null = null;
function softDot(): THREE.Texture {
  if (emberTex) return emberTex;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,230,1)');
  grd.addColorStop(0.35, 'rgba(255,200,110,0.9)');
  grd.addColorStop(1, 'rgba(255,150,60,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  emberTex = new THREE.CanvasTexture(c);
  emberTex.colorSpace = SRGB;
  return emberTex;
}

function campfireFx(inner: THREE.Object3D): DecorFx {
  flameGeo ??= teardrop('#f0461c', '#ff9a2e');
  coreGeo ??= teardrop('#ffb02e', '#ffe98a');
  coalGeo ??= (() => {
    const b = geo();
    const cols = ['#ff6a22', '#ff9a3a', '#e8481c', '#ffb347'];
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, r = 0.04 + (i % 3) * 0.04;
      b.sphere(0.035 + (i % 2) * 0.01, cols[i % 4], [Math.cos(a) * r, 0.04, Math.sin(a) * r], 0, [1.3, 0.6, 1.1]);
    }
    return b.build();
  })();
  const root = new THREE.Group();
  root.add(new THREE.Mesh(coalGeo, coalMat));
  const tongues: { g: THREE.Group; s: number; ph: number; lean: number; dir: number }[] = [];
  const spots: [number, number, number, number][] = [[0, 0.03, 0, 1.5], [0.075, 0.03, 0.045, 0.78], [-0.08, 0.03, 0.035, 0.72], [0.01, 0.03, -0.085, 0.75]];
  spots.forEach(([x, y, z, s], i) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const outer = new THREE.Mesh(flameGeo!, flameMat);
    outer.renderOrder = 3;
    g.add(outer);
    // only the big middle tongue gets a bright golden heart, so the fire reads as one soft shape
    if (i === 0) {
      const core = new THREE.Mesh(coreGeo!, coreMat);
      core.scale.set(0.62, 0.66, 0.62);
      core.position.y = 0.005;
      core.renderOrder = 4;
      g.add(core);
    }
    root.add(g);
    tongues.push({ g, s, ph: i * 1.9, lean: i ? 0.16 : 0, dir: Math.atan2(z, x) });
  });
  // a few embers drifting up
  const embers: { sp: THREE.Sprite; ph: number; per: number; ox: number; oz: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: '#ffa04a', transparent: true, depthWrite: false }));
    sp.renderOrder = 4;
    root.add(sp);
    embers.push({ sp, ph: i / 6, per: 1.7 + (i % 3) * 0.45, ox: Math.cos(i * 2.1) * 0.08, oz: Math.sin(i * 2.1) * 0.08 });
  }
  inner.add(root);
  return {
    glowY: 0.3,
    update(_dt, t) {
      for (const f of tongues) {
        const k = t + f.ph;
        const stretch = 1 + 0.13 * Math.sin(k * 7.1) + 0.06 * Math.sin(k * 12.7 + 1.3);
        const squeeze = 1 - 0.05 * Math.sin(k * 7.1 + 0.6);
        f.g.scale.set(f.s * squeeze, f.s * stretch, f.s * squeeze);
        // a gentle sway, small tongues leaning out from the middle
        f.g.rotation.z = 0.07 * Math.sin(k * 2.9) - Math.cos(f.dir) * f.lean;
        f.g.rotation.x = 0.06 * Math.sin(k * 2.3 + 0.8) + Math.sin(f.dir) * f.lean;
      }
      for (const e of embers) {
        const k = ((t / e.per + e.ph) % 1 + 1) % 1;
        e.sp.position.set(e.ox + Math.sin(t * 2 + e.ph * 9) * 0.05 * k, 0.35 + k * 0.8, e.oz + Math.cos(t * 1.7 + e.ph * 7) * 0.04 * k);
        e.sp.scale.setScalar(0.06 * (1 - k * 0.6));
        e.sp.material.opacity = Math.sin(k * Math.PI) * 0.95;
      }
    },
    dispose() {
      inner.remove(root);
      for (const e of embers) e.sp.material.dispose();
    },
  };
}

// ---- farm sign

function drawSign(canvas: HTMLCanvasElement, text: string): void {
  const g = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  g.clearRect(0, 0, W, H);
  const font = (px: number) => `${px}px 'Lilita One', 'Fredoka', system-ui, sans-serif`;
  // one line when it fits nicely, otherwise split at the space nearest the middle
  let lines = [text];
  let px = 112;
  g.font = font(px);
  while (px > 40 && g.measureText(text).width > W * 0.9) g.font = font(--px);
  if (px < 78 && text.includes(' ')) {
    const mid = text.length / 2;
    let cut = -1;
    for (let i = 0; i < text.length; i++) if (text[i] === ' ' && (cut < 0 || Math.abs(i - mid) < Math.abs(cut - mid))) cut = i;
    lines = [text.slice(0, cut), text.slice(cut + 1)];
    px = 92;
    g.font = font(px);
    while (px > 30 && (Math.max(...lines.map((l) => g.measureText(l).width)) > W * 0.9 || px * 2.05 > H * 0.92)) g.font = font(--px);
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lh = px * 1.02;
  lines.forEach((l, i) => {
    const y = H / 2 + (i - (lines.length - 1) / 2) * lh + px * 0.04;
    // carved look: a pale lower edge under dark lettering
    g.fillStyle = 'rgba(255,236,196,0.9)';
    g.fillText(l, W / 2, y + 4);
    g.fillStyle = '#5b3217';
    g.fillText(l, W / 2, y);
  });
}

function signFx(inner: THREE.Object3D, ctx: FxCtx): DecorFx {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 220;
  const text = signText(ctx.b, ctx.farmer);
  drawSign(canvas, text);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = SRGB;
  tex.anisotropy = 4;
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (fonts && !fonts.check("64px 'Lilita One'")) {
    void fonts.load("64px 'Lilita One'").then(() => { drawSign(canvas, text); tex.needsUpdate = true; }).catch(noop);
  }
  const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const plane = new THREE.PlaneGeometry(0.9, 0.387);
  const front = new THREE.Mesh(plane, mat);
  front.position.set(0, 0.56, 0.067);
  const back = new THREE.Mesh(plane, mat);
  back.position.set(0, 0.56, 0.003);
  back.rotation.y = Math.PI;
  front.renderOrder = back.renderOrder = 2;
  inner.add(front, back);
  return {
    update: noop,
    dispose() { inner.remove(front, back); plane.dispose(); mat.dispose(); tex.dispose(); },
  };
}

// ---- fairy lights

let bulbGeo: THREE.BufferGeometry | null = null;
const BULBS = ['#fff1b8', '#ffb3c9', '#ffcf7a', '#bff2d4'];
function fairyLightsFx(inner: THREE.Object3D, ctx: FxCtx): DecorFx {
  bulbGeo ??= new THREE.SphereGeometry(0.032, 8, 6).scale(1, 1.25, 1);
  const mats = BULBS.map((c) => new THREE.MeshBasicMaterial({ color: c }));
  const base = BULBS.map((c) => new THREE.Color(c));
  const root = new THREE.Group();
  const half = 0.44, top = 0.9, sag = 0.18, n = 9;
  for (let i = 0; i < n; i++) {
    const x = -half + ((i + 0.5) / n) * half * 2;
    const y = top - sag * (1 - (x / half) ** 2) - 0.045;
    const m = new THREE.Mesh(bulbGeo, mats[i % mats.length]);
    m.position.set(x, y, 0);
    root.add(m);
  }
  inner.add(root);
  const ph = ctx.b.uid * 1.7;
  return {
    glowY: 0.75,
    update(_dt, t, night) {
      mats.forEach((m, i) => {
        const tw = 0.5 + 0.5 * Math.sin(t * (1.3 + i * 0.37) + ph + i * 2.1);
        const k = 0.62 + night * (0.2 + 0.18 * tw);
        m.color.copy(base[i]).multiplyScalar(k);
      });
    },
    dispose() { inner.remove(root); for (const m of mats) m.dispose(); },
  };
}

// ---- bees

let beeGeo: THREE.BufferGeometry | null = null;
function beeFx(inner: THREE.Object3D, ctx: FxCtx): DecorFx {
  beeGeo ??= geo()
    .sphere(0.035, '#ffcf3f', [0, 0, 0], 1, [1.35, 1, 1])
    .box(0.018, 0.064, 0.066, '#2b2622', [-0.012, 0, 0])
    .box(0.014, 0.06, 0.062, '#2b2622', [0.02, 0, 0])
    .sphere(0.022, '#fbfbff', [0, 0.035, 0.02], 0, [1.2, 0.5, 1])
    .sphere(0.022, '#fbfbff', [0, 0.035, -0.02], 0, [1.2, 0.5, 1])
    .build();
  const bees: { m: THREE.Mesh; ph: number; sp: number; r: number }[] = [];
  const root = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(beeGeo, assets.vertexMaterial);
    root.add(m);
    bees.push({ m, ph: i * 2.1 + ctx.b.uid, sp: (i % 2 ? -1 : 1) * (1.1 + i * 0.25), r: 0.3 + i * 0.05 });
  }
  inner.add(root);
  return {
    update(_dt, t, night) {
      root.visible = night < 0.5;
      if (!root.visible) return;
      for (const b of bees) {
        const a = t * b.sp + b.ph;
        const r = b.r + 0.07 * Math.sin(t * 2.3 + b.ph);
        b.m.position.set(Math.cos(a) * r, 0.5 + 0.12 * Math.sin(t * 1.7 + b.ph) + 0.015 * Math.sin(t * 25 + b.ph), Math.sin(a) * r);
        b.m.rotation.y = -a - (b.sp > 0 ? Math.PI / 2 : -Math.PI / 2);
      }
    },
    dispose() { inner.remove(root); },
  };
}

// ---- pinwheel

const bladeCache = new Map<string, THREE.BufferGeometry>();
function bladeGeometry(hex: string | undefined): THREE.BufferGeometry {
  const key = hex ?? '';
  let g = bladeCache.get(key);
  if (!g) {
    const b = geo();
    const s = new THREE.Shape();
    // a classic folded paper sail: wide at the tip, curling back to the hub
    s.moveTo(0, 0); s.lineTo(0.2, -0.02); s.quadraticCurveTo(0.23, 0.1, 0.19, 0.19); s.quadraticCurveTo(0.1, 0.1, 0, 0);
    for (let k = 0; k < 4; k++) {
      const blade = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false, curveSegments: 4 });
      blade.rotateX(0.22);
      b.geometry(blade, k % 2 ? '#fff6e8' : MARK.pinwheel, [0, 0, 0], [0, 0, (k * Math.PI) / 2]);
    }
    b.sphere(0.03, '#f6c84a', [0, 0, 0.02], 1);
    g = b.build();
    if (hex) g = paintGeometry(g, MARK.pinwheel, hex);
    bladeCache.set(key, g);
  }
  return g;
}
function pinwheelFx(inner: THREE.Object3D, ctx: FxCtx): DecorFx {
  const m = new THREE.Mesh(bladeGeometry(paintHex(ctx.b.tint)), assets.vertexMaterial);
  m.position.set(0, 0.86, 0.035);
  m.castShadow = true;
  inner.add(m);
  const ph = ctx.b.uid * 0.9;
  return {
    update(dt, t) { m.rotation.z -= dt * (2.6 + 1.6 * Math.sin(t * 0.35 + ph) + 0.6 * Math.sin(t * 1.3 + ph)); },
    dispose() { inner.remove(m); },
  };
}

// ---- pumpkin lanterns

let faceGeo: THREE.BufferGeometry | null = null;
function pumpkinFx(inner: THREE.Object3D, ctx: FxCtx): DecorFx {
  faceGeo ??= (() => {
    const parts: THREE.BufferGeometry[] = [];
    const tri = (pts: [number, number][]) => {
      const s = new THREE.Shape();
      s.moveTo(...pts[0]);
      for (const p of pts.slice(1)) s.lineTo(...p);
      s.closePath();
      return new THREE.ShapeGeometry(s);
    };
    for (const [x, y, z, s] of PUMPKINS) {
      const f = [
        tri([[-0.075, 0.03], [-0.02, 0.03], [-0.047, 0.075]]),
        tri([[0.02, 0.03], [0.075, 0.03], [0.047, 0.075]]),
        tri([[-0.09, -0.01], [0.09, -0.01], [0.06, -0.05], [0.03, -0.03], [0, -0.055], [-0.03, -0.03], [-0.06, -0.05]]),
      ];
      for (const g of f) {
        // carved on the side that faces the camera
        g.scale(s * 1.2, s * 1.1, s);
        // on the upper front of the pumpkin, tipped up towards the camera like the surface there
        g.rotateX(-0.5);
        g.translate(0, 0.185 * s, 0.152 * s);
        g.rotateY(Math.PI / 4);
        g.translate(x, y, z);
        parts.push(g);
      }
    }
    const g = new THREE.BufferGeometry();
    const all = parts.map((p) => (p.index ? p.toNonIndexed() : p));
    const n = all.reduce((k, p) => k + p.attributes.position.count, 0);
    const arr = new Float32Array(n * 3);
    let o = 0;
    for (const p of all) { arr.set(p.attributes.position.array as Float32Array, o); o += p.attributes.position.count * 3; }
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return g;
  })();
  const mat = new THREE.MeshBasicMaterial({ color: '#5a2a10' });
  const m = new THREE.Mesh(faceGeo, mat);
  inner.add(m);
  const dark = new THREE.Color('#6a3212'), lit = new THREE.Color('#ffd25e');
  const ph = ctx.b.uid * 1.3;
  return {
    glowY: 0.3,
    update(_dt, t, night) {
      const flick = 0.88 + 0.12 * Math.sin(t * 11 + ph) * Math.sin(t * 6.1 + ph);
      mat.color.lerpColors(dark, lit, Math.min(1, 0.25 + night * 0.9) * flick);
    },
    dispose() { inner.remove(m); mat.dispose(); },
  };
}

/** What a placed piece's look depends on beyond its type: paint and sign text. A change rebuilds its visual. */
export const fxKey = (visual: Visual, b: PlacedBuilding): string => (b.text ? `${visual.key}|${b.text}` : visual.key);
