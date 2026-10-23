import * as THREE from 'three';
import { ITEMS, WILDLIFE } from '../../data';
import { assetUrl, iconPath } from '../../core/Assets';

/**
 * 1.29 what a picture frame or plaque shows: a Wildlife Album photo (wild:<species>), a fish or any other find
 * (item:<id>), or, when nothing is picked, a little painted landscape. Drawn on a canvas once and cached.
 */

const cache = new Map<string, THREE.CanvasTexture>();
const S = 256;

/** The icon key behind a picture choice, or null for the painting. */
export function pictureIcon(show: string | undefined): string | null {
  if (!show) return null;
  if (show.startsWith('wild:')) return WILDLIFE.species.some((s) => s.id === show.slice(5)) ? `wild_${show.slice(5)}` : null;
  if (show.startsWith('item:')) return ITEMS[show.slice(5)]?.icon ?? null;
  return null;
}

export function pictureName(show: string | undefined): string {
  if (!show) return 'A painting';
  if (show.startsWith('photo:')) return 'Your photo';
  if (show.startsWith('wild:')) return WILDLIFE.species.find((s) => s.id === show.slice(5))?.name ?? 'A photo';
  if (show.startsWith('item:')) return ITEMS[show.slice(5)]?.name ?? 'A find';
  return 'A painting';
}

function painting(g: CanvasRenderingContext2D): void {
  const sky = g.createLinearGradient(0, 0, 0, S * 0.6);
  sky.addColorStop(0, '#8fd3f4'); sky.addColorStop(1, '#fde2c4');
  g.fillStyle = sky; g.fillRect(0, 0, S, S);
  g.fillStyle = '#ffe066'; g.beginPath(); g.arc(S * 0.72, S * 0.3, S * 0.09, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#8cc46a'; g.beginPath(); g.moveTo(0, S * 0.7); g.quadraticCurveTo(S * 0.3, S * 0.45, S * 0.6, S * 0.66); g.quadraticCurveTo(S * 0.8, S * 0.55, S, S * 0.62); g.lineTo(S, S); g.lineTo(0, S); g.fill();
  g.fillStyle = '#5f9a43'; g.beginPath(); g.moveTo(0, S * 0.85); g.quadraticCurveTo(S * 0.5, S * 0.7, S, S * 0.82); g.lineTo(S, S); g.lineTo(0, S); g.fill();
  g.fillStyle = '#c0473b'; g.fillRect(S * 0.2, S * 0.62, S * 0.12, S * 0.1);
  g.fillStyle = '#7a3a2a'; g.beginPath(); g.moveTo(S * 0.18, S * 0.63); g.lineTo(S * 0.26, S * 0.55); g.lineTo(S * 0.34, S * 0.63); g.fill();
}

/**
 * 1.30.4 a photo from Photo mode (`d`, a JPEG data URL) filling a frame of width / height `aspect`: the middle of the
 * photo at the frame's shape, drawn over the whole square canvas (the frame stretches it back). A painting until loaded.
 */
function photoTexture(d: string, aspect: number): THREE.CanvasTexture {
  const key = `photo|${aspect.toFixed(3)}|${d.length}|${d.slice(-48)}`;
  let tex = cache.get(key);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  painting(g);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const img = new Image();
  img.onload = () => {
    const ia = img.width / img.height;
    let sw = img.width, sh = img.height;
    if (ia > aspect) sw = sh * aspect; else sh = sw / aspect;
    g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, S, S);
    tex!.needsUpdate = true;
    onPhotoLoaded?.();
  };
  img.src = d;
  cache.set(key, tex);
  return tex;
}
/** Called when a photo has been drawn (the room asks for a frame so it shows). */
let onPhotoLoaded: (() => void) | null = null;
export function whenPhotoLoaded(fn: () => void): void { onPhotoLoaded = fn; }

/** The texture for a picture choice (cached). Photos need their picture (`photo`) and the frame's shape. */
export function pictureTexture(show: string | undefined, photo?: string, aspect = 1): THREE.CanvasTexture {
  if (show?.startsWith('photo:') && photo) return photoTexture(photo, aspect);
  const key = show?.startsWith('photo:') ? '' : show ?? '';
  let tex = cache.get(key);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const ic = pictureIcon(show);
  if (!ic) painting(g);
  else {
    // a soft photo background, then the find or the animal in the middle
    const bg = g.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S * 0.7);
    bg.addColorStop(0, '#fffaf0'); bg.addColorStop(1, show!.startsWith('wild:') ? '#cfe8c0' : '#f3e3c3');
    g.fillStyle = bg; g.fillRect(0, 0, S, S);
  }
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (ic) {
    const img = new Image();
    img.onload = () => { g.drawImage(img, S * 0.14, S * 0.14, S * 0.72, S * 0.72); tex!.needsUpdate = true; };
    img.src = assetUrl(iconPath(ic));
  }
  cache.set(key, tex);
  return tex;
}
