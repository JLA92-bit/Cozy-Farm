import type { FarmScene } from './FarmScene';
import { gpuName, isPowerVR } from '../core/Renderer';
import { settings, saveSettings } from '../systems/Settings';
import { saves } from '../systems/Save';
import { online } from '../online/Online';
import { logEvent } from '../online/Events';

/**
 * Safety net for phones whose GPU draws a blank (white) 3D view, e.g. Pixel 10 (PowerVR) with shadow maps.
 * Right after render() it reads a few pixels; if the whole frame is blank it turns shadows off, then drops to Low,
 * and saves the choice. It also reports the GPU and any fallback (admin dashboard) and handles WebGL context loss.
 */
export class GpuGuard {
  private frames = 0;
  private stage: 'early' | 'late' | 'done' = 'early';
  private lost = 0;

  constructor(private scene: FarmScene) {
    const canvas = scene.canvas;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault(); // lets the browser restore the context
      this.lost++;
      this.report('gpu_context_lost', { n: this.lost });
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.report('gpu_context_back', { n: this.lost });
      // after repeated losses, play it safe: no shadows (then Low) so it stops happening
      if (this.lost >= 2) this.fallback();
      this.scene.refreshShadows();
      this.frames = 0; this.stage = 'early';
    });
    const r = scene.renderer;
    this.report('gpu_info', { gpu: gpuName() || 'hidden', pvr: isPowerVR(), q: r.quality, shadows: r.shadowsOn });
  }

  /** Called by FarmScene straight after renderer.render(), while the frame can still be read. */
  afterRender(): void {
    if (this.stage === 'done' || document.hidden) return;
    this.frames++;
    if (this.stage === 'early' && this.frames === 10) {
      if (this.isBlank()) { this.frames = 0; if (!this.fallback()) this.stage = 'done'; } // check again after a change
      else { this.stage = 'late'; this.frames = 0; }
    } else if (this.stage === 'late' && this.frames === 60) {
      // one more look a second or two in, in case the blank only shows up later
      this.stage = 'done';
      if (this.isBlank() && this.fallback()) { this.stage = 'early'; this.frames = 0; }
    }
  }

  /** True when a spread of pixels across the frame are all plain white or fully transparent. */
  private isBlank(): boolean {
    try {
      const gl = this.scene.renderer.renderer.getContext();
      if (gl.isContextLost()) return false;
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      if (w < 2 || h < 2) return false;
      const px = new Uint8Array(4);
      for (const fy of [0.2, 0.5, 0.8]) {
        for (const fx of [0.2, 0.5, 0.8]) {
          gl.readPixels(Math.floor(w * fx), Math.floor(h * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          const white = px[0] >= 250 && px[1] >= 250 && px[2] >= 250;
          if (!white && px[3] !== 0) return false;
        }
      }
      return true;
    } catch { return false; }
  }

  /** One step down: shadows off, then Low. The choice is saved so the next start is already safe. */
  private fallback(): boolean {
    const r = this.scene.renderer;
    if (r.shadowsOn || settings.shadows) {
      settings.shadows = false;
      saveSettings(settings);
      r.setShadowsPref(false);
      this.scene.refreshShadows();
      this.report('gpu_fallback', { step: 'shadows_off', gpu: gpuName() || 'hidden' });
      return true;
    } else if (r.quality !== 'low') {
      settings.quality = 'low';
      saveSettings(settings);
      const reload = r.setQuality('low');
      this.scene.refreshShadows();
      this.scene.loop.maxFps = r.profile.maxFps >= 60 ? 0 : r.profile.maxFps;
      this.report('gpu_fallback', { step: 'low', gpu: gpuName() || 'hidden' });
      if (reload) { saves.save(); location.reload(); }
      return true;
    } else {
      this.report('gpu_blank_low', { gpu: gpuName() || 'hidden' });
      return false;
    }
  }

  /** logEvent only works once the online backend is connected, so wait for it (up to about 3 minutes). */
  private report(kind: string, detail: Record<string, unknown>, tries = 0): void {
    if (online.kind === 'supabase') { logEvent(kind, detail); return; }
    if (tries < 18) window.setTimeout(() => this.report(kind, detail, tries + 1), 10000);
  }
}
