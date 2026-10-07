import * as THREE from 'three';

export type Quality = 'low' | 'medium' | 'high';

export interface QualityProfile {
  pixelRatio: number;
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: number;
  maxFps: number;
  ambientLife: number; // 0..1 density of clouds/birds/butterflies
}

export const QUALITY: Record<Quality, QualityProfile> = {
  low: { pixelRatio: 1, antialias: false, shadows: false, shadowMapSize: 512, maxFps: 30, ambientLife: 0.35 },
  medium: { pixelRatio: 1.5, antialias: false, shadows: true, shadowMapSize: 1024, maxFps: 60, ambientLife: 0.7 },
  high: { pixelRatio: 2, antialias: true, shadows: true, shadowMapSize: 2048, maxFps: 60, ambientLife: 1 },
};

/** Guess a sensible default quality for this device. */
export function detectQuality(): Quality {
  const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  const small = Math.min(window.screen.width, window.screen.height) < 500;
  if (mem <= 2 || cores <= 2) return 'low';
  if (small || mem <= 4) return 'medium';
  return 'high';
}

let gpuCache: string | null = null;
/** The unmasked GPU name (e.g. "ANGLE (Imagination Technologies, PowerVR ...)"), or '' when the browser hides it. */
export function gpuName(): string {
  if (gpuCache !== null) return gpuCache;
  gpuCache = '';
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    if (gl && ext) gpuCache = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { /* GPU name is only a hint */ }
  return gpuCache;
}

/** PowerVR / Imagination GPUs (Pixel 10) show a blank screen with shadow maps, so shadows start off there. */
export function isPowerVR(): boolean { return /powervr|imagination/i.test(gpuName()); }

/** Shadows default: on, except on GPUs known to break with them. */
export function detectShadows(): boolean { return !isPowerVR(); }

/** Owns the WebGLRenderer. Re-created when antialias changes (it cannot be toggled at runtime). */
export class Renderer {
  renderer: THREE.WebGLRenderer;
  profile: QualityProfile;
  private width = 1;
  private height = 1;

  constructor(private canvas: HTMLCanvasElement, public quality: Quality, public shadowsPref = true) {
    this.profile = QUALITY[quality];
    this.renderer = this.create();
  }

  private create(): THREE.WebGLRenderer {
    const r = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.profile.antialias,
      powerPreference: 'high-performance',
      stencil: false,
      preserveDrawingBuffer: false,
    });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = this.shadowsOn;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.setPixelRatio(Math.min(this.profile.pixelRatio, window.devicePixelRatio || 1));
    return r;
  }

  /** Real shadows need a quality that has them and the Shadows switch on. */
  get shadowsOn(): boolean { return this.profile.shadows && this.shadowsPref; }

  setShadowsPref(on: boolean): void {
    this.shadowsPref = on;
    this.renderer.shadowMap.enabled = this.shadowsOn;
  }

  setQuality(q: Quality): boolean {
    const prev = this.profile;
    this.quality = q;
    this.profile = QUALITY[q];
    if (prev.antialias !== this.profile.antialias) {
      // antialias needs a new context; the caller reloads the page in this case
      return true;
    }
    this.renderer.shadowMap.enabled = this.shadowsOn;
    this.renderer.setPixelRatio(Math.min(this.profile.pixelRatio, window.devicePixelRatio || 1));
    this.resize(this.width, this.height);
    return false;
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
  }

  get info(): THREE.WebGLInfo { return this.renderer.info; }
}
