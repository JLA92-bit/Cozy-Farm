import * as THREE from 'three';
import { geo, PAL } from '../Procedural';
import { assets } from '../../core/Assets';
import type { PlacedBuilding } from '../../systems/State';

/**
 * 1.8 keepsakes: decorations that are given, never sold (buildings.json group "keepsakes").
 * The Founding Farmer sign thanks everyone who farmed here before Village Friends: an arched board on two posts
 * with a gold rosette on top. Its lettering ("Founding Farmer" and the farmer's name) is drawn per instance by
 * `foundingSignFx`, the same way the Farm Sign gets its text.
 */
type V3 = [number, number, number];

const GOLD = '#ffc93c', GOLD_DARK = '#d99a16', RIBBON = '#e2533c', BOARD = '#f0c88c', BOARD_EDGE = '#8a5528';

/** Flat-coloured Kenney flowers at the foot of the posts (same trick as the other decor). */
function kit(b: ReturnType<typeof geo>, id: string, pos: V3, scale = 1, rotY = 0): void {
  const m = assets.getStatic(id);
  if (!m || m.material !== assets.vertexMaterial) return;
  const g = m.geometry.clone();
  g.deleteAttribute('uv');
  b.geometry(g, null, pos, [0, rotY, 0], [scale, scale, scale]);
}

export const KEEPSAKE_PROC: Record<string, () => THREE.BufferGeometry> = {
  founding_sign: () => {
    const b = geo();
    // posts with little caps
    for (const x of [-0.42, 0.42]) {
      b.block(0.09, 0.9, 0.09, PAL.woodDark, [x, 0, -0.01]);
      b.cyl(0.075, 0.095, 0.05, PAL.woodDark, [x, 0, -0.01], 6);
      b.sphere(0.06, GOLD, [x, 0.93, -0.01], 0);
    }
    // the board, a dark frame, and a rounded top made of a half disc
    b.block(0.92, 0.44, 0.07, BOARD, [0, 0.34, 0.035]);
    b.box(1.0, 0.06, 0.09, BOARD_EDGE, [0, 0.34, 0.035]);
    b.box(0.06, 0.46, 0.09, BOARD_EDGE, [-0.48, 0.56, 0.035]);
    b.box(0.06, 0.46, 0.09, BOARD_EDGE, [0.48, 0.56, 0.035]);
    b.geometry(new THREE.CylinderGeometry(0.5, 0.5, 0.09, 18, 1, false, -Math.PI / 2, Math.PI), BOARD_EDGE, [0, 0.78, 0.035], [-Math.PI / 2, 0, 0], [1, 1, 0.36]);
    b.geometry(new THREE.CylinderGeometry(0.46, 0.46, 0.07, 18, 1, false, -Math.PI / 2, Math.PI), BOARD, [0, 0.78, 0.035], [-Math.PI / 2, 0, 0], [1, 1, 0.33]);
    // gold rosette with two ribbon tails, at the top of the arch
    b.geometry(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 14), GOLD_DARK, [0, 0.98, 0.09], [Math.PI / 2, 0, 0]);
    b.geometry(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 14), GOLD, [0, 0.98, 0.1], [Math.PI / 2, 0, 0]);
    b.box(0.06, 0.15, 0.03, RIBBON, [-0.09, 0.88, 0.075], [0, 0, 0.4]);
    b.box(0.06, 0.15, 0.03, RIBBON, [0.09, 0.88, 0.075], [0, 0, -0.4]);
    // a five-point star on the rosette
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.035 : 0.085, a = Math.PI / 2 + (i * Math.PI) / 5;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i) star.lineTo(x, y); else star.moveTo(x, y);
    }
    b.geometry(new THREE.ExtrudeGeometry(star, { depth: 0.03, bevelEnabled: false }), PAL.white, [0, 0.98, 0.125]);
    // flowers and grass at the foot
    kit(b, 'nat/flower_yellow_a', [-0.42, 0, 0.13], 1.4);
    kit(b, 'nat/flower_red_a', [0.42, 0, 0.13], 1.4, 1.1);
    kit(b, 'nat/grass_large', [0.2, 0, 0.12], 0.9);
    kit(b, 'nat/flower_purple_a', [-0.18, 0, 0.16], 1.1, 2.2);
    return b.build();
  },
};

// ------------------------------------------------------------------------------------------- lettering

/** Same shape as DecorFx's per-instance extras (kept local so this file has no import cycle). */
interface KeepsakeFx { update(dt: number, t: number, night: number): void; dispose(): void }

function drawFounding(canvas: HTMLCanvasElement, name: string): void {
  const g = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  g.clearRect(0, 0, W, H);
  const font = (px: number) => `${px}px 'Lilita One', 'Fredoka', system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const carve = (text: string, y: number, px: number, ink: string) => {
    g.font = font(px);
    while (px > 26 && g.measureText(text).width > W * 0.9) g.font = font(--px);
    g.fillStyle = 'rgba(255,240,205,0.95)';
    g.fillText(text, W / 2, y + 4);
    g.fillStyle = ink;
    g.fillText(text, W / 2, y);
  };
  const who = name.trim();
  if (who) {
    carve('Founding Farmer', H * 0.3, 74, '#8a4b12');
    carve(who, H * 0.72, 84, '#5b3217');
  } else {
    carve('Founding', H * 0.3, 90, '#8a4b12');
    carve('Farmer', H * 0.72, 90, '#8a4b12');
  }
}

export function foundingSignFx(inner: THREE.Object3D, _b: PlacedBuilding, farmer: string): KeepsakeFx {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 260;
  drawFounding(canvas, farmer);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (fonts && !fonts.check("64px 'Lilita One'")) {
    void fonts.load("64px 'Lilita One'").then(() => { drawFounding(canvas, farmer); tex.needsUpdate = true; }).catch(() => {});
  }
  const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const plane = new THREE.PlaneGeometry(0.88, 0.447);
  const front = new THREE.Mesh(plane, mat);
  front.position.set(0, 0.58, 0.072);
  const back = new THREE.Mesh(plane, mat);
  back.position.set(0, 0.58, -0.002);
  back.rotation.y = Math.PI;
  front.renderOrder = back.renderOrder = 2;
  inner.add(front, back);
  return {
    update: () => {},
    dispose() { inner.remove(front, back); plane.dispose(); mat.dispose(); tex.dispose(); },
  };
}
