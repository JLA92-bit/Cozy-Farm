import * as THREE from 'three';
import gsap from 'gsap';
import { h, icon, button } from './dom';
import { ui } from './UI';
import { Panel } from './Panel';
import { game } from '../systems/Game';
import { audio, haptics } from '../systems/Audio';
import type { WorldHandler } from '../scenes/FarmScene';
import './photo.css';

/**
 * Photo mode: hides the HUD, frees the camera (pan, pinch, turn, tilt, wider zoom), previews the time of day and
 * a frame or filter, and snaps a high resolution picture that can be shared (Web Share API) or saved.
 * Everything it touches (camera, time of day, input handler, HUD) is restored on exit.
 */
type FrameId = 'none' | 'warm' | 'polaroid' | 'vintage';
const TIMES: [string, string, number | null][] = [['Now', 'timer', null], ['Morning', 'sunrise', 0.08], ['Midday', 'sun', 0.3], ['Golden', 'sparkles', 0.645], ['Night', 'moon', 0.76]];
const FRAMES: [FrameId, string][] = [['none', 'None'], ['warm', 'Warm'], ['polaroid', 'Polaroid'], ['vintage', 'Vintage']];
/** Live preview of the colour filters (the snapped photo applies the same grade per pixel). */
const CSS_FILTER: Record<FrameId, string> = {
  none: '', polaroid: 'saturate(1.08) contrast(1.03)',
  warm: 'sepia(0.22) saturate(1.25) brightness(1.04)',
  vintage: 'sepia(0.5) saturate(0.85) contrast(0.92) brightness(1.04)',
};

const NOOP_HANDLER: WorldHandler = { tap() {}, longPress() {}, dragStart: () => 'pan', toolDrag() {}, toolDragEnd() {}, pointerDown() {} };

interface Saved {
  target: THREE.Vector3; distance: number; min: number; max: number; azimuth: number; elevation: number;
  bounds: THREE.Box2; timeOffset: number; handler: WorldHandler | null;
}

let active: PhotoMode | null = null;

export function openPhotoMode(): void {
  if (active) return;
  active = new PhotoMode();
}

class PhotoMode {
  private saved: Saved;
  private el: HTMLElement;
  private frameEl: HTMLElement;
  private caption: HTMLElement;
  private frame: FrameId = 'none';
  private busy = false;
  private keyFn = (e: KeyboardEvent): void => { if (e.key === 'Escape') this.close(); };

  constructor() {
    Panel.closeAll();
    const s = ui.scene, rig = s.rig;
    this.saved = {
      target: rig.target.clone(), distance: rig.distance, min: rig.minDistance, max: rig.maxDistance,
      azimuth: rig.azimuth, elevation: rig.elevation, bounds: rig.bounds.clone(), timeOffset: s.env.timeOffset, handler: s.handler,
    };
    rig.stop();
    rig.minDistance = 4;
    rig.maxDistance = 85;
    rig.bounds.expandByScalar(8);
    s.handler = NOOP_HANDLER;
    ui.world.hidePopup();
    document.getElementById('app')?.classList.add('photo-on');
    audio.play('open');

    this.caption = h('div', { class: 'photo-caption' });
    this.frameEl = h('div', { class: 'photo-frame' }, h('div', { class: 'photo-window' }), this.caption);
    const close = button(icon('cross'), () => this.close(), 'red round photo-close', { 'aria-label': 'Close photo mode' });
    const chips = <T>(items: [T, string, string?][], pick: (v: T) => void, initial: T): HTMLElement => {
      const row = h('div', { class: 'photo-chips' });
      for (const [v, label, ic] of items) {
        const b = h('button', { class: `photo-chip ${v === initial ? 'active' : ''}`, type: 'button' }, ic ? icon(ic) : null, label);
        b.addEventListener('click', () => {
          row.querySelectorAll('.photo-chip').forEach((x) => x.classList.toggle('active', x === b));
          audio.play('select');
          pick(v);
        });
        row.append(b);
      }
      return row;
    };
    const slider = (label: string, min: number, max: number, value: number, onInput: (v: number) => void): HTMLElement => {
      const r = h('input', { type: 'range', min: String(min), max: String(max), step: '0.5', value: String(value), 'aria-label': label }) as HTMLInputElement;
      r.addEventListener('input', () => { onInput(Number(r.value)); ui.scene.loop.wake(0.5); });
      r.addEventListener('pointerdown', (e) => e.stopPropagation());
      return h('label', { class: 'photo-slider' }, h('span', null, label), r);
    };
    const deg = THREE.MathUtils.radToDeg;
    const snap = button([icon('camera'), h('span', null, 'Snap')], () => void this.snap(), 'yellow photo-snap', { 'aria-label': 'Take photo' });
    const sheet = h('div', { class: 'photo-sheet' },
      chips(TIMES.map(([l, ic, v]) => [v, l, ic] as [number | null, string, string]), (v) => this.setTime(v), null),
      chips(FRAMES.map(([v, l]) => [v, l] as [FrameId, string]), (v) => this.setFrame(v), 'none'),
      h('div', { class: 'photo-sliders' },
        slider('Turn', -180, 180, Math.round(deg(rig.azimuth - Math.PI / 4)), (v) => { rig.azimuth = Math.PI / 4 + THREE.MathUtils.degToRad(v); }),
        slider('Tilt', 18, 85, Math.round(deg(rig.elevation)), (v) => { rig.elevation = THREE.MathUtils.degToRad(v); })),
      snap);
    this.el = h('div', { class: 'photo-ui passthrough' },
      this.frameEl,
      h('div', { class: 'photo-top' }, h('div', { class: 'photo-title outlined' }, icon('camera'), 'Photo mode'), close),
      h('div', { class: 'photo-hint' }, 'Drag to move, pinch to zoom'),
      sheet);
    ui.root.append(this.el);
    gsap.from(sheet, { y: 260, duration: 0.45, ease: 'back.out(1.4)' });
    window.addEventListener('keydown', this.keyFn);
    this.updateCaption();
    s.loop.wake(1);
  }

  private setTime(phase: number | null): void {
    const env = ui.scene.env;
    if (phase === null) { env.timeOffset = this.saved.timeOffset; return; }
    const p = env.cycleMinutes * 60000, now = ui.scene.now();
    env.timeOffset = phase * p - (((now % p) + p) % p);
    ui.scene.loop.wake(1);
  }

  private setFrame(f: FrameId): void {
    this.frame = f;
    const canvas = ui.scene.renderer.renderer.domElement;
    canvas.style.filter = CSS_FILTER[f];
    this.frameEl.dataset.frame = f;
  }

  private updateCaption(): void {
    this.caption.replaceChildren(h('b', null, farmName()), h('span', null, dateText()));
  }

  /** Render one high resolution frame and compose the photo with the chosen frame and filter. */
  private async snap(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const s = ui.scene, r = s.renderer.renderer;
    const canvas = r.domElement;
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    const maxTex = Math.min(r.capabilities.maxTextureSize, 4096);
    const pr = THREE.MathUtils.clamp(2600 / Math.max(cw, ch), 1, 3);
    const ratio = Math.min(pr, maxTex / Math.max(cw, ch));
    const oldRatio = r.getPixelRatio();
    let shot: HTMLCanvasElement;
    try {
      r.setPixelRatio(ratio);
      r.setSize(cw, ch, false);
      r.render(s.scene, s.rig.camera);
      shot = h('canvas') as HTMLCanvasElement;
      shot.width = canvas.width;
      shot.height = canvas.height;
      shot.getContext('2d')!.drawImage(canvas, 0, 0);
    } finally {
      r.setPixelRatio(oldRatio);
      r.setSize(cw, ch, false);
      s.loop.wake(0.5);
    }
    this.flash();
    audio.play('snap');
    haptics.play('success');
    const crop = this.frame === 'polaroid' ? this.windowRect(canvas, shot.width / cw) : null;
    const out = compose(shot, this.frame, crop);
    const blob = await new Promise<Blob | null>((res) => out.toBlob(res, 'image/jpeg', 0.92));
    this.busy = false;
    if (!blob) { ui.feedback.toast('Could not take the photo', 'Please try again', 'cross'); return; }
    game.incStat('photos_taken');
    this.showResult(blob);
  }

  /** The polaroid window in canvas pixels. */
  private windowRect(canvas: HTMLCanvasElement, scale: number): DOMRect {
    const w = this.frameEl.querySelector('.photo-window')!.getBoundingClientRect();
    const c = canvas.getBoundingClientRect();
    return new DOMRect((w.left - c.left) * scale, (w.top - c.top) * scale, w.width * scale, w.height * scale);
  }

  private flash(): void {
    const f = h('div', { class: 'photo-flash' });
    this.el.append(f);
    gsap.to(f, { opacity: 0, duration: 0.5, ease: 'power2.out', onComplete: () => f.remove() });
  }

  private showResult(blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const file = new File([blob], `cozy-acres-${fileStamp()}.jpg`, { type: 'image/jpeg' });
    const canShare = typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [file] });
    const done = (): void => { gsap.to(card, { opacity: 0, scale: 0.9, duration: 0.2, onComplete: () => { card.remove(); URL.revokeObjectURL(url); } }); };
    const save = (): void => {
      const a = h('a', { href: url, download: file.name }) as HTMLAnchorElement;
      document.body.append(a);
      a.click();
      a.remove();
      ui.feedback.toast('Photo saved', 'Look for it in your downloads', 'camera');
    };
    const share = async (): Promise<void> => {
      try { await navigator.share({ files: [file], title: farmName(), text: `${farmName()} in Cozy Acres` }); }
      catch (e) { if ((e as Error).name !== 'AbortError') save(); }
    };
    const img = h('img', { class: 'photo-result-img', src: url, alt: 'Your photo' });
    const card = h('div', { class: 'photo-result' },
      h('div', { class: 'photo-result-box' },
        h('div', { class: 'photo-result-title outlined' }, 'Say cheese!'),
        img,
        h('div', { class: 'photo-result-row' },
          canShare ? button([icon('heart'), 'Share'], () => void share(), 'blue') : null,
          button([icon('package'), 'Save'], save, canShare ? 'grey' : 'blue'),
          button('Back', done, 'small grey'))));
    this.el.append(card);
    gsap.from(card.firstElementChild, { scale: 0.6, rotate: -6, duration: 0.45, ease: 'back.out(1.8)' });
  }

  close(): void {
    if (active !== this) return;
    active = null;
    const s = ui.scene, rig = s.rig, v = this.saved;
    window.removeEventListener('keydown', this.keyFn);
    rig.stop();
    rig.minDistance = v.min;
    rig.maxDistance = v.max;
    rig.bounds.copy(v.bounds);
    gsap.to(rig, { azimuth: v.azimuth, elevation: v.elevation, distance: v.distance, duration: 0.5, ease: 'power2.inOut', onUpdate: () => s.loop.wake(0.2) });
    gsap.to(rig.target, { x: v.target.x, y: v.target.y, z: v.target.z, duration: 0.5, ease: 'power2.inOut' });
    s.env.timeOffset = v.timeOffset;
    s.handler = v.handler;
    s.renderer.renderer.domElement.style.filter = '';
    document.getElementById('app')?.classList.remove('photo-on');
    audio.play('close');
    gsap.to(this.el, { opacity: 0, duration: 0.2, onComplete: () => this.el.remove() });
    s.loop.wake(1);
  }
}

function farmName(): string { return `${game.state.player.name}'s Farm`; }
function dateText(): string { return new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }); }
function fileStamp(): string {
  const d = new Date(), p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// ------------------------------------------------------------------ composing the photo
/** Per-pixel colour grade (the same look as the live CSS preview, done by hand so it works everywhere). */
function grade(c: HTMLCanvasElement, f: FrameId): void {
  if (f === 'none') return;
  const g = c.getContext('2d')!;
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const sepia = f === 'vintage' ? 0.5 : f === 'warm' ? 0.22 : 0;
  const sat = f === 'vintage' ? 0.85 : f === 'warm' ? 1.25 : 1.08;
  const con = f === 'vintage' ? 0.92 : f === 'polaroid' ? 1.03 : 1;
  const bri = f === 'vintage' || f === 'warm' ? 1.04 : 1;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], gg = d[i + 1], b = d[i + 2];
    if (sepia) {
      const sr = r * 0.393 + gg * 0.769 + b * 0.189, sg = r * 0.349 + gg * 0.686 + b * 0.168, sb = r * 0.272 + gg * 0.534 + b * 0.131;
      r += (sr - r) * sepia; gg += (sg - gg) * sepia; b += (sb - b) * sepia;
    }
    const l = r * 0.2126 + gg * 0.7152 + b * 0.0722;
    r = l + (r - l) * sat; gg = l + (gg - l) * sat; b = l + (b - l) * sat;
    r = ((r - 128) * con + 128) * bri; gg = ((gg - 128) * con + 128) * bri; b = ((b - 128) * con + 128) * bri;
    if (f === 'vintage') { r = r * 0.9 + 22; gg = gg * 0.9 + 16; b = b * 0.88 + 10; }
    d[i] = r; d[i + 1] = gg; d[i + 2] = b;
  }
  g.putImageData(img, 0, 0);
}

function vignette(g: CanvasRenderingContext2D, x: number, y: number, w: number, hgt: number, strength: number, color = '40,22,8'): void {
  const r = Math.hypot(w, hgt) / 2;
  const grad = g.createRadialGradient(x + w / 2, y + hgt / 2, r * 0.45, x + w / 2, y + hgt / 2, r);
  grad.addColorStop(0, `rgba(${color},0)`);
  grad.addColorStop(1, `rgba(${color},${strength})`);
  g.fillStyle = grad;
  g.fillRect(x, y, w, hgt);
}

function compose(src: HTMLCanvasElement, f: FrameId, crop: DOMRect | null): HTMLCanvasElement {
  if (f !== 'polaroid') {
    grade(src, f);
    const g = src.getContext('2d')!;
    if (f === 'warm') vignette(g, 0, 0, src.width, src.height, 0.25, '90,40,0');
    if (f === 'vintage') {
      vignette(g, 0, 0, src.width, src.height, 0.5);
      // soft film grain
      const n = Math.round(src.width * src.height / 900);
      for (let i = 0; i < n; i++) {
        g.fillStyle = Math.random() < 0.5 ? 'rgba(255,240,210,0.10)' : 'rgba(50,30,10,0.10)';
        g.fillRect(Math.random() * src.width, Math.random() * src.height, 2, 2);
      }
    }
    if (f !== 'none') stamp(g, src.width, src.height);
    return src;
  }
  // polaroid: the picture inside a white card with the farm name and the date written underneath
  const cr = crop ?? new DOMRect(0, 0, src.width, src.height);
  const pw = Math.round(cr.width), ph = Math.round(cr.height);
  const pic = h('canvas') as HTMLCanvasElement;
  pic.width = pw; pic.height = ph;
  pic.getContext('2d')!.drawImage(src, cr.x, cr.y, cr.width, cr.height, 0, 0, pw, ph);
  grade(pic, 'polaroid');
  const m = Math.round(pw * 0.06), bottom = Math.round(pw * 0.26);
  const out = h('canvas') as HTMLCanvasElement;
  out.width = pw + m * 2; out.height = ph + m + bottom;
  const g = out.getContext('2d')!;
  g.fillStyle = '#fbf8f1';
  g.fillRect(0, 0, out.width, out.height);
  g.drawImage(pic, m, m);
  vignette(g, m, m, pw, ph, 0.18);
  g.strokeStyle = 'rgba(0,0,0,0.12)';
  g.lineWidth = Math.max(1, pw * 0.002);
  g.strokeRect(m, m, pw, ph);
  g.fillStyle = '#3b2a1a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `${Math.round(pw * 0.072)}px 'Lilita One', 'Fredoka', sans-serif`;
  g.fillText(farmName(), out.width / 2, ph + m + bottom * 0.4, pw);
  g.fillStyle = '#8a6a48';
  g.font = `600 ${Math.round(pw * 0.042)}px 'Fredoka', sans-serif`;
  g.fillText(dateText(), out.width / 2, ph + m + bottom * 0.72, pw);
  return out;
}

/** A small "Cozy Acres" mark in the corner of framed photos. */
function stamp(g: CanvasRenderingContext2D, w: number, hgt: number): void {
  const size = Math.round(w * 0.04);
  g.font = `${size}px 'Lilita One', 'Fredoka', sans-serif`;
  g.textAlign = 'right';
  g.textBaseline = 'bottom';
  g.lineWidth = size * 0.18;
  g.strokeStyle = 'rgba(45,30,16,0.7)';
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.strokeText('Cozy Acres', w - size * 0.7, hgt - size * 0.6);
  g.fillText('Cozy Acres', w - size * 0.7, hgt - size * 0.6);
}
