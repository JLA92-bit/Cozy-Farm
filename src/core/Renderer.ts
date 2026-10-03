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

/** Owns the WebGLRenderer. Re-created when antialias changes (it cannot be toggled at runtime). */
export class Renderer {
  renderer: THREE.WebGLRenderer;
  profile: QualityProfile;
  private width = 1;
  private height = 1;

  constructor(private canvas: HTMLCanvasElement, public quality: Quality) {
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
    r.shadowMap.enabled = this.profile.shadows;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.setPixelRatio(Math.min(this.profile.pixelRatio, window.devicePixelRatio || 1));
    return r;
  }

  setQuality(q: Quality): boolean {
    const prev = this.profile;
    this.quality = q;
    this.profile = QUALITY[q];
    if (prev.antialias !== this.profile.antialias) {
      // antialias needs a new context; the caller reloads the page in this case
      return true;
    }
    this.renderer.shadowMap.enabled = this.profile.shadows;
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
